"use client";

/**
 * UpgradePrompt — the one pop-up a customer sees when they reach for a
 * feature their plan does not include. Mounted once in the root layout; any
 * page opens it with requestUpgrade("link_password") (or any feature key) from
 * lib/useEntitlements.ts.
 *
 * It only ever appears when someone clicks a locked feature. There are no
 * timed pop-ups and no banners, and from Ultra up nothing is
 * locked (except the Sales Team add-on, which they may not have bought), so
 * those customers never see it unless they reach for that.
 */

import { useEffect, useState } from "react";
import { ArrowRight, Check, Crown, Users, X } from "lucide-react";
import { ROLLOUT, accessTo, effectivePlan, isUpgrade, upgradeForMore, type FeatureKey } from "@/lib/entitlements";
import { loadWorkspaceFacts } from "@/lib/useEntitlements";
import { LAUNCH_OFFER, LINK_CONTROLS, SALES_TEAM, SITE_PLANS, inr, seatPrice, upgradeQuote, type SitePlanId } from "@/lib/pricing";

const LIMITED = { process_videos: "videos", pdf_reports: "pdfs", info_icons: "infoIcons" } as const;

type Shown = {
  feature: FeatureKey;
  /** null = nothing to sell above this plan (the allowance is the most we offer online). */
  target: SitePlanId | "sales_team" | null;
  from: SitePlanId;
  /** Bought for life: moving up is arranged with our team. */
  lifetime?: boolean;
  isAdmin: boolean;
  /** Set when the plan HAS the feature but its allowance is used up. */
  limit?: { used: number; max: number };
};

