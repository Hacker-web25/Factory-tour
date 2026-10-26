/**
 * /contact — Contact us.
 *
 * Payment-gateway reviewers require reachable contact details: a
 * business e-mail, and normally a phone number and registered address.
 * Anything left blank in lib/company.ts is simply not rendered.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Clock, CreditCard, LifeBuoy, Mail, Phone, Scale, ShieldCheck } from "lucide-react";
import { PageHero, PageShell } from "@/components/legal/LegalPage";
import EnquiryForm from "@/components/billing/EnquiryForm";
import { COMPANY, POLICY, companyIdentity } from "@/lib/company";

export const metadata: Metadata = {
  title: "Contact us",
  description:
    "Contact VPV for support, billing, privacy, legal or security matters. We reply to every message within two business days.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/contact" },
};

/**
 * What you can write to us about. There is deliberately no address on
 * each card: VPV has ONE mailbox (lib/company.ts), shown once above, so
 * nobody has to guess which address their question belongs to.
 */
const TOPICS = [
  {
    icon: LifeBuoy,
    title: "Support",
    text: "Help using VPV, access problems, or questions about your Workspace.",
  },
  {
    icon: CreditCard,
    title: "Billing and refunds",
    text: "Invoices, payments, renewals, price notices and refund requests.",
  },
  {
    icon: Scale,
    title: "Legal and privacy",
    text: "Terms, data-protection requests and complaints to our grievance officer.",
  },
  {
    icon: ShieldCheck,
    title: "Security",
    text: "Report a vulnerability responsibly. We respond within two business days.",
  },
];

export default function ContactPage() {
  const hasAddress = COMPANY.addressLines.length > 0;
  return (
    <PageShell>
      <PageHero
        eyebrow="Contact us"
        title="We are easy to reach."
        summary={`One address reaches us for everything. Every message gets a reply within ${POLICY.replyBusinessDays} business days.`}
      />

      <div className="mx-auto max-w-6xl px-5 py-12 lg:py-16">
        <div className="rounded-2xl border border-vpv-blue/25 bg-vpv-tint/40 p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-vpv-blue ring-1 ring-vpv-blue/20">
              <Mail size={19} />
            </span>
            <h2 className="text-[17px] font-semibold text-vpv-ink">
              One address for everything
            </h2>
          </div>
          <a
            href={`mailto:${COMPANY.emails.support}`}
            className="mt-4 inline-block text-[22px] font-semibold tracking-tight text-vpv-blue hover:text-vpv-navy break-all sm:text-[26px]"
          >
            {COMPANY.emails.support}
          </a>
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-slate-600">
            Support, billing, refunds, legal, privacy and security all reach
            the same team. You never have to work out which address to use.
            {COMPANY.phone && (
              <>
                {" "}
                Prefer to talk?{" "}
                <a
                  href={`tel:${COMPANY.phone.replace(/\s+/g, "")}`}
                  className="font-medium text-vpv-blue hover:text-vpv-navy"
                >
                  {COMPANY.phone}
                </a>
                .
              </>
            )}
          </p>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          {TOPICS.map((c) => (
            <div key={c.title} className="rounded-2xl border border-vpv-line p-6">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-vpv-tint text-vpv-blue">
                  <c.icon size={19} />
                </span>
                <h2 className="text-[17px] font-semibold text-vpv-ink">{c.title}</h2>
              </div>
              <p className="mt-3 text-[14px] leading-relaxed text-slate-600">{c.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-8">
          <EnquiryForm />
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border border-vpv-line p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-vpv-tint text-vpv-blue">
                <Building2 size={19} />
              </span>
              <h2 className="text-[17px] font-semibold text-vpv-ink">Company details</h2>
            </div>
            <dl className="mt-4 space-y-3 text-[14px]">
              <Row label="Operated by" value={companyIdentity()} />
              {COMPANY.gstin && <Row label="GSTIN" value={COMPANY.gstin} />}
              {COMPANY.cin && <Row label="CIN / LLPIN" value={COMPANY.cin} />}
              {hasAddress && (
                <Row
                  label="Registered office"
                  value={
                    <>
                      {COMPANY.addressLines.map((l, i) => (
                        <span key={i} className="block">
                          {l}
                        </span>
                      ))}
                    </>
                  }
                />
              )}
              {COMPANY.phone && (
                <Row
                  label="Phone"
                  value={
                    <>
                      <a
                        href={`tel:${COMPANY.phone.replace(/\s+/g, "")}`}
                        className="inline-flex items-center gap-1.5 text-vpv-blue hover:text-vpv-navy"
                      >
                        <Phone size={14} /> {COMPANY.phone}
                      </a>
                      <span className="block text-[12.5px] text-slate-500">{COMPANY.phoneHours}</span>
                    </>
                  }
                />
              )}
              <Row label="Website" value={COMPANY.website.replace("https://", "")} />
              <Row
                label={COMPANY.grievanceOfficer.role}
                value={
                  <>
                    {COMPANY.grievanceOfficer.name && (
                      <span className="block">{COMPANY.grievanceOfficer.name}</span>
                    )}
                    <a
                      href={`mailto:${COMPANY.grievanceOfficer.email}`}
                      className="text-vpv-blue hover:text-vpv-navy break-all"
                    >
                      {COMPANY.grievanceOfficer.email}
                    </a>
                  </>
                }
              />
            </dl>
          </div>

          <div className="rounded-2xl border border-vpv-line bg-vpv-canvas/60 p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-vpv-blue border border-vpv-line">
                <Clock size={19} />
              </span>
              <h2 className="text-[17px] font-semibold text-vpv-ink">What to expect</h2>
            </div>
            <ul className="mt-4 space-y-3 text-[14px] leading-relaxed text-slate-600">
              <li>
                A reply within <strong className="text-vpv-ink">{POLICY.replyBusinessDays} business days</strong>,
                often the same day.
              </li>
              <li>
                For a payment or refund question, include your invoice number or
                Razorpay payment ID so we can find it at once.
              </li>
              <li>
                Considering Pro or Ultra? Tell us about your plants and we will
                reply with a short call invite and a written proposal.
              </li>
              <li>
                Prefer to read first? See{" "}
                <Link href="/plans" className="text-vpv-blue underline underline-offset-2">Pricing</Link>,{" "}
                <Link href="/refund-policy" className="text-vpv-blue underline underline-offset-2">Refund Policy</Link> and{" "}
                <Link href="/legal" className="text-vpv-blue underline underline-offset-2">all policies</Link>.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[150px_1fr]">
      <dt className="text-[12px] font-semibold uppercase tracking-[0.1em] text-vpv-muted pt-0.5">
        {label}
      </dt>
      <dd className="text-slate-700">{value}</dd>
    </div>
  );
}
