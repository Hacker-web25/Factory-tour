"use client";

/**
 * Pricing-tier chrome:
 *
 *   - PresentUpgradeModal — the blocking pop-up that appears every time
 *     a BASIC-plan user clicks "Present". Dismisses manually, then
 *     opens the tour via the caller's own `onContinue` callback (so
 *     the host page still owns the `window.open(/tour/…)` logic). The
 *     customer never sees it: it lives on the dashboard, between
 *     clicking Present and the tour tab opening.
 *
 *   - UpgradeCounter — the sidebar "limited offer" card. Reads the
 *     org's plan and either pitches the next tier up or hides itself
 *     for ULTRA. Replaces the two hard-coded `LimitedOffer`
 *     components that lived in app/client/page.tsx and
 *     app/[slug]/sales/page.tsx.
 *
 *   - usePresentGate — thin wrapper around useOrgPlan that gives host
 *     pages a single `openWithGate(url)` function; on BASIC it stages
 *     the pending URL and shows the modal, on PRO/ULTRA it jumps
 *     straight to `window.open`.
 *
 *  All copy here is PREMIUM in voice — no "locked", no "upgrade or
 *  else". The tone is "here's what you unlock", nothing cheap.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Crown,
  Sparkles,
  X,
} from "lucide-react";
import {
  PLAN_LABEL,
  PLAN_PRICE_INR,
  UPGRADE_CTA_URL,
  formatInr,
  upsellTarget,
  useOrgPlan,
  type Plan,
} from "@/lib/planAccess";

/* ---------- Present-click upgrade modal (BASIC only) ------------------- */

