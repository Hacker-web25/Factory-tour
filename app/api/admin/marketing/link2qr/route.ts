/**
 * POST /api/admin/marketing/link2qr — copy LINK-2-QR's scans in now (platform owner only).
 *
 * The dashboard already does this on every load with a short wait. This is the
 * button for when LINK-2-QR's server was asleep: it waits long enough for it to
 * wake up (up to ~50 s on its free hosting).
 */

import { fail, json } from "@/lib/server/billingGuard";
import { ownerGuard } from "@/lib/server/ownerGuard";
import { syncLink2Qr } from "@/lib/server/link2qrSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const g = await ownerGuard(req);
  if ("error" in g) return g.error;
  const result = await syncLink2Qr(g.sb, { budgetMs: 50_000, force: true });
  if (!result.ok) return fail(502, "link2qr_unreachable", result.error ?? "LINK-2-QR did not answer.");
  return json({ ok: true, link2qr: result });
}
