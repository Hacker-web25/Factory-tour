/**
 * Moving the files out of Supabase Storage into Cloudflare R2, and proving each arrived.
 *
 * These run the REAL media Worker (cloudflare/media-worker.js) and the REAL routes against a
 * pretend R2 bucket and a pretend Supabase. What matters:
 *   - the Worker lists a bucket only for our server, and says which place a file came from;
 *   - a file is copied only if Supabase's own fingerprint matches what was downloaded, never over
 *     an existing name;
 *   - the Supabase copies are deleted only when EVERY file is in R2 with the same bytes and opens
 *     from R2 as a visitor; never otherwise;
 *   - only the platform owner can do any of it.
 */

import "./harness/supabaseEnv";
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { signMediaToken, verifyMediaToken } from "@/lib/mediaToken";
import { __setAuthenticatorForTests, type AuthedRequest } from "@/lib/server/requestAuth";
import { __setSupabaseAdminForTests } from "@/lib/server/supabaseAdmin";
import { __setStorageFetchForTests } from "@/lib/server/storageAdmin";
import { compare, copyOne, listR2, listSupabase, purgeBucket, safeToPurge, spotCheck, type R2Object, type SbObject } from "@/lib/server/mediaMigration";
import { GET as statusRoute } from "@/app/api/admin/storage/route";
import { POST as copyRoute } from "@/app/api/admin/storage/copy/route";
import { POST as purgeRoute } from "@/app/api/admin/storage/purge/route";
// @ts-expect-error plain JavaScript Worker, not type-checked
import worker, { verifyToken as workerVerify } from "../../cloudflare/media-worker.js";

const SECRET = "test-secret-at-least-32-characters-long";
const BASE = "https://vpv-media.example.workers.dev";
const CFG = { base: BASE, secret: SECRET };

const md5 = (b: Uint8Array) => crypto.createHash("md5").update(b).digest("hex");
const bytesOf = (n: number, fill: number) => new Uint8Array(n).fill(fill);

/* ── a pretend R2 bucket (with a real MD5 etag and a list) ──────────────── */

type Stored = { bytes: Uint8Array; contentType: string; cacheControl: string; uploaded: Date };

function fakeR2() {
  const files = new Map<string, Stored>();
  return {
    files,
    async get(key: string, opts?: { range?: Headers }) {
      const f = files.get(key);
      if (!f) return null;
      void opts;
      return {
        body: new Response(f.bytes).body,
        size: f.bytes.length,
        httpEtag: `"${md5(f.bytes)}"`,
        range: undefined,
        writeHttpMetadata(h: Headers) {
          h.set("content-type", f.contentType);
          h.set("cache-control", f.cacheControl);
        },
      };
    },
    async put(key: string, body: ReadableStream | ArrayBuffer, o: { httpMetadata: { contentType: string; cacheControl: string }; onlyIf?: unknown }) {
      if (o.onlyIf && files.has(key)) return null;
      const bytes = new Uint8Array(await new Response(body as BodyInit).arrayBuffer());
      files.set(key, { bytes, contentType: o.httpMetadata.contentType, cacheControl: o.httpMetadata.cacheControl, uploaded: new Date() });
      return { key };
    },
    async delete(key: string) {
      files.delete(key);
    },
    async list(o: { prefix: string; cursor?: string; limit: number }) {
      const keys = [...files.keys()].filter((k) => k.startsWith(o.prefix)).sort();
      const start = o.cursor ? keys.findIndex((k) => k > o.cursor!) : 0;
      const from = start === -1 ? keys.length : start;
      const slice = keys.slice(from, from + o.limit);
      const truncated = from + o.limit < keys.length;
      return {
        objects: slice.map((k) => ({ key: k, size: files.get(k)!.bytes.length, etag: md5(files.get(k)!.bytes), uploaded: files.get(k)!.uploaded })),
        truncated,
        cursor: truncated ? slice[slice.length - 1] : undefined,
      };
    },
  };
}

/* ── a pretend Supabase ─────────────────────────────────────────────────── */

