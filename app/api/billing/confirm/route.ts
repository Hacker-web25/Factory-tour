/**
 * POST /api/billing/confirm
 *
 * The browser calls this the instant Razorpay's checkout closes, so the
 * success page can say "your workspace is ready" rather than "we are
 * waiting for confirmation".
 *
 * It is a convenience, never the authority. Even so it is defended as if
 * it were:
 *
 *   1. The body is size-capped while it is read, and every id is
 *      shape-checked before it touches a query.
 *   2. The (order_id|payment_id) pair must carry a valid HMAC signature
 *      that only Razorpay and this server can produce.
 *   3. The order row must be the one that owns that Razorpay order id.
 *   4. We do NOT trust the browser for the amount or the status. We ask
 *      Razorpay for the payment ourselves, then hand it to settlePayment(),
 *      which applies the same exact-amount / captured-only rules as the
 *      webhook, under the same database lock.
 *
 * If Razorpay cannot be reached, or the payment is not captured yet, we
 * answer "processing" and the webhook / status poll finish the job. A
 * double-click, a retry, or the webhook racing this call all end in the
 * same single fulfilment (see billing_record_payment / _claim_fulfilment).
 *
 * Request  { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * Response { ok, status, slug?, invoiceNo? }
 *          status: ready | processing | failed | refunded | review
 */

import { getClientIp } from "@/lib/getClientIp";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fetchRazorpayPayment, verifyCheckoutSignature } from "@/lib/server/razorpay";
import { settlePayment, publicOrderStatus } from "@/lib/server/payments";
import { UUID_RE, billingRateLimit, fail, json, readJson } from "@/lib/server/billingGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RZP_ORDER = /^order_[A-Za-z0-9]{6,40}$/;
const RZP_PAYMENT = /^pay_[A-Za-z0-9]{6,40}$/;
const SIGNATURE = /^[a-f0-9]{64}$/i;

export async function POST(req: Request) {
  const sb = supabaseAdmin();
  if (!sb) return fail(503, "payments_unavailable");

  const ip = getClientIp(req.headers);
  const rl = await billingRateLimit(sb, `billing-confirm:ip:${ip}`, 40, 3600);
  if (!rl.allowed) {
    return fail(429, "rate_limited", undefined, { "Retry-After": String(rl.retryAfter || 60) });
  }

  const parsed = await readJson(req, 4096);
  if (!parsed.ok) return fail(parsed.status, parsed.error);
  const body = parsed.body;

  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  const razorpayOrderId = typeof body.razorpay_order_id === "string" ? body.razorpay_order_id : "";
  const razorpayPaymentId = typeof body.razorpay_payment_id === "string" ? body.razorpay_payment_id : "";
  const signature = typeof body.razorpay_signature === "string" ? body.razorpay_signature : "";

  if (!UUID_RE.test(orderId)) return fail(400, "bad_order");
  if (!RZP_ORDER.test(razorpayOrderId)) return fail(400, "bad_order_id");
  if (!RZP_PAYMENT.test(razorpayPaymentId)) return fail(400, "bad_payment_id");
  if (!SIGNATURE.test(signature)) return fail(400, "bad_signature_format");

  // A second, tighter bucket per order: a card-testing bot hammering one
  // order id cannot use the callback as an oracle.
  const perOrder = await billingRateLimit(sb, `billing-confirm:order:${orderId}`, 20, 600);
  if (!perOrder.allowed) {
    return fail(429, "rate_limited", undefined, { "Retry-After": String(perOrder.retryAfter || 60) });
  }

  if (!verifyCheckoutSignature({ razorpayOrderId, razorpayPaymentId, signature })) {
    return fail(400, "signature_mismatch");
  }

  // The order must be the one this Razorpay order was created for.
  const { data: order, error: orderErr } = await sb
    .from("billing_orders")
    .select("id, razorpay_order_id")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr) return fail(503, "temporarily_unavailable");
  if (!order || order.razorpay_order_id !== razorpayOrderId) return fail(400, "order_mismatch");

  // Ask Razorpay what really happened. The browser is not a witness.
  const payment = await fetchRazorpayPayment(razorpayPaymentId);
  if (!payment) {
    // Razorpay unreachable or the payment not visible yet. Money is safe:
    // the webhook (and the status poll) will settle it.
    return json({ ok: true, status: "processing" });
  }
  if (payment.order_id !== razorpayOrderId) return fail(400, "payment_order_mismatch");

  try {
    await settlePayment(payment, "checkout_callback", true);
  } catch (e) {
    // Do not leak internals; the webhook retries and the poll re-syncs.
    console.error("[billing/confirm] settle failed", (e as Error).message);
    return json({ ok: true, status: "processing" });
  }

  const st = await publicOrderStatus(sb, orderId);
  const status =
    st.status === "ready" || st.status === "failed" || st.status === "refunded" || st.status === "review"
      ? st.status
      : "processing";

  return json({
    ok: true,
    status,
    slug: st.slug ?? null,
    invoiceNo: st.invoiceNo ?? null,
  });
}
