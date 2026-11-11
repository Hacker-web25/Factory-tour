/**
 * The opening screen of the funnel (/assessment).
 *
 * Instead of a stock photo and a paragraph, it shows the same "Five simple
 * steps" overview as the How it works page — the exact same five steps and
 * copy — so a visitor sees the whole journey (quote → live VPV) before the
 * first field. Same content as the marketing page, richer motion.
 *
 * The step bar sits *below* this overview on the first step (here the point
 * is the preview); from the next step on, the header shows progress instead.
 *
 * Animations are decorative and gated behind prefers-reduced-motion, so the
 * reduced-motion render is the final, fully-visible state with no movement.
 */

"use client";

import { CheckCircle2 } from "lucide-react";
import { StepBar } from "@/components/funnel/FunnelShell";

type Step = { n: number; title: string; text: string; facts?: string[] };

// Exact copy from the How it works page (the Er step list).
const STEPS: Step[] = [
  {
    n: 1,
    title: "Find your VPV",
    text: "Answer a few simple questions about your factory areas and processes. We recommend the right plan and explain why.",
  },
  {
    n: 2,
    title: "Confirm & pay online",
    text: "See every charge upfront, including GST, cab travel and support, hosting & security, then confirm your order.",
  },
  {
    n: 3,
    title: "Book your shoot",
    text: "Request a preferred shoot date. Our team confirms availability within 1 working day.",
  },
  {
    n: 4,
    title: "We shoot your plant",
    text: "Our team comes to your plant and captures it as it operates every day. We keep the shoot time low so production is not disturbed.",
    facts: ["1–5 hours. Your factory keeps running.", "No MD needed at the factory. No production disruption."],
  },
  {
    n: 5,
    title: "Your VPV goes live",
    text: "After the shoot, we turn the captured factory into your interactive VPV with your team, without affecting your production. Delivery depends on the scale and complexity of the plant.",
    facts: ["Typically 1 to 3 weeks after the shoot."],
  },
];

const CSS = `
@keyframes vpvji-rise{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}
@keyframes vpvji-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes vpvji-sheen{0%{background-position:-150% 0}100%{background-position:250% 0}}
@keyframes vpvji-pop{0%{opacity:0;transform:scale(.6)}100%{opacity:1;transform:scale(1)}}
.vpvji-card{opacity:1}
.vpvji-accent{background:linear-gradient(90deg,#0B3D91,#1468D8 52%,#19B8F2)}
.vpvji-chip{opacity:1}
@media (prefers-reduced-motion:no-preference){
  .vpvji-card{opacity:0;animation:vpvji-rise .6s cubic-bezier(.22,1,.36,1) both}
  .vpvji-float{animation:vpvji-float 3.6s ease-in-out infinite}
  .vpvji-accent{background:linear-gradient(90deg,#0B3D91,#1468D8,#19B8F2,#1468D8,#0B3D91);background-size:220% 100%;animation:vpvji-sheen 3.2s linear infinite}
  .vpvji-chip{opacity:0;animation:vpvji-pop .4s ease-out both}
}
`;

export default function FunnelIntro() {
  return (
    <div className="border-b border-vpv-line bg-vpv-canvas">
      <style>{CSS}</style>
      <div className="mx-auto max-w-6xl px-5 pt-7 pb-8">
        <h1 className="text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-vpv-ink sm:text-[32px]">
          Five simple steps
        </h1>
        <p className="mt-2 max-w-[44rem] text-[14.5px] leading-relaxed text-slate-600">
          The whole journey, from your quote to a live VPV. You can stop any time; your answers stay saved on this device.
        </p>

        <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((st, i) => (
            <li
              key={st.n}
              className="vpvji-card group relative flex flex-col overflow-hidden rounded-xl border border-vpv-line bg-[linear-gradient(180deg,#ffffff,#F4F8FD)] p-4 shadow-[0_1px_2px_rgba(11,61,145,0.05),0_16px_32px_-18px_rgba(11,61,145,0.22)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_44px_-16px_rgba(11,61,145,0.34)]"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <span className="vpvji-accent absolute left-0 right-0 top-0 h-[4px]" aria-hidden />
              <div className="flex items-center gap-2.5">
                <span
                  className="vpvji-float flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[14px] font-bold text-white shadow-[0_10px_18px_-8px_rgba(20,104,216,0.6)]"
                  style={{ background: "linear-gradient(135deg,#0B3D91,#1468D8)", animationDelay: `${i * 0.3}s` }}
                >
                  {st.n}
                </span>
                <p className="text-[15px] font-bold leading-tight text-vpv-ink">{st.title}</p>
              </div>
              <p className="mt-2.5 text-[12.5px] leading-snug text-slate-600">{st.text}</p>
              {st.facts && (
                <ul className="mt-2.5 space-y-1.5">
                  {st.facts.map((f, fi) => (
                    <li
                      key={f}
                      className="vpvji-chip flex gap-1.5 rounded-lg border border-[#CFE0FB] bg-[#EAF2FE] px-2 py-1.5 text-[11.5px] font-semibold leading-snug text-vpv-ink"
                      style={{ animationDelay: `${0.5 + i * 0.1 + fi * 0.12}s` }}
                    >
                      <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-vpv-blue" aria-hidden />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>

        {/* Progress bar now sits below the overview */}
        <div className="mt-7">
          <StepBar current={0} />
        </div>
      </div>
    </div>
  );
}
