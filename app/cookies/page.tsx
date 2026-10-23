/**
 * /cookies — Cookie & Local Storage Policy.
 *
 * Accurate to the codebase. Keep the table in sync when a storage key or
 * a third-party script is added or removed.
 *
 * October 2026: this page used to say VPV set no cookies at all. That
 * stopped being true when Google Analytics, Microsoft Clarity and our own
 * visitor cookie were added, so the claim was removed rather than quietly
 * left standing. If analytics is ever switched off again, the honest thing
 * is to change this page back on the same day.
 */

import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/legal/LegalPage";
import { B, Callout, DataTable, L, Mail, P, UL } from "@/components/legal/prose";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description:
    "What VPV stores in your browser and why: the cookies that keep you signed in, the ones that tell us how people find the site, and how to turn the measurement ones off.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/cookies" },
};

const sections: LegalSection[] = [
  {
    id: "summary",
    title: "The short version",
    body: (
      <>
        <Callout title="No advertising, ever">
          We do not use advertising cookies, we do not run ads, and we never
          sell or share what we measure with an advertising network.
        </Callout>
        <P>
          Two kinds of storage are used here. The first kind is{" "}
          <B>necessary</B>: it keeps you signed in and remembers your settings,
          and the product cannot work without it. The second kind is{" "}
          <B>measurement</B>: it tells us how people found this site and which
          pages they read, so we know whether a pamphlet, a search result or an
          advertisement for ourselves was worth the money.
        </P>
        <P>
          You can refuse the measurement kind. Choose <B>Decline</B> on the
          notice at the bottom of the page, and Google Analytics and Microsoft
          Clarity are not loaded at all on any page you visit afterwards, and
          our own measurement stops recording your visit. Nothing about the
          product stops working, and you can change your mind by clearing this
          site&rsquo;s data in your browser.
        </P>
      </>
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
              <code key="m1" className="text-[12.5px]">vpv_vid</code>,
              "Cookie — measurement",
              "A random number that stands for this browser, so we can tell one visit from another and see whether a printed QR code led to an enquiry. It holds no name, e-mail or address, and is not shared with anyone.",
              "One year, or until you clear this site's data.",
            ],
            [
              <code key="m2" className="text-[12.5px]">vpv_no_analytics</code>,
              "Cookie — your choice",
              "Set when you press Decline. Stops Google Analytics and Microsoft Clarity loading, and stops us recording your visit.",
              "One year, or until you clear this site's data.",
            ],
            [
              <code key="m3" className="text-[12.5px]">vpv.attr.v1, vpv.sid.v1</code>,
              "Local storage — measurement",
              "Remembers how you first arrived (a search, a link, or a code from a pamphlet) and groups the pages of one visit together.",
              "Until cleared.",
            ],
            [
              <code key="m4" className="text-[12.5px]">_ga, _ga_*</code>,
              "Cookie — measurement (Google Analytics)",
              "Google Analytics: counts visitors and shows which pages and sources bring them. Set by Google under Google's policy.",
              "Up to two years.",
            ],
            [
              <code key="m5" className="text-[12.5px]">_clck, _clsk</code>,
              "Cookie — measurement (Microsoft Clarity)",
              "Microsoft Clarity: records how pages are used — scrolling, clicks and a replay of the visit — so we can see where the site confuses people. Typed text is masked before it leaves your browser. Set by Microsoft under Microsoft's policy.",
              "Up to one year.",
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
          <li>
            <B>Google Analytics</B> (Google) — counts visits and tells us which
            pages and which sources bring people here. We ask it to shorten
            your IP address before storing it.
          </li>
          <li>
            <B>Microsoft Clarity</B> (Microsoft) — shows how a page was used,
            including a replay of the visit, so we can find the parts that
            confuse people. It masks text you type before it is sent.
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
          <B>Turning measurement off.</B> Press <B>Decline</B> on the notice at
          the bottom of the page. From then on Google Analytics and Microsoft
          Clarity are never loaded, and our own measurement discards anything
          from this browser. The necessary storage in the table above stays,
          because signing in does not work without it.
        </P>
        <P>
          You can clear VPV’s stored data at any time from your browser
          settings (“Clear site data”). Signing out removes the session;
          clearing everything will sign you out, reset the settings above and
          also reset your choice about measurement.
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
      summary="What VPV keeps in your browser and why, including the measurement cookies you can turn off."
      sections={sections}
    />
  );
}
