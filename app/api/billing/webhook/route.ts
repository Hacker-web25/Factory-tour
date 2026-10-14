/**
 * POST /api/billing/webhook   —  Razorpay's server talking to ours.
 *
 * This is the SOURCE OF TRUTH for every payment. The browser callback
 * in /api/billing/confirm exists only to make the success page fast; if
 * the customer closes the tab the moment they pay, this route still
 * runs, the workspace is still created and the invoice still goes out.
 *
 * Four things make it safe:
 *
 *   1. SIGNATURE. Razorpay signs the raw body with a secret only the two
 *      of us know. We verify it before reading a single field, so a
 *      stranger cannot POST themselves a free workspace. Note the body
 *      is read as TEXT — re-serialising parsed JSON would change the
 *      bytes and break a valid signature.
 *   2. IDEMPOTENCY. Every event id is written to billing_webhook_events
 *      with a unique index. A retry (Razorpay retries for 24 hours)
 *      finds the row and stops.
 *   3. AMOUNT CHECK. recordPayment() refuses to fulfil unless the
 *      captured amount equals the amount we created the order for.
 *   4. ALWAYS 200. We acknowledge anything correctly signed, even if
 *      our own processing then fails, so Razorpay does not retry
 *      forever on a bug our side. Failures are stored on the event row
 *      and visible in the admin screen.
 *
 * Razorpay dashboard → Settings → Webhooks:
 *   URL     https://myvpv.com/api/billing/webhook
 *   Secret  the value of RAZORPAY_WEBHOOK_SECRET
 *   Events  payment.captured, payment.failed, order.paid, refund.processed
 */

import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/server/razorpay";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fulfilOrder, recordPayment } from "@/lib/server/fulfilment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;

export async function POST(req: Request) {
  if (Number(req.headers.get("content-length") || "0") > MAX_BODY_BYTES) {
    return new NextResponse("too large", { status: 413 });
  }

  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(raw, signature)) {
    // No detail in the response: an attacker learns nothing from us.
    return new NextResponse("invalid signature", { status: 400 });
  }

  const sb = supabaseAdmin();
  if (!sb) return new NextResponse("not configured", { status: 503 });

  let event: Record<string, any>;
  try {
    event = JSON.parse(raw);
  } catch {
    return new NextResponse("bad json", { status: 400 });
  }

  const eventType: string = event?.event ?? "unknown";
  // Razorpay's own event id header; fall back to a stable hash of the
  // payment id so an event without the header still de-duplicates.
  const eventId =
    req.headers.get("x-razorpay-event-id") ||
    `${eventType}:${event?.payload?.payment?.entity?.id ?? ""}:${event?.created_at ?? ""}`;

  // ── Idempotency gate ────────────────────────────────────────────
  const { error: insertErr } = await sb.from("billing_webhook_events").insert({
    event_id: eventId,
    event_type: eventType,
    payload: event,
  });
  if (insertErr) {
    // Unique violation → we have already handled this one.
    return NextResponse.json({ ok: true, duplicate: true });
  }

  let processingError: string | null = null;

  try {
    const payment = event?.payload?.payment?.entity;

    if (
      (eventType === "payment.captured" || eventType === "order.paid" || eventType === "payment.failed") &&
      payment?.order_id &&
      payment?.id
    ) {
      const result = await recordPayment({
        razorpayOrderId: String(payment.order_id),
        razorpayPaymentId: String(payment.id),
        amountPaise: Number(payment.amount ?? 0),
        status: String(payment.status ?? ""),
        method: payment.method ?? null,
        bank: payment.bank ?? null,
        wallet: payment.wallet ?? null,
        vpa: payment.vpa ?? null,
        cardLast4: payment.card?.last4 ?? null,
        feePaise: typeof payment.fee === "number" ? payment.fee : null,
        taxPaise: typeof payment.tax === "number" ? payment.tax : null,
        source: "webhook",
        signatureVerified: true,
        errorCode: payment.error_code ?? null,
        errorDescription: payment.error_description ?? null,
      });

      if (result.ok && result.orderId) {
        const fulfilled = await fulfilOrder(result.orderId);
        if (!fulfilled.ok && !fulfilled.alreadyDone) {
          processingError = fulfilled.error ?? "fulfilment_failed";
        }
      } else if (result.error && result.error !== "payment_not_captured") {
        processingError = result.error;
      }
    } else if (eventType.startsWith("refund.")) {
      const refund = event?.payload?.refund?.entity;
      if (refund?.payment_id) {
        const { data: pay } = await sb
          .from("billing_payments")
          .select("order_id")
          .eq("razorpay_payment_id", String(refund.payment_id))
          .maybeSingle();
        if (pay?.order_id) {
          await sb
            .from("billing_orders")
            .update({ status: "refunded", updated_at: new Date().toISOString() })
            .eq("id", pay.order_id);
        }
      }
    }
  } catch (e) {
    processingError = e instanceof Error ? e.message : "unhandled";
  }

  await sb
    .from("billing_webhook_events")
    .update({
      processed_at: new Date().toISOString(),
      error: processingError ? processingError.slice(0, 500) : null,
    })
    .eq("event_id", eventId);

  // Always acknowledge a correctly signed event.
  return NextResponse.json({ ok: true });
}