export function PresentUpgradeModal({
  onContinue,
  onClose,
}: {
  /** Called when the user dismisses the modal and the tour should
   *  open — the host decides HOW to open (new tab, replace location,
   *  etc.) so this component stays dumb. */
  onContinue: () => void;
  /** Called when the user closes without continuing (e.g. hits the X). */
  onClose: () => void;
}) {
  // Lock body scroll while open and release on unmount. Keeps the
  // page under the dim behind glass instead of jumping.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Esc dismisses (same as the X) — standard modal expectation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pro = PLAN_PRICE_INR.pro;

  return (
    <div
      className="fixed inset-0 z-[1000] grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="present-upgrade-title"
    >
      {/* Backdrop — click outside closes, same affordance as X. */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-md"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md rounded-3xl bg-white border border-vpv-line shadow-[0_30px_80px_-20px_rgba(11,61,145,0.45)] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Soft brand gradient top strip */}
        <div className="h-1 bg-gradient-to-r from-vpv-blue via-vpv-cyan to-vpv-blue" />

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 h-8 w-8 grid place-items-center rounded-full text-vpv-muted hover:text-vpv-navy hover:bg-vpv-tint transition-colors"
        >
          <X size={16} />
        </button>

        <div className="p-7">
          <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-vpv-blue font-semibold mb-3 bg-vpv-tint px-2.5 py-1 rounded-full">
            <Crown size={11} /> Pro experience
          </div>

          <h3
            id="present-upgrade-title"
            className="text-[20px] font-bold text-vpv-navy leading-snug mb-2"
          >
            Let your customer walk every room.
          </h3>
          <p className="text-[13px] text-vpv-muted leading-relaxed mb-5">
            You're on <span className="font-semibold text-vpv-navy">Basic</span>.
            Customers currently see only the first two scenes — enough to
            tease, not enough to close. Pro unlocks every scene so they
            can truly feel the plant before saying yes.
          </p>

          <div className="rounded-2xl border border-vpv-line bg-vpv-tint/40 p-4 mb-5">
            <div className="flex items-start gap-3">
              <Sparkles size={16} className="text-vpv-blue mt-0.5 shrink-0" />
              <div className="flex-1 text-[12.5px] text-vpv-ink leading-relaxed">
                <div className="font-semibold text-vpv-navy mb-1">
                  Upgrade to Pro for {formatInr(pro)}/yr
                </div>
                Smoother presentations, every scene visible, custom
                branding, analytics on each meeting. The way your
                customer should see your plant.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={UPGRADE_CTA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-2.5 rounded-full bg-vpv-grad hover:opacity-95 text-white text-[13px] font-semibold flex items-center justify-center gap-1.5 shadow-[0_10px_28px_-8px_rgba(20,104,216,0.55)]"
            >
              Talk to us about Pro <ArrowRight size={13} />
            </a>
            <button
              type="button"
              onClick={onContinue}
              className="py-2.5 px-5 rounded-full bg-white border border-vpv-line hover:border-vpv-blue/40 hover:bg-vpv-tint text-vpv-navy text-[12.5px] font-medium"
            >
              Continue
            </button>
          </div>
          <p className="text-center text-[10.5px] text-vpv-muted/80 mt-3">
            Press Continue to start presenting on Basic.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------- Hook: "open a tour with the plan gate in the way" ---------- */

/** Caller usage:
 *
 *     const gate = usePresentGate(me?.org_id);
 *     // in Present click: gate.openWithGate(() => window.open(url, "_blank"));
 *     // in JSX:            {gate.element}
 */
export function usePresentGate(orgId: string | null | undefined) {
  const { plan } = useOrgPlan(orgId);
  const [pending, setPending] = useState<null | (() => void)>(null);

  function openWithGate(open: () => void) {
    if (plan === "basic") {
      // Stage the real "open the tour" action behind the modal. We
      // store it as a closure so the modal doesn't need to know URLs,
      // query strings, or anything about the host's logic.
      setPending(() => open);
      return;
    }
    // PRO / ULTRA (or still-loading — err on NOT showing the ad): go
    // straight to opening the tour.
    open();
  }

  const element = pending ? (
    <PresentUpgradeModal
      onContinue={() => {
        const run = pending;
        setPending(null);
        try {
          run();
        } catch {
          /* host swallowed its own open — nothing we can do */
        }
      }}
      onClose={() => setPending(null)}
    />
  ) : null;

  return { element, openWithGate, plan };
}

/* ---------- Sidebar counter (BASIC + PRO only; ULTRA hides) ------------ */

export function UpgradeCounter({
  orgId,
  /** Days until the "offer ends". Change at will — this is pure
   *  marketing urgency, not a real deadline. */
  days = 3,
}: {
  orgId: string | null | undefined;
  days?: number;
}) {
  const { plan, loading } = useOrgPlan(orgId);

  // Still loading, or on ULTRA — don't render anything. We'd rather
  // not render once than render-flash-then-hide, so we also gate on
  // loading rather than optimistically rendering.
  if (loading || !plan || plan === "ultra") return null;

  const target = upsellTarget(plan);
  if (!target) return null;

  return <OfferCard currentPlan={plan} target={target} days={days} />;
}

function OfferCard({
  currentPlan,
  target,
  days,
}: {
  currentPlan: Plan;
  target: Plan;
  days: number;
}) {
  const targetPrice = PLAN_PRICE_INR[target];
  const strikePrice = Math.round(targetPrice * 1.25);
  // 20% off framing — a clean "₹N off" number people can repeat.
  const savings = strikePrice - targetPrice;

  // Countdown. Resets whenever `days` changes (the LimitedOffer the
  // user had before used the same pattern, so admins who glance twice
  // in one day don't see the counter re-tick back up).
  const target_ms = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(23, 59, 59, 0);
    return d.getTime();
  }, [days]);

  const [now, setNow] = useState<number>(Date.now());
  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, []);
  const remaining = Math.max(0, target_ms - now);
  const dPart = Math.floor(remaining / 86400000);
  const h = Math.floor((remaining % 86400000) / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const s = Math.floor((remaining % 60000) / 1000);

  return (
    <div className="rounded-2xl border border-vpv-line bg-gradient-to-b from-white to-vpv-tint p-4 text-center shadow-[0_10px_30px_-16px_rgba(11,61,145,0.25)]">
      <div className="text-[9px] uppercase tracking-[0.15em] text-vpv-blue font-semibold flex items-center justify-center gap-1 mb-1">
        <Crown size={11} /> Limited time offer
      </div>
      <div className="text-[15px] font-bold text-vpv-navy mb-1">
        Upgrade to {PLAN_LABEL[target]}
      </div>
      <div className="text-[11px] text-vpv-muted mb-3 leading-snug">
        {target === "pro"
          ? "Every scene visible to customers, smoother presentations, analytics on every meeting."
          : "AI meeting coaching, team-wide MIS and auto-record."}
      </div>
      <div className="text-[13px] text-vpv-muted/70 line-through">
        {formatInr(strikePrice)}
      </div>
      <div className="text-[20px] font-extrabold text-vpv-blue mb-3">
        {formatInr(savings)} OFF
      </div>
      <div className="border-t border-vpv-line pt-3 mb-3">
        <div className="text-[10px] text-vpv-muted mb-2 flex items-center justify-center gap-1">
          <span className="text-vpv-cyan">⚡</span> Hurry! Offer ends in
        </div>
        <div className="grid grid-cols-4 gap-1">
          {[
            { v: dPart, l: "days" },
            { v: h, l: "hrs" },
            { v: m, l: "min" },
            { v: s, l: "sec" },
          ].map((t) => (
            <div
              key={t.l}
              className="rounded-md bg-white border border-vpv-line py-1"
            >
              <div className="text-[16px] font-bold text-vpv-navy tabular-nums leading-none">
                {String(t.v).padStart(2, "0")}
              </div>
              <div className="text-[8px] uppercase text-vpv-muted tracking-wider mt-1">
                {t.l}
              </div>
            </div>
          ))}
        </div>
      </div>
      <a
        href={UPGRADE_CTA_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full py-2.5 rounded-full bg-vpv-grad hover:opacity-90 text-white text-[12px] font-semibold flex items-center justify-center gap-1.5 shadow-[0_10px_28px_-8px_rgba(20,104,216,0.6)]"
      >
        UPGRADE NOW <ArrowRight size={12} />
      </a>
      <div className="text-[9.5px] text-vpv-muted/80 mt-2">
        You're on {PLAN_LABEL[currentPlan]}
      </div>
    </div>
  );
}
