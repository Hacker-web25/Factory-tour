/**
 * /refund-policy — Cancellation & Refund Policy.
 *
 * Razorpay's reviewers look for this page by name. Every window and amount
 * comes from lib/company.ts (POLICY) and lib/pricing.ts; change them there
 * and this page, the Terms and the checkout all follow.
 *
 * 16 Nov 2026: rewritten for the four VPV plans (Basic, Pro and Ultra are no
 * longer sold; see "Older plans"). A failure on OUR side is now a firm refund
 * for what was not delivered, not a refund "at our discretion": a business
 * that keeps the money for a shoot it never did is the kind of one-sided
 * term the Consumer Protection Act 2019 treats as unfair.
 */

import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/legal/LegalPage";
import { B, Callout, DataTable, L, Mail, OL, P, UL } from "@/components/legal/prose";
import { COMPANY, POLICY } from "@/lib/company";
import { SALES_TEAM, SUPPORT_ANNUAL_INR, SUPPORT_NAME, inr } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Cancellation & Refund Policy",
  description:
    "How to cancel VPV, when you get a refund, how to ask for one and how long it takes. VPV is a service delivered online: nothing is shipped and nothing is returned.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/refund-policy" },
};

const reach = COMPANY.phone ? ` or WhatsApp ${COMPANY.phone}` : "";

