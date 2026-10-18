/**
 * The chrome and the form atoms shared by the five funnel steps.
 *
 * One file because the steps must look like one flow: the same step bar,
 * the same card, the same inputs, the same primary button in the same
 * place. A visitor should feel they are filling in one form across five
 * screens, not meeting five pages.
 *
 * Styling follows the VPV brand tokens in tailwind.config.ts (navy → blue →
 * cyan on a light canvas), the same system the customer dashboards and the
 * policy pages use.
 */

"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/* ───────────────────────────── Steps ─────────────────────────────── */

export const FUNNEL_STEPS = [
  { href: "/assessment", label: "Your details" },
  { href: "/assessment/scope", label: "What to show" },
  { href: "/assessment/security", label: "Protection" },
  { href: "/assessment/plan", label: "Your plan" },
  { href: "/assessment/billing", label: "Billing" },
] as const;

export function StepBar({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-[12px] font-medium">
      {FUNNEL_STEPS.map((s, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <li key={s.href} className="flex items-center gap-2">
            <span
              className={[
                "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold",
                now
                  ? "bg-vpv-grad text-white"
                  : done
                    ? "bg-vpv-tint text-vpv-blue"
                    : "border border-vpv-line text-slate-400",
              ].join(" ")}
            >
              {done ? "✓" : i + 1}
            </span>
            <span className={now ? "text-vpv-ink" : done ? "text-vpv-blue" : "text-slate-400"}>
              {s.label}
            </span>
            {i < FUNNEL_STEPS.length - 1 && (
              <span aria-hidden className="mx-1 hidden h-px w-6 bg-vpv-line sm:block" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ───────────────────────────── Layout ───────────────────────────── */

export function FunnelHeader({
  step,
  eyebrow,
  title,
  summary,
}: {
  step: number;
  eyebrow: string;
  title: ReactNode;
  summary?: ReactNode;
}) {
  return (
    <div
      className="border-b border-vpv-line"
      style={{
        backgroundImage:
          "radial-gradient(60% 120% at 90% 0%, rgba(25,184,242,0.12), rgba(255,255,255,0) 60%), radial-gradient(50% 100% at 0% 0%, rgba(20,104,216,0.08), rgba(255,255,255,0) 55%)",
      }}
    >
      <div className="mx-auto max-w-3xl px-5 pt-10 pb-9">
        <StepBar current={step} />
        <div className="mt-7 text-[11.5px] font-semibold uppercase tracking-[0.18em] text-vpv-blue">
          {eyebrow}
        </div>
        <h1 className="mt-3 text-[30px] sm:text-[38px] leading-[1.1] font-semibold tracking-tight text-vpv-ink">
          {title}
        </h1>
        {summary && (
          <p className="mt-3 text-[16px] leading-relaxed text-slate-600">{summary}</p>
        )}
      </div>
    </div>
  );
}

export function FunnelBody({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-3xl px-5 py-10 lg:py-12">{children}</div>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-vpv-line bg-white p-6 sm:p-7 ${className}`}>
      {children}
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

/** A plus/minus counter. Clearer than a bare number box on a phone, and it
 *  cannot be left holding a half-typed value. */
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
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => set(value - 1)}
        disabled={value <= min}
        aria-label="One fewer"
        className="h-10 w-10 rounded-full border border-vpv-line text-[18px] font-semibold text-vpv-ink transition-colors hover:border-vpv-blue/40 hover:text-vpv-blue disabled:opacity-35 disabled:hover:border-vpv-line disabled:hover:text-vpv-ink"
      >
        −
      </button>
      <div className="min-w-[4.5rem] text-center">
        <span className="text-[24px] font-semibold tabular-nums text-vpv-ink">{value}</span>
        {suffix && <span className="ml-1 text-[13px] text-slate-500">{suffix}</span>}
      </div>
      <button
        type="button"
        onClick={() => set(value + 1)}
        disabled={value >= max}
        aria-label="One more"
        className="h-10 w-10 rounded-full border border-vpv-line text-[18px] font-semibold text-vpv-ink transition-colors hover:border-vpv-blue/40 hover:text-vpv-blue disabled:opacity-35 disabled:hover:border-vpv-line disabled:hover:text-vpv-ink"
      >
        +
      </button>
    </div>
  );
}

/** Yes / No. Both options are styled identically until chosen: nudging a
 *  visitor by greying out the answer we like less is confirm shaming, which
 *  the CCPA's dark-pattern guidelines name directly. */
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
  const base =
    "flex-1 rounded-xl border px-5 py-3.5 text-[15px] font-semibold transition-colors text-center";
  const on = "border-vpv-blue bg-vpv-tint text-vpv-blue";
  const off = "border-vpv-line bg-white text-vpv-ink hover:border-vpv-blue/40";
  return (
    <div className="flex gap-3">
      <button type="button" onClick={() => onChange(true)} aria-pressed={value === true} className={`${base} ${value === true ? on : off}`}>
        {yesLabel}
      </button>
      <button type="button" onClick={() => onChange(false)} aria-pressed={value === false} className={`${base} ${value === false ? on : off}`}>
        {noLabel}
      </button>
    </div>
  );
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
      className="w-full rounded-full bg-vpv-grad px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_14px_30px_-12px_rgba(20,104,216,0.7)] transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none sm:w-auto sm:min-w-[15rem]"
    >
      {busy ? "Just a moment…" : children}
    </button>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-slate-500 transition-colors hover:text-vpv-blue"
    >
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
        This step needs {missing}, and we don&rsquo;t have it in this browser. Nothing is
        lost — the questions take about a minute.
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
