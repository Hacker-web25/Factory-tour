"use client";

/**
 * Pricing-tier chrome:
 *
 *   - PresentUpgradeModal — the premium pop-up that appears every time
 *     a BASIC-plan user clicks "Present". Dismisses manually, then
 *     opens the tour via the caller's own `onContinue` callback (so
 *     the host page still owns the `window.open(/tour/…)` logic). The
 *     customer never sees it: it lives on the dashboard, between
 *     clicking Present and the tour tab opening.
 *
 *   - UpgradeCounter — the sidebar "limited offer" card. Reads the
 *     org's plan and either pitches the next tier up or hides itself
 *     for ULTRA.
 *
 *   - usePresentGate — thin wrapper around useOrgPlan that gives host
 *     pages a single `openWithGate(open, { tourTitle, totalScenes })`
 *     function; on BASIC it stages the pending URL and shows the
 *     modal, on PRO/ULTRA it jumps straight to `window.open`.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  Crown,
  Sparkles,
  X,
} from "lucide-react";
import { priceForScenes } from "@/lib/pricing";
import {
  BASIC_SCENE_CAP,
  PLAN_LABEL,
  PLAN_PRICE_INR,
  PLAN_PRICE_SUFFIX,
  UPGRADE_CTA_URL,
  formatInr,
  upsellTarget,
  useOrgPlan,
  type Plan,
} from "@/lib/planAccess";

/* ---------- Present-click upgrade modal (BASIC only) ------------------- */

