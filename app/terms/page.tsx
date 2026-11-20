/**
 * /terms — VPV Terms & Conditions.
 *
 * Covers the commercial model as sold today: the seven VPV plans, sized
 * by the factory's covered area (Lite, Plus, Pro, Premium, Ultra, VPV,
 * Signature), each a one-time fee that
 * includes the factory shoot, plus a yearly Support, hosting & security fee
 * and optional yearly Sales Team logins. Every number and window comes from
 * lib/pricing.ts and lib/company.ts, so this page can never disagree with
 * /plans, the checkout, the invoice or the other policies.
 *
 * Reviewed 16 November 2026 against:
 *   • Consumer Protection Act 2019 and the Consumer Protection (E-Commerce)
 *     Rules 2020 (seller details, grievance officer, 48-hour acknowledgement,
 *     one-month resolution; the 2026 amendment comes into force 1 Jan 2027);
 *   • the CCPA Guidelines for Prevention and Regulation of Dark Patterns 2023
 *     (no drip pricing, no hidden renewals, cancelling as easy as buying);
 *   • the Digital Personal Data Protection Act 2023 and Rules 2025;
 *   • the Information Technology Act 2000.
 * It is written in plain words on purpose. It is not a substitute for advice
 * from a lawyer, and should be read by one before a major change.
 *
 * Old plans: Basic (scene ladder), Pro and Ultra are no longer sold. Their
 * buyers keep the terms of their order (see "Older plans"); the full old text
 * is in git history (app/terms/page.tsx before 16 Nov 2026).
 */

import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/legal/LegalPage";
import { B, Callout, L, Mail, P, UL } from "@/components/legal/prose";
import { COMPANY, POLICY, companyIdentity } from "@/lib/company";
import {
  ENTERPRISE_PERSONAL,
  EXTRA_HOUR_INR,
  VIDEO_SELF_INR,
  VIDEO_SHOT_INR,
  LAUNCH_OFFER,
  MINUTES_PER_EXTRA_AREA,
  SALES_TEAM,
  MIN_PAYABLE_INR,
  SITE_PLANS,
  SITE_PLAN_ORDER,
  VIDEO_SHOT_NOTE,
  discountBands,
  hoursLabel,
  siteQuote,
  GST_LABEL,
  SUPPORT_ANNUAL_INR,
  SUPPORT_MONTHLY_INR,
  SUPPORT_NAME,
  inr,
  inr2,
} from "@/lib/pricing";
import { CAB_TRAVEL, SERVICE_CITY_LIST } from "@/lib/logistics";

/* Worked example for the GST paragraph: VPV Pro, factory in Manesar. */
const EXAMPLE = siteQuote("pro", { city: "Manesar" });

const support = SUPPORT_NAME.toLowerCase();

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description:
    "The terms for VPV (Virtual Plant Visit): the seven plans and what each includes, every fee and GST, the factory shoot and rescheduling, yearly support and renewals, price changes with prior notice, and how to complain.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/terms" },
};

