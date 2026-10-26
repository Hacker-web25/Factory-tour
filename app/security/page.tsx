/**
 * /security — public-facing summary of what VPV does to protect
 * customer data. Links to the responsible-disclosure email.
 */

import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/legal/LegalPage";
import { B, L, Mail, P, UL } from "@/components/legal/prose";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = {
  title: "Security",
  description:
    "How VPV protects tour content, viewer analytics, payments and account data — and how to report a vulnerability.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/security" },
};

const sections: LegalSection[] = [
  {
    id: "what-we-do",
    title: "What we do",
    body: (
      <UL>
        <li>
          <B>Row-level security</B> on every database table. A user from one
          organisation cannot read, write, or infer the existence of another
          organisation’s data — even by crafting the HTTP request by hand.
        </li>
        <li>
          <B>Password hashing</B> with bcrypt, salted per-user. We never store
          or log plaintext passwords.
        </li>
        <li>
          <B>Rate limiting on login</B> — five failed attempts in fifteen
          minutes locks the account for fifteen minutes. Prevents
          credential-stuffing attacks.
        </li>
        <li>
          <B>Per-user device limits</B>, enforced on sign-in. Default is one
          active device per user; raising it is an admin-only action.
        </li>
        <li>
          <B>New-device email alerts</B> whenever your account is signed in
          from a browser we haven’t seen before.
        </li>
        <li>
          <B>Transport encryption</B> everywhere. HTTP Strict Transport
          Security with a two-year max-age.
        </li>
        <li>
          <B>Content Security Policy</B> restricting what third-party
          resources the dashboard can load. Protects against stored-XSS even
          if we miss an input sanitisation bug.
        </li>
        <li>
          <B>Signed URLs</B> for every panorama download. A customer tour’s
          images cannot be hot-linked outside the viewer page.
        </li>
      </UL>
    ),
  },
  {
    id: "payments",
    title: "How payments are protected",
    body: (
      <>
        <P>
          Online payments are handled by Razorpay on its own secure checkout.
          Your card, UPI or net-banking details are entered there and go
          directly to Razorpay, a payment aggregator that operates to PCI DSS
          standards. They never pass through, and are never stored on, VPV’s
          servers.
        </P>
        {/* TODO(billing build): once the order/webhook routes ship, add the
            server-side price list, signature verification and write-locked
            payment tables here. Don't claim them before they exist. */}
      </>
    ),
  },
  {
    id: "what-we-dont-do",
    title: "What we don’t do (and why)",
    body: (
      <UL>
        <li>
          <B>Full screen-recording prevention.</B> No browser can fully stop a
          determined person from recording their own screen. We make it harder
          (page blackout on visibility change, viewer-fingerprint watermark on
          every frame, no save/print shortcuts), but we don’t claim we’ve
          solved it.
        </li>
        <li>
          <B>Independent SOC 2 audit.</B> Not yet. We’re transparent about
          where our controls stand today; a formal audit is on the roadmap
          once the paid tier launches.
        </li>
      </UL>
    ),
  },
  {
    id: "report",
    title: "Report a vulnerability",
    body: (
      <P>
        Email <Mail to={COMPANY.emails.support} />. We respond within two
        business days. Please don’t publicly disclose a vulnerability until
        we’ve had a chance to patch it; we commit to patching within 30 days
        of a confirmed report, and we credit researchers who want to be named.
        Related reading: <L href="/privacy">Privacy Policy</L> and{" "}
        <L href="/terms">Terms &amp; Conditions</L>.
      </P>
    ),
  },
];

export default function SecurityPage() {
  return (
    <LegalPage
      eyebrow="Trust"
      title="Security"
      summary="How we protect the data you host with us, and how to tell us if we’re doing it wrong."
      sections={sections}
    />
  );
}
