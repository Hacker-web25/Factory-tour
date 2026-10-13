/**
 * /refund-policy — Cancellation, Return & Refund Policy.
 *
 * Razorpay's reviewers look for this page by name. The refund window and
 * timings are policy decisions held in lib/company.ts (POLICY); change
 * them there and this page, the Terms and the Pricing FAQ all follow.
 *
 * Draft for legal review — see the notice in the delivery notes.
 */

import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/legal/LegalPage";
import { B, Callout, DataTable, L, Mail, OL, P, UL } from "@/components/legal/prose";
import { COMPANY, POLICY } from "@/lib/company";
import { PRO_MONTHLY_INR, SCENE_MIN, SUPPORT_ANNUAL_INR, inr, priceForScenes } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Cancellation & Refund Policy",
  description:
    "How to cancel VPV, when a refund is due, how to request one and how long it takes. VPV is a digital service: nothing is shipped and nothing is returned.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/refund-policy" },
};

const sections: LegalSection[] = [
  {
    id: "scope",
    title: "What this policy covers",
    body: (
      <>
        <P>
          VPV is a digital software service. There are no physical goods, so
          nothing is shipped and there is no product to return. This policy
          covers cancelling a subscription or renewal, and refunds of money
          you have paid for the Basic Plan, Annual Support &amp; Maintenance,
          and Pro or Ultra orders.
        </P>
        <Callout title="At a glance">
          <UL>
            <li>
              Ask within <B>{POLICY.refundWindowDays} days</B> of paying and
              you are eligible for a full refund of the fee if you have not
              started using the paid Workspace, or if the Service cannot do
              what we described and we cannot fix it.
            </li>
            <li>A duplicate or wrongly charged payment is always refunded in full.</li>
            <li>Approved refunds reach your original payment method in <B>{POLICY.refundProcessing}</B>.</li>
            <li>You can stop a renewal at any time; there are no cancellation fees.</li>
          </UL>
        </Callout>
      </>
    ),
  },
  {
    id: "cancellation",
    title: "Cancelling",
    body: (
      <>
        <UL>
          <li>
            <B>Before you pay.</B> You can abandon checkout at any time; you
            are charged only when payment succeeds.
          </li>
          <li>
            <B>Annual Support &amp; Maintenance (Basic).</B> The first year is
            included with your licence. From the second year you can stop
            renewing at any time by e-mailing <Mail to={COMPANY.emails.billing} />,
            or simply by not renewing in your dashboard. We send a reminder
            before each renewal, so a year never starts without you knowing.
          </li>
          <li>
            <B>Closing your Workspace.</B> E-mail us. The Workspace stays
            active to the end of the period you have paid for. After
            cancellation we keep your data for {POLICY.retentionAfterCancelDays}{" "}
            days so you can return, then delete it as described in the{" "}
            <L href="/privacy#retention">Privacy Policy</L>.
          </li>
          <li>
            <B>Pro and Ultra.</B> These are monthly plans. Cancel with 30
            days&rsquo; written notice to <Mail to={COMPANY.emails.billing} />;
            billing stops at the end of the notice period. Anything else agreed
            in your written proposal takes precedence; where the proposal is
            silent, this policy applies.
          </li>
        </UL>
        <P>
          Fees are not pro-rated when you cancel part-way through a paid
          period.
        </P>
      </>
    ),
  },
  {
    id: "eligibility",
    title: "When a refund is due",
    body: (
      <>
        <DataTable
          head={["Payment", "Refund"]}
          rows={[
            [
              `Basic licence (from ${inr(priceForScenes(SCENE_MIN))}, GST included)`,
              <>
                <B>Full refund</B> if you request it within {POLICY.refundWindowDays}{" "}
                days of payment and either (a) you have not published or shared
                any tour with a customer, or (b) a core function of the Service
                that we described does not work and we have not fixed it within
                5 business days of your report. After that window the fee is
                non-refundable, except where we fail to provide the Service or
                the law requires otherwise.
              </>,
            ],
            [
              "Scene top-up",
              <>
                <B>Full refund</B> within {POLICY.refundWindowDays} days of the
                charge, as long as you have not shared a tour that uses the
                extra scenes. After that it is non-refundable.
              </>,
            ],
            [
              `Annual Support & Maintenance renewal (${inr(SUPPORT_ANNUAL_INR)}, GST included)`,
              <>
                <B>Full refund</B> if you request it within {POLICY.refundWindowDays}{" "}
                days of the renewal charge and you have not raised a support
                request in that year. Otherwise non-refundable, and not
                pro-rated. The first year of support comes free with a Basic
                licence and is never charged separately.
              </>,
            ],
            [
              `Pro and Ultra monthly fees (from ${inr(PRO_MONTHLY_INR)} a month)`,
              <>
                Cancel any time with 30 days&rsquo; notice, in writing. The
                current month is not refunded, and we do not pro-rate a partial
                month. Anything else is as stated in your written proposal.
              </>,
            ],
            [
              "Duplicate, excess or erroneous charge",
              <>
                <B>Full refund</B> of the extra amount, whatever the time
                elapsed, once we confirm it.
              </>,
            ],
            [
              "Payment taken but order not confirmed",
              <>
                Reversed automatically by your bank or Razorpay, usually within{" "}
                {POLICY.refundProcessing}. If it is not, write to us with the
                payment ID and we will trace it.
              </>,
            ],
          ]}
        />
        <P>
          The refund is the full amount you paid for the item, including the
          GST on it. We bear the payment gateway’s fee; it is not deducted from
          your refund. We issue a credit note for each refunded invoice.
        </P>
      </>
    ),
  },
  {
    id: "not-refundable",
    title: "What is not refundable",
    body: (
      <UL>
        <li>Fees after the {POLICY.refundWindowDays}-day window, other than the cases above.</li>
        <li>Renewal charges where you were reminded in advance and did not cancel before the renewal date, unless the charge was made in error.</li>
        <li>Charges for a Workspace that we suspended or ended for a serious breach of the <L href="/terms#acceptable-use">acceptable-use rules</L>.</li>
        <li>Third-party costs you incurred, such as your own photography or travel.</li>
      </UL>
    ),
  },
  {
    id: "how-to-request",
    title: "How to ask for a refund",
    body: (
      <>
        <OL>
          <li>
            E-mail <Mail to={COMPANY.emails.billing} /> from your account
            address, or from the billing contact on the invoice.
          </li>
          <li>
            Include the invoice number or Razorpay payment ID, the amount and
            the reason.
          </li>
          <li>
            We reply within {POLICY.replyBusinessDays} business days. If more
            information is needed we will ask once and decide promptly after.
          </li>
        </OL>
        <P>
          If we decline, we will explain why and you may reply to ask for a
          second review by a senior member of the team.
        </P>
      </>
    ),
  },
  {
    id: "processing",
    title: "How refunds are paid",
    body: (
      <>
        <P>
          Refunds go back to the <B>original payment method</B> through
          Razorpay — to the card, UPI ID, bank account or wallet used. After
          we approve a refund it normally appears in {POLICY.refundProcessing};
          some banks take longer to show it on a statement. We e-mail you when
          the refund is initiated, with a reference you can give your bank.
        </P>
        <P>
          Pro and Ultra orders paid by bank transfer are refunded to the
          account they came from.
        </P>
      </>
    ),
  },
  {
    id: "disputes",
    title: "Chargebacks and disputes",
    body: (
      <P>
        Please contact us before raising a dispute with your bank or card
        issuer; we usually resolve a genuine problem faster directly. If a
        chargeback is raised, we respond to it with the order, delivery and
        usage records we hold.
      </P>
    ),
  },
  {
    id: "price-changes",
    title: "Price changes and refunds",
    body: (
      <P>
        Prices may change, but only after we e-mail you at least{" "}
        {POLICY.priceChangeNoticeDays} days in advance, and a change never
        affects something you have already paid for (see{" "}
        <L href="/terms#price-changes">Terms › Price changes</L>). A refund
        is always for the price you actually paid, not the current price.
      </P>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <UL>
        <li>Refunds and billing: <Mail to={COMPANY.emails.billing} /></li>
        <li>Anything else: <Mail to={COMPANY.emails.support} /></li>
        <li>Full details on the <L href="/contact">Contact</L> page.</li>
      </UL>
    ),
  },
];

export default function RefundPolicyPage() {
  return (
    <LegalPage
      title="Cancellation & Refund Policy"
      summary="Clear rules for cancelling and for getting your money back — including how long it takes."
      sections={sections}
    />
  );
}
