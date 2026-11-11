/**
 * The opening screen of the funnel (/assessment).
 *
 * A visitor landing here is about to hand over details, so before the first
 * field we show the whole path — all six steps, what each one asks, and that
 * it takes a couple of minutes. It answers "what am I getting into?" up front
 * instead of making them discover the shape of the form one screen at a time.
 *
 * The step bar sits *below* this overview (not above it, as on later steps):
 * here the point is the preview; from the next step on, the point is progress.
 *
 * Animations are decorative and gated behind prefers-reduced-motion, so the
 * reduced-motion render is the final, fully-visible state with no movement.
 */

"use client";

import { CreditCard, Eye, Layers, ShieldCheck, Sparkles, UserRound, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { StepBar } from "@/components/funnel/FunnelShell";

type JourneyStep = { n: number; icon: LucideIcon; label: string; blurb: string };

const JOURNEY: JourneyStep[] = [
  { n: 1, icon: UserRound,   label: "Your details", blurb: "Who you are and where your plant is." },
  { n: 2, icon: Eye,         label: "What to show", blurb: "Pick the areas and proof buyers should see." },
  { n: 3, icon: ShieldCheck, label: "Protection",   blurb: "Choose who can open your VPV, and how." },
  { n: 4, icon: Users,       label: "Sales team",   blurb: "Give each salesperson their own login." },
  { n: 5, icon: Layers,      label: "Your plan",    blurb: "A plan matched to your factory, costs shown upfront." },
  { n: 6, icon: CreditCard,  label: "Billing",      blurb: "Pay securely with a GST invoice, then we schedule." },
];

const CSS = `
@keyframes vpvji-rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
@keyframes vpvji-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes vpvji-drawX{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes vpvji-drawY{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes vpvji-ring{0%{transform:scale(1);opacity:.5}70%{transform:scale(2);opacity:0}100%{opacity:0}}
.vpvji-node{opacity:1}
.vpvji-fillX{transform:scaleX(1);transform-origin:left}
.vpvji-fillY{transform:scaleY(1);transform-origin:top}
.vpvji-ring{opacity:0}
@media (prefers-reduced-motion:no-preference){
  .vpvji-node{opacity:0;animation:vpvji-rise .62s cubic-bezier(.22,1,.36,1) both}
  .vpvji-float{animation:vpvji-float 3.6s ease-in-out infinite}
  .vpvji-fillX{transform:scaleX(0);animation:vpvji-drawX 1.5s .25s cubic-bezier(.4,0,.2,1) forwards}
  .vpvji-fillY{transform:scaleY(0);animation:vpvji-drawY 1.5s .25s cubic-bezier(.4,0,.2,1) forwards}
  .vpvji-ring{animation:vpvji-ring 2.4s ease-out infinite}
}
`;

function Badge({ step, index }: { step: JourneyStep; index: number }) {
  const Icon = step.icon;
  const here = index === 0;
  return (
    <div className="relative shrink-0">
      {here && <span className="vpvji-ring absolute inset-0 rounded-full bg-vpv-blue" aria-hidden />}
      <span
        className="vpvji-float relative flex h-[52px] w-[52px] items-center justify-center rounded-full text-white shadow-[0_14px_24px_-10px_rgba(20,104,216,0.65)]"
        style={{
          background: here ? "linear-gradient(135deg,#1468D8,#19B8F2)" : "linear-gradient(135deg,#0B3D91,#1468D8)",
          animationDelay: `${index * 0.3}s`,
        }}
      >
        <Icon className="h-5 w-5" strokeWidth={2.2} aria-hidden />
        <span className="absolute -right-1.5 -top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-white text-[11px] font-bold text-vpv-blue shadow-[0_2px_6px_rgba(11,61,145,0.25)]">
          {step.n}
        </span>
      </span>
    </div>
  );
}

export default function FunnelIntro() {
  return (
    <div className="border-b border-vpv-line bg-vpv-canvas">
      <style>{CSS}</style>
      <div className="mx-auto max-w-5xl px-5 pt-8 pb-10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-vpv-tint px-3 py-1 text-[12px] font-semibold text-vpv-blue">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Takes about two minutes
        </span>
        <h1 className="mt-4 text-[30px] font-semibold leading-[1.12] tracking-[-0.02em] text-vpv-ink sm:text-[40px]">
          Your quote, in six simple steps
        </h1>
        <p className="mt-3 max-w-[40rem] text-[16px] leading-relaxed text-slate-600">
          No surprises &mdash; here&rsquo;s everything we&rsquo;ll ask, and why. Each step is quick, and we explain
          every number as it comes up. You can stop any time; your answers stay saved on this device.
        </p>

        {/* Horizontal journey — large screens */}
        <div className="relative mt-10 hidden lg:block">
          <div className="absolute left-[8.333%] right-[8.333%] top-[26px] h-[3px] -translate-y-1/2 rounded-full bg-vpv-line" aria-hidden />
          <div className="vpvji-fillX absolute left-[8.333%] right-[8.333%] top-[26px] h-[3px] -translate-y-1/2 rounded-full bg-vpv-grad" aria-hidden />
          <ol className="relative grid grid-cols-6 gap-4">
            {JOURNEY.map((st, i) => (
              <li
                key={st.label}
                className="vpvji-node flex flex-col items-center text-center"
                style={{ animationDelay: `${0.15 + i * 0.11}s` }}
              >
                <Badge step={st} index={i} />
                <p className="mt-4 text-[14px] font-semibold text-vpv-ink">{st.label}</p>
                <p className="mt-1 text-[12.5px] leading-snug text-slate-500">{st.blurb}</p>
                {i === 0 && (
                  <span className="mt-2 inline-block rounded-full bg-vpv-tint px-2 py-0.5 text-[11px] font-semibold text-vpv-blue">
                    You&rsquo;re here
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>

        {/* Vertical journey — small screens */}
        <ol className="relative mt-8 space-y-5 lg:hidden">
          <div className="absolute left-[25px] top-3 bottom-3 w-[3px] rounded-full bg-vpv-line" aria-hidden />
          <div className="vpvji-fillY absolute left-[25px] top-3 bottom-3 w-[3px] rounded-full bg-vpv-grad" aria-hidden />
          {JOURNEY.map((st, i) => (
            <li
              key={st.label}
              className="vpvji-node relative flex gap-4"
              style={{ animationDelay: `${0.15 + i * 0.1}s` }}
            >
              <Badge step={st} index={i} />
              <div className="pt-1.5">
                <p className="text-[15px] font-semibold text-vpv-ink">
                  {st.label}
                  {i === 0 && (
                    <span className="ml-2 rounded-full bg-vpv-tint px-2 py-0.5 text-[11px] font-semibold text-vpv-blue">
                      You&rsquo;re here
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-[13px] leading-snug text-slate-500">{st.blurb}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* Progress bar now sits below the overview */}
        <div className="mt-10">
          <StepBar current={0} />
        </div>
      </div>
    </div>
  );
}