const sections: LegalSection[] = [
  {
    id: "scope",
    title: "What this policy covers",
    body: (
      <>
        <P>
          VPV is a service delivered online, with one visit to your factory to
          shoot it. Nothing is shipped, so there is nothing to return. This
          policy covers cancelling, and refunds of money paid for a VPV Plan
          (yearly or lifetime), the yearly {SUPPORT_NAME} that comes with every
          Plan, its add-ons and Sales Team logins.
        </P>
        <Callout title="At a glance">
          <UL>
            <li>
              Payments are <B>not refundable once made</B>, because we start
              booking your shoot as soon as you pay. The exceptions below are
              firm, not &ldquo;at our discretion&rdquo;.
            </li>
            <li>
              <B>If we cannot shoot or deliver</B> for a reason on our side, you
              get a <B>full refund</B> of what was not delivered.
            </li>
            <li>
              Duplicate, excess or wrong charges are <B>always refunded in
              full</B>.
            </li>
            <li>
              You can stop renewing at any time, by e-mail{reach}. No fee, no
              reason needed, no call to persuade you to stay.
            </li>
            <li>
              An approved refund reaches your original payment method in{" "}
              <B>{POLICY.refundProcessing}</B>.
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
            <B>Before you pay.</B> Leave checkout at any time; you are charged
            only when payment succeeds.
          </li>
          <li>
            <B>Your yearly renewal.</B> A yearly Plan and the yearly{" "}
            {SUPPORT_NAME} (on every Plan, lifetime ones too) renew only when you
            pay for them: we never charge you automatically. To stop, simply do
            not renew, or tell us and we stop the reminders. If a renewal is not paid, the Workspace
            locks {POLICY.supportGraceDays} days after the renewal date and
            unlocks as soon as you renew; your Content is kept (see the{" "}
            <L href="/terms#support">Terms</L>).
          </li>
          <li>
            <B>Sales Team logins.</B> Untick them at renewal, or tell us. They
            end on their own date; nothing your salespeople created is deleted.
          </li>
          <li>
            <B>Closing your Workspace.</B> E-mail us{reach}. It stays open to the
            end of the period you have paid for. We then keep your data for{" "}
            {POLICY.retentionAfterCancelDays} days so you can come back, and
            delete it as described in the{" "}
            <L href="/privacy#retention">Privacy Policy</L>.
          </li>
        </UL>
        <P>Fees are not paid back for part of a period you cancel during.</P>
      </>
    ),
  },
  {
    id: "eligibility",
    title: "When you get a refund",
    body: (
      <>
        <DataTable
          head={["Situation", "What happens"]}
          rows={[
            [
              "We cannot shoot your factory for a reason on our side (for example, we cannot offer you a shoot date within a reasonable time, or your factory turns out to be outside the cities we shoot in)",
              <>
                <B>Full refund</B> of everything you paid for that order, or a
                new date if you prefer. Your choice.
              </>,
            ],
            [
              "We shot your factory but cannot deliver the VPV for a reason on our side",
              <>
                <B>Full refund</B> of the Plan Fee and add-ons not delivered.
              </>,
            ],
            [
              "An area, video or report you paid for is missing from what we delivered",
              <>
                We deliver it, at no charge. If we cannot, we <B>refund that
                item</B> at the price on your bill.
              </>,
            ],
            [
              "Duplicate, excess or wrong charge",
              <>
                <B>Full refund</B> of the extra amount, however long ago, once
                we confirm it. We issue a credit note.
              </>,
            ],
            [
              "Money taken, but the order was never confirmed",
              <>
                Usually reversed automatically by your bank or Razorpay within{" "}
                {POLICY.refundProcessing}. If not, send us the payment ID and we
                will trace and refund it.
              </>,
            ],
            [
              "A serious, lasting fault on our side stops you using the Service (an outage, or data loss caused by us) and we cannot fix it within a reasonable time",
              <>
                A <B>refund for the affected period</B> of your Plan Fee (or, on a
                Plan bought before 21 November 2026, of {SUPPORT_NAME}), or of the
                affected item.
              </>,
            ],
          ]}
        />
        <P>
          Where a refund is due, it is the full amount paid for that item,
          including the GST on it. We bear the payment gateway&rsquo;s fee; it is
          never deducted. We issue a credit note for every refunded invoice.
        </P>
      </>
    ),
  },
  {
    id: "not-refundable",
    title: "What is not refundable",
    body: (
      <>
        <P>
          Outside the situations above, payments stay with us once made. We say
          this plainly before you pay, on the billing page, so that it is never
          a surprise. In particular:
        </P>
        <UL>
          <li>a change of mind, using VPV less than expected, or switching to another provider, once you have paid;</li>
          <li>
            a year of a yearly Plan once the year has started, including the part
            of the year you do not use if you stop early, and a lifetime Plan Fee
            once paid; the first payment for a Plan also pays for the shoot,
            which is booked as soon as you pay;
          </li>
          <li>
            Sales Team logins ({inr(SALES_TEAM.regularInr)} per salesperson a
            year at the regular price) and {SUPPORT_NAME} ({inr(SUPPORT_ANNUAL_INR)}{" "}
            plus GST a year), once the year has started;
          </li>
          <li>cab travel, extra shoot time and date-change fees once the shoot visit has happened, because they pay for a visit that took place;</li>
          <li>a renewal you paid after we reminded you, unless it was charged in error;</li>
          <li>fees for a Workspace we suspended or closed for a serious breach of the <L href="/terms#acceptable-use">acceptable-use rules</L>;</li>
          <li>costs you paid to someone else, such as your own photography or software.</li>
        </UL>
      </>
    ),
  },
  {
    id: "shoot-changes",
    title: "Changing or cancelling the shoot date",
    body: (
      <UL>
        <li>
          <B>You change the date:</B> the first change is free; each change after
          that is {inr(POLICY.rescheduleFeeInr)} plus GST, shown to you before
          you confirm it. Please give us at least {POLICY.rescheduleNoticeHours}{" "}
          hours&rsquo; notice.
        </li>
        <li>
          <B>Our crew arrives and cannot shoot</B> because of something on your
          side: the visit counts as a change of date, and any cab travel charge
          on your order is charged again for the new visit.
        </li>
        <li>
          <B>We change the date:</B> no charge, and it does not count as your
          change.
        </li>
        <li>
          <B>We cannot shoot at all</B> for a reason on our side: full refund
          (see the table above).
        </li>
        <li>
          <B>Special offer.</B> A refunded order gives up its place in the
          special offer. If you order again later, you pay the price shown then.
        </li>
      </UL>
    ),
  },
  {
    id: "how-to-request",
    title: "How to ask for a refund",
    body: (
      <>
        <P>You can always ask. We read every request and reply.</P>
        <OL>
          <li>
            E-mail <Mail to={COMPANY.emails.support} />
            {reach}, or use the form on the <L href="/contact">Contact</L> page.
          </li>
          <li>
            Give the invoice number or Razorpay payment ID, the amount, and why
            you believe a refund is due.
          </li>
          <li>
            We acknowledge within {POLICY.grievanceAckHours} hours and give you
            our decision within {POLICY.replyBusinessDays} business days. If we
            need more information, we ask once.
          </li>
        </OL>
        <P>
          If we say no, we explain why in writing. You can ask for a second
          review by a senior member of the team, and you keep every right you
          have under the Consumer Protection Act, 2019 (see{" "}
          <L href="/terms#grievance">Complaints</L>).
        </P>
      </>
    ),
  },
  {
    id: "processing",
    title: "How refunds are paid",
    body: (
      <P>
        Refunds go back to the <B>original payment method</B> through Razorpay:
        the card, UPI ID, bank account or wallet you paid with. Once approved,
        a refund normally appears in {POLICY.refundProcessing}; some banks take
        longer to show it. We e-mail you when it has been sent, with a credit
        note and a reference you can give your bank. Payments made by bank
        transfer are refunded to the account they came from.
      </P>
    ),
  },
  {
    id: "disputes",
    title: "Chargebacks and disputes",
    body: (
      <P>
        Please contact us before raising a dispute with your bank; we can
        usually fix a genuine problem faster directly. If a chargeback is
        raised, we answer it with the order, delivery and usage records we hold.
      </P>
    ),
  },
  {
    id: "price-changes",
    title: "Price changes and refunds",
    body: (
      <P>
        A refund is always for the price you actually paid, not today&rsquo;s
        price. Price changes need {POLICY.priceChangeNoticeDays} days&rsquo;
        e-mail notice and never affect something you have already paid for (see{" "}
        <L href="/terms#price-changes">Terms, Price changes</L>).
      </P>
    ),
  },
  {
    id: "older-plans",
    title: "Older plans",
    body: (
      <P>
        If you bought Basic, Pro or Ultra before these plans were withdrawn, the
        refund terms on your order still apply. Where your order says nothing,
        this policy applies. Pro and Ultra could be cancelled with 30
        days&rsquo; written notice; that has not changed.
      </P>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <UL>
        <li>Refunds and billing: <Mail to={COMPANY.emails.support} /></li>
        {COMPANY.phone ? <li>Phone and WhatsApp: {COMPANY.phone} ({COMPANY.phoneHours})</li> : null}
        <li>All details on the <L href="/contact">Contact</L> page.</li>
      </UL>
    ),
  },
];

export default function RefundPolicyPage() {
  return (
    <LegalPage
      title="Cancellation & Refund Policy"
      summary="Clear rules for cancelling and for getting your money back, including how long it takes."
      sections={sections}
    />
  );
}
