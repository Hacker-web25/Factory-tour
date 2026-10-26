/**
 * POST /api/billing/usage — the answer to "How do you plan to use it?",
 * asked on the page a customer lands on after paying.
 *
 * Request  { orderId, uses: string[], other?: string }
 * Response { ok: true } | { ok: false, error, message? }
 *
 * The order id is the random UUID the buyer's own browser received when the
 * order was created; holding it is what lets them answer. Only a PAID order
 * can be answered, so a stranger guessing ids (they cannot: 122 random bits)
 * or a bot cannot fill the table with junk. Answering again replaces the
 * earlier answer. Rate-limited per IP and per order.
 */

import { getClientIp } from "@/lib/getClientIp";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { UUID_RE, billingRateLimit, fail, json, readJson } from "@/lib/server/billingGuard";
import { parseUsageAnswer } from "@/lib/purchaseUsage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sb = supabaseAdmin();
  if (!sb) return fail(503, "not_configured");

  const ip = getClientIp(req.headers);
  const rl = await billingRateLimit(sb, `billing-usage:ip:${ip}`, 30, 3600);
  if (!rl.allowed) return fail(429, "rate_limited", undefined, { "Retry-After": String(rl.retryAfter || 60) });

  const parsed = await readJson(req, 4096);
  if (!parsed.ok) return fail(parsed.status, parsed.error);
  const body = parsed.body;

  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  if (!UUID_RE.test(orderId)) return fail(400, "bad_order");

  const perOrder = await billingRateLimit(sb, `billing-usage:order:${orderId}`, 10, 3600);
  if (!perOrder.allowed) {
    return fail(429, "rate_limited", undefined, { "Retry-After": String(perOrder.retryAfter || 60) });
  }

  const answer = parseUsageAnswer(body.uses, body.other);
  if (!answer.ok) return fail(400, answer.error, answer.message);

  const { data: order, error: orderErr } = await sb
    .from("billing_orders")
    .select("id, status")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr) return fail(503, "temporarily_unavailable");
  if (!order) return fail(404, "unknown_order");
  if (order.status !== "paid") return fail(409, "not_paid", "We are still confirming your payment.");

  const { error } = await sb.from("order_usage").upsert(
    {
      order_id: orderId,
      uses: answer.answer.uses,
      other_text: answer.answer.other,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "order_id" }
  );
  if (error) {
    console.error("[billing/usage] save failed", error.message);
    return fail(503, "save_failed", "We could not save that just now. Please try again.");
  }
  return json({ ok: true });
}
