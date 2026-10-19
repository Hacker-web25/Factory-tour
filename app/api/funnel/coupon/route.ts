/**
 * POST /api/funnel/coupon — check a coupon code before the buyer pays.
 *
 * Body { code }. Answers { ok, coupon: { code, percentOff, amountOffInr } }
 * so the billing page can show the discount on the bill. This is only a
 * preview: the order route checks the code again and prices the order
 * itself. Rate-limited per IP, so codes cannot be guessed by brute force.
 */

import { getClientIp } from "@/lib/getClientIp";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { billingRateLimit, fail, json, readJson } from "@/lib/server/billingGuard";
import { checkCoupon } from "@/lib/server/coupons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sb = supabaseAdmin();
  if (!sb) return fail(503, "not_configured", "Coupons are not available right now.");

  const read = await readJson(req, 1024);
  if (!read.ok) return fail(read.status, read.error);

  const ip = getClientIp(req.headers);
  const limit = await billingRateLimit(sb, `funnel_coupon:ip:${ip}`, 15, 900);
  if (!limit.allowed) {
    return fail(429, "rate_limited", "Too many tries. Please wait a few minutes.", {
      "Retry-After": String(limit.retryAfter),
    });
  }

  const check = await checkCoupon(sb, read.body.code);
  if (!check.ok) return fail(check.reason === "unavailable" ? 503 : 400, "coupon_invalid", check.message);
  return json({ ok: true, coupon: check.coupon });
}
