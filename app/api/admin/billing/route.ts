/**
 * POST /api/admin/billing   —  platform owner only.
 *
 * The three buttons behind /admin/payments. Every one of them is safe to
 * press twice, because they only ever call the same idempotent paths the
 * webhook and the daily reconciler already use:
 *
 *   retry_fulfilment { orderId }
 *       A customer PAID but their workspace was not built (the automatic
 *       retries gave up, or a person had to fix something such as a taken
 *       e-mail). Clears the "gave up" counter and runs the build again.
 *       Refused unless the order is paid and not yet built, so it cannot
 *       build a customer for money that was never taken or was refunded.
 *
 *   resync_order { orderId }
 *       "Webhook never arrived": ask Razorpay what it holds for this order,
 *       settle any captured payment, then build if it is now paid.
 *
 *   resolve_alert { alertId }
 *       Close an alert once you have dealt with it.
 *
 *   config_check {}
 *       READ-ONLY. Is everything a safe sale depends on in place (keys, webhook
 *       secret, e-mail provider, cron secret)? Returns the mode (test / live),
 *       a list of problems and a list of warnings. Never returns a secret and
 *       writes nothing (so it leaves no audit row).
 *
 *   dismiss_flag { orderId, note }
 *       An order was flagged for review (for example an amount mismatch that
 *       you refunded by hand). Clear the flag and record why. Refused on an
 *       order that is paid but not built — that one needs retry_fulfilment.
 *
 * Safety:
 *   • platform owner only; rate limited; 4 KB body cap; never cached
 *   • AUDIT FIRST: a row is written before anything changes, and if it cannot
 *     be written the action is refused (fail closed). The outcome is added to
 *     the same row afterwards.
 *   • nothing here can mark an order paid, change an amount, issue a refund
 *     or touch an invoice — only re-run the normal pipeline.
 */

import { authenticateRequest } from "@/lib/server/requestAuth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { UUID_RE, billingRateLimit, clean, fail, json, readJson } from "@/lib/server/billingGuard";
import { fulfilOrder } from "@/lib/server/fulfilment";
import { syncOrderFromRazorpay } from "@/lib/server/payments";
import { billingPreflight } from "@/lib/server/razorpay";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ACTIONS = ["retry_fulfilment", "resync_order", "resolve_alert", "dismiss_flag"] as const;
type Action = (typeof ACTIONS)[number];

const isAction = (v: unknown): v is Action => typeof v === "string" && (ACTIONS as readonly string[]).includes(v);
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

/** Write the audit row FIRST. Returns its id, or null if it could not be written. */
async function auditStart(
  sb: SupabaseClient,
  actor: string,
  action: Action,
  target: { orderId?: string; alertId?: string; note?: string }
): Promise<string | null> {
  const bits = [`${actor} → ${action}`];
  if (target.orderId) bits.push(`order ${target.orderId}`);
  if (target.alertId) bits.push(`alert ${target.alertId}`);
  if (target.note) bits.push(`note: ${target.note}`);
  const row = (orderId: string | null) => ({
    kind: "admin_action",
    severity: "info",
    order_id: orderId,
    detail: `${bits.join(" · ")} · requested`.slice(0, 1000),
    resolved_at: new Date().toISOString(),
  });
  let { data, error } = await sb.from("billing_alerts").insert(row(target.orderId ?? null)).select("id").single();
  // A mistyped order id has nothing to link to. That is a 404 for the caller, not a
  // reason to refuse the audit: record it unlinked (the id is in the text).
  if (error && (error as { code?: string }).code === "23503" && target.orderId) {
    ({ data, error } = await sb.from("billing_alerts").insert(row(null)).select("id").single());
  }
  if (error || !data) return null;
  return data.id as string;
}

/** Best effort: add what happened to the audit row. */
async function auditFinish(sb: SupabaseClient, auditId: string, outcome: string): Promise<void> {
  try {
    const { data } = await sb.from("billing_alerts").select("detail").eq("id", auditId).maybeSingle();
    const before = String((data?.detail as string | undefined) ?? "").replace(/ · requested$/, "");
    await sb
      .from("billing_alerts")
      .update({ detail: `${before} · ${outcome}`.slice(0, 1000) })
      .eq("id", auditId);
  } catch {
    /* intentional — the request row already exists; the outcome is a bonus */
  }
}

