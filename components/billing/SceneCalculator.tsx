"use client";

/**
 * SceneCalculator — the heart of the Basic plan.
 *
 * The customer drags a slider to choose how many scenes they want. The
 * number that dominates the card is the PRICE PER SCENE, because that
 * is the number that falls as they drag right. Watching ₹4,500 become
 * ₹2,750 is what makes a bigger pack feel like a better deal — and
 * every extra scene costs us nothing to serve.
 *
 * The maths lives in lib/pricing.ts and is re-run on the server when the
 * order is created, so what is shown here is always what is charged.
 *
 * Two modes:
 *   display  — on the public pricing page, with a button that routes on
 *   checkout — inside /get-started, where `onChange` drives the form
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, TrendingDown } from "lucide-react";
import {
  SCENE_DEFAULT,
  SCENE_MAX,
  SCENE_MIN,
  anchorPricePerScene,
  clampScenes,
  inr,
  priceForScenes,
  pricePerScene,
  sceneSavings,
} from "@/lib/pricing";

/** Count up or down to a new number so the price feels alive. */
function useAnimatedNumber(target: number, ms = 320): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    startRef.current = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - startRef.current) / ms);
      // ease-out so it settles rather than stopping dead
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = target;
    };
  }, [target, ms]);

  return value;
}

