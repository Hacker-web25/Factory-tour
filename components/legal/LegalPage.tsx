/**
 * LegalPage — the shared shell for every policy and company page.
 *
 *   • Sticky header with the VPV mark and the key public links
 *   • Title block with the effective date
 *   • "On this page" contents (sticky on desktop, collapsible on phones)
 *   • Numbered sections with stable #anchors, so one clause can be linked
 *     in an e-mail ("see /terms#price-changes")
 *   • Full footer with every policy link
 *
 * Server component, zero client JS: it prints cleanly, loads instantly
 * and can be exported as static HTML for the marketing site.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import VpvLogo from "@/components/dashboard/VpvLogo";
import { COMPANY, POLICY } from "@/lib/company";
import { SiteFooter } from "./SiteFooter";

export type LegalSection = {
  /** Anchor id, kebab-case. */
  id: string;
  title: string;
  body: ReactNode;
};

const HEADER_LINKS = [
  { href: "/why-vpv", label: "Why VPV" },
  { href: "/plans", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/security", label: "Security" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-vpv-line bg-white/90 backdrop-blur print:hidden">
      <div className="mx-auto max-w-6xl px-5 h-16 flex items-center justify-between gap-4">
        <a href={COMPANY.website} aria-label="VPV home" className="shrink-0">
          <VpvLogo sublabel={null} height={24} />
        </a>
        <nav className="hidden sm:flex items-center gap-7 text-[13px] text-vpv-muted">
          {HEADER_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-vpv-blue transition-colors">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2.5">
          <Link
            href="/assessment"
            className="hidden sm:inline-flex rounded-full bg-vpv-grad px-4 py-2 text-[12.5px] font-semibold text-white shadow-[0_8px_22px_-10px_rgba(20,104,216,0.7)] hover:opacity-90 transition-opacity"
          >
            Get started
          </Link>
          <a
            href={COMPANY.loginUrl}
            className="rounded-full border border-vpv-line px-4 py-2 text-[12.5px] font-semibold text-vpv-ink hover:border-vpv-blue/40 hover:text-vpv-blue transition-colors"
          >
            Sign in
          </a>
        </div>
      </div>
    </header>
  );
}

/** Header + footer wrapper for the company pages (pricing, contact, about)
 *  that bring their own hero instead of the policy title block. */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-slate-700 font-sans text-[15px] leading-normal scroll-smooth">
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}

