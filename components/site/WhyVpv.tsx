/**
 * /why-vpv — the cost of buyers who never see the factory.
 *
 * A loss calculator on the visitor's own numbers:
 *
 *   qualified leads a year × average annual business per lead
 *     = the total opportunity
 *   × today's conversion            = what they win
 *   the rest                        = what is left on the table
 *
 * then "if VPV lifts conversion by N points", what that wins back and how
 * it compares with the price of a plan. Every figure is computed from what
 * the visitor typed; nothing here is a promise, and the page says so.
 */

"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Eye, Play, ShieldCheck, TrendingDown, Users, Video } from "lucide-react";
import { SITE_PLANS, inr, inrLakhs } from "@/lib/pricing";
import { track } from "@/lib/analytics/client";
import {
  CALC_DEFAULTS,
  calcFigures,
  metaFromInputs,
  type CalcField,
  type CalcInputs,
} from "@/lib/whyVpvCalc";

const NAVY = "#0B3D91";
const BLUE = "#1468D8";
const CYAN = "#19B8F2";
const LOSS = "#FF7A6B"; // business going to competitors, on navy
const LOSS_INK = "#D9443A"; // the same, on white

const VALUE_PRESETS = [1, 2, 5, 10, 25, 50]; // lakh
const DOTS = 20;

/* ───────────────────────── helpers ───────────────────────── */

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

/** Eases a number towards its target, so every result counts up. */
function useCountUp(target: number, ms = 750) {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(0);
  const current = useRef(0);
  useEffect(() => {
    if (reduced) {
      current.current = target;
      setValue(target);
      return;
    }
    const from = current.current;
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      const v = from + (target - from) * e;
      current.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduced]);
  return value;
}

function Money({ value, className }: { value: number; className?: string }) {
  const v = useCountUp(value);
  return <span className={`tabular-nums ${className ?? ""}`}>{inrLakhs(v)}</span>;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/* ───────────────────────── inputs ───────────────────────── */

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="py-5 first:pt-0 last:pb-0">
      <p className="text-[14px] font-semibold text-slate-900">{label}</p>
      {hint && <p className="mt-0.5 text-[12.5px] text-slate-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
  label: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="wv-range w-full"
      style={{ background: `linear-gradient(90deg, ${BLUE} ${pct}%, #E3EAF5 ${pct}%)` }}
    />
  );
}

function NumberBox({
  value,
  onChange,
  prefix,
  suffix,
  min,
  max,
  label,
  step,
}: {
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  suffix?: string;
  min: number;
  max: number;
  label: string;
  step?: number;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <label className="flex h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-[#1468D8] focus-within:ring-2 focus-within:ring-[#1468D8]/20">
      {prefix && <span className="text-[14px] text-slate-500">{prefix}</span>}
      <input
        aria-label={label}
        inputMode="decimal"
        type="number"
        min={min}
        max={max}
        step={step}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n)) onChange(clamp(n, min, max));
        }}
        onBlur={() => setText(String(value))}
        className="w-full min-w-0 bg-transparent text-[16px] font-semibold text-slate-900 outline-none tabular-nums"
      />
      {suffix && <span className="shrink-0 text-[13px] text-slate-500">{suffix}</span>}
    </label>
  );
}

/* ───────────────────────── visuals ───────────────────────── */

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

/**
 * Twenty leads in two bins: yours and your competitors'. When the panel first
 * scrolls into view the leads pour out of the middle into their bins; after
 * that, changing a number sends dots across from one bin to the other.
 * Lost dots fill the competitors' bin from its first slot by taking slots in
 * reverse, so a change moves only the dots that actually change hands.
 */
