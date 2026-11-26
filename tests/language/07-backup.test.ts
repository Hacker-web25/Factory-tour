/**
 * The nightly backup of the subtitles and translations.
 *
 * Two pieces are tested against each other: the language Worker's read-only
 * GET /backup route (the real Worker, a real SQLite database) and
 * scripts/backup/d1-dump.mjs (the real script). The strongest test is the last
 * kind: dump a database full of awkward text, replay the SQL file into an empty
 * database, and require every row to come back identical. That is the proof that
 * a backup can actually be restored.
 */
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { D1Shim, newLanguageDb } from "../helpers/d1Shim";
// @ts-expect-error plain JavaScript Worker, not type-checked
import worker, { BACKUP_TABLES } from "../../cloudflare/language-worker.js";
// @ts-expect-error plain JavaScript script, not type-checked
import { dumpD1, quote, rowStatements, CHUNK_CHARS, DumpError } from "../../scripts/backup/d1-dump.mjs";

const LANG_SECRET = "test-language-secret-at-least-24-chars";
const BACKUP_SECRET = "test-backup-secret-at-least-24-chars!!";
const BASE = "https://lang.example.workers.dev";

let db: D1Shim;
let env: any;

beforeEach(() => {
  db = newLanguageDb();
  env = { DB: db, LANG_API_SECRET: LANG_SECRET, BACKUP_SECRET, AI: { run: async () => ({}) } };
});

const bridge = (e: any = env) => (url: string, init?: RequestInit) => worker.fetch(new Request(url, init), e) as Promise<Response>;
const noWait = async () => {};

