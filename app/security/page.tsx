/**
 * /security — public-facing summary of what VPV does to protect
 * customer data. Links to the responsible-disclosure email.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Security · VPV",
  description:
    "How VPV protects tour content, viewer analytics, and account data — and how to report a vulnerability.",
  robots: { index: true, follow: true },
};

export default function SecurityPage() {
  return (
    <main className="min-h-screen bg-white text-slate-900 py-12 px-6">
      <article className="max-w-2xl mx-auto">
        <nav className="text-[12px] text-slate-500 mb-6">
          <Link href="/" className="hover:text-slate-900">
            ← Back to VPV
          </Link>
        </nav>
        <h1 className="text-3xl font-semibold tracking-tight mb-2">
          Security
        </h1>
        <p className="text-sm text-slate-500 mb-10">
          How we protect the data you host with us, and how to tell us if
          we're doing it wrong.
        </p>

        <S title="What we do">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Row-level security</strong> on every database table.
              A user from one organisation cannot read, write, or infer
              the existence of another organisation's data — even by
              crafting the HTTP request by hand.
            </li>
            <li>
              <strong>Password hashing</strong> with bcrypt, salted
              per-user. We never store or log plaintext passwords.
            </li>
            <li>
              <strong>Rate limiting on login</strong> — five failed
              attempts in fifteen minutes locks the account for fifteen
              minutes. Prevents credential-stuffing attacks.
            </li>
            <li>
              <strong>Per-user device limits</strong>, enforced on
              sign-in. Default is one active device per user; raising
              it is an admin-only action.
            </li>
            <li>
              <strong>New-device email alerts</strong> whenever your
              account is signed in from a browser we haven't seen
              before.
            </li>
            <li>
              <strong>Transport encryption</strong> everywhere.
              HTTP Strict Transport Security with a two-year max-age.
            </li>
            <li>
              <strong>Content Security Policy</strong> restricting what
              third-party resources the dashboard can load. Protects
              against stored-XSS even if we miss an input sanitisation
              bug.
            </li>
            <li>
              <strong>Signed URLs</strong> for every panorama download.
              A customer tour's images cannot be hot-linked outside the
              viewer page.
            </li>
          </ul>
        </S>

        <S title="What we don't do (and why)">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Full screen-recording prevention.</strong> No
              browser can fully stop a determined person from recording
              their own screen. We make it harder (page blackout on
              visibility change, viewer-fingerprint watermark on every
              frame, no save/print shortcuts), but we don't claim
              we've solved it.
            </li>
            <li>
              <strong>Independent SOC 2 audit.</strong> Not yet. We're
              transparent about where our controls stand today; a
              formal audit is on the roadmap once the paid tier
              launches.
            </li>
          </ul>
        </S>

        <S title="Report a vulnerability">
          Email{" "}
          <a className="text-blue-600 underline" href="mailto:security@myvpv.com">
            security@myvpv.com
          </a>
          . We respond within two business days. Please don't publicly
          disclose a vulnerability until we've had a chance to patch it;
          we commit to patching within 30 days of a confirmed report,
          and we credit researchers who want to be named.
        </S>

        <div className="mt-12 pt-6 border-t border-slate-200 text-xs text-slate-500">
          See also:{" "}
          <Link href="/privacy" className="text-blue-600 underline">
            Privacy Policy
          </Link>
          {" · "}
          <Link href="/terms" className="text-blue-600 underline">
            Terms of Service
          </Link>
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
