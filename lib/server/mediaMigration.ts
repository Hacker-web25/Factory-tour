/**
 * Moving the pictures and sounds out of Supabase Storage into Cloudflare R2, and
 * proving that every one arrived intact before anything is removed. SERVER ONLY.
 *
 * Why this exists: Supabase Free holds 1 GB of files. Tour pictures are large and
 * customers keep them, so the files live on Cloudflare R2 (cheap, no download fees)
 * and Supabase keeps only the database. New uploads already go straight to R2.
 * What is left is the older files, which this copies across.
 *
 * The three steps, each safe to repeat:
 *   1. status   list both places and compare name, size and MD5 fingerprint
 *   2. copy     for a short list of names: download from Supabase, check it against
 *               the fingerprint Supabase recorded, store it in R2 through the media
 *               Worker (never over an existing name)
 *   3. purge    only when EVERY Supabase file is in R2 with the same bytes, delete
 *               the Supabase copies (the one irreversible step)
 *
 * R2's own fingerprint of a stored file is the MD5 of its bytes, and so is Supabase's,
 * so equal fingerprints on both sides mean the same bytes, without downloading anything.
 */

import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signMediaToken } from "@/lib/mediaToken";
import { encodeObjectPath, isMediaBucket, isSafeObjectPath, MEDIA_MAX_BYTES } from "@/lib/mediaUrl";