type SbFile = { bytes: Uint8Array; mimetype: string; etag?: string; updatedAt?: string };

function fakeSupabase(store: Record<string, Map<string, SbFile>>) {
  const removed: string[] = [];
  const downloads: string[] = [];
  const audit: Array<Record<string, unknown>> = [];
  const client = {
    removed,
    downloads,
    audit,
    async rpc(fn: string, args: { p_bucket: string; p_after: string; p_limit: number }) {
      if (fn === "log_security_event") {
        audit.push(args as unknown as Record<string, unknown>);
        return { data: null, error: null };
      }
      assert.equal(fn, "vpv_storage_inventory");
      const names = [...(store[args.p_bucket]?.keys() ?? [])].sort().filter((n) => n > (args.p_after ?? ""));
      const rows = names.slice(0, Math.min(args.p_limit, 1000)).map((name) => {
        const f = store[args.p_bucket]!.get(name)!;
        return {
          name,
          size: f.bytes.length,
          etag: f.etag ?? md5(f.bytes),
          mimetype: f.mimetype,
          cache_control: "max-age=3600",
          created_at: "2026-10-01T00:00:00Z",
          updated_at: f.updatedAt ?? "2026-10-01T00:00:00Z",
        };
      });
      return { data: rows, error: null };
    },
    storage: {
      from: (bucket: string) => ({
        async download(name: string) {
          downloads.push(`${bucket}/${name}`);
          const f = store[bucket]?.get(name);
          if (!f) return { data: null, error: { message: "Object not found" } };
          return { data: new Blob([f.bytes as BlobPart], { type: f.mimetype }), error: null };
        },
        async remove(names: string[]) {
          for (const n of names) {
            store[bucket]?.delete(n);
            removed.push(`${bucket}/${n}`);
          }
          return { data: names.map((name) => ({ name })), error: null };
        },
      }),
    },
  };
  return client as unknown as SupabaseClient & { removed: string[]; downloads: string[]; audit: Array<Record<string, unknown>> };
}

/* ── the real Worker as the network ─────────────────────────────────────── */

const g = globalThis as Record<string, unknown>;

function setup() {
  const r2 = fakeR2();
  const pending: Promise<unknown>[] = [];
  const env = { BUCKET: r2, UPLOAD_SECRET: SECRET };
  const ctx = { waitUntil: (p: Promise<unknown>) => void pending.push(p) };
  const workerFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    let body = init?.body as Uint8Array | undefined;
    if (body && !headers.has("content-length")) headers.set("content-length", String(body.length));
    const req = new Request(String(input), { method: init?.method ?? "GET", headers, body: body as BodyInit | undefined });
    const res = await worker.fetch(req, env, ctx);
    await Promise.all(pending);
    body = undefined;
    return res as Response;
  }) as typeof fetch;
  return { r2, workerFetch, env };
}

beforeEach(() => {
  g.caches = { default: { match: async () => undefined, put: async () => {}, delete: async () => true } };
  g.FixedLengthStream = class {
    readable: ReadableStream;
    writable: WritableStream;
    constructor() {
      const t = new TransformStream();
      this.readable = t.readable;
      this.writable = t.writable;
    }
  };
});
afterEach(() => {
  delete g.caches;
  delete g.FixedLengthStream;
  __setAuthenticatorForTests(null);
  __setSupabaseAdminForTests(null);
  __setStorageFetchForTests(null);
});

/* ── the Worker: list + where a file came from ──────────────────────────── */

