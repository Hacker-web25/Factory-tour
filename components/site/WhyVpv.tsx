/**
 * /why-vpv — what a virtual plant visit does for a manufacturer's sales.
 *
 * The nine benefits from the site (Benefits & capabilities, word for word),
 * grouped into three themes and laid out to be read, not scanned as a grid
 * of boxes; then how VPV converts buyers, Mr. Anuj Anand's story and the
 * call to action.
 *
 * The lead calculator that used to live here moved to the home page's
 * scroll story (public/home-story), which sends the same calculator_used
 * event, so the owner's calculator report keeps working.
 */

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  BadgeCheck,
  ClipboardCheck,
  Eye,
  Factory,
  Handshake,
  MapPin,
  Play,
  Presentation,
  ShieldCheck,
  Trophy,
  Users,
  Video,
  Workflow,
  type LucideIcon,
} from "lucide-react";

const NAVY = "#0B3D91";
const BLUE = "#1468D8";
const CYAN = "#19B8F2";

type Benefit = { icon: LucideIcon; title: string; text: string };

// Copy is the site's Benefits & capabilities list, word for word; only the
// grouping and the three theme names are new.
const GROUPS: { name: string; items: Benefit[] }[] = [
  {
    name: "Win the buyer's confidence",
    items: [
      { icon: Trophy, title: "Edge over your competition", text: "Your buyer may not have seen your competitors' factory yet. Show them yours first, and give buyers a level of visibility and confidence your competitors may not have provided." },
      { icon: BadgeCheck, title: "Remove doubts before objections", text: "Can you deliver? Do you have the right machines? Can you maintain quality? Show buyers your actual machines, environment and processes instead of just telling them." },
      { icon: Workflow, title: "Show the system behind the product", text: "Do not just show what you make, show how you make it. Let buyers explore production, quality systems, infrastructure and processes photos cannot convey." },
    ],
  },
  {
    name: "Present like the best in your industry",
    items: [
      { icon: Users, title: "Consistent sales representation", text: "Give every salesperson the same professional factory experience to present, wherever they are and whoever they are meeting." },
      { icon: Factory, title: "Differentiate from a trader", text: "Show buyers a real manufacturing capability behind your company. Take them inside your production, quality, infrastructure and systems." },
      { icon: Presentation, title: "Make senior meetings count", text: "A few minutes with a senior buyer can be valuable. Use VPV on an iPad or screen to take management into your factory and focus on what matters to them." },
    ],
  },
  {
    name: "Reach buyers wherever they are",
    items: [
      { icon: Handshake, title: "Build distributor confidence", text: "Give local and international distributors a reason to believe. Take them inside your factory remotely before they invest time and money in a visit." },
      { icon: ClipboardCheck, title: "Get shortlisted for audits", text: "Send your VPV with your company profile when approaching customers abroad, so they can understand your capability before deciding on a physical audit." },
      { icon: MapPin, title: "Reach distributors across India", text: "Take your factory to distributors wherever they are. Use VPV during Zoom and other online meetings without requiring an initial physical visit." },
    ],
  },
];

const CAPABILITIES = [
  "Built around your buyers and their questions",
  "Production, quality, infrastructure & R&D zones",
  "One shareable link, works on any device",
  "One factory. One VPV. Your whole sales team.",
  "Every salesperson can present it",
];

/* ───────────────────────── motion helpers ───────────────────────── */

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/** Becomes true the first time the element scrolls into view, and stays true. */
function useInView<T extends Element>(threshold = 0.3) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, threshold]);
  return [ref, inView] as const;
}

