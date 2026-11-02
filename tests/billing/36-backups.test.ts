/**
 * The nightly database backup: Supabase Free has no backups of its own, so this
 * (lib/server/dbBackup.ts + lib/server/backupStore.ts + app/api/system/backup)
 * is what stands between a mistake and losing the data for good. See
 * cloudflare/BACKUPS.md.
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { BACKUP_TABLES } from "@/lib/server/backupTables";
import { buildBackup, backupFilename, gzipBackup, backupHealthy, type BackupResult } from "@/lib/server/dbBackup";
import { backupsToPrune, type BackupListing } from "@/lib/server/backupStore";
import { makeWorld, type World } from "./harness/world";

describe("BACKUP_TABLES", () => {
  it("has no duplicates and no obviously wrong names", () => {
    assert.equal(new Set(BACKUP_TABLES).size, BACKUP_TABLES.length);
    for (const t of BACKUP_TABLES) assert.match(t, /^[a-z][a-z0-9_]*$/, t);
    assert.ok(BACKUP_TABLES.includes("billing_orders"));
    assert.ok(BACKUP_TABLES.includes("campaign_scans"));
  });
});

describe("backupFilename", () => {
  it("is stable, sorts chronologically, and matches the Worker's allowed shape", () => {
    const a = backupFilename("2026-11-02T02:15:00.000Z");
    const b = backupFilename("2026-11-03T02:15:00.000Z");
    assert.equal(a, "backups/2026-11-02T02-15-00-000Z.json.gz");
    assert.ok(a < b, "later timestamps sort after earlier ones as plain strings");
    assert.match(a, /^backups\/[A-Za-z0-9_-]{1,120}\.json\.gz$/);
  });
});

describe("backupsToPrune", () => {
  const files = (keys: string[]): BackupListing[] => keys.map((key) => ({ key, size: 10, uploaded: "x" }));

  it("keeps the newest N, deletes the rest, oldest first", () => {
    const keys = Array.from({ length: 5 }, (_, i) => `backups/2026-11-0${i + 1}T00-00-00Z.json.gz`);
    assert.deepEqual(backupsToPrune(files(keys), 3), [keys[0], keys[1]]);
  });

  it("deletes nothing when there are not yet more than the limit", () => {
    assert.deepEqual(backupsToPrune(files(["a", "b"]), 35), []);
    assert.deepEqual(backupsToPrune([], 35), []);
  });
});

describe("backupHealthy", () => {
  const base: BackupResult = { takenAt: "x", tables: {}, counts: {}, warnings: [] };

  it("a clean backup, or one only capped by size or time, is healthy", () => {
    assert.equal(backupHealthy(base), true);
    assert.equal(backupHealthy({ ...base, warnings: ["scenes: stopped at 300000 rows (table cap)"] }), true);
    assert.equal(backupHealthy({ ...base, warnings: ["hotspots: stopped early at 900 rows (time budget)"] }), true);
  });

  it("a table that errored makes the backup unhealthy", () => {
    assert.equal(backupHealthy({ ...base, warnings: ['email_campaigns: relation "email_campaigns" does not exist'] }), false);
  });
});

/* ── against a database ──────────────────────────────────────────────── */

describe("buildBackup: every row of every table, resilient to a missing one", () => {
  let w: World;
  before(async () => (w = await makeWorld()));
  after(async () => w.reset?.());

  it("reads rows that exist, and records a warning (not a crash) for a table that does not", async () => {
    await w.q("delete from public.campaign_codes");
    await w.q(
      `insert into public.campaign_codes (code, label, destination, source, medium, campaign, active)
       values ('BKUPTST','a backup test','/', 'pamphlet', 'qr', null, true)`
    );
    assert.ok(BACKUP_TABLES.includes("campaign_codes"));
    assert.ok(BACKUP_TABLES.includes("hotspots"), "a table the test schema does not define is fine: it just warns");

    const result = await buildBackup(w.sb, 10_000);
    assert.ok(Array.isArray(result.tables.campaign_codes));
    assert.ok((result.tables.campaign_codes as { code: string }[]).some((r) => r.code === "BKUPTST"));
    assert.equal(result.counts.campaign_codes!.rows >= 1, true);

    // hotspots is not in the slim test schema (tests/billing/harness/baseSchema.sql plus
    // the migrations world.ts applies is not a full mirror of production) — that must
    // show up as a warning, never a throw.
    assert.ok(result.warnings.some((w2) => w2.startsWith("hotspots:")));
    assert.equal(backupHealthy(result), false);
  });

  it("a backup round-trips through gzip exactly as it went in", async () => {
    const result = await buildBackup(w.sb, 10_000);
    const gz = gzipBackup(result);
    const back = JSON.parse(gunzipSync(gz).toString("utf8")) as BackupResult;
    assert.deepEqual(back.counts, result.counts);
    assert.deepEqual(back.tables.campaign_codes, result.tables.campaign_codes);
  });

  it("stops a table within its time budget instead of running forever", async () => {
    const result = await buildBackup(w.sb, 0);
    // every table hits the already-past deadline on its very first page
    assert.ok(result.warnings.some((w2) => w2.endsWith("(time budget)")));
  });
});

