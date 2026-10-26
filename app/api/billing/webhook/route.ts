/**
 * POST /api/billing/webhook   —  Razorpay's server talking to ours.
 *
 * This is the SOURCE OF TRUTH for every payment. The browser callback
 * (/api/billing/confirm) only makes the success page quick; if the
 * customer closes the tab the instant they pay, this route still builds
 * the workspace and sends the invoice.
 *
 *   1. SIGNATURE FIRST. The HMAC over the raw body is checked before the
 *      body is parsed and before the database is touched, so a stranger
 *      can neither forge a payment nor make us do work.
 *   2. LEDGER, NOT A FLAG. Each event id goes into billing_webhook_events.
 *      A finished event is acknowledged and skipped; an event whose
 *      processing FAILED is left open, so Razorpay's retry (it retries
 *      non-2xx responses for 24 hours) picks it up again. The old
 *      "always answer 200" behaviour silently lost payments whenever
 *      processing hit a transient error.
 *   3. THE DATABASE DECIDES. All money state changes run through
 *      settlePayment() / applyRefundEvent() → row-locked SQL functions,
 *      so two deliveries of the same event, or this route racing the
 *      browser callback, cannot double-build a customer or double-invoice.
 *   4. POISON PROTECTION. An event that fails again and again is
 *      eventually acknowledged (and the founders alerted) so Razorpay
 *      does not disable the endpoint over one bad event. The daily
 *      reconciler still repairs the order from Razorpay's own records.
 *
 * Razorpay dashboard → Settings → Webhooks:
 *   URL     https://myvpv.com/api/billing/webhook
 *   Secret  the value of RAZORPAY_WEBHOOK_SECRET (use 30+ random chars)
 *   Events  payment.authorized, payment.captured, payment.failed, order.paid,
 *           refund.created, refund.processed, refund.failed,
 *           payment.dispute.created, payment.dispute.won,
 *           payment.dispute.lost, payment.dispute.closed
 */

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { verifyWebhookSignature, webhookSecretConfigured, type RzpPayment } from "@/lib/server/razorpay";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { applyRefundEvent, settlePayment } from "@/lib/server/payments";
import { alertFounders } from "@/lib/server/billingEmails";
import { readBody } from "@/lib/server/billingGuard";
import { fromPaise } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = 256 * 1024;
/** After this many failed deliveries we stop asking Razorpay to retry. */
const MAX_DELIVERY_ATTEMPTS = 8;

const NO_STORE = { "Cache-Control": "no-store" };
const text = (body: string, status: number) => new NextResponse(body, { status, headers: NO_STORE });
const ok = (extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: true, ...extra }, { headers: NO_STORE });

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

class Retriable extends Error {}

export async function POST(req: Request) {
  // No (or a weak) webhook secret means we cannot tell Razorpay from an attacker.
  // Say "not ready" (5xx → Razorpay retries once it is fixed) rather than guessing.
  if (!webhookSecretConfigured()) {
    console.error("[billing/webhook] RAZORPAY_WEBHOOK_SECRET is missing or shorter than 20 characters");
    return text("webhook not configured", 503);
  }

  const body = await readBody(req, MAX_BODY_BYTES);
  if (!body.ok) return text(body.error, body.status);
  const raw = body.text;

  // 1 — authenticity, before anything else. No detail is returned.
  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature"))) {
    return text("invalid signature", 400);
  }

  let event: Json;
  try {
    event = JSON.parse(raw);
  } catch {
    return text("bad json", 400);
  }
  if (!event || typeof event !== "object" || Array.isArray(event)) return text("bad json", 400);

  const sb = supabaseAdmin();
  if (!sb) return text("not configured", 503); // 5xx → Razorpay retries later

  const eventType = typeof event.event === "string" ? event.event.slice(0, 80) : "unknown";
  // Razorpay's own id when present; otherwise the hash of the exact bytes,
  // so a replay of the same body can never be processed twice.
  const headerId = (req.headers.get("x-razorpay-event-id") || "").trim();
  const eventId =
    headerId && headerId.length <= 120
      ? headerId
      : `sha256:${createHash("sha256").update(raw).digest("hex")}`;

  // 2 — the ledger.
  let begin: string;
  try {
    const { data, error } = await sb.rpc("billing_webhook_begin", {
      p_event_id: eventId,
      p_type: eventType,
      p_payload: event,
    });
    if (error || typeof data !== "string") throw new Error(error?.message ?? "no_data");
    begin = data;
  } catch (e) {
    console.error("[billing/webhook] ledger unavailable", (e as Error).message);
    return text("temporarily unavailable", 503);
  }
  if (begin === "duplicate") return ok({ duplicate: true });

  let attempts = 1;
  if (begin === "retry") {
    const { data: row } = await sb
      .from("billing_webhook_events")
      .select("attempts")
      .eq("event_id", eventId)
      .maybeSingle();
    attempts = Number(row?.attempts ?? 1);
  }

  // 3 — process.
  try {
    await processEvent(sb, eventType, event);
    await sb.rpc("billing_webhook_finish", { p_event_id: eventId, p_error: null, p_retriable: false });
    return ok();
  } catch (e) {
    const message = e instanceof Error ? e.message : "unhandled";
    // A transient problem → let Razorpay retry. A bug that never clears →
    // stop after a while, tell a human, and let the reconciler repair.
    const exhausted = attempts >= MAX_DELIVERY_ATTEMPTS;
    const retriable = !exhausted;
    await sb
      .rpc("billing_webhook_finish", { p_event_id: eventId, p_error: message, p_retriable: retriable })
      .then(() => undefined, () => undefined);
    console.error(`[billing/webhook] ${eventType} failed (attempt ${attempts}): ${message}`);
    if (exhausted) {
      await alertFounders(sb, {
        kind: "webhook_gave_up",
        severity: "critical",
        detail: `Webhook ${eventType} (${eventId}) failed ${attempts} times: ${message}. The daily reconciler will re-check the order, but look at Admin → Payments.`,
      }).catch(() => undefined);
      return ok({ gave_up: true });
    }
    return text("processing failed, retry", 500);
  }
}

