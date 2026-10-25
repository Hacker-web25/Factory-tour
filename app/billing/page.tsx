"use client";

/**
 * /billing — "Plan and billing" for an organisation admin.
 *
 * Answers the three questions a paying customer actually has:
 *   What am I on?  How many scenes can my customers see?
 *   Is my support still covered, and when does it run out?
 *   Where are my invoices?
 *
 * And gives them the two buttons that used to be an e-mail to you:
 * renew support, and buy more scenes.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CreditCard,
  Crown,
  FileText,
  Loader2,
  LifeBuoy,
  Lock,
  Plus,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { INDIAN_STATES } from "@/lib/indianStates";
import { getMyProfile, type Profile } from "@/lib/auth";
import VpvLogo from "@/components/dashboard/VpvLogo";
import { LegalLinks } from "@/components/legal/SiteFooter";
import CheckoutFlow from "@/components/billing/CheckoutFlow";
import SceneCalculator from "@/components/billing/SceneCalculator";
import { useRazorpayPayment } from "@/components/billing/useRazorpayPayment";
import {
  PRO_MONTHLY_INR,
  SUPPORT_ANNUAL_INR,
  renewalAmount,
  SUPPORT_GRACE_DAYS,
  accessStateFor,
  fromPaise,
  inr,
  priceForScenes,
} from "@/lib/pricing";

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  plan: "basic" | "pro" | "ultra";
  plan_status: string | null;
  scene_quota: number | null;
  support_until: string | null;
  activated_at: string | null;
  billing_email: string | null;
  billing_gstin: string | null;
  billing_phone: string | null;
  billing_address: string | null;
  billing_state: string | null;
};

type InvoiceRow = {
  invoice_no: string;
  description: string;
  total_paise: number;
  issued_at: string;
};

/**
 * active  → covered
 * nag     → the support year has ended; reminders appear on every click and
 *           the workspace locks SUPPORT_GRACE_DAYS after the end date
 * locked  → the workspace is locked until it is renewed
 */
type SupportState = "active" | "nag" | "locked" | "none";

function supportState(org: OrgRow): SupportState {
  if (org.plan !== "basic" || !org.support_until) return "none";
  return accessStateFor(org).state;
}

