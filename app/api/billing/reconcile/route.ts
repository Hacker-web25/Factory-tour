/**
 * GET /api/billing/reconcile   —  the safety net, run by Vercel Cron.
 *
 * Everything else in the payment flow is event-driven. This is the
 * "what if every event was lost?" pass. It asks Razorpay and the database
 * what is true and repairs the difference:
 *
 *   1. paid orders that were never built      → run fulfilment again
 *   2. open orders that Razorpay says are paid → settle them (missed webhook)
 *   2b. Razorpay's own list of recent payments → any captured payment we have
 *       no record of (even on an order we closed) is settled and flagged
 *   2c. Razorpay's own list of recent refunds  → any refund we missed is applied
 *   3. built orders whose e-mails never left   → send them (and refund credit notes)
 *   4. support-year reminders due today        → send them (claimed in SQL, once each)
 *
 * Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Anyone
 * else gets a 401 and the route does no work. Every step is idempotent, so
 * running it twice (or an overlapping run) is harmless.
 */

import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fulfilOrder, sendPendingEmails, MAX_AUTO_ATTEMPTS } from "@/lib/server/fulfilment";
import {
  syncOrderFromRazorpay,
  sendPendingCreditNotes,
  settlePayment,
  applyRefundEvent,
} from "@/lib/server/payments";
import { fetchRazorpayRefund, listRazorpayPayments, listRazorpayRefunds } from "@/lib/server/razorpay";
import { alertFounders, parseReminderKind, sendSupportReminder, type ReminderKind, type ReminderScope } from "@/lib/server/billingEmails";
import { json, fail, safeEqualSecret } from "@/lib/server/billingGuard";
import { SUPPORT_ANNUAL_INR, fromPaise } from "@/lib/pricing";
import { orgSalesSeats } from "@/lib/server/salesSeats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** A refund pending longer than this is no longer "just slow". */
const STUCK_REFUND_DAYS = 10;

const BATCH = 25;
const SOFT_DEADLINE_MS = 240_000;

/**
 * The customer has been e-mailed; now tell US, while there is still time to
 * pick up the phone. The first day of the grace period is a warning, the day a
 * workspace locks (or its salespeople are switched off) is critical. One alert
 * per workspace, so two customers never hide each other.
 */