describe("the media Worker: list and source", () => {
  it("signs and reads the list slip the same way as the website", async () => {
    const t = await signMediaToken(SECRET, { bucket: "panoramas", path: "", maxBytes: 0, upsert: false, action: "list", now: 1_000_000 });
    const mine = await verifyMediaToken(SECRET, t, 1_000_100);
    assert.equal(mine?.a, "list");
    assert.deepEqual(await workerVerify(SECRET, t, 1_000_100), mine);
  });

  it("lists a bucket for a list slip, with the bucket name stripped, sizes and MD5s", async () => {
    const { r2, workerFetch } = setup();
    await r2.put("panoramas/t1/a.jpg", bytesOf(10, 1), { httpMetadata: { contentType: "image/jpeg", cacheControl: "x" } });
    await r2.put("panoramas/hotspot-images/b.png", bytesOf(20, 2), { httpMetadata: { contentType: "image/png", cacheControl: "x" } });
    await r2.put("tours/logo.png", bytesOf(5, 3), { httpMetadata: { contentType: "image/png", cacheControl: "x" } });

    const list = await listR2(CFG, "panoramas", workerFetch);
    assert.deepEqual([...list.keys()].sort(), ["hotspot-images/b.png", "t1/a.jpg"]);
    assert.equal(list.get("t1/a.jpg")!.size, 10);
    assert.equal(list.get("t1/a.jpg")!.etag, md5(bytesOf(10, 1)));
  });

  it("pages through a long list", async () => {
    const { r2, workerFetch } = setup();
    for (let i = 0; i < 2500; i++) {
      r2.files.set(`panoramas/f${String(i).padStart(5, "0")}.jpg`, { bytes: bytesOf(3, 1), contentType: "image/jpeg", cacheControl: "x", uploaded: new Date() });
    }
    const list = await listR2(CFG, "panoramas", workerFetch);
    assert.equal(list.size, 2500);
  });

  it("refuses to list with no slip, an upload slip, a slip for another bucket, a bad slip, or by POST", async () => {
    const { workerFetch } = setup();
    const ask = (token: string | null, bucket = "panoramas", method = "GET") =>
      workerFetch(`${BASE}/_list?bucket=${bucket}`, { method, headers: token ? { authorization: `Bearer ${token}` } : {} });
    const list = await signMediaToken(SECRET, { bucket: "panoramas", path: "", maxBytes: 0, upsert: false, action: "list" });
    const put = await signMediaToken(SECRET, { bucket: "panoramas", path: "", maxBytes: 100, upsert: false });
    const del = await signMediaToken(SECRET, { bucket: "panoramas", path: "", maxBytes: 0, upsert: false, action: "del" });

    assert.equal((await ask(null)).status, 401);
    assert.equal((await ask(put)).status, 401);
    assert.equal((await ask(del)).status, 401);
    assert.equal((await ask("nope.nope")).status, 401);
    assert.equal((await ask(list, "tours")).status, 403);
    assert.equal((await ask(list, "recordings")).status, 403, "private buckets are never listed here");
    assert.equal((await ask(list, "panoramas", "POST")).status, 405);
    assert.equal((await ask(list)).status, 200);
  });

  it("a list slip cannot write or delete a file", async () => {
    const { r2, workerFetch } = setup();
    const list = await signMediaToken(SECRET, { bucket: "panoramas", path: "", maxBytes: 100, upsert: true, action: "list" });
    const put = await workerFetch(`${BASE}/panoramas/x.jpg`, { method: "PUT", headers: { authorization: `Bearer ${list}`, "content-type": "image/jpeg" }, body: bytesOf(5, 1) });
    assert.equal(put.status, 401);
    r2.files.set("panoramas/x.jpg", { bytes: bytesOf(5, 1), contentType: "image/jpeg", cacheControl: "x", uploaded: new Date() });
    const del = await workerFetch(`${BASE}/panoramas/x.jpg`, { method: "DELETE", headers: { authorization: `Bearer ${list}` } });
    assert.equal(del.status, 401);
    assert.equal(r2.files.size, 1);
  });

  it("says r2 for a file from R2, and supabase for one only in the old place", async () => {
    const { r2, workerFetch } = setup();
    r2.files.set("panoramas/in-r2.jpg", { bytes: bytesOf(4, 1), contentType: "image/jpeg", cacheControl: "x", uploaded: new Date() });
    const real = globalThis.fetch;
    try {
      const res = await workerFetch(`${BASE}/panoramas/in-r2.jpg`, { method: "HEAD" });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("x-vpv-source"), "r2");

      // An old Worker would answer without the header; with a fallback set, a miss reads "supabase".
      globalThis.fetch = (async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/png", "content-length": "3" } })) as typeof fetch;
      const withFallback = (await worker.fetch(new Request(`${BASE}/panoramas/only-old.png`), { BUCKET: r2, UPLOAD_SECRET: SECRET, FALLBACK_BASE: "https://sb.example/p" }, { waitUntil: () => {} })) as Response;
      assert.equal(withFallback.headers.get("x-vpv-source"), "supabase");
    } finally {
      globalThis.fetch = real;
    }
  });
});

