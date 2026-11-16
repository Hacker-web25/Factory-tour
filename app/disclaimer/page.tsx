/**
 * /disclaimer — what VPV can and cannot promise.
 */

import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/legal/LegalPage";
import { B, L, Mail, P, UL } from "@/components/legal/prose";
import { COMPANY } from "@/lib/company";
import { LAUNCH_OFFER } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Disclaimer",
  description:
    "The limits of what VPV and its figures can promise, and what remains the responsibility of the customer.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/disclaimer" },
};

const sections: LegalSection[] = [
  {
    id: "general",
    title: "General",
    body: (
      <P>
        VPV is built with care, and we stand behind the Service as described in
        our <L href="/terms">Terms &amp; Conditions</L>. This page explains
        the practical limits of what a software service can promise. It does
        not reduce any right you have under law that cannot be excluded.
      </P>
    ),
  },
  {
    id: "no-outcome",
    title: "No guaranteed business results",
    body: (
      <P>
        A virtual tour helps customers understand a facility, but we cannot
        promise any number of enquiries, orders, audits passed or revenue.
        Results depend on factors outside our control, such as your product,
        pricing and sales process.
      </P>
    ),
  },
  {
    id: "ai",
    title: "Recording and AI features",
    body: (
      <P>
        Meeting recording, transcripts and AI meeting analysis are switched off
        for every customer today (see the{" "}
        <L href="/terms#recording-ai">Terms</L>). If they are ever switched on,
        their limits will be explained here first. Anything produced
        automatically can be wrong, and would never be advice or the only basis
        for a decision about a person.
      </P>
    ),
  },
  {
    id: "analytics",
    title: "Analytics are estimates",
    body: (
      <P>
        Viewer figures (visits, durations, locations, devices) depend on
        browsers, network conditions, ad-blockers and the information a
        viewer provides. Treat them as a reliable guide, not an exact count.
        Location is approximate and may be unavailable if a person declines the
        browser prompt.
      </P>
    ),
  },
  {
    id: "content",
    title: "Your tour content",
    body: (
      <P>
        Each customer is responsible for the accuracy of what its tours show —
        capacities, certifications, processes and claims. A tour is a visual
        representation captured at a point in time and may not reflect the
        facility today. VPV does not verify customers’ claims and is not
        responsible for decisions a Viewer makes based on a tour.
      </P>
    ),
  },
  {
    id: "process-videos",
    title: "Process videos and your YouTube channel",
    body: (
      <>
        <P>
          Process videos are not hosted by VPV. Whether you shot the video
          yourself or paid us to shoot it, it is uploaded to a YouTube channel
          that <B>you own and control</B>, and your tour embeds the public link
          to it. Where we shoot a video for you, what you pay for is the shoot,
          the colour grade and the upload; the file and the channel are yours
          from that moment.
        </P>
        <P>
          Because the channel is yours, what happens to a video afterwards is
          outside our control. You can edit, replace, restrict or delete any of
          them at any time, and doing so changes or breaks what your tour shows.
          Your use of YouTube is governed by Google’s terms, not ours. VPV is
          not responsible for a video becoming unavailable, for a channel being
          suspended or removed, for advertising or recommendations YouTube
          places around your video, or for viewing figures or other data YouTube
          reports. We keep no master copy, so please keep your own.
        </P>
      </>
    ),
  },
  {
    id: "recordings",
    title: "Meeting location",
    body: (
      <P>
        With Sales Team logins, the place a meeting started is taken from the
        salesperson&rsquo;s browser, only with their permission. It can be
        approximate or missing (indoors, or when permission is refused), so
        treat it as a guide, not proof of where someone was.
      </P>
    ),
  },
  {
    id: "availability",
    title: "Availability and third parties",
    body: (
      <P>
        We aim for high availability but do not guarantee the Service will be
        uninterrupted or error-free. VPV depends on third-party services for
        hosting, storage, payments and e-mail, and an outage at one of
        them can affect the Service. Links and embedded content from other
        websites are provided for convenience; we do not control and are not
        responsible for them.
      </P>
    ),
  },
  {
    id: "quotes",
    title: "Quotes, travel and shoot time",
    body: (
      <UL>
        <li>
          The recommended plan is a suggestion based on your answers. You may
          choose any plan; the one you pay for is the one you get.
        </li>
        <li>
          Shoot time for add-ons is an estimate made in advance. You are
          charged for the extra time shown on your bill, not for what the
          shoot actually takes on the day.
        </li>
        <li>
          Our crew travels by cab, and the cab line on your bill (free for our
          first {LAUNCH_OFFER.limit} customers) is the whole travel cost. There is nothing else for you to book or pay for.
        </li>
        <li>
          The special offer is limited to our first {LAUNCH_OFFER.limit} customers and ends on
          its own once they have bought. The regular price shown beside it is
          the price from customer {LAUNCH_OFFER.limit + 1} onwards. See the{" "}
          <L href="/terms#special-offer">Terms</L>.
        </li>
        <li>
          Process videos are shot on iPhone and colour-graded. They are made
          to show your process clearly, not as broadcast production.
        </li>
      </UL>
    ),
  },
  {
    id: "payments",
    title: "Payments",
    body: (
      <P>
        Online payments are processed by Razorpay. We do not see or store your
        full card or bank details, and the timing of bank settlements and
        refunds depends partly on your bank and the payment network. See the{" "}
        <L href="/refund-policy">Cancellation &amp; Refund Policy</L>.
      </P>
    ),
  },
  {
    id: "contact",
    title: "Questions",
    body: (
      <P>
        If anything here is unclear, write to <Mail to={COMPANY.emails.support} />.
      </P>
    ),
  },
];

export default function DisclaimerPage() {
  return (
    <LegalPage
      title="Disclaimer"
      summary="Where our responsibility ends and yours begins — written so there are no surprises."
      sections={sections}
    />
  );
}
