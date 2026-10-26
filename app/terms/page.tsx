/**
 * /terms — VPV Terms & Conditions.
 *
 * Covers the commercial model as sold today: a one-time Basic licence,
 * an Annual Support & Maintenance fee, and Pro / Ultra by written
 * proposal. All numbers and windows come from lib/company.ts so this
 * page can never disagree with /pricing or /refund-policy.
 *
 * Draft for legal review — see the notice in the delivery notes.
 */

import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/legal/LegalPage";
import { B, Callout, L, Mail, P, UL } from "@/components/legal/prose";
import { COMPANY, POLICY, companyIdentity } from "@/lib/company";
import {
  ENTERPRISE_PERSONAL,
  EXTRA_HOUR_INR,
  EXTRA_VIDEO_INR,
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
  PRO_MONTHLY_INR,
  SCENE_MAX,
  SCENE_MIN,
  SUPPORT_ANNUAL_INR,
  SUPPORT_MONTHLY_INR,
  SUPPORT_NAME,
  ULTRA_MONTHLY_INR,
  inr,
  inr2,
  priceForScenes,
  pricePerScene,
  withGst,
} from "@/lib/pricing";
import { CAB_TRAVEL, SERVICE_CITY_LIST } from "@/lib/logistics";

/* Worked example for the GST paragraph: VPV Authority, factory in Manesar. */
const EXAMPLE = siteQuote("authority", { city: "Manesar" });

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description:
    "The terms that govern your use of VPV (Virtual Plant Visit): licence, fees and GST, annual support, price changes with prior email notice, acceptable use and liability.",
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
          These Terms &amp; Conditions (the <B>Terms</B>) are a binding
          agreement between {companyIdentity()} (<B>VPV</B>, <B>we</B>,{" "}
          <B>us</B>) and the organisation that signs up for or uses VPV
          (the <B>Customer</B>, <B>you</B>). They apply to the VPV website,
          the dashboards, the tour builder, the viewer, the presenter tools
          and everything else we provide under the VPV name (together, the{" "}
          <B>Service</B>).
        </P>
        <P>
          You agree to these Terms, our{" "}
          <L href="/privacy">Privacy Policy</L> and our other policies when you
          tick the box to say so on the first step of our pricing questions,
          and again when you accept the Terms and the Refund Policy before
          paying.
        </P>
        <P>
          You accept the Terms when you place an order, accept a written
          proposal, create or use a VPV account, or open a VPV workspace —
          whichever happens first. If you are accepting for an organisation,
          you confirm that you have authority to bind it.
        </P>
        <P>
          These Terms work together with our{" "}
          <L href="/privacy">Privacy Policy</L>,{" "}
          <L href="/refund-policy">Cancellation &amp; Refund Policy</L>,{" "}
          <L href="/shipping-policy">Shipping &amp; Delivery Policy</L>,{" "}
          <L href="/cookies">Cookie Policy</L>,{" "}
          <L href="/disclaimer">Disclaimer</L> and{" "}
          <L href="/plans">Plans</L> page, all of which form part of the
          agreement. If a signed proposal for Pro or Ultra says something
          different from these Terms, the proposal prevails for that order.
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
          <B>Workspace</B> — your organisation’s private area of VPV,
          normally reached at <code className="text-[13px]">yourcompany.myvpv.com</code>.
        </li>
        <li>
          <B>Authorised Users</B> — the administrators, presenters (sales
          team) and other people your organisation invites to the Workspace.
        </li>
        <li>
          <B>Viewers</B> — people who open a tour link you share, such as
          your customers or prospects.
        </li>
        <li>
          <B>Content</B> — everything you upload or create in VPV: panoramas,
          logos, hotspot text, narration audio, client details, notes and
          presentation recordings.
        </li>
        <li>
          <B>Plan</B> — Basic, Pro or Ultra, as described on the{" "}
          <L href="/plans">Plans</L> page or in your proposal.
        </li>
        <li>
          <B>Scene</B> — one 360° location in a tour.{" "}
          <B>Licence Fee</B> — the one-time fee for the Basic Plan, set by how
          many Scenes you choose, and including the first year of Support &amp;
          Maintenance.{" "}
          <B>Subscription Fee</B> — the monthly fee for Pro or Ultra.{" "}
          <B>Support Fee</B> — the Annual Support &amp; Maintenance fee charged
          on Basic from the second year.
        </li>
      </UL>
    ),
  },
  {
    id: "eligibility",
    title: "Eligibility and authority",
    body: (
      <>
        <P>
          VPV is a business product. It is sold to organisations and to
          individuals acting for a business, and it is not intended for
          personal or household use or for anyone under 18. By ordering you
          confirm that the business details you give us — including the
          legal name, address and GSTIN used on invoices — are accurate and
          that you will keep them up to date.
        </P>
      </>
    ),
  },
  {
    id: "accounts",
    title: "Accounts and security",
    body: (
      <>
        <P>
          Each Authorised User has a personal login. Keep credentials
          confidential and do not share them. By default one active device is
          allowed per user (your administrator can change this), and we
          send an alert when an account signs in from a new device.
        </P>
        <P>
          You are responsible for what happens under your Workspace,
          including actions by Authorised Users. Tell us promptly at{" "}
          <Mail to={COMPANY.emails.support} /> if you believe an account has
          been compromised. We describe our safeguards on the{" "}
          <L href="/security">Security</L> page.
        </P>
      </>
    ),
  },
  {
    id: "plans",
    title: "Plans and licence",
    body: (
      <>
        <P>
          Subject to these Terms and payment of the applicable fees, we
          grant you a non-exclusive, non-transferable, non-sublicensable
          right to use the Service for your own internal business purposes
          and to show your tours to your Viewers.
        </P>
        <P>
          <B>VPV plans.</B> Our main offer is a done-for-you Virtual Plant
          Visit: our crew shoots your factory and we build the VPV in your own
          Workspace. Each plan is a one-time Licence Fee:
        </P>
        <UL>
          {SITE_PLAN_ORDER.map((id) => {
            const p = SITE_PLANS[id];
            return (
              <li key={id}>
                <B>{p.name}.</B> {p.plot.label}; {p.scenes} Active Operational Areas (AOAs),{" "}
                {p.videos > 0 ? `${p.videos} process videos` : "no process videos"},{" "}
                {p.pdfs > 0 ? `${p.pdfs} PDF reports` : "no PDF reports"}, information icons,{" "}
                {hoursLabel(p.shootHours)} of shoot time on site
                {p.sharingControls ? ", and one-time link expiry and sharing restrictions" : ""}
                {id === "enterprise"
                  ? `, together with a personal, exclusive discussion with ${ENTERPRISE_PERSONAL.person} and a personal, exclusive shoot by ${ENTERPRISE_PERSONAL.person} (see below)`
                  : ""}.
              </li>
            );
          })}
        </UL>
        <P>
          An AOA is one area of your factory a Viewer can explore in 360°, and
          becomes one Scene in your Workspace. One-time link expiry and sharing
          restrictions are part of {SITE_PLANS.control.name} and{" "}
          {SITE_PLANS.enterprise.name} only and are not sold separately. The
          plant sizes shown against each plan are a guide to which plan
          suits which plant; the number of AOAs, process videos and shoot
          hours each plan includes is what we deliver, and you may add more
          as set out below. No link restriction can stop a Viewer from taking
          screenshots or recording their screen.
        </P>
        <P>
          <B>Your Workspace address.</B> You choose the address your
          Workspace lives at — <code className="text-[13px]">yourcompany.myvpv.com</code> —
          when you pay, and we show you whether it is free before we take
          any money. It is one name, in small letters, and it has to be
          unused: addresses are given out first come, first served, and
          choosing one does not give you any trademark or other right in
          the name. We may refuse or change an address that is a name VPV
          itself uses, that impersonates somebody else, or that we are
          required to withdraw; if we ever have to change yours, we will
          tell you first and keep the old address working for at least 30
          days so the links you have already given to buyers still open.
          You may ask us to change it; because your buyers may already
          have the old one, we will agree a date with you.
        </P>
        <P>
          <B>{SITE_PLANS.enterprise.name}: personal attention.</B>{" "}
          {SITE_PLANS.enterprise.name} includes (a) one private discussion
          with {ENTERPRISE_PERSONAL.person} before your shoot, to plan how
          your plant is presented, and (b) your shoot being led personally
          by {ENTERPRISE_PERSONAL.person}. We will agree the dates with you,
          and they depend on {ENTERPRISE_PERSONAL.person}&rsquo;s availability.
          If he cannot attend on the agreed date we will offer you the
          nearest other date; if he is unable to attend at all, we will tell
          you promptly and agree a fair remedy with you, which may include
          a partial refund of the Licence Fee.
        </P>
        <P>
          <B>Add-ons.</B> On any plan you may add extra AOAs and extra process
          videos when you order. {VIDEO_SHOT_NOTE} Extra shoot time that your
          add-ons need is charged by the hour, as set out under{" "}
          <L href="#shoot">The factory shoot</L>.
        </P>
        <P>
          <B>Sales Team.</B> On any plan you may add a login for each of your
          salespeople. It gives your organisation&rsquo;s administrator (usually
          the MD) the sales dashboard: each presentation&rsquo;s start time and
          location, the meetings held with each client, and each client&rsquo;s
          stage (new, moving ahead, won or lost). Logins are billed{" "}
          <B>per salesperson, per year</B>, at one flat price whatever the
          number. The first year is paid with your order; each later year is
          renewed together with Support &amp; Maintenance, at the price per
          login you bought at (subject to <L href="#price-changes">Price changes</L>).
          To change the number of logins, write to us before your renewal. Location is
          recorded only with the salesperson&rsquo;s device permission; see{" "}
          <L href="#recording-ai">Recording, location and AI features</L>.
        </P>
        <P>
          We also offer the following, which some customers buy instead:
        </P>
        <UL>
          <li>
            <B>Basic — one-time.</B> A single Workspace. You choose how many
            Scenes your Viewers can see, between {SCENE_MIN} and {SCENE_MAX},
            and pay once for that number. Each additional Scene costs less than
            the one before it, so the price per Scene falls as the number
            rises. Your team can build, edit and preview every Scene in the
            editor; the number you purchased is what your Viewers see. You may
            buy more Scenes at any time and pay only the difference.
          </li>
          <li>
            <B>Pro — {inr(PRO_MONTHLY_INR)} per month.</B> Every feature of
            Basic with no limit on Scenes, and Support &amp; Maintenance
            included. Agreed in a written proposal.
          </li>
          <li>
            <B>Ultra — {inr(ULTRA_MONTHLY_INR)} per month.</B> Everything in
            Pro, plus AI-assisted meeting review, unlimited tours saved for
            offline presenting, and priority support. Agreed
            in a written proposal.
          </li>
        </UL>
        <P>
          Pro and Ultra are not sold through the website checkout. We agree the
          scope with you, send a written proposal, and raise an invoice or a
          payment link for it.
        </P>
        <P>
          The Basic licence runs for as long as the Service is offered and
          you are not in breach of these Terms. If we ever decide to stop
          offering the Service, we will give you at least{" "}
          {POLICY.retentionAfterCancelDays} days’ written notice and a way to
          export your Content.
        </P>
        <P>
          You may not resell, white-label or sublicense the Service, copy or
          reverse-engineer it, or use it to build a competing product,
          except as the law permits despite this restriction.
        </P>
      </>
    ),
  },
  {
    id: "fees",
    title: "Fees, taxes and payment",
    body: (
      <>
        <P>
          Current prices are on the <L href="/plans">Plans</L> page. At the
          time these Terms took effect:
        </P>
        <UL>
          {SITE_PLAN_ORDER.map((id) => {
            const p = SITE_PLANS[id];
            return (
              <li key={id}>
                <B>{p.name}</B> is {inr(p.regularInr)}, one time
                {LAUNCH_OFFER.active
                  ? `, or ${inr(p.priceInr)} under the special offer for our first ${LAUNCH_OFFER.limit} customers (see Special offer below)`
                  : ""}
                .
              </li>
            );
          })}
          <li>
            <B>Extra AOAs</B> are priced per plan and cost less the more you
            add; on {SITE_PLANS.control.name}, for example, from{" "}
            {inr(discountBands("control")[0].each)} down to{" "}
            {inr(discountBands("control").slice(-1)[0].each)} each.{" "}
            <B>Extra process videos</B> are {inr(EXTRA_VIDEO_INR)} each.{" "}
            <B>Extra shoot time</B> is {inr(EXTRA_HOUR_INR)} per hour.
          </li>
          <li>
            <B>Sales Team logins</B> are {inr(SALES_TEAM.regularInr)} per
            salesperson per year
            {LAUNCH_OFFER.active
              ? `, or ${inr(SALES_TEAM.offerInr)} per salesperson per year under the special offer for our first ${LAUNCH_OFFER.limit} customers`
              : ""}
            . They renew each year with {SUPPORT_NAME.toLowerCase()}.
          </li>
          <li>
            <B>Cab travel</B> for our crew is {inr(CAB_TRAVEL.amountInr)} per
            shoot
            {LAUNCH_OFFER.active
              ? `, and is free for our first ${LAUNCH_OFFER.limit} customers`
              : ", charged with your order"}
            . See <L href="#travel">Travel and logistics</L>.
          </li>
          <li>
            <B>Basic</B> starts at {inr(priceForScenes(SCENE_MIN))} for{" "}
            {SCENE_MIN} Scenes, one time. The price per Scene falls as you add
            more — at {SCENE_MAX} Scenes it is {inr(pricePerScene(SCENE_MAX))}{" "}
            per Scene, {inr(priceForScenes(SCENE_MAX))} in total. The exact
            amount for the number you choose is shown before you pay.
          </li>
          <li>
            <B>Pro</B> is {inr(PRO_MONTHLY_INR)} per month and <B>Ultra</B> is{" "}
            {inr(ULTRA_MONTHLY_INR)} per month.
          </li>
          <li>
            <B>{SUPPORT_NAME}</B> is {inr(SUPPORT_MONTHLY_INR)} a month, billed
            yearly as {inr(SUPPORT_ANNUAL_INR)} per year. For our first{" "}
            {LAUNCH_OFFER.limit} customers the first year is free; after that,
            the first year is charged with your order. It is included at no
            extra charge in Pro and Ultra.
          </li>
        </UL>
        <UL>
          <li>
            Fees are in Indian rupees and <B>are exclusive of GST</B>.
            {GST_LABEL} is added at the final checkout step and shown in the
            breakdown before you pay. Our GSTIN ({COMPANY.gstin}) appears on
            every tax invoice, so a GST-registered customer can claim input
            tax credit. For example, {EXAMPLE.plan.name} for a factory in
            Manesar is {inr2(EXAMPLE.taxableInr)}
            {EXAMPLE.lines.some((l) => l.kind === "travel" && l.amountInr === 0) ? " with cab travel free" : " including travel"}, plus{" "}
            {inr2(EXAMPLE.gstInr)} GST = <B>{inr2(EXAMPLE.totalInr)}</B> at
            checkout. Every line of your own bill is shown before you pay. If
            tax law requires you to deduct tax at source, tell us before paying
            so we can document it correctly.
          </li>
          <li>
            <B>Payment methods.</B> Online payments are processed by Razorpay
            Software Private Limited, an RBI-authorised payment aggregator.
            You can pay by card, UPI, net banking or supported wallets. Your
            card or bank details go directly to Razorpay and are never stored
            on VPV’s servers. Pro and Ultra orders may also be paid by
            payment link or bank transfer as stated in the proposal.
          </li>
          <li>
            <B>Invoices.</B> After each successful payment we e-mail a GST
            invoice to the billing contact on record. The invoice is the
            record of what you bought.
          </li>
          <li>
            <B>Failed or disputed payments.</B> An order is confirmed only when
            payment is received. If you dispute a charge with your bank, please
            write to <Mail to={COMPANY.emails.support} /> first — most issues
            are resolved the same day. We may pause the Service for amounts
            that remain unpaid after notice.
          </li>
          <li>
            <B>Late payment.</B> Overdue invoices may attract interest at a
            reasonable rate permitted by law, after written notice.
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
            ? `While it runs, our first ${LAUNCH_OFFER.limit} customers get the VPV plans at ${LAUNCH_OFFER.percent}% off their regular price, Sales Team logins at ${inr(SALES_TEAM.offerInr)} per salesperson per year instead of ${inr(SALES_TEAM.regularInr)}, cab travel for the shoot free, and the first year of ${SUPPORT_NAME.toLowerCase()} free.`
            : "The special offer has ended; the VPV plans are sold at their regular price."}
        </P>
        <UL>
          <li>
            <B>Who counts.</B> A customer is counted once their payment for a
            VPV plan is received. Orders that are refunded do not count and
            free up their place.
          </li>
          <li>
            <B>It ends on its own.</B> From the{" "}
            {LAUNCH_OFFER.limit + 1}st paid plan, the regular price applies.
            Our checkout counts this automatically. If the last place is taken
            while you are on the billing page, we show you the regular-price
            total before you pay, never after.
          </li>
          <li>
            <B>What it covers.</B> The plan&rsquo;s Licence Fee; Sales Team
            logins bought with it, at the offer price per login in the first
            year and at each renewal after it; cab travel for the shoot, which
            is free; and the first year of {SUPPORT_NAME.toLowerCase()}, which
            is free. It does not apply to extra areas, extra process videos,
            extra shoot time, or support renewals from the second year.
          </li>
          <li>
            <B>Coupon codes.</B> A coupon code we give you takes the stated
            amount off your plan, extras, shoot time and Sales Team logins, not
            off travel or support. A coupon always leaves at least{" "}
            {inr(MIN_PAYABLE_INR)} plus GST to pay. One code per order. A code may be limited in
            how many times it can be used and until when, has no cash value,
            and can be withdrawn before it is used.
          </li>
          <li>
            <B>Your price is locked.</B> The price on your bill when you pay is
            your price. We may end the offer earlier than stated, but that
            never changes an order already paid for.
          </li>
        </UL>
      </>
    ),
  },
  {
    id: "shoot",
    title: "The factory shoot",
    body: (
      <>
        <UL>
          <li>
            <B>Booking.</B> After your plan is paid for, we contact you within{" "}
            {POLICY.shootContactBusinessDays} business days to agree a shoot
            date. Dates are confirmed by us in writing.
          </li>
          <li>
            <B>Shoot time.</B> Your plan includes the hours shown on it (
            {SITE_PLAN_ORDER.map((id) => `${SITE_PLANS[id].name}: ${hoursLabel(SITE_PLANS[id].shootHours)}`).join("; ")}
            ). Each extra AOA or video you add is estimated at about{" "}
            {MINUTES_PER_EXTRA_AREA} minutes. Added time is rounded up to whole
            hours and charged at {inr(EXTRA_HOUR_INR)} per hour, and is shown on
            your bill before you pay. A shoot longer than one working day runs
            over more than one day.
          </li>
          <li>
            <B>On the day you provide</B> access to every area you chose, a
            person who knows the plant to accompany the crew, any safety
            induction and protective equipment your site requires, and, for
            each process video, the machine or process running.
          </li>
          <li>
            <B>People in the shot.</B> You are responsible for telling your
            staff that photographs and video will be taken, and for any
            consent your policies require. Tell us of any area, document or
            product that must not be shown, and we will keep it out.
          </li>
          <li>
            <B>Moving the date.</B> You may move a confirmed shoot by telling
            us at least {POLICY.rescheduleNoticeHours} hours before it. With
            less notice, or if the crew arrives and cannot shoot because of
            something on your side, travel costs already incurred may be
            charged again for the new date.
          </li>
          <li>
            <B>If we have to move it.</B> If we cannot attend a confirmed shoot,
            we reschedule at no extra charge.
          </li>
          <li>
            <B>Delivery.</B> The finished VPV is placed in your Workspace within{" "}
            {POLICY.vpvDeliveryWorkingDays} working days of the shoot. See the{" "}
            <L href="/shipping-policy">Shipping &amp; Delivery Policy</L>.
          </li>
        </UL>
      </>
    ),
  },
  {
    id: "travel",
    title: "Travel and logistics",
    body: (
      <>
        <P>
          Our crew travels <B>by cab</B> from our Gurugram office and returns the
          same day. We currently shoot in {SERVICE_CITY_LIST}. Cab travel is{" "}
          <B>{inr(CAB_TRAVEL.amountInr)}</B> plus GST per shoot
          {LAUNCH_OFFER.active ? (
            <>
              , and is <B>free for our first {LAUNCH_OFFER.limit} customers</B>
            </>
          ) : null}
          . It is shown on your bill before you pay. There are no flights, train tickets, airport
          transfers or accommodation for you to book or pay for.
        </P>
        <UL>
          <li>
            We do not yet shoot in other cities, so an order cannot be placed for
            a factory outside them. You can still see your plan and price, and
            we will contact you when we start in your city.
          </li>
          <li>
            The charge is for the factory address you give us. If it turns out to
            be outside the cities above, we tell you before the shoot and you
            may cancel for a full refund.
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
          We may change our prices at any time. We always give prior notice by
          e-mail, and a change never alters something you have already paid
          for.
        </Callout>
        <UL>
          <li>
            <B>New purchases.</B> The price shown at checkout, or in your
            written proposal, when you place the order is the price you pay.
          </li>
          <li>
            <B>Existing customers.</B> If we change a recurring price —
            including the Annual Support &amp; Maintenance fee — we will send
            written notice to the administrator and billing contact on record
            by e-mail <B>at least {POLICY.priceChangeNoticeDays} days before
            the new price applies to you</B>. The notice states the new price
            and the date it starts.
          </li>
          <li>
            <B>Paid terms are protected.</B> A price change never applies to a
            Licence Fee you have paid, to a support period you have already
            paid for, or to a proposal you have accepted for its stated term.
            It applies only from your next renewal that begins after the
            notice period.
          </li>
          <li>
            <B>Your choice.</B> If you do not agree with a new recurring price,
            you may cancel before the renewal date and you will not be charged
            the new price. Continuing with a renewal after the notice period
            means you accept it.
          </li>
          <li>
            <B>Keep your e-mail current.</B> Notices go to the e-mail
            addresses on your account. It is your responsibility to keep them
            correct and to check that our messages are not filtered as spam.
          </li>
        </UL>
      </>
    ),
  },
  {
    id: "support",
    title: "Annual Support & Maintenance",
    body: (
      <>
        <P>
          {SUPPORT_NAME} is {inr(SUPPORT_MONTHLY_INR)} a month, billed yearly
          as <B>{inr(SUPPORT_ANNUAL_INR)} plus 18% GST</B>. Your first year
          starts on the day your Workspace is activated. For our first{" "}
          {LAUNCH_OFFER.limit} customers <B>the first year is free</B>; for
          later customers it is charged with the order. After the first year,
          support continues for each further year you renew at{" "}
          {inr(SUPPORT_ANNUAL_INR)} plus 18% GST, which
          you can do from the Plan and billing page in your dashboard. If you
          have Sales Team logins, each renewal also renews them for the year,
          at the price per login you bought at, on the same invoice. Support
          is included throughout Pro and Ultra at no separate charge. The
          support period and its renewal date are shown on your order
          confirmation and tax invoice. Support &amp; Maintenance covers:
        </P>
        <UL>
          <li>
            <B>Hosting of your Workspace and your tours</B> on our
            infrastructure.
          </li>
          <li>
            <B>Security</B>: platform security patches, access controls, our
            commitments to protect Content from leak or misuse, and our
            guarantee that we do <B>not</B> sell, rent or disclose your Content
            or Workspace data to any third party except as the{" "}
            <L href="/privacy">Privacy Policy</L> allows.
          </li>
          <li>Fixes for defects in the Service.</li>
          <li>Technical support by e-mail for the Workspace and its tours, with a response within 48 hours (it is not instant or live support).</li>
          <li>Updates we release to the Plan you bought.</li>
        </UL>
        <P>
          <B>What the Annual Support &amp; Maintenance Fee does NOT cover.</B>
          {" "}The fee is for hosting and platform upkeep, not for changes to
          your plant content. The following are <B>not included</B> and are
          either paid work or self-service:
        </P>
        <UL>
          <li>
            Changes inside the factory or plant that need re-shooting or
            re-building a scene (new machinery, relocated equipment, changed
            layout).
          </li>
          <li>
            Edits to existing scenes, hotspots, narration, subtitles,
            languages or any other Content.
          </li>
          <li>
            Adding new scenes beyond your Plan quota — these are bought as a
            scene top-up at the Basic ladder price plus GST.
          </li>
          <li>On-site visits, custom development, content production or training.</li>
        </UL>
        <P>
          We reply to support e-mails within {POLICY.replyBusinessDays}{" "}
          business days.
        </P>
        <P>
          <B>The Annual Support &amp; Maintenance Fee may be revised.</B> We
          may change the fee from time to time. We will e-mail every current
          Customer at least {POLICY.priceChangeNoticeDays} days before a new
          Fee applies to them, and a change never affects a support year you
          have already paid for.
        </P>
        <P>
          <B>Renewal.</B> We e-mail you 30 days, 1 week and 1 day before your
          support year ends. If the Support Fee is not paid by then, you have{" "}
          {POLICY.supportGraceDays} days in which the Workspace keeps working
          but shows a renewal reminder whenever you use it, and we e-mail you{" "}
          <B>every day</B> of those {POLICY.supportGraceDays} days, then once
          more when the Workspace locks. The reminders go to the billing
          e-mail on your account and to our team, so that we can also call you.
        </P>
        <P>
          <B>If the Support Fee stays unpaid.</B> {POLICY.supportGraceDays}{" "}
          days after the renewal date the Workspace is <B>locked</B>: you
          cannot open the editor, and your published tours are not shown to
          visitors, until the Support Fee is paid. The fee pays for the hosting
          and support that keep the Service running. The moment you renew, the
          Workspace is unlocked automatically and everything is exactly as you
          left it. While a Workspace is locked we keep your Content safe, and we
          will not delete it for an unpaid Support Fee without at least{" "}
          {POLICY.deletionNoticeDays} days’ written notice.
        </P>
        <P>
          <B>Sales Team logins have their own renewal date.</B> When you renew
          you choose whether to renew your Sales Team logins as well; they are
          the default, and the price is shown before you pay. If you renew
          support but not the logins, the logins end on their own date, we
          e-mail you about them in the same way, and{" "}
          {POLICY.supportGraceDays} days later your salespeople can no longer
          sign in. Your own login, your tours and your Content are not
          affected, nothing created by your salespeople is deleted, and
          renewing switches their logins back on. A Workspace can have no more
          salespeople signed in than the number of logins paid for.
        </P>
      </>
    ),
  },
  {
    id: "cancellation",
    title: "Cancellation, renewal and refunds",
    body: (
      <>
        <P>
          You can stop renewing Support &amp; Maintenance, or close your
          Workspace, at any time by writing to{" "}
          <Mail to={COMPANY.emails.support} />. Cancellation takes effect at
          the end of the period you have paid for, and we do not pro-rate
          fees for a partial period.
        </P>
        <P>
          <B>Refunds.</B> All payments to VPV are non-refundable by default.
          If a failure on VPV's side (platform outage, data loss caused by
          us, a core function we described that does not work) prevents you
          from using the Service, write to us and we will review the
          request and, if we agree a refund is due, issue it at our
          discretion. Duplicate, excess and erroneous charges are always
          refunded in full. The full rules, including the three situations
          where a refund may apply, are set out in our{" "}
          <L href="/refund-policy">Cancellation &amp; Refund Policy</L>.
          After cancellation we keep your account data for{" "}
          {POLICY.retentionAfterCancelDays} days so you can return without
          losing it, then delete it as described in the{" "}
          <L href="/privacy">Privacy Policy</L>.
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
          You own your Content. You give us a limited, worldwide,
          royalty-free licence to host, process, display and transmit it
          solely to provide the Service to you — for example, to render a
          tour for your Viewers — and to keep it secure. We claim no other
          rights in it and we do not use it to train AI models.
        </P>
        <P>
          You confirm that you have the rights to everything you upload and
          that it does not infringe anyone’s rights or break the law. You are
          responsible for keeping your own copies of Content you cannot
          afford to lose; we take care to protect it but the Service is not a
          backup product.
        </P>
      </>
    ),
  },
  {
    id: "recording-ai",
    title: "Recording, location and AI features",
    body: (
      <>
        <P>
          VPV’s presenter tools can record audio, transcribe speech, capture
          the presenter’s approximate location, and produce AI-assisted
          analysis of a meeting. The dashboard owner (<B>MD</B>) chooses
          between <B>Automatic</B> recording (every meeting starts recorded)
          and <B>Manual</B> recording (the sales representative decides at the
          start of each meeting whether to record). Please read the{" "}
          <L href="/privacy">Privacy Policy</L> for how this data is handled.
        </P>
        <UL>
          <li>
            <B>Informing participants is the sales representative’s
            responsibility, not VPV’s.</B> Before recording, the sales
            representative conducting the meeting must tell every participant
            that the conversation is being recorded for training and quality
            purposes and obtain any consent that applicable law requires. VPV
            is not a participant in that conversation; VPV does not supervise,
            audit or verify this disclosure, and the Customer accepts full
            responsibility for compliance by its representatives. A browser
            permission prompt does not replace that duty.
          </li>
          <li>
            <B>Manual mode and missing recordings.</B> In Manual mode, if the
            sales representative does not start a recording, no audio exists
            for that meeting. VPV cannot provide a transcript, score, insights
            or any other meeting data for an unrecorded session.
          </li>
          <li>
            <B>Stop-recording and the trailing-audio check.</B> When a sales
            representative stops a recording during a meeting, VPV continues
            to capture audio for a short additional window (approximately 15
            seconds) to help determine whether the stop was requested by a
            client in the room. This is disclosed to the sales representative
            at a popup each time they stop recording, and is part of the
            consent the sales representative must obtain from participants at
            the start of the meeting. The trailing audio, the stop event and
            VPV’s automated verdict (<i>verified valid</i>, <i>unverified</i>
            {" "}or <i>flagged</i>) are visible to the MD.
          </li>
          <li>
            <B>How that check works, and its limits.</B> The check reads the
            meeting’s text transcript, not its audio. It looks for a spoken
            request to stop recording in English, Hindi or a mix of the two,
            and then asks an AI model whether those words read as coming from
            someone other than the representative. The transcript is captured
            from a single microphone and carries no speaker labels, so this
            attribution is an inference and not a measurement. Accordingly:
            a stop is recorded as <i>unverified</i> unless a clear request is
            found AND it reads as another person’s; a representative heard
            agreeing to stop is <B>never</B> treated as a problem; and a stop
            is only marked <i>flagged</i> where a substantial amount of
            speech was captured and no request appears anywhere in it. The
            automated verdict is an aid only and the MD makes the final
            judgement.
          </li>
          <li>
            <B>Voice sample at sales representative onboarding.</B> At first
            login, each sales representative is asked to record a short
            (approximately 10-second) voice sample. Its only permitted
            purpose is to tell the representative’s voice apart from other
            voices inside meeting audio. <B>It is not in active use today</B>
            : the stop-recording check described above works from the text
            transcript, and the sample is retained for the voice-matching
            capability when it is introduced. We will not use it for any
            other purpose without telling you first. The sample is encrypted
            at rest, is never shared with third parties, is not used to train
            AI models, and is deleted when the representative is removed from
            the Workspace or the account is closed. The purpose of this
            sample is explained in a popup before it is recorded and in the{" "}
            <L href="/privacy">Privacy Policy</L>.
          </li>
          <li>
            <B>Your people, your rules.</B> Only Authorised Users who need
            access should be able to open recordings. You decide what to keep
            and when to delete it.
          </li>
          <li>
            <B>AI output is an aid, not an authority.</B> Transcripts,
            summaries, scores and suggestions are generated automatically and
            can be incomplete or wrong. Review them before relying on them
            and do not use them as the sole basis for decisions about people.
            See the <L href="/disclaimer">Disclaimer</L>.
          </li>
        </UL>
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
          <li>upload content that is unlawful, infringing, defamatory or that you have no right to distribute;</li>
          <li>publish content designed to deceive Viewers, such as false facility details, fabricated certifications or misleading quality claims;</li>
          <li>impersonate another person or tag share links with someone else’s e-mail address or phone number to mislead;</li>
          <li>share logins, bypass or interfere with device limits, rate limits or access controls, or probe the Service for vulnerabilities outside our <L href="/security">disclosure process</L>;</li>
          <li>record, scrape or redistribute tours you are not authorised to share, or remove viewer watermarks;</li>
          <li>send malware, overload the Service, or use it to harm others.</li>
        </UL>
      </>
    ),
  },
  {
    id: "viewer-data",
    title: "Viewer data and compliance",
    body: (
      <P>
        When you share tours, VPV collects analytics about how Viewers use them
        on your behalf. For that data you decide why and how it is used and we
        act as your service provider. You are responsible for any notice and
        consent your local law requires from Viewers, and for using the data
        lawfully. For account, billing and security data about your own team,
        we are responsible as described in the{" "}
        <L href="/privacy">Privacy Policy</L>.
      </P>
    ),
  },
  {
    id: "ip",
    title: "Our intellectual property",
    body: (
      <P>
        The Service — its software, design, text, trademarks and logos — belongs
        to {COMPANY.legalName} or its licensors and is protected by law. These
        Terms give you only the right to use it as described above. If you
        send us feedback, you allow us to use it to improve the Service
        without obligation to you.
      </P>
    ),
  },
  {
    id: "availability",
    title: "Availability and maintenance",
    body: (
      <P>
        We aim for 99% monthly availability. We do not guarantee uninterrupted
        service. Planned maintenance is announced on the dashboard at least 48
        hours in advance, except for urgent security fixes. Availability
        targets are goals, not a promise of specific performance, and are
        not a condition of payment.
      </P>
    ),
  },
  {
    id: "third-party",
    title: "Third-party services",
    body: (
      <P>
        VPV relies on other providers — for hosting, database and storage,
        payments, e-mail and AI processing. The list is in the{" "}
        <L href="/privacy#sharing">Privacy Policy</L>. Embedded third-party
        content, such as YouTube videos you add to a tour, is governed by that
        provider’s own terms. We are not responsible for services we do not
        operate.
      </P>
    ),
  },
  {
    id: "suspension",
    title: "Suspension and termination",
    body: (
      <>
        <P>
          We may suspend or end access if you materially breach these Terms,
          if an account appears compromised, or if continued access would put
          other customers at risk. Where practical we will contact the
          administrator first and allow a reasonable period to fix the issue;
          where immediate action is needed to protect others we may act first
          and explain afterwards.
        </P>
        <P>
          You may stop using VPV at any time. When these Terms end, your right
          to use the Service ends, and sections that by their nature should
          continue (fees owed, intellectual property, liability, disputes)
          continue.
        </P>
      </>
    ),
  },
  {
    id: "warranty",
    title: "Warranties and disclaimers",
    body: (
      <P>
        We provide the Service with reasonable skill and care. Beyond that,
        and to the extent the law allows, the Service is provided “as is” and
        “as available”, and we disclaim implied warranties of merchantability,
        fitness for a particular purpose and non-infringement. We do not
        promise that VPV will produce any particular sales or business
        result. See the <L href="/disclaimer">Disclaimer</L> for more.
      </P>
    ),
  },
  {
    id: "liability",
    title: "Limitation of liability",
    body: (
      <>
        <P>
          To the extent the law allows, neither party is liable to the other
          for indirect, incidental or consequential loss, or for lost
          profits, lost business opportunities or loss of goodwill, arising
          from the use of or inability to use the Service.
        </P>
        <P>
          Our total liability to you for all claims in any 12-month period is
          limited to the fees you paid us in that period. These limits do not
          apply to liability that cannot be limited by law, to fraud, or to
          your payment obligations.
        </P>
      </>
    ),
  },
  {
    id: "indemnity",
    title: "Indemnity",
    body: (
      <P>
        You will defend and compensate us against third-party claims, and the
        resulting losses and reasonable costs, that arise from your Content,
        from recordings you make without a lawful basis, or from your breach
        of these Terms. We will tell you promptly of any claim and give you
        reasonable help in handling it.
      </P>
    ),
  },
  {
    id: "force-majeure",
    title: "Events beyond our control",
    body: (
      <P>
        Neither party is liable for a delay or failure caused by events
        beyond its reasonable control — such as natural disasters, war,
        government action, power or internet failure, or failure of a major
        infrastructure provider — as long as it takes reasonable steps to
        limit the effect. This does not excuse payment obligations that have
        already fallen due.
      </P>
    ),
  },
  {
    id: "changes",
    title: "Changes to the Service and these Terms",
    body: (
      <>
        <P>
          We improve VPV continuously and may add, change or retire features.
          If we make a change that materially reduces what your paid Plan
          offers, we will give notice and, where the change is not
          reversible, discuss a fair solution with you.
        </P>
        <P>
          We may update these Terms. For material changes we will e-mail the
          administrator on record and show a notice on the sign-in page{" "}
          <B>at least {POLICY.termsChangeNoticeDays} days before they take
          effect</B>. Price changes follow the separate notice period in{" "}
          <a href="#price-changes" className="text-vpv-blue underline underline-offset-2">Price changes</a>.
          Continuing to use the Service after the effective date means you
          accept the update; if you do not, you may cancel before it takes
          effect.
        </P>
      </>
    ),
  },
  {
    id: "notices",
    title: "Notices",
    body: (
      <P>
        We give notices by e-mail to the administrator and billing contact on
        record, and may also show them in the dashboard. Send notices to us at{" "}
        <Mail to={COMPANY.emails.support} />. An e-mail notice is treated as
        received on the next business day after it is sent. Because these Terms
        are an electronic record under the Information Technology Act, 2000,
        they do not require a physical signature.
      </P>
    ),
  },
  {
    id: "law",
    title: "Governing law and disputes",
    body: (
      <>
        <P>
          These Terms are governed by the laws of India. If a dispute arises,
          the parties will first try in good faith to resolve it through
          discussion for 30 days after written notice. If it is not resolved,
          the courts at {COMPANY.jurisdiction} have exclusive jurisdiction.
        </P>
        <P>
          Complaints about a payment, a refund or the Service can be sent to{" "}
          <Mail to={COMPANY.emails.support} /> at any time; we treat
          resolving them quickly as part of the Service.
        </P>
      </>
    ),
  },
  {
    id: "general",
    title: "General",
    body: (
      <UL>
        <li><B>Entire agreement.</B> These Terms, the policies they refer to and any signed proposal are the whole agreement and replace earlier discussions.</li>
        <li><B>Severability.</B> If a provision is unenforceable, the rest continues in force.</li>
        <li><B>No waiver.</B> Not enforcing a right at once does not give it up.</li>
        <li><B>Assignment.</B> You may not transfer these Terms without our written consent. We may transfer them to a successor to our business, and will tell you.</li>
        <li><B>Relationship.</B> The parties are independent contractors. Nothing creates a partnership, agency or employment.</li>
      </UL>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <UL>
        <li>Terms and legal: <Mail to={COMPANY.emails.support} /></li>
        <li>Billing and invoices: <Mail to={COMPANY.emails.support} /></li>
        <li>Support: <Mail to={COMPANY.emails.support} /></li>
        <li>
          Full contact details are on the <L href="/contact">Contact</L> page.
        </li>
      </UL>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms & Conditions"
      summary="The agreement for using VPV: what you get, what it costs, how support works, and what happens if prices or terms change."
      sections={sections}
    >
      <Callout title="Plain-language summary">
        Basic is a one-time licence from {inr(priceForScenes(SCENE_MIN))} plus
        18% GST — you choose how many scenes, and the price per scene falls as
        you add more. {SUPPORT_NAME} is {inr(SUPPORT_MONTHLY_INR)} a month,
        billed yearly as {inr(SUPPORT_ANNUAL_INR)} plus 18% GST, with the first
        year free for our first {LAUNCH_OFFER.limit} customers. VPV plans include
        the shoot; for our first {LAUNCH_OFFER.limit} customers cab travel is free and
        Sales Team logins are {inr(SALES_TEAM.offerInr)} per salesperson a year. A Workspace
        whose support is more than {POLICY.supportGraceDays} days overdue is
        locked until it is renewed. Pro is {inr(PRO_MONTHLY_INR)} a month plus
        GST and Ultra {inr(ULTRA_MONTHLY_INR)} a month plus GST, both with
        unlimited scenes. The annual Support &amp; Maintenance fee covers
        hosting, security and platform upkeep — not changes to your plant
        content or scenes. You own your content. Prices can change, but only
        after we e-mail you {POLICY.priceChangeNoticeDays} days in advance and
        never for something you have already paid for.
      </Callout>
    </LegalPage>
  );
}

