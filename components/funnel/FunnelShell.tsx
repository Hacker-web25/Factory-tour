/**
 * The chrome and the building blocks shared by the five funnel steps.
 *
 * One file because the steps must read as one flow: the same step bar, the
 * same header with a real factory photograph, the same section headings,
 * inputs and button. A visitor should feel they are filling in one form
 * across five screens, not meeting five pages.
 *
 * Colour follows the VPV brand tokens (navy → blue → cyan on a light
 * canvas). GOLD is used for exactly one thing — the special offer — so
 * that on every screen, gold means "offer" and nothing else.
 */

"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Check, Minus, Plus, Sparkles, Star, type LucideIcon } from "lucide-react";
import { LAUNCH_OFFER } from "@/lib/pricing";
import { COMING_SOON_BODY, comingSoonTitle } from "@/lib/logistics";

/* ───────────────────────────── Steps ─────────────────────────────── */

export const FUNNEL_STEPS = [
  { href: "/assessment", label: "Your details" },
  { href: "/assessment/scope", label: "What to show" },
  { href: "/assessment/security", label: "Protection" },
  { href: "/assessment/plan", label: "Your plan" },
  { href: "/assessment/sales-team", label: "Sales team" },
  { href: "/assessment/billing", label: "Billing" },
] as const;

