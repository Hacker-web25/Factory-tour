/**
 * GET /api/billing/status?orderId=<uuid>
 *
 * What the checkout page polls after the customer pays (or after the
 * page is reloaded mid-purchase). It answers the one question the
 * customer cares about — "is my workspace ready?" — and it also HEALS:
 *
 *   • order still unpaid on our side  → ask Razorpay what it holds for the
 *     order (throttled) and settle a captured payment. This is what saves
 *     the customer who paid, then lost the connection before the browser
 *     callback, while the webhook is delayed.
 *   • order paid but not yet built     → run fulfilment (idempotent, claimed
 *     under a database lock, so many pollers never build twice).
 *
 * The order id is a random UUID the customer received when the order was
 * created; it is the capability to ask. The response is deliberately
 * minimal: a status word, the workspace slug and the invoice number.
 */

import { getClientIp } from "@/lib/getClientIp";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fulfilOrder, MAX_AUTO_ATTEMPTS } from "@/lib/server/fulfilment";
import { publicOrderStatus, syncOrderFromRazorpay } from "@/lib/server/payments";
import { UUID_RE, billingRateLimit, fail, json } from "@/lib/server/billingGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const sb = supabaseAdmin();
  if (!sb) return fail(503, "payments_unavailable");

  const url = new URL(req.url);
  const orderId = url.searchParams.get("orderId") ?? "";
  if (!UUID_RE.test(orderId)) return fail(400, "bad_order");

  const ip = getClientIp(req.headers);
  const ipLimit = await billingRateLimit(sb, `billing-status:ip:${ip}`, 600, 3600);
  if (!ipLimit.allowed) {
    return fail(429, "rate_limited", undefined, { "Retry-After": String(ipLimit.retryAfter || 60) });
  }
  const orderLimit = await billingRateLimit(sb, `billing-status:order:${orderId}`, 120, 600);
  if (!orderLimit.allowed) {
    return fail(429, "rate_limited", undefined, { "Retry-After": String(orderLimit.retryAfter || 30) });
  }

  const { data: order, error } = await sb
    .from("billing_orders")
    .select("id, status, razorpay_order_id, provisioned_at, fulfilment_attempts, review_flag")
    .eq("id", orderId)
    .maybeSingle();
  if (error) return fail(503, "temporarily_unavailable");
  if (!order) return json({ ok: true, status: "unknown" });

  try {
    if (order.status === "paid" && !order.provisioned_at && !order.review_flag) {
      // Paid but not built: a crash, or a webhook that is still on its way.
      if (Number(order.fulfilment_attempts) < MAX_AUTO_ATTEMPTS) {
        await fulfilOrder(order.id as string);
      }
    } else if (order.status === "created" && order.razorpay_order_id) {
      // Not paid as far as we know. Ask Razorpay — at most once every 5 s per order.
      const gate = await billingRateLimit(sb, `billing-status-sync:${orderId}`, 1, 5);
      if (gate.allowed) {
        const synced = await syncOrderFromRazorpay(order.razorpay_order_id as string, "status_poll");
        void synced;
      }
    }
  } catch (e) {
    // Healing is best-effort; the daily reconciler is the backstop.
    console.error("[billing/status] heal failed", (e as Error).message);
  }

  const st = await publicOrderStatus(sb, orderId);
  return json({
    ok: true,
    status: st.status,
    purpose: st.purpose ?? null,
    slug: st.slug ?? null,
    invoiceNo: st.invoiceNo ?? null,
  });
}
