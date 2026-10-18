/**
 * lib/company.ts — the single source of truth for every legal, contact
 * and pricing fact that the public policy pages quote.
 *
 * Why one file: Razorpay (and any customer's procurement team) reads
 * these pages literally. A price that says one thing on /pricing and
 * another on /terms is a rejection reason, so every page imports the
 * same constants from here. Change a number once, every page follows.
 *
 * ┌─ BEFORE YOU SUBMIT KYC ───────────────────────────────────────────┐
 * │ Fill in the fields marked  ◀ REQUIRED  below. Pages hide a line   │
 * │ whose value is empty, so nothing ever shows as "TBD" — but the    │
 * │ Contact page and footer need the address, and invoices need the   │
 * │ GSTIN, for the site to pass a payment-gateway review.             │
 * └───────────────────────────────────────────────────────────────────┘
 *
 * This file is plain TypeScript with no React / browser imports, so it
 * is safe to import from server components, client components and the
 * static-export script alike.
 */

/* ───────────────────────── Company identity ───────────────────────── */

type CompanyConfig = {
  brand: string;
  productName: string;
  legalName: string;
  entityType: string;
  addressLines: string[];
  gstin: string;
  cin: string;
  /** Our GST state, e.g. "Delhi". Decides CGST+SGST vs IGST on invoices. */
  state: string;
  phone: string;
  phoneHours: string;
  website: string;
  appUrl: string;
  loginUrl: string;
  applyUrl: string;
  jurisdiction: string;
  grievanceOfficer: { name: string; role: string; email: string };
  /**
   * The ONE address VPV is reached on, for everything: support, billing,
   * refunds, legal, privacy, security and the grievance officer.
   *
   * Deliberately a single field rather than a mailbox per purpose. A
   * customer should never have to work out which address their question
   * belongs to, and we should never print an address nobody is reading.
   * Adding a second one means changing this type on purpose, not by
   * accident.
   */
  emails: { support: string };
};

export const COMPANY: CompanyConfig = {
  /** Short brand shown in headings. */
  brand: "VPV",
  /** Full product name. */
  productName: "VPV — Virtual Plant Visit",
  /** Registered / trading name that appears on invoices.   ◀ REQUIRED: confirm exact spelling */
  legalName: "The Next Design",
  /** e.g. "Proprietorship", "Partnership firm", "LLP", "Private Limited Company".   ◀ REQUIRED */
  entityType: "Proprietorship",
  /** Registered office, one entry per line.   ◀ REQUIRED
   *  e.g. ["Plot 12, Sector 5", "New Delhi 110001", "India"] */
  addressLines: [
    "702, Tower 3, Vipul Greens",
    "Sector 48, Sohna Road",
    "Gurgaon, Haryana 122018",
    "India",
  ],
  /** 15-character GST registration number.   ◀ REQUIRED (shown on Contact + invoices) */
  gstin: "06AACPG7019F2Z3",
  /** Only for companies / LLPs (CIN or LLPIN). Optional. */
  cin: "",
  /** The state on your GST registration, spelled as on the certificate,
   *  e.g. "Delhi" or "Maharashtra". Invoices charge CGST+SGST when the
   *  customer is in this state and IGST when they are not, so this must
   *  be right before the first invoice goes out.   ◀ REQUIRED */
  state: "Haryana",
  /** Public support phone, with country code.   ◀ REQUIRED by most gateways */
  phone: "",
  phoneHours: "Monday to Saturday, 10:00 to 18:00 IST",

  website: "https://myvpv.com",
  /** Host that serves the product and these policy pages. */
  // One front door: the site, the app login and the intake form all
  // live on the apex. Customer workspaces are <slug>.myvpv.com.
  appUrl: "https://myvpv.com",
  loginUrl: "https://myvpv.com/login",
  applyUrl: "https://myvpv.com/apply",

  /** Where legal disputes are heard (see Terms › Governing law). */
  jurisdiction: "New Delhi, India",

  /** Named grievance officer — required for Indian data / e-commerce
   *  rules. Leave `name` empty to omit the name until you have one;
   *  the role and e-mail are always shown.   ◀ REQUIRED: add a name */
  grievanceOfficer: {
    name: "Aryan Bansal",
    role: "Grievance Officer",
    // The named officer is a legal requirement; the mailbox is the same
    // single address as everything else.
    email: "support@myvpv.com",
  },

  /** The only address on the site. See the type above. */
  emails: { support: "support@myvpv.com" },
};

