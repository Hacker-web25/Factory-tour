/**
 * Turning a Razorpay payment (or refund, or dispute) into state. SERVER ONLY.
 *
 * Every path that learns about a payment — the signed webhook, the
 * customer's browser callback, the status poll, the daily reconciler —
 * funnels through `settlePayment()`. It never decides anything itself:
 * the database function billing_record_payment() does that under a row
 * lock, so however many of those paths fire at once the answer is the
 * same and the customer is built exactly once.
 *
 * Possible outcomes of recording a payment:
 *
 *   paid             captured, amount + currency exact → fulfil the order
 *   failed           the attempt failed; the order stays open for a retry
 *   not_captured     authorized/created only — grants NOTHING yet
 *   amount_mismatch  money differs from what we asked for → flag, alert,
 *                    do NOT fulfil
 *   duplicate        a second payment captured on an already-settled (or
 *                    already-refunded) order, or a second licence for a buyer
 *                    who already has one → refund it automatically
 *   already_refunded the order was refunded before this arrived
 *   order_not_found  not ours (or not yet written) → ignored
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  fetchRazorpayOrderPayments,
  fetchRazorpayPayment,
  refundRazorpayPayment,
  type RzpPayment,
} from "@/lib/server/razorpay";
import { fulfilOrder, sendPendingEmails, type FulfilResult } from "@/lib/server/fulfilment";
import { alertFounders, sendRefundEmail } from "@/lib/server/billingEmails";
import { fromPaise } from "@/lib/pricing";

export type PaymentSource = "webhook" | "checkout_callback" | "reconcile" | "status_poll";

export type SettleResult = {
  outcome:
    | "paid"
    | "failed"
    | "not_captured"
    | "amount_mismatch"
    | "duplicate"
    | "already_refunded"
    | "order_not_found";
  orderId?: string;
  fulfil?: FulfilResult;
  /** Worth another delivery attempt (Razorpay retries a 5xx). */
  retriable: boolean;
  error?: string;
};

export async function settlePayment(
  incoming: RzpPayment,
  source: PaymentSource,
  signatureVerified: boolean
): Promise<SettleResult> {
  const sb = supabaseAdmin();
  if (!sb) throw new Error("billing_not_configured");
  if (!incoming?.id || !incoming.order_id) {
    return { outcome: "order_not_found", retriable: false, error: "payment_without_order" };
  }

  let payment = incoming;
  // A webhook is a snapshot taken when the event was created, and events can be
  // delivered late or out of order: a "captured" snapshot may arrive AFTER the
  // money was refunded. Before granting anything, ask Razorpay what is true now.
  // (The browser callback and the status/daily sweeps already read it live.)
  if (source === "webhook" && incoming.status === "captured") {
    // Another product on the same Razorpay account? Nothing of ours to protect.
    const { data: ours } = await sb
      .from("billing_orders")
      .select("id")
      .eq("razorpay_order_id", incoming.order_id)
      .maybeSingle();
    if (!ours) return { outcome: "order_not_found", retriable: false };
    const live = await fetchRazorpayPayment(incoming.id);
    if (!live) throw new Error("payment_lookup_failed"); // the webhook is answered 5xx and retried
    payment = {
      ...incoming,
      status: live.status,
      amount: live.amount,
      currency: live.currency,
      captured: live.captured ?? incoming.captured,
      order_id: live.order_id ?? incoming.order_id,
    };
  }

  const { data, error } = await sb.rpc("billing_record_payment", {
    p_razorpay_order_id: payment.order_id,
    p_payment_id: payment.id,
    p_amount_paise: Number(payment.amount),
    p_currency: payment.currency,
    p_status: payment.status,
    p_method: payment.method ?? null,
    p_bank: payment.bank ?? null,
    p_wallet: payment.wallet ?? null,
    p_vpa: payment.vpa ?? null,
    p_card_last4: payment.card?.last4 ?? null,
    p_fee_paise: typeof payment.fee === "number" ? payment.fee : null,
    p_tax_paise: typeof payment.tax === "number" ? payment.tax : null,
    p_source: source,
    p_signature_verified: signatureVerified,
    p_error_code: payment.error_code ?? null,
    p_error_description: payment.error_description ?? null,
  });
  if (error || !data) throw new Error(`record_payment_failed: ${error?.message ?? "no data"}`);

  const rec = data as { outcome: SettleResult["outcome"]; order_id?: string; payment_id?: string; reason?: string };
  const orderId = rec.order_id;

  switch (rec.outcome) {
    case "paid": {
      const fulfil = await fulfilOrder(orderId as string);
      return {
        outcome: "paid",
        orderId,
        fulfil,
        // A fulfilment that failed or is mid-flight is worth another delivery.
        retriable: !fulfil.ok && fulfil.retriable === true,
        error: fulfil.ok ? undefined : fulfil.error,
      };
    }

    case "amount_mismatch":
      await alertFounders(sb, {
        kind: "amount_mismatch",
        severity: "critical",
        orderId,
        detail: `Razorpay captured ${payment.amount} ${payment.currency} but the order expected a different amount. Nothing was fulfilled. Payment ${payment.id} needs a manual decision (refund, or accept and set the order up by hand).`,
      });
      return { outcome: "amount_mismatch", orderId, retriable: false, error: "amount_mismatch" };

    case "duplicate": {
      await refundDuplicate(sb, orderId as string, payment, (rec as { reason?: string }).reason);
      return { outcome: "duplicate", orderId, retriable: false };
    }

    case "failed":
    case "not_captured":
    case "already_refunded":
    case "order_not_found":
      return { outcome: rec.outcome, orderId, retriable: false };

    default:
      return { outcome: "order_not_found", retriable: false, error: "unknown_outcome" };
  }
}