async function alertOnRenewalStage(
  sb: NonNullable<ReturnType<typeof supabaseAdmin>>,
  r: { org_name: string; slug: string; kind: string; support_until: string; due_at?: string; locks_at: string }
): Promise<void> {
  const st = parseReminderKind(r.kind);
  if (!st) return;
  const what = st.logins ? "Sales Team logins" : "support & hosting";
  const ended = (r.due_at ?? r.support_until).slice(0, 10);
  if (st.stage === "locked") {
    await alertFounders(sb, {
      kind: `${st.logins ? "logins_switched_off" : "workspace_locked"}:${r.slug}`,
      severity: "critical",
      detail: st.logins
        ? `${r.org_name} (${r.slug}) did not renew its Sales Team logins (ended ${ended}). Its salespeople are now switched off; the owner and the tours still work.`
        : `${r.org_name} (${r.slug}) did not renew support & hosting (ended ${ended}) and is now LOCKED: its dashboard and shared tours are unavailable. Their data is kept. Call them.`,
    });
  } else if (st.stage === "day" && st.day === 0) {
    await alertFounders(sb, {
      kind: `renewal_overdue:${r.slug}`,
      severity: "warning",
      detail: `${r.org_name} (${r.slug}) has not renewed ${what} (ended ${ended}). It locks on ${r.locks_at.slice(0, 10)} unless it pays. A call now is worth more than the daily e-mails.`,
    });
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const presented = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  // No secret configured → nobody is authorised (never "open by default").
  if (!secret || secret.length < 16 || !(await safeEqualSecret(presented, secret))) {
    return fail(401, "unauthorized");
  }

  const sb = supabaseAdmin();
  if (!sb) return fail(503, "payments_unavailable");

  const started = Date.now();
  const timeLeft = () => Date.now() - started < SOFT_DEADLINE_MS;
  const report = {
    fulfilled: 0,
    fulfilFailed: 0,
    synced: 0,
    emailed: 0,
    creditNotes: 0,
    reminders: 0,
    reminderFailures: 0,
    attemptsReset: 0,
    sweptPayments: 0,
    sweptRefunds: 0,
    errors: [] as string[],
  };

  /* 1 — paid but never built ------------------------------------- */
  try {
    // A short outage (database, auth, e-mail) can use up the automatic retries within a
    // minute while the customer's open tab keeps polling. Give an order that has sat
    // untouched for hours a fresh set of tries — once a day, without new alerts.
    const { data: reset } = await sb
      .from("billing_orders")
      .update({ fulfilment_attempts: 0, updated_at: new Date().toISOString() })
      .eq("status", "paid")
      .is("provisioned_at", null)
      .is("review_flag", null)
      .is("revoked_at", null)
      .gte("fulfilment_attempts", MAX_AUTO_ATTEMPTS)
      .lt("updated_at", new Date(Date.now() - 6 * 3600_000).toISOString())
      .select("id");
    report.attemptsReset = reset?.length ?? 0;

    const { data: stuck } = await sb
      .from("billing_orders")
      .select("id")
      .eq("status", "paid")
      .is("provisioned_at", null)
      .is("review_flag", null)
      .lt("fulfilment_attempts", MAX_AUTO_ATTEMPTS)
      .order("paid_at", { ascending: true })
      .limit(BATCH);
    for (const o of stuck ?? []) {
      if (!timeLeft()) break;
      const r = await fulfilOrder(o.id as string);
      if (r.ok) report.fulfilled += 1;
      else if (!r.inProgress) report.fulfilFailed += 1;
    }
  } catch (e) {
    report.errors.push(`fulfil: ${(e as Error).message}`);
  }

  /* 2 — Razorpay says paid, we never heard ----------------------- */
  try {
    const now = Date.now();
    const { data: open } = await sb
      .from("billing_orders")
      .select("id, razorpay_order_id")
      .eq("status", "created")
      .not("razorpay_order_id", "is", null)
      .lt("created_at", new Date(now - 2 * 60_000).toISOString())
      .gt("created_at", new Date(now - 3 * 24 * 3600_000).toISOString())
      .order("created_at", { ascending: true })
      .limit(BATCH * 2);
    for (const o of open ?? []) {
      if (!timeLeft()) break;
      const r = await syncOrderFromRazorpay(o.razorpay_order_id as string, "reconcile");
      report.synced += r.settled;
    }
  } catch (e) {
    report.errors.push(`sync: ${(e as Error).message}`);
  }

  /* 2b — the gateway's own list of payments, checked against ours -- */
  // The checks above only look at orders we can still see as open. This one starts from
  // what Razorpay actually collected, so money can never hide behind an order we closed
  // (or behind a pile of abandoned orders).
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const sweep = await listRazorpayPayments(nowSec - 48 * 3600, nowSec - 120);
    if (!sweep.complete) report.errors.push(`payment_sweep_incomplete(${sweep.items.length})`);
    const captured = sweep.items.filter((p) => p.status === "captured" && p.order_id);
    for (let i = 0; i < captured.length && timeLeft(); i += 100) {
      const chunk = captured.slice(i, i + 100);
      const { data: known } = await sb
        .from("billing_payments")
        .select("razorpay_payment_id, status")
        .in("razorpay_payment_id", chunk.map((p) => p.id));
      const settled = new Set(
        (known ?? [])
          .filter((k) => !["created", "authorized", "failed"].includes(String(k.status)))
          .map((k) => k.razorpay_payment_id as string)
      );
      for (const p of chunk) {
        if (!timeLeft()) break;
        if (settled.has(p.id)) continue;
        const r = await settlePayment(p, "reconcile", false);
        if (r.outcome === "order_not_found") continue; // another product on the same account
        report.sweptPayments += 1;
        await alertFounders(sb, {
          kind: "payment_recovered",
          severity: "info",
          orderId: r.orderId ?? null,
          detail: `Razorpay had captured payment ${p.id} (₹${(Number(p.amount) / 100).toFixed(2)}) that our records were missing — outcome: ${r.outcome}. It was handled automatically; this is only to tell you a webhook was lost.`,
        });
      }
    }
  } catch (e) {
    report.errors.push(`payment_sweep: ${(e as Error).message}`);
  }

  /* 2c — refunds made at Razorpay that we never heard about ---------- */
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const rs = await listRazorpayRefunds(nowSec - 48 * 3600, nowSec);
    if (!rs.complete) report.errors.push(`refund_sweep_incomplete(${rs.items.length})`);
    for (let i = 0; i < rs.items.length && timeLeft(); i += 100) {
      const chunk = rs.items.slice(i, i + 100);
      const { data: known } = await sb
        .from("billing_refunds")
        .select("razorpay_refund_id, status")
        .in("razorpay_refund_id", chunk.map((r) => r.id));
      const done = new Map((known ?? []).map((k) => [k.razorpay_refund_id as string, k.status as string]));
      for (const r of chunk) {
        if (!timeLeft()) break;
        const status = r.status === "processed" ? "processed" : r.status === "failed" ? "failed" : "created";
        if (done.get(r.id) === status || done.get(r.id) === "processed") continue;
        const out = await applyRefundEvent({
          refundId: r.id,
          paymentId: r.payment_id,
          amountPaise: Number(r.amount),
          status,
          kind: "refund",
          reason: (r.notes && typeof r.notes === "object" && (r.notes as Record<string, unknown>).reason
            ? String((r.notes as Record<string, unknown>).reason)
            : null),
        });
        if (out.outcome === "processed" || out.outcome === "recorded" || out.outcome === "duplicate_refund_recorded") {
          report.sweptRefunds += 1;
        }
      }
    }
  } catch (e) {
    report.errors.push(`refund_sweep: ${(e as Error).message}`);
  }

  /* 2d — a refund that is still "pending" ---------------------------- */
  // A refund Razorpay accepted but whose "processed" message never reached us, or one
  // the bank is slow with. Ask Razorpay what it says now; if it is still pending after
  // STUCK_REFUND_DAYS, tell a person, because the customer is waiting for their money.
  try {
    const { data: open } = await sb
      .from("billing_refunds")
      .select("razorpay_refund_id, razorpay_payment_id, order_id, amount_paise, created_at")
      .eq("status", "created")
      .eq("kind", "refund")
      .lt("created_at", new Date(Date.now() - 6 * 3600_000).toISOString())
      .order("created_at", { ascending: true })
      .limit(25);
    for (const f of open ?? []) {
      if (!timeLeft()) break;
      const live = await fetchRazorpayRefund(f.razorpay_refund_id as string);
      if (!live) continue;
      if (live.status === "processed" || live.status === "failed") {
        await applyRefundEvent({
          refundId: f.razorpay_refund_id as string,
          paymentId: f.razorpay_payment_id as string,
          amountPaise: Number(f.amount_paise),
          status: live.status === "processed" ? "processed" : "failed",
          kind: "refund",
        });
        report.sweptRefunds += 1;
        continue;
      }
      const ageDays = (Date.now() - new Date(f.created_at as string).getTime()) / 86_400_000;
      if (ageDays >= STUCK_REFUND_DAYS) {
        await alertFounders(sb, {
          kind: "refund_stuck",
          severity: "critical",
          orderId: (f.order_id as string) ?? null,
          detail: `Refund ${f.razorpay_refund_id} of ₹${fromPaise(Number(f.amount_paise))} has been pending at Razorpay for ${Math.floor(ageDays)} days. Open it in the Razorpay dashboard (Transactions → Refunds); if it is still pending, raise it with Razorpay support quoting the refund id, and tell the customer.`,
        });
      }
    }
  } catch (e) {
    report.errors.push(`refund_pending: ${(e as Error).message}`);
  }

  /* 3 — built, but a customer e-mail is missing ------------------- */
  try {
    const { data: pending } = await sb
      .from("billing_orders")
      .select("id")
      .not("provisioned_at", "is", null)
      .lt("provisioned_at", new Date(Date.now() - 2 * 60_000).toISOString())
      .gt("provisioned_at", new Date(Date.now() - 14 * 24 * 3600_000).toISOString())
      .neq("status", "refunded")
      .or("welcome_emailed_at.is.null,invoice_emailed_at.is.null")
      .limit(BATCH);
    for (const o of pending ?? []) {
      if (!timeLeft()) break;
      const r = await sendPendingEmails(o.id as string);
      if (r.welcome || r.invoice) report.emailed += 1;
    }
  } catch (e) {
    report.errors.push(`emails: ${(e as Error).message}`);
  }

  /* 3b — a refund's credit note that never reached the customer ---- */
  try {
    report.creditNotes = await sendPendingCreditNotes(BATCH);
  } catch (e) {
    report.errors.push(`credit_notes: ${(e as Error).message}`);
  }

  /* 4 — support-year reminders ------------------------------------ */
  try {
    const { data: due, error } = await sb.rpc("billing_claim_support_reminders");
    if (error) throw new Error(error.message);
    for (const r of (due ?? []) as Array<{
      org_id: string;
      org_name: string;
      slug: string;
      kind: ReminderKind;
      support_until: string;
      to_email: string;
      locks_at: string;
      scope?: ReminderScope;
      due_at?: string;
    }>) {
      let sent = false;
      try {
        const seats = await orgSalesSeats(sb, r.org_id);
        const billed = seats.seatInr > 0 ? seats.seats : 0;
        sent = await sendSupportReminder({
          supportInr: SUPPORT_ANNUAL_INR,
          seats: billed,
          seatInr: seats.seatInr,
          scope: r.scope ?? "support",
          to: r.to_email,
          orgName: r.org_name,
          slug: r.slug,
          kind: r.kind,
          supportUntil: r.due_at ?? r.support_until,
          locksAt: r.locks_at,
        });
      } catch {
        sent = false;
      }
      if (sent) {
        report.reminders += 1;
        await alertOnRenewalStage(sb, r).catch(() => undefined);
      } else {
        // Give the claim back so tomorrow's run tries again.
        report.reminderFailures += 1;
        await sb
          .rpc("billing_unclaim_support_reminder", {
            p_org: r.org_id,
            p_support_until: r.due_at ?? r.support_until,
            p_kind: r.kind,
          })
          .then(() => undefined, () => undefined);
      }
    }
  } catch (e) {
    report.errors.push(`reminders: ${(e as Error).message}`);
  }

  if (report.errors.length > 0) {
    await alertFounders(sb, {
      kind: "reconcile_errors",
      severity: "warning",
      detail: `The payment reconciler hit errors: ${report.errors.join(" | ").slice(0, 600)}`,
    });
  }

  return json({ ok: true, ms: Date.now() - started, ...report });
}
