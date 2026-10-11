/**
 * /terms — VPV Terms of Service.
 *
 * Written to cover the real risks of the product (unauthorised
 * redistribution of tours, false identity in share-link recipient
 * tags, abuse of device-limit bypass). Review with legal before
 * launching paid tiers.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service · VPV",
  description:
    "Terms governing use of the VPV (Virtual Plant Visit) platform.",
  robots: { index: true, follow: true },
};

const UPDATED = "October 2026";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white text-slate-900 py-12 px-6">
      <article className="max-w-2xl mx-auto">
        <nav className="text-[12px] text-slate-500 mb-6">
          <Link href="/" className="hover:text-slate-900">
            ← Back to VPV
          </Link>
        </nav>
        <h1 className="text-3xl font-semibold tracking-tight mb-2">
          Terms of Service
        </h1>
        <p className="text-sm text-slate-500 mb-10">Last updated: {UPDATED}</p>

        <S title="1. Who this applies to">
          These terms apply to anyone who uses VPV: organisation
          administrators who upload tours, sales-team members who present
          them, and visitors who open a shared link. By using the
          service, you agree to be bound by them.
        </S>

        <S title="2. Your account">
          You keep your login details confidential. One active device
          per user by default (your admin may raise the limit). Sharing
          your credentials is a termination-grade violation — the
          device-limit system is there to make it hard, not just to make
          a point. If you lose access to the device you were signed in
          on, your admin can revoke the session from the team page.
        </S>

        <S title="3. Your content">
          You own every panorama, logo, hotspot caption and audio clip
          you upload. We only process it to render your tours and show
          analytics. We don't claim any rights beyond what's necessary
          to deliver the service.
        </S>

        <S title="4. Acceptable use">
          Don't upload content you don't have the rights to distribute,
          content that's unlawful under Indian law or the law of the
          viewer's country, or content designed to deceive viewers
          (deepfake factories, fake facility addresses, false quality
          claims). We may suspend accounts that abuse the share-link
          recipient system to impersonate someone else's email.
        </S>

        <S title="5. Visitor data">
          If you share tours with your own customers, you're responsible
          for whatever notice and consent your local law requires on
          their end. We provide the analytics; the relationship with
          those visitors is yours.
        </S>

        <S title="6. Availability">
          We aim for 99% monthly uptime. We don't guarantee any specific
          performance beyond that, and we may bring the service down for
          scheduled maintenance with 48 hours notice (except for
          security-critical patches). Scheduled maintenance windows are
          announced on the dashboard.
        </S>

        <S title="7. Payment and cancellation">
          Paid tiers are billed in advance. You can cancel any time from
          the dashboard; your account stays active until the end of the
          paid period. We don't pro-rate refunds for partial months.
          Account data is retained for 90 days after cancellation so
          you can re-subscribe without losing it.
        </S>

        <S title="8. Suspension and termination">
          We may suspend accounts that violate these terms, that attempt
          to break our rate-limits or device enforcement, or that we
          reasonably believe have been compromised. We'll contact the
          organisation admin before termination except where immediate
          action is required to protect other users.
        </S>

        <S title="9. Liability">
          VPV is provided "as is". We are not liable for lost business,
          lost sales opportunities, or indirect damages arising from
          the use (or inability to use) the service. Our total liability
          in any 12-month period is capped at the fees you paid us in
          that period. This cap doesn't apply to our indemnification
          obligations or to anything we're not allowed to limit under
          applicable consumer law.
        </S>

        <S title="10. Changes">
          We may update these terms. Material changes are announced on
          the dashboard login page at least 14 days before taking
          effect, and we'll email the organisation admin on record.
          Continued use after the effective date counts as acceptance.
        </S>

        <S title="11. Governing law">
          These terms are governed by the laws of India. Disputes will
          be resolved in the courts of New Delhi.
        </S>

        <S title="12. Contact">
          Questions about these terms:{" "}
          <a className="text-blue-600 underline" href="mailto:legal@myvpv.com">legal@myvpv.com</a>
        </S>

        <div className="mt-12 pt-6 border-t border-slate-200 text-xs text-slate-500">
          See also:{" "}
          <Link href="/privacy" className="text-blue-600 underline">Privacy Policy</Link>
          {" · "}
          <Link href="/security" className="text-blue-600 underline">Security practices</Link>
        </div>
      </article>
    </main>
  );
}

function S({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold tracking-tight mb-3">{title}</h2>
      <div className="text-[14px] leading-relaxed text-slate-700">
        {children}
      </div>
    </section>
  );
}