/**
 * The customer was charged for something we cannot (or must not) build:
 * a second capture on one order, a capture after the order was refunded, or
 * a second licence for a buyer who already has one. Refund the extra charge
 * right away. The idempotency key means a retry (after a timeout, say) can
 * never refund twice, and if Razorpay already shows it refunded we just record that.
 */
async function refundDuplicate(
  sb: SupabaseClient,
  orderId: string,
  payment: RzpPayment,
  reason?: string
): Promise<void> {
  const why =
    reason === "order_already_refunded"
      ? "was captured after its order had already been refunded"
      : reason === "buyer_already_has_licence"
        ? "is a second licence payment for a buyer who already has a paid licence"
        : "was captured on an order that was already paid";
  await alertFounders(sb, {
    kind: "duplicate_payment",
    severity: "warning",
    orderId,
    detail: `Payment ${payment.id} ${why}. It is being refunded automatically; the customer's original purchase is untouched.`,
  });

  // Already refunded at the gateway (for example by hand in the dashboard)? Then
  // there is nothing to send — a second refund would only be rejected.
  const live = await fetchRazorpayPayment(payment.id);
  if (live && (live.status === "refunded" || Number(live.amount_refunded ?? 0) >= Number(live.amount))) {
    await sb
      .from("billing_payments")
      .update({ refund_requested_at: new Date().toISOString(), status: "duplicate_refunded" })
      .eq("razorpay_payment_id", payment.id);
    return;
  }

  try {
    await refundRazorpayPayment({
      paymentId: payment.id,
      amountPaise: Number(payment.amount),
      idempotencyKey: `dup_${payment.id}`,
      notes: { reason: "duplicate_payment", vpv_order_id: orderId },
    });
    await sb
      .from("billing_payments")
      .update({ refund_requested_at: new Date().toISOString() })
      .eq("razorpay_payment_id", payment.id);
  } catch (e) {
    await alertFounders(sb, {
      kind: "duplicate_refund_failed",
      severity: "critical",
      orderId,
      detail: `Automatic refund of duplicate payment ${payment.id} FAILED (${(e as Error).message}). Refund it in the Razorpay dashboard.`,
    });
    throw e; // retriable: the webhook is answered 5xx so Razorpay retries
  }
}

/* ───────────────────── asking Razorpay what it holds ─────────────── */

/**
 * Pull every payment Razorpay holds for an order and settle the captured
 * ones. This is the self-healing path for "the webhook never arrived":
 * used by the status poll and by the daily reconciler.
 */
export async function syncOrderFromRazorpay(
  razorpayOrderId: string,
  source: "status_poll" | "reconcile"
): Promise<{ checked: boolean; settled: number }> {
  const payments = await fetchRazorpayOrderPayments(razorpayOrderId);
  if (payments === null) return { checked: false, settled: 0 };
  let settled = 0;
  // Oldest first, so the first capture is the one that settles the order.
  const ordered = [...payments].sort(
    (a, b) => Number((a as { created_at?: number }).created_at ?? 0) - Number((b as { created_at?: number }).created_at ?? 0)
  );
  for (const p of ordered) {
    if (p.status !== "captured") continue;
    const r = await settlePayment({ ...p, order_id: p.order_id ?? razorpayOrderId }, source, false);
    if (r.outcome === "paid") settled += 1;
  }
  return { checked: true, settled };
}

