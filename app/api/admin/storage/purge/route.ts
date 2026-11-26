/**
 * POST /api/admin/storage/purge — delete the Supabase copies of a bucket's files, the one step
 * that cannot be undone. Platform owner only.
 *
 * Body { bucket, confirm: "DELETE FROM SUPABASE" }
 *
 * It re-checks everything itself, right now, and deletes nothing unless every file in the Supabase
 * bucket is in Cloudflare with the same bytes AND opens from Cloudflare as a visitor.
 */

import { fail, json, readJson } from "@/lib/server/billingGuard";
import { purgeBucket } from "@/lib/server/mediaMigration";
import { MOVED_BUCKETS, storageFetch, storageGuard } from "@/lib/server/storageAdmin";
import { logSecurityEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const PURGE_PHRASE = "DELETE FROM SUPABASE";

export async function POST(req: Request) {
  const guard = await storageGuard(req);
  if (!guard.ok) return guard.res;
  const { sb, cfg } = guard.ctx;

  const read = await readJson(req, 4 * 1024);
  if (!read.ok) return fail(read.status, read.error);
  const { bucket, confirm } = read.body as { bucket?: unknown; confirm?: unknown };
  if (typeof bucket !== "string" || !(MOVED_BUCKETS as readonly string[]).includes(bucket)) return fail(400, "bad_bucket");
  if (confirm !== PURGE_PHRASE) return fail(400, "not_confirmed", `Type ${PURGE_PHRASE} to confirm.`);

  try {
    const result = await purgeBucket(sb, cfg, bucket, storageFetch());
    if (!result.ok) return fail(409, result.error, result.message);
    await logSecurityEvent({ event: "storage.purged", subject: bucket, meta: { removed: result.removed } });
    return json({ ok: true, removed: result.removed });
  } catch (e) {
    return fail(502, "purge_failed", e instanceof Error ? e.message : "The delete failed.");
  }
}