/* ── the cron route: auth, not-configured, upload, prune ────────────────── */

describe("GET /api/system/backup", () => {
  let w: World;
  let route: typeof import("@/app/api/system/backup/route");
  const realFetch = globalThis.fetch;
  let store: Map<string, Buffer>;
  let storeDown: boolean;

  before(async () => {
    w = await makeWorld();
    process.env.BACKUP_BASE_URL = "https://backup.example.workers.dev";
    process.env.BACKUP_UPLOAD_SECRET = "backup_secret_for_tests_0123456789";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.startsWith(process.env.BACKUP_BASE_URL!)) return realFetch(input as RequestInfo, init);
      if (storeDown) throw new Error("network down");
      const auth = (init?.headers as Record<string, string> | undefined)?.authorization;
      if (auth !== `Bearer ${process.env.BACKUP_UPLOAD_SECRET}`) return new Response("Not allowed", { status: 401 });
      const key = decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ""));
      const method = init?.method ?? "GET";
      if (method === "PUT") {
        store.set(key, Buffer.from((init!.body as Buffer) ?? Buffer.alloc(0)));
        return new Response("Saved", { status: 200 });
      }
      if (method === "GET" && !key) {
        const files = [...store.keys()].map((k) => ({ key: k, size: store.get(k)!.length, uploaded: new Date().toISOString() }));
        return Response.json({ files });
      }
      if (method === "DELETE") {
        store.delete(key);
        return new Response("Deleted", { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    }) as typeof fetch;
    route = await import("@/app/api/system/backup/route");
  });
  after(async () => {
    globalThis.fetch = realFetch;
    delete process.env.BACKUP_BASE_URL;
    delete process.env.BACKUP_UPLOAD_SECRET;
    await w.reset?.();
  });
  beforeEach(async () => {
    store = new Map();
    storeDown = false;
    await w.q("delete from public.billing_alerts");
  });

  const call = (secret = process.env.CRON_SECRET) =>
    route.GET(new Request("http://localhost/api/system/backup", { headers: secret ? { authorization: `Bearer ${secret}` } : {} }));

  it("refuses anyone without the cron secret", async () => {
    assert.equal((await call("")).status, 401, "no Authorization header sent at all");
    assert.equal((await call("wrong")).status, 401);
  });

  it("runs, uploads a gzip file, and reports counts", async () => {
    const res = await call();
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; filename: string; bytes: number; tables: number; rows: number };
    assert.equal(body.ok, true);
    assert.match(body.filename, /^backups\/.+\.json\.gz$/);
    assert.equal(body.tables, BACKUP_TABLES.length);
    assert.ok(body.bytes > 0);
    assert.equal(store.size, 1);
    const saved = JSON.parse(gunzipSync(store.get(body.filename)!).toString("utf8"));
    assert.equal(typeof saved.takenAt, "string");
  });

  it("not set up yet: says so plainly, writes an alert once, never throws", async () => {
    delete process.env.BACKUP_BASE_URL;
    try {
      const res = await call();
      assert.equal(res.status, 200);
      const body = (await res.json()) as { ok: boolean; skipped: boolean; reason: string };
      assert.deepEqual(body, { ok: true, skipped: true, reason: "not_configured" });
      const alerts = await w.q(`select kind from public.billing_alerts where kind = 'backup_not_configured'`);
      assert.equal(alerts.length, 1);
    } finally {
      process.env.BACKUP_BASE_URL = "https://backup.example.workers.dev";
    }
  });

  it("an upload failure is reported and alerted, not swallowed", async () => {
    storeDown = true;
    const res = await call();
    assert.equal(res.status, 502);
    const alerts = await w.q(`select kind, severity from public.billing_alerts where kind = 'backup_upload_failed'`);
    assert.equal(alerts.length, 1);
    assert.equal((alerts[0] as { severity: string }).severity, "critical");
  });

  it("deletes only the oldest backups once more than 35 exist", async () => {
    for (let i = 0; i < 36; i++) {
      store.set(`backups/2026-10-${String(i + 1).padStart(2, "0")}T00-00-00-000Z.json.gz`, Buffer.from("x"));
    }
    const before = [...store.keys()].sort();
    const res = await call();
    const body = (await res.json()) as { pruned: number };
    assert.equal(body.pruned, 2, "36 old + 1 just-written = 37, keep 35");
    assert.equal(store.size, 35);
    assert.ok(!store.has(before[0]!), "the oldest was removed");
    assert.ok(store.has(before[before.length - 1]!), "the newest of the old ones survives");
  });
});