/* ─────────────────────── refunds & chargebacks ───────────────────── */

export type RefundEntity = {
  id: string;
  payment_id: string;
  amount: number;
  status?: string;
  notes?: Record<string, unknown> | null;
};

/**
 * Apply a refund (or a lost chargeback). Fully refunded orders are closed
 * and what they bought is taken back; every processed refund gets a GST
 * credit note, e-mailed to the customer.
 */
export async function applyRefundEvent(args: {
  refundId: string;
  paymentId: string;
  amountPaise: number;
  status: "created" | "processed" | "failed";
  kind: "refund" | "chargeback";
  reason?: string | null;
  /** Internal: set on the single re-run after we recorded a payment we had not heard about. */
  _again?: boolean;
}): Promise<{ retriable: boolean; outcome: string }> {
  const sb = supabaseAdmin();
  if (!sb) throw new Error("billing_not_configured");

  const { data, error } = await sb.rpc("billing_apply_refund", {
    p_refund_id: args.refundId,
    p_payment_id: args.paymentId,
    p_amount: args.amountPaise,
    p_status: args.status,
    p_kind: args.kind,
    p_reason: args.reason ?? null,
  });
  if (error || !data) throw new Error(`apply_refund_failed: ${error?.message ?? "no data"}`);

  const r = data as {
    outcome: string;
    order_id?: string;
    buyer_email?: string;
    buyer_name?: string;
    purpose?: string;
    fully_refunded?: boolean;
    credit_note_no?: string | null;
    credit_note_new?: boolean;
    refund_row_id?: string;
    refunded_paise?: number;
    order_paise?: number;
    over_refunded?: boolean;
  };

  if (r.outcome === "payment_not_found" && !args._again) {
    // Either a refund on another product of the same Razorpay account, or — more
    // dangerous — OUR payment whose "captured" event has not reached us yet (events
    // can arrive out of order). Ask Razorpay which it is; never just drop it.
    const live = await fetchRazorpayPayment(args.paymentId);
    if (!live) return { retriable: true, outcome: "payment_lookup_failed" };
    if (!live.order_id) return { retriable: false, outcome: r.outcome };
    const { data: ours } = await sb
      .from("billing_orders")
      .select("id")
      .eq("razorpay_order_id", live.order_id)
      .maybeSingle();
    if (!ours) return { retriable: false, outcome: r.outcome };
    // Record the payment first (and serve it if it really is captured), then apply the refund.
    await settlePayment(live, "reconcile", false);
    return applyRefundEvent({ ...args, _again: true });
  }
  if (r.outcome === "payment_not_found" || r.outcome === "order_not_found") {
    return { retriable: false, outcome: r.outcome };
  }

  if (r.outcome === "processed") {
    await alertFounders(sb, {
      kind: args.kind === "chargeback" ? "chargeback_lost" : r.fully_refunded ? "refund_full" : "refund_partial",
      severity: args.kind === "chargeback" ? "critical" : "info",
      orderId: r.order_id,
      detail:
        args.kind === "chargeback"
          ? `A chargeback was LOST for ₹${fromPaise(args.amountPaise)}. The order has been closed and its access removed.`
          : r.fully_refunded
            ? `Order refunded in full (₹${fromPaise(args.amountPaise)}). The workspace purchase has been reversed and a credit note issued.`
            : `Partial refund of ₹${fromPaise(args.amountPaise)} recorded (₹${fromPaise(r.refunded_paise ?? 0)} of ₹${fromPaise(r.order_paise ?? 0)}). Nothing was revoked.`,
    });

    if (r.over_refunded) {
      await alertFounders(sb, {
        kind: "refund_exceeds_order",
        severity: "critical",
        orderId: r.order_id,
        detail: `Refunds and chargebacks on this order now total ₹${fromPaise(r.refunded_paise ?? 0)}, more than the ₹${fromPaise(r.order_paise ?? 0)} the customer paid. The extra credit was NOT put on a credit note. Check the Razorpay dashboard — the customer may have been refunded twice.`,
      });
    }

    if (r.credit_note_new && r.buyer_email) {
      const ok = await sendRefundEmail({
        to: r.buyer_email,
        name: r.buyer_name ?? "",
        amountInr: fromPaise(args.amountPaise),
        creditNoteNo: r.credit_note_no ?? null,
        fullyRefunded: Boolean(r.fully_refunded),
        purpose: r.purpose ?? "",
      });
      if (ok && r.refund_row_id) {
        await sb
          .from("billing_credit_notes")
          .update({ emailed_at: new Date().toISOString() })
          .eq("refund_id", r.refund_row_id);
      }
    }
  } else if (args.status === "failed") {
    await alertFounders(sb, {
      kind: "refund_failed",
      severity: "critical",
      orderId: r.order_id,
      detail: `Razorpay reports refund ${args.refundId} FAILED. Check the Razorpay dashboard.`,
    });
  }
  return { retriable: false, outcome: r.outcome };
}

