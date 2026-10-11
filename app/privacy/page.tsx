/**
 * /privacy — VPV privacy policy, served from every subdomain.
 *
 * Written to be factually accurate about what the product actually
 * does and doesn't do. Review with legal before shipping if you
 * operate in a regulated market (EU, UK, India DPDP). The dates and
 * contact email are the only parts that may need updating per release.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy · VPV",
  description:
    "How VPV (Virtual Plant Visit) handles personal data, viewer analytics, and account information.",
  robots: { index: true, follow: true },
};

const UPDATED = "October 2026";

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-white text-slate-900 py-12 px-6">
      <article className="max-w-2xl mx-auto">
        <nav className="text-[12px] text-slate-500 mb-6">
          <Link href="/" className="hover:text-slate-900">
            ← Back to VPV
          </Link>
        </nav>
        <h1 className="text-3xl font-semibold tracking-tight mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-slate-500 mb-10">Last updated: {UPDATED}</p>

        <Section title="Who we are">
          VPV (Virtual Plant Visit) is a 360° virtual-tour platform operated
          by The Next Design. We help manufacturers host immersive tours of
          their facilities and share them with their own customers through
          private links. This policy explains what personal data we handle,
          why, and your rights over it.
        </Section>

        <Section title="What we collect">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Account data</strong> — name, email, mobile number,
              password hash. Supplied when an organisation admin creates
              your account, or when you redeem a sales-team invite code.
            </li>
            <li>
              <strong>Organisation data</strong> — tour content you author
              (scenes, hotspots, logos, uploaded media).
            </li>
            <li>
              <strong>Viewer analytics</strong> — anonymous device
              fingerprint, approximate country, scene-view timestamps,
              hotspot click counts, session duration. Collected on tours
              you share publicly or via gated links.
            </li>
            <li>
              <strong>Share-link recipients</strong> — if you tagged a
              link with a recipient email or phone number, we store that
              tag so you can see who the link was for.
            </li>
            <li>
              <strong>Security logs</strong> — failed login attempts,
              active device sessions, new-device alerts. Used only to
              enforce rate-limits and the per-user device cap.
            </li>
          </ul>
        </Section>

        <Section title="What we DON'T collect">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              We do not fingerprint viewers across websites. Our device
              fingerprint is a random UUID stored in your browser's
              localStorage — scoped to our domain only.
            </li>
            <li>
              We do not sell or share analytics data with advertisers or
              third-party marketing networks.
            </li>
            <li>
              We do not record video or audio of viewers. If a presenter
              uses the (opt-in) "record this walkthrough" feature, only
              their own screen + microphone is captured, and only for
              their organisation's internal review.
            </li>
          </ul>
        </Section>

        <Section title="Where your data lives">
          Account data, tour content, and analytics are stored in Supabase
          (Postgres + Object Storage), hosted in region eu-central-1 by
          default. Row-level security policies restrict every row to its
          owning organisation — a user from Organisation A cannot read
          data belonging to Organisation B, even through the public API.
        </Section>

        <Section title="How we use it">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>To render tours and gate access as the tour owner configured.</li>
            <li>To show the tour owner analytics about their shared links.</li>
            <li>To send security alerts (new device, password reset).</li>
            <li>To troubleshoot bugs you report to us.</li>
          </ul>
          We do not use your data to train AI models.
        </Section>

        <Section title="Cookies and local storage">
          We use a small amount of browser storage, no cookies for
          tracking:
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li>
              <code>vpv_device_fp</code> — a random UUID so your signed-in
              session doesn't count as a new device on every reload.
            </li>
            <li>
              <code>sb-*</code> — Supabase auth tokens for keeping you
              signed in.
            </li>
            <li>Session storage for in-flight form state.</li>
          </ul>
        </Section>

        <Section title="Your rights">
          You can request a copy of your data, correction, or deletion by
          emailing <a className="text-blue-600 underline" href="mailto:privacy@myvpv.com">privacy@myvpv.com</a>.
          For organisation data (tour content, viewer analytics), the
          request should come from the organisation admin on record.
          We respond within 30 days.
        </Section>

        <Section title="Data retention">
          Account data is retained for as long as the organisation is
          active, and for 90 days after cancellation. Viewer analytics
          are retained for 24 months. Security logs (failed logins,
          device sessions) are retained for 30 days.
        </Section>

        <Section title="Children">
          VPV is a B2B product. We do not knowingly collect data from
          anyone under 18. If you believe we hold data about a minor,
          email us and we will delete it.
        </Section>

        <Section title="Changes to this policy">
          Material changes are announced on the dashboard login page at
          least 14 days before taking effect. The "Last updated" date at
          the top of this page always reflects the current version.
        </Section>

        <Section title="Contact">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Privacy questions: <a className="text-blue-600 underline" href="mailto:privacy@myvpv.com">privacy@myvpv.com</a></li>
            <li>Security disclosures: <a className="text-blue-600 underline" href="mailto:security@myvpv.com">security@myvpv.com</a></li>
            <li>Everything else: <a className="text-blue-600 underline" href="mailto:founders@myvpv.com">founders@myvpv.com</a></li>
          </ul>
        </Section>

        <div className="mt-12 pt-6 border-t border-slate-200 text-xs text-slate-500">
          See also:{" "}
          <Link href="/terms" className="text-blue-600 underline">Terms of Service</Link>
          {" · "}
          <Link href="/security" className="text-blue-600 underline">Security practices</Link>
        </div>
      </article>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold tracking-tight mb-3">{title}</h2>
      <div className="text-[14px] leading-relaxed text-slate-700">
        {children}
      </div>
    </section>
  );
}
