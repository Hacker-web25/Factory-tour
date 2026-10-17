/**
 * /disclaimer — what VPV can and cannot promise.
 */

import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/legal/LegalPage";
import { B, L, Mail, P, UL } from "@/components/legal/prose";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = {
  title: "Disclaimer",
  description:
    "The limits of what VPV, its analytics and its AI-assisted insights can promise, and what remains the responsibility of the customer.",
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
    title: "AI-assisted insights",
    body: (
      <>
        <P>
          Features such as meeting transcripts, speaker separation, summaries,
          topic detection and scores are produced automatically from a
          transcript. They:
        </P>
        <UL>
          <li>can contain errors, miss context, mis-attribute a speaker or misread accents and mixed languages;</li>
          <li>are an aid for your team’s review, <B>not professional, legal, financial or HR advice</B>;</li>
          <li>should not be the only basis for evaluating, rewarding or disciplining a person, or for a decision about a customer.</li>
        </UL>
        <P>
          Please verify anything important against the original recording or
          notes.
        </P>
      </>
    ),
  },
  {
    id: "analytics",
    title: "Analytics are estimates",
    body: (
      <P>
        Viewer analytics — visits, durations, locations, devices — depend on
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
    id: "recordings",
    title: "Recording and consent",
    body: (
      <P>
        Recording tools are provided for the customer’s use. The customer is
        responsible for telling participants about a recording and for any
        consent applicable law requires. VPV does not give legal advice about
        recording laws; please take advice for the countries you do business
        in.
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
        hosting, payments, e-mail and AI processing, and an outage at one of
        them can affect the Service. Links and embedded content from other
        websites are provided for convenience; we do not control and are not
        responsible for them.
      </P>
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