export default function SceneCalculator({
  value,
  onChange,
  onSubmit,
  submitLabel = "Continue",
  compact = false,
}: {
  value?: number;
  onChange?: (scenes: number) => void;
  onSubmit?: (scenes: number) => void;
  submitLabel?: string;
  compact?: boolean;
}) {
  const [internal, setInternal] = useState(SCENE_DEFAULT);
  const scenes = clampScenes(value ?? internal);

  function set(n: number) {
    const c = clampScenes(n);
    setInternal(c);
    onChange?.(c);
  }

  const total = priceForScenes(scenes);
  const per = pricePerScene(scenes);
  const savings = useMemo(() => sceneSavings(scenes), [scenes]);
  const anchor = anchorPricePerScene();

  const animatedPer = useAnimatedNumber(per);
  const animatedTotal = useAnimatedNumber(total);

  // How far along the slider we are, for the filled track.
  const progress = ((scenes - SCENE_MIN) / (SCENE_MAX - SCENE_MIN)) * 100;

  return (
    <div
      data-vpv-calculator
      className={`vpv-calc-card relative overflow-hidden rounded-3xl border border-vpv-blue/20 bg-white ${
        compact ? "p-6" : "p-7 sm:p-9"
      } shadow-[0_30px_80px_-40px_rgba(11,61,145,0.45)]`}
    >
      {/* Soft brand wash behind the hero number */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(70% 60% at 85% 0%, rgba(25,184,242,0.12), rgba(255,255,255,0) 62%), radial-gradient(55% 55% at 0% 10%, rgba(20,104,216,0.09), rgba(255,255,255,0) 58%)",
        }}
      />

      <div className="relative">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-vpv-blue">
            Build your plan
          </div>
          {savings.percent > 0 && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[12px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
              <TrendingDown size={13} />
              {savings.percent}% off per scene
            </div>
          )}
        </div>

        {/* ── THE HERO: price per scene ─────────────────────────────── */}
        <div className="mt-5 flex flex-wrap items-end gap-x-4 gap-y-1">
          <div
            className={`font-semibold tracking-tight text-vpv-ink leading-[0.95] tabular-nums ${
              compact ? "text-[56px]" : "text-[72px] sm:text-[88px]"
            }`}
          >
            {inr(animatedPer)}
          </div>
          <div className="pb-2 sm:pb-3">
            <div className="text-[15px] font-medium text-vpv-ink">per scene</div>
            {savings.percent > 0 && (
              <div className="text-[13px] text-slate-500">
                <span className="line-through">{inr(anchor)}</span> at {SCENE_MIN} scenes
              </div>
            )}
          </div>
        </div>

        <p className="mt-2 text-[14px] text-slate-600">
          The more rooms you show, the less each one costs.
        </p>

        {/* ── Slider ───────────────────────────────────────────────── */}
        <div className="mt-7">
          <div className="flex items-end justify-between mb-3">
            <label htmlFor="vpv-scene-slider" className="text-[13px] font-medium text-vpv-ink">
              Scenes in your tour
            </label>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[26px] font-semibold tabular-nums text-vpv-navy leading-none">
                {scenes}
              </span>
              <span className="text-[13px] text-slate-500">
                of {SCENE_MAX} max
              </span>
            </div>
          </div>

          <div className="relative">
            <input
              id="vpv-scene-slider"
              type="range"
              min={SCENE_MIN}
              max={SCENE_MAX}
              step={1}
              value={scenes}
              onChange={(e) => set(Number(e.target.value))}
              aria-label="Number of scenes"
              aria-valuetext={`${scenes} scenes, ${inr(per)} per scene, ${inr(total)} total`}
              className="vpv-range w-full"
              style={{ "--vpv-progress": `${progress}%` } as React.CSSProperties}
            />
          </div>

          <div className="mt-2 flex justify-between text-[11.5px] text-slate-400 tabular-nums">
            <span>{SCENE_MIN}</span>
            <span>{Math.round((SCENE_MIN + SCENE_MAX) / 2)}</span>
            <span>{SCENE_MAX}</span>
          </div>

          {/* Quick picks — most people do not want to drag precisely. */}
          <div className="mt-4 flex flex-wrap gap-2">
            {[SCENE_MIN, 5, 8, 12, SCENE_MAX].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => set(n)}
                className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                  scenes === n
                    ? "bg-vpv-navy text-white"
                    : "bg-vpv-canvas text-vpv-muted hover:bg-vpv-tint hover:text-vpv-navy"
                }`}
              >
                {n} scenes
              </button>
            ))}
          </div>
        </div>

        {/* ── Total ────────────────────────────────────────────────── */}
        <div className="mt-7 rounded-2xl border border-vpv-line bg-vpv-canvas/70 p-5">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[12px] uppercase tracking-[0.1em] text-vpv-muted font-semibold">
                You pay once
              </div>
              <div className="mt-1 text-[32px] font-semibold tracking-tight text-vpv-ink tabular-nums leading-none">
                {inr(animatedTotal)}
              </div>
              <div className="mt-1.5 text-[12.5px] text-slate-500">
                Inclusive of 18% GST · no monthly fee
              </div>
            </div>
            {savings.amount > 0 && (
              <div className="text-right">
                <div className="text-[13px] text-slate-500 line-through tabular-nums">
                  {inr(anchor * scenes)}
                </div>
                <div className="text-[14px] font-semibold text-emerald-600 tabular-nums">
                  You save {inr(savings.amount)}
                </div>
              </div>
            )}
          </div>

          <ul className="mt-4 grid gap-2 sm:grid-cols-2 text-[13px] text-slate-600">
            {[
              "First year of technical support free",
              "Your own branded workspace",
              "Every feature of Pro",
              "Yours to keep — no subscription",
            ].map((f) => (
              <li key={f} className="flex gap-2">
                <Check size={15} className="mt-0.5 shrink-0 text-vpv-blue" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        {onSubmit && (
          <button
            type="button"
            onClick={() => onSubmit(scenes)}
            className="mt-6 w-full rounded-full bg-vpv-grad py-3.5 text-[15px] font-semibold text-white shadow-[0_16px_36px_-14px_rgba(20,104,216,0.75)] hover:opacity-95 active:scale-[0.995] transition-all"
          >
            {submitLabel} — {inr(total)}
          </button>
        )}
      </div>

      {/* The range input is styled by hand: browsers disagree about
          every part of it, so each engine gets its own rules. */}
      <style jsx>{`
        .vpv-range {
          -webkit-appearance: none;
          appearance: none;
          height: 36px;
          background: transparent;
          cursor: pointer;
        }
        .vpv-range::-webkit-slider-runnable-track {
          height: 8px;
          border-radius: 999px;
          background: linear-gradient(
            to right,
            #0b3d91 0%,
            #1468d8 var(--vpv-progress),
            #e2e8f0 var(--vpv-progress),
            #e2e8f0 100%
          );
        }
        .vpv-range::-moz-range-track {
          height: 8px;
          border-radius: 999px;
          background: #e2e8f0;
        }
        .vpv-range::-moz-range-progress {
          height: 8px;
          border-radius: 999px;
          background: linear-gradient(to right, #0b3d91, #1468d8);
        }
        .vpv-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          margin-top: -8px;
          width: 24px;
          height: 24px;
          border-radius: 999px;
          background: #ffffff;
          border: 3px solid #1468d8;
          box-shadow: 0 6px 18px -4px rgba(20, 104, 216, 0.65);
          transition: transform 120ms ease;
        }
        .vpv-range::-moz-range-thumb {
          width: 24px;
          height: 24px;
          border-radius: 999px;
          background: #ffffff;
          border: 3px solid #1468d8;
          box-shadow: 0 6px 18px -4px rgba(20, 104, 216, 0.65);
        }
        .vpv-range:active::-webkit-slider-thumb {
          transform: scale(1.12);
        }
        .vpv-range:focus-visible::-webkit-slider-thumb {
          outline: 3px solid rgba(20, 104, 216, 0.35);
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .vpv-range::-webkit-slider-thumb {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
