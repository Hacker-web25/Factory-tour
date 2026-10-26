"use client";

/**
 * /admin/payments — the platform owner's payment health board.
 *
 * Answers one question at a glance: "is every rupee that came in turned into
 * a working customer, and is there anything I need to do?"
 *
 *   • Paid but not set up   a customer paid and their workspace is not built
 *                           (automatic retries gave up). Buttons: Retry setup,
 *                           Check with Razorpay.
 *   • Needs your review     orders flagged for a human decision.
 *   • Open alerts           everything the system shouted about.
 *   • Failed webhooks       deliveries from Razorpay we could not process.
 *   • Recent refunds
 *
 * Nothing on this page can mark an order as paid, change an amount or issue a
 * refund. The buttons only re-run the same checks the system runs by itself,
 * and every press is written to the audit trail.
 *
 * Owner only, enforced three times: this page, the API route, and the database
 * function behind the numbers.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getMyProfile, type Profile } from "@/lib/auth";
import VpvLogo from "@/components/dashboard/VpvLogo";
import { fromPaise, inr } from "@/lib/pricing";
import { usageTitle } from "@/lib/purchaseUsage";

type StuckOrder = {
  id: string;
  razorpay_order_id: string | null;
  purpose: string;
  company: string;
  email: string;
  amount_paise: number;
  paid_at: string | null;
  attempts: number;
  error: string | null;
  livemode: boolean;
};
type FlaggedOrder = {
  id: string;
  razorpay_order_id: string | null;
  flag: string;
  company: string;
  email: string;
  amount_paise: number;
  error: string | null;
  status: string;
};
type FailedEvent = {
  event_id: string;
  type: string;
  error: string | null;
  attempts: number;
  received_at: string;
  processed: boolean;
};
type OpenAlert = {
  id: string;
  kind: string;
  severity: "info" | "warning" | "critical";
  order_id: string | null;
  detail: string | null;
  created_at: string;
};
type RefundRow = {
  refund_id: string;
  order_id: string | null;
  kind: string;
  amount_paise: number;
  status: string;
  created_at: string;
};
type FailedPayment = {
  id: string;
  company: string;
  email: string;
  amount_paise: number;
  created_at: string;
  razorpay_order_id: string | null;
  livemode: boolean;
};
type CustomerRow = {
  order_id: string;
  company: string;
  email: string;
  phone: string | null;
  slug: string | null;
  city: string;
  amount_paise: number;
  paid_at: string | null;
  livemode: boolean;
  areas: number | null;
  support_until: string | null;
  tours: number;
  uses: string[] | null;
  usage_note: string | null;
};
/** Everything the shop looks like right now, in one round trip. */
type Overview = {
  fy: string;
  money: { live_orders: number; live_paise: number; month_orders: number; month_paise: number; test_orders: number };
  counts: {
    paid_not_setup: number;
    needs_review: number;
    failed: number;
    customers: number;
    abandoned: number;
    open_alerts: number;
    failed_webhooks: number;
    renewals_60d: number;
    usage_unanswered: number;
  };
  failed_payments: FailedPayment[];
  customers: CustomerRow[];
  invoices: { fy: string; count: number; highest: number };
};

type Health = {
  stuck_orders: StuckOrder[];
  flagged_orders: FlaggedOrder[];
  failed_events: FailedEvent[];
  open_alerts: OpenAlert[];
  recent_refunds: RefundRow[];
};

type Notice = { tone: "ok" | "warn" | "error"; text: string };

const FRIENDLY: Record<string, string> = {
  already_built: "This customer is already set up — nothing to do.",
  not_paid: "That order is not paid, so there is nothing to build.",
  order_refunded: "That order was refunded, so it will not be built.",
  use_retry: "This customer paid and is not set up yet — use “Retry setup”.",
  not_flagged: "That order has no flag to clear.",
  already_resolved: "That alert is already closed.",
  order_not_found: "That order no longer exists.",
  alert_not_found: "That alert no longer exists.",
  no_gateway_order: "That order never reached Razorpay.",
  gateway_unreachable: "Razorpay did not answer. Nothing was changed — try again in a minute.",
  sync_failed: "Could not settle with Razorpay right now. Try again in a minute.",
  audit_unavailable: "Could not record this action, so it was not run. Try again.",
  rate_limited: "Too many actions in a short time. Wait a few minutes.",
  forbidden: "Only the platform owner can do this.",
  unauthorized: "Your session has expired. Sign in again.",
};