function LeadBuckets({ won, back = 0, dark = false }: { won: number; back?: number; dark?: boolean }) {
  const [ref, inView] = useInView<HTMLDivElement>(0.35);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  const ours = won + back;
  const theirs = DOTS - ours;
  const mid = 12;
  const pad = 12;
  const head = 36;
  const gap = w < 400 ? 5 : 7;
  const binW = Math.max(0, (w - mid) / 2);
  const size = Math.max(10, Math.min(24, Math.floor((binW - pad * 2 - gap * 4) / 5)));
  const binH = head + 4 * size + 3 * gap + pad;
  const at = (side: 0 | 1, k: number) => ({
    x: side * (binW + mid) + pad + (k % 5) * (size + gap),
    y: head + Math.floor(k / 5) * (size + gap),
  });
  const wonC = dark ? "#FFFFFF" : BLUE;
  const lostC = dark ? LOSS : "#F3C3BC";

  return (
    <div ref={ref} className="relative" style={{ height: binH }} aria-hidden>
      {[0, 1].map((side) => (
        <div
          key={side}
          className="absolute top-0 rounded-2xl"
          style={{
            left: side ? binW + mid : 0,
            width: binW,
            height: binH,
            background: side
              ? dark ? "rgba(255,122,107,.12)" : "#FFF3F1"
              : dark ? "rgba(255,255,255,.06)" : "#EEF5FF",
            boxShadow: `inset 0 0 0 1px ${side ? (dark ? "rgba(255,122,107,.35)" : "#F6D3CD") : dark ? "rgba(255,255,255,.12)" : "#D6E5FA"}`,
          }}
        >
          <p
            className="flex items-center justify-between px-3 pt-2.5 text-[12px] font-bold"
            style={{ color: side ? (dark ? "#FFC2B8" : LOSS_INK) : dark ? "rgba(255,255,255,.85)" : NAVY }}
          >
            <span>{side ? "Your competitors" : "You"}</span>
            <span className="tabular-nums">{side ? theirs : ours}</span>
          </p>
        </div>
      ))}
      {w > 0 &&
        Array.from({ length: DOTS }, (_, i) => {
          const kind = i < won ? "won" : i < ours ? "back" : "lost";
          const p = kind === "lost" ? at(1, DOTS - 1 - i) : at(0, i);
          const pool = { x: w / 2 - size / 2 + ((i % 5) - 2) * 3, y: head + size };
          const q = inView ? p : pool;
          return (
            <span
              key={i}
              className="wv-bdot absolute left-0 top-0 rounded-full"
              style={{
                width: size,
                height: size,
                background: kind === "won" ? wonC : kind === "back" ? CYAN : lostC,
                boxShadow: kind === "back" ? `0 0 0 3px ${CYAN}33` : undefined,
                transform: `translate(${q.x}px, ${q.y}px) scale(${inView ? 1 : 0.4})`,
                opacity: inView ? 1 : 0,
                transitionDelay: `${inView ? 120 + i * 45 : 0}ms`,
              }}
            />
          );
        })}
    </div>
  );
}

/**
 * Business leaving today, from local midnight up to this second, at the
 * visitor's own yearly figure. Plain arithmetic on their inputs, and it
 * says so. Ticks in whole rupees so the last digits visibly move.
 */
function LeakTicker({ perYear }: { perYear: number }) {
  const reduced = usePrefersReducedMotion();
  const [secs, setSecs] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setSecs((d.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 1000);
    };
    tick();
    const id = setInterval(tick, reduced ? 1000 : 150);
    return () => clearInterval(id);
  }, [reduced]);
  const amount = secs === null ? 0 : (perYear / (365 * 24 * 3600)) * secs;
  return (
    <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-black/20 px-3.5 py-2.5 text-[13px] leading-snug text-white/80">
      <span className="wv-live mt-[5px] h-2 w-2 shrink-0 rounded-full" style={{ background: LOSS }} />
      <span>
        At your numbers, <b className="tabular-nums text-white">{inr(amount)}</b> has already gone to your competitors
        today, and it is still going.
      </span>
    </p>
  );
}

