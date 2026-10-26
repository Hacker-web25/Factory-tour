/**
 * /legal — the legal centre: one page that links every policy.
 * Driven by components/legal/nav.ts, so a new policy listed there
 * appears here, in the footer and in the sitemap automatically.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHero, PageShell } from "@/components/legal/LegalPage";
import { COMPANY_LINKS, POLICY_LINKS } from "@/components/legal/nav";
import { POLICY } from "@/lib/company";

export const metadata: Metadata = {
  title: "Legal centre",
  description:
    "Every VPV policy in one place: Terms & Conditions, Privacy, Cancellation & Refund, Shipping & Delivery, Cookies, Disclaimer and Security.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/legal" },
};

const COMPANY_BLURBS: Record<string, string> = {
  "/plans": "VPV Confidence, Authority, Control and Enterprise: what each includes, the special offer, and what extras cost.",
  "/assessment": "Five short questions that recommend your plan and show your full price, travel included.",
  "/about": "What VPV is, who builds it and what we stand for.",
  "/contact": "Who to write to for support, billing, legal and security.",
};

export default function LegalHubPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Legal centre"
        title="Everything you should know, in one place."
        summary={`Our policies are written to be read. Last updated ${POLICY.updated}.`}
      />

      <div className="mx-auto max-w-6xl px-5 py-12 lg:py-16 space-y-12">
        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.16em] text-vpv-muted mb-5">
            Policies
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {POLICY_LINKS.map((l) => (
              <Card key={l.href} href={l.href} title={l.label} blurb={l.blurb} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.16em] text-vpv-muted mb-5">
            Company
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {COMPANY_LINKS.map((l) => (
              <Card key={l.href} href={l.href} title={l.label} blurb={COMPANY_BLURBS[l.href] ?? ""} />
            ))}
          </div>
        </section>
      </div>
    </PageShell>
  );
}

function Card({ href, title, blurb }: { href: string; title: string; blurb: string }) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-vpv-line p-6 transition-all hover:border-vpv-blue/40 hover:shadow-[0_18px_40px_-24px_rgba(20,104,216,0.45)]"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[16.5px] font-semibold text-vpv-ink">{title}</h3>
        <ArrowRight
          size={16}
          className="text-vpv-muted transition-transform group-hover:translate-x-0.5 group-hover:text-vpv-blue"
        />
      </div>
      <p className="mt-2 text-[14px] leading-relaxed text-slate-600">{blurb}</p>
    </Link>
  );
}
