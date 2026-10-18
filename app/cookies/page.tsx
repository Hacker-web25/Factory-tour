/**
 * /cookies — Cookie & Local Storage Policy.
 *
 * Accurate to the codebase: VPV sets NO cookies of its own (Supabase
 * sessions live in localStorage). Keep this table in sync when a new
 * storage key is introduced.
 */

import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/legal/LegalPage";
import { B, Callout, DataTable, L, Mail, P, UL } from "@/components/legal/prose";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description:
    "VPV sets no tracking cookies. This page lists the small amount of browser storage the product uses to keep you signed in and remember your settings.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/cookies" },
};

const sections: LegalSection[] = [
  {
    id: "summary",
    title: "The short version",
    body: (
      <Callout title="No tracking cookies">
        VPV does not use advertising, analytics or cross-site tracking cookies,
        and we do not set any cookies of our own. We use your browser’s{" "}
        <B>local storage</B> and <B>session storage</B> — small, site-specific
        notes — only so the product works.
      </Callout>
    ),
  },
  {
    id: "what",
    title: "What these technologies are",
    body: (
      <P>
        Cookies are small text files a website can place in your browser.
        Local storage and session storage do a similar job inside the browser
        without being sent to the server with every request. Local storage
        stays until it is cleared; session storage disappears when you close
        the tab.
      </P>
    ),
  },
  {
    id: "what-we-use",
    title: "What VPV stores",
    body: (
      <>
        <DataTable
          head={["Name", "Type", "Purpose", "Duration"]}
          rows={[
            [
              <code key="a" className="text-[12.5px]">sb-*</code>,
              "Local storage — strictly necessary",
              "Keeps you signed in (authentication session from our sign-in provider, Supabase).",
              "Until you sign out or the session expires; inactive accounts are signed out after 15 days.",
            ],
            [
              <code key="b" className="text-[12.5px]">vpv_device_fp</code>,
              "Local storage — strictly necessary",
              "A random ID so your own device is recognised and does not count as a new device on every reload (device-limit security).",
              "Until cleared.",
            ],
            [
              <code key="c" className="text-[12.5px]">ft-session-id</code>,
              "Session storage — functional",
              "Groups the scenes you view into one visit for the tour owner’s analytics.",
              "Until the tab closes.",
            ],
            [
              <code key="d" className="text-[12.5px]">tour-pw-*</code>,
              "Session storage — strictly necessary",
              "Remembers that you entered the correct password for a protected tour, so it does not ask on every scene.",
              "Until the tab closes.",
            ],
            [
              <code key="e" className="text-[12.5px]">factour_viewer_email</code>,
              "Local storage — functional",
              "Remembers the e-mail you entered to open a gated tour link.",
              "Until cleared.",
            ],
            [
              <code key="f" className="text-[12.5px]">factour:lang</code>,
              "Local storage — functional",
              "Remembers your chosen display language.",
              "Until cleared.",
            ],
            [
              <code key="g" className="text-[12.5px]">factour:offline:*</code>,
              "Local storage and browser cache — functional",
              "Lets a presenter who prepared a tour for offline use run it without a connection, and queues analytics until the connection returns.",
              "Until the presenter removes the offline copy.",
            ],
            [
              <code key="i" className="text-[12.5px]">vpv.funnel.v1</code>,
              "Local storage — functional",
              "Holds your answers to the pricing questions (your details, factory city, the areas and processes you picked, your plan) so you can move between steps or come back later without starting again.",
              "Until you clear it, or press “Clear these answers” after buying.",
            ],
            [
              <code key="j" className="text-[12.5px]">myvpv:phase1:v1</code>,
              "Local storage — functional",
              "Used by the plans and FAQ pages of our marketing site to remember choices made there.",
              "Until cleared.",
            ],
            [
              <code key="h" className="text-[12.5px]">vpv:notif:*, factour:hotspotStyle:*</code>,
              "Local storage — functional",
              "Remembers which notifications you have seen and your tour-builder style preferences.",
              "Until cleared.",
            ],
          ]}
        />
      </>
    ),
  },
  {
    id: "third-party",
    title: "Third-party content",
    body: (
      <>
        <P>
          Some content on a page can come from another company, which may set
          its own cookies under its own policy:
        </P>
        <UL>
          <li>
            <B>YouTube</B> — if a tour includes an embedded video, YouTube
            (Google) may set cookies when you load or play it.
          </li>
          <li>
            <B>Google Fonts</B> — fonts may be fetched from Google’s servers,
            which receive your IP address.
          </li>
          <li>
            <B>Razorpay</B> — when you pay, Razorpay’s checkout runs on its own
            domain and sets the cookies it needs to secure the payment.
          </li>
        </UL>
      </>
    ),
  },
  {
    id: "control",
    title: "Your choices",
    body: (
      <>
        <P>
          Because we use only storage that is necessary or that you would
          expect (staying signed in, remembering a language), there is no
          marketing consent banner. You can clear VPV’s stored data at any time
          from your browser settings (“Clear site data”). Signing out removes
          the session; clearing everything will sign you out and reset the
          settings above.
        </P>
        <P>
          You can also block cookies in your browser, which stops embedded
          third-party content from setting them. VPV itself will keep working.
        </P>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes and contact",
    body: (
      <P>
        If we add a new type of storage, we update this page first. Questions:{" "}
        <Mail to={COMPANY.emails.support} />. See also the{" "}
        <L href="/privacy">Privacy Policy</L>.
      </P>
    ),
  },
];

export default function CookiePolicyPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      summary="VPV sets no tracking cookies. Here is everything the product keeps in your browser, and why."
      sections={sections}
    />
  );
}
