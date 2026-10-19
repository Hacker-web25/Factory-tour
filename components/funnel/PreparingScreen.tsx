/**
 * The moment between "Your details" and "What to show".
 *
 * The visitor has just told us what their factory makes; the next page is
 * built around that answer. This screen makes the hand-over visible: the
 * VPV logo inside a ring that sweeps a full 360° — the thing a VPV does to
 * a factory floor — and a short checklist that ticks through what is being
 * prepared, in their own words ("your textile plant in Panipat").
 *
 * About three seconds, which is long enough to read and short enough not
 * to feel like waiting. Visitors who have asked their system for reduced
 * motion get a still logo and a shorter pause.
 */

"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { VPV_LOGO_URL } from "@/components/dashboard/VpvLogo";

const STEP_MS = 680;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    /* intentional — very old browsers; assume motion is fine */
    return false;
  }
}

/** How long the screen stays up. Step 1 waits this long (and for the lead
 *  to save) before moving on. */
export function preparingDurationMs(): number {
  return prefersReducedMotion() ? 1_200 : STEP_MS * 4 + 400;
}

export default function PreparingScreen({
  industry,
  city,
}: {
  /** "textile", "food and packaging" — or empty when nothing matched. */
  industry: string;
  city: string;
}) {
  const [done, setDone] = useState(0);
  const reduced = prefersReducedMotion();

  const steps = [
    industry ? `Understanding your ${industry} plant${city ? ` in ${city}` : ""}` : "Understanding what you make",
    "Picking the areas your buyers ask to see",
    "Choosing the processes worth filming",
    "Setting up your page",
  ];

  useEffect(() => {
    const per = reduced ? 250 : STEP_MS;
    const timers = steps.map((_, i) => setTimeout(() => setDone(i + 1), per * (i + 1)));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mount; steps are fixed for it
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-white px-6"
      style={{
        backgroundImage:
          "radial-gradient(55% 45% at 50% 38%, rgba(25,184,242,0.14), rgba(255,255,255,0) 70%), radial-gradient(40% 35% at 50% 40%, rgba(20,104,216,0.10), rgba(255,255,255,0) 70%)",
      }}
      role="status"
      aria-live="polite"
    >
      <style>{`
        @keyframes vpv-sweep { to { transform: rotate(360deg) } }
        @keyframes vpv-counter { to { transform: rotate(-360deg) } }
        @keyframes vpv-breathe { 0%,100% { transform: scale(1) } 50% { transform: scale(1.035) } }
        @keyframes vpv-rise { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
        .vpv-sweep { animation: vpv-sweep 1.6s linear infinite }
        .vpv-counter { animation: vpv-counter 9s linear infinite }
        .vpv-breathe { animation: vpv-breathe 2.4s ease-in-out infinite }
        .vpv-rise { animation: vpv-rise .5s ease-out both }
        @media (prefers-reduced-motion: reduce) {
          .vpv-sweep, .vpv-counter, .vpv-breathe { animation: none }
          .vpv-rise { animation: none }
        }
      `}</style>

      <div className="flex w-full max-w-md flex-col items-center text-center">
        {/* The logo in a 360° sweep. */}
        <div className="relative h-44 w-44">
          <div
            className="vpv-sweep absolute inset-0 rounded-full"
            style={{
              background:
                "conic-gradient(from 0deg, rgba(25,184,242,0) 0deg, rgba(25,184,242,0) 200deg, #19B8F2 300deg, #1468D8 352deg, rgba(20,104,216,0) 360deg)",
              WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 4px))",
              mask: "radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 4px))",
            }}
          />
          <div className="vpv-counter absolute inset-[14px] rounded-full border border-dashed border-vpv-blue/25" />
          <div className="vpv-breathe absolute inset-[26px] flex items-center justify-center rounded-full bg-white shadow-[0_18px_40px_-18px_rgba(11,61,145,0.55)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={VPV_LOGO_URL} alt="VPV" className="h-9 w-auto" />
          </div>
        </div>

        <h2 className="mt-9 text-[24px] font-semibold leading-snug tracking-[-0.01em] text-vpv-ink sm:text-[28px]">
          Working out the areas your buyers will want to see
        </h2>

        <ul className="mt-7 w-full max-w-sm space-y-3 text-left">
          {steps.map((label, i) => {
            const isDone = i < done;
            const isNow = i === done;
            return (
              <li
                key={label}
                className={`flex items-center gap-3 text-[14.5px] transition-colors ${
                  isDone ? "text-vpv-ink" : isNow ? "text-vpv-ink" : "text-slate-400"
                } ${i <= done ? "vpv-rise" : ""}`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors ${
                    isDone ? "bg-vpv-blue text-white" : isNow ? "border-2 border-vpv-blue/30 border-t-vpv-blue vpv-sweep" : "border border-vpv-line"
                  }`}
                >
                  {isDone && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />}
                </span>
                {label}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