const sections: LegalSection[] = [
  {
    id: "agreement",
    title: "Agreement and scope",
    body: (
      <>
        <P>
          These Terms &amp; Conditions (the <B>Terms</B>) are an agreement
          between {companyIdentity()} (<B>VPV</B>, <B>we</B>, <B>us</B>) and the
          business that buys or uses VPV (the <B>Customer</B>, <B>you</B>).
          They apply to the VPV website, the dashboards, the tour builder, the
          tour viewer, the sales tools and everything else we provide under the
          VPV name (together, the <B>Service</B>).
        </P>
        <P>
          You agree to these Terms when you tick the box on the first step of
          our pricing questions, and again when you tick the box before paying.
          Neither box is ticked for you. You also accept them by accepting a
          written proposal, or by creating or using a VPV account. If you accept
          for a business, you confirm that you are allowed to bind it.
        </P>
        <P>
          These Terms work together with our{" "}
          <L href="/privacy">Privacy Policy</L>,{" "}
          <L href="/refund-policy">Cancellation &amp; Refund Policy</L>,{" "}
          <L href="/shipping-policy">Shipping &amp; Delivery Policy</L>,{" "}
          <L href="/cookies">Cookie Policy</L>,{" "}
          <L href="/disclaimer">Disclaimer</L> and the{" "}
          <L href="/plans">Plans</L> page, which all form part of the agreement.
          If a written proposal we have signed with you (for example for{" "}
          {SITE_PLANS.signature.name}) says something different, the proposal
          wins for that order.
        </P>
      </>
    ),
  },
  {
    id: "definitions",
    title: "Key terms",
    body: (
      <UL>
        <li>
          <B>Plan</B>: {SITE_PLAN_ORDER.map((id) => SITE_PLANS[id].name).join(", ")},
          as described on the <L href="/plans">Plans</L> page and below.
        </li>
        <li>
          <B>Active Operational Area (AOA)</B>: one area of your factory that a
          Viewer can explore in 360°. Each AOA becomes one scene in your tour.
        </li>
        <li>
          <B>Plan Fee</B>: the one-time fee for a Plan. It includes the factory
          shoot and building your VPV.
        </li>
        <li>
          <B>Support Fee</B>: the yearly fee for {support}, which keeps your
          Workspace and tours online.
        </li>
        <li>
          <B>Sales Team login</B>: an optional yearly login for one of your
          salespeople.
        </li>
        <li>
          <B>Workspace</B>: your business&rsquo;s private area of VPV, reached at{" "}
          <code className="text-[13px]">yourcompany.myvpv.com</code>.
        </li>
        <li>
          <B>Authorised Users</B>: the administrators and salespeople your
          business invites to the Workspace. <B>Viewers</B>: the people who open
          a tour link you share, such as your buyers.
        </li>
        <li>
          <B>Content</B>: everything in your Workspace: 360° pictures, logos,
          information-icon text, PDF reports, video links, client names and
          notes.
        </li>
      </UL>
    ),
  },
  {
    id: "eligibility",
    title: "Who can buy VPV",
    body: (
      <P>
        VPV is a business product, sold to businesses and to people acting for
        a business. It is not meant for personal or household use or for anyone
        under 18. By ordering you confirm that the business details you give us,
        including the name, address and GSTIN printed on your invoice, are
        correct, and that you will keep them up to date.
      </P>
    ),
  },
  {
    id: "accounts",
    title: "Accounts and security",
    body: (
      <>
        <P>
          Each Authorised User has a personal login. Keep it private and do not
          share it. By default one device can be signed in per user (your
          administrator can change this), and we e-mail an alert when an account
          signs in from a new device.
        </P>
        <P>
          You are responsible for what is done in your Workspace, including by
          your Authorised Users. Tell us at once at{" "}
          <Mail to={COMPANY.emails.support} /> if you think an account has been
          misused. Our safeguards are described on the{" "}
          <L href="/security">Security</L> page.
        </P>
      </>
    ),
  },
  {
    id: "plans",
    title: "The plans and what each includes",
    body: (
      <>
        <P>
          Each Plan is a done-for-you Virtual Plant Visit: our crew shoots your
          factory and we build the VPV in your own Workspace. Each Plan is
          bought once:
        </P>
        <UL>
          {SITE_PLAN_ORDER.map((id) => {
            const p = SITE_PLANS[id];
            return (
              <li key={id}>
                <B>{p.name}.</B> {p.plot.label}; {p.scenes} AOAs,{" "}
                {p.videos > 0 ? `up to ${p.videos} process videos` : "no process videos"},{" "}
                {p.pdfs > 0 ? `up to ${p.pdfs} PDF reports` : "no PDF reports"}, information icons,{" "}
                {hoursLabel(p.shootHours)} of shoot time on site
                {p.sharingControls ? ", and sharing controls (link expiry, one-time links, passwords and view limits)" : ""}
                {p.personal
                  ? `, together with a private discussion with ${ENTERPRISE_PERSONAL.person} and a shoot led personally by ${ENTERPRISE_PERSONAL.person} (see below)`
                  : ""}
                .
              </li>
            );
          })}
        </UL>
        <P>
          Every Plan also includes a password-protected dashboard, your own VPV
          address and your branding. The factory sizes (covered area) are a guide
          to which Plan suits which plant; what we deliver is the number of
          AOAs, videos, reports and shoot hours listed. Sharing controls come
          only with {SITE_PLANS.ultra.name}, {SITE_PLANS.vpv.name} and{" "}
          {SITE_PLANS.signature.name} (and, for customers who bought them
          before 20 November 2026, {SITE_PLANS.control.name} and{" "}
          {SITE_PLANS.enterprise.name}) and are not sold separately. No sharing control can stop a Viewer from taking a
          screenshot or recording their own screen.
        </P>
        <P>
          <B>Your right to use VPV.</B> Once the Plan Fee is paid, you may use
          the Service for your own business and show your tours to your Viewers,
          for as long as your {support} is paid up. This right is yours alone:
          you may not resell, white-label or sub-license the Service, copy or
          reverse-engineer it, or use it to build a competing product, except
          where the law allows this despite these Terms. If we ever decide to
          stop offering the Service, we give you at least{" "}
          {POLICY.retentionAfterCancelDays} days&rsquo; written notice and a way
          to export your Content.
        </P>
        <P>
          <B>Moving up a plan.</B> You can move up to a higher Plan from your
          dashboard at any time by paying the difference between the two Plans
          at that day&rsquo;s prices, plus GST. The higher Plan&rsquo;s features
          open as soon as payment is confirmed, and we agree a date to shoot any
          extra AOAs it includes. {SITE_PLANS.vpv.name} and{" "}
          {SITE_PLANS.signature.name} are arranged by speaking with us. A Plan
          bought before 20 November 2026 (Confidence, Authority, Control or
          Enterprise) keeps everything it included, and can move up to a
          current Plan that has at least as many AOAs and features.
        </P>
        <P>
          <B>Your Workspace address.</B> You choose your address (
          <code className="text-[13px]">yourcompany.myvpv.com</code>) when you
          pay, and we show you whether it is free before we take any money.
          Addresses are given first come, first served, and choosing one gives
          you no trademark or other right in the name. We may refuse an address
          VPV itself uses, one that impersonates someone else, or one we are
          legally required to withdraw. If we ever have to change yours, we tell
          you first and keep the old address working for at least 30 days so
          links you have shared still open. You may ask us to change it, and we
          will agree a date with you.
        </P>
        <P>
          <B>
            {SITE_PLANS.vpv.name} and {SITE_PLANS.signature.name}: personal attention.
          </B>{" "}
          {SITE_PLANS.vpv.name} and {SITE_PLANS.signature.name} (and{" "}
          {SITE_PLANS.enterprise.name}, for customers who bought it) include (a)
          one private discussion with{" "}
          {ENTERPRISE_PERSONAL.person} before your shoot, to plan how your plant
          is presented, and (b) your shoot led personally by{" "}
          {ENTERPRISE_PERSONAL.person}. Dates are agreed with you and depend on
          his availability. If he cannot attend an agreed date we offer the
          nearest other date. If he cannot attend at all, we tell you promptly
          and agree a fair remedy with you, which may include a partial refund of
          the Plan Fee.
        </P>
        <P>
          <B>Add-ons.</B> On any Plan you may add extra AOAs and extra process
          videos when you order or later. {VIDEO_SHOT_NOTE} Extra shoot time your
          add-ons need is charged by the hour, as set out under{" "}
          <L href="#shoot">The factory shoot</L>.
        </P>
        <P>
          <B>Sales Team logins.</B> On any Plan you may add a login for each of
          your salespeople. It gives your administrator (usually the MD) a sales
          dashboard: when and where each meeting started, the meetings held with
          each client, and each client&rsquo;s stage (new, moving ahead, won or
          lost). Logins are billed <B>per salesperson, per year</B>, at one flat
          price. The first year is paid with your order. When you renew{" "}
          {support}, the logins are offered for renewal on the same bill and you
          can untick them; how that works is under{" "}
          <L href="#support">Support, hosting &amp; security</L>. A Workspace
          cannot have more salespeople signed in than the logins paid for. A
          meeting&rsquo;s place is recorded only if the salesperson allows
          location in their browser; see{" "}
          <L href="#recording-ai">Location, and features that are switched off</L>.
        </P>
        <P>
          <B>New features.</B> We may add features over time and will tell you
          when we do. We will not take away a feature listed above for your Plan
          while your {support} is paid up, except as set out under{" "}
          <L href="#changes">Changes to the Service and these Terms</L>.
        </P>
      </>
    ),
  },
  {
    id: "fees",
    title: "Fees, taxes and payment",
    body: (
      <>
        <Callout title="Every charge, in one list">
          These are all the charges for the Service. Nothing else is added at
          checkout, and every line of your own bill is shown before you pay.
          Anything outside this list (such as re-shooting a plant that has
          changed) is quoted to you in writing first and done only if you
          agree.
        </Callout>
        <UL>
          {SITE_PLAN_ORDER.map((id) => {
            const p = SITE_PLANS[id];
            return (
              <li key={id}>
                <B>{p.name}</B>: {inr(p.regularInr)}, one time
                {LAUNCH_OFFER.active
                  ? `, or ${inr(p.priceInr)} under the special offer for our first ${LAUNCH_OFFER.limit} customers (see Special offer)`
                  : ""}
                .
              </li>
            );
          })}
          <li>
            <B>{SUPPORT_NAME}</B>: {inr(SUPPORT_MONTHLY_INR)} a month, billed
            yearly as {inr(SUPPORT_ANNUAL_INR)}.
            {LAUNCH_OFFER.active
              ? ` The first year is free for our first ${LAUNCH_OFFER.limit} customers; for later customers it is charged with the order.`
              : " The first year is charged with your order."}
          </li>
          <li>
            <B>Sales Team logins</B> (optional): {inr(SALES_TEAM.regularInr)}{" "}
            per salesperson per year
            {LAUNCH_OFFER.active
              ? `, or ${inr(SALES_TEAM.offerInr)} per salesperson per year for our first ${LAUNCH_OFFER.limit} customers`
              : ""}
            . Logins added part-way through a year are charged only for the
            whole months left until your logins renew.
          </li>
          <li>
            <B>Moving up a plan</B> (optional): the difference between the two
            Plans at that day&rsquo;s prices.
          </li>
          <li>
            <B>Extra AOAs</B> (optional): priced per Plan, and cheaper the more
            you add; on {SITE_PLANS.ultra.name}, for example, from{" "}
            {inr(discountBands("ultra")[0].each)} down to{" "}
            {inr(discountBands("ultra").slice(-1)[0].each)} each.
          </li>
          <li>
            <B>Process videos</B> (optional, {SITE_PLANS.pro.name} and
            above). A video you already have, which you upload to your own
            YouTube channel and send us the link for, is included up to your
            Plan&rsquo;s number and {inr(VIDEO_SELF_INR)} each after that. A video{" "}
            <B>we</B> shoot is {inr(VIDEO_SHOT_INR)} each, whatever your Plan
            includes, because the included videos cover footage you bring rather
            than crew time.
          </li>
          <li>
            <B>Extra shoot time</B> (only if your add-ons need it):{" "}
            {inr(EXTRA_HOUR_INR)} an hour.
          </li>
          <li>
            <B>Cab travel</B> for our crew: {inr(CAB_TRAVEL.amountInr)} per shoot
            {LAUNCH_OFFER.active ? `, free for our first ${LAUNCH_OFFER.limit} customers` : ""}.
          </li>
          <li>
            <B>Changing the shoot date</B>: the first change is free; each change
            after that is {inr(POLICY.rescheduleFeeInr)}. See{" "}
            <L href="#shoot">The factory shoot</L>.
          </li>
        </UL>
        <UL>
          <li>
            <B>GST.</B> All amounts are in Indian rupees and{" "}
            <B>exclude GST</B>. {GST_LABEL} is shown as its own line on your bill
            before you pay. Our GSTIN ({COMPANY.gstin}) is on every tax invoice,
            so a GST-registered customer can claim input tax credit. Example:{" "}
            {EXAMPLE.plan.name} for a factory in Manesar is{" "}
            {inr2(EXAMPLE.taxableInr)}
            {EXAMPLE.lines.some((l) => l.kind === "travel" && l.amountInr === 0) ? " with cab travel free" : " including travel"}, plus{" "}
            {inr2(EXAMPLE.gstInr)} GST = <B>{inr2(EXAMPLE.totalInr)}</B>. If tax
            law requires you to deduct tax at source, tell us before paying.
          </li>
          <li>
            <B>How you pay.</B> Online payments are processed by Razorpay
            Software Private Limited, an RBI-authorised payment aggregator, by
            card, UPI, net banking or supported wallets. Your card or bank
            details go straight to Razorpay and are never stored by VPV. A
            written proposal may also allow a payment link or bank transfer.
          </li>
          <li>
            <B>No automatic charges.</B> We never charge your card or bank
            account on our own. Every payment, including each yearly renewal, is
            one you make yourself, after seeing the amount.
          </li>
          <li>
            <B>Invoices.</B> After each successful payment we e-mail a GST tax
            invoice to the billing contact on record.
          </li>
          <li>
            <B>Failed or disputed payments.</B> An order is confirmed only when
            payment reaches us. If you think a charge is wrong, please write to{" "}
            <Mail to={COMPANY.emails.support} /> before disputing it with your
            bank; we can usually fix it the same day.
          </li>
        </UL>
      </>
    ),
  },
  {
    id: "special-offer",
    title: "Special offer",
    body: (
      <>
        <P>
          {LAUNCH_OFFER.active
            ? `Our first ${LAUNCH_OFFER.limit} customers get the Plans at ${LAUNCH_OFFER.percent}% off their regular price, Sales Team logins at ${inr(SALES_TEAM.offerInr)} per salesperson per year instead of ${inr(SALES_TEAM.regularInr)}, free cab travel for the shoot, and the first year of ${support} free.`
            : "The special offer has ended; the Plans are sold at their regular price."}
        </P>
        <UL>
          <li>
            <B>The regular price is real.</B> It is the price every customer
            pays once the offer closes. While the offer is open nobody pays it,
            so it is the price that applies from customer{" "}
            {LAUNCH_OFFER.limit + 1}, not a price we used to charge.
          </li>
          <li>
            <B>Who counts.</B> A customer is counted once their payment for a
            Plan reaches us. Refunded orders do not count and free up their
            place.
          </li>
          <li>
            <B>It ends on its own.</B> From the {LAUNCH_OFFER.limit + 1}st paid
            Plan, the regular price applies. The checkout counts this
            automatically. If the last place is taken while you are on the
            billing page, you see the regular-price total before you pay, never
            after.
          </li>
          <li>
            <B>What it covers.</B> The Plan Fee; Sales Team logins bought with
            it, at the offer price in the first year and at each renewal; cab
            travel for the shoot; and the first year of {support}. It does not
            cover extra AOAs, process videos, extra shoot time, date changes or
            support from the second year.
          </li>
          <li>
            <B>Coupon codes.</B> A coupon we give you takes the stated amount off
            your Plan, extras, shoot time and Sales Team logins, not off travel
            or support. It always leaves at least {inr(MIN_PAYABLE_INR)} plus GST
            to pay. One code per order. A code may be limited in uses and dates,
            has no cash value, and can be withdrawn before it is used.
          </li>
          <li>
            <B>Your price is locked.</B> The price on your bill when you pay is
            your price. We may end the offer early, but that never changes an
            order already paid for.
          </li>
        </UL>
      </>
    ),
  },
  {
    id: "shoot",
    title: "The factory shoot",
    body: (
      <UL>
        <li>
          <B>Booking.</B> After your Plan is paid for, we contact you within{" "}
          {POLICY.shootContactBusinessDays} business days to agree a shoot date.
          We confirm the date in writing.
        </li>
        <li>
          <B>Shoot time.</B> Your Plan includes the hours shown on it (
          {SITE_PLAN_ORDER.map((id) => `${SITE_PLANS[id].name}: ${hoursLabel(SITE_PLANS[id].shootHours)}`).join("; ")}
          ). Each extra AOA or video our crew shoots adds about{" "}
          {MINUTES_PER_EXTRA_AREA} minutes. Added time is rounded up to whole
          hours, charged at {inr(EXTRA_HOUR_INR)} an hour, and shown on your bill
          before you pay. You pay the hours on your bill, not what the day
          actually takes. A shoot longer than one working day runs over more
          than one day.
        </li>
        <li>
          <B>On the day you provide</B> access to every area you chose, a person
          who knows the plant to go round with the crew, any safety induction and
          protective equipment your site needs, and, for each process video we
          shoot, the machine or process running.
        </li>
        <li>
          <B>People in the shot.</B> You tell your staff that photographs and
          video will be taken, and get any consent your own rules require. Tell
          us of any area, document or product that must not be shown, and we
          keep it out.
        </li>
        <li>
          <B>Changing the date.</B> You may change a confirmed shoot date. The
          first change is free. Each change after that costs{" "}
          {inr(POLICY.rescheduleFeeInr)} plus GST, and we tell you the amount
          before you confirm the change. Please give us at least{" "}
          {POLICY.rescheduleNoticeHours} hours&rsquo; notice. If our crew arrives
          and cannot shoot because of something on your side, that visit counts
          as a change of date, and if your order included a cab travel charge,
          it is charged again for the new visit.
        </li>
        <li>
          <B>If we have to change it.</B> If we cannot attend a confirmed date,
          we agree a new one with you at no charge, and it does not count as
          your change.
        </li>
        <li>
          <B>Delivery.</B> Your finished VPV is usually live in your Workspace{" "}
          {POLICY.vpvDeliveryTypical} after the shoot, and never later than{" "}
          {POLICY.vpvDeliveryWorkingDays} working days after it. We e-mail you
          when it is live. If something on our side would make us miss that, we
          tell you before the date, with the reason and a new date. A shoot
          moved at your request moves the delivery date with it. See the{" "}
          <L href="/shipping-policy">Shipping &amp; Delivery Policy</L>.
        </li>
      </UL>
    ),
  },
  {
    id: "travel",
    title: "Travel and where we shoot",
    body: (
      <>
        <P>
          Our crew travels <B>by cab</B> from our Gurugram office and returns the
          same day. We currently shoot in {SERVICE_CITY_LIST}. Cab travel is{" "}
          <B>{inr(CAB_TRAVEL.amountInr)}</B> plus GST per shoot
          {LAUNCH_OFFER.active ? (
            <>
              , and <B>free for our first {LAUNCH_OFFER.limit} customers</B>
            </>
          ) : null}
          . It is shown on your bill before you pay. There are no flights,
          trains, transfers or hotels for you to book or pay for.
        </P>
        <UL>
          <li>
            We do not yet shoot in other cities, so an order cannot be placed
            for a factory outside them. You can still see your Plan and price,
            and we will tell you when we start in your city.
          </li>
          <li>
            If the factory address you give us turns out to be outside these
            cities, we tell you before the shoot and you may cancel for a full
            refund.
          </li>
        </UL>
      </>
    ),
  },
  {
    id: "price-changes",
    title: "Price changes",
    body: (
      <>
        <Callout title="In short" tone="notice">
          We may change our prices. Existing customers always get e-mail notice
          first, and a change never alters something you have already paid for.
        </Callout>
        <UL>
          <li>
            <B>New orders.</B> The price shown at checkout, or in your written
            proposal, when you order is the price you pay.
          </li>
          <li>
            <B>Yearly fees.</B> If we change a yearly price (the Support Fee or a
            Sales Team login), we e-mail the administrator and billing contact on
            record <B>at least {POLICY.priceChangeNoticeDays} days before the new
            price applies to you</B>, stating the new price and the date it
            starts.
          </li>
          <li>
            <B>Paid periods are protected.</B> A price change never applies to a
            Plan Fee you have paid, to a support year you have already paid for,
            or to a proposal you have accepted for its stated term. It applies
            only from your next renewal after the notice period.
          </li>
          <li>
            <B>Your choice.</B> If you do not agree with a new yearly price, you
            simply do not renew, and you are never charged it.
          </li>
          <li>
            <B>Keep your e-mail current.</B> Notices go to the e-mail addresses
            on your account, so please keep them correct.
          </li>
        </UL>
      </>
    ),
  },
  {
    id: "support",
    title: "Support, hosting & security",
    body: (
      <>
        <P>
          {SUPPORT_NAME} is {inr(SUPPORT_MONTHLY_INR)} a month, billed yearly as{" "}
          <B>{inr(SUPPORT_ANNUAL_INR)} plus GST</B>. Your first year starts on
          the day your Workspace is created.
          {LAUNCH_OFFER.active
            ? ` For our first ${LAUNCH_OFFER.limit} customers the first year is free; for later customers it is charged with the order.`
            : " The first year is charged with your order."}{" "}
          Each later year is renewed by you, from the Plan and billing page in
          your dashboard. Your renewal date is on your order confirmation and tax
          invoice. It covers:
        </P>
        <UL>
          <li><B>Hosting</B> of your Workspace and tours.</li>
          <li>
            <B>Security</B>: security updates, access controls, and our promise
            that we do <B>not</B> sell, rent or disclose your Content except as
            the <L href="/privacy">Privacy Policy</L> allows.
          </li>
          <li>Fixes for faults in the Service, and updates we release for your Plan.</li>
          <li>
            <B>Help</B> with your Workspace and tours by e-mail at{" "}
            <Mail to={COMPANY.emails.support} />
            {COMPANY.phone ? `, or by phone or WhatsApp on ${COMPANY.phone} (${COMPANY.phoneHours})` : ""}.
            We reply within {POLICY.replyBusinessDays} business days, often the
            same day. It is not live, round-the-clock support.
          </li>
        </UL>
        <P>
          <B>What it does not cover.</B> The Support Fee pays for keeping VPV
          running, not for new work on your tour. These are paid work, quoted
          before we start, or things you can do yourself in the editor:
        </P>
        <UL>
          <li>
            re-shooting areas because something changed in the plant (new
            machines, moved equipment, a new layout);
          </li>
          <li>edits to existing scenes, information icons or other Content;</li>
          <li>
            new AOAs beyond your Plan, which are charged at your Plan&rsquo;s
            extra-AOA price (see <L href="#fees">Fees</L>), plus a shoot visit
            where one is needed;
          </li>
          <li>on-site visits, custom development, content production or training.</li>
        </UL>
        <P>
          <B>Renewal reminders.</B> We e-mail you 30 days, 1 week and 1 day
          before your support year ends. If it is not renewed by then, you have{" "}
          {POLICY.supportGraceDays} days in which the Workspace keeps working but
          shows a renewal reminder, and we e-mail you once a day during those{" "}
          {POLICY.supportGraceDays} days, then once more if the Workspace locks.
          Reminders go to the billing e-mail on your account; our team may also
          call you.
        </P>
        <P>
          <B>If support is not renewed.</B> {POLICY.supportGraceDays} days after
          the renewal date the Workspace is <B>locked</B>: the editor does not
          open and your tours are not shown to Viewers. The moment you renew, it
          unlocks automatically and everything is as you left it. While it is
          locked we keep your Content safe, and we never delete it for an unpaid
          Support Fee without at least {POLICY.deletionNoticeDays} days&rsquo;
          written notice first.
        </P>
        <P>
          <B>Sales Team logins at renewal.</B> Your logins are shown on the same
          renewal bill, already ticked so your salespeople are not cut off by
          mistake, with their price shown. You can untick them and renew support
          alone. Unticked logins keep their own end date, get their own
          reminders, and {POLICY.supportGraceDays} days after that date your
          salespeople can no longer sign in. Your own login, your tours and your
          Content are not affected, nothing your salespeople created is deleted,
          and renewing the logins later switches them back on. To change the
          number of logins, write to us before your renewal.
        </P>
      </>
    ),
  },
  {
    id: "cancellation",
    title: "Cancelling and refunds",
    body: (
      <>
        <P>
          You can stop renewing, or close your Workspace, at any time by e-mail
          to <Mail to={COMPANY.emails.support} />
          {COMPANY.phone ? ` or by WhatsApp on ${COMPANY.phone}` : ""}. There is
          no cancellation fee, and you do not have to give a reason or take a
          call. Your Workspace keeps working to the end of the period you have
          paid for; fees for a part-period are not paid back.
        </P>
        <P>
          <B>Refunds.</B> Payments are not refundable once made, with these
          exceptions, set out in full in the{" "}
          <L href="/refund-policy">Cancellation &amp; Refund Policy</L>: we
          cannot shoot your factory or deliver your VPV for a reason on our side
          (full refund of what was not delivered); duplicate, excess or wrong
          charges (always refunded in full); and a payment taken for an order
          that was never confirmed. After a Workspace is closed we keep its data
          for {POLICY.retentionAfterCancelDays} days so you can come back, then
          delete it as described in the <L href="/privacy">Privacy Policy</L>.
        </P>
      </>
    ),
  },
  {
    id: "content",
    title: "Your content",
    body: (
      <>
        <P>
          You own your Content. You give us a limited licence to store, process
          and show it only to provide the Service to you (for example, to show a
          tour to your Viewers) and to keep it secure. We claim no other rights
          in it, and we do not use it to train AI models.
        </P>
        <P>
          You confirm you have the right to everything you upload, and that it
          does not break the law or anyone&rsquo;s rights. Process videos live on
          your own YouTube channel (see the <L href="/disclaimer">Disclaimer</L>),
          so please keep your own copies; VPV is not a backup service.
        </P>
      </>
    ),
  },
  {
    id: "recording-ai",
    title: "Location, and features that are switched off",
    body: (
      <>
        <P>
          <B>Meeting location.</B> With Sales Team logins, the sales dashboard
          shows where each meeting started. The place is recorded only if the
          salesperson allows location in their browser when asked; saying no
          does not stop the meeting. You are responsible for telling your
          salespeople that this is recorded and why.
        </P>
        <P>
          <B>Switched off for every customer.</B> The VPV software contains some
          tools that are not offered today and are switched off for all
          customers: meeting recording, transcripts and AI meeting analysis,
          salesperson voice samples, subtitles and translation, and lead capture
          inside customers&rsquo; tours. While they
          are off, we collect none of the data they would use. If we decide to
          switch one on, we will first update these Terms and the{" "}
          <L href="/privacy">Privacy Policy</L> and e-mail you at least{" "}
          {POLICY.termsChangeNoticeDays} days before. Anything that records
          people would also need your administrator to turn it on for your
          Workspace, and you would be responsible for telling everyone recorded
          and getting any consent the law requires.
        </P>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <>
        <P>You agree not to:</P>
        <UL>
          <li>upload content that is unlawful, infringing or defamatory, or that you have no right to share;</li>
          <li>show Viewers anything designed to deceive them, such as false facility details, fake certifications or misleading quality claims;</li>
          <li>impersonate anyone, or label share links with someone else&rsquo;s e-mail or phone number to mislead;</li>
          <li>share logins, get round device limits, rate limits or access controls, or probe the Service for weaknesses outside our <L href="/security">reporting process</L>;</li>
          <li>copy, scrape or pass on tours you are not allowed to share, or remove Viewer watermarks;</li>
          <li>send malware, overload the Service, or use it to harm others.</li>
        </UL>
      </>
    ),
  },
  {
    id: "viewer-data",
    title: "Viewer data",
    body: (
      <P>
        When you share tours, VPV records how they are viewed (for example,
        which scenes were opened and for how long, approximate country, and an
        e-mail address if you require one to open a link) on your behalf. For that data you decide why and how it is used, and we act
        as your service provider. You are responsible for any notice or consent
        your law requires from Viewers. For data about your own team, your
        billing and security, we are responsible, as described in the{" "}
        <L href="/privacy">Privacy Policy</L>.
      </P>
    ),
  },
  {
    id: "ip",
    title: "Our intellectual property",
    body: (
      <P>
        The Service (its software, design, text, trademarks and logos) belongs
        to {COMPANY.legalName} or its licensors. These Terms give you only the
        right to use it as described above. If you send us feedback, we may use
        it to improve the Service without owing you anything for it.
      </P>
    ),
  },
  {
    id: "availability",
    title: "Availability and maintenance",
    body: (
      <P>
        We aim for 99% availability each month, but cannot promise the Service
        will never be interrupted. Planned maintenance is announced in the
        dashboard at least 48 hours ahead, except urgent security fixes. The 99%
        figure is a goal, not a condition of payment.
      </P>
    ),
  },
  {
    id: "third-party",
    title: "Third-party services",
    body: (
      <P>
        VPV relies on other providers for hosting, storage, payments and e-mail;
        the list is in the <L href="/privacy#sharing">Privacy Policy</L>.
        Embedded content, such as YouTube videos in a tour, is governed by that
        provider&rsquo;s own terms.
      </P>
    ),
  },
  {
    id: "suspension",
    title: "Suspension and ending",
    body: (
      <>
        <P>
          We may suspend or end access if you seriously break these Terms, if an
          account appears to be misused, or if access would put other customers
          at risk. Where we can, we contact your administrator first and give you
          a fair time to fix the problem; where we must act at once to protect
          others, we act first and explain straight after.
        </P>
        <P>
          You may stop using VPV at any time. When these Terms end, your right to
          use the Service ends, and the parts that should naturally continue
          (fees owed, intellectual property, liability, disputes) continue.
        </P>
      </>
    ),
  },
  {
    id: "warranty",
    title: "What we promise",
    body: (
      <P>
        We provide the Service with reasonable skill and care, and as described
        in these Terms and on the <L href="/plans">Plans</L> page. Beyond that,
        and as far as the law allows, we give no other promises, for example
        that VPV will bring any particular sales or business result. See the{" "}
        <L href="/disclaimer">Disclaimer</L>. Nothing in these Terms takes away
        a right you have under law that cannot be taken away.
      </P>
    ),
  },
  {
    id: "liability",
    title: "Limits of liability",
    body: (
      <>
        <P>
          As far as the law allows, neither side is liable to the other for
          indirect or consequential loss, or for lost profits, lost business or
          lost goodwill, arising from the use of or inability to use the
          Service.
        </P>
        <P>
          Our total liability to you for all claims in any 12 months is limited
          to the fees you paid us in those 12 months. These limits do not apply
          to fraud, to anything the law does not allow to be limited, or to your
          duty to pay fees.
        </P>
      </>
    ),
  },
  {
    id: "indemnity",
    title: "Claims about your content",
    body: (
      <P>
        If someone makes a claim against us because of your Content, or because
        you broke these Terms, you will cover the resulting losses and
        reasonable costs. We will tell you promptly about any such claim and
        help you reasonably in handling it.
      </P>
    ),
  },
  {
    id: "force-majeure",
    title: "Events beyond control",
    body: (
      <P>
        Neither side is liable for a delay or failure caused by events beyond
        its reasonable control, such as natural disasters, war, government
        action, or a power, internet or major provider failure, as long as it
        takes reasonable steps to limit the effect. If such an event stops us
        shooting your factory, we agree a new date with you at no charge.
      </P>
    ),
  },
  {
    id: "changes",
    title: "Changes to the Service and these Terms",
    body: (
      <>
        <P>
          We improve VPV all the time and may add, change or retire features. If
          a change would take away something your paid Plan lists, we tell you
          first and agree a fair solution with you.
        </P>
        <P>
          We may update these Terms. For an important change we e-mail the
          administrator on record and show a notice on the sign-in page{" "}
          <B>at least {POLICY.termsChangeNoticeDays} days before it takes
          effect</B>, and we list what changed at the top of this page. Price
          changes follow <L href="#price-changes">Price changes</L>. A change
          never applies to an order already paid for unless it is better for
          you. If you do not accept a change, you may stop renewing before it
          takes effect.
        </P>
      </>
    ),
  },
  {
    id: "notices",
    title: "Notices",
    body: (
      <P>
        We send notices by e-mail to the administrator and billing contact on
        record, and may also show them in the dashboard. Send notices to us at{" "}
        <Mail to={COMPANY.emails.support} />. An e-mail notice counts as
        received on the next business day after it is sent. These Terms are an
        electronic record under the Information Technology Act, 2000, and need
        no physical signature.
      </P>
    ),
  },
  {
    id: "grievance",
    title: "Complaints and grievance officer",
    body: (
      <>
        <P>
          If something has gone wrong, please tell us first: write to{" "}
          <Mail to={COMPANY.emails.support} />
          {COMPANY.phone ? `, call or WhatsApp ${COMPANY.phone}` : ""}, or use the
          form on the <L href="/contact">Contact</L> page. Complaints are handled
          by our grievance officer
          {COMPANY.grievanceOfficer.name ? `, ${COMPANY.grievanceOfficer.name}` : ""}.
          We acknowledge every complaint within{" "}
          <B>{POLICY.grievanceAckHours} hours</B>, give you a reference for it,
          and resolve it within <B>{POLICY.grievanceResolveDays} days</B>.
        </P>
        <P>
          This does not take away your right to go to a consumer commission
          under the Consumer Protection Act, 2019, or to the National Consumer
          Helpline (dial 1915 or visit consumerhelpline.gov.in).
        </P>
      </>
    ),
  },
  {
    id: "law",
    title: "Governing law and disputes",
    body: (
      <P>
        These Terms are governed by the laws of India. If a dispute arises, both
        sides will first try in good faith to settle it by talking for 30 days
        after written notice. If it is not settled, the courts at{" "}
        {COMPANY.jurisdiction} have jurisdiction, without affecting any right you
        have to bring a consumer complaint where the Consumer Protection Act,
        2019 allows.
      </P>
    ),
  },
  {
    id: "older-plans",
    title: "Older plans",
    body: (
      <P>
        Basic (a one-time licence priced by the number of scenes), Pro and Ultra
        are no longer sold. If you bought one of them, the plan, price and
        support terms on your order and invoice still apply to you, together
        with these Terms where your order says nothing different. If anything
        about an older plan is unclear, write to us and we will confirm it in
        writing.
      </P>
    ),
  },
  {
    id: "general",
    title: "General",
    body: (
      <UL>
        <li><B>Whole agreement.</B> These Terms, the policies they name and any signed proposal are the whole agreement and replace earlier discussions.</li>
        <li><B>If one part fails.</B> If a part of these Terms cannot be enforced, the rest still applies.</li>
        <li><B>No waiver.</B> Not enforcing a right at once does not give it up.</li>
        <li><B>Transfer.</B> You may not transfer these Terms without our written consent. We may transfer them to someone who takes over our business, and will tell you.</li>
        <li><B>Independent parties.</B> Nothing in these Terms creates a partnership, agency or employment.</li>
      </UL>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <UL>
        <li>Everything (support, billing, legal): <Mail to={COMPANY.emails.support} /></li>
        {COMPANY.phone ? <li>Phone and WhatsApp: {COMPANY.phone}, {COMPANY.phoneHours}</li> : null}
        <li>Registered office: {COMPANY.addressLines.join(", ")}</li>
        <li>Full details are on the <L href="/contact">Contact</L> page.</li>
      </UL>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms & Conditions"
      summary="The agreement for using VPV: what each plan includes, every charge, how the shoot and support work, and what happens if prices or terms change."
      sections={sections}
    >
      <Callout title="The short version">
        You pay once for a Plan (
        {SITE_PLAN_ORDER.map((id) => `${SITE_PLANS[id].name.replace("VPV ", "")} ${inr(LAUNCH_OFFER.active ? SITE_PLANS[id].priceInr : SITE_PLANS[id].regularInr)}`).join(", ")}
        {LAUNCH_OFFER.active ? ` for our first ${LAUNCH_OFFER.limit} customers` : ""}, plus GST). It
        includes the shoot and building your VPV, usually live{" "}
        {POLICY.vpvDeliveryTypical} after the shoot. {SUPPORT_NAME} is{" "}
        {inr(SUPPORT_ANNUAL_INR)} a year plus GST
        {LAUNCH_OFFER.active ? `, with the first year free for our first ${LAUNCH_OFFER.limit} customers` : ""}.
        We never charge you automatically: you renew yourself, after reminders,
        and a Workspace not renewed within {POLICY.supportGraceDays} days is
        locked (never deleted without {POLICY.deletionNoticeDays} days&rsquo;
        notice). One change of shoot date is free; later ones are{" "}
        {inr(POLICY.rescheduleFeeInr)} each. You own your content. Prices can
        change, but only with {POLICY.priceChangeNoticeDays} days&rsquo; e-mail
        notice and never for something you have already paid for.
      </Callout>
      <div className="mt-4">
        <Callout title={`What changed on ${POLICY.updated}`} tone="notice">
          <UL>
            <li>The VPV Plans are now the only plans described (since 20 November 2026, the seven Plans sized by your factory&rsquo;s covered area; Plans bought before then keep everything they included); Basic, Pro and Ultra moved to &ldquo;Older plans&rdquo;.</li>
            <li>Changing the shoot date: the first change is free, later ones are {inr(POLICY.rescheduleFeeInr)} each.</li>
            <li>Delivery: usually {POLICY.vpvDeliveryTypical} after the shoot, and never later than {POLICY.vpvDeliveryWorkingDays} working days.</li>
            <li>Recording and AI features are described as what they are: switched off.</li>
            <li>New: one list of every charge, a named complaints process, and Gurugram courts (where our registered office is) instead of New Delhi.</li>
          </UL>
          <span className="mt-2 block">
            For customers who bought before {POLICY.updated}, the new date-change
            fee applies only to date changes asked for{" "}
            {POLICY.termsChangeNoticeDays} days or more after we e-mail you about
            it. The previous version was dated {POLICY.previousUpdated}.
          </span>
        </Callout>
      </div>
    </LegalPage>
  );
}
