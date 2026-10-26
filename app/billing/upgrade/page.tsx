"use client";

/**
 * /billing/upgrade — move up a plan, or add Sales Team logins.
 *
 * Every "Upgrade" button and pop-up in the dashboard leads here. The prices
 * on this page are for display; the server prices every order itself
 * (lib/pricing.ts priceFor), from the plan the workspace really has.
 *
 *   ?to=authority|control   highlights that plan
 *   #logins                 scrolls to the Sales Team logins
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Crown, Loader2, Minus, Plus, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getMyProfile, type Profile } from "@/lib/auth";
import VpvLogo from "@/components/dashboard/VpvLogo";
import { LegalLinks } from "@/components/legal/SiteFooter";
import { useRazorpayPayment } from "@/components/billing/useRazorpayPayment";
import { INDIAN_STATES } from "@/lib/indianStates";
import {
  ENTERPRISE_PERSONAL,
  LAUNCH_OFFER,
  SALES_TEAM,
  SITE_PLANS,
  inr,
  inr2,
  monthsUntil,
  seatPrice,
  seatTopupAmount,
  upgradeQuote,
  withGst,
  type SitePlanId,
} from "@/lib/pricing";
import { effectivePlan, upgradeOptions, type WorkspaceFacts } from "@/lib/entitlements";
import { loadWorkspaceFacts } from "@/lib/useEntitlements";

type OrgInfo = {
  id: string;
  name: string;
  billing_state: string | null;
  support_until: string | null;
  scene_quota: number | null;
  plan_status: string | null;
};

export default function UpgradePage() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [facts, setFacts] = useState<WorkspaceFacts>({});
  const [logins, setLogins] = useState({ seats: 0, seatInr: 0, until: null as string | null, salespeople: 0 });
  const [loading, setLoading] = useState(true);
  const [focus, setFocus] = useState<SitePlanId | null>(null);

  const load = useCallback(async () => {
    const p = await getMyProfile();
    if (!p) {
      router.replace("/login?next=/billing/upgrade");
      return;
    }
    setMe(p);
    const { facts: f } = await loadWorkspaceFacts(true);
    setFacts(f);
    if (p.org_id) {
      const { data } = await supabase
        .from("organizations")
        .select("id, name, billing_state, support_until, scene_quota, plan_status")
        .eq("id", p.org_id)
        .maybeSingle();
      setOrg((data as OrgInfo) ?? null);
      const { data: s } = await supabase
        .from("organizations")
        .select("sales_seats, sales_seat_inr, sales_seats_until")
        .eq("id", p.org_id)
        .maybeSingle();
      const row = (s ?? {}) as { sales_seats?: number; sales_seat_inr?: number | null; sales_seats_until?: string | null };
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("org_id", p.org_id)
        .eq("role", "presenter");
      setLogins({
        seats: Number(row.sales_seats ?? 0) || 0,
        seatInr: Number(row.sales_seat_inr ?? 0) || 0,
        until: row.sales_seats_until ?? (data as OrgInfo | null)?.support_until ?? null,
        salespeople: count ?? 0,
      });
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
    const to = new URLSearchParams(window.location.search).get("to");
    if (to === "authority" || to === "control") setFocus(to);
  }, [load]);

  useEffect(() => {
    if (!loading && window.location.hash === "#logins") {
      document.getElementById("logins")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [loading]);

  const refresh = useCallback(() => {
    window.dispatchEvent(new Event("vpv:billing-changed"));
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-vpv-canvas text-vpv-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const isAdmin = me?.role === "org_admin" || me?.role === "owner";
  const current = effectivePlan(facts);
  const options = upgradeOptions(facts);
  const closed = org?.plan_status === "cancelled" || org?.plan_status === "suspended";
  const legacyMonthly = facts.plan === "pro" || facts.plan === "ultra";

  return (
    <div className="min-h-screen bg-vpv-canvas text-vpv-ink">
      <div className="flex items-center gap-4 border-b border-vpv-line bg-white/70 px-6 py-2.5 backdrop-blur">
        <Link href="/billing" className="flex items-center gap-1.5 text-xs text-vpv-muted hover:text-vpv-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> Plan and billing
        </Link>
        <div className="mx-auto">
          <VpvLogo />
        </div>
        <div className="w-24" />
      </div>

      <div className="mx-auto max-w-5xl px-5 py-9 sm:px-6">
        <h1 className="text-[28px] font-semibold tracking-tight">Upgrade</h1>
        <p className="mt-1 text-[14px] text-vpv-muted">
          {org?.name} is on <strong className="text-vpv-ink">{legacyMonthly ? "a monthly plan" : SITE_PLANS[current].name}</strong>
          {org?.scene_quota ? ` · ${org.scene_quota} areas` : ""}.
        </p>

        {!isAdmin && (
          <div className="mt-6 rounded-2xl border border-vpv-line bg-white p-5 text-[14px] text-slate-600">
            Only your organisation&apos;s admin can upgrade. Please ask them to open this page.
          </div>
        )}
        {closed && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-[14px] text-red-800">
            This workspace is closed. Please write to support@myvpv.com.
          </div>
        )}

        {/* ── Plans ─────────────────────────────────────────────── */}
        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-[18px] font-semibold">
            <Crown size={18} className="text-vpv-blue" /> Your plan
          </h2>
          {options.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-vpv-line bg-white p-5 text-[14px] text-slate-600">
              {current === "enterprise" || legacyMonthly
                ? "You have every feature we offer today."
                : `You are on ${SITE_PLANS[current].name}, which has every feature we offer today. `}
              {current === "control" && !legacyMonthly && (
                <>
                  {" "}
                  {SITE_PLANS.enterprise.name} adds {ENTERPRISE_PERSONAL.person}&apos;s personal involvement;{" "}
                  <a className="text-vpv-blue underline underline-offset-2" href="mailto:support@myvpv.com?subject=VPV%20Enterprise">
                    write to us
                  </a>{" "}
                  if you would like it.
                </>
              )}
            </p>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {options.map((to) => (
                <PlanUpgradeCard
                  key={to}
                  areasNow={org?.scene_quota ?? SITE_PLANS[current].scenes}
                  from={current}
                  to={to}
                  focused={focus === to}
                  enabled={isAdmin && !closed}
                  billingState={org?.billing_state ?? null}
                  onDone={refresh}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Sales Team logins ─────────────────────────────────── */}
        <section id="logins" className="mt-12 scroll-mt-6">
          <h2 className="flex items-center gap-2 text-[18px] font-semibold">
            <Users size={18} className="text-vpv-blue" /> Sales Team logins
          </h2>
          <LoginsCard
            logins={logins}
            enabled={isAdmin && !closed}
            billingState={org?.billing_state ?? null}
            onDone={refresh}
          />
        </section>
      </div>
      <LegalLinks compact className="pb-8" />
    </div>
  );
}

/* ───────────────────────────── a plan to move up to ───────────────────────────── */

function PlanUpgradeCard({
  areasNow,
  from,
  to,
  focused,
  enabled,
  billingState,
  onDone,
}: {
  areasNow: number;
  from: SitePlanId;
  to: SitePlanId;
  focused: boolean;
  enabled: boolean;
  billingState: string | null;
  onDone: () => void;
}) {
  const plan = SITE_PLANS[to];
  const q = upgradeQuote(from, to);
  const total = withGst(q.amountInr).total;
  const gains = [
    q.addAreas > 0 ? `${q.addAreas} more areas — ${areasNow + q.addAreas} in all` : null,
    plan.videos > 0 ? `${plan.videos} process videos` : null,
    plan.pdfs > 0 ? `${plan.pdfs} PDF reports` : null,
    plan.sharingControls ? "One-time links and sharing restrictions" : null,
    `${plan.shootHours} hours of shoot time`,
  ].filter(Boolean) as string[];

  return (
    <div
      className={`rounded-2xl border bg-white p-6 ${
        focused ? "border-vpv-blue shadow-[0_18px_40px_-20px_rgba(20,104,216,0.55)] ring-1 ring-vpv-blue" : "border-vpv-line"
      }`}
    >
      <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-vpv-blue">Upgrade to</div>
      <div className="mt-1 text-[22px] font-semibold tracking-tight">{plan.name}</div>
      <p className="mt-1 text-[13px] text-slate-500">{plan.tagline}</p>
      <ul className="mt-4 space-y-2 text-[13.5px] text-slate-700">
        {gains.map((g) => (
          <li key={g} className="flex items-start gap-2">
            <Check size={15} className="mt-0.5 shrink-0 text-emerald-600" /> {g}
          </li>
        ))}
      </ul>
      <div className="mt-5 border-t border-vpv-line pt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] text-slate-500">You pay the difference</span>
          <span className="text-[22px] font-semibold tabular-nums">{inr(q.amountInr)}</span>
        </div>
        <div className="mt-0.5 text-right text-[12px] text-slate-500">+ 18% GST = {inr2(total)}</div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-slate-500">
          {SITE_PLANS[to].name} is {inr(LAUNCH_OFFER.active ? plan.priceInr : plan.regularInr)} today and{" "}
          {SITE_PLANS[from].name} is {inr(LAUNCH_OFFER.active ? SITE_PLANS[from].priceInr : SITE_PLANS[from].regularInr)}. The new
          features open as soon as the payment is confirmed; we call you to book the shoot for the extra areas.
        </p>
      </div>
      <PayButton
        enabled={enabled}
        billingState={billingState}
        label={`Upgrade for ${inr2(total)}`}
        start={(pay, buyer) => pay.start({ purpose: "plan_upgrade", upgradeTo: to, ...(buyer ? { buyer } : {}) })}
        doneText={`You are now on ${plan.name}.`}
        onDone={onDone}
      />
    </div>
  );
}

/* ───────────────────────────── more logins ───────────────────────────── */

function LoginsCard({
  logins,
  enabled,
  billingState,
  onDone,
}: {
  logins: { seats: number; seatInr: number; until: string | null; salespeople: number };
  enabled: boolean;
  billingState: string | null;
  onDone: () => void;
}) {
  const [add, setAdd] = useState(logins.seats > 0 ? 1 : 3);
  const each = logins.seatInr > 0 ? logins.seatInr : seatPrice();
  const months = monthsUntil(logins.until && new Date(logins.until).getTime() > Date.now() ? logins.until : null);
  const amount = seatTopupAmount(add, each, months);
  const total = withGst(amount).total;
  const until = useMemo(() => {
    if (months === 12 || !logins.until) return null;
    return new Date(logins.until).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  }, [months, logins.until]);

  return (
    <div className="mt-4 rounded-2xl border border-vpv-line bg-white p-6">
      <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="text-[14px] text-slate-600">
            {logins.seats > 0 ? (
              <>
                You have <strong className="text-vpv-ink">{logins.seats}</strong> login{logins.seats === 1 ? "" : "s"};{" "}
                <strong className="text-vpv-ink">{logins.salespeople}</strong> in use.
              </>
            ) : (
              <>
                Give each salesperson a login, and see every meeting they hold: when and where it started, which client,
                and how far each deal has moved.
              </>
            )}
          </p>
          <p className="mt-2 text-[13px] text-slate-500">
            {inr(each)} per login a year
            {logins.seatInr <= 0 && LAUNCH_OFFER.active ? ` (normally ${inr(SALES_TEAM.regularInr)})` : ""} + GST.
            {until ? ` New logins are charged only for the ${months} month${months === 1 ? "" : "s"} until ${until}, when all your logins renew together.` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Fewer"
            onClick={() => setAdd((n) => Math.max(1, n - 1))}
            className="grid h-10 w-10 place-items-center rounded-full border border-vpv-line hover:bg-vpv-tint"
          >
            <Minus size={16} />
          </button>
          <div className="w-16 text-center">
            <div className="text-[26px] font-semibold tabular-nums">{add}</div>
            <div className="text-[11px] text-slate-500">to add</div>
          </div>
          <button
            type="button"
            aria-label="More"
            onClick={() => setAdd((n) => Math.min(SALES_TEAM.maxSeats, n + 1))}
            className="grid h-10 w-10 place-items-center rounded-full border border-vpv-line hover:bg-vpv-tint"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
      <div className="mt-5 flex items-baseline justify-between border-t border-vpv-line pt-4">
        <span className="text-[13px] text-slate-500">
          {add} login{add === 1 ? "" : "s"} · {months === 12 ? "1 year" : `${months} month${months === 1 ? "" : "s"}`}
        </span>
        <span className="text-[20px] font-semibold tabular-nums">
          {inr(amount)} <span className="text-[12px] font-normal text-slate-500">+ GST = {inr2(total)}</span>
        </span>
      </div>
      <PayButton
        enabled={enabled}
        billingState={billingState}
        label={`Add ${add} login${add === 1 ? "" : "s"} for ${inr2(total)}`}
        start={(pay, buyer) => pay.start({ purpose: "seat_topup", salesSeats: add, ...(buyer ? { buyer } : {}) })}
        doneText="Your new logins are ready. Share an invite code from your Team page."
        onDone={onDone}
      />
    </div>
  );
}

/* ───────────────────────────── paying ───────────────────────────── */

type Pay = ReturnType<typeof useRazorpayPayment>;

function PayButton({
  enabled,
  billingState,
  label,
  start,
  doneText,
  onDone,
}: {
  enabled: boolean;
  billingState: string | null;
  label: string;
  start: (pay: Pay, buyer: { state: string } | null) => Promise<unknown> | void;
  doneText: string;
  onDone: () => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null));
  }, []);
  const pay = useRazorpayPayment({ accessToken: token });
  const needsState = !(billingState ?? "").trim();
  const [picked, setPicked] = useState("");

  useEffect(() => {
    if (pay.phase === "done" && pay.result?.outcome === "ready") onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pay.phase, pay.result?.outcome]);

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
        {r.outcome === "ready" && <>Done. {doneText} {r.invoiceNo ? `Invoice ${r.invoiceNo} is in your e-mail.` : ""}</>}
        {r.outcome === "refunded" && <>This payment was refunded to your original payment method.</>}
        {r.outcome === "failed" && <>The payment did not complete. If your bank shows a debit, it is refunded automatically.</>}
        {(r.outcome === "processing" || r.outcome === "review") && (
          <>Payment received — we are finishing the update and will e-mail you. Please do not pay again.</>
        )}
      </div>
    );
  }
  return (
    <>
      {needsState && enabled && (
        <label className="mt-4 block">
          <span className="mb-1.5 block text-[13px] font-medium text-vpv-ink">
            Your state <span className="font-normal text-slate-500">— decides the GST split on your invoice</span>
          </span>
          <select
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
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
        disabled={!enabled || pay.busy || (needsState && !picked)}
        onClick={() => void start(pay, needsState ? { state: picked } : null)}
        className="mt-4 w-full rounded-full bg-vpv-grad py-3 text-[14px] font-semibold text-white hover:opacity-95 disabled:opacity-40"
      >
        {pay.busy ? "Opening secure payment…" : label}
      </button>
      {pay.error && <p role="alert" className="mt-2 text-[12.5px] text-red-600">{pay.error}</p>}
      {!pay.error && pay.notice && <p role="status" className="mt-2 text-[12.5px] text-amber-700">{pay.notice}</p>}
      {pay.testMode && <p className="mt-2 text-[12px] font-medium text-amber-600">Test mode — no real money moves.</p>}
    </>
  );
}
