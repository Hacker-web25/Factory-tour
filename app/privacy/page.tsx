/**
 * /privacy — VPV Privacy Policy.
 *
 * Written to match what the product actually does today. Two rules keep it
 * true:
 *   1. If a new third party is added to the stack, add it to the provider
 *      table BEFORE it goes live.
 *   2. If a switched-off feature (recording, AI analysis, voice samples,
 *      subtitles/translation, in-tour visitor analytics, leads) is switched
 *      on in lib/entitlements.ts ROLLOUT, this page must describe it first,
 *      with 14 days' notice to customers. The old wording for those features
 *      is in git history (app/privacy/page.tsx before 16 Nov 2026).
 *
 * Reviewed 16 Nov 2026 against the DPDP Act 2023 and DPDP Rules 2025 (Rule 3
 * notice contents, Rule 8 erasure notice, Rule 14 rights; most duties apply
 * from 13 May 2027, written to them now), the IT Act 2000 / SPDI Rules 2011
 * and the CCPA dark-pattern guidelines 2023. Not a substitute for a lawyer.
 */

import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/legal/LegalPage";
import { B, Callout, DataTable, L, Mail, P, UL } from "@/components/legal/prose";
import { COMPANY, POLICY, companyIdentity } from "@/lib/company";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How VPV (Virtual Plant Visit) handles personal data: enquiries, accounts, website visits, e-mail campaigns, sales meetings and payments, who else handles it, how long we keep it, and the rights you have.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/privacy" },
};

const contactLine = COMPANY.phone
  ? `, call or WhatsApp ${COMPANY.phone} (${COMPANY.phoneHours}), or use the form on our Contact page`
  : ", or use the form on our Contact page";

