/**
 * lib/campaignView.ts — how the campaign pages show a person.
 *
 * Pure and dependency-light, so what the page does with the data (which rows
 * a filter keeps, what the CSV contains, which number a button dials) is
 * tested without a browser.
 *
 * TIMES ARE ALWAYS INDIAN STANDARD TIME. The owner reads these on a laptop
 * that may be anywhere, and "opened at 7:57 pm" must mean the same thing to
 * everyone looking at the same row.
 */

import { INTEREST_LABELS, INTEREST_LEVELS, type Interest } from "@/lib/interest";
import { OUTREACH_LABELS, type FolderPerson, type OutreachState } from "@/lib/campaignFolders";

const IST = "Asia/Kolkata";

const valid = (iso: string | null | undefined): iso is string =>
  !!iso && !Number.isNaN(new Date(iso).getTime());

/** "28 Oct, 7:57 pm". A dash for nothing: an empty cell must read as empty. */
export function istDateTime(iso: string | null | undefined): string {
  if (!valid(iso)) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: IST,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** "28 Oct 2026". */
export function istDay(iso: string | null | undefined): string {
  if (!valid(iso)) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    timeZone: IST,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "7:57 pm". */
export function istClock(iso: string | null | undefined): string {
  if (!valid(iso)) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", {
    timeZone: IST,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Today's date in India, as 2026-10-28: the unit follow-up dates are kept in. */
export function istToday(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return now.toLocaleDateString("en-CA", { timeZone: IST });
}

/** "just now" · "5 min ago" · "3 h ago" · "2 days ago" · "3 weeks ago". */
export function ago(iso: string | null | undefined, now: Date = new Date()): string {
  if (!valid(iso)) return "";
  const secs = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (secs < 0) return "just now";
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

/* ───────────────────────── reaching them ────────────────────────────────── */

/** Digits and a leading plus, nothing else. Null if it cannot be a phone number. */
export function phoneDigits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const plus = raw.trim().startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return (plus ? "+" : "") + digits;
}

/** The link that dials. Null rather than a link to nowhere. */
export function telHref(raw: string | null | undefined): string | null {
  const d = phoneDigits(raw);
  return d ? `tel:${d}` : null;
}

/**
 * The link that opens WhatsApp. A bare ten-digit number is an Indian mobile,
 * as is a leading 0 on eleven; anything with a country code is left alone.
 */
export function whatsappHref(raw: string | null | undefined): string | null {
  const d = phoneDigits(raw);
  if (!d) return null;
  let digits = d.replace("+", "");
  if (!d.startsWith("+")) {
    if (digits.length === 10) digits = `91${digits}`;
    else if (digits.length === 11 && digits.startsWith("0")) digits = `91${digits.slice(1)}`;
  }
  return `https://wa.me/${digits}`;
}

export function mailHref(raw: string | null | undefined): string | null {
  const e = (raw ?? "").trim();
  return e && e.includes("@") && !/[\s<>"',;]/.test(e) ? `mailto:${e}` : null;
}

/* ───────────────────────── the table ────────────────────────────────────── */

/**
 * When they first opened it: the first human scan of the card, or — for
 * somebody who reached the site some other way — the first sign of life.
 * Null means nobody has, and the cell shows a dash.
 */
export function openedAt(p: FolderPerson): string | null {
  return p.firstScanAt ?? p.firstOpenedAt ?? null;
}

export const ROSTER_FILTERS = [
  "all",
  "hot",
  "opened",
  "stuck",
  "unopened",
  "contact",
  "due",
] as const;
export type RosterFilter = (typeof ROSTER_FILTERS)[number];

export const ROSTER_FILTER_LABELS: Record<RosterFilter, string> = {
  all: "Everyone",
  hot: "Call today",
  opened: "Opened",
  stuck: "Opened, site never loaded",
  unopened: "Not opened",
  contact: "Left details",
  due: "Follow-up due",
};

/** Hot or a customer who has not yet been closed out: somebody to ring. */
export function isCallToday(p: FolderPerson): boolean {
  if (p.paid) return false;
  if (p.outreach.state === "won" || p.outreach.state === "declined" || p.outreach.state === "wrong_person") {
    return false;
  }
  return p.interest === "hot";
}

export function matchesFilter(p: FolderPerson, f: RosterFilter, today: string): boolean {
  switch (f) {
    case "all":
      return true;
    case "hot":
      return isCallToday(p);
    case "opened":
      return p.opened;
    case "stuck":
      return p.firstScanAt !== null && !p.visited;
    case "unopened":
      return !p.opened;
    case "contact":
      return !!(p.contact.phone || p.contact.email);
    case "due":
      return !!p.outreach.followUpOn && p.outreach.followUpOn <= today;
  }
}

/** Everything searchable about a person, lower-cased once. */
function haystack(p: FolderPerson): string {
  return [
    p.name,
    p.company,
    p.role,
    p.code,
    p.contact.name,
    p.contact.company,
    p.contact.phone,
    p.contact.email,
    p.city,
    p.printSeq !== null ? String(p.printSeq) : null,
  ]
    .filter((x): x is string => !!x)
    .join(" ")
    .toLowerCase();
}

export function matchesQuery(p: FolderPerson, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const h = haystack(p);
  // Every word must be somewhere: "kapoor food" finds Puneet Kapoor of Food Graphic.
  return q.split(/\s+/).every((w) => h.includes(w));
}

export function filterRoster(
  roster: FolderPerson[],
  filter: RosterFilter,
  query: string,
  today: string
): FolderPerson[] {
  return roster.filter((p) => matchesFilter(p, filter, today) && matchesQuery(p, query));
}

export type RosterSort = "print" | "interest" | "recent" | "name";

export const ROSTER_SORT_LABELS: Record<RosterSort, string> = {
  print: "Print order",
  interest: "Most interested first",
  recent: "Opened most recently",
  name: "Name A–Z",
};

export function sortRoster(roster: FolderPerson[], by: RosterSort): FolderPerson[] {
  const out = [...roster];
  const seq = (p: FolderPerson) => p.printSeq ?? Number.MAX_SAFE_INTEGER;
  const byPrint = (a: FolderPerson, b: FolderPerson) => seq(a) - seq(b) || a.code.localeCompare(b.code);
  switch (by) {
    case "print":
      return out.sort(byPrint);
    case "name":
      return out.sort(
        (a, b) => (a.name ?? "~").localeCompare(b.name ?? "~", "en", { sensitivity: "base" }) || byPrint(a, b)
      );
    case "interest":
      return out.sort((a, b) => b.interestScore - a.interestScore || byPrint(a, b));
    case "recent":
      return out.sort((a, b) => {
        // People who have never opened it go last, in print order.
        const ta = a.lastSeenAt ?? a.lastScanAt;
        const tb = b.lastSeenAt ?? b.lastScanAt;
        if (ta && tb) return new Date(tb).getTime() - new Date(ta).getTime() || byPrint(a, b);
        if (ta) return -1;
        if (tb) return 1;
        return byPrint(a, b);
      });
  }
}

/** How many people are at each interest level, in ladder order. */
export function interestCounts(roster: FolderPerson[]): { level: Interest; label: string; people: number }[] {
  const n = new Map<Interest, number>();
  for (const p of roster) n.set(p.interest, (n.get(p.interest) ?? 0) + 1);
  return INTEREST_LEVELS.map((level) => ({ level, label: INTEREST_LABELS[level], people: n.get(level) ?? 0 }));
}

/* ───────────────────────────── the export ───────────────────────────────── */

const FORMULA_START = /^[=@\t\r]/;
const PLAIN_NUMBER = /^[+-]?[\d\s().-]+$/;

/**
 * One CSV cell. Quoted when it must be, and defanged when a spreadsheet
 * would run it: several of these cells are typed by visitors into a public
 * form, and "=HYPERLINK(…)" as a name must open as text, not as a formula.
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (FORMULA_START.test(s) || (/^[+-]/.test(s) && !PLAIN_NUMBER.test(s))) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const ROSTER_CSV_HEADER = [
  "Print #",
  "Name",
  "Company",
  "Role",
  "Code",
  "Opened (IST)",
  "Last seen (IST)",
  "Visited website",
  "Got as far as",
  "Time on site (s)",
  "Visits",
  "Interest",
  "Why",
  "Phone",
  "Email",
  "Details came from",
  "Follow-up status",
  "Contacted (IST)",
  "Call back on",
  "Notes",
  "Paid",
  "Revenue (INR)",
] as const;

export function rosterCsv(roster: FolderPerson[]): string {
  const rows = roster.map((p) =>
    [
      p.printSeq,
      p.contact.name ?? p.name,
      p.contact.company ?? p.company,
      p.role,
      p.code,
      openedAt(p) ? istDateTime(openedAt(p)) : "",
      p.lastSeenAt ? istDateTime(p.lastSeenAt) : "",
      p.visited ? "Yes" : "No",
      p.opened ? p.stageLabel : "",
      Math.round(p.activeSeconds),
      p.visits,
      INTEREST_LABELS[p.interest],
      p.interestWhy.join("; "),
      p.contact.phone,
      p.contact.email,
      p.contact.source === "form" ? "Website form" : p.contact.source === "manual" ? "Entered by hand" : "",
      OUTREACH_LABELS[p.outreach.state as OutreachState] ?? p.outreach.state,
      p.outreach.contactedAt ? istDateTime(p.outreach.contactedAt) : "",
      p.outreach.followUpOn,
      p.outreach.notes,
      p.paid ? "Yes" : "No",
      p.paid ? p.revenueInr : "",
    ]
      .map(csvCell)
      .join(",")
  );
  // CRLF and a BOM: Excel opens it as UTF-8 with the names intact.
  return "﻿" + [ROSTER_CSV_HEADER.map(csvCell).join(","), ...rows].join("\r\n") + "\r\n";
}