/* ── comparing the two lists ────────────────────────────────────────────── */

const sbObj = (name: string, bytes: Uint8Array, o: Partial<SbObject> = {}): SbObject => ({
  name,
  size: bytes.length,
  etag: md5(bytes),
  mimetype: "image/jpeg",
  cacheControl: "max-age=3600",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  ...o,
});
const r2Obj = (key: string, bytes: Uint8Array, o: Partial<R2Object> = {}): R2Object => ({ key, size: bytes.length, etag: md5(bytes), uploaded: "2026-11-05T00:00:00Z", ...o });

describe("comparing Supabase with Cloudflare", () => {
  it("counts verified, missing, replaced-since, conflicting and R2-only files", () => {
    const a = bytesOf(10, 1);
    const b = bytesOf(10, 2);
    const c = bytesOf(10, 3);
    const sb = [sbObj("ok.jpg", a), sbObj("missing.jpg", b), sbObj("changed.jpg", c), sbObj("older-in-r2.jpg", c, { updatedAt: "2026-11-10T00:00:00Z" })];
    const r2 = new Map<string, R2Object>([
      ["ok.jpg", r2Obj("ok.jpg", a)],
      ["changed.jpg", r2Obj("changed.jpg", bytesOf(10, 9), { uploaded: "2026-11-20T00:00:00Z" })],
      ["older-in-r2.jpg", r2Obj("older-in-r2.jpg", bytesOf(10, 8), { uploaded: "2026-11-02T00:00:00Z" })],
      ["new-since.jpg", r2Obj("new-since.jpg", a)],
    ]);
    const r = compare(sb, r2);
    assert.equal(r.verified, 1);
    assert.deepEqual(r.missing.map((m) => m.name), ["missing.jpg"]);
    assert.deepEqual(r.replacedSince, ["changed.jpg"], "R2's copy is newer: the file was replaced after the switch");
    assert.deepEqual(r.conflicts.map((x) => x.name), ["older-in-r2.jpg"], "different and not newer: a person must look");
    assert.equal(r.r2Only, 1);
    assert.equal(r.bytes.missing, 10);
    assert.equal(safeToPurge(r, sb.length), false);
  });

  it("treats the same size with different fingerprints as different, and size alone as enough only when there is no MD5", () => {
    const a = bytesOf(10, 1);
    const different = compare([sbObj("x.jpg", a)], new Map([["x.jpg", r2Obj("x.jpg", bytesOf(10, 2), { uploaded: "2026-09-01T00:00:00Z" })]]));
    assert.equal(different.conflicts.length, 1, "same length, different bytes");

    const noMd5 = compare([sbObj("x.jpg", a, { etag: "abc-12" })], new Map([["x.jpg", r2Obj("x.jpg", a)]]));
    assert.equal(noMd5.verified, 1);
    assert.equal(noMd5.sizeOnly, 1);
  });

  it("is safe to purge only when nothing is missing and nothing is in doubt", () => {
    const a = bytesOf(4, 1);
    assert.equal(safeToPurge(compare([sbObj("a", a)], new Map([["a", r2Obj("a", a)]])), 1), true);
    assert.equal(safeToPurge(compare([], new Map()), 0), false, "an empty bucket has nothing to purge");
    assert.equal(safeToPurge(compare([sbObj("a", a)], new Map()), 1), false);
  });
});

/* ── copying one file ───────────────────────────────────────────────────── */

