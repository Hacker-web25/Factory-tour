/**
 * POST /api/admin/storage/copy — copy a few files from Supabase Storage to Cloudflare R2.
 * Platform owner only.
 *
 * Body { bucket, names: string[] }  (at most 8 names per call; the page loops)
 * Returns { ok, results: [{ name, status: "copied" | "already" | "failed" | "skipped", message? }] }
 *
 * Safe to repeat: a name that is already in R2 is left alone, never overwritten.
 */

import { fail, json, readJson } from "@/lib/server/billingGuard";
import { copyOne, listSupabase, type SbObject } from "@/lib/server/mediaMigration";
import { MOVED_BUCKETS, storageFetch, storageGuard } from "@/lib/server/storageAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_NAMES = 8;
const CONCURRENCY = 3;

export async function POST(req: Request) {
  const guard = await storageGuard(req);
  if (!guard.ok) return guard.res;
  const { sb, cfg } = guard.ctx;

  const read = await readJson(req, 64 * 1024);
  if (!read.ok) return fail(read.status, read.error);
  const { bucket, names } = read.body as { bucket?: unknown; names?: unknown };
  if (typeof bucket !== "string" || !(MOVED_BUCKETS as readonly string[]).includes(bucket)) return fail(400, "bad_bucket");
  if (!Array.isArray(names) || names.length === 0 || names.length > MAX_NAMES || names.some((n) => typeof n !== "string")) {
    return fail(400, "bad_names", `Send between 1 and ${MAX_NAMES} file names.`);
  }

  try {
    // Each name is looked up in Supabase's own list, so only files that really exist there are copied,
    // with the size and fingerprint Supabase recorded.
    const known = new Map<string, SbObject>((await listSupabase(sb, bucket)).map((o) => [o.name, o]));
    const work = (names as string[]).map((n) => ({ n, o: known.get(n) }));
    const results: Array<Awaited<ReturnType<typeof copyOne>>> = new Array(work.length);

    let next = 0;
    const lane = async () => {
      while (next < work.length) {
        const i = next++;
        const { n, o } = work[i]!;
        results[i] = o ? await copyOne(sb, cfg, bucket, o, storageFetch()) : { name: n, status: "skipped", message: "Not in Supabase any more." };
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, work.length) }, lane));
    return json({ ok: true, results });
  } catch (e) {
    return fail(502, "copy_failed", e instanceof Error ? e.message : "The copy failed.");
  }
}