type OrderLite = {
  id: string;
  status: string;
  razorpay_order_id: string | null;
  provisioned_at: string | null;
  review_flag: string | null;
  revoked_at: string | null;
};

async function loadOrder(sb: SupabaseClient, id: string): Promise<{ order: OrderLite | null; error: boolean }> {
  const { data, error } = await sb
    .from("billing_orders")
    .select("id, status, razorpay_order_id, provisioned_at, review_flag, revoked_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return { order: null, error: true };
  return { order: (data as OrderLite | null) ?? null, error: false };
}

export async function POST(req: Request) {
  const auth = await authenticateRequest(req);
  if (!auth) return fail(401, "unauthorized");
  if (auth.profile.role !== "owner") return fail(403, "forbidden", "Platform owner only.");

  const sb = supabaseAdmin();
  if (!sb) return fail(503, "not_configured", "SUPABASE_SERVICE_ROLE_KEY is not set.");

  const rl = await billingRateLimit(sb, `admin-billing:${auth.profile.id}`, 120, 3600);
  if (!rl.allowed) return fail(429, "rate_limited", undefined, { "Retry-After": String(rl.retryAfter || 60) });

  const parsed = await readJson(req, 4 * 1024);
  if (!parsed.ok) return fail(parsed.status, parsed.error);
  const body = parsed.body;

  // Read-only: report the set-up, change nothing, so no audit row is needed.
  if (body.action === "config_check") return json({ ok: true, ...billingPreflight() });

  if (!isAction(body.action)) return fail(400, "bad_action", "Unknown action.");
  const action = body.action;

  const orderId = isUuid(body.orderId) ? body.orderId : undefined;
  const alertId = isUuid(body.alertId) ? body.alertId : undefined;
  const note = clean(body.note, 300);

  if (action === "resolve_alert") {
    if (!alertId) return fail(400, "bad_alert_id", "alertId must be an alert id.");
  } else if (!orderId) {
    return fail(400, "bad_order_id", "orderId must be an order id.");
  }
  if (action === "dismiss_flag" && note.length < 5) {
    return fail(400, "note_required", "Say why you are clearing this flag (at least a few words).");
  }

  const actor = auth.profile.email || auth.profile.id;

  /* ── fail closed: no audit row, no action ─────────────────────────── */
  const auditId = await auditStart(sb, actor, action, { orderId, alertId, note: note || undefined });
  if (!auditId) return fail(503, "audit_unavailable", "Could not record this action, so it was not run. Try again.");

  const done = async (res: Response, outcome: string) => {
    await auditFinish(sb, auditId, outcome);
    return res;
  };

  try {
    switch (action) {
      /* ───────────────────────── retry a build ───────────────────────── */
      case "retry_fulfilment": {
        // One conditional UPDATE: it only matches an order that is paid, not built and not refunded.
        const { data: reset, error: resetErr } = await sb
          .from("billing_orders")
          .update({
            fulfilment_attempts: 0,
            review_flag: null,
            provisioning_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", orderId!)
          .eq("status", "paid")
          .is("provisioned_at", null)
          .is("revoked_at", null)
          .select("id");
        if (resetErr) return done(fail(500, "reset_failed", "Could not prepare the order for a retry."), "reset failed");

        if (!reset || reset.length === 0) {
          const { order, error } = await loadOrder(sb, orderId!);
          if (error) return done(fail(500, "lookup_failed"), "lookup failed");
          if (!order) return done(fail(404, "order_not_found"), "order not found");
          if (order.provisioned_at) return done(fail(409, "already_built", "This customer is already set up."), "already built");
          if (order.revoked_at || order.status === "refunded") {
            return done(fail(409, "order_refunded", "This order was refunded; there is nothing to build."), "refused: refunded");
          }
          return done(
            fail(409, "not_paid", `This order is "${order.status}", not paid, so it cannot be built.`),
            `refused: status ${order.status}`
          );
        }

        const r = await fulfilOrder(orderId!);
        if (r.ok) {
          // The problem is solved — close the "could not set up" alerts for this order.
          await sb
            .from("billing_alerts")
            .update({ resolved_at: new Date().toISOString() })
            .eq("order_id", orderId!)
            .is("resolved_at", null)
            .like("kind", "fulfilment\\_%");
        }
        const outcome = r.ok ? "built" : r.inProgress ? "another worker is building it" : `failed: ${r.error ?? "unknown"}`;
        return done(
          json({
            ok: true,
            action,
            built: r.ok === true,
            inProgress: r.inProgress === true,
            retriable: r.retriable === true,
            slug: r.slug ?? null,
            invoiceNo: r.invoiceNo ?? null,
            error: r.ok ? null : (r.error ?? null),
          }),
          outcome
        );
      }

      /* ──────────────────── re-ask Razorpay, then build ──────────────── */
      case "resync_order": {
        const { order, error } = await loadOrder(sb, orderId!);
        if (error) return done(fail(500, "lookup_failed"), "lookup failed");
        if (!order) return done(fail(404, "order_not_found"), "order not found");
        if (!order.razorpay_order_id) {
          return done(fail(409, "no_gateway_order", "This order never reached Razorpay."), "refused: no gateway order");
        }

        let sync: { checked: boolean; settled: number };
        try {
          sync = await syncOrderFromRazorpay(order.razorpay_order_id, "reconcile");
        } catch (e) {
          return done(
            fail(502, "sync_failed", "Could not settle with Razorpay right now. Try again in a minute."),
            `sync error: ${(e as Error).message.slice(0, 120)}`
          );
        }
        if (!sync.checked) {
          return done(fail(502, "gateway_unreachable", "Razorpay did not answer. Nothing was changed."), "razorpay unreachable");
        }

        const after = await loadOrder(sb, orderId!);
        let built = Boolean(after.order?.provisioned_at);
        let inProgress = false;
        let error2: string | null = null;
        if (after.order && after.order.status === "paid" && !after.order.provisioned_at && !after.order.revoked_at) {
          const r = await fulfilOrder(orderId!);
          built = r.ok === true;
          inProgress = r.inProgress === true;
          error2 = r.ok ? null : (r.error ?? null);
        }
        return done(
          json({
            ok: true,
            action,
            checked: true,
            settled: sync.settled,
            status: after.order?.status ?? order.status,
            built,
            inProgress,
            error: error2,
          }),
          `razorpay checked, settled ${sync.settled}, status ${after.order?.status ?? "?"}, ${built ? "built" : "not built"}`
        );
      }

      /* ───────────────────────── close an alert ──────────────────────── */
      case "resolve_alert": {
        const { data: closed, error: closeErr } = await sb
          .from("billing_alerts")
          .update({ resolved_at: new Date().toISOString() })
          .eq("id", alertId!)
          .is("resolved_at", null)
          .neq("kind", "admin_action")
          .select("id");
        if (closeErr) return done(fail(500, "resolve_failed"), "resolve failed");
        if (!closed || closed.length === 0) {
          const { data: a } = await sb.from("billing_alerts").select("id, kind, resolved_at").eq("id", alertId!).maybeSingle();
          if (!a) return done(fail(404, "alert_not_found"), "alert not found");
          return done(fail(409, "already_resolved", "That alert is already closed."), "already resolved");
        }
        return done(json({ ok: true, action, resolved: true }), "resolved");
      }

      /* ─────────────────── clear a "needs review" flag ───────────────── */
      case "dismiss_flag": {
        const { order, error } = await loadOrder(sb, orderId!);
        if (error) return done(fail(500, "lookup_failed"), "lookup failed");
        if (!order) return done(fail(404, "order_not_found"), "order not found");
        if (!order.review_flag) return done(fail(409, "not_flagged", "This order has no flag."), "not flagged");
        if (order.status === "paid" && !order.provisioned_at) {
          return done(
            fail(409, "use_retry", "This customer paid and is not set up yet. Use “Retry setup” instead."),
            "refused: paid and not built"
          );
        }
        const { data: cleared, error: clrErr } = await sb
          .from("billing_orders")
          .update({ review_flag: null, updated_at: new Date().toISOString() })
          .eq("id", orderId!)
          .not("review_flag", "is", null)
          .select("id");
        if (clrErr) return done(fail(500, "dismiss_failed"), "dismiss failed");
        if (!cleared || cleared.length === 0) return done(fail(409, "not_flagged"), "raced: already cleared");
        return done(json({ ok: true, action, cleared: true, was: order.review_flag }), `cleared flag ${order.review_flag}`);
      }
    }
  } catch (e) {
    await auditFinish(sb, auditId, `error: ${(e as Error).message.slice(0, 150)}`);
    // Never echo internals to the browser.
    return fail(500, "action_failed", "That did not work. Nothing was left half-done; you can press it again.");
  }
}