describe("copying one file", () => {
  it("copies the bytes, keeps the type, and the slip allows exactly that file and size", async () => {
    const { r2, workerFetch } = setup();
    const a = bytesOf(2048, 5);
    const sb = fakeSupabase({ panoramas: new Map([["t1/pic-one.jpg", { bytes: a, mimetype: "image/jpeg" }]]) });
    const res = await copyOne(sb, CFG, "panoramas", sbObj("t1/pic-one.jpg", a), workerFetch);
    assert.equal(res.status, "copied");
    const stored = r2.files.get("panoramas/t1/pic-one.jpg")!;
    assert.equal(md5(stored.bytes), md5(a));
    assert.equal(stored.contentType, "image/jpeg");
    assert.equal(stored.cacheControl, "public, max-age=3600");
  });

  it("never overwrites: a name already in R2 is left exactly as it is", async () => {
    const { r2, workerFetch } = setup();
    const a = bytesOf(100, 5);
    r2.files.set("panoramas/a.jpg", { bytes: bytesOf(100, 9), contentType: "image/jpeg", cacheControl: "x", uploaded: new Date() });
    const sb = fakeSupabase({ panoramas: new Map([["a.jpg", { bytes: a, mimetype: "image/jpeg" }]]) });
    const res = await copyOne(sb, CFG, "panoramas", sbObj("a.jpg", a), workerFetch);
    assert.equal(res.status, "already");
    assert.equal(r2.files.get("panoramas/a.jpg")!.bytes[0], 9);
  });

  it("refuses to store bytes that do not match Supabase's own fingerprint or size", async () => {
    const { r2, workerFetch } = setup();
    const real = bytesOf(100, 5);
    const sb = fakeSupabase({ panoramas: new Map([["a.jpg", { bytes: bytesOf(100, 6), mimetype: "image/jpeg" }]]) });
    const bad = await copyOne(sb, CFG, "panoramas", sbObj("a.jpg", real), workerFetch);
    assert.equal(bad.status, "failed");
    assert.match(bad.message ?? "", /fingerprint/);

    const short = await copyOne(sb, CFG, "panoramas", sbObj("a.jpg", bytesOf(120, 6)), workerFetch);
    assert.equal(short.status, "failed");
    assert.match(short.message ?? "", /expected 120/);
    assert.equal(r2.files.size, 0);
  });

  it("skips what Cloudflare cannot store, and says why", async () => {
    const { r2, workerFetch } = setup();
    const a = bytesOf(10, 1);
    const sb = fakeSupabase({
      panoramas: new Map([
        ["a b.jpg", { bytes: a, mimetype: "image/jpeg" }],
        ["page.html", { bytes: a, mimetype: "text/html" }],
        ["a/../b.jpg", { bytes: a, mimetype: "image/jpeg" }],
      ]),
    });
    assert.equal((await copyOne(sb, CFG, "panoramas", sbObj("a/../b.jpg", a), workerFetch)).status, "skipped");
    assert.equal((await copyOne(sb, CFG, "panoramas", sbObj("page.html", a, { mimetype: "text/html" }), workerFetch)).status, "skipped");
    assert.equal((await copyOne(sb, CFG, "panoramas", sbObj("empty.jpg", new Uint8Array(0)), workerFetch)).status, "skipped");
    assert.equal((await copyOne(sb, CFG, "panoramas", sbObj("big.jpg", a, { size: 101 * 1024 * 1024 }), workerFetch)).status, "skipped");
    assert.equal((await copyOne(sb, CFG, "recordings", sbObj("x.webm", a), workerFetch)).status, "skipped", "private audio is never sent to the public bucket");
    assert.equal(r2.files.size, 0);
  });

  it("reports a Supabase or network failure instead of throwing", async () => {
    const { workerFetch } = setup();
    const a = bytesOf(10, 1);
    const sb = fakeSupabase({ panoramas: new Map() });
    assert.equal((await copyOne(sb, CFG, "panoramas", sbObj("gone.jpg", a), workerFetch)).status, "failed");

    const sb2 = fakeSupabase({ panoramas: new Map([["a.jpg", { bytes: a, mimetype: "image/jpeg" }]]) });
    const down = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    const r = await copyOne(sb2, CFG, "panoramas", sbObj("a.jpg", a), down);
    assert.equal(r.status, "failed");
    assert.match(r.message ?? "", /offline/);
  });
});