/** The loss, as the loudest thing in the results. Flashes when it grows. */
function LossCard({ lost }: { lost: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef(lost);
  useEffect(() => {
    const el = ref.current;
    if (el && lost > prev.current + 1) {
      el.classList.remove("wv-hit");
      void el.offsetWidth; // restart the animation
      el.classList.add("wv-hit");
    }
    prev.current = lost;
  }, [lost]);
  return (
    <div
      ref={ref}
      className="mt-6 rounded-2xl p-5 sm:p-6"
      style={{ background: "linear-gradient(150deg, rgba(255,107,91,.32), rgba(255,107,91,.10))", boxShadow: "inset 0 0 0 1px rgba(255,138,122,.45)" }}
    >
      <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.16em] text-[#FFC2B8]">
        <TrendingDown className="h-4 w-4" aria-hidden /> Going to your competitors, every year
      </p>
      <p className="mt-2 text-[36px] font-extrabold leading-none tracking-tight text-[#FFE6E1] sm:text-[48px]">
        <Money value={lost} />
      </p>
      <p className="mt-2.5 text-[14px] text-[#FFD9D2]">
        That is <b className="text-white"><Money value={lost / 365} /></b> every single day.
      </p>
      <LeakTicker perYear={lost} />
    </div>
  );
}

/* ───────────────────────── autosave ───────────────────────── */

/** How long the sliders must rest before the numbers are saved. */
const SAVE_AFTER_MS = 1500;

/**
 * Saves what the visitor typed into the calculator, a moment after they stop
 * moving it, like an autosave. Dragging a slider fires dozens of changes a
 * second; only the value they settle on is recorded, plus one last save if
 * they leave with an unsaved change. Untouched starting numbers are never
 * sent. Respects the cookie notice: track() sends nothing once a visitor has
 * declined measurement.
 */
function useCalculatorAutosave(inputs: CalcInputs) {
  const live = useRef(inputs);
  live.current = inputs;
  const prev = useRef(inputs);
  const moved = useRef<CalcField | null>(null);
  const unsaved = useRef(false);
  const saves = useRef(0);
  const savedKey = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const save = useCallback((beacon: boolean) => {
    clearTimeout(timer.current);
    if (!unsaved.current) return;
    unsaved.current = false;
    const now = live.current;
    const key = JSON.stringify(now);
    if (key === savedKey.current) return; // moved away and back to what was saved
    savedKey.current = key;
    saves.current += 1;
    track(
      "calculator_used",
      metaFromInputs(now, { field: moved.current, saves: saves.current }),
      { beacon, path: "/why-vpv" }
    );
  }, []);

  const { leads, valueLakh, conv, lift } = inputs;
  useEffect(() => {
    const p = prev.current;
    const changed = (["leads", "valueLakh", "conv", "lift"] as const).find((f) => p[f] !== inputs[f]);
    if (!changed) return; // first render
    prev.current = inputs;
    moved.current = changed;
    unsaved.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save(false), SAVE_AFTER_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, valueLakh, conv, lift, save]);

  // Leaving the page (or the tab going to the background) saves at once.
  useEffect(() => {
    const flush = () => save(true);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [save]);
}

/* ───────────────────────── page ───────────────────────── */

export default function WhyVpv() {
  const [leads, setLeads] = useState(CALC_DEFAULTS.leads);
  const [valueLakh, setValueLakh] = useState(CALC_DEFAULTS.valueLakh);
  const [conv, setConv] = useState(CALC_DEFAULTS.conv);
  const [lift, setLift] = useState(CALC_DEFAULTS.lift);

  useCalculatorAutosave({ leads, valueLakh, conv, lift });

  const perLead = valueLakh * 1_00_000;
  const { opportunity, won, lost, liftApplied: liftCapped, newConv, recovered } = calcFigures({
    leads,
    valueLakh,
    conv,
    lift,
  });
  const perPoint = opportunity / 100;
  const plan = SITE_PLANS.authority;
  const planCost = plan.regularInr;
  const payback = recovered > 0 ? recovered / planCost : 0;

  const wonDots = clamp(Math.round((conv / 100) * DOTS), conv > 0 ? 1 : 0, DOTS);
  const backDots = clamp(Math.round((newConv / 100) * DOTS) - wonDots, liftCapped > 0 ? 1 : 0, DOTS - wonDots);

  const reduced = usePrefersReducedMotion();
  const [motion, setMotion] = useState(false);
  useEffect(() => setMotion(!reduced), [reduced]);
  const [ctaRef, ctaIn] = useInView<HTMLHeadingElement>(0.5);

  return (
    <main className="overflow-x-hidden" data-wv-motion={motion ? "" : undefined}>
      <style>{`
        .wv-range { -webkit-appearance: none; appearance: none; height: 8px; border-radius: 9999px; outline: none; cursor: pointer }
        .wv-range::-webkit-slider-thumb { -webkit-appearance: none; width: 26px; height: 26px; border-radius: 9999px; background: #fff; border: 3px solid ${BLUE}; box-shadow: 0 4px 12px rgba(20,104,216,.35); transition: transform .15s }
        .wv-range::-webkit-slider-thumb:active { transform: scale(1.15) }
        .wv-range::-moz-range-thumb { width: 22px; height: 22px; border-radius: 9999px; background: #fff; border: 3px solid ${BLUE}; box-shadow: 0 4px 12px rgba(20,104,216,.35) }
        .wv-range:focus-visible { box-shadow: 0 0 0 4px rgba(20,104,216,.2) }
        .wv-bdot { transition: transform .8s cubic-bezier(.22,1,.36,1), background-color .45s ease, opacity .5s ease }
        @keyframes wv-hit { 0% { transform: scale(1) } 30% { transform: scale(1.025) } 100% { transform: scale(1) } }
        @keyframes wv-flash { 0% { box-shadow: inset 0 0 0 1px rgba(255,138,122,.45), 0 0 0 0 rgba(255,107,91,.55) } 100% { box-shadow: inset 0 0 0 1px rgba(255,138,122,.45), 0 0 0 20px rgba(255,107,91,0) } }
        .wv-hit { animation: wv-hit .5s cubic-bezier(.22,1,.36,1), wv-flash .9s ease-out }
        @keyframes wv-live { 50% { opacity: .25 } }
        .wv-live { animation: wv-live 1.1s ease-in-out infinite }
        [data-wv-motion] .wv-reveal { transition: opacity .7s cubic-bezier(.22,1,.36,1), transform .7s cubic-bezier(.22,1,.36,1) }
        [data-wv-motion] .wv-reveal:not(.wv-in) { opacity: 0; transform: translateY(24px) }
        @keyframes wv-rise { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
        @keyframes wv-glow { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
        .wv-rise { animation: wv-rise .7s cubic-bezier(.2,.8,.2,1) both }
        .wv-glow { animation: wv-glow 4s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) {
          .wv-rise, .wv-glow, .wv-hit, .wv-live { animation: none }
          .wv-bdot { transition: none }
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
            Most buyers decide without ever visiting your plant: on slides, a catalogue and a phone call. Put in your own
            numbers and see what the leads you don&apos;t convert are worth each year.
          </p>
        </div>
      </section>

      {/* ── Calculator ───────────────────────────────────────── */}
      <section className="relative z-10 mx-auto -mt-20 max-w-6xl px-4 sm:px-5">
        <div className="wv-rise grid overflow-hidden rounded-[28px] bg-white shadow-[0_40px_90px_rgba(11,61,145,0.22)] ring-1 ring-slate-900/5 lg:grid-cols-[1fr_1.1fr]" style={{ animationDelay: "240ms" }}>
          {/* Inputs */}
          <div className="divide-y divide-slate-100 p-6 sm:p-9">
            <Field label="Qualified leads a year" hint="Buyers who asked for a quote, met you at an expo or came through a distributor.">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Slider label="Qualified leads a year" value={Math.min(leads, 1000)} min={10} max={1000} step={10} onChange={setLeads} />
                </div>
                <div className="w-[104px]">
                  <NumberBox label="Qualified leads a year" value={leads} onChange={(n) => setLeads(Math.round(n))} min={1} max={100000} />
                </div>
              </div>
            </Field>

            <Field label="Average business per lead, a year" hint="What one of these buyers is worth to you each year if they order.">
              <div className="flex flex-wrap gap-2">
                {VALUE_PRESETS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setValueLakh(v)}
                    aria-pressed={valueLakh === v}
                    className={`h-9 rounded-full px-3.5 text-[13.5px] font-semibold transition-all ${
                      valueLakh === v
                        ? "bg-[#1468D8] text-white shadow-[0_6px_16px_rgba(20,104,216,.35)]"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    ₹{v}L
                  </button>
                ))}
              </div>
              <div className="mt-3 w-[180px]">
                <NumberBox label="Average business per lead, in lakh" value={valueLakh} onChange={setValueLakh} prefix="₹" suffix="lakh" min={0.1} max={10000} step={0.5} />
              </div>
            </Field>

            <Field label="Your conversion today" hint="Out of every 100 qualified leads, how many become customers.">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Slider label="Your conversion today" value={conv} min={1} max={60} onChange={setConv} />
                </div>
                <div className="w-[104px]">
                  <NumberBox label="Your conversion today, percent" value={conv} onChange={(n) => setConv(Math.round(n))} suffix="%" min={1} max={95} />
                </div>
              </div>
            </Field>
          </div>

          {/* Results */}
          <div className="relative p-6 text-white sm:p-9" style={{ background: `linear-gradient(160deg, #0A2A66, ${NAVY} 55%, #10326F)` }} aria-live="polite">
            <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[#9FD8FF]">Your total opportunity, a year</p>
            <p className="mt-1 text-[32px] font-extrabold leading-none tracking-tight sm:text-[40px]">
              <Money value={opportunity} />
            </p>
            <p className="mt-2 text-[13px] text-white/60">
              {leads.toLocaleString("en-IN")} leads × {inrLakhs(perLead)} each. You win{" "}
              <b className="text-white/90">
                <Money value={won} />
              </b>{" "}
              of it ({conv}%).
            </p>

            <LossCard lost={lost} />

            <div className="mt-6">
              <p className="mb-3 text-[13px] text-white/70">
                Out of every 20 qualified leads, you win <b className="text-white">{wonDots}</b>. Your competitors win{" "}
                <b style={{ color: "#FFC2B8" }}>{DOTS - wonDots}</b>.
              </p>
              <LeadBuckets won={wonDots} dark />
            </div>

            <p className="mt-6 rounded-xl bg-white/[0.06] px-4 py-3 text-[13.5px] leading-relaxed text-white/80">
              No one wins every lead. But each extra point of conversion is worth{" "}
              <b className="text-white">
                <Money value={perPoint} />
              </b>{" "}
              a year to you.
            </p>
          </div>
        </div>
      </section>

      {/* ── What VPV wins back ───────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pt-16 sm:pt-24">
        <Reveal className="grid items-center gap-10 lg:grid-cols-[1fr_1fr]">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[#1468D8]">Win it back</p>
            <h2 className="mt-2 text-[28px] font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[38px]">
              What if more of those buyers could walk through your plant?
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-slate-600">
              Move the slider to a lift you believe. Even a few points, on numbers like yours, is a lot of business.
            </p>
            <div className="mt-7 rounded-2xl border border-slate-200 p-5">
              <div className="flex items-baseline justify-between">
                <p className="text-[14px] font-semibold text-slate-900">If VPV lifts your conversion by</p>
                <p className="text-[22px] font-extrabold text-[#1468D8] tabular-nums">+{liftCapped} pts</p>
              </div>
              <div className="mt-4">
                <Slider label="Conversion lift with VPV, in points" value={lift} min={1} max={30} onChange={setLift} />
              </div>
              <p className="mt-3 text-[13px] text-slate-500">
                From {conv}% to <b className="text-slate-800">{newConv}%</b>
              </p>
            </div>
          </div>

          <div className="rounded-[28px] p-6 sm:p-9" style={{ background: "linear-gradient(160deg, #F2F8FF, #E6F2FF)" }}>
            <p className="text-[13px] font-semibold text-slate-600">More business a year</p>
            <p className="mt-1 text-[40px] font-extrabold leading-none tracking-tight sm:text-[52px]" style={{ color: NAVY }}>
              + <Money value={recovered} />
            </p>
            <div className="mt-6">
              <LeadBuckets won={wonDots} back={backDots} />
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-slate-600">
                <span className="flex items-center gap-1.5">
                  <i className="h-2.5 w-2.5 rounded-full" style={{ background: BLUE }} /> Won today
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="h-2.5 w-2.5 rounded-full" style={{ background: CYAN }} /> Won back with VPV
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="h-2.5 w-2.5 rounded-full" style={{ background: "#F3C3BC" }} /> Still with competitors
                </span>
              </div>
            </div>
            <div className="mt-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-900/5">
              <p className="text-[13.5px] leading-relaxed text-slate-700">
                The {plan.name} plan is {inr(planCost)} at its regular price, paid once.
                {payback >= 1 ? (
                  <>
                    {" "}
                    That lift would win back <b className="text-slate-900">{payback >= 10 ? Math.round(payback) : payback.toFixed(1)}×</b> its cost in
                    the first year.
                  </>
                ) : (
                  <> That lift would win back {Math.round(payback * 100)}% of its cost in the first year.</>
                )}
              </p>
            </div>
          </div>
        </Reveal>
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
            <div
              className="group h-full rounded-2xl border border-slate-200 bg-white p-5 transition-all duration-300 hover:-translate-y-1 hover:border-[#1468D8]/40 hover:shadow-[0_18px_40px_rgba(20,104,216,.12)]"
            >
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
        <h2 ref={ctaRef} className="mx-auto max-w-2xl text-[28px] font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[38px]">
          Stop handing{" "}
          <span style={{ color: LOSS_INK }}>{ctaIn ? <Money value={lost} /> : inrLakhs(lost)}</span> a year to your
          competition.
        </h2>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="/plans"
            className="inline-flex h-14 items-center gap-2 rounded-full px-8 text-[16px] font-bold text-white shadow-[0_14px_30px_rgba(20,104,216,.35)] transition-transform hover:scale-[1.03]"
            style={{ background: `linear-gradient(120deg, ${NAVY}, ${BLUE} 55%, ${CYAN})` }}
          >
            Explore the plans <ArrowRight className="h-5 w-5" aria-hidden />
          </a>
        </div>
        <p className="mx-auto mt-10 max-w-2xl text-[12px] leading-relaxed text-slate-400">
          These figures are worked out from the numbers you entered, not a forecast or a promise. How much VPV lifts your
          conversion depends on your products, your buyers and your follow-up. Mr. Anuj Anand&apos;s 80%+ is one
          customer&apos;s result, as he describes it in his video (his words translated from Hindi).
        </p>
      </section>
    </main>
  );
}