export function PresentUpgradeModal({
  tourTitle,
  totalScenes,
  visibleScenes,
  onContinue,
  onClose,
}: {
  /** Shown in the subtitle so the pitch is specific to the tour the
   *  user just clicked, not a generic blurb. */
  tourTitle: string;
  /** Total scenes in this tour. Drives the "N of M" visual. If
   *  unknown, falls back to visible+5 so the strip still looks
   *  convincing without hard-coding. */
  totalScenes: number | null;
  /** Scenes the viewer actually sees today (= cap on Basic). */
  visibleScenes: number;
  onContinue: () => void;
  onClose: () => void;
}) {
  // Lock body scroll while open. Keeps the dashboard still under the
  // backdrop so the pop-up doesn't share focus with the UI it covers.
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

  const total = Math.max(
    visibleScenes + 1,
    totalScenes ?? visibleScenes + 5
  );
  const hidden = total - visibleScenes;
  const pro = PLAN_PRICE_INR.pro;
  // What those hidden rooms would cost to buy outright on Basic. A REAL
  // comparison against our own published ladder — no invented "was"
  // price — so the saving we show is one we can stand behind.
  const topUpCost = Math.max(0, priceForScenes(total) - priceForScenes(visibleScenes));

  return (
    <div
      className="fixed inset-0 z-[1000] grid place-items-center p-4 upgrade-modal-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="present-upgrade-title"
    >
      {/* All animation keyframes scoped to the modal so they don't
          leak into the host page's global stylesheet. */}
      <style jsx>{`
        .upgrade-modal-root {
          animation: upg-backdrop 240ms ease-out both;
        }
        .upg-card {
          animation: upg-pop 420ms cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
        }
        .upg-sparkle {
          animation: upg-spin 7s linear infinite;
          transform-origin: center;
        }
        .upg-shine {
          position: relative;
          overflow: hidden;
          isolation: isolate;
        }
        .upg-shine::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            100deg,
            transparent 30%,
            rgba(255, 255, 255, 0.35) 50%,
            transparent 70%
          );
          transform: translateX(-120%);
          animation: upg-shine 3.5s ease-in-out infinite;
          pointer-events: none;
          z-index: 1;
        }
        .upg-ring {
          background: conic-gradient(
            from 0deg,
            rgba(20, 104, 216, 0),
            rgba(20, 104, 216, 0.55),
            rgba(103, 232, 249, 0.65),
            rgba(20, 104, 216, 0.55),
            rgba(20, 104, 216, 0)
          );
          animation: upg-spin 6s linear infinite;
        }
        .upg-pulse {
          animation: upg-pulse 2.2s ease-in-out infinite;
        }
        .upg-scene {
          animation: upg-scene-rise 520ms cubic-bezier(0.2, 0.9, 0.3, 1.1) both;
        }
        @keyframes upg-backdrop {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes upg-pop {
          0%   { opacity: 0; transform: translateY(16px) scale(0.94); }
          60%  { opacity: 1; transform: translateY(-2px) scale(1.02); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes upg-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes upg-shine {
          0%, 55%  { transform: translateX(-120%); }
          80%      { transform: translateX(120%); }
          100%     { transform: translateX(120%); }
        }
        @keyframes upg-pulse {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50%      { opacity: 0.9;  transform: scale(1.08); }
        }
        @keyframes upg-scene-rise {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Backdrop: softer than a pure dim, with a radial gradient of
          the brand colour so the modal looks lit rather than cheaply
          overlaid. Click-outside closes, matching the X. */}
      <div
        className="absolute inset-0"
        onClick={onClose}
        style={{
          background:
            "radial-gradient(circle at 50% 40%, rgba(20,104,216,0.35) 0%, rgba(5,10,30,0.72) 55%, rgba(0,0,0,0.78) 100%)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      />

      <div
        className="upg-card relative w-full max-w-[480px] rounded-[28px] overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #ffffff 0%, #f6f9ff 100%)",
          boxShadow:
            "0 40px 100px -20px rgba(11,61,145,0.55), 0 0 0 1px rgba(20,104,216,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
        }}
      >
        {/* Hero band — subtle animated gradient top strip + crown. */}
        <div
          className="relative h-[112px] overflow-hidden"
          style={{
            background:
              "linear-gradient(135deg, #0B3D91 0%, #1468D8 48%, #38BDF8 100%)",
          }}
        >
          {/* Decorative orbs for depth. */}
          <div
            className="absolute -top-10 -right-10 w-40 h-40 rounded-full upg-pulse"
            style={{
              background:
                "radial-gradient(circle, rgba(255,255,255,0.4) 0%, transparent 70%)",
            }}
          />
          <div
            className="absolute -bottom-14 -left-6 w-44 h-44 rounded-full upg-pulse"
            style={{
              animationDelay: "0.6s",
              background:
                "radial-gradient(circle, rgba(103,232,249,0.4) 0%, transparent 70%)",
            }}
          />

          {/* Spinning conic ring + crown badge, centred. */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative h-16 w-16">
              <div className="upg-ring absolute inset-0 rounded-full blur-[2px]" />
              <div className="absolute inset-[3px] rounded-full bg-white shadow-xl grid place-items-center">
                <Crown size={24} className="text-vpv-blue" />
              </div>
              <Sparkles
                size={10}
                className="upg-sparkle absolute -top-1 -right-1 text-amber-300 drop-shadow"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 h-8 w-8 grid place-items-center rounded-full text-white/80 hover:text-white hover:bg-white/15 transition-colors z-10"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-7 pt-6 pb-7">
          <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-vpv-blue font-bold mb-3 bg-vpv-tint px-2.5 py-1 rounded-full">
            <Sparkles size={10} /> Pro experience
          </div>

          <h3
            id="present-upgrade-title"
            className="text-[22px] font-bold text-vpv-navy leading-tight mb-2 tracking-tight"
          >
            Let your customer walk{" "}
            <span className="relative inline-block">
              every room
              <span
                aria-hidden
                className="absolute inset-x-0 -bottom-0.5 h-[6px] rounded-full"
                style={{
                  background:
                    "linear-gradient(90deg, #38BDF8 0%, #1468D8 100%)",
                  opacity: 0.25,
                }}
              />
            </span>
            .
          </h3>
          <p className="text-[13px] text-vpv-muted leading-relaxed mb-5">
            Right now your customer sees only{" "}
            <span className="font-semibold text-vpv-navy">
              {visibleScenes} of {total} scenes
            </span>{" "}
            in <span className="font-medium text-vpv-ink">{tourTitle}</span>.
            Pro unlocks the full plant so they can trust what they're
            buying — before they say yes.
          </p>

          {/* Visual: the real scene strip. First N bright, the rest
              muted + sealed with a soft gradient. Makes the gap
              concrete without using the word "locked". */}
          <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-vpv-line p-4 mb-5">
            <div className="flex items-center justify-between mb-2.5">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-vpv-muted">
                Scene visibility
              </div>
              <div className="text-[11px] text-vpv-muted">
                <span className="font-bold text-vpv-navy">
                  {visibleScenes}
                </span>
                <span className="opacity-60"> of {total} shown</span>
              </div>
            </div>
            <div className="flex gap-1.5">
              {Array.from({ length: total }).map((_, i) => {
                const shown = i < visibleScenes;
                return (
                  <div
                    key={i}
                    className="upg-scene flex-1 aspect-[4/3] rounded-md relative overflow-hidden"
                    style={{
                      animationDelay: `${160 + i * 55}ms`,
                      background: shown
                        ? "linear-gradient(135deg, #1468D8 0%, #38BDF8 100%)"
                        : "linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)",
                      boxShadow: shown
                        ? "0 4px 12px -4px rgba(20,104,216,0.5), inset 0 1px 0 rgba(255,255,255,0.4)"
                        : "inset 0 0 0 1px rgba(100,116,139,0.15)",
                    }}
                  >
                    {!shown && (
                      <div
                        aria-hidden
                        className="absolute inset-0 opacity-70"
                        style={{
                          background:
                            "repeating-linear-gradient(135deg, transparent 0 4px, rgba(255,255,255,0.5) 4px 5px)",
                        }}
                      />
                    )}
                    {shown && (
                      <div className="absolute bottom-1 right-1 text-white/90">
                        <Check size={9} strokeWidth={3} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {hidden > 0 && (
              <div className="mt-2 text-[11px] text-vpv-muted/90 flex items-center gap-1">
                <Crown size={10} className="text-amber-500" />
                {hidden} more {hidden === 1 ? "scene" : "scenes"} waiting on
                Pro.
              </div>
            )}
          </div>

          {/* Benefit chips — a quick visual trio of what Pro adds. */}
          <div className="grid grid-cols-3 gap-2 mb-6">
            {[
              { icon: "👁", label: "Every scene" },
              { icon: "⚡", label: "Faster meetings" },
              { icon: "📊", label: "Meeting insights" },
            ].map((b) => (
              <div
                key={b.label}
                className="rounded-xl bg-vpv-tint/60 border border-vpv-line/70 py-2 px-2 text-center"
              >
                <div className="text-[16px] leading-none mb-1">{b.icon}</div>
                <div className="text-[10px] font-semibold text-vpv-navy">
                  {b.label}
                </div>
              </div>
            ))}
          </div>

          {/* Price line. The comparison on the right is against our own
              published scene ladder — a true number, not a fake "was". */}
          <div className="flex items-end justify-between mb-4 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-vpv-muted font-semibold">
                Pro
              </div>
              <div className="flex items-baseline gap-1.5">
                <div className="text-[22px] font-extrabold text-vpv-blue tracking-tight">
                  {formatInr(pro)}
                </div>
                <div className="text-[11px] text-vpv-muted/80">per month</div>
              </div>
              <div className="text-[10px] text-vpv-muted/80">
                Unlimited scenes, support included
              </div>
            </div>
            {topUpCost > 0 && (
              <div className="text-[10px] font-semibold text-vpv-navy bg-vpv-tint px-2.5 py-1.5 rounded-xl border border-vpv-blue/20 text-right leading-snug max-w-[150px]">
                Buying these {hidden} room{hidden === 1 ? "" : "s"} outright
                costs {formatInr(topUpCost)}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <a
              href={UPGRADE_CTA_URL}
              className="upg-shine flex-1 py-3 rounded-full text-white text-[13.5px] font-bold flex items-center justify-center gap-1.5 relative"
              style={{
                background:
                  "linear-gradient(135deg, #0B3D91 0%, #1468D8 55%, #38BDF8 100%)",
                boxShadow:
                  "0 14px 32px -10px rgba(20,104,216,0.65), inset 0 1px 0 rgba(255,255,255,0.3)",
              }}
            >
              <span className="relative z-[2] flex items-center gap-1.5">
                Upgrade to Pro <ArrowRight size={14} />
              </span>
            </a>
            <button
              type="button"
              onClick={onContinue}
              className="py-3 px-4 rounded-full text-vpv-muted hover:text-vpv-navy text-[12px] font-medium transition-colors"
            >
              Not now
            </button>
          </div>
          <p className="text-center text-[10.5px] text-vpv-muted/70 mt-3">
            Press <span className="font-semibold">Not now</span> to keep
            presenting on Basic.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------- Hook: "open a tour with the plan gate in the way" ---------- */

type GateContext = {
  tourTitle: string;
  totalScenes: number | null;
  visibleScenes: number;
};

/** Caller usage:
 *
 *     const gate = usePresentGate(me?.org_id);
 *     // in Present click: gate.openWithGate(
 *     //   () => window.open(url, "_blank"),
 *     //   { tourTitle: t.title, totalScenes: t.scene_count, … }
 *     // );
 *     // in JSX:            {gate.element}
 */
export function usePresentGate(orgId: string | null | undefined) {
  const { plan, sceneCap } = useOrgPlan(orgId);
  const [pending, setPending] = useState<
    null | { run: () => void; ctx: GateContext }
  >(null);

  function openWithGate(
    open: () => void,
    ctx: {
      tourTitle: string;
      totalScenes: number | null;
    }
  ) {
    if (plan === "basic") {
      setPending({
        run: open,
        ctx: {
          tourTitle: ctx.tourTitle,
          totalScenes: ctx.totalScenes,
          visibleScenes: sceneCap ?? BASIC_SCENE_CAP,
        },
      });
      return;
    }
    // PRO / ULTRA (or still-loading — err on NOT showing the ad):
    // go straight to opening the tour.
    open();
  }

  const element = pending ? (
    <PresentUpgradeModal
      tourTitle={pending.ctx.tourTitle}
      totalScenes={pending.ctx.totalScenes}
      visibleScenes={pending.ctx.visibleScenes}
      onContinue={() => {
        const run = pending.run;
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
}: {
  orgId: string | null | undefined;
}) {
  const { plan, loading } = useOrgPlan(orgId);

  // Still loading, or on ULTRA — don't render anything. Gate on
  // loading too, so there's no render-flash-then-hide.
  if (loading || !plan || plan === "ultra") return null;

  const target = upsellTarget(plan);
  if (!target) return null;

  return <OfferCard currentPlan={plan} target={target} />;
}

function OfferCard({
  currentPlan,
  target,
}: {
  currentPlan: Plan;
  target: Plan;
}) {
  const targetPrice = PLAN_PRICE_INR[target];

  return (
    <div className="rounded-2xl border border-vpv-line bg-gradient-to-b from-white to-vpv-tint p-4 text-center shadow-[0_10px_30px_-16px_rgba(11,61,145,0.25)]">
      <div className="text-[9px] uppercase tracking-[0.15em] text-vpv-blue font-semibold flex items-center justify-center gap-1 mb-1">
        <Crown size={11} /> Room to grow
      </div>
      <div className="text-[15px] font-bold text-vpv-navy mb-1">
        Upgrade to {PLAN_LABEL[target]}
      </div>
      <div className="text-[11px] text-vpv-muted mb-3 leading-snug">
        {target === "pro"
          ? "Every scene visible to customers, smoother presentations, analytics on every meeting."
          : "AI meeting coaching, team-wide MIS and auto-record."}
      </div>
      <div className="text-[26px] font-extrabold text-vpv-blue leading-none">
        {formatInr(targetPrice)}
      </div>
      <div className="text-[10.5px] text-vpv-muted mb-3">
        {PLAN_PRICE_SUFFIX[target]} · unlimited scenes
      </div>
      <div className="border-t border-vpv-line pt-3 mb-3 text-[10.5px] leading-relaxed text-vpv-muted">
        {target === "pro"
          ? "No scene limit — every room you build is a room your customer walks through."
          : "Adds AI meeting review on top of everything in Pro."}
      </div>
      <a
        href={UPGRADE_CTA_URL}
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
