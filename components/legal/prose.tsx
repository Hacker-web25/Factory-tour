/**
 * Small typographic primitives for the policy pages. Pure server
 * components — no hooks, no client JS — so the pages stay fast, print
 * cleanly and can be exported as static HTML.
 */

import Link from "next/link";
import type { ReactNode } from "react";

export function P({ children }: { children: ReactNode }) {
  return <p className="mb-4 last:mb-0">{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return (
    <ul className="mb-4 last:mb-0 list-disc pl-5 space-y-2 marker:text-vpv-blue/60">
      {children}
    </ul>
  );
}

export function OL({ children }: { children: ReactNode }) {
  return (
    <ol className="mb-4 last:mb-0 list-decimal pl-5 space-y-2 marker:text-vpv-blue/70 marker:font-medium">
      {children}
    </ol>
  );
}

/** Bold lead-in inside a list item or paragraph. */
export function B({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-vpv-ink">{children}</strong>;
}

/** Mail link. */
export function Mail({ to }: { to: string }) {
  return (
    <a
      href={`mailto:${to}`}
      className="text-vpv-blue underline underline-offset-2 hover:text-vpv-navy break-all"
    >
      {to}
    </a>
  );
}

/** Internal link. */
export function L({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="text-vpv-blue underline underline-offset-2 hover:text-vpv-navy"
    >
      {children}
    </Link>
  );
}

/** Highlighted box for the one thing a reader must not miss. */
export function Callout({
  title,
  children,
  tone = "info",
}: {
  title?: string;
  children: ReactNode;
  tone?: "info" | "notice";
}) {
  const palette =
    tone === "notice"
      ? "border-amber-200 bg-amber-50/70"
      : "border-vpv-blue/20 bg-vpv-tint/70";
  return (
    <div className={`my-5 rounded-xl border ${palette} px-4 py-3.5`}>
      {title && (
        <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-vpv-navy mb-1.5">
          {title}
        </div>
      )}
      <div className="text-[14.5px] leading-relaxed text-slate-700">{children}</div>
    </div>
  );
}

/** Responsive table with a horizontally scrollable wrapper on phones. */
export function DataTable({
  head,
  rows,
}: {
  head: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="my-5 overflow-x-auto rounded-xl border border-vpv-line">
      <table className="w-full min-w-[560px] border-collapse text-left text-[13.5px] leading-snug">
        <thead>
          <tr className="bg-vpv-canvas text-vpv-ink">
            {head.map((h) => (
              <th
                key={h}
                className="px-3.5 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-vpv-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-vpv-line align-top">
              {r.map((c, j) => (
                <td
                  key={j}
                  className={`px-3.5 py-3 ${j === 0 ? "font-medium text-vpv-ink" : "text-slate-700"}`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
