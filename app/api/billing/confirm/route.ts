/**
 * POST /api/billing/confirm
 *
 * The browser calls this the instant Razorpay's checkout closes, so the
 * success page can say "your workspace is ready" rather than "we are
 * waiting for confirmation".
 *
 * It is NOT trusted on its own. The three ids it receives are checked
 * against an HMAC signature that only Razorpay and our server can
 * produce, and the amount is still verified against the order we
 * created. If the signature does not match, nothing happens and the
 * customer simply waits for the webhook, which is the real authority.
 *
 * Request  { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * Response { ok, status, slug?, invoiceNo? }
 */

import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/getClientIp";
import { verifyCheckoutSignature } from "@/lib/server/razorpay";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fulfilOrder, recordPayment } from "@/lib/server/fulfilment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const ip = getClientIp(req.headers);
  const rl = await enforceRateLimit(`billing-confirm:ip:${ip}`, 30, 3600);
  if (!rl.allowed) return fail(429, "rate_limited");

  if (Number(req.headers.get("content-length") || "0") > 4096) return fail(413, "payload_too_large");

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail(400, "bad_payload");
  }

  const orderId = String(body.orderId ?? "");
  const razorpayOrderId = String(body.razorpay_order_id ?? "");
  const razorpayPaymentId = String(body.razorpay_payment_id ?? "");
  const signature = String(body.razorpay_signature ?? "");

  if (!/^order_[A-Za-z0-9]+$/.test(razorpayOrderId)) return fail(400, "bad_order_id");
  if (!/^pay_[A-Za-z0-9]+$/.test(razorpayPaymentId)) return fail(400, "bad_payment_id");
  if (!/^[a-f0-9]{64}$/i.test(signature)) return fail(400, "bad_signature_format");

  if (!verifyCheckoutSignature({ razorpayOrderId, razorpayPaymentId, signature })) {
    return fail(400, "signature_mismatch");
  }

  const sb = supabaseAdmin();
  if (!sb) return fail(503, "payments_unavailable");

  // The order must be the one this browser actually opened.
  const { data: order } = await sb
    .from("billing_orders")
    .select("id, amount_paise, razorpay_order_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.razorpay_order_id !== razorpayOrderId) return fail(400, "order_mismatch");

  const recorded = await recordPayment({
    razorpayOrderId,
    razorpayPaymentId,
    amountPaise: Number(order.amount_paise),
    status: "captured",
    source: "checkout_callback",
    signatureVerified: true,
  });
  if (!recorded.ok || !recorded.orderId) return fail(400, recorded.error ?? "not_recorded");

  const result = await fulfilOrder(recorded.orderId);

  return NextResponse.json(
    {
      ok: result.ok,
      status: result.ok ? "ready" : "pending",
      slug: result.slug ?? null,
      invoiceNo: result.invoiceNo ?? null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