/* ── the final look, and the delete ─────────────────────────────────────── */

describe("freeing up Supabase", () => {
  const seed = (files: Record<string, number>) => {
    const store = { panoramas: new Map<string, SbFile>() };
    for (const [name, fill] of Object.entries(files)) store.panoramas.set(name, { bytes: bytesOf(64, fill), mimetype: "image/jpeg" });
    return store;
  };
  const copyAllInto = async (sb: SupabaseClient, store: Record<string, Map<string, SbFile>>, workerFetch: typeof fetch) => {
    for (const o of await listSupabase(sb, "panoramas")) assert.equal((await copyOne(sb, CFG, "panoramas", o, workerFetch)).status, "copied");
    void store;
  };

  it("deletes nothing while any file is still only in Supabase", async () => {
    const { workerFetch } = setup();
    const store = seed({ "a.jpg": 1, "b.jpg": 2, "c.jpg": 3 });
    const sb = fakeSupabase(store);
    const o = (await listSupabase(sb, "panoramas"))[0]!;
    await copyOne(sb, CFG, "panoramas", o, workerFetch); // only one of three

    const r = await purgeBucket(sb, CFG, "panoramas", workerFetch);
    assert.equal(r.ok, false);
    assert.equal(sb.removed.length, 0);
    assert.equal(store.panoramas.size, 3);
  });

  it("deletes nothing when a file in R2 differs and is not newer", async () => {
    const { r2, workerFetch } = setup();
    const store = seed({ "a.jpg": 1, "b.jpg": 2 });
    const sb = fakeSupabase(store);
    await copyAllInto(sb, store, workerFetch);
    // corrupt one in R2, dated BEFORE the Supabase copy was last written
    r2.files.set("panoramas/b.jpg", { bytes: bytesOf(64, 77), contentType: "image/jpeg", cacheControl: "x", uploaded: new Date("2026-01-01") });

    const r = await purgeBucket(sb, CFG, "panoramas", workerFetch);
    assert.equal(r.ok, false);
    assert.equal(sb.removed.length, 0);
  });

  it("deletes nothing when the Worker is the old version (no source header, or no list)", async () => {
    const { workerFetch } = setup();
    const store = seed({ "a.jpg": 1 });
    const sb = fakeSupabase(store);
    await copyAllInto(sb, store, workerFetch);

    const noHeader = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await workerFetch(input, init);
      const h = new Headers(res.headers);
      h.delete("x-vpv-source");
      return new Response(init?.method === "HEAD" ? null : res.body, { status: res.status, headers: h });
    }) as typeof fetch;
    const r = await purgeBucket(sb, CFG, "panoramas", noHeader);
    assert.equal(r.ok, false);
    assert.equal(sb.removed.length, 0);

    const noList = (async () => new Response("Not found", { status: 404 })) as typeof fetch;
    await assert.rejects(() => purgeBucket(sb, CFG, "panoramas", noList), /old version/);
    assert.equal(sb.removed.length, 0);
  });

  it("deletes everything, in batches, once every file is proven in R2", async () => {
    const { workerFetch } = setup();
    const files: Record<string, number> = {};
    for (let i = 0; i < 230; i++) files[`t/${String(i).padStart(4, "0")}.jpg`] = (i % 200) + 1;
    const store = seed(files);
    const sb = fakeSupabase(store);
    await copyAllInto(sb, store, workerFetch);

    const r = await purgeBucket(sb, CFG, "panoramas", workerFetch);
    assert.deepEqual(r, { ok: true, removed: 230 });
    assert.equal(sb.removed.length, 230);
    assert.equal(store.panoramas.size, 0);
  });

  it("will not touch a private bucket", async () => {
    const { workerFetch } = setup();
    const sb = fakeSupabase({ recordings: new Map([["s1.webm", { bytes: bytesOf(8, 1), mimetype: "audio/webm" }]]) });
    const r = await purgeBucket(sb, CFG, "recordings", workerFetch);
    assert.equal(r.ok, false);
    assert.equal(sb.removed.length, 0);
  });

  it("spot-checks files the way a visitor opens them", async () => {
    const { workerFetch } = setup();
    const store = seed({ "a.jpg": 1, "b.jpg": 2 });
    const sb = fakeSupabase(store);
    await copyAllInto(sb, store, workerFetch);
    const files = await listSupabase(sb, "panoramas");
    assert.deepEqual(await spotCheck(CFG, "panoramas", files, workerFetch), { checked: 2, problems: [] });
    const wrongSize = files.map((f) => ({ ...f, size: f.size + 1 }));
    assert.equal((await spotCheck(CFG, "panoramas", wrongSize, workerFetch)).problems.length, 2);
  });
});

