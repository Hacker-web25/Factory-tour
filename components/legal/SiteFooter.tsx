/**
 * Footer pieces for the public site.
 *
 *   <SiteFooter />   full footer for policy / marketing-style pages
 *   <LegalLinks />   one-line strip for dashboards, login and forms
 *
 * Both read the link registry in ./nav so a new policy page appears
 * everywhere the moment it is added there.
 */

import Link from "next/link";
import { COMPANY, companyIdentity } from "@/lib/company";
import { COMPANY_LINKS, POLICY_LINKS } from "./nav";

/* ─────────────────────────── Full footer ─────────────────────────── */

export function SiteFooter() {
  const year = new Date().getFullYear();
  const hasAddress = COMPANY.addressLines.length > 0;

  return (
    <footer className="border-t border-vpv-line bg-vpv-canvas text-slate-600">
      <div className="mx-auto max-w-6xl px-5 py-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1.2fr_1.2fr]">
        {/* Brand + registered identity */}
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-vpv-ink">
            {COMPANY.productName}
          </div>
          <p className="mt-2 text-[13px] leading-relaxed max-w-xs">
            Premium 360° virtual tours that let your customers walk through
            your plant from anywhere in the world.
          </p>
          <p className="mt-4 text-[12px] leading-relaxed text-slate-500">
            VPV is operated by {companyIdentity()}.
            {COMPANY.gstin && <> GSTIN: {COMPANY.gstin}.</>}
            {COMPANY.cin && <> CIN/LLPIN: {COMPANY.cin}.</>}
          </p>
        </div>

        {/* Company */}
        <FooterColumn title="Company">
          {COMPANY_LINKS.map((l) => (
            <FooterLink key={l.href} href={l.href}>
              {l.label}
            </FooterLink>
          ))}
          <FooterLink href="/legal">All policies</FooterLink>
        </FooterColumn>

        {/* Policies */}
        <FooterColumn title="Policies">
          {POLICY_LINKS.map((l) => (
            <FooterLink key={l.href} href={l.href}>
              {l.label}
            </FooterLink>
          ))}
        </FooterColumn>

        {/* Contact */}
        <FooterColumn title="Contact">
          <li>
            <a
              href={`mailto:${COMPANY.emails.support}`}
              className="hover:text-vpv-blue break-all"
            >
              {COMPANY.emails.support}
            </a>
          </li>
          <li>
            <a
              href={`mailto:${COMPANY.emails.billing}`}
              className="hover:text-vpv-blue break-all"
            >
              {COMPANY.emails.billing}
            </a>
          </li>
          {COMPANY.phone && (
            <li>
              <a href={`tel:${COMPANY.phone.replace(/\s+/g, "")}`} className="hover:text-vpv-blue">
                {COMPANY.phone}
              </a>
            </li>
          )}
          {hasAddress && (
            <li className="pt-1 text-[12.5px] leading-relaxed text-slate-500">
              {COMPANY.addressLines.map((line, i) => (
                <span key={i} className="block">
                  {line}
                </span>
              ))}
            </li>
          )}
        </FooterColumn>
      </div>

      <div className="border-t border-vpv-line">
        <div className="mx-auto max-w-6xl px-5 py-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-[12px] text-slate-500">
          <span>
            © {year} {COMPANY.legalName}. All rights reserved.
          </span>
          <span>
            Prices are in INR and include GST unless stated. Online payments
            are processed by Razorpay.
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-vpv-ink mb-3.5">
        {title}
      </div>
      <ul className="space-y-2 text-[13px]">{children}</ul>
    </div>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link href={href} className="hover:text-vpv-blue">
        {children}
      </Link>
    </li>
  );
}

/* ───────────────────── Compact strip for app screens ───────────────────── */

const SHORT = (href: string) =>
  POLICY_LINKS.find((l) => l.href === href)?.short ?? href;

/** Everything a reviewer or customer might look for. */
const STRIP_FULL = [
  { href: "/terms", label: SHORT("/terms") },
  { href: "/privacy", label: SHORT("/privacy") },
  { href: "/refund-policy", label: SHORT("/refund-policy") },
  { href: "/shipping-policy", label: SHORT("/shipping-policy") },
  { href: "/cookies", label: SHORT("/cookies") },
  { href: "/disclaimer", label: SHORT("/disclaimer") },
  { href: "/security", label: SHORT("/security") },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
];

/** Narrow surfaces such as the 240px dashboard sidebars. */
const STRIP_COMPACT = [
  { href: "/terms", label: SHORT("/terms") },
  { href: "/privacy", label: SHORT("/privacy") },
  { href: "/refund-policy", label: SHORT("/refund-policy") },
  { href: "/contact", label: "Contact" },
  { href: "/legal", label: "All policies" },
];

/**
 * One-line policy strip. `tone` matches the surface it sits on, and
 * links open in a new tab by default so a presenter or editor never
 * loses their place by tapping one.
 */
export function LegalLinks({
  tone = "light",
  newTab = true,
  align = "center",
  compact = false,
  className = "",
}: {
  tone?: "light" | "dark";
  newTab?: boolean;
  align?: "center" | "left";
  /** Shorter link set for narrow surfaces (dashboard sidebars). */
  compact?: boolean;
  className?: string;
}) {
  const links = compact ? STRIP_COMPACT : STRIP_FULL;
  const text =
    tone === "dark"
      ? "text-white/40 hover:text-white/70"
      : "text-vpv-muted/80 hover:text-vpv-blue";
  const dot = tone === "dark" ? "text-white/20" : "text-vpv-line";
  return (
    <nav
      aria-label="Legal"
      className={`flex flex-wrap gap-x-2 gap-y-1 text-[10.5px] ${
        align === "center" ? "justify-center text-center" : "justify-start"
      } ${className}`}
    >
      {links.map((l, i) => (
        <span key={l.href} className="inline-flex items-center gap-2">
          {i > 0 && <span className={dot}>·</span>}
          <Link
            href={l.href}
            className={`${text} transition-colors`}
            {...(newTab ? { target: "_blank", rel: "noopener" } : {})}
          >
            {l.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}
