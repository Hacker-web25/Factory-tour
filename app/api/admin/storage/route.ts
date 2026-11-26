/**
 * GET /api/admin/storage — where every picture and sound is, Supabase or Cloudflare.
 * Platform owner only. Read-only.
 *
 * Response {
 *   ok, buckets: [{
 *     bucket, supabase: {files, bytes}, r2: {files, bytes},
 *     verified, sizeOnly, missing: {files, bytes, names[]}, conflicts[], replacedSince, r2Only,
 *     readyToDelete
 *   }],
 *   private: [{ bucket, files, bytes }]       // recordings and voice samples, which stay in Supabase
 * }
 */

import { fail, json } from "@/lib/server/billingGuard";
import { compare, listR2, listSupabase, safeToPurge } from "@/lib/server/mediaMigration";
import { ALL_BUCKETS, MOVED_BUCKETS, storageFetch, storageGuard } from "@/lib/server/storageAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** How many missing names to send back (the page asks again after each pass). */
const NAME_CAP = 3000;

export async function GET(req: Request) {
  const guard = await storageGuard(req);
  if (!guard.ok) return guard.res;
  const { sb, cfg } = guard.ctx;

  try {
    const buckets = [];
    for (const bucket of MOVED_BUCKETS) {
      const [files, r2] = await Promise.all([listSupabase(sb, bucket), listR2(cfg, bucket, storageFetch())]);
      const c = compare(files, r2);
      buckets.push({
        bucket,
        supabase: { files: files.length, bytes: c.bytes.supabase },
        r2: { files: r2.size, bytes: c.bytes.r2 },
        verified: c.verified,
        sizeOnly: c.sizeOnly,
        missing: { files: c.missing.length, bytes: c.bytes.missing, names: c.missing.slice(0, NAME_CAP).map((m) => m.name) },
        conflicts: c.conflicts.slice(0, 50),
        replacedSince: c.replacedSince.length,
        r2Only: c.r2Only,
        readyToDelete: safeToPurge(c, files.length),
      });
    }

    const priv = [];
    for (const bucket of ALL_BUCKETS) {
      if ((MOVED_BUCKETS as readonly string[]).includes(bucket)) continue;
      const files = await listSupabase(sb, bucket);
      priv.push({ bucket, files: files.length, bytes: files.reduce((n, f) => n + f.size, 0) });
    }
    return json({ ok: true, buckets, private: priv });
  } catch (e) {
    return fail(502, "check_failed", e instanceof Error ? e.message : "Could not read the file lists.");
  }
}
