/**
 * lib/emailCampaign.ts — what an e-mail campaign knows about each person,
 * the segments worth e-mailing again, and the files that go to and from Zoho.
 *
 * Two sources are joined here, and they never overlap:
 *
 *   • Zoho knows about the e-mail: sent, opened, clicked, bounced,
 *     unsubscribed. VPV does not try to learn that; a tracking pixel is
 *     the mail system's job, and it does it better.
 *   • VPV knows about the website: did they click their personal link, did
 *     the site load, what did they read, how interested are they.
 *
 * Pure, so the segments a follow-up e-mail is sent to are checked in tests,
 * not discovered by someone who got a second e-mail after unsubscribing.
 */

import type { FolderPerson } from "@/lib/campaignFolders";
import { csvCell } from "@/lib/campaignView";
import { STAGE_RANK } from "@/lib/analytics/signals";
import { INTEREST_LABELS, TEMPERATURE_LABELS } from "@/lib/interest";

export const SITE = "https://myvpv.com";

export function personalLink(code: string): string {
  return `${SITE}/q/${code}`;
}

/* ───────────────────────────── the coupon ───────────────────────────── */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** The shared coupon stops exactly `days` days after the e-mail went out. */
export function couponExpiry(sentAt: Date, days: number): Date {
  return new Date(sentAt.getTime() + Math.max(1, Math.round(days)) * DAY_MS);
}