export default function UpgradePrompt() {
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    const onAsk = async (e: Event) => {
      const detail = (e as CustomEvent<{ feature?: FeatureKey; limit?: { used: number; max: number } }>).detail;
      const feature = detail?.feature;
      if (!feature || !(feature in ROLLOUT)) return;
      const { facts } = await loadWorkspaceFacts();
      const a = accessTo(facts, feature);
      if (a.state === "open" && detail?.limit) {
        setShown({
          feature,
          target: feature in LIMITED ? upgradeForMore(facts, LIMITED[feature as keyof typeof LIMITED]) : null,
          from: effectivePlan(facts),
          lifetime: facts.plan_billing === "lifetime",
          isAdmin: facts.role === "org_admin" || facts.role === "owner",
          limit: detail.limit,
        });
        return;
      }
      if (a.state !== "locked") return; // open, or not released: nothing to sell
      setShown({
        feature,
        target: a.upgradeTo,
        from: effectivePlan(facts),
        lifetime: facts.plan_billing === "lifetime",
        isAdmin: facts.role === "org_admin" || facts.role === "owner",
      });
    };
    window.addEventListener("vpv:upgrade", onAsk);
    return () => window.removeEventListener("vpv:upgrade", onAsk);
  }, []);

  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setShown(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown]);

  if (!shown) return null;
  const label = ROLLOUT[shown.feature].label;
  if (shown.limit && !shown.target) {
    return (
      <Frame onClose={() => setShown(null)} title={`All ${shown.limit.max} ${label.toLowerCase()} are in use`}>
        <p className="mt-2 text-[14px] leading-relaxed text-slate-600">
          {SITE_PLANS[shown.from].name} includes {shown.limit.max} {label.toLowerCase()}, and you are using all of them. Remove
          one to add another, or write to{" "}
          <a className="text-[#1468D8] underline" href="mailto:support@myvpv.com">
            support@myvpv.com
          </a>{" "}
          if you need more.
        </p>
      </Frame>
    );
  }
  const sales = shown.target === "sales_team";
  if (!shown.target) return null;
  const to = sales ? null : SITE_PLANS[shown.target as SitePlanId];
  const from = SITE_PLANS[shown.from];
  const q = sales ? null : upgradeQuote(shown.from, shown.target as SitePlanId);
  const href = sales ? "/billing/upgrade#logins" : `/billing/upgrade?to=${shown.target}`;

  const gains: string[] = sales
    ? [
        "A login for each salesperson",
        "Your dashboard of every meeting: when and where it started",
        "Every client, their meetings and how far each deal has moved",
      ]
    : [
        q && q.addAreas > 0 ? `${q.addAreas} more areas` : "",
        q && q.addVideos > 0 ? `${to!.videos} process videos` : "",
        q && q.addPdfs > 0 ? `${to!.pdfs} lab reports & certifications` : "",
        ...LINK_CONTROLS.filter((c) => to!.linkControls[c.key] && !from.linkControls[c.key]).map((c) => c.label),
      ].filter(Boolean);
  // White Glove includes Mr. Gupta's own time, and a plan bought before
  // yearly billing (21 Nov 2026) cannot be prorated: both are arranged with
  // our team, not paid here.
  const personal = !sales && to!.personal;
  const talk = !sales && (personal || !!shown.lifetime || !isUpgrade(shown.from, shown.target as SitePlanId));

  return (
    <div
      data-vpv-gate
      role="dialog"
      aria-modal="true"
      aria-labelledby="vpv-upgrade-title"
      className="fixed inset-0 grid place-items-center bg-[rgba(8,15,28,0.55)] p-5 backdrop-blur-[2px]"
      style={{ zIndex: 2147482000 }}
      onClick={(e) => e.target === e.currentTarget && setShown(null)}
    >
      <div className="relative w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
        <button
          type="button"
          onClick={() => setShown(null)}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={18} />
        </button>
        <span className="grid h-11 w-11 place-items-center rounded-full bg-[#EEF4FF]">
          {sales ? <Users className="text-[#1468D8]" size={20} /> : <Crown className="text-[#1468D8]" size={20} />}
        </span>
        <h2 id="vpv-upgrade-title" className="mt-4 text-[20px] font-semibold tracking-tight text-slate-900">
          {sales ? "Add Sales Team logins" : `Upgrade to ${to!.name}`}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-slate-600">
          {shown.limit ? (
            <>
              You are using all {shown.limit.max} {label.toLowerCase()} in {from.name}. {to!.name} includes{" "}
              {(() => {
                const n = shown.feature === "process_videos" ? to!.videos : shown.feature === "info_icons" ? to!.infoIcons : to!.pdfs;
                return Number.isFinite(n) ? n : "unlimited";
              })()}
              .
            </>
          ) : (
            <>
              <strong className="text-slate-900">{label}</strong>{" "}
              {sales
                ? "comes with Sales Team logins."
                : personal
                  ? `is part of ${to!.name}, which includes Mr. Nitin Gupta's personal involvement and is arranged with our team. You are on ${from.name}.`
                  : talk
                    ? shown.lifetime
                      ? `is part of ${to!.name}. You are on ${from.name} for life, so we arrange the move with you.`
                      : `is part of ${to!.name}. You are on ${from.name}, bought before our yearly plans, so we arrange the move with you.`
                    : `is part of ${to!.name}. You are on ${from.name}.`}
            </>
          )}
        </p>
        {gains.length > 0 && (
          <ul className="mt-4 space-y-2 text-[13.5px] text-slate-700">
            {gains.map((g) => (
              <li key={g} className="flex items-start gap-2">
                <Check size={15} className="mt-0.5 shrink-0 text-emerald-600" /> {g}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-[13px] text-slate-500">
          {sales
            ? `${inr(seatPrice())} per salesperson a year${LAUNCH_OFFER.active ? ` (normally ${inr(SALES_TEAM.regularInr)})` : ""} + GST.`
            : talk
              ? "Write to us and we will arrange it with you."
              : `You pay only the difference between the two yearly plans (${inr(q!.yearlyDiffInr)} a year + GST), and only for the months left until your plan renews. Everything opens the moment the payment is confirmed.`}
        </p>
        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row-reverse">
          {shown.isAdmin ? (
            <a
              href={talk ? `mailto:support@myvpv.com?subject=${encodeURIComponent(to!.name)}` : href}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-[#0B3D91] via-[#1468D8] to-[#19B8F2] py-3 text-[14.5px] font-semibold text-white"
            >
              {sales ? "Add logins" : talk ? "Write to us" : "See the upgrade"} <ArrowRight size={15} />
            </a>
          ) : (
            <p className="flex-1 rounded-xl bg-slate-50 px-4 py-3 text-[13px] text-slate-600">
              Please ask your organisation&apos;s admin. Only an admin can upgrade.
            </p>
          )}
          <button
            type="button"
            onClick={() => setShown(null)}
            className="flex-1 rounded-full border border-slate-200 py-3 text-[14px] font-medium text-slate-600 hover:bg-slate-50"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

function Frame({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      data-vpv-gate
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 grid place-items-center bg-[rgba(8,15,28,0.55)] p-5 backdrop-blur-[2px]"
      style={{ zIndex: 2147482000 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={18} />
        </button>
        <h2 className="pr-8 text-[19px] font-semibold tracking-tight text-slate-900">{title}</h2>
        {children}
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-full border border-slate-200 py-3 text-[14px] font-medium text-slate-600 hover:bg-slate-50"
        >
          OK
        </button>
      </div>
    </div>
  );
}
