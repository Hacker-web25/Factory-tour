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
import { PRO_MONTHLY_INR, SCENE_MIN, SUPPORT_ANNUAL_INR, SUPPORT_NAME, inr, priceForScenes } from "@/lib/pricing";

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
              All payments to VPV are <B>non-refundable by default</B>.
            </li>
            <li>
              <B>Exception:</B> if a failure on VPV's side (platform outage,
              data loss caused by us, a core function we described that does
              not work) prevents you from using the Service, write to us. We
              will review the request and, where we agree a refund is due,
              we will issue one at our discretion.
            </li>
            <li>
              Duplicate charges, excess charges and payments taken for an
              order that was never confirmed are <B>always refunded in full</B>.
            </li>
            <li>
              You can stop a renewal at any time by writing to{" "}
              <Mail to={COMPANY.emails.support} />; there are no
              cancellation fees. The current paid period is not refunded.
            </li>
            <li>
              Where we approve a refund, it reaches your original payment
              method in <B>{POLICY.refundProcessing}</B>.
            </li>
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
            renewing at any time by e-mailing <Mail to={COMPANY.emails.support} />.
            If a renewal is not paid, the Workspace locks {POLICY.supportGraceDays}{" "}
            days after the renewal date and unlocks as soon as you renew; your
            Content is kept (see the Terms). We send reminders before and after
            each renewal date, so a year never starts without you knowing.
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
            days&rsquo; written notice to <Mail to={COMPANY.emails.support} />;
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
    title: "When a refund may be considered",
    body: (
      <>
        <P>
          <B>All payments to VPV are non-refundable</B>, except in the three
          situations in the table below. In every other case, including a
          change of mind, lower-than-expected use, or a decision to switch
          providers, the fee stays with us. If you believe your situation
          falls under an exception, write to us and we will review it.
        </P>
        <DataTable
          head={["Situation", "What happens"]}
          rows={[
            [
              "VPV-side failure — platform outage, data loss caused by us, or a core function we described that does not work",
              <>
                We investigate and, where we agree the failure is on our
                side and no reasonable fix is possible, we issue a refund
                for the affected period or purchase, at our discretion. We
                e-mail you with the decision and, if a refund is agreed, a
                reference to track it.
              </>,
            ],
            [
              "Duplicate, excess or erroneous charge",
              <>
                <B>Full refund</B> of the extra amount, whatever the time
                elapsed, once we confirm it. We issue a credit note.
              </>,
            ],
            [
              "Payment taken but order not confirmed",
              <>
                Reversed automatically by your bank or Razorpay, usually
                within {POLICY.refundProcessing}. If it is not, write to us
                with the payment ID and we will trace it.
              </>,
            ],
            [
              `Basic licence (from ${inr(priceForScenes(SCENE_MIN))} + 18% GST)`,
              <>
                <B>Non-refundable</B> once payment succeeds, including the
                first year of Annual Support &amp; Maintenance bundled with
                it. See the VPV-side-failure row above for exceptions.
              </>,
            ],
            [
              "Scene top-up",
              <>
                <B>Non-refundable</B> once payment succeeds.
              </>,
            ],
            [
              `${SUPPORT_NAME} (${inr(SUPPORT_ANNUAL_INR)} + 18% GST a year)`,
              <>
                <B>Non-refundable</B> and not pro-rated once the year has
                started. When the first year is charged with your order, it is
                refunded with the order if the order is refunded before your
                Workspace goes live. You can stop a renewal at any time before
                it is paid.
              </>,
            ],
            [
              `Pro and Ultra monthly fees (from ${inr(PRO_MONTHLY_INR)} a month)`,
              <>
                <B>Non-refundable</B>, and the current month is not
                pro-rated. Cancel at any time with 30 days&rsquo; written
                notice; billing stops at the end of that notice period.
                Anything else is as stated in your written proposal.
              </>,
            ],
          ]}
        />
        <P>
          Where we do approve a refund, it is the full amount paid for the
          affected item, including the GST on it. We bear the payment
          gateway's fee; it is not deducted. We issue a credit note for
          every refunded invoice.
        </P>
      </>
    ),
  },
  {
    id: "not-refundable",
    title: "What is never refundable",
    body: (
      <UL>
        <li>
          Any payment, after it has succeeded, where none of the three
          situations in the table above applies. This is the default.
        </li>
        <li>
          Renewal charges where you were reminded in advance and did not
          cancel before the renewal date, unless the charge was made in
          error.
        </li>
        <li>
          Charges for a Workspace that we suspended or ended for a serious
          breach of the <L href="/terms#acceptable-use">acceptable-use rules</L>.
        </li>
        <li>
          Third-party costs you incurred, such as your own photography,
          travel, or software you bought from someone else.
        </li>
        <li>
          The cab travel charge and any extra shoot time, once the
          shoot has taken place. They pay for a visit that has already
          happened.
        </li>
        <li>
          A change of mind, lower-than-expected use of the Service, or a
          decision to switch providers.
        </li>
      </UL>
    ),
  },
  {
    id: "shoot-changes",
    title: "Moving or cancelling a factory shoot",
    body: (
      <UL>
        <li>
          <B>You move the date</B> with at least {POLICY.rescheduleNoticeHours}{" "}
          hours&rsquo; notice: no charge. With less notice, or if the crew
          arrives and cannot shoot because of something on your side, travel
          costs we have already incurred may be charged again for the new
          date.
        </li>
        <li>
          <B>We move the date:</B> we reschedule at no extra charge.
        </li>
        <li>
          <B>We cannot shoot at all</B> for a reason on our side: you may ask
          for a refund under &ldquo;When a refund may be considered&rdquo;
          above.
        </li>
        <li>
          <B>Special offer price.</B> A refunded order gives up its place in
          the special offer. If you order again later, you pay the price shown
          at that time.
        </li>
      </UL>
    ),
  },
  {
    id: "how-to-request",
    title: "How to ask for a refund",
    body: (
      <>
        <P>
          You can always ask, even where the default is non-refundable. We
          read every request and reply.
        </P>
        <OL>
          <li>
            E-mail <Mail to={COMPANY.emails.support} /> from your account
            address, or from the billing contact on the invoice.
          </li>
          <li>
            Include the invoice number or Razorpay payment ID, the amount
            and the reason you believe a refund is due — in particular,
            which VPV-side issue you encountered and when.
          </li>
          <li>
            We reply within {POLICY.replyBusinessDays} business days. If we
            need more information we will ask once and decide promptly
            after.
          </li>
        </OL>
        <P>
          If we decline, we will explain why. You may reply to ask for a
          second review by a senior member of the team. A declined refund
          does not stop you from cancelling future renewals.
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
          the refund has been sent to your bank, with a credit note and a reference you can give your bank.
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
        <li>Refunds and billing: <Mail to={COMPANY.emails.support} /></li>
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