export function formatIst(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** "2 d 4 h left" · "5 h 10 min left" · "Ended". */
export function timeLeft(expiresAt: Date | string | null, now = new Date()): string {
  if (!expiresAt) return "No expiry";
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (Number.isNaN(ms)) return "";
  if (ms <= 0) return "Ended";
  const mins = Math.floor(ms / 60_000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d} d ${h} h left`;
  if (h > 0) return `${h} h ${m} min left`;
  return `${m} min left`;
}

export function discountLabel(c: { percentOff: number | null; amountOffInr: number | null }): string {
  if (c.percentOff != null) return `${c.percentOff}% off`;
  if (c.amountOffInr != null) return `₹${c.amountOffInr.toLocaleString("en-IN")} off`;
  return "";
}

/* ───────────────────────── one row per person ───────────────────────── */

export type ZohoStats = {
  sent: boolean;
  delivered: boolean;
  openedAt: string | null;
  openCount: number;
  clickedAt: string | null;
  clickCount: number;
  bounced: boolean;
  bounceReason: string | null;
  unsubscribed: boolean;
  complained: boolean;
};

export const NO_STATS: ZohoStats = {
  sent: false,
  delivered: false,
  openedAt: null,
  openCount: 0,
  clickedAt: null,
  clickCount: 0,
  bounced: false,
  bounceReason: null,
  unsubscribed: false,
  complained: false,
};

export type Recipient = { code: string; email: string; name: string | null; company: string | null; phone: string | null };

export type EmailPerson = {
  code: string;
  email: string;
  name: string;
  company: string | null;
  phone: string | null;
  link: string;
  zoho: ZohoStats;
  /** Zoho says they opened the e-mail. */
  emailOpened: boolean;
  /** They tapped their personal link (VPV saw it). */
  clicked: boolean;
  /** The website actually loaded for them. */
  visited: boolean;
  /** Hot / warm / cold for people who clicked; null for people who never did. */
  temperature: "hot" | "warm" | "cold" | null;
  interest: string;
  why: string[];
  activeSeconds: number;
  pageViews: number;
  pages: string[];
  stageLabel: string;
  leftDetails: boolean;
  reachedBill: boolean;
  paid: boolean;
  /** A message to this person would break the rules or waste a send. */
  suppressed: boolean;
};

export function mergeEmailPeople(
  recipients: Recipient[],
  stats: Map<string, ZohoStats>,
  roster: FolderPerson[]
): EmailPerson[] {
  const byCode = new Map(roster.map((p) => [p.code, p]));
  return recipients.map((r) => {
    const z = stats.get(r.code) ?? NO_STATS;
    const p = byCode.get(r.code);
    const clicked = !!p?.opened;
    const rank = STAGE_RANK[p?.stage ?? ""] ?? 0;
    return {
      code: r.code,
      email: r.email,
      name: (r.name ?? "").trim() || r.email,
      company: r.company,
      phone: r.phone,
      link: personalLink(r.code),
      zoho: z,
      emailOpened: z.openedAt !== null || z.openCount > 0,
      clicked,
      visited: !!p?.visited,
      temperature: clicked && p ? p.temperature : null,
      interest: p ? INTEREST_LABELS[p.interest] : INTEREST_LABELS.unopened,
      why: p?.interestWhy ?? [],
      activeSeconds: Math.round(p?.activeSeconds ?? 0),
      pageViews: p?.pageViews ?? 0,
      pages: (p?.pages ?? []).map((x) => x.label),
      stageLabel: clicked && p ? p.stageLabel : "",
      leftDetails: !!(p?.contact.phone || p?.contact.email) && p?.contact.source === "form",
      reachedBill: rank >= (STAGE_RANK.billing ?? 99),
      paid: !!p?.paid,
      suppressed: z.bounced || z.unsubscribed || z.complained,
    };
  });
}

/* ───────────────────────────── segments ───────────────────────────── */

export const SEGMENTS = [
  { id: "all", label: "Everyone", help: "The whole list." },
  { id: "hot", label: "Hot", help: "Clicked and showed strong intent: left details, chose a plan, reached the bill. Call today." },
  { id: "warm", label: "Warm", help: "Clicked and engaged: several pages, the demo, the price, questions, or came back." },
  { id: "cold", label: "Cold", help: "Clicked, looked briefly and left." },
  { id: "visited", label: "Visited the website", help: "Their link loaded the website." },
  { id: "clicked_not_visited", label: "Clicked, site never loaded", help: "Tapped the link but the page did not load. Worth a call." },
  { id: "opened_no_click", label: "Opened e-mail, did not click", help: "Zoho says they read it; they never used their link. Send a nudge." },
  { id: "not_opened", label: "Did not open the e-mail", help: "Sent, not opened, not bounced. Resend with a new subject line." },
  { id: "left_details", label: "Left phone or e-mail", help: "Typed their details into the website form." },
  { id: "reached_bill", label: "Reached the bill", help: "Got to payment and did not finish." },
  { id: "paid", label: "Paid", help: "Customers." },
  { id: "bounced", label: "Bounced", help: "The address does not work. Remove from the next send." },
  { id: "unsubscribed", label: "Unsubscribed or spam", help: "Never e-mail these again." },
] as const;
export type SegmentId = (typeof SEGMENTS)[number]["id"];

export function inSegment(p: EmailPerson, id: SegmentId): boolean {
  switch (id) {
    case "all":
      return true;
    case "hot":
      return p.temperature === "hot" && !p.paid;
    case "warm":
      return p.temperature === "warm";
    case "cold":
      return p.temperature === "cold";
    case "visited":
      return p.visited;
    case "clicked_not_visited":
      return p.clicked && !p.visited;
    case "opened_no_click":
      return p.emailOpened && !p.clicked;
    case "not_opened":
      return p.zoho.sent && !p.emailOpened && !p.zoho.bounced;
    case "left_details":
      return p.leftDetails;
    case "reached_bill":
      return p.reachedBill && !p.paid;
    case "paid":
      return p.paid;
    case "bounced":
      return p.zoho.bounced;
    case "unsubscribed":
      return p.zoho.unsubscribed || p.zoho.complained;
  }
}

export function segmentCounts(people: EmailPerson[]): Record<SegmentId, number> {
  const out = {} as Record<SegmentId, number>;
  for (const s of SEGMENTS) out[s.id] = people.filter((p) => inSegment(p, s.id)).length;
  return out;
}

/** Segments that are lists of people to STOP e-mailing: never filtered by suppression. */
const SUPPRESSION_SEGMENTS: SegmentId[] = ["bounced", "unsubscribed"];

/** People a follow-up may be sent to: the segment, minus anyone who bounced or opted out. */
export function followUpList(people: EmailPerson[], id: SegmentId): EmailPerson[] {
  const inSeg = people.filter((p) => inSegment(p, id));
  return SUPPRESSION_SEGMENTS.includes(id) ? inSeg : inSeg.filter((p) => !p.suppressed);
}

/* ─────────────────────────────── files ─────────────────────────────── */

export function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] ?? "", last: "" };
  return { first: parts[0]!, last: parts.slice(1).join(" ") };
}

const BOM = "﻿";
const toCsv = (header: string[], rows: unknown[][]) =>
  BOM + [header.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\r\n") + "\r\n";

/**
 * The file that goes INTO Zoho: one row per person, with their own link.
 * Import it as contacts and map "VPV Link" (and "VPV Code") to custom fields;
 * the e-mail then uses that field as its button.
 */
export function zohoExportCsv(
  people: { email: string; name: string; company: string | null; phone: string | null; code: string }[],
  coupon: { code: string; validUntil: Date | null } | null
): string {
  const header = ["Contact Email", "First Name", "Last Name", "Company", "Phone", "VPV Code", "VPV Link"];
  if (coupon) header.push("Coupon Code", "Coupon Valid Until");
  return toCsv(
    header,
    people.map((p) => {
      const n = splitName(p.name);
      const row: unknown[] = [p.email, n.first, n.last, p.company, p.phone, p.code, personalLink(p.code)];
      if (coupon) row.push(coupon.code, coupon.validUntil ? formatIst(coupon.validUntil) : "");
      return row;
    })
  );
}

/** A follow-up list to import back into Zoho: who they are and what they did on the website. */
export function segmentCsv(people: EmailPerson[]): string {
  return toCsv(
    [
      "Contact Email", "First Name", "Last Name", "Company", "Phone", "VPV Code", "VPV Link",
      "Opened e-mail (Zoho)", "Clicked link", "Website loaded", "Temperature", "Interest",
      "Why", "Pages read", "Time on site (s)", "Got as far as", "Paid",
    ],
    people.map((p) => {
      const n = splitName(p.name);
      return [
        p.email, n.first, n.last, p.company, p.phone, p.code, p.link,
        p.emailOpened ? "Yes" : "No", p.clicked ? "Yes" : "No", p.visited ? "Yes" : "No",
        p.temperature ? TEMPERATURE_LABELS[p.temperature] : "", p.interest,
        p.why.join("; "), p.pages.join("; "), p.activeSeconds, p.stageLabel, p.paid ? "Yes" : "No",
      ];
    })
  );
}

/* ───────────────────────── the e-mail itself ───────────────────────── */

/**
 * A starting point for the urgency e-mail. The double-bracket words are
 * replaced with Zoho's merge fields (or by hand): [[FIRST NAME]] and [[LINK]].
 */
export function emailTemplate(o: {
  couponCode: string | null;
  discount: string;
  validUntil: Date | null;
  limit: number | null;
}): { subject: string; body: string } {
  const until = o.validUntil ? formatIst(o.validUntil).replace(/,/g, "") : "";
  const urgency = o.limit ? `the first ${o.limit} factories` : "a limited number of factories";
  const subject = o.couponCode
    ? `[[FIRST NAME]], ${o.discount} on your factory's virtual tour ends ${o.validUntil ? "soon" : "shortly"}`
    : `[[FIRST NAME]], see your factory as your buyers will`;
  const lines = [
    "Hi [[FIRST NAME]],",
    "",
    "Buyers decide faster when they can walk through your plant, and most of them never get to visit. VPV turns your factory into a 360° tour they can open from any phone.",
    "",
    "See how it works (2 minutes, no sign-up):",
    "[[LINK]]",
  ];
  if (o.couponCode) {
    lines.push(
      "",
      `Use code ${o.couponCode} at checkout for ${o.discount}.`,
      `This offer is for ${urgency}${until ? ` and ends ${until} IST` : ""}.`
    );
  }
  lines.push("", "[[YOUR NAME]]", "VPV — Virtual Plant Visit");
  return { subject, body: lines.join("\n") };
}