export type SbObject = {
  name: string;
  size: number;
  etag: string;
  mimetype: string | null;
  cacheControl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type R2Object = { key: string; size: number; etag: string; uploaded: string | null };

export type WorkerConfig = { base: string; secret: string };

type Fetch = typeof fetch;

const MD5 = /^[0-9a-f]{32}$/;

/* ───────────────────────────── the two lists ───────────────────────────── */

/** Every file Supabase Storage holds in a bucket, from the server-only function in supabase/storage_inventory.sql. */
export async function listSupabase(sb: SupabaseClient, bucket: string): Promise<SbObject[]> {
  const out: SbObject[] = [];
  let after = "";
  for (let page = 0; page < 200; page++) {
    const { data, error } = await sb.rpc("vpv_storage_inventory", { p_bucket: bucket, p_after: after, p_limit: 1000 });
    if (error) {
      if (/vpv_storage_inventory/.test(error.message) && /does not exist|schema cache|Could not find/i.test(error.message)) {
        throw new Error("Run supabase/storage_inventory.sql in the Supabase SQL editor first.");
      }
      throw new Error(`Could not list Supabase files: ${error.message}`);
    }
    const rows = (data ?? []) as Array<{
      name: string;
      size: number | string;
      etag: string;
      mimetype: string | null;
      cache_control: string | null;
      created_at: string;
      updated_at: string;
    }>;
    for (const r of rows) {
      out.push({
        name: r.name,
        size: Number(r.size),
        etag: String(r.etag || "").toLowerCase(),
        mimetype: r.mimetype,
        cacheControl: r.cache_control,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      });
    }
    if (rows.length < 1000) return out;
    after = rows[rows.length - 1]!.name;
  }
  throw new Error("Too many files to list in one go.");
}

/** Every file R2 holds in a bucket, asked from the media Worker with a short-lived "list" slip. */
export async function listR2(cfg: WorkerConfig, bucket: string, fetchImpl: Fetch = fetch): Promise<Map<string, R2Object>> {
  const out = new Map<string, R2Object>();
  let cursor: string | null = null;
  for (let page = 0; page < 500; page++) {
    const token = await signMediaToken(cfg.secret, { bucket, path: "", maxBytes: 0, upsert: false, action: "list", ttlSeconds: 120 });
    const url = new URL(`${cfg.base}/_list`);
    url.searchParams.set("bucket", bucket);
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetchImpl(url.toString(), { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
    if (res.status === 404 || res.status === 405) {
      throw new Error("The Cloudflare media Worker is the old version. Paste the new cloudflare/media-worker.js into it and deploy.");
    }
    if (!res.ok) throw new Error(`Cloudflare did not list the files (${res.status}).`);
    const body = (await res.json()) as { objects?: R2Object[]; truncated?: boolean; cursor?: string | null };
    for (const o of body.objects ?? []) out.set(o.key, { ...o, etag: String(o.etag || "").toLowerCase() });
    if (!body.truncated || !body.cursor) return out;
    cursor = body.cursor;
  }
  throw new Error("Too many files to list in one go.");
}

/* ───────────────────────────── comparing ───────────────────────────── */

export type Comparison = {
  /** In both places with the same bytes. */
  verified: number;
  /** Of those, how many were checked by size only (no MD5 on one side). */
  sizeOnly: number;
  /** Only in Supabase so far. */
  missing: SbObject[];
  /** In both places but not the same bytes, and R2's copy is NOT the newer one: a person has to look. */
  conflicts: Array<{ name: string; supabase: number; r2: number }>;
  /** In both places, not the same, but R2's copy was written after Supabase's: the file was replaced since the switch. */
  replacedSince: string[];
  /** In R2 only (uploaded since the switch). */
  r2Only: number;
  bytes: { supabase: number; r2: number; missing: number };
};

export function compare(sb: SbObject[], r2: Map<string, R2Object>): Comparison {
  const c: Comparison = {
    verified: 0,
    sizeOnly: 0,
    missing: [],
    conflicts: [],
    replacedSince: [],
    r2Only: 0,
    bytes: { supabase: 0, r2: 0, missing: 0 },
  };
  const names = new Set<string>();
  for (const o of sb) {
    names.add(o.name);
    c.bytes.supabase += o.size;
    const r = r2.get(o.name);
    if (!r) {
      c.missing.push(o);
      c.bytes.missing += o.size;
      continue;
    }
    const bothMd5 = MD5.test(o.etag) && MD5.test(r.etag);
    const same = r.size === o.size && (bothMd5 ? r.etag === o.etag : true);
    if (same) {
      c.verified++;
      if (!bothMd5) c.sizeOnly++;
      continue;
    }
    const r2Newer = r.uploaded !== null && Date.parse(r.uploaded) > Date.parse(o.updatedAt);
    if (r2Newer) c.replacedSince.push(o.name);
    else c.conflicts.push({ name: o.name, supabase: o.size, r2: r.size });
  }
  for (const [key, r] of r2) {
    c.bytes.r2 += r.size;
    if (!names.has(key)) c.r2Only++;
  }
  return c;
}

/** True when the Supabase copies may be deleted: nothing missing and nothing in doubt. */
export function safeToPurge(c: Comparison, supabaseFiles: number): boolean {
  return supabaseFiles > 0 && c.missing.length === 0 && c.conflicts.length === 0;
}

/* ───────────────────────────── copying ───────────────────────────── */

export type CopyResult = {
  name: string;
  status: "copied" | "already" | "failed" | "skipped";
  message?: string;
};

const md5hex = (b: Uint8Array) => crypto.createHash("md5").update(b).digest("hex");

/**
 * Copy ONE file. Never overwrites: if R2 already has the name, nothing is changed
 * (the next comparison says whether the two are the same).
 */
export async function copyOne(
  sb: SupabaseClient,
  cfg: WorkerConfig,
  bucket: string,
  obj: SbObject,
  fetchImpl: Fetch = fetch
): Promise<CopyResult> {
  const name = obj.name;
  if (!isMediaBucket(bucket)) return { name, status: "skipped", message: "That bucket is not moved to Cloudflare." };
  if (!isSafeObjectPath(name)) {
    return { name, status: "skipped", message: "The file name has characters Cloudflare storage does not accept." };
  }
  if (obj.size <= 0) return { name, status: "skipped", message: "The file is empty." };
  if (obj.size > MEDIA_MAX_BYTES) return { name, status: "skipped", message: "The file is over 100 MB." };

  const dl = await sb.storage.from(bucket).download(name);
  if (dl.error || !dl.data) return { name, status: "failed", message: `Supabase would not give the file: ${dl.error?.message ?? "no data"}` };
  const bytes = new Uint8Array(await dl.data.arrayBuffer());
  if (bytes.length !== obj.size) {
    return { name, status: "failed", message: `Downloaded ${bytes.length} bytes, expected ${obj.size}.` };
  }
  if (MD5.test(obj.etag) && md5hex(bytes) !== obj.etag) {
    return { name, status: "failed", message: "The downloaded bytes do not match Supabase's own fingerprint." };
  }

  const token = await signMediaToken(cfg.secret, { bucket, path: name, maxBytes: bytes.length, upsert: false, ttlSeconds: 300 });
  let res: Response;
  try {
    res = await fetchImpl(`${cfg.base}/${bucket}/${encodeObjectPath(name)}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": obj.mimetype || dl.data.type || "application/octet-stream",
        "cache-control": "public, max-age=3600",
      },
      body: bytes as unknown as BodyInit,
    });
  } catch (e) {
    return { name, status: "failed", message: `Could not reach Cloudflare: ${e instanceof Error ? e.message : "network error"}` };
  }
  if (res.status === 409) return { name, status: "already" };
  if (res.status === 415) return { name, status: "skipped", message: "This kind of file is not stored on Cloudflare." };
  if (!res.ok) return { name, status: "failed", message: `Cloudflare refused the file (${res.status}).` };
  return { name, status: "copied" };
}

/* ───────────────────────────── the final look as a visitor ───────────────────────────── */

export type SpotCheck = { checked: number; problems: string[] };

/**
 * Open a few files the way a visitor does (the public address) and require that each comes
 * out of R2 at the right size. Fails loudly if the Worker is the old version.
 */
export async function spotCheck(cfg: WorkerConfig, bucket: string, objs: SbObject[], fetchImpl: Fetch = fetch, count = 8): Promise<SpotCheck> {
  const picks: SbObject[] = [];
  if (objs.length) {
    const step = Math.max(1, Math.floor(objs.length / count));
    for (let i = 0; i < objs.length && picks.length < count; i += step) picks.push(objs[i]!);
  }
  const problems: string[] = [];
  for (const o of picks) {
    try {
      const res = await fetchImpl(`${cfg.base}/${bucket}/${encodeObjectPath(o.name)}`, { method: "HEAD", cache: "no-store" });
      const source = res.headers.get("x-vpv-source");
      const length = Number(res.headers.get("content-length"));
      if (!res.ok) problems.push(`${o.name}: ${res.status}`);
      else if (source !== "r2") problems.push(`${o.name}: served from ${source ?? "an old Worker (no source header)"}`);
      else if (length !== o.size) problems.push(`${o.name}: ${length} bytes in R2, ${o.size} in Supabase`);
    } catch (e) {
      problems.push(`${o.name}: ${e instanceof Error ? e.message : "unreachable"}`);
    }
  }
  return { checked: picks.length, problems };
}

/* ───────────────────────────── deleting the Supabase copies ───────────────────────────── */

export type PurgeResult =
  | { ok: true; removed: number }
  | { ok: false; error: string; message: string };

/**
 * Delete the Supabase copies of every file in a bucket, but only when it is proven (again, now)
 * that every one of them is in R2 with the same bytes and opens from R2 as a visitor.
 */
export async function purgeBucket(
  sb: SupabaseClient,
  cfg: WorkerConfig,
  bucket: string,
  fetchImpl: Fetch = fetch
): Promise<PurgeResult> {
  if (!isMediaBucket(bucket)) return { ok: false, error: "bad_bucket", message: "That bucket is not moved to Cloudflare." };
  const [files, r2] = await Promise.all([listSupabase(sb, bucket), listR2(cfg, bucket, fetchImpl)]);
  if (files.length === 0) return { ok: true, removed: 0 };
  const c = compare(files, r2);
  if (!safeToPurge(c, files.length)) {
    return {
      ok: false,
      error: "not_verified",
      message: `Not every file is safely in Cloudflare yet (${c.missing.length} missing, ${c.conflicts.length} different). Nothing was deleted.`,
    };
  }
  const look = await spotCheck(cfg, bucket, files, fetchImpl);
  if (look.problems.length) {
    return { ok: false, error: "spot_check_failed", message: `A visitor's view of the files is not right yet: ${look.problems[0]}. Nothing was deleted.` };
  }

  let removed = 0;
  for (let i = 0; i < files.length; i += 100) {
    const batch = files.slice(i, i + 100).map((f) => f.name);
    const { data, error } = await sb.storage.from(bucket).remove(batch);
    if (error) {
      return { ok: false, error: "delete_failed", message: `Deleted ${removed} files, then Supabase refused: ${error.message}` };
    }
    removed += data?.length ?? batch.length;
  }
  return { ok: true, removed };
}