/** Soft gradient hero used by the company pages. */
export function PageHero({
  eyebrow,
  title,
  summary,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  summary?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      className="border-b border-vpv-line"
      style={{
        backgroundImage:
          "radial-gradient(60% 120% at 90% 0%, rgba(25,184,242,0.12), rgba(255,255,255,0) 60%), radial-gradient(50% 100% at 0% 0%, rgba(20,104,216,0.08), rgba(255,255,255,0) 55%)",
      }}
    >
      <div className="mx-auto max-w-6xl px-5 pt-14 pb-12">
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-vpv-blue mb-3">
          {eyebrow}
        </div>
        <h1 className="text-[36px] sm:text-[48px] leading-[1.08] font-semibold tracking-tight text-vpv-ink max-w-3xl">
          {title}
        </h1>
        {summary && (
          <p className="mt-4 max-w-2xl text-[16.5px] leading-relaxed text-slate-600">
            {summary}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}

export default function LegalPage({
  eyebrow = "Legal",
  title,
  summary,
  sections,
  showDate = true,
  numbered = true,
  children,
}: {
  eyebrow?: string;
  title: string;
  /** One or two sentences under the title. */
  summary?: ReactNode;
  sections: LegalSection[];
  showDate?: boolean;
  numbered?: boolean;
  /** Optional block rendered between the title and the sections
   *  (e.g. an "at a glance" callout). */
  children?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white text-slate-700 font-sans text-[15px] leading-normal scroll-smooth">
      <SiteHeader />

      {/* Title block */}
      <div
        className="border-b border-vpv-line"
        style={{
          backgroundImage:
            "radial-gradient(60% 120% at 90% 0%, rgba(25,184,242,0.10), rgba(255,255,255,0) 60%), radial-gradient(50% 100% at 0% 0%, rgba(20,104,216,0.07), rgba(255,255,255,0) 55%)",
        }}
      >
        <div className="mx-auto max-w-6xl px-5 pt-12 pb-10">
          <nav className="text-[12px] text-vpv-muted mb-5 print:hidden" aria-label="Breadcrumb">
            <Link href="/legal" className="hover:text-vpv-blue">
              Legal
            </Link>
            <span className="mx-2 text-vpv-line">/</span>
            <span className="text-vpv-ink">{title}</span>
          </nav>
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-vpv-blue mb-3">
            {eyebrow}
          </div>
          <h1 className="text-[34px] sm:text-[42px] leading-[1.1] font-semibold tracking-tight text-vpv-ink max-w-3xl">
            {title}
          </h1>
          {summary && (
            <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-slate-600">
              {summary}
            </p>
          )}
          {showDate && (
            <p className="mt-5 text-[12.5px] text-vpv-muted">
              Effective {POLICY.updated} · Operated by {COMPANY.legalName}
            </p>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-6xl px-5 py-10 lg:py-14 grid gap-10 lg:grid-cols-[230px_minmax(0,1fr)]">
        {/* Contents — a collapsible card on phones, a sticky rail on desktop */}
        <aside className="lg:sticky lg:top-24 lg:self-start print:hidden">
          <details className="lg:hidden group rounded-xl border border-vpv-line bg-vpv-canvas/60">
            <summary className="cursor-pointer list-none px-4 py-3 text-[13px] font-medium text-vpv-ink flex items-center justify-between">
              On this page
              <span className="text-vpv-muted text-xs group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <div className="px-4 pb-4">
              <TocList sections={sections} numbered={numbered} />
            </div>
          </details>
          <div className="hidden lg:block">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-vpv-muted mb-3">
              On this page
            </div>
            <TocList sections={sections} numbered={numbered} rail />
          </div>
        </aside>

        {/* Content */}
        <article className="min-w-0 max-w-3xl leading-7">
          {children}
          {sections.map((s, i) => (
            <section
              key={s.id}
              id={s.id}
              className="scroll-mt-24 pb-9 mb-9 border-b border-vpv-line/70 last:border-b-0 last:mb-0 last:pb-0"
            >
              <h2 className="text-[21px] font-semibold tracking-tight text-vpv-ink mb-4">
                {numbered && <span className="text-vpv-blue/70 mr-2 tabular-nums">{i + 1}.</span>}
                {s.title}
              </h2>
              <div>{s.body}</div>
            </section>
          ))}

          <div className="mt-12 rounded-xl border border-vpv-line bg-vpv-canvas/70 px-5 py-4 text-[13px] text-slate-600 print:hidden">
            Questions about this page? Write to{" "}
            <a className="text-vpv-blue underline underline-offset-2" href={`mailto:${COMPANY.emails.support}`}>
              {COMPANY.emails.support}
            </a>{" "}
            and we will reply within {POLICY.replyBusinessDays} business days.
            See all of our policies in the{" "}
            <Link href="/legal" className="text-vpv-blue underline underline-offset-2">
              legal centre
            </Link>
            .
          </div>
        </article>
      </div>

      <SiteFooter />
    </div>
  );
}

function TocList({
  sections,
  numbered,
  rail = false,
}: {
  sections: LegalSection[];
  numbered: boolean;
  rail?: boolean;
}) {
  return (
    <ol className={`space-y-1.5 text-[13px] ${rail ? "border-l border-vpv-line" : ""}`}>
      {sections.map((s, i) => (
        <li key={s.id}>
          <a
            href={`#${s.id}`}
            className={`block text-vpv-muted hover:text-vpv-blue transition-colors leading-snug py-0.5 ${
              rail ? "pl-4 -ml-px border-l border-transparent hover:border-vpv-blue" : ""
            }`}
          >
            {numbered && <span className="tabular-nums text-vpv-muted/60 mr-1.5">{i + 1}.</span>}
            {s.title}
          </a>
        </li>
      ))}
    </ol>
  );
}