/**
 * A credit note is a tax document: the customer must receive it even if the
 * e-mail provider was down when the refund landed. Claimed first (so two
 * overlapping runs cannot both send), handed back if the send fails.
 */
export async function sendPendingCreditNotes(limit = 25): Promise<number> {
  const sb = supabaseAdmin();
  if (!sb) return 0;
  const { data: notes } = await sb
    .from("billing_credit_notes")
    .select("id, order_id, credit_note_no, total_paise")
    .is("emailed_at", null)
    .lt("issued_at", new Date(Date.now() - 2 * 60_000).toISOString())
    .gt("issued_at", new Date(Date.now() - 14 * 24 * 3600_000).toISOString())
    .order("issued_at", { ascending: true })
    .limit(limit);

  let sent = 0;
  for (const n of notes ?? []) {
    if (!n.order_id) continue;
    const { data: claimed } = await sb
      .from("billing_credit_notes")
      .update({ emailed_at: new Date().toISOString() })
      .eq("id", n.id as string)
      .is("emailed_at", null)
      .select("id");
    if (!claimed || claimed.length === 0) continue; // someone else has it

    let ok = false;
    try {
      const { data: o } = await sb
        .from("billing_orders")
        .select("buyer_email, buyer_name, purpose, status")
        .eq("id", n.order_id as string)
        .maybeSingle();
      if (o) {
        ok = await sendRefundEmail({
          to: o.buyer_email as string,
          name: (o.buyer_name as string) ?? "",
          amountInr: fromPaise(Number(n.total_paise)),
          creditNoteNo: n.credit_note_no as string,
          fullyRefunded: o.status === "refunded",
          purpose: (o.purpose as string) ?? "",
        });
      }
    } catch {
      ok = false;
    }
    if (ok) sent += 1;
    else await sb.from("billing_credit_notes").update({ emailed_at: null }).eq("id", n.id as string);
  }
  return sent;
}

/* ───────────────────────── status for the browser ────────────────── */

export type PublicOrderStatus = {
  status: "unknown" | "awaiting_payment" | "processing" | "ready" | "failed" | "refunded" | "review";
  slug?: string;
  invoiceNo?: string;
  purpose?: string;
};

/** What the checkout page may learn about an order. Deliberately minimal. */
export async function publicOrderStatus(sb: SupabaseClient, orderId: string): Promise<PublicOrderStatus> {
  const { data: o } = await sb
    .from("billing_orders")
    .select("id, status, purpose, provisioned_at, org_id, review_flag")
    .eq("id", orderId)
    .maybeSingle();
  if (!o) return { status: "unknown" };

  if (o.status === "refunded") return { status: "refunded", purpose: o.purpose as string };
  if (o.review_flag) return { status: "review", purpose: o.purpose as string };
  if (o.provisioned_at) {
    const [{ data: org }, { data: inv }] = await Promise.all([
      o.org_id
        ? sb.from("organizations").select("slug").eq("id", o.org_id).maybeSingle()
        : Promise.resolve({ data: null }),
      sb.from("billing_invoices").select("invoice_no").eq("order_id", orderId).maybeSingle(),
    ]);
    return {
      status: "ready",
      purpose: o.purpose as string,
      slug: (org?.slug as string) ?? undefined,
      invoiceNo: (inv?.invoice_no as string) ?? undefined,
    };
  }
  if (o.status === "paid") return { status: "processing", purpose: o.purpose as string };
  if (o.status === "failed" || o.status === "cancelled") return { status: "failed", purpose: o.purpose as string };
  return { status: "awaiting_payment", purpose: o.purpose as string };
}

export { sendPendingEmails };