/* ───────────────────────────── event handlers ────────────────────── */

async function processEvent(
  sb: NonNullable<ReturnType<typeof supabaseAdmin>>,
  eventType: string,
  event: Json
): Promise<void> {
  const entities = event?.payload ?? {};

  /* payments ------------------------------------------------------- */
  if (
    eventType === "payment.captured" ||
    eventType === "payment.authorized" ||
    eventType === "payment.failed" ||
    eventType === "order.paid"
  ) {
    const p = entities.payment?.entity;
    if (!p?.id || typeof p.id !== "string") return; // nothing we can act on
    const payment: RzpPayment = {
      id: p.id,
      order_id: typeof p.order_id === "string" ? p.order_id : (entities.order?.entity?.id ?? null),
      amount: Number(p.amount),
      currency: String(p.currency ?? ""),
      status: String(p.status ?? ""),
      captured: Boolean(p.captured),
      method: p.method ?? null,
      bank: p.bank ?? null,
      wallet: p.wallet ?? null,
      vpa: p.vpa ?? null,
      card: p.card ? { last4: p.card.last4 ?? null } : null,
      fee: typeof p.fee === "number" ? p.fee : null,
      tax: typeof p.tax === "number" ? p.tax : null,
      error_code: p.error_code ?? null,
      error_description: p.error_description ?? null,
    };
    if (!payment.order_id) return; // a payment that is not for one of our orders

    const result = await settlePayment(payment, "webhook", true);
    if (result.retriable) throw new Retriable(result.error ?? "fulfilment_retry");
    return;
  }

  /* refunds -------------------------------------------------------- */
  if (eventType === "refund.created" || eventType === "refund.processed" || eventType === "refund.failed") {
    const r = entities.refund?.entity;
    if (!r?.id || !r?.payment_id) return;
    const status = eventType === "refund.processed" ? "processed" : eventType === "refund.failed" ? "failed" : "created";
    const out = await applyRefundEvent({
      refundId: String(r.id),
      paymentId: String(r.payment_id),
      amountPaise: Number(r.amount),
      status,
      kind: "refund",
      reason: (r.notes && typeof r.notes === "object" && (r.notes as Json).reason) || null,
    });
    if (out.retriable) throw new Retriable(out.outcome);
    return;
  }

  /* disputes (chargebacks) ---------------------------------------- */
  if (eventType.startsWith("payment.dispute.")) {
    const d = entities.dispute?.entity;
    if (!d?.id) return;
    const amount = Number(d.amount ?? 0);
    if (eventType === "payment.dispute.lost" && d.payment_id) {
      // The bank took the money back: treat it exactly like a full refund
      // (access removed, credit note issued), recorded under a dispute id.
      const out = await applyRefundEvent({
        refundId: `dispute_${d.id}`,
        paymentId: String(d.payment_id),
        amountPaise: amount,
        status: "processed",
        kind: "chargeback",
        reason: "chargeback_lost",
      });
      if (out.retriable) throw new Retriable(out.outcome);
      return;
    }
    // Opened / under review / won / closed: no state change, but a human
    // must know — disputes have response deadlines.
    const sev = eventType === "payment.dispute.won" || eventType === "payment.dispute.closed" ? "info" : "critical";
    // Tie the alert to the order, so a second customer's dispute is never
    // swallowed by the first one's still-open alert.
    let disputedOrder: string | null = null;
    if (d.payment_id) {
      const { data: dp } = await sb
        .from("billing_payments")
        .select("order_id")
        .eq("razorpay_payment_id", String(d.payment_id))
        .maybeSingle();
      disputedOrder = (dp?.order_id as string) ?? null;
    }
    await alertFounders(sb, {
      kind: eventType.replace(/\./g, "_"),
      severity: sev,
      orderId: disputedOrder,
      detail: `${eventType} for payment ${d.payment_id ?? "?"}: ₹${fromPaise(amount)}. Respond in the Razorpay dashboard before the deadline${d.respond_by ? ` (${new Date(Number(d.respond_by) * 1000).toISOString().slice(0, 10)})` : ""}.`,
    });
    return;
  }

  // Anything else (payment links, settlements, …) is not ours: acknowledge.
}