/* ── the routes ─────────────────────────────────────────────────────────── */

describe("/api/admin/storage routes", () => {
  const as = (role: string | null) =>
    __setAuthenticatorForTests(async () =>
      role === null ? null : ({ sb: {} as never, user: { id: "u1" } as never, profile: { id: "u1", email: "a@x.com", full_name: null, role, org_id: "o1" } } as AuthedRequest)
    );
  const envBefore = { base: process.env.NEXT_PUBLIC_MEDIA_BASE_URL, secret: process.env.MEDIA_UPLOAD_SECRET };
  const call = async (fn: (r: Request) => Promise<Response>, method: "GET" | "POST", body?: unknown) => {
    const res = await fn(
      new Request("http://localhost/api/admin/storage", {
        method,
        headers: { "content-type": "application/json", authorization: "Bearer t" },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    );
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL = BASE;
    process.env.MEDIA_UPLOAD_SECRET = SECRET;
    as("owner");
  });
  afterEach(() => {
    if (envBefore.base === undefined) delete process.env.NEXT_PUBLIC_MEDIA_BASE_URL;
    else process.env.NEXT_PUBLIC_MEDIA_BASE_URL = envBefore.base;
    if (envBefore.secret === undefined) delete process.env.MEDIA_UPLOAD_SECRET;
    else process.env.MEDIA_UPLOAD_SECRET = envBefore.secret;
  });

  it("is for the platform owner only, and only when everything is configured", async () => {
    const sb = fakeSupabase({ panoramas: new Map() });
    __setSupabaseAdminForTests(sb);

    as(null);
    assert.equal((await call(statusRoute, "GET")).status, 401);
    for (const role of ["org_admin", "presenter", "admin"]) {
      as(role);
      assert.equal((await call(statusRoute, "GET")).status, 403, role);
      assert.equal((await call(copyRoute, "POST", { bucket: "panoramas", names: ["a.jpg"] })).status, 403, role);
      assert.equal((await call(purgeRoute, "POST", { bucket: "panoramas", confirm: "DELETE FROM SUPABASE" })).status, 403, role);
    }
    as("owner");
    delete process.env.MEDIA_UPLOAD_SECRET;
    assert.equal((await call(statusRoute, "GET")).status, 503);
    process.env.MEDIA_UPLOAD_SECRET = SECRET;
    __setSupabaseAdminForTests(null);
    const keyBefore = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.equal((await call(statusRoute, "GET")).status, 503);
    if (keyBefore !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = keyBefore;
  });

  it("shows what is where, then copies, then reports everything verified", async () => {
    const { workerFetch } = setup();
    __setStorageFetchForTests(workerFetch);
    const store = {
      panoramas: new Map<string, SbFile>([
        ["t1/a.jpg", { bytes: bytesOf(64, 1), mimetype: "image/jpeg" }],
        ["t1/b.jpg", { bytes: bytesOf(64, 2), mimetype: "image/jpeg" }],
      ]),
      tours: new Map<string, SbFile>(),
      recordings: new Map<string, SbFile>([["s1.webm", { bytes: bytesOf(10, 1), mimetype: "audio/webm" }]]),
      "voice-samples": new Map<string, SbFile>(),
    };
    const sb = fakeSupabase(store);
    __setSupabaseAdminForTests(sb);

    const before = await call(statusRoute, "GET");
    assert.equal(before.status, 200);
    const pan = before.body.buckets.find((b: { bucket: string }) => b.bucket === "panoramas");
    assert.equal(pan.supabase.files, 2);
    assert.equal(pan.missing.files, 2);
    assert.equal(pan.readyToDelete, false);
    assert.deepEqual(pan.missing.names.sort(), ["t1/a.jpg", "t1/b.jpg"]);
    assert.deepEqual(before.body.private.find((p: { bucket: string }) => p.bucket === "recordings"), { bucket: "recordings", files: 1, bytes: 10 });

    const copied = await call(copyRoute, "POST", { bucket: "panoramas", names: pan.missing.names });
    assert.equal(copied.status, 200);
    assert.deepEqual(copied.body.results.map((r: { status: string }) => r.status), ["copied", "copied"]);

    const after = await call(statusRoute, "GET");
    const pan2 = after.body.buckets.find((b: { bucket: string }) => b.bucket === "panoramas");
    assert.equal(pan2.verified, 2);
    assert.equal(pan2.missing.files, 0);
    assert.equal(pan2.readyToDelete, true);
  });

  it("copy refuses a bad bucket, no names, too many names, and names Supabase does not have", async () => {
    const { workerFetch, r2 } = setup();
    __setStorageFetchForTests(workerFetch);
    const sb = fakeSupabase({ panoramas: new Map([["a.jpg", { bytes: bytesOf(8, 1), mimetype: "image/jpeg" }]]) });
    __setSupabaseAdminForTests(sb);

    assert.equal((await call(copyRoute, "POST", { bucket: "recordings", names: ["a.jpg"] })).status, 400);
    assert.equal((await call(copyRoute, "POST", { bucket: "panoramas", names: [] })).status, 400);
    assert.equal((await call(copyRoute, "POST", { bucket: "panoramas", names: Array.from({ length: 9 }, (_, i) => `n${i}.jpg`) })).status, 400);
    assert.equal((await call(copyRoute, "POST", { bucket: "panoramas", names: [1] })).status, 400);
    const unknown = await call(copyRoute, "POST", { bucket: "panoramas", names: ["not-there.jpg"] });
    assert.equal(unknown.body.results[0].status, "skipped");
    assert.equal(r2.files.size, 0);
  });

  it("purge needs the phrase, and deletes only what is verified", async () => {
    const { workerFetch } = setup();
    __setStorageFetchForTests(workerFetch);
    const store = {
      panoramas: new Map<string, SbFile>([
        ["a.jpg", { bytes: bytesOf(64, 1), mimetype: "image/jpeg" }],
        ["b.jpg", { bytes: bytesOf(64, 2), mimetype: "image/jpeg" }],
      ]),
    };
    const sb = fakeSupabase(store);
    __setSupabaseAdminForTests(sb);

    assert.equal((await call(purgeRoute, "POST", { bucket: "panoramas", confirm: "yes" })).status, 400);
    assert.equal((await call(purgeRoute, "POST", { bucket: "recordings", confirm: "DELETE FROM SUPABASE" })).status, 400);

    const early = await call(purgeRoute, "POST", { bucket: "panoramas", confirm: "DELETE FROM SUPABASE" });
    assert.equal(early.status, 409, "nothing is in R2 yet");
    assert.equal(store.panoramas.size, 2);

    await call(copyRoute, "POST", { bucket: "panoramas", names: ["a.jpg", "b.jpg"] });
    const done = await call(purgeRoute, "POST", { bucket: "panoramas", confirm: "DELETE FROM SUPABASE" });
    assert.equal(done.status, 200);
    assert.equal(done.body.removed, 2);
    assert.equal(store.panoramas.size, 0);
    assert.equal(sb.audit.length, 1, "the delete is written to the audit log");
    assert.equal(sb.audit[0]!.p_event, "storage.purged");
    assert.equal(sb.audit[0]!.p_subject, "panoramas");
  });
});
