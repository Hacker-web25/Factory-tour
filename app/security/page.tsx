/**
 * /security — public-facing summary of what VPV does to protect
 * customer data. Links to the responsible-disclosure email.
 */

import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/legal/LegalPage";
import { B, L, Mail, P, UL } from "@/components/legal/prose";
import { COMPANY, POLICY } from "@/lib/company";

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
          <B>Private tours stay private.</B> A tour shared by link opens only
          with that link, and a password, expiry or one-time rule on the link is
          checked by the database, not by the page. Meeting files are kept in
          private storage and opened only through short-lived signed links.
        </li>
        <li>
          <B>Bot checks</B> (Cloudflare Turnstile) on sign-in and password-reset
          forms.
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
        <UL>
          <li>
            <B>Prices are set on our server.</B> The amount you pay is worked
            out on our server from the published price list, never taken from
            the page, so it cannot be changed in the browser.
          </li>
          <li>
            <B>Every payment is verified.</B> A payment counts only after its
            Razorpay signature is checked on our server, and Razorpay&rsquo;s
            payment notices to us are signature-checked too. A daily check
            matches our records against Razorpay&rsquo;s, so a payment is never
            lost or counted twice.
          </li>
          <li>
            <B>Payment records cannot be edited from the browser.</B> Only our
            server can write them.
          </li>
        </UL>
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
          <B>Independent audit (such as SOC 2 or ISO 27001).</B> Not yet. We
          would rather tell you where our controls stand than claim a
          certificate we do not have. If we get one, it will be listed here.
        </li>
        <li>
          <B>Hiding tour pictures from people who have the address.</B> The
          360° pictures inside a tour are served from our media store at
          long, unguessable addresses so they load fast. Someone who already
          has a picture&rsquo;s address can open it; the link and password
          rules protect the tour, not each picture.
        </li>
      </UL>
    ),
  },
  {
    id: "report",
    title: "Report a vulnerability",
    body: (
      <P>
        Email <Mail to={COMPANY.emails.support} />. We acknowledge within{" "}
        {POLICY.grievanceAckHours} hours. Please don’t publicly disclose a vulnerability until
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
