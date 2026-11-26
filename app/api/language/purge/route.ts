/**
 * POST /api/language/purge   { tour }
 *   Delete every translation, transcript and setting of a tour from Cloudflare.
 *   Called just before a tour is deleted, so deleted tours leave nothing behind.
 */

import { fail, json, readJson } from "@/lib/server/billingGuard";
import { guardWrite, workerFail } from "@/lib/language/access";
import { store } from "@/lib/language/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const read = await readJson(req, 2048);
  if (!read.ok) return fail(read.status, read.error);
  const g = await guardWrite(req, read.body.tour);
  if (!g.ok) return g.res;
  try {
    return json({ ok: true, deleted: (await store.purge(g.tour)).deleted });
  } catch (e) {
    return workerFail(e);
  }
}