function daysBetween(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export default function BillingPage() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [org, setOrg] = useState<OrgRow | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pane, setPane] = useState<"none" | "support" | "scenes">("none");
  const [topupTo, setTopupTo] = useState<number>(0);
  const [renewInr, setRenewInr] = useState<number>(SUPPORT_ANNUAL_INR);

  const load = useCallback(async () => {
    const p = await getMyProfile();
    if (!p) {
      router.replace("/login?next=/billing");
      return;
    }
    setMe(p);

    const { data: sess } = await supabase.auth.getSession();
    setToken(sess.session?.access_token ?? null);

    if (p.org_id) {
      const { data: orgRow } = await supabase
        .from("organizations")
        .select(
          "id, name, slug, plan, plan_status, scene_quota, support_until, activated_at, billing_email, billing_gstin, billing_phone, billing_address, billing_state"
        )
        .eq("id", p.org_id)
        .maybeSingle();
      if (orgRow) {
        setOrg(orgRow as OrgRow);
        // Sales Team logins renew with support. Read on their own, so a database
        // without these columns yet still shows the page (support alone).
        const { data: seatRow } = await supabase
          .from("organizations")
          .select("sales_seats, sales_seat_inr")
          .eq("id", p.org_id)
          .maybeSingle();
        const seats = Number((seatRow as { sales_seats?: number } | null)?.sales_seats ?? 0) || 0;
        const each = Number((seatRow as { sales_seat_inr?: number } | null)?.sales_seat_inr ?? 0) || 0;
        setRenewInr(renewalAmount(each > 0 ? seats : 0, each));
        setTopupTo(((orgRow as OrgRow).scene_quota ?? 2) + 1);
        // Arriving from a renewal reminder (or while overdue): open the
        // renewal checkout straight away — one less click to pay.
        const o = orgRow as OrgRow;
        const wantsRenew =
          typeof window !== "undefined" && new URLSearchParams(window.location.search).get("renew") === "1";
        if (o.plan === "basic" && (wantsRenew || supportState(o) === "nag" || supportState(o) === "locked")) {
          setPane((cur) => (cur === "none" ? "support" : cur));
        }
      }

      const { data: inv } = await supabase
        .from("billing_invoices")
        .select("invoice_no, description, total_paise, issued_at")
        .eq("org_id", p.org_id)
        .order("issued_at", { ascending: false })
        .limit(50);
      setInvoices((inv ?? []) as InvoiceRow[]);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-vpv-canvas text-vpv-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!org) {
    return (
      <Shell>
        <div className="rounded-2xl border border-vpv-line bg-white p-8 text-center">
          <h1 className="text-[20px] font-semibold text-vpv-ink">No organisation yet</h1>
          <p className="mx-auto mt-2 max-w-sm text-[14px] text-slate-600">
            Your account is not attached to a workspace. If you have just paid,
            give it a minute and refresh — or write to support@myvpv.com.
          </p>
        </div>
      </Shell>
    );
  }

  const isAdmin = me?.role === "org_admin" || me?.role === "owner";
  const state = supportState(org);
  const access = org.plan === "basic" ? accessStateFor(org) : null;
  const closed = org.plan_status === "suspended" || org.plan_status === "cancelled";
  const daysLeft = org.support_until ? daysBetween(org.support_until) : null;
  const quota = org.scene_quota;

  return (
    <Shell>
      <div className="mb-8">
        <h1 className="text-[28px] font-semibold tracking-tight text-vpv-ink">
          Plan and billing
        </h1>
        <p className="mt-1 text-[13.5px] text-vpv-muted">
          {org.name} · {org.slug}.myvpv.com
        </p>
      </div>

      {closed && (
        <Banner tone="red" icon={<Lock size={18} />} title="This workspace is closed">
          It was closed after a refund or at your request. To reopen it, write to
          support@myvpv.com.
        </Banner>
      )}
      {!closed && state === "nag" && access && (
        <Banner tone="amber" icon={<AlertTriangle size={18} />} title="Your support year has ended — please renew">
          Technical support and hosting ended on{" "}
          <strong>{new Date(org.support_until as string).toDateString()}</strong>. Your workspace
          will <strong>lock on {access.locksAt?.toDateString()}</strong>
          {access.daysToLock !== null && <> ({access.daysToLock} day{access.daysToLock === 1 ? "" : "s"} from now)</>}{" "}
          if it is not renewed. Your tours and data are kept — renewing for{" "}
          {inr(renewInr)} restores everything instantly.
        </Banner>
      )}
      {!closed && state === "locked" && (
        <Banner tone="red" icon={<Lock size={18} />} title="Your workspace is locked">
          The support year ended and the {SUPPORT_GRACE_DAYS}-day reminder period has passed. Your tours and
          data are safe. Renew for {inr(renewInr)} below and everything unlocks the moment
          the payment is confirmed.
        </Banner>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Plan */}
        <Card>
          <CardHead icon={<Crown size={17} />} title="Your plan" />
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-[28px] font-semibold capitalize tracking-tight text-vpv-ink">
              {org.plan}
            </span>
            {org.plan === "basic" && (
              <span className="text-[13px] text-slate-500">one-time licence</span>
            )}
            {org.plan !== "basic" && (
              <span className="text-[13px] text-slate-500">monthly</span>
            )}
          </div>
          <p className="mt-3 text-[13.5px] leading-relaxed text-slate-600">
            {org.plan === "basic" ? (
              <>
                Your customers can see{" "}
                <strong className="text-vpv-ink">
                  the first {quota ?? 2} scene{(quota ?? 2) === 1 ? "" : "s"}
                </strong>{" "}
                of each tour. Your team sees every scene in the editor.
              </>
            ) : (
              <>
                Unlimited scenes. Every scene you build is visible to your
                customers.
              </>
            )}
          </p>
          {org.plan === "basic" && (
            <div className="mt-4 rounded-xl bg-vpv-tint/60 px-4 py-3 text-[12.5px] leading-relaxed text-vpv-navy">
              Going beyond {quota ?? 2} rooms often? Pro is {inr(PRO_MONTHLY_INR)} a
              month for unlimited scenes —{" "}
              <Link href="/contact" className="underline underline-offset-2">
                talk to us
              </Link>
              .
            </div>
          )}
        </Card>

        {/* Support */}
        <Card>
          <CardHead icon={<LifeBuoy size={17} />} title="Technical support" />
          <div className="mt-4">
            <SupportBadge state={state} />
          </div>
          <p className="mt-3 text-[13.5px] leading-relaxed text-slate-600">
            {state === "active" && org.support_until && (
              <>
                Covered until{" "}
                <strong className="text-vpv-ink">
                  {new Date(org.support_until).toDateString()}
                </strong>
                {daysLeft !== null && daysLeft <= 45 && <> — {daysLeft} days left.</>}
              </>
            )}
            {state === "nag" && (
              <>
                Your support year has ended. Renew within{" "}
                {access?.daysToLock ?? SUPPORT_GRACE_DAYS} day
                {(access?.daysToLock ?? SUPPORT_GRACE_DAYS) === 1 ? "" : "s"} to keep your
                workspace and shared tours live.
              </>
            )}
            {state === "locked" && (
              <>
                Your workspace is locked. Renew to unlock the dashboard and the
                tours you have shared with customers.
              </>
            )}
            {state === "none" && <>No support period recorded yet.</>}
          </p>
          {isAdmin && org.plan === "basic" && !closed && (
            <button
              onClick={() => setPane(pane === "support" ? "none" : "support")}
              className="mt-4 w-full rounded-full bg-vpv-grad py-2.5 text-[13.5px] font-semibold text-white hover:opacity-95"
            >
              Renew for {inr(renewInr)} + GST per year
            </button>
          )}
          {org.plan !== "basic" && (
            <p className="mt-4 flex items-center gap-1.5 text-[13px] text-emerald-700">
              <Check size={14} /> Included with {org.plan}
            </p>
          )}
        </Card>

        {/* Scenes */}
        <Card>
          <CardHead icon={<Plus size={17} />} title="Scenes" />
          <div className="mt-4 text-[28px] font-semibold tabular-nums tracking-tight text-vpv-ink">
            {quota ?? "Unlimited"}
          </div>
          <p className="mt-3 text-[13.5px] leading-relaxed text-slate-600">
            {org.plan === "basic"
              ? "Scenes your customers can see. Add more at any time — the price per scene keeps falling."
              : "No limit on this plan."}
          </p>
          {isAdmin && org.plan === "basic" && (
            <button
              onClick={() => setPane(pane === "scenes" ? "none" : "scenes")}
              className="mt-4 w-full rounded-full border border-vpv-blue/40 py-2.5 text-[13.5px] font-semibold text-vpv-blue hover:bg-vpv-tint"
            >
              Add more scenes
            </button>
          )}
        </Card>
      </div>

      {/* ── Buy panes ───────────────────────────────────────────────── */}
      {pane === "support" && isAdmin && (
        <Pane title="Renew technical support">
          <CheckoutFlow
            purpose="support_renewal"
            renewalInr={renewInr}
            accessToken={token}
            onComplete={() => {
              setPane("none");
              void load();
            }}
            prefill={{
              name: me?.full_name ?? "",
              email: org.billing_email ?? me?.email ?? "",
              company: org.name,
              gstin: org.billing_gstin ?? "",
              phone: org.billing_phone ?? "",
              address: org.billing_address ?? "",
              state: org.billing_state ?? "",
            }}
          />
        </Pane>
      )}

      {pane === "scenes" && isAdmin && (
        <Pane title="Add more scenes">
          <p className="mb-5 max-w-xl text-[14px] leading-relaxed text-slate-600">
            You have {quota ?? 0} scene{(quota ?? 0) === 1 ? "" : "s"} today. Drag
            to the total you want — you pay only the difference, at the same
            falling rate.
          </p>
          <SceneCalculator value={topupTo} onChange={setTopupTo} compact />
          <div className="mt-4 rounded-xl border border-vpv-line bg-white p-4">
            <div className="flex items-baseline justify-between text-[14px]">
              <span className="text-slate-600">
                Difference for {Math.max(0, topupTo - (quota ?? 0))} more scene
                {Math.max(0, topupTo - (quota ?? 0)) === 1 ? "" : "s"}
              </span>
              <span className="text-[20px] font-semibold tabular-nums text-vpv-ink">
                {inr(Math.max(0, priceForScenes(topupTo) - priceForScenes(quota ?? 0)))}
              </span>
            </div>
            <TopupButton
              token={token}
              billingState={org.billing_state}
              scenes={topupTo}
              disabled={topupTo <= (quota ?? 0)}
              onComplete={() => {
                setPane("none");
                void load();
              }}
            />
          </div>
        </Pane>
      )}

      {/* ── Invoices ────────────────────────────────────────────────── */}
      <div className="mt-10">
        <h2 className="mb-4 flex items-center gap-2 text-[17px] font-semibold text-vpv-ink">
          <FileText size={17} className="text-vpv-blue" /> Invoices
        </h2>
        {invoices.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-vpv-line bg-white px-5 py-7 text-center text-[13.5px] text-slate-500">
            No invoices yet. Every payment produces a GST invoice, e-mailed to
            you and listed here.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-vpv-line bg-white">
            <table className="w-full min-w-[560px] text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-vpv-line text-[11.5px] uppercase tracking-[0.08em] text-vpv-muted">
                  <th className="px-4 py-3 font-semibold">Invoice</th>
                  <th className="px-4 py-3 font-semibold">For</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.invoice_no} className="border-b border-vpv-line last:border-0">
                    <td className="px-4 py-3 font-medium text-vpv-ink">{inv.invoice_no}</td>
                    <td className="px-4 py-3 text-slate-600">{inv.description}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(inv.issued_at).toDateString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-vpv-ink">
                      {inr(fromPaise(inv.total_paise))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[12.5px] text-slate-500">
          Need a copy re-sent, or a detail corrected? Write to support@myvpv.com
          with the invoice number.
        </p>
      </div>
    </Shell>
  );
}

/* ───────────────────────────── pieces ────────────────────────────── */

function TopupButton({
  token,
  billingState,
  scenes,
  disabled,
  onComplete,
}: {
  token: string | null;
  /** The state on file. Workspaces created by hand may not have one yet. */
  billingState: string | null;
  scenes: number;
  disabled: boolean;
  onComplete: () => void;
}) {
  const pay = useRazorpayPayment({ accessToken: token });
  // The GST split on the invoice depends on the state. Customers who bought online
  // gave it at checkout; a workspace set up by hand has none, so ask — once.
  const needsState = !(billingState ?? "").trim();
  const [pickedState, setPickedState] = useState("");

  if (pay.phase === "verifying") {
    return (
      <p className="mt-4 flex items-center gap-2 text-[13.5px] text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin text-vpv-blue" /> Confirming your payment — please do not pay again…
      </p>
    );
  }
  if (pay.phase === "done" && pay.result) {
    const r = pay.result;
    return (
      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-[13.5px] text-emerald-800">
        {r.outcome === "ready" && <>Done — your new scenes are live. {r.invoiceNo ? `Invoice ${r.invoiceNo}.` : ""}</>}
        {r.outcome === "refunded" && <>This payment was refunded to your original payment method.</>}
        {r.outcome === "failed" && <>The payment did not complete. If your bank shows a debit, it is refunded automatically.</>}
        {(r.outcome === "processing" || r.outcome === "review") && (
          <>Payment received — we are finishing the update and will e-mail you. Please do not pay again.</>
        )}
        <button type="button" onClick={onComplete} className="ml-3 font-semibold underline underline-offset-2">
          Refresh
        </button>
      </div>
    );
  }

  return (
    <>
      {needsState && (
        <label className="mt-4 block">
          <span className="mb-1.5 block text-[13px] font-medium text-vpv-ink">
            Your state <span className="font-normal text-slate-500">— decides the GST split on your invoice</span>
          </span>
          <select
            value={pickedState}
            onChange={(e) => setPickedState(e.target.value)}
            className="w-full rounded-xl border border-vpv-line bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-vpv-blue"
          >
            <option value="">Choose your state…</option>
            {INDIAN_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="button"
        onClick={() =>
          void pay.start({
            purpose: "scene_topup",
            scenes,
            ...(needsState ? { buyer: { state: pickedState } } : {}),
          })
        }
        disabled={disabled || pay.busy || (needsState && !pickedState)}
        className="mt-4 w-full rounded-full bg-vpv-grad py-3 text-[14px] font-semibold text-white hover:opacity-95 disabled:opacity-40"
      >
        {pay.busy ? "Opening secure payment…" : "Pay and add these scenes"}
      </button>
      {pay.error && <p role="alert" className="mt-2 text-[12.5px] text-red-600">{pay.error}</p>}
      {!pay.error && pay.notice && <p role="status" className="mt-2 text-[12.5px] text-amber-700">{pay.notice}</p>}
      {pay.testMode && <p className="mt-2 text-[12px] font-medium text-amber-600">Test mode — no real money moves.</p>}
    </>
  );
}

function SupportBadge({ state }: { state: SupportState }) {
  const map = {
    active: { text: "Active", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
    nag: { text: "Renewal overdue", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
    locked: { text: "Workspace locked", cls: "bg-red-50 text-red-700 ring-red-200" },
    none: { text: "Not set", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
  }[state];
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-[12.5px] font-semibold ring-1 ${map.cls}`}>
      {map.text}
    </span>
  );
}

function Banner({
  tone,
  icon,
  title,
  children,
}: {
  tone: "amber" | "red";
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  const cls =
    tone === "red"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-amber-200 bg-amber-50 text-amber-900";
  return (
    <div role="alert" className={`mb-7 flex gap-3 rounded-2xl border px-5 py-4 ${cls}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>
        <div className="text-[15px] font-semibold">{title}</div>
        <p className="mt-1 text-[13.5px] leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-vpv-line bg-white p-6">{children}</div>;
}

function CardHead({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-vpv-tint text-vpv-blue">
        {icon}
      </span>
      <h2 className="text-[15px] font-semibold text-vpv-ink">{title}</h2>
    </div>
  );
}

function Pane({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-8 rounded-3xl border border-vpv-blue/25 bg-vpv-canvas/60 p-6 sm:p-8">
      <h2 className="mb-5 flex items-center gap-2 text-[18px] font-semibold text-vpv-ink">
        <CreditCard size={18} className="text-vpv-blue" /> {title}
      </h2>
      {children}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-vpv-canvas text-vpv-ink">
      <div className="flex items-center gap-4 border-b border-vpv-line bg-white/70 px-6 py-2.5 backdrop-blur">
        <Link href="/client" className="flex items-center gap-1.5 text-xs text-vpv-muted hover:text-vpv-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
        </Link>
        <div className="mx-auto">
          <VpvLogo />
        </div>
        <div className="w-24" />
      </div>
      <div className="mx-auto max-w-6xl px-6 py-9">{children}</div>
      <LegalLinks compact className="pb-8" />
    </div>
  );
}
