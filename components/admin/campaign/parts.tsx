/**
 * Small pieces the campaign pages share, so the list and the person page
 * draw the same dot, the same chip and the same panel.
 */

import type { ReactNode } from "react";
import { INTEREST_LABELS, INTEREST_MEANING, type Interest } from "@/lib/interest";

/**
 * The "visited the website" dot. Green: the site loaded for them. Red: it did
 * not. Text beside it, never colour alone, because the dot must read for
 * people who cannot tell red from green.
 */
export function VisitedDot({ visited, opened, label = true }: { visited: boolean; opened?: boolean; label?: boolean }) {
  const title = visited
    ? "The website loaded for them"
    : opened
      ? "They scanned the card but the website never loaded"
      : "They have not visited the website";
  return (
    <span className="inline-flex items-center gap-2" title={title}>
      <span
        aria-hidden
        className={`h-2.5 w-2.5 flex-none rounded-full ${visited ? "bg-emerald-500" : "bg-red-500"}`}
      />
      {label && (
        <span className={`text-[12.5px] ${visited ? "text-emerald-800" : "text-red-700"}`}>
          {visited ? "Visited" : "Not visited"}
        </span>
      )}
      <span className="sr-only">{title}</span>
    </span>
  );
}

const CHIP: Record<Interest, string> = {
  customer: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  hot: "bg-red-100 text-red-800 ring-red-200",
  warm: "bg-amber-100 text-amber-900 ring-amber-200",
  curious: "bg-sky-100 text-sky-800 ring-sky-200",
  glanced: "bg-slate-100 text-slate-700 ring-slate-200",
  unopened: "bg-white text-slate-500 ring-slate-200",
};

export function InterestChip({ level, score, big }: { level: Interest; score?: number; big?: boolean }) {
  return (
    <span
      title={INTEREST_MEANING[level]}
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset ${CHIP[level]} ${
        big ? "px-3.5 py-1.5 text-[14px]" : "px-2.5 py-0.5 text-[12px]"
      }`}
    >
      {INTEREST_LABELS[level]}
      {score !== undefined && level !== "unopened" && (
        <span className="font-normal tabular-nums opacity-70">{score}</span>
      )}
    </span>
  );
}

export function Panel({
  title,
  hint,
  right,
  children,
}: {
  title: string;
  hint?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-vpv-line bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold">{title}</h2>
          {hint && <p className="mt-1 text-[12.5px] text-vpv-muted">{hint}</p>}
        </div>
        {right}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-vpv-line bg-white px-5 py-6 text-center text-[13.5px] text-vpv-muted">
      {children}
    </p>
  );
}

export function H3({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={`mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-500 ${className}`}>
      {children}
    </h3>
  );
}

export function Line({
  label,
  value,
  mono,
  href,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  href?: string | null;
}) {
  const shown = value && value.trim() ? value : "—";
  return (
    <div className="flex justify-between gap-4 py-1 text-[13.5px]">
      <span className="flex-none text-vpv-muted">{label}</span>
      {href && shown !== "—" ? (
        <a
          href={href}
          className={`break-all text-right text-vpv-blue underline underline-offset-2 ${mono ? "font-mono text-[12.5px]" : ""}`}
        >
          {shown}
        </a>
      ) : (
        <span className={`break-words text-right text-vpv-ink ${mono ? "font-mono text-[12.5px]" : ""} ${shown === "—" ? "text-vpv-muted" : ""}`}>
          {shown}
        </span>
      )}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad" | "warn";
}) {
  const colour =
    tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : tone === "warn" ? "text-amber-700" : "text-vpv-ink";
  return (
    <div className="rounded-xl border border-vpv-line bg-white px-4 py-3 shadow-sm">
      <div className="text-[11.5px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 text-[22px] font-semibold tabular-nums ${colour}`}>{value}</div>
      {sub && <div className="text-[11.5px] text-vpv-muted">{sub}</div>}
    </div>
  );
}

export function Tab({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2.5 text-[13.5px] font-medium ${
        on ? "border-vpv-blue text-vpv-blue" : "border-transparent text-vpv-muted hover:text-vpv-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function NotOwner() {
  return (
    <div className="grid min-h-screen place-items-center bg-vpv-canvas px-6 text-center">
      <div>
        <h1 className="text-[20px] font-semibold text-vpv-ink">Not available</h1>
        <p className="mt-2 text-[14px] text-vpv-muted">This page is for the platform owner.</p>
      </div>
    </div>
  );
}