/** Rises into place the first time it scrolls into view (motion only, see wv-reveal). */
function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const [ref, inView] = useInView<HTMLDivElement>(0.15);
  return (
    <div ref={ref} className={`wv-reveal ${inView ? "wv-in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* ───────────────────────── benefits ───────────────────────── */

/** One theme: its number and name on the left, its three benefits flowing to the right. */
function BenefitGroup({ index, name, items }: { index: number; name: string; items: Benefit[] }) {
  const [ref, inView] = useInView<HTMLDivElement>(0.25);
  return (
    <div ref={ref} className={`wv-group ${inView ? "wv-in" : ""} grid gap-6 py-9 sm:py-11 lg:grid-cols-[230px_1fr] lg:gap-10`}>
      <div className="flex items-center gap-3 lg:block lg:pt-1">
        <span
          className="wv-num inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[15px] font-extrabold text-white"
          style={{ background: `linear-gradient(135deg, ${NAVY}, ${BLUE})`, boxShadow: "0 0 0 6px rgba(20,104,216,.10)" }}
        >
          0{index + 1}
        </span>
        <p className="text-[20px] font-extrabold leading-snug tracking-tight text-slate-900 lg:mt-3">{name}</p>
        <span className="wv-rule mt-4 hidden h-[3px] w-16 lg:block rounded-full" style={{ background: `linear-gradient(90deg, ${BLUE}, ${CYAN})` }} />
      </div>
      <ol className="grid gap-8 md:grid-cols-3 md:gap-0">
        {items.map(({ icon: Icon, title, text }, k) => (
          <li
            key={title}
            className="wv-item group relative flex gap-4 md:block md:px-6 md:first:pl-0 md:last:pr-0 md:[&:not(:first-child)]:border-l md:[&:not(:first-child)]:border-slate-200"
            style={{ ["--k" as string]: k }}
          >
            <span className="wv-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#EAF2FE] text-[#1468D8] transition-colors duration-300 group-hover:bg-[#1468D8] group-hover:text-white">
              <Icon className="h-[22px] w-[22px]" aria-hidden />
            </span>
            <div className="md:mt-4">
              <p className="text-[17px] font-bold leading-snug text-slate-900">{title}</p>
              <span className="mt-2 block h-[2px] w-8 rounded-full bg-[#1468D8]/30 transition-all duration-300 group-hover:w-14 group-hover:bg-[#1468D8]" />
              <p className="mt-3 text-[15px] leading-[1.65] text-slate-600">{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ───────────────────────── page ───────────────────────── */

export default function WhyVpv() {
  const reduced = usePrefersReducedMotion();
  const [motion, setMotion] = useState(false);
  useEffect(() => setMotion(!reduced), [reduced]);

  return (
    <main className="overflow-x-hidden" data-wv-motion={motion ? "" : undefined}>
      <style>{`
        @keyframes wv-rise { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
        @keyframes wv-glow { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
        @keyframes wv-marquee { to { transform: translateX(-50%) } }
        .wv-rise { animation: wv-rise .7s cubic-bezier(.2,.8,.2,1) both }
        .wv-glow { animation: wv-glow 4s ease-in-out infinite }
        .wv-marquee { animation: wv-marquee 38s linear infinite }
        .wv-marquee-wrap:hover .wv-marquee { animation-play-state: paused }
        [data-wv-motion] .wv-reveal { transition: opacity .7s cubic-bezier(.22,1,.36,1), transform .7s cubic-bezier(.22,1,.36,1) }
        [data-wv-motion] .wv-reveal:not(.wv-in) { opacity: 0; transform: translateY(24px) }
        [data-wv-motion] .wv-group .wv-num { transition: transform .6s cubic-bezier(.34,1.56,.64,1) .05s, opacity .4s ease .05s }
        [data-wv-motion] .wv-group:not(.wv-in) .wv-num { opacity: 0; transform: scale(.5) }
        [data-wv-motion] .wv-group .wv-rule { transform-origin: left; transition: transform .9s cubic-bezier(.22,1,.36,1) .25s }
        [data-wv-motion] .wv-group:not(.wv-in) .wv-rule { transform: scaleX(0) }
        [data-wv-motion] .wv-group .wv-item { transition: opacity .7s cubic-bezier(.22,1,.36,1), transform .7s cubic-bezier(.22,1,.36,1); transition-delay: calc(.2s + var(--k) * .12s) }
        [data-wv-motion] .wv-group:not(.wv-in) .wv-item { opacity: 0; transform: translateY(26px) }
        [data-wv-motion] .wv-group .wv-icon { transition: transform .55s cubic-bezier(.34,1.56,.64,1), background-color .3s, color .3s; transition-delay: calc(.35s + var(--k) * .12s), 0s, 0s }
        [data-wv-motion] .wv-group:not(.wv-in) .wv-icon { transform: scale(.4) rotate(-12deg) }
        @media (prefers-reduced-motion: reduce) {
          .wv-rise, .wv-glow, .wv-marquee { animation: none }
        }
      `}</style>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden text-white" style={{ background: `linear-gradient(150deg, #071B44 0%, ${NAVY} 45%, ${BLUE} 100%)` }}>
        <div
          className="wv-glow pointer-events-none absolute -right-40 -top-40 -z-10 h-[520px] w-[520px] rounded-full blur-3xl"
          style={{ background: `${CYAN}55` }}
        />
        <div className="mx-auto max-w-6xl px-5 pb-28 pt-14 sm:pb-32 sm:pt-20">
          <p className="wv-rise text-[12px] font-bold uppercase tracking-[0.22em] text-[#9FD8FF]">Why VPV</p>
          <h1 className="wv-rise mt-3 max-w-3xl text-[34px] font-extrabold leading-[1.08] tracking-tight sm:text-[52px]" style={{ animationDelay: "80ms" }}>
            Your buyers can&apos;t see your factory. That is where the orders leak.
          </h1>
          <p className="wv-rise mt-5 max-w-2xl text-[17px] leading-relaxed text-white/80 sm:text-[19px]" style={{ animationDelay: "160ms" }}>
            Most buyers decide without ever visiting your plant: on slides, a catalogue and a phone call. There is more
            to VPV than showing your factory. It can change how you present, sell and build trust with buyers.
          </p>
        </div>
      </section>

      {/* ── Benefits ─────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto -mt-20 max-w-6xl px-4 sm:px-5" data-testid="why-vpv-benefits">
        <div
          className="wv-rise overflow-hidden rounded-[28px] bg-white shadow-[0_40px_90px_rgba(11,61,145,0.18)] ring-1 ring-slate-900/5"
          style={{ animationDelay: "240ms" }}
        >
          <div className="px-6 pt-8 sm:px-10 sm:pt-11">
            <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[#1468D8]">Benefits &amp; capabilities</p>
            <h2 className="mt-2 text-[30px] font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[40px]">
              More than you can imagine!
            </h2>
          </div>
          <div className="divide-y divide-slate-100 px-6 sm:px-10">
            {GROUPS.map((g, i) => (
              <BenefitGroup key={g.name} index={i} name={g.name} items={g.items} />
            ))}
          </div>
          {/* the capabilities, drifting past */}
          <div
            className="wv-marquee-wrap relative overflow-hidden border-t border-slate-100 py-5"
            style={{ background: "linear-gradient(180deg, #F7FAFF, #EEF5FF)" }}
          >
            <ul className="sr-only">
              {CAPABILITIES.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <div className="wv-marquee flex w-max gap-3" aria-hidden>
              {[...CAPABILITIES, ...CAPABILITIES].map((c, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-white px-4 py-2 text-[14px] font-semibold text-slate-700 shadow-[0_6px_18px_-12px_rgba(11,61,145,.45)] ring-1 ring-slate-900/5"
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: BLUE }} />
                  {c}
                </span>
              ))}
            </div>
            <span className="pointer-events-none absolute inset-y-0 left-0 w-16" style={{ background: "linear-gradient(90deg, #F5F9FF, transparent)" }} />
            <span className="pointer-events-none absolute inset-y-0 right-0 w-16" style={{ background: "linear-gradient(270deg, #F5F9FF, transparent)" }} />
          </div>
        </div>
      </section>

      {/* ── How VPV converts ─────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pt-16 sm:pt-24">
        <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[#1468D8]">How VPV converts them</p>
        <h2 className="mt-2 max-w-3xl text-[28px] font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[38px]">
          Buyers trust what they can see.
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Eye, t: "They see the machines, not slides", d: "Every line, machine and quality check, in 360°, at the buyer's own pace." },
            { icon: ShieldCheck, t: "Creates your authority in the first meeting itself", d: "A real walkthrough tells a buyer you are the serious supplier, before price comes up." },
            { icon: Video, t: "Close deals on a Zoom call", d: "Walk an international buyer through your plant on Zoom, with no travel on either side." },
            { icon: Users, t: "Every salesperson presenting the way you would", d: "Your whole team presents the plant the same way, every time, in every meeting." },
          ].map(({ icon: Icon, t, d }, i) => (
            <Reveal key={t} delay={i * 90}>
              <div className="group h-full rounded-2xl border border-slate-200 bg-white p-5 transition-all duration-300 hover:-translate-y-1 hover:border-[#1468D8]/40 hover:shadow-[0_18px_40px_rgba(20,104,216,.12)]">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, ${NAVY}, ${BLUE})` }}>
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <p className="mt-4 text-[11px] font-bold text-slate-400">0{i + 1}</p>
                <p className="mt-0.5 text-[16px] font-bold leading-snug text-slate-900">{t}</p>
                <p className="mt-2 text-[14px] leading-relaxed text-slate-600">{d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Proof ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pt-16 sm:pt-24">
        <Reveal>
          <a
            href="/case-studies"
            className="group grid overflow-hidden rounded-[28px] text-white transition-transform duration-300 hover:-translate-y-0.5 md:grid-cols-[auto_1fr]"
            style={{ background: `linear-gradient(135deg, ${NAVY}, ${BLUE})` }}
          >
            <div className="flex items-center gap-4 p-6 sm:p-9 md:pr-0">
              <div className="relative h-24 w-40 shrink-0 overflow-hidden rounded-2xl bg-black/30 sm:h-28 sm:w-48">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="https://img.youtube.com/vi/62asCfqRRbw/hqdefault.jpg" alt="" className="h-full w-full object-cover opacity-90" />
                <span className="absolute inset-0 grid place-items-center">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-white text-[#0B3D91] shadow-lg transition-transform group-hover:scale-110">
                    <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden />
                  </span>
                </span>
              </div>
            </div>
            <div className="p-6 pt-0 sm:p-9 md:pt-9">
              <p className="text-[44px] font-extrabold leading-none tracking-tight sm:text-[56px]">80%+</p>
              <p className="mt-1 text-[15px] font-semibold text-white/85">conversion, says Mr. Anuj Anand</p>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/80">
                &ldquo;We used to present with slides, but the client could never see our machines. Now we close orders with
                international clients on a Zoom call, using only VPV.&rdquo;
              </p>
              <p className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-semibold">
                Watch his story <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
              </p>
            </div>
          </a>
        </Reveal>
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pb-20 pt-16 text-center sm:pb-28 sm:pt-24">
        <Reveal>
          <h2 className="mx-auto max-w-2xl text-[28px] font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[38px]">
            Your next buyer is already comparing you with others.
          </h2>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="/assessment"
              className="inline-flex h-14 items-center gap-2 rounded-full px-8 text-[16px] font-bold text-white shadow-[0_14px_30px_rgba(20,104,216,.35)] transition-transform hover:scale-[1.03]"
              style={{ background: `linear-gradient(120deg, ${NAVY}, ${BLUE} 55%, ${CYAN})` }}
            >
              Find the Right VPV for Your Factory <ArrowRight className="h-5 w-5" aria-hidden />
            </a>
            <a href="/plans" className="inline-flex h-14 items-center gap-2 rounded-full px-6 text-[16px] font-bold text-[#1468D8] transition-colors hover:bg-[#EAF2FE]">
              Explore the plans <ArrowRight className="h-5 w-5" aria-hidden />
            </a>
          </div>
        </Reveal>
        <p className="mx-auto mt-10 max-w-2xl text-[12px] leading-relaxed text-slate-400">
          Mr. Anuj Anand&apos;s 80%+ is one customer&apos;s result, as he describes it in his video (his words translated from
          Hindi).
        </p>
      </section>
    </main>
  );
}
