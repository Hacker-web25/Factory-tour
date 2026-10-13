/**
 * /privacy — VPV Privacy Policy.
 *
 * Written to match what the product actually does today, including the
 * presenter recording / location / AI-analysis features and the payment
 * flow. If a new third party is added to the stack (see the
 * sub-processor table), add it here BEFORE it goes live.
 *
 * Draft for legal review — see the notice in the delivery notes.
 */

import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/legal/LegalPage";
import { B, Callout, DataTable, L, Mail, P, UL } from "@/components/legal/prose";
import { COMPANY, POLICY, companyIdentity } from "@/lib/company";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How VPV (Virtual Plant Visit) handles personal data: accounts, viewer analytics, presenter recordings, location, AI processing and payments — and the rights you have.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/privacy" },
};

const sections: LegalSection[] = [
  {
    id: "who-we-are",
    title: "Who we are and what this covers",
    body: (
      <>
        <P>
          VPV (Virtual Plant Visit) is a 360° virtual-tour platform operated by{" "}
          {companyIdentity()}. We help manufacturers host immersive tours of
          their facilities and share them with their own customers through
          private links.
        </P>
        <P>
          This policy explains what personal data we handle, why, who else
          handles it, how long we keep it, and what you can do about it. It
          applies to the VPV website, dashboards, tour viewer and presenter
          tools. We handle personal data in line with the Information
          Technology Act, 2000 and the rules made under it, and the Digital
          Personal Data Protection Act, 2023, to the extent each applies and is
          in force.
        </P>
        <Callout title="Two roles, in plain words">
          For data about <B>your own team and your billing</B> (accounts,
          payments, security logs), VPV decides how the data is used. For data
          about <B>your Viewers and your meetings</B> (tour analytics, client
          details, presentation recordings), you decide why it is collected
          and VPV processes it on your behalf. Your organisation is
          responsible for having a lawful basis and any notice or consent
          that its own law requires for that second category.
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
              "Account data",
              "Name, work e-mail, mobile number, role, password (stored only as a salted hash), device identifier.",
              "To create and secure your account, sign you in and send service messages.",
            ],
            [
              "Organisation content",
              "Panoramas, logos, hotspot text, narration audio, media, client names and notes you add.",
              "To render your tours and run your dashboards.",
            ],
            [
              "Viewer analytics",
              "A random device identifier, approximate country, scenes viewed, hotspot clicks, time spent, the e-mail a Viewer enters for a gated link, and the recipient tag you set on a link.",
              "To show you who viewed your tours and enforce link rules.",
            ],
            [
              "Presentation sessions",
              "When a presenter turns them on: voice recording, a text transcript, the presenter’s location (coordinates and a place name), duration, outcome and the client the session was for.",
              "To give your team a record of client meetings and to power the optional AI analysis.",
            ],
            [
              "AI analysis output",
              "Speaker-split dialogue, topics detected, a summary and a score generated from a transcript.",
              "To help you review how a meeting went.",
            ],
            [
              "Billing data",
              "Billing name, address, GSTIN, billing e-mail, order and invoice details, the payment ID, amount, status and method type (for example UPI or card) returned by Razorpay.",
              "To take payment, issue GST invoices, keep tax records and answer billing queries.",
            ],
            [
              "Enquiry data",
              "What you submit through the qualification (apply) form or by e-mail: name, company, contact details and your answers.",
              "To assess and reply to your enquiry.",
            ],
            [
              "Support messages",
              "The content of your e-mails to us and any files you attach.",
              "To resolve your issue and improve the Service.",
            ],
            [
              "Security and device data",
              "IP address, browser type, sign-in times, failed sign-in attempts, active device sessions, new-device alerts.",
              "To prevent abuse, enforce rate limits and the device cap, and investigate incidents.",
            ],
          ]}
        />
        <P>
          We do not collect your card number, CVV, UPI PIN or net-banking
          credentials. Those go straight to Razorpay on its secure checkout.
        </P>
      </>
    ),
  },
  {
    id: "what-we-dont-do",
    title: "What we do not do",
    body: (
      <UL>
        <li>We do not sell personal data, and we do not share it with advertisers or marketing networks.</li>
        <li>We do not use advertising or cross-site tracking, and we do not set tracking cookies.</li>
        <li>We do not fingerprint people across websites. The device identifier is a random ID kept in your own browser and scoped to our domain.</li>
        <li>We do not use your content, recordings or transcripts to train AI models, and we send an AI provider only the transcript text needed to return a result.</li>
        <li>VPV does not join your calls or record Viewers. Recording happens only on a presenter’s own device when the presenter switches it on.</li>
      </UL>
    ),
  },
  {
    id: "recordings-ai-location",
    title: "Recordings, location and AI analysis",
    body: (
      <>
        <P>
          These features are optional and controlled by the presenter and the
          organisation.
        </P>
        <UL>
          <li>
            <B>Recording.</B> The recorder captures the presenter’s microphone.
            If the presenter also chooses to share a browser tab or system
            audio, the recording can include the sound of that tab —
            which may be other participants of a video call. The browser asks
            for permission each time. Audio is stored in your organisation’s
            private storage area and is visible only to people your
            organisation authorises.
          </li>
          <li>
            <B>Transcription.</B> Speech is turned into text in the presenter’s
            browser, using the browser’s built-in speech recognition and, where
            available, an on-device model. Built-in recognition is provided
            by the browser maker (for example Google in Chrome, or Microsoft in
            Edge) and may process audio on its servers under that company’s
            own terms. VPV does not send the audio file to an AI provider.
          </li>
          <li>
            <B>AI analysis.</B> If an organisation asks for it, the{" "}
            <B>transcript text</B> (not the audio) is sent to an AI provider —
            NVIDIA’s hosted inference service or Google’s Gemini API — to
            separate speakers and produce a summary and score. If neither is
            available, a rule-based method runs inside VPV instead.
          </li>
          <li>
            <B>Location.</B> If the presenter allows it in the browser prompt,
            we store the coordinates and look up a readable place name from
            them. Declining the prompt does not affect the presentation.
          </li>
        </UL>
        <P>
          <B>Consent.</B> The organisation must inform everyone on a recorded
          conversation and obtain the consent applicable law requires before
          recording. Under our <L href="/terms#recording-ai">Terms</L> this is
          the organisation’s responsibility, and it can delete any recording
          at any time.
        </P>
      </>
    ),
  },
  {
    id: "how-we-use",
    title: "How we use personal data",
    body: (
      <UL>
        <li>To provide, secure and support the Service you have bought.</li>
        <li>To take payments, issue GST invoices and meet tax and accounting duties.</li>
        <li>
          To send service messages: sign-in and new-device alerts, password
          resets, invoices, renewal reminders, support replies, and{" "}
          <B>notices of changes to prices, terms or this policy</B>. These are
          not marketing; you cannot opt out of them while you have an
          account, because they carry information you need.
        </li>
        <li>To detect abuse and protect other customers.</li>
        <li>To fix defects and improve the Service, using aggregated or de-identified data where possible.</li>
        <li>To comply with law and respond to lawful requests.</li>
      </UL>
    ),
  },
  {
    id: "sharing",
    title: "Who else handles your data",
    body: (
      <>
        <P>
          We use the service providers below. Each receives only what it needs
          for its task, under terms that require it to protect the data.
        </P>
        <DataTable
          head={["Provider", "What it does for us", "Data involved"]}
          rows={[
            ["Supabase", "Database, file storage and sign-in. Hosted in the EU (Frankfurt) region by default.", "Account, content, analytics, recordings, billing records."],
            ["Vercel", "Hosts the website and application.", "Requests, IP addresses, technical logs."],
            ["Razorpay Software Private Limited", "Payment processing for cards, UPI, net banking and wallets.", "Billing name, e-mail, phone, amount and payment details you enter on its checkout."],
            ["Resend", "Sends transactional e-mail such as invoices and alerts.", "Recipient e-mail and the message."],
            ["NVIDIA (NIM) and Google (Gemini API)", "Optional AI analysis of meeting transcripts.", "Transcript text only."],
            ["BigDataCloud", "Turns location coordinates into a place name.", "Coordinates."],
            ["MyMemory (Translated)", "Optional text translation inside the tour builder.", "The text being translated."],
            ["YouTube (Google)", "Plays videos you embed in a tour.", "Standard request data when a video loads."],
          ]}
        />
        <P>
          We may also disclose data to professional advisers, to a successor
          if the business is sold (with notice to you), and to authorities
          where the law requires it. We never sell it.
        </P>
      </>
    ),
  },
  {
    id: "transfers",
    title: "Where data is stored and transferred",
    body: (
      <P>
        Your data is stored mainly in Frankfurt, Germany, and processed on
        global infrastructure operated by the providers above. Because VPV is
        operated from India, this involves transferring data across borders.
        We use providers that apply encryption in transit and access
        controls, and we transfer personal data only to countries and
        providers permitted under Indian law.
      </P>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and local storage",
    body: (
      <P>
        VPV does not set tracking cookies. It uses a small amount of browser
        storage to keep you signed in and to remember settings. The details
        are in our <L href="/cookies">Cookie Policy</L>.
      </P>
    ),
  },
  {
    id: "security",
    title: "How we protect data",
    body: (
      <P>
        Every database table is protected by row-level security so one
        organisation cannot read another’s data. Traffic is encrypted, panorama
        files use signed URLs, sign-in is rate-limited, and active devices are
        capped. Read the full list on the <L href="/security">Security</L>{" "}
        page. No online service can promise perfect security; if we learn of a
        breach that affects you, we will tell you and the authorities as the
        law requires.
      </P>
    ),
  },
  {
    id: "retention",
    title: "How long we keep data",
    body: (
      <DataTable
        head={["Data", "Retention"]}
        rows={[
          ["Account data and organisation content", "While your organisation is active, and for 90 days after cancellation so you can return; then deleted."],
          ["Presentation recordings and transcripts", "Until your organisation deletes them, or 90 days after cancellation."],
          ["Viewer analytics", "24 months."],
          ["Security logs and device sessions", "30 days."],
          ["Billing, invoice and payment records", "As long as Indian tax and accounting law requires (currently up to 8 years)."],
          ["Support and enquiry messages", "24 months after the last message."],
        ]}
      />
    ),
  },
  {
    id: "your-rights",
    title: "Your rights",
    body: (
      <>
        <P>You may ask us to:</P>
        <UL>
          <li>give you a copy of your personal data and a summary of how it is used;</li>
          <li>correct or update data that is wrong or incomplete;</li>
          <li>delete data we no longer need to keep;</li>
          <li>stop processing that relies on your consent, by withdrawing it; and</li>
          <li>nominate someone to exercise your rights if you are unable to.</li>
        </UL>
        <P>
          Write to <Mail to={COMPANY.emails.privacy} />. We may need to verify
          who you are, and we reply within 30 days. For tour content and Viewer analytics, the request should come
          from your organisation’s administrator, because the organisation
          controls that data. If a Viewer contacts us about a tour, we will pass
          the request to the organisation that shared it.
        </P>
      </>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <P>
        VPV is a business product and is not directed at anyone under 18. We
        do not knowingly collect data from children. If you believe we hold
        data about a child, write to us and we will delete it.
      </P>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <P>
        We may update this policy. For material changes we will e-mail the
        administrator on record and show a notice on the sign-in page at least{" "}
        {POLICY.termsChangeNoticeDays} days before they take effect. The
        “Effective” date at the top always shows the current version. Changes
        to prices are covered separately in the{" "}
        <L href="/terms#price-changes">Terms</L>: we give {POLICY.priceChangeNoticeDays}{" "}
        days’ prior notice by e-mail.
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
          grievance officer. We acknowledge complaints within two business days
          and aim to resolve them within 30 days.
        </P>
        <UL>
          <li>
            {COMPANY.grievanceOfficer.role}
            {COMPANY.grievanceOfficer.name ? `: ${COMPANY.grievanceOfficer.name}` : ""},{" "}
            {COMPANY.legalName}
          </li>
          <li>E-mail: <Mail to={COMPANY.grievanceOfficer.email} /></li>
          <li>Security disclosures: <Mail to={COMPANY.emails.security} /></li>
          <li>Everything else: <Mail to={COMPANY.emails.support} /> or the <L href="/contact">Contact</L> page</li>
        </UL>
      </>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      summary="What we collect, why we collect it, who processes it, and how you stay in control — written to match what VPV actually does."
      sections={sections}
    />
  );
}