export function StepBar({ current }: { current: number }) {
  return (
    <nav aria-label="Progress">
      <ol className="flex items-center gap-1.5">
        {FUNNEL_STEPS.map((s, i) => {
          const done = i < current;
          const now = i === current;
          return (
            <li key={s.href} className="flex flex-1 flex-col gap-2" aria-current={now ? "step" : undefined}>
              <span
                className={[
                  "h-1.5 rounded-full transition-colors",
                  now ? "bg-vpv-grad" : done ? "bg-vpv-blue/45" : "bg-vpv-line",
                ].join(" ")}
              />
              <span
                className={[
                  "hidden text-[12px] font-medium sm:block",
                  now ? "text-vpv-ink" : done ? "text-vpv-blue" : "text-slate-400",
                ].join(" ")}
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[12.5px] text-slate-500 sm:hidden">
        Step {current + 1} of {FUNNEL_STEPS.length} · {FUNNEL_STEPS[current].label}
      </p>
    </nav>
  );
}

/* ───────────────────────────── Layout ───────────────────────────── */

/**
 * The step header: the question on the left, a photograph from a real
 * Indian plant on the right. The photograph is not decoration — it keeps
 * a factory owner looking at a factory while they answer questions about
 * theirs.
 */
export function FunnelHeader({
  step,
  title,
  summary,
  image,
  imageAlt = "",
  caption,
}: {
  step: number;
  title: ReactNode;
  summary?: ReactNode;
  image?: string;
  imageAlt?: string;
  caption?: string;
}) {
  return (
    <div className="border-b border-vpv-line bg-vpv-canvas">
      <div className="mx-auto max-w-5xl px-5 pt-8 pb-10">
        <StepBar current={step} />
        <div className={`mt-8 grid items-center gap-8 ${image ? "lg:grid-cols-[1.15fr_1fr]" : ""}`}>
          <div>
            <h1 className="text-[30px] font-semibold leading-[1.12] tracking-[-0.02em] text-vpv-ink sm:text-[40px]">
              {title}
            </h1>
            {summary && (
              <p className="mt-4 max-w-[34rem] text-[16px] leading-relaxed text-slate-600">{summary}</p>
            )}
          </div>
          {image && (
            <figure className="relative hidden overflow-hidden rounded-[22px] shadow-[0_30px_60px_-30px_rgba(11,61,145,0.45)] lg:block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/img/${image}.webp`}
                srcSet={`/img/${image}-sm.webp 640w, /img/${image}.webp 1280w`}
                sizes="(min-width: 1024px) 440px, 100vw"
                alt={imageAlt}
                className="aspect-[4/3] w-full object-cover"
                loading="eager"
              />
              {caption && (
                <figcaption className="absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1.5 text-[12px] font-medium text-vpv-ink backdrop-blur">
                  {caption}
                </figcaption>
              )}
            </figure>
          )}
        </div>
      </div>
    </div>
  );
}

export function FunnelBody({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <div className={`mx-auto px-5 py-10 lg:py-12 ${wide ? "max-w-5xl" : "max-w-3xl"}`}>{children}</div>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-vpv-line bg-white p-6 sm:p-7 ${className}`}>{children}</div>;
}

/** A section heading with its icon. The icon says what kind of question it
 *  is at a glance, which matters on a long form read on a phone. */
export function SectionTitle({
  icon: Icon,
  title,
  children,
  aside,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-vpv-tint text-vpv-blue">
        <Icon className="h-5 w-5" strokeWidth={1.9} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-[18px] font-semibold text-vpv-ink">{title}</h2>
          {aside}
        </div>
        {children && <div className="mt-1.5 text-[14px] leading-relaxed text-slate-600">{children}</div>}
      </div>
    </div>
  );
}

/* ───────────────────────────── Fields ───────────────────────────── */

const INPUT =
  "w-full rounded-xl border border-vpv-line bg-white px-3.5 py-2.5 text-[15px] text-vpv-ink " +
  "placeholder:text-slate-400 outline-none transition-colors " +
  "focus:border-vpv-blue focus:ring-2 focus:ring-vpv-blue/15";

export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13.5px] font-medium text-vpv-ink">
        {label}
        {required && <span className="ml-1 text-vpv-blue">*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1.5 block text-[12.5px] text-slate-500">{hint}</span>}
      {error && (
        <span role="alert" className="mt-1.5 block text-[12.5px] font-medium text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input {...rest} className={`${INPUT} ${className}`} />;
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", children, ...rest } = props;
  return (
    <select {...rest} className={`${INPUT} ${className}`}>
      {children}
    </select>
  );
}

/** A plus/minus counter. Clearer than a bare number box on a phone. */
export function Counter({
  value,
  onChange,
  min = 0,
  max = 99,
  suffix,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  const set = (n: number) => onChange(Math.max(min, Math.min(max, n)));
  const btn =
    "flex h-10 w-10 items-center justify-center rounded-full border border-vpv-line text-vpv-ink transition-colors " +
    "hover:border-vpv-blue/40 hover:text-vpv-blue disabled:opacity-35 disabled:hover:border-vpv-line disabled:hover:text-vpv-ink";
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => set(value - 1)} disabled={value <= min} aria-label="One fewer" className={btn}>
        <Minus className="h-4 w-4" aria-hidden />
      </button>
      <div className="min-w-[4.5rem] text-center">
        <span className="text-[24px] font-semibold tabular-nums text-vpv-ink">{value}</span>
        {suffix && <span className="ml-1 text-[13px] text-slate-500">{suffix}</span>}
      </div>
      <button type="button" onClick={() => set(value + 1)} disabled={value >= max} aria-label="One more" className={btn}>
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

/** The small gold star badge on a tile. Gold, like the special offer,
 *  because it is the other thing on the page we want the eye to find. */
export function StarBadge({ label, className = "" }: { label: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#F7DC86] to-[#E2B23E] px-2 py-0.5 text-[11px] font-semibold text-[#4A3200] shadow-[0_4px_10px_-4px_rgba(160,110,10,0.6)] ${className}`}
    >
      <Star className="h-3 w-3 fill-current" aria-hidden />
      {label}
    </span>
  );
}

/** A tile in the area / process picker. Pressing it is the whole
 *  interaction — no separate checkbox to aim for. */
export function PickTile({
  selected,
  onToggle,
  icon,
  name,
  description,
  star,
}: {
  selected: boolean;
  onToggle: () => void;
  icon: ReactNode;
  name: string;
  description?: string;
  /** When set, a gold star badge with this label sits on the tile's edge. */
  star?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={[
        "group relative flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vpv-blue/40",
        selected
          ? "border-vpv-blue bg-vpv-tint/70"
          : star
            ? "border-[#E8C766] bg-[#FFFCF2] hover:border-vpv-blue/40"
            : "border-vpv-line bg-white hover:border-vpv-blue/40",
      ].join(" ")}
    >
      {star && <StarBadge label={star} className="absolute -top-2.5 left-3" />}
      <span
        className={[
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
          selected ? "bg-vpv-blue text-white" : "bg-vpv-canvas text-vpv-navy",
        ].join(" ")}
      >
        {icon}
      </span>
      <span className="min-w-0 pr-5">
        <span className="block text-[13.5px] font-semibold leading-snug text-vpv-ink">{name}</span>
        {description && <span className="mt-0.5 block text-[12px] leading-snug text-slate-500">{description}</span>}
      </span>
      <span
        aria-hidden
        className={[
          "absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border transition-colors",
          selected ? "border-vpv-blue bg-vpv-blue text-white" : "border-vpv-line text-transparent",
        ].join(" ")}
      >
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
    </button>
  );
}

/** Yes / No. Both options are styled identically until chosen: greying out
 *  the answer we like less is confirm shaming, which the CCPA's dark-pattern
 *  guidelines name directly. */
export function YesNo({
  value,
  onChange,
  yesLabel = "Yes",
  noLabel = "No",
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
  yesLabel?: string;
  noLabel?: string;
}) {
  const base = "flex-1 rounded-xl border px-5 py-3.5 text-[15px] font-semibold transition-colors text-center";
  const on = "border-vpv-blue bg-vpv-tint text-vpv-blue";
  const off = "border-vpv-line bg-white text-vpv-ink hover:border-vpv-blue/40";
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <button type="button" onClick={() => onChange(true)} aria-pressed={value === true} className={`${base} ${value === true ? on : off}`}>
        {yesLabel}
      </button>
      <button type="button" onClick={() => onChange(false)} aria-pressed={value === false} className={`${base} ${value === false ? on : off}`}>
        {noLabel}
      </button>
    </div>
  );
}

/* ───────────────────────────── The offer ────────────────────────── */

/**
 * The gold seal for the special offer. A sixteen-point starburst, because a
 * seal is how a printed price list has always said "this price is special"
 * — and it is the only gold object in the funnel.
 *
 * It appears with one short settle-in when the plan is revealed, and not
 * at all for visitors who have asked their system for reduced motion.
 */
export function OfferSeal({
  size = 128,
  className = "",
  percent = LAUNCH_OFFER.percent,
}: {
  size?: number;
  className?: string;
  /** The discount the seal announces. 20% on plans, 50% on sales team. */
  percent?: number;
}) {
  const gradId = `vpv-gold-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const points = 16;
  const outer = 50;
  const inner = 43;
  const d = Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / points - Math.PI / 2;
    return `${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
  return (
    <div
      className={`vpv-seal pointer-events-none select-none ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${LAUNCH_OFFER.short}: ${percent}% off for our first ${LAUNCH_OFFER.limit} customers`}
    >
      <style>{`
        @keyframes vpv-seal-in { from { transform: scale(.6) rotate(-24deg); opacity: 0 } to { transform: scale(1) rotate(-10deg); opacity: 1 } }
        .vpv-seal { transform: rotate(-10deg); animation: vpv-seal-in .55s cubic-bezier(.2,1.4,.4,1) both .15s; }
        @media (prefers-reduced-motion: reduce) { .vpv-seal { animation: none } }
      `}</style>
      <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow-[0_10px_18px_rgba(160,110,10,0.35)]">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#F7DC86" />
            <stop offset="0.55" stopColor="#E2B23E" />
            <stop offset="1" stopColor="#B7841A" />
          </linearGradient>
        </defs>
        <polygon points={d} fill={`url(#${gradId})`} />
        <circle cx="50" cy="50" r="37" fill="none" stroke="#FFF3CC" strokeOpacity="0.85" strokeWidth="0.9" strokeDasharray="1.6 1.8" />
        <text x="50" y="35" textAnchor="middle" fontSize="7.4" fontWeight="700" fill="#5A3D00" letterSpacing="0.4">
          SPECIAL OFFER
        </text>
        <text x="50" y="56" textAnchor="middle" fontSize="19" fontWeight="800" fill="#3D2900">
          {percent}%
        </text>
        <text x="50" y="66" textAnchor="middle" fontSize="7" fontWeight="700" fill="#3D2900">
          OFF
        </text>
        <text x="50" y="76" textAnchor="middle" fontSize="5.6" fontWeight="600" fill="#5A3D00">
          first {LAUNCH_OFFER.limit} customers
        </text>
      </svg>
    </div>
  );
}

export type OfferInfo = { open: boolean; remaining: number | null; loaded: boolean };

/**
 * Whether the special offer is still open, from the server's real count.
 * Starts as "open" so the page does not flash the regular price at the
 * thousands of visitors who arrive while it is; corrects itself within a
 * request if the 50 places have gone.
 */
export function useOfferState(): OfferInfo {
  const [info, setInfo] = useState<OfferInfo>({ open: LAUNCH_OFFER.active, remaining: null, loaded: false });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/funnel/offer");
        const data = (await res.json()) as { open?: boolean; remaining?: number };
        if (!cancelled && typeof data.open === "boolean") {
          setInfo({ open: data.open, remaining: data.remaining ?? null, loaded: true });
        }
      } catch {
        /* intentional — on a network error keep the default; the order route
           re-checks for real before any card is charged. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return info;
}

/* ───────────────────────────── Actions ──────────────────────────── */

export function PrimaryButton({
  children,
  disabled,
  busy,
  onClick,
  type = "button",
}: {
  children: ReactNode;
  disabled?: boolean;
  busy?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className="w-full rounded-full bg-vpv-grad px-7 py-3.5 text-[15px] font-semibold text-white shadow-[0_14px_30px_-12px_rgba(20,104,216,0.7)] transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vpv-blue/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none sm:w-auto sm:min-w-[15rem]"
    >
      {busy ? "Just a moment…" : children}
    </button>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-slate-500 transition-colors hover:text-vpv-blue">
      ← {children}
    </Link>
  );
}

/** Shown when a step is opened without the answers the step before it
 *  collected — a bookmark, a shared link, or a cleared browser. */
export function RestartNotice({ missing }: { missing: string }) {
  return (
    <Card>
      <h2 className="text-[18px] font-semibold text-vpv-ink">Let&rsquo;s pick this up from the start</h2>
      <p className="mt-2.5 text-[14.5px] leading-relaxed text-slate-600">
        This step needs {missing}, and we don&rsquo;t have it in this browser. Nothing is lost — the
        questions take about a minute.
      </p>
      <div className="mt-6">
        <Link
          href="/assessment"
          className="inline-flex rounded-full bg-vpv-grad px-6 py-3 text-[14px] font-semibold text-white shadow-[0_14px_30px_-12px_rgba(20,104,216,0.7)] transition-opacity hover:opacity-95"
        >
          Start again
        </Link>
      </div>
    </Card>
  );
}

/**
 * The golden "we are coming to your city" card, for a factory outside the
 * cities we shoot in today. Gold rather than amber-warning on purpose: it is
 * good news that is not here yet, not an error.
 */
export function ComingSoonCity({
  city,
  className = "",
  body = COMING_SOON_BODY,
  children,
}: {
  city: string;
  className?: string;
  body?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      role="status"
      className={`relative overflow-hidden rounded-2xl border border-[#EBC468] p-5 ${className}`}
      style={{ background: "linear-gradient(135deg, #FFFBEA 0%, #FFF1C9 55%, #FFE7A3 100%)" }}
    >
      <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/60 blur-2xl" />
      <div className="relative flex items-start gap-3.5">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-[0_6px_16px_rgba(184,134,11,0.35)]"
          style={{ background: "linear-gradient(135deg, #F0C04A, #B8860B)" }}
        >
          <Sparkles className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p
            className="bg-clip-text text-[19px] font-bold leading-snug tracking-[-0.01em] text-transparent"
            style={{ backgroundImage: "linear-gradient(90deg, #7A4E00, #C8901A 50%, #7A4E00)" }}
          >
            {comingSoonTitle(city)}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-[#6B4E12]">{body}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

/** A small "?" in a circle that opens an explanation. The caller decides
 *  where the explanation appears; this is only the button. */
export function HelpButton({
  label,
  open,
  onToggle,
  className = "",
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-expanded={open}
      className={`inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[12px] font-bold leading-none transition-colors ${
        open ? "border-vpv-blue bg-vpv-blue text-white" : "border-vpv-blue/50 text-vpv-blue hover:bg-vpv-tint"
      } ${className}`}
    >
      ?
    </button>
  );
}