const sections: LegalSection[] = [
  {
    id: "who-we-are",
    title: "Who we are and what this covers",
    body: (
      <>
        <P>
          VPV (Virtual Plant Visit) is run by {companyIdentity()}, registered at{" "}
          {COMPANY.addressLines.join(", ")}. We shoot factories in 360° and host
          the tours, so manufacturers can show their plant to buyers through
          private links.
        </P>
        <P>
          This policy explains what personal data we handle, why, who else
          handles it, how long we keep it and what you can do about it. It covers
          the VPV website, the pricing questions, the dashboards, the tour viewer
          and the sales tools. We handle personal data under the Digital Personal
          Data Protection Act, 2023 and its Rules, and the Information Technology
          Act, 2000 and its Rules, as each applies.
        </P>
        <Callout title="Two roles, in plain words">
          For data about <B>you, your team and your billing</B> (enquiries,
          accounts, payments, security logs, website visits), VPV decides how it
          is used and is responsible for it. For data about{" "}
          <B>your Viewers and your clients</B> (who opened your tour links, the
          client names and meeting notes your salespeople add), your business
          decides why it is collected and VPV handles it on your behalf.
        </Callout>
      </>
    ),
  },
  {
    id: "what-we-collect",
    title: "What we collect, and why",
    body: (
      <>
        <DataTable
          head={["Data", "What it includes", "Why we use it"]}
          rows={[
            [
              "Your enquiry",
              "What you tell us on the pricing questions: your name, company, work e-mail, mobile number, industry and factory city; the areas and processes you pick; the plan we recommended, the plan you chose and the price we showed you.",
              "To work out your price and travel, show and e-mail you the quote, raise your invoice if you buy, and contact you about this enquiry and the shoot.",
            ],
            [
              "Website visits",
              "A random visitor number kept in a cookie, the pages you open, how far you scroll, the buttons you press, how you arrived (a search, a link, a QR code or an e-mail of ours), your browser and device type, and your approximate city and country worked out from your network address.",
              "To see which pages help and which confuse, and which pamphlet, e-mail or search brought people who later enquired. See “How website visits are linked to you” below.",
            ],
            [
              "E-mail campaigns",
              "If we e-mail you about VPV: your name, work e-mail, company and phone (from business sources such as trade directories, trade shows or your own enquiry), a personal link in the e-mail, and whether the e-mail was delivered, opened or clicked, or you unsubscribed.",
              "To send you information about VPV, stop when you ask, and know whether the e-mail was useful.",
            ],
            [
              "Account data",
              "Name, work e-mail, mobile number, role, password (stored only as a salted hash) and a device identifier.",
              "To create and secure your account, sign you in and send service messages.",
            ],
            [
              "Workspace content",
              "360° pictures, logos, information-icon text, PDF reports, video links, client names and notes you add.",
              "To build and show your tours and run your dashboards.",
            ],
            [
              "Sales meetings (Sales Team logins only)",
              "When a salesperson starts a meeting: the client it was for, the start time, and, only if the salesperson allows location in the browser, the place (coordinates and a place name).",
              "To give the business’s administrator the sales dashboard they bought.",
            ],
            [
              "Viewer data",
              "When someone opens a customer’s tour: a random device number kept in the browser tab, approximate country, which scenes were viewed and for how long, information icons opened, the e-mail entered if the link asks for one, and the label the customer gave the link.",
              "To enforce the customer’s link rules (expiry, one-time links, passwords), and to show the customer how their tour is viewed. The viewing screen is not shown to customers today; the data is kept so it can be.",
            ],
            [
              "Billing data",
              "Billing name, address, GSTIN, billing e-mail, order and invoice details, and the payment ID, amount, status and method type (for example UPI or card) returned by Razorpay.",
              "To take payment, issue GST invoices, keep tax records and answer billing questions.",
            ],
            [
              "Messages to us",
              "What you send us by e-mail, WhatsApp or the contact form, and any files you attach.",
              "To answer you and resolve your issue.",
            ],
            [
              "Security data",
              "Network (IP) address, browser type, sign-in times, failed sign-in attempts, signed-in devices and new-device alerts.",
              "To prevent abuse, enforce sign-in limits and investigate incidents.",
            ],
          ]}
        />
        <P>
          We never collect your card number, CVV, UPI PIN or net-banking
          password. Those go straight to Razorpay on its own secure checkout.
        </P>
      </>
    ),
  },
  {
    id: "website-visits",
    title: "How website visits are linked to you",
    body: (
      <>
        <P>
          We want to be plain about this, because it is the part people are
          least likely to expect.
        </P>
        <UL>
          <li>
            <B>An ordinary visit is anonymous to us.</B> We see a random visitor
            number, the pages and an approximate city. We do not know your name.
          </li>
          <li>
            <B>A personal link or QR code is not anonymous.</B> If you open a
            link from an e-mail we sent you, or a QR code we gave you
            personally, the link carries a code that is tied to you. That visit,
            and the later visits from the same browser, are then linked to your
            name in our records.
          </li>
          <li>
            <B>Filling in a form links your earlier visits.</B> When you give us
            your details on the pricing questions or the contact form, the visits
            from the same browser before that are linked to your enquiry, so our
            team can see which pages you read before you enquired.
          </li>
          <li>
            <B>Only our own team sees this</B>, to follow up your enquiry and to
            improve the site. It is never sold or shared with advertisers.
          </li>
          <li>
            <B>You can switch it off.</B> Choose Decline on the cookie notice, or
            on the <L href="/cookies">Cookie Policy</L> page, and we stop
            recording visits from that browser. Unsubscribing from our e-mails
            stops the e-mails. You can also ask us to delete what we hold (see{" "}
            <L href="#your-rights">Your rights</L>).
          </li>
        </UL>
      </>
    ),
  },
  {
    id: "quote-enquiries",
    title: "If you ask us for a price",
    body: (
      <>
        <P>
          The pricing questions ask for a few details before they show you a
          figure. The most important is your <B>factory&rsquo;s city</B>: our
          crew travels to you, and the travel charge depends on where your plant
          is, so we cannot quote an honest total without it.
        </P>
        <P>
          We keep your answers so that the figures you were shown are the
          figures on your invoice. We also keep them if you stop part-way,
          because an unfinished enquiry is usually someone who still wants an
          answer.
        </P>
        <UL>
          <li>
            <B>We may contact you about this enquiry.</B> A member of our team
            may call, e-mail or WhatsApp you on the details you gave, to answer
            questions about your quote, agree a shoot date, or follow up if you
            stopped part-way. This is only about your VPV enquiry.
          </li>
          <li>
            <B>You can stop it at any time,</B> as easily as you started: tell
            the person who calls, reply &ldquo;stop&rdquo; to any message, or
            write to <Mail to={COMPANY.emails.support} />. We stop straight away,
            and it does not affect your quote or any order.
          </li>
          <li>
            <B>Your sales team.</B> If you tell us you have a sales team, we keep
            that answer and the number of logins you chose. The salary you type
            into the sales-team calculator is used only on your screen; it is
            never sent to us.
          </li>
          <li>
            <B>Totals only.</B> We count enquiries by city, and how often each
            area and process is picked, to decide where to shoot next and to mark
            popular choices for other visitors. Nobody sees what you chose.
          </li>
        </UL>
        <P>
          Before we take any payment we send a short code to your work e-mail
          and ask you to type it back, because your workspace link, first
          password and GST invoice all go to that address. The code is stored
          only as a one-way hash, expires after ten minutes and is then deleted.
        </P>
        <P>
          Your answers are also kept in your own browser between steps, so you
          can come back without starting again. Clearing your browser&rsquo;s
          site data removes that copy.
        </P>
      </>
    ),
  },
  {
    id: "what-we-dont-do",
    title: "What we do not do",
    body: (
      <UL>
        <li>We do not sell personal data, and we do not share it with advertisers or advertising networks.</li>
        <li>We do not use advertising cookies or track you across other websites. The measurement cookies we do use are listed in the <L href="/cookies">Cookie Policy</L>, and you can refuse them.</li>
        <li>We do not use your content to train AI models.</li>
        <li>We do not record meetings, calls or voices. Those tools exist in our software but are switched off for everyone (see below).</li>
        <li>We do not ask for anything we do not need for what you asked for. Every optional question can be skipped.</li>
      </UL>
    ),
  },
  {
    id: "recordings-ai",
    title: "Features that are switched off",
    body: (
      <P>
        Our software contains some tools that are <B>switched off for every
        customer</B>: meeting recording, transcripts and AI meeting analysis,
        salesperson voice samples, subtitles and translation, and lead capture
        inside customers&rsquo; tours. While they are off, none of the data
        they would use is collected. If any of them is
        ever switched on, we will update this policy first and tell customers
        at least {POLICY.termsChangeNoticeDays} days before, including which
        outside provider would be involved.
      </P>
    ),
  },
  {
    id: "how-we-use",
    title: "How we use personal data",
    body: (
      <UL>
        <li>To answer your enquiry, prepare your quote, and provide and support the Service you bought.</li>
        <li>To take payments, issue GST invoices and meet tax and accounting duties.</li>
        <li>
          To send service messages: sign-in and new-device alerts, password
          resets, invoices, renewal reminders, support replies, and{" "}
          <B>notices of changes to prices, terms or this policy</B>. You cannot
          switch these off while you have an account, because they carry
          information you need. They never carry advertising.
        </li>
        <li>To send information about VPV by e-mail, until you unsubscribe. Every such e-mail has a one-click unsubscribe link.</li>
        <li>To prevent abuse and protect other customers.</li>
        <li>To fix faults and improve the site and the Service, using totals wherever we can.</li>
        <li>
          After you pay we ask one <B>optional</B> question, how you plan to use
          your VPV, and we look at simple activity in your Workspace, such as how
          many tours you have built and when you last signed in. Only our own
          team reads this. We never look inside your tours or client notes for
          it.
        </li>
        <li>To comply with the law and answer lawful requests.</li>
      </UL>
    ),
  },
  {
    id: "sharing",
    title: "Who else handles your data",
    body: (
      <>
        <P>
          We use the providers below. Each receives only what it needs for its
          job, under terms that require it to protect the data.
        </P>
        <DataTable
          head={["Provider", "What it does for us", "Data involved"]}
          rows={[
            ["Supabase", "Database, sign-in and private file storage. Hosted in the EU (Frankfurt).", "Account, enquiry, website-visit, billing and Workspace data."],
            ["Cloudflare", "Stores and serves the 360° pictures in tours (R2), and checks sign-in forms for bots (Turnstile).", "Tour pictures; your network address and browser details when you load them or sign in."],
            ["Vercel", "Hosts the website and application.", "Requests, network addresses, technical logs."],
            ["Razorpay Software Private Limited", "Payment processing for cards, UPI, net banking and wallets.", "Billing name, e-mail, phone, amount and the payment details you enter on its checkout."],
            ["Resend", "Sends service e-mail such as invoices, codes and alerts.", "Recipient e-mail and the message."],
            ["Zoho (Zoho Campaigns)", "Sends our e-mail campaigns and tells us if they were delivered, opened or clicked.", "Name, work e-mail, company, phone and your personal VPV link."],
            ["Google (Analytics)", "Counts visits to the public website and shows which pages and sources bring people. Not used inside customer workspaces or tours.", "A random visitor number, pages viewed, approximate city, device and referring link."],
            ["Microsoft (Clarity)", "Shows how a public page was used (scrolling, clicks and a replay of the visit) so confusing parts can be fixed. Not used inside workspaces or tours.", "A random visitor number, pages viewed, approximate city, device and interactions. Text typed into forms is masked before it leaves your browser."],
            ["Google (Fonts)", "Supplies the typeface on the marketing pages.", "Your network address when the font loads."],
            ["BigDataCloud", "Turns a sales meeting’s coordinates into a place name (Sales Team logins only).", "Coordinates."],
            ["YouTube (Google)", "Plays the process videos embedded in a tour.", "Standard request data when a video loads."],
          ]}
        />
        <P>
          We may also disclose data to our professional advisers, to a buyer of
          our business (with notice to you), and to authorities where the law
          requires it.
        </P>
      </>
    ),
  },
  {
    id: "transfers",
    title: "Where data is stored",
    body: (
      <P>
        Our main database is in Frankfurt, Germany, and our providers run
        infrastructure worldwide. Because VPV is run from India, this means
        personal data travels outside India. We use providers that encrypt data
        in transit and control access to it, and we transfer data only where
        Indian law permits.
      </P>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and browser storage",
    body: (
      <P>
        We use some storage that the site needs to work (for example, to keep
        you signed in), and measurement cookies that you can refuse. Every one
        is listed by name, with what it does and how long it lasts, in our{" "}
        <L href="/cookies">Cookie Policy</L>.
      </P>
    ),
  },
  {
    id: "security",
    title: "How we protect data",
    body: (
      <P>
        Each customer&rsquo;s data is kept apart by database rules, so one
        business cannot read another&rsquo;s. Traffic is encrypted, sign-in is
        rate-limited, devices are capped and payments are checked on our
        server. The full list is on the <L href="/security">Security</L> page.
        No online service can promise perfect security. If a breach affects
        your data, we will tell you without delay, with what happened, what it
        may mean for you and what we are doing, and we will report it to the
        Data Protection Board of India and CERT-In as the law requires.
      </P>
    ),
  },
  {
    id: "retention",
    title: "How long we keep data",
    body: (
      <>
        <DataTable
          head={["Data", "How long"]}
          rows={[
            ["Your enquiry", "24 months from your last activity, or until you ask us to delete it, whichever is sooner. If you buy, what belongs on your invoice is kept as long as tax law requires."],
            ["Website visits", "24 months from the visit."],
            ["E-mail campaign records", "Until you unsubscribe or ask us to delete them; after unsubscribing we keep only your e-mail address on a do-not-send list, so you are never e-mailed again by mistake."],
            ["Account data and Workspace content", "While your Workspace is active, and for 90 days after it is closed so you can return; then deleted."],
            ["Sales meeting records", "While your Workspace is active; your administrator can delete them at any time."],
            ["Viewer data", "24 months."],
            ["Security logs and signed-in devices", "30 days, except logs the law requires us to keep longer (up to one year)."],
            ["Billing, invoice and payment records", "As long as Indian tax and accounting law requires (currently up to 8 years)."],
            ["Messages to us", "24 months after the last message."],
            ["E-mail verification codes", "Deleted within an hour of being used or expiring."],
          ]}
        />
      </>
    ),
  },
  {
    id: "your-rights",
    title: "Your rights",
    body: (
      <>
        <P>You may ask us to:</P>
        <UL>
          <li>tell you what personal data we hold about you, how it is used and who we have shared it with;</li>
          <li>correct, complete or update data that is wrong;</li>
          <li>delete data we no longer need to keep;</li>
          <li>withdraw a consent you gave, as easily as you gave it (this does not undo what was done before);</li>
          <li>stop e-mails about VPV, using the unsubscribe link or by asking us;</li>
          <li>name someone to use these rights for you if you cannot; and</li>
          <li>complain to us, and then to the Data Protection Board of India if you are not satisfied.</li>
        </UL>
        <P>
          Write to <Mail to={COMPANY.emails.support} />
          {contactLine}. We may need to check who you are. We acknowledge your
          request within {POLICY.grievanceAckHours} hours and complete it within{" "}
          {POLICY.grievanceResolveDays} days. For tour content and Viewer data,
          the request should go to the business that shared the tour, because it
          controls that data; if a Viewer writes to us, we pass the request on
          to that business.
        </P>
      </>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <P>
        VPV is a business product and is not meant for anyone under 18. We do
        not knowingly collect data from children. If you believe we hold data
        about a child, tell us and we will delete it.
      </P>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <P>
        We may update this policy. For an important change we e-mail the
        administrator on record and show a notice on the sign-in page at least{" "}
        {POLICY.termsChangeNoticeDays} days before it takes effect. The
        &ldquo;Effective&rdquo; date at the top always shows the current
        version. Price changes follow the{" "}
        <L href="/terms#price-changes">Terms</L>: {POLICY.priceChangeNoticeDays}{" "}
        days&rsquo; e-mail notice. This version (effective {POLICY.updated})
        adds how website visits are linked to you, our e-mail campaigns and
        their provider, Cloudflare, and the fact that recording and AI features
        are switched off.
      </P>
    ),
  },
  {
    id: "grievance",
    title: "Grievance officer and contact",
    body: (
      <>
        <P>
          If you have a concern about how your data is handled, contact our
          grievance officer. We acknowledge complaints within{" "}
          {POLICY.grievanceAckHours} hours and resolve them within{" "}
          {POLICY.grievanceResolveDays} days.
        </P>
        <UL>
          <li>
            {COMPANY.grievanceOfficer.role}
            {COMPANY.grievanceOfficer.name ? `: ${COMPANY.grievanceOfficer.name}` : ""},{" "}
            {COMPANY.legalName}, {COMPANY.addressLines.join(", ")}
          </li>
          <li>E-mail: <Mail to={COMPANY.grievanceOfficer.email} /></li>
          {COMPANY.phone ? <li>Phone and WhatsApp: {COMPANY.phone} ({COMPANY.phoneHours})</li> : null}
          <li>Or the form on the <L href="/contact">Contact</L> page</li>
        </UL>
      </>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      summary="What we collect, why, who else handles it, how long we keep it, and how you stay in control. Written to match what VPV actually does."
      sections={sections}
    />
  );
}