/* ───────────────────────────── Pricing ────────────────────────────── */

import { SUPPORT_GRACE_DAYS } from "./pricing";

/**
 * Every rupee amount now lives in lib/pricing.ts — one file, so the
 * price shown on the website, the price charged by Razorpay and the
 * price printed on the invoice can never drift apart.
 *
 * Re-exported here so the policy pages can keep importing money helpers
 * from the same place as the company details.
 */
export {
  GST_RATE,
  GST_LABEL,
  SAC_CODE,
  SCENE_MIN,
  SCENE_MAX,
  SUPPORT_ANNUAL_INR,
  SUPPORT_FREE_MONTHS,
  PRO_MONTHLY_INR,
  ULTRA_MONTHLY_INR,
  priceForScenes,
  pricePerScene,
  inr,
  inr2,
  withGst,
} from "./pricing";

/* ───────────────────────────── Policy terms ───────────────────────── */

export const POLICY = {
  /** Shown as "Effective" on every policy page. Bump on material edits. */
  updated: "18 October 2026",
  /** Prior e-mail notice before a new price applies to an existing customer. */
  priceChangeNoticeDays: 30,
  /** Prior notice before changed Terms / Privacy Policy take effect. */
  termsChangeNoticeDays: 14,
  /** Legacy constant: a request window from the old automatic-refund
   *  policy. Payments are now non-refundable by default (see Refund
   *  Policy); kept only so a request still receives a prompt reply. */
  refundWindowDays: 7,
  /** How long a refund takes to reach the original payment method. */
  refundProcessing: "5 to 7 business days",
  /** Days of renewal pop-ups after the support year ends, before the workspace locks. */
  supportGraceDays: SUPPORT_GRACE_DAYS,
  /** Notice before content is deleted for a lapsed account. */
  deletionNoticeDays: 30,
  /** Retention after cancellation (matches the Privacy Policy). */
  retentionAfterCancelDays: 90,
  /** Time to first reply on support and billing e-mails. */
  replyBusinessDays: 2,
  /** Workspace set-up after payment is confirmed. */
  provisioningHours: 24,
  /** After a plan is paid for, we call to agree the shoot date within this. */
  shootContactBusinessDays: 2,
  /** The finished VPV is in the customer's workspace within this many
   *  working days of the shoot. ◀ CONFIRM: what the team can promise. */
  vpvDeliveryWorkingDays: 10,
  /** Notice the customer gives to move a shoot without losing travel costs. */
  rescheduleNoticeHours: 48,
} as const;

/* ───────────────────────────── Helpers ────────────────────────────── */

/** "The Next Design" or "The Next Design, a Private Limited Company". */
export function companyIdentity(): string {
  return COMPANY.entityType
    ? `${COMPANY.legalName}, a ${COMPANY.entityType.toLowerCase()}`
    : COMPANY.legalName;
}

/** Details a payment-gateway reviewer expects to see that are still blank. */
export function missingLegalDetails(): string[] {
  const missing: string[] = [];
  if (!COMPANY.entityType) missing.push("entityType");
  if (COMPANY.addressLines.length === 0) missing.push("addressLines");
  if (!COMPANY.gstin) missing.push("gstin");
  if (!COMPANY.phone) missing.push("phone");
  if (!COMPANY.grievanceOfficer.name) missing.push("grievanceOfficer.name");
  return missing;
}