const money = (paise: number) => inr(fromPaise(Number(paise || 0)));
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

type SetupCheck = { mode: "test" | "live" | "unconfigured"; problems: string[]; warnings: string[] };

export default function AdminPaymentsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [setup, setSetup] = useState<SetupCheck | null>(null);
  const [setupError, setSetupError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [clearing, setClearing] = useState<string | null>(null);
  const [clearNote, setClearNote] = useState("");
  // A synchronous guard: state updates are async, so a fast double-click could slip through them.
  const inflight = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoadError(null);
    const p = await getMyProfile();
    if (!p) {
      router.push("/login?next=/admin/payments");
      return;
    }
    setMe(p);
    if (p.role !== "owner") {
      setLoading(false);
      return;
    }
    // The set-up check is read-only and never blocks the rest of the page.
    void (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const res = await fetch("/api/admin/billing", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess.session?.access_token ?? ""}` },
          body: JSON.stringify({ action: "config_check" }),
        });
        const d = (await res.json().catch(() => null)) as (SetupCheck & { ok?: boolean }) | null;
        if (res.ok && d && d.ok !== false && Array.isArray(d.problems)) {
          setSetup({ mode: d.mode, problems: d.problems, warnings: d.warnings ?? [] });
          setSetupError(false);
        } else {
          setSetupError(true);
        }
      } catch {
        setSetupError(true);
      }
    })();
    // Added October 2026. An older database has not got it yet, and the
    // rest of this page must still work, so a failure here is silent.
    const { data: ov } = await supabase.rpc("admin_payments_overview");
    setOverview((ov as Overview | null) ?? null);

    const { data, error } = await supabase.rpc("admin_billing_health");
    if (error || !data) {
      setLoadError("Could not load payment health. Is billing_hardening.sql applied in Supabase?");
    } else {
      const h = data as Partial<Health>;
      setHealth({
        stuck_orders: h.stuck_orders ?? [],
        flagged_orders: h.flagged_orders ?? [],
        failed_events: h.failed_events ?? [],
        open_alerts: h.open_alerts ?? [],
        recent_refunds: h.recent_refunds ?? [],
      });
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  /** Run one owner action. The same key can never run twice at once. */
  async function act(key: string, body: Record<string, unknown>, describe: (d: Record<string, unknown>) => Notice) {
    if (inflight.current.has(key)) return;
    inflight.current.add(key);
    setBusy(new Set(inflight.current));
    try {
      const { data: sess } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/billing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sess.session?.access_token ?? ""}`,
        },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || data.ok === false) {
        const code = String(data.error ?? "");
        setNotice({
          tone: "error",
          text: FRIENDLY[code] ?? (typeof data.message === "string" ? data.message : "That did not work. Nothing was left half-done; you can press it again."),
        });
      } else {
        setNotice(describe(data));
      }
    } catch {
      setNotice({ tone: "error", text: "Network problem. Nothing was changed — check the list and press again if needed." });
    } finally {
      inflight.current.delete(key);
      setBusy(new Set(inflight.current));
      await load();
    }
  }

  const retry = (o: { id: string; company: string }) =>
    act(`order:${o.id}`, { action: "retry_fulfilment", orderId: o.id }, (d) => {
      if (d.built) return { tone: "ok", text: `${o.company} is set up${d.slug ? ` at ${String(d.slug)}.myvpv.com` : ""}. The welcome and invoice e-mails have gone out.` };
      if (d.inProgress) return { tone: "warn", text: "Another process is already building this one. Refresh in a minute." };
      return { tone: "error", text: `Still failing: ${String(d.error ?? "unknown reason")}. ${d.retriable ? "You can press it again later." : "This one needs a manual fix first."}` };
    });

  const resync = (o: { id: string; company: string }) =>
    act(`order:${o.id}`, { action: "resync_order", orderId: o.id }, (d) => {
      if (d.built) return { tone: "ok", text: `Razorpay confirms the payment and ${o.company} is set up.` };
      if (d.status === "paid") return { tone: "warn", text: `Payment confirmed, but the setup is still failing${d.error ? `: ${String(d.error)}` : ""}.` };
      return { tone: "warn", text: `Razorpay holds no completed payment for this order (status: ${String(d.status)}).` };
    });

  const resolve = (alertId: string) =>
    act(`alert:${alertId}`, { action: "resolve_alert", alertId }, () => ({ tone: "ok", text: "Alert closed." }));

  const dismiss = (orderId: string, note: string) =>
    act(`order:${orderId}`, { action: "dismiss_flag", orderId, note }, () => ({ tone: "ok", text: "Flag cleared and your note was saved to the audit trail." })).then(() => {
      setClearing(null);
      setClearNote("");
    });

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-vpv-canvas text-vpv-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (me?.role !== "owner") {
    return (
      <div className="min-h-screen grid place-items-center bg-vpv-canvas px-6 text-center">
        <div>
          <h1 className="text-[20px] font-semibold text-vpv-ink">Not available</h1>
          <p className="mt-2 text-[14px] text-slate-600">This page is for the platform owner.</p>
        </div>
      </div>
    );
  }

  const stuckIds = new Set((health?.stuck_orders ?? []).map((o) => o.id));
  const counts = {
    stuck: health?.stuck_orders.length ?? 0,
    review: health?.flagged_orders.length ?? 0,
    alerts: health?.open_alerts.length ?? 0,
    events: health?.failed_events.filter((e) => !e.processed).length ?? 0,
  };
  const allClear = health !== null && counts.stuck + counts.review + counts.alerts + counts.events === 0;

  return (
    <div className="min-h-screen bg-vpv-canvas text-vpv-ink">
      <div className="flex items-center gap-4 border-b border-vpv-line bg-white/70 px-6 py-2.5 backdrop-blur">
        <Link href="/admin" className="flex items-center gap-1.5 text-xs text-vpv-muted hover:text-vpv-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> Admin
        </Link>
        <div className="mx-auto">
          <VpvLogo />
        </div>
        <button
          onClick={() => {
            setLoading(true);
            load();
          }}
          className="flex w-16 items-center justify-end gap-1.5 text-xs text-vpv-muted hover:text-vpv-ink"
          title="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-9">
        <h1 className="text-[28px] font-semibold tracking-tight">Payments</h1>
        <p className="mt-1 text-[13.5px] text-vpv-muted">
          Whether every payment became a working customer — and what needs you.
        </p>

        {/* One file a month is what keeps VPV's invoices and the rest of the
            company's books from counting the same sale twice. */}
        <InvoiceExport />

        {loadError && (
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{loadError}</span>
          </div>
        )}

        {/* ── set-up check: is the shop ready to take money safely? ── */}
        {setup && (
          <div
            className={`mt-5 rounded-xl border px-4 py-3 text-[13.5px] ${
              setup.problems.length
                ? "border-red-200 bg-red-50 text-red-800"
                : setup.warnings.length
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              {setup.problems.length || setup.warnings.length ? <AlertTriangle size={16} className="shrink-0" /> : <ShieldCheck size={16} className="shrink-0" />}
              {setup.mode === "live" ? "Live payments" : setup.mode === "test" ? "Test payments (no real money)" : "Payments not switched on"}
              {setup.problems.length === 0 && setup.warnings.length === 0 && " — set-up is complete"}
            </div>
            {setup.problems.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-6">
                {setup.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            {setup.warnings.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-6">
                {setup.warnings.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            {setup.mode === "live" && setup.problems.length > 0 && (
              <p className="mt-2 text-[12.5px]">Checkout is closed to customers until these are fixed, so nobody can pay for something we cannot deliver.</p>
            )}
          </div>
        )}
        {setupError && !setup && (
          <p className="mt-5 text-[12.5px] text-vpv-muted">The set-up check could not be loaded just now.</p>
        )}

        {notice && (
          <div
            role="status"
            className={`mt-5 flex items-start gap-2 rounded-xl border px-4 py-3 text-[13.5px] ${
              notice.tone === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : notice.tone === "warn"
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {notice.tone === "ok" ? <Check size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
            <span className="flex-1">{notice.text}</span>
            <button onClick={() => setNotice(null)} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
              <X size={15} />
            </button>
          </div>
        )}

        {health && (
          <>
            {/* Money first. Everything below is a queue; this is the
                reason the queues matter. */}
            {overview && <MoneyStrip o={overview} />}

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Paid, not set up" value={counts.stuck} tone={counts.stuck ? "red" : "plain"} />
              <Stat label="Need your review" value={counts.review} tone={counts.review ? "amber" : "plain"} />
              <Stat
                label="Payments that failed"
                value={overview?.counts.failed ?? 0}
                tone={(overview?.counts.failed ?? 0) >= 3 ? "red" : (overview?.counts.failed ?? 0) ? "amber" : "plain"}
              />
              <Stat label="Customers set up" value={overview?.counts.customers ?? 0} />
            </div>

            {overview && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Checkouts abandoned (30 days)" value={overview.counts.abandoned} tone={overview.counts.abandoned ? "amber" : "plain"} />
                <Stat label="Renewals due in 60 days" value={overview.counts.renewals_60d} />
                <Stat label="Open alerts" value={counts.alerts} tone={counts.alerts ? "amber" : "plain"} />
                <Stat label="Failed webhooks" value={counts.events} tone={counts.events ? "amber" : "plain"} />
              </div>
            )}

            {allClear && (
              <div className="mt-6 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13.5px] text-emerald-800">
                <CheckCircle2 size={16} className="shrink-0" />
                All clear. Every payment received has been turned into a working customer.
              </div>
            )}

            {/* ── payments that did not go through ───────────────── */}
            {overview && overview.counts.failed > 0 && (
              <Section
                title="Payments that failed"
                tone={overview.counts.failed >= 3 ? "red" : "amber"}
                hint={
                  overview.counts.failed >= 3
                    ? "Three or more in 30 days. One declined card is normal; several in a row usually means something is wrong with the checkout — check the Razorpay dashboard."
                    : "The customer's payment did not complete. Nothing was charged. Worth a call if it was a real buyer."
                }
              >
                <Table head={["Customer", "Amount", "When", "Razorpay order"]}>
                  {overview.failed_payments.map((f) => (
                    <tr key={f.id} className="border-b border-vpv-line last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium text-vpv-ink">
                          {f.company}
                          <ModeChip live={f.livemode} />
                        </div>
                        <div className="text-[12.5px] text-vpv-muted">{f.email}</div>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{money(f.amount_paise)}</td>
                      <td className="px-4 py-3 text-[12.5px] text-vpv-muted">{when(f.created_at)}</td>
                      <td className="px-4 py-3 font-mono text-[12px] text-vpv-muted">{f.razorpay_order_id ?? "never reached Razorpay"}</td>
                    </tr>
                  ))}
                </Table>
              </Section>
            )}

            {/* ── paid but not set up ───────────────────────────── */}
            {counts.stuck > 0 && (
              <Section title="Paid, but the workspace is not set up" tone="red" hint="The customer's money is safe and recorded. These need the build run again.">
                <Table head={["Customer", "Amount", "Paid", "Tries", "Last error", ""]}>
                  {health.stuck_orders.map((o) => (
                    <tr key={o.id} className="border-b border-vpv-line last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {o.company} <ModeChip live={o.livemode} />
                        </div>
                        <div className="text-[12px] text-vpv-muted">
                          {o.email} · {o.purpose.replace("_", " ")}
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{money(o.amount_paise)}</td>
                      <td className="px-4 py-3 text-slate-600">{when(o.paid_at)}</td>
                      <td className="px-4 py-3 tabular-nums">{o.attempts}</td>
                      <td className="max-w-[260px] px-4 py-3 text-[12.5px] text-slate-600">{o.error ?? "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Btn busy={busy.has(`order:${o.id}`)} onClick={() => retry(o)} primary>
                            Retry setup
                          </Btn>
                          <Btn busy={busy.has(`order:${o.id}`)} onClick={() => resync(o)}>
                            Check Razorpay
                          </Btn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </Table>
              </Section>
            )}

            {/* ── flagged ───────────────────────────────────────── */}
            {counts.review > 0 && (
              <Section title="Needs your review" tone="amber" hint="A person must decide these — for example, refund a short payment in the Razorpay dashboard, then clear the flag.">
                <Table head={["Customer", "Amount", "Flag", "Status", "Detail", ""]}>
                  {health.flagged_orders.map((o) => (
                    <tr key={o.id} className="border-b border-vpv-line last:border-0 align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium">{o.company}</div>
                        <div className="text-[12px] text-vpv-muted">{o.email}</div>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{money(o.amount_paise)}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11.5px] font-semibold text-amber-700 ring-1 ring-amber-200">
                          {o.flag.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{o.status}</td>
                      <td className="max-w-[260px] px-4 py-3 text-[12.5px] text-slate-600">{o.error ?? "—"}</td>
                      <td className="px-4 py-3 text-right">
                        {clearing === o.id ? (
                          <form
                            className="flex flex-col items-end gap-2"
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (clearNote.trim().length >= 5) dismiss(o.id, clearNote.trim());
                            }}
                          >
                            <input
                              autoFocus
                              value={clearNote}
                              maxLength={300}
                              onChange={(e) => setClearNote(e.target.value)}
                              placeholder="What did you do about it?"
                              className="w-64 rounded-lg border border-vpv-line bg-white px-3 py-1.5 text-[13px] outline-none focus:border-vpv-blue"
                            />
                            <div className="flex gap-2">
                              <Btn onClick={() => { setClearing(null); setClearNote(""); }}>Cancel</Btn>
                              <Btn busy={busy.has(`order:${o.id}`)} primary submit disabled={clearNote.trim().length < 5}>
                                Clear flag
                              </Btn>
                            </div>
                          </form>
                        ) : (
                          <div className="flex justify-end gap-2">
                            {stuckIds.has(o.id) ? (
                              <Btn busy={busy.has(`order:${o.id}`)} onClick={() => retry(o)} primary>
                                Retry setup
                              </Btn>
                            ) : (
                              <Btn onClick={() => { setClearing(o.id); setClearNote(""); }}>Clear flag…</Btn>
                            )}
                            <Btn busy={busy.has(`order:${o.id}`)} onClick={() => resync(o)}>
                              Check Razorpay
                            </Btn>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </Table>
              </Section>
            )}

            {/* ── alerts ────────────────────────────────────────── */}
            {counts.alerts > 0 && (
              <Section title="Open alerts" tone="amber">
                <Table head={["Severity", "What", "Detail", "When", ""]}>
                  {health.open_alerts.map((a) => (
                    <tr key={a.id} className="border-b border-vpv-line last:border-0 align-top">
                      <td className="px-4 py-3">
                        <SeverityChip s={a.severity} />
                      </td>
                      <td className="px-4 py-3 font-medium">{a.kind.replace(/_/g, " ")}</td>
                      <td className="max-w-[420px] px-4 py-3 text-[12.5px] text-slate-600">{a.detail ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{when(a.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <Btn busy={busy.has(`alert:${a.id}`)} onClick={() => resolve(a.id)}>
                          Mark resolved
                        </Btn>
                      </td>
                    </tr>
                  ))}
                </Table>
              </Section>
            )}

            {/* ── failed webhooks ───────────────────────────────── */}
            {health.failed_events.length > 0 && (
              <Section title="Webhook deliveries that failed" hint="Razorpay retries these by itself and the daily check heals the order. Shown for information.">
                <Table head={["Event", "Type", "Error", "Tries", "Received", "State"]}>
                  {health.failed_events.map((e) => (
                    <tr key={e.event_id} className="border-b border-vpv-line last:border-0 align-top">
                      <td className="px-4 py-3 font-mono text-[12px]">{e.event_id.slice(0, 22)}</td>
                      <td className="px-4 py-3">{e.type}</td>
                      <td className="max-w-[320px] px-4 py-3 text-[12.5px] text-slate-600">{e.error ?? "—"}</td>
                      <td className="px-4 py-3 tabular-nums">{e.attempts}</td>
                      <td className="px-4 py-3 text-slate-600">{when(e.received_at)}</td>
                      <td className="px-4 py-3">{e.processed ? "Recovered" : "Retrying"}</td>
                    </tr>
                  ))}
                </Table>
              </Section>
            )}

            {/* ── refunds ───────────────────────────────────────── */}
            {/* ── who is set up, and what they do with it ─────────── */}
            {overview && overview.customers.length > 0 && <CustomersSection o={overview} />}

            <Section title="Recent refunds and chargebacks">
              {health.recent_refunds.length === 0 ? (
                <div className="rounded-2xl border border-vpv-line bg-white px-4 py-8 text-center text-[13.5px] text-slate-500">
                  No refunds yet.
                </div>
              ) : (
                <Table head={["Refund", "Kind", "Amount", "Status", "When"]}>
                  {health.recent_refunds.map((r) => (
                    <tr key={r.refund_id} className="border-b border-vpv-line last:border-0">
                      <td className="px-4 py-3 font-mono text-[12px]">{r.refund_id}</td>
                      <td className="px-4 py-3">{r.kind}</td>
                      <td className="px-4 py-3 tabular-nums">{money(r.amount_paise)}</td>
                      <td className="px-4 py-3">{r.status}</td>
                      <td className="px-4 py-3 text-slate-600">{when(r.created_at)}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </Section>

            <div className="mt-10 flex items-start gap-2 rounded-xl border border-vpv-line bg-white px-4 py-3 text-[12.5px] text-slate-600">
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-vpv-blue" />
              <p>
                The buttons on this page never mark an order paid, change an amount or send a refund. Money is
                recorded only from Razorpay's own confirmation. “Retry setup” and “Check Razorpay” re-run the same
                checks the system runs on its own; every press is written to the audit trail.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────────── bits ──────────────────────────────── */

function Stat({ label, value, tone = "plain" }: { label: string; value: number; tone?: "plain" | "amber" | "red" }) {
  const ring =
    tone === "amber" ? "ring-amber-200 bg-amber-50" : tone === "red" ? "ring-red-200 bg-red-50" : "ring-vpv-line bg-white";
  return (
    <div className={`rounded-2xl p-5 ring-1 ${ring}`}>
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-vpv-muted">{label}</div>
      <div className="mt-1.5 text-[24px] font-semibold tabular-nums tracking-tight text-vpv-ink">{value}</div>
    </div>
  );
}

function Section({
  title,
  hint,
  tone = "plain",
  children,
}: {
  title: string;
  hint?: string;
  tone?: "plain" | "amber" | "red";
  children: React.ReactNode;
}) {
  const bar = tone === "red" ? "bg-red-500" : tone === "amber" ? "bg-amber-500" : "bg-vpv-line";
  return (
    <section className="mt-9">
      <div className="flex items-center gap-2">
        <span className={`h-4 w-1 rounded-full ${bar}`} />
        <h2 className="text-[16px] font-semibold">{title}</h2>
      </div>
      {hint && <p className="mt-1 text-[12.5px] text-vpv-muted">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-vpv-line bg-white">
      <table className="w-full min-w-[760px] text-left text-[13.5px]">
        <thead>
          <tr className="border-b border-vpv-line text-[11.5px] uppercase tracking-[0.08em] text-vpv-muted">
            {head.map((h, i) => (
              <th key={i} className="px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Btn({
  children,
  onClick,
  busy,
  primary,
  submit,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  busy?: boolean;
  primary?: boolean;
  submit?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type={submit ? "submit" : "button"}
      onClick={onClick}
      disabled={busy || disabled}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        primary ? "bg-vpv-grad text-white hover:opacity-95" : "border border-vpv-line text-vpv-blue hover:bg-vpv-tint"
      }`}
    >
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

function ModeChip({ live }: { live: boolean }) {
  return (
    <span
      className={`ml-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ring-1 ${
        live ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-100 text-slate-600 ring-slate-200"
      }`}
    >
      {live ? "Live" : "Test"}
    </span>
  );
}

function SeverityChip({ s }: { s: OpenAlert["severity"] }) {
  const map = {
    critical: "bg-red-50 text-red-700 ring-red-200",
    warning: "bg-amber-50 text-amber-700 ring-amber-200",
    info: "bg-slate-100 text-slate-600 ring-slate-200",
  }[s];
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11.5px] font-semibold capitalize ring-1 ${map}`}>{s}</span>;
}

/**
 * The accountant's monthly file, and a way to read back any one invoice.
 *
 * It lives here rather than in a settings page because this is where
 * someone already comes to ask "did that payment work?" — and the answer
 * to "can my customer claim the GST?" is the same document.
 */
function InvoiceExport() {
  const thisFy = (() => {
    const now = new Date();
    const y = now.getFullYear();
    // India's financial year starts in April.
    const start = now.getMonth() >= 3 ? y : y - 1;
    return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
  })();
  const [fy, setFy] = useState(thisFy);
  const [order, setOrder] = useState("");

  return (
    <div className="mt-5 rounded-xl border border-vpv-line bg-white px-4 py-3.5">
      <p className="text-[13.5px] font-semibold text-vpv-ink">Invoices</p>
      <p className="mt-0.5 text-[12.5px] text-vpv-muted">
        Give your accountant the year&rsquo;s file so VPV sales are entered once, and no invoice number goes missing.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={fy}
          onChange={(e) => setFy(e.target.value.trim())}
          placeholder="2026-27"
          className="w-28 rounded-lg border border-vpv-line px-2.5 py-1.5 text-[13px]"
          aria-label="Financial year"
        />
        <a
          href={`/api/admin/invoice?export=${encodeURIComponent(fy)}`}
          className="rounded-lg bg-vpv-ink px-3 py-1.5 text-[12.5px] font-semibold text-white"
        >
          Download CSV
        </a>
        <span className="mx-1 text-vpv-line">|</span>
        <input
          value={order}
          onChange={(e) => setOrder(e.target.value.trim())}
          placeholder="order id"
          className="w-72 rounded-lg border border-vpv-line px-2.5 py-1.5 font-mono text-[12px]"
          aria-label="Order id"
        />
        <a
          href={order ? `/api/admin/invoice?order=${encodeURIComponent(order)}` : undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!order}
          className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold ring-1 ${
            order ? "text-vpv-ink ring-vpv-line" : "pointer-events-none text-vpv-muted ring-vpv-line opacity-50"
          }`}
        >
          Open invoice PDF
        </a>
      </div>
    </div>
  );
}

/* ───────────────────────── the money, and the customers ───────────────────────── */

/**
 * What actually came in. It sits above the queues because a page that
 * opens on "4 things are broken" tells you nothing about whether the
 * business is working.
 */
function MoneyStrip({ o }: { o: Overview }) {
  const avg = o.money.live_orders > 0 ? o.money.live_paise / o.money.live_orders : 0;
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-emerald-700">This month</p>
        <p className="mt-1 text-[26px] font-semibold tabular-nums tracking-[-0.02em] text-emerald-900">{money(o.money.month_paise)}</p>
        <p className="mt-0.5 text-[12.5px] text-emerald-800">
          {o.money.month_orders} {o.money.month_orders === 1 ? "payment" : "payments"}
        </p>
      </div>
      <div className="rounded-xl border border-vpv-line bg-white px-4 py-3.5">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-vpv-muted">All time (live)</p>
        <p className="mt-1 text-[26px] font-semibold tabular-nums tracking-[-0.02em] text-vpv-ink">{money(o.money.live_paise)}</p>
        <p className="mt-0.5 text-[12.5px] text-vpv-muted">
          {o.money.live_orders} paid · {o.money.test_orders} test
        </p>
      </div>
      <div className="rounded-xl border border-vpv-line bg-white px-4 py-3.5">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-vpv-muted">Average order</p>
        <p className="mt-1 text-[26px] font-semibold tabular-nums tracking-[-0.02em] text-vpv-ink">{money(avg)}</p>
        <p className="mt-0.5 text-[12.5px] text-vpv-muted">Including GST and travel</p>
      </div>
      <div className="rounded-xl border border-vpv-line bg-white px-4 py-3.5">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-vpv-muted">Invoices {o.invoices.fy}</p>
        <p className="mt-1 text-[26px] font-semibold tabular-nums tracking-[-0.02em] text-vpv-ink">{o.invoices.count}</p>
        <p className="mt-0.5 text-[12.5px] text-vpv-muted">
          {o.invoices.highest > o.invoices.count
            ? `Highest number ${o.invoices.highest} — ${o.invoices.highest - o.invoices.count} missing`
            : "Numbering complete"}
        </p>
      </div>
    </div>
  );
}

/**
 * Everyone who is set up, and what they have done since.
 *
 * The purchase intent comes from the one question asked after payment,
 * and it is the most valuable thing on this page: it is the only place
 * that says, in customers' own words, what they bought VPV FOR.
 */
function CustomersSection({ o }: { o: Overview }) {
  return (
    <Section
      title="Set up — and how they use it"
      hint={`${o.counts.customers} ${o.counts.customers === 1 ? "customer" : "customers"} live. “Plans to” is what they told us after paying; ${o.counts.usage_unanswered} have not answered yet.`}
    >
      <Table head={["Customer", "Address", "Paid", "Built", "Plans to use it for", "Support until"]}>
        {o.customers.map((c) => (
          <tr key={c.order_id} className="border-b border-vpv-line last:border-0 align-top">
            <td className="px-4 py-3">
              <div className="font-medium text-vpv-ink">
                {c.company}
                <ModeChip live={c.livemode} />
              </div>
              <div className="text-[12.5px] text-vpv-muted">{c.email}</div>
              {c.phone && <div className="text-[12.5px] text-vpv-muted">{c.phone}</div>}
            </td>
            <td className="px-4 py-3">
              {c.slug ? (
                <a
                  href={`https://${c.slug}.myvpv.com`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12.5px] font-medium text-vpv-blue underline underline-offset-2"
                >
                  {c.slug}.myvpv.com
                </a>
              ) : (
                <span className="text-[12.5px] text-vpv-muted">—</span>
              )}
              {c.city && <div className="text-[12.5px] text-vpv-muted">{c.city}</div>}
            </td>
            <td className="px-4 py-3 tabular-nums">{money(c.amount_paise)}</td>
            <td className="px-4 py-3 text-[12.5px] text-vpv-muted">
              {c.areas ?? "—"} areas
              <br />
              {c.tours} {c.tours === 1 ? "tour" : "tours"}
            </td>
            <td className="px-4 py-3 text-[12.5px]">
              {c.uses && c.uses.length > 0 ? (
                <>
                  <span className="text-vpv-ink">{c.uses.map(usageTitle).join(", ")}</span>
                  {c.usage_note && <div className="mt-0.5 italic text-vpv-muted">&ldquo;{c.usage_note}&rdquo;</div>}
                </>
              ) : (
                <span className="text-vpv-muted">Not answered yet</span>
              )}
            </td>
            <td className="px-4 py-3 text-[12.5px] text-vpv-muted">{c.support_until ? when(c.support_until).split(",")[0] : "—"}</td>
          </tr>
        ))}
      </Table>
    </Section>
  );
}