async function get(pathAndQuery: string, auth: string | null = BACKUP_SECRET, e: any = env, method = "GET") {
  const headers: Record<string, string> = {};
  if (auth) headers.authorization = `Bearer ${auth}`;
  const res = await worker.fetch(new Request(`${BASE}${pathAndQuery}`, { method, headers }), e);
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

function addTranslation(tour: string, lang: string, i: number, text = `hello ${i}`) {
  db.raw
    .prepare("INSERT INTO translations (tour_id, lang, src_hash, source_text, translated_text, engine, reviewed, updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(tour, lang, String(i).padStart(40, "0"), `source ${i}`, text, "test", i % 2, 1700000000000 + i);
}

const T1 = "tour-aaaa-0001";
const T2 = "tour-bbbb-0002";

/* ── who may read ───────────────────────────────────────────────────────── */

describe("GET /backup access", () => {
  it("answers only to the backup secret", async () => {
    assert.equal((await get("/backup", null)).status, 401);
    assert.equal((await get("/backup", "wrong-secret-wrong-secret-wrong")).status, 401);
    const ok = await get("/backup");
    assert.equal(ok.status, 200);
    assert.equal(ok.body.ok, true);
  });

  it("does not accept the website's own secret (they are deliberately different)", async () => {
    assert.equal((await get("/backup", LANG_SECRET)).status, 401);
  });

  it("the backup secret opens nothing but /backup", async () => {
    for (const p of ["/health", "/stats", `/config?tour=${T1}`]) {
      assert.equal((await get(p, BACKUP_SECRET)).status, 401, p);
    }
    const post = await worker.fetch(new Request(`${BASE}/purge`, { method: "POST", headers: { authorization: `Bearer ${BACKUP_SECRET}` }, body: "{}" }), env);
    assert.equal(post.status, 401);
  });

  it("never opens up when the secret is missing or short", async () => {
    for (const secret of [undefined, "", "short"]) {
      const r = await get("/backup", secret || "x", { ...env, BACKUP_SECRET: secret });
      assert.equal(r.status, 503);
      assert.equal(r.body.error, "not_configured");
    }
  });

  it("refuses to change anything: POST is not allowed", async () => {
    addTranslation(T1, "fr", 1);
    const r = await get("/backup", BACKUP_SECRET, env, "POST");
    assert.equal(r.status, 405);
    assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM translations").get()!.n, 1);
  });

  it("health says whether a backup secret is set, without showing it", async () => {
    const h = await get("/health", LANG_SECRET);
    assert.equal(h.body.backup, true);
    assert.ok(!JSON.stringify(h.body).includes(BACKUP_SECRET));
    const h2 = await get("/health", LANG_SECRET, { ...env, BACKUP_SECRET: undefined });
    assert.equal(h2.body.backup, false);
  });
});

/* ── what it returns ────────────────────────────────────────────────────── */

describe("GET /backup contents", () => {
  it("lists every table with its CREATE statement and row count", async () => {
    addTranslation(T1, "fr", 1);
    const r = await get("/backup");
    assert.deepEqual(Object.keys(r.body.tables).sort(), ["tour_language", "transcripts", "translations"]);
    assert.equal(r.body.tables.translations.count, 1);
    assert.equal(r.body.tables.tour_language.count, 0);
    assert.match(r.body.tables.translations.create_sql, /^CREATE TABLE translations/);
  });

  it("covers every table in language-schema.sql, so a new table cannot silently miss the backups", () => {
    const schema = readFileSync(path.join(process.cwd(), "cloudflare", "language-schema.sql"), "utf8");
    const declared = [...schema.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/gi)].map((m) => m[1]).sort();
    assert.deepEqual(Object.keys(BACKUP_TABLES).sort(), declared);
    for (const [name, def] of Object.entries<any>(BACKUP_TABLES)) {
      const pk = db.raw
        .prepare(`SELECT name, pk FROM pragma_table_info('${name}') WHERE pk > 0 ORDER BY pk`)
        .all()
        .map((r: any) => r.name);
      assert.deepEqual(def.key, pk, `${name}: key columns must equal the PRIMARY KEY, in order`);
    }
  });

  it("pages through a table in key order with no row skipped or repeated", async () => {
    for (let i = 0; i < 25; i++) addTranslation(i % 2 ? T1 : T2, i % 3 ? "fr" : "de", i);
    const seen: string[] = [];
    let after: string[] | null = null;
    let pages = 0;
    for (;;) {
      const q: string = `/backup?table=translations&limit=7${after ? `&after=${encodeURIComponent(JSON.stringify(after))}` : ""}`;
      const r = await get(q);
      assert.equal(r.status, 200);
      for (const row of r.body.rows) seen.push(`${row.tour_id}|${row.lang}|${row.src_hash}`);
      pages++;
      if (!r.body.next) break;
      after = r.body.next;
      assert.ok(pages < 20, "must terminate");
    }
    assert.equal(seen.length, 25);
    assert.equal(new Set(seen).size, 25);
    assert.deepEqual(seen, [...seen].sort());
    assert.equal(pages, 4); // 7 + 7 + 7 + 4
  });

  it("returns an exact multiple of the page size without a phantom extra page", async () => {
    for (let i = 0; i < 14; i++) addTranslation(T1, "fr", i);
    const first = await get("/backup?table=translations&limit=7");
    const second = await get(`/backup?table=translations&limit=7&after=${encodeURIComponent(JSON.stringify(first.body.next))}`);
    assert.equal(second.body.rows.length, 7);
    assert.equal(second.body.next, null);
  });

  it("splits a page that would be too large, even if that means one row at a time", async () => {
    const big = "x".repeat(1_700_000);
    for (const [i, key] of ["k1", "k2", "k3"].entries()) {
      db.raw
        .prepare("INSERT INTO transcripts (tour_id, audio_key, segments, updated_at) VALUES (?,?,?,?)")
        .run(T1, key.repeat(20), big, 1700000000000 + i);
    }
    const r = await get("/backup?table=transcripts");
    assert.equal(r.status, 200);
    assert.equal(r.body.rows.length, 1);
    assert.ok(r.body.next);
  });

  it("refuses an unknown table, a bad cursor and a bad limit", async () => {
    assert.equal((await get("/backup?table=sqlite_master")).body.error, "bad_table");
    assert.equal((await get("/backup?table=translations;DROP TABLE translations")).body.error, "bad_table");
    assert.equal((await get("/backup?table=translations&after=nope")).body.error, "bad_cursor");
    assert.equal((await get(`/backup?table=translations&after=${encodeURIComponent('["a"]')}`)).body.error, "bad_cursor");
    assert.equal((await get(`/backup?table=tour_language&after=${encodeURIComponent("[1]")}`)).body.error, "bad_cursor");
    assert.equal((await get("/backup?table=translations&limit=0")).body.error, "bad_limit");
    assert.equal((await get("/backup?table=translations&limit=abc")).body.error, "bad_limit");
  });

  it("a hostile cursor is only ever a bound value, never SQL", async () => {
    addTranslation(T1, "fr", 1);
    const evil = encodeURIComponent(JSON.stringify(["'; DROP TABLE translations; --", "fr", "x"]));
    const r = await get(`/backup?table=translations&after=${evil}`);
    assert.equal(r.status, 200);
    assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM translations").get()!.n, 1);
  });
});

/* ── the SQL writer ─────────────────────────────────────────────────────── */

describe("SQL writing", () => {
  it("quotes apostrophes and splices NUL characters", () => {
    assert.equal(quote("it's"), "'it''s'");
    assert.equal(quote("a\u0000b"), "'a'||char(0)||'b'");
  });

  it("writes numbers and NULL as they are and refuses anything it cannot write exactly", () => {
    const s = rowStatements("t", ["id"], { id: "k", n: 2.5, z: null });
    assert.equal(s[0], "INSERT OR REPLACE INTO t (id, n, z) VALUES ('k', 2.5, NULL);");
    assert.throws(() => rowStatements("t", ["id"], { id: "k", n: true }), DumpError);
    assert.throws(() => rowStatements("t", ["id"], { id: "k", n: Infinity }), DumpError);
    assert.throws(() => rowStatements("t", ["id"], { id: "k", "bad col": 1 }), DumpError);
    assert.throws(() => rowStatements("t;drop", ["id"], { id: "k" }), DumpError);
    assert.throws(() => rowStatements("t", ["id"], { other: "k" }), DumpError);
  });

  it("never cuts an emoji in half when it splits a long value", () => {
    const text = "a".repeat(CHUNK_CHARS - 1) + "😀" + "b".repeat(50);
    const stmts: string[] = rowStatements("t", ["id"], { id: "k", body: text });
    assert.equal(stmts.length, 2);
    for (const s of stmts) assert.ok(!/[\ud800-\udbff]'/.test(s) && !/'[\udc00-\udfff]/.test(s));
  });
});

/* ── dump → restore → identical ─────────────────────────────────────────── */

function snapshot(d: D1Shim) {
  const out: Record<string, unknown[]> = {};
  for (const t of ["tour_language", "translations", "transcripts"]) out[t] = d.raw.prepare(`SELECT * FROM ${t} ORDER BY 1, 2, 3`).all().map((r: any) => ({ ...r }));
  return out;
}

function seedAwkward() {
  db.raw
    .prepare("INSERT INTO tour_language (tour_id, default_language, available_languages, subtitle_settings, updated_at) VALUES (?,?,?,?,?)")
    .run(T1, "en", '["fr","de"]', '{"size":"m","on":true}', 1700000000000);
  db.raw.prepare("INSERT INTO tour_language (tour_id, updated_at) VALUES (?,?)").run(T2, 1700000000001);
  const nasty = [
    "Don't stop — it's \"fine\"",
    "line one\nline two\r\nline three",
    "emoji 😀 and 日本語 and العربية",
    "semi; colon -- not a comment /* nor this */",
    "back\\slash and %s and ? and $1",
    "has a NUL \u0000 inside",
    "'; DROP TABLE translations; --",
  ];
  nasty.forEach((t, i) => addTranslation(i % 2 ? T1 : T2, i % 3 ? "fr" : "ja", i, t));
  for (let i = 0; i < 40; i++) addTranslation(T1, "de", 100 + i);
  const segs = JSON.stringify(Array.from({ length: 4000 }, (_, i) => ({ start: i, end: i + 0.5, text: `line ${i} it's 😀 "quoted"\nnewline` })));
  db.raw
    .prepare("INSERT INTO transcripts (tour_id, audio_key, audio_ref, source_lang, duration_sec, segments, engine, reviewed, updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(T1, "a".repeat(40), "https://x/audio.mp3", "en", 12.75, segs, "whisper", 1, 1700000000002);
  db.raw
    .prepare("INSERT INTO transcripts (tour_id, audio_key, segments, updated_at) VALUES (?,?,?,?)")
    .run(T2, "b".repeat(40), "[]", 1700000000003); // duration_sec stays NULL
  assert.ok(segs.length > CHUNK_CHARS * 3, "the long transcript must be big enough to be split");
}

describe("dump and restore", () => {
  it("a restored database holds every row exactly as it was", async () => {
    seedAwkward();
    const before = snapshot(db);
    const result = await dumpD1({ baseUrl: BASE, secret: BACKUP_SECRET, fetchImpl: bridge(), sleep: noWait });

    assert.deepEqual(result.counts, { tour_language: 2, translations: 47, transcripts: 2 });
    for (const s of result.statements) assert.ok(Buffer.byteLength(s) < 90_000, `a statement is ${Buffer.byteLength(s)} bytes, Cloudflare's limit is 100 KB`);

    const fresh = new D1Shim(); // no schema at all: the file must create it
    fresh.exec(result.sql);
    assert.deepEqual(snapshot(fresh), before);
  });

  it("restoring twice over the same data changes nothing (safe to re-run)", async () => {
    seedAwkward();
    const before = snapshot(db);
    const { sql } = await dumpD1({ baseUrl: BASE, secret: BACKUP_SECRET, fetchImpl: bridge(), sleep: noWait });
    const fresh = new D1Shim();
    fresh.exec(sql);
    fresh.exec(sql);
    assert.deepEqual(snapshot(fresh), before);
  });

  it("restoring over a database that already has the tables works too", async () => {
    seedAwkward();
    const before = snapshot(db);
    const { sql } = await dumpD1({ baseUrl: BASE, secret: BACKUP_SECRET, fetchImpl: bridge(), sleep: noWait });
    const target = newLanguageDb();
    target.exec(sql);
    assert.deepEqual(snapshot(target), before);
  });

  it("an empty database backs up and restores to an empty database", async () => {
    const { sql, counts } = await dumpD1({ baseUrl: BASE, secret: BACKUP_SECRET, fetchImpl: bridge(), sleep: noWait });
    assert.deepEqual(counts, { tour_language: 0, translations: 0, transcripts: 0 });
    const fresh = new D1Shim();
    fresh.exec(sql);
    assert.deepEqual(snapshot(fresh), { tour_language: [], translations: [], transcripts: [] });
  });

  it("the compressed file the job uploads decompresses to the same SQL", async () => {
    seedAwkward();
    const { sql } = await dumpD1({ baseUrl: BASE, secret: BACKUP_SECRET, fetchImpl: bridge(), sleep: noWait });
    assert.equal(gunzipSync(gzipSync(Buffer.from(sql))).toString("utf8"), sql);
  });
});

/* ── when things go wrong the job must fail loudly ──────────────────────── */

describe("dump failures", () => {
  it("retries a flaky answer, then succeeds", async () => {
    addTranslation(T1, "fr", 1);
    let calls = 0;
    const flaky = (url: string, init?: RequestInit) => {
      calls++;
      if (calls <= 2) return Promise.resolve(new Response("{}", { status: 503 }));
      return bridge()(url, init);
    };
    const waits: number[] = [];
    const r = await dumpD1({ baseUrl: BASE, secret: BACKUP_SECRET, fetchImpl: flaky, sleep: async (ms: number) => void waits.push(ms) });
    assert.equal(r.counts.translations, 1);
    assert.deepEqual(waits, [1000, 2000]);
  });

  it("retries a dropped connection", async () => {
    let calls = 0;
    const f = (url: string, init?: RequestInit) => {
      if (calls++ === 0) return Promise.reject(new TypeError("fetch failed"));
      return bridge()(url, init);
    };
    const r = await dumpD1({ baseUrl: BASE, secret: BACKUP_SECRET, fetchImpl: f, sleep: noWait });
    assert.equal(r.counts.translations, 0);
  });

  it("gives up after four tries instead of looping forever", async () => {
    let calls = 0;
    const down = () => (calls++, Promise.resolve(new Response("{}", { status: 502 })));
    await assert.rejects(() => dumpD1({ baseUrl: BASE, secret: BACKUP_SECRET, fetchImpl: down, sleep: noWait }), /gave up after 4 tries/);
    assert.equal(calls, 4);
  });

  it("explains a wrong secret, a missing secret and an old Worker", async () => {
    await assert.rejects(() => dumpD1({ baseUrl: BASE, secret: "wrong-secret-wrong-secret-wrong", fetchImpl: bridge(), sleep: noWait }), /401 unauthorized/);
    await assert.rejects(() => dumpD1({ baseUrl: BASE, secret: BACKUP_SECRET, fetchImpl: bridge({ ...env, BACKUP_SECRET: undefined }), sleep: noWait }), /add the BACKUP_SECRET/);
    const old = () => Promise.resolve(new Response('{"ok":false,"error":"not_found"}', { status: 404 }));
    await assert.rejects(() => dumpD1({ baseUrl: BASE, secret: BACKUP_SECRET, fetchImpl: old, sleep: noWait }), /old version/);
  });

  it("does not retry a 401 (a wrong secret will not get better)", async () => {
    let calls = 0;
    const f = () => (calls++, Promise.resolve(new Response('{"ok":false}', { status: 401 })));
    await assert.rejects(() => dumpD1({ baseUrl: BASE, secret: BACKUP_SECRET, fetchImpl: f, sleep: noWait }));
    assert.equal(calls, 1);
  });

  it("refuses to write a backup when rows were silently lost on the way", async () => {
    for (let i = 0; i < 10; i++) addTranslation(T1, "fr", i);
    const lossy = async (url: string, init?: RequestInit) => {
      const res = await bridge()(url, init);
      if (!url.includes("table=translations")) return res;
      const body = (await res.json()) as any;
      body.rows = body.rows.slice(0, 5);
      body.next = null;
      return new Response(JSON.stringify(body), { status: 200 });
    };
    await assert.rejects(() => dumpD1({ baseUrl: BASE, secret: BACKUP_SECRET, fetchImpl: lossy, sleep: noWait }), /read 5 rows but the table held 10/);
  });

  it("refuses a Worker whose paging repeats rows", async () => {
    for (let i = 0; i < 4; i++) addTranslation(T1, "fr", i);
    const loop = async (url: string, init?: RequestInit) => {
      if (!url.includes("table=translations")) return bridge()(url, init);
      // Ignore the cursor, so every page is the first page again, and claim there is more.
      const res = await bridge()(`${BASE}/backup?table=translations&limit=2`, init);
      const body = (await res.json()) as any;
      body.next = ["x", "y", "z"];
      return new Response(JSON.stringify(body), { status: 200 });
    };
    await assert.rejects(() => dumpD1({ baseUrl: BASE, secret: BACKUP_SECRET, fetchImpl: loop, sleep: noWait }), /same row came twice/);
  });

  it("refuses a Worker that says there is more but sends nothing", async () => {
    addTranslation(T1, "fr", 1);
    const stuck = async (url: string, init?: RequestInit) => {
      const res = await bridge()(url, init);
      if (!url.includes("table=translations")) return res;
      const body = (await res.json()) as any;
      body.rows = [];
      body.next = ["x", "y", "z"];
      return new Response(JSON.stringify(body), { status: 200 });
    };
    await assert.rejects(() => dumpD1({ baseUrl: BASE, secret: BACKUP_SECRET, fetchImpl: stuck, sleep: noWait }), /sent no rows/);
  });

  it("refuses a missing address or a short secret before calling anything", async () => {
    let calls = 0;
    const f = () => (calls++, Promise.resolve(new Response("{}")));
    await assert.rejects(() => dumpD1({ baseUrl: "", secret: BACKUP_SECRET, fetchImpl: f }), /LANGUAGE_API_URL/);
    await assert.rejects(() => dumpD1({ baseUrl: BASE, secret: "short", fetchImpl: f }), /BACKUP_SECRET/);
    assert.equal(calls, 0);
  });
});
