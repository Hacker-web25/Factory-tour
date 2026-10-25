/**
 * /shipping-policy — Shipping & Delivery Policy.
 *
 * VPV is delivered digitally, but payment-gateway reviewers still look
 * for this page. It says so plainly and states the delivery timeline.
 */

import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/legal/LegalPage";
import { B, Callout, L, Mail, OL, P, UL } from "@/components/legal/prose";
import { COMPANY, POLICY } from "@/lib/company";
import { LAUNCH_OFFER } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Shipping & Delivery Policy",
  description:
    "VPV is a digital service. Nothing is shipped: your workspace is delivered online shortly after payment is confirmed.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/shipping-policy" },
};

const sections: LegalSection[] = [
  {
    id: "digital",
    title: "Digital delivery only",
    body: (
      <>
        <Callout title="No physical shipping">
          VPV is delivered online. We do not ship physical goods, so there are
          no shipping charges, couriers or delivery addresses. The only
          physical part of an order is our crew visiting your factory to shoot
          it, by cab. The cab travel is shown on your bill before you pay
          (it is free for our first {LAUNCH_OFFER.limit} customers).
        </Callout>
      </>
    ),
  },
  {
    id: "timeline",
    title: "When you get access",
    body: (
      <>
        <OL>
          <li>You pay at checkout. Razorpay confirms the payment to us.</li>
          <li>
            Your Workspace, your subdomain and your admin login are created{" "}
            <B>automatically, within a minute</B> of that confirmation, and the
            welcome e-mail with your sign-in details goes to the address on
            your order. If anything interrupts that, we complete it by hand
            within <B>{POLICY.provisioningHours} hours</B> on a business day.
          </li>
          <li>
            You receive your GST invoice by e-mail. Your Workspace address is
            shown in the welcome message.
          </li>
        </OL>
        <P>
          Pro and Ultra Workspaces are not bought through the website. We set
          them up for you after the proposal is agreed, normally on the same
          business day, and send the sign-in details by e-mail.
        </P>
      </>
    ),
  },
  {
    id: "vpv-delivery",
    title: "When your VPV is ready",
    body: (
      <>
        <P>For a VPV plan (Confidence, Authority or Control):</P>
        <OL>
          <li>
            Your Workspace and sign-in are created as soon as payment is
            confirmed, as above.
          </li>
          <li>
            We contact you within <B>{POLICY.shootContactBusinessDays} business
            days</B> to agree a shoot date.
          </li>
          <li>
            Our crew shoots your factory on the agreed date, for the shoot time
            shown on your bill.
          </li>
          <li>
            The finished VPV — your areas, process videos, PDF reports and
            information icons — is placed in your Workspace within{" "}
            <B>{POLICY.vpvDeliveryWorkingDays} working days</B> of the shoot,
            and we e-mail you when it is live.
          </li>
        </OL>
        <P>
          Process videos are shot on iPhone and colour-graded by our team. A
          shoot moved at your request moves the delivery date with it.
        </P>
        <P>
          If you bought Sales Team logins, they are ready as soon as your
          Workspace is: add your salespeople from your dashboard with an
          invite code, and their meetings appear on your sales dashboard from
          their first presentation.
        </P>
      </>
    ),
  },
  {
    id: "delays",
    title: "If something is delayed",
    body: (
      <>
        <UL>
          <li>
            <B>No e-mail yet?</B> Check your spam folder, then write to{" "}
            <Mail to={COMPANY.emails.support} /> with your invoice number or
            payment ID.
          </li>
          <li>
            <B>Wrong address?</B> Tell us as soon as you notice and we will
            re-send access to the correct administrator.
          </li>
          <li>
            <B>We could not deliver?</B> If we cannot give you access within a
            reasonable time because of a problem on our side, you can ask for a
            full refund under the{" "}
            <L href="/refund-policy">Cancellation &amp; Refund Policy</L>.
          </li>
        </UL>
      </>
    ),
  },
  {
    id: "requirements",
    title: "What you need",
    body: (
      <P>
        A current desktop or mobile browser (Chrome, Edge, Safari or Firefox),
        a working internet connection and an e-mail address you can access.
        360° tours work best on a modern device with a stable connection.
      </P>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <P>
        Questions about access or delivery:{" "}
        <Mail to={COMPANY.emails.support} /> — we reply within{" "}
        {POLICY.replyBusinessDays} business days. More ways to reach us are on
        the <L href="/contact">Contact</L> page.
      </P>
    ),
  },
];

export default function ShippingPolicyPage() {
  return (
    <LegalPage
      title="Shipping & Delivery Policy"
      summary="VPV is a digital service, delivered online. Here is exactly when and how you get access."
      sections={sections}
    />
  );
}
