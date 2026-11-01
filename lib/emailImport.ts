/**
 * lib/emailImport.ts — turn a spreadsheet of e-mail addresses into a clean list.
 *
 * The owner buys or exports a list (Excel, CSV, a tab-separated paste from
 * Google Sheets) with an e-mail column and perhaps a name, company and
 * phone. This file reads those formats, guesses which column is which,
 * and returns people that are safe to make tracked links for: valid
 * addresses, lower-cased, each once.
 *
 * It also reads the reports Zoho exports afterwards (who opened, who
 * clicked, who bounced), which are the same kind of file with an e-mail
 * column in them.
 *
 * Pure and dependency-light (fflate for .xlsx, which is a zip of XML), so the
 * rules are tested without a browser or a database. The browser runs it
 * to show a preview; the server runs the same checks again, because the
 * browser is not trusted.
 */

import { unzipSync, strFromU8 } from "fflate";

export const MAX_EMAIL_PEOPLE = 10_000;

export type Table = {
  headers: string[];
  rows: string[][];
  /** True when the first row of the file was real data, not column names. */
  headerless: boolean;
};

/* ───────────────────────── reading the file ───────────────────────── */

const EMAIL_RE = /^[^\s@,;<>()"']+@[^\s@,;<>()"']+\.[^\s@,;<>()"']{2,}$/;

export function normaliseEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  // "Rahul <rahul@acme.com>" and "mailto:rahul@acme.com" both turn up in exports.
  let s = v.trim().replace(/^mailto:/i, "");
  const angle = /<([^<>\s]+@[^<>\s]+)>/.exec(s);
  if (angle) s = angle[1]!;
  s = s.trim().toLowerCase();
  if (s.length > 254 || s.includes("..") || !EMAIL_RE.test(s)) return null;
  return s;
}

/** Split one delimited text into rows, honouring quotes, doubled quotes and CRLF. */
export function splitDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Comma, semicolon or tab: whichever the first few lines use most. */
export function detectDelimiter(text: string): string {
  const head = text.replace(/^﻿/, "").split(/\r?\n/).slice(0, 5).join("\n");
  const counts: [string, number][] = [",", ";", "\t"].map((d) => [d, head.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]![1] > 0 ? counts[0]![0] : ",";
}

function toTable(raw: string[][]): Table {
  if (!raw.length) return { headers: [], rows: [], headerless: false };
  const width = Math.max(...raw.map((r) => r.length));
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => (r[i] ?? "").trim());
  const padded = raw.map(pad);
  // A first row that already holds an e-mail address is data, not headings.
  const headerless = padded[0]!.some((c) => normaliseEmail(c) !== null);
  if (headerless) {
    return { headers: Array.from({ length: width }, (_, i) => `Column ${columnLetter(i)}`), rows: padded, headerless };
  }
  return { headers: padded[0]!, rows: padded.slice(1), headerless };
}

export function parseDelimited(text: string): Table {
  return toTable(splitDelimited(text, detectDelimiter(text)));
}

export function columnLetter(i: number): string {
  let n = i;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0]?.toUpperCase() ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const XML_ENT: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
function xmlText(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENT[m]!)
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)));
}

/** All the <t> text inside one <si> or <is> element, joined (rich text splits it in runs). */
function runsText(xml: string): string {
  let out = "";
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  for (let m = re.exec(xml); m; m = re.exec(xml)) out += xmlText(m[1]!);
  return out;
}

/**
 * First worksheet of an .xlsx as a table. An .xlsx is a zip: strings live in
 * xl/sharedStrings.xml and cells point at them. Older .xls (the binary format)
 * is not supported; the message says to save it as .xlsx or .csv.
 */
export function parseXlsx(bytes: Uint8Array): Table {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => /^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml|workbook\.xml)$/.test(f.name) });
  } catch {
    throw new Error("That file could not be opened as an Excel (.xlsx) workbook.");
  }
  const sheetNames = Object.keys(files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]));
  if (!sheetNames.length) throw new Error("No worksheet found in that Excel file.");

  const shared: string[] = [];
  if (files["xl/sharedStrings.xml"]) {
    const xml = strFromU8(files["xl/sharedStrings.xml"]!);
    const re = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
    for (let m = re.exec(xml); m; m = re.exec(xml)) shared.push(runsText(m[1]!));
  }

  const xml = strFromU8(files[sheetNames[0]!]!);
  const raw: string[][] = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  for (let r = rowRe.exec(xml); r; r = rowRe.exec(xml)) {
    const cells: string[] = [];
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let next = 0;
    for (let c = cellRe.exec(r[1]!); c; c = cellRe.exec(r[1]!)) {
      const attrs = c[1] ?? "";
      const inner = c[2] ?? "";
      const ref = /\br="([A-Z]+\d+)"/i.exec(attrs)?.[1];
      const at = ref ? columnIndex(ref) : next;
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1])] ?? "";
      else if (type === "inlineStr") value = runsText(inner);
      else value = xmlText(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "");
      while (cells.length < at) cells.push("");
      cells[at] = value;
      next = at + 1;
    }
    raw.push(cells);
  }
  return toTable(raw.filter((row) => row.some((c) => c.trim() !== "")));
}

/** Read an uploaded file by its name: .xlsx, or any delimited text (.csv .tsv .txt). */
export function parseSpreadsheet(fileName: string, bytes: Uint8Array): Table {
  if (/\.xls$/i.test(fileName)) {
    throw new Error("That is an older .xls file. In Excel choose Save As and pick .xlsx or .csv, then upload that.");
  }
  if (/\.xlsx$/i.test(fileName) || (bytes[0] === 0x50 && bytes[1] === 0x4b)) return parseXlsx(bytes);
  return parseDelimited(new TextDecoder("utf-8").decode(bytes));
}

/* ─────────────────────── which column is which ─────────────────────── */

export type ColumnMap = { email: number; name: number; company: number; phone: number };

const RE_EMAIL = /e-?\s?mail|mail\s?id|email\s?address/i;
const RE_NAME = /^(full\s?|contact\s?|person\s?|first\s?)?name$|contact\s?person|^first\s?name|owner|director|proprietor/i;
const RE_COMPANY = /company|organi[sz]ation|firm|business|factory|plant|unit\s?name|^org\b/i;
const RE_PHONE = /phone|mobile|whats\s?app|contact\s?(no|number)|^cell/i;

/** Guess the columns from their headings, and from the data when headings fail. */
export function guessColumns(t: Table): ColumnMap {
  const find = (re: RegExp, not: number[] = []) => t.headers.findIndex((h, i) => !not.includes(i) && re.test(h));
  let email = find(RE_EMAIL);
  if (email < 0 && t.rows.length) {
    // No heading says e-mail: take the column where most cells look like one.
    let best = -1;
    let bestHits = 0;
    t.headers.forEach((_, i) => {
      const hits = t.rows.slice(0, 200).filter((r) => normaliseEmail(r[i]) !== null).length;
      if (hits > bestHits) {
        best = i;
        bestHits = hits;
      }
    });
    email = bestHits > 0 ? best : -1;
  }
  const name = find(RE_NAME, [email]);
  const company = find(RE_COMPANY, [email, name]);
  const phone = find(RE_PHONE, [email, name, company]);
  return { email, name, company, phone };
}

/* ───────────────────────── the clean list ───────────────────────── */

export type Recipient = {
  email: string;
  /** What the person is called in the table: their name, or one made from the address. */
  name: string;
  /** True when no name was given and the name was made from the address. */
  nameFromEmail: boolean;
  company: string | null;
  phone: string | null;
};

export type ImportPlan = {
  recipients: Recipient[];
  /** Cells in the e-mail column that are not an address, with the file row they were on. */
  invalid: { row: number; value: string }[];
  duplicates: number;
  blank: number;
  /** info@, sales@, admin@ …: kept, but shared inboxes rarely read like a person. */
  roleAddresses: number;
  overflow: number;
};

const ROLE_LOCAL = /^(info|sales|admin|support|contact|hello|office|enquiry|enquiries|inquiry|mail|accounts?|hr|marketing|purchase|purchases|export|exports|service|care|help|team|webmaster|noreply|no-reply)$/;

/** "rahul.mehta_89@acme.com" -> "Rahul Mehta". */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const words = local
    .replace(/\d+/g, " ")
    .split(/[._\-+\s]+/)
    .filter((w) => w.length > 0)
    .slice(0, 3);
  if (!words.length) return email.slice(0, 80);
  return words.map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ").slice(0, 80);
}

function cleanPhone(v: string): string | null {
  const digits = v.replace(/\D/g, "");
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  return /^[6-9]\d{9}$/.test(local) ? local : null;
}

export function planRecipients(t: Table, map: ColumnMap, max = MAX_EMAIL_PEOPLE): ImportPlan {
  const plan: ImportPlan = { recipients: [], invalid: [], duplicates: 0, blank: 0, roleAddresses: 0, overflow: 0 };
  if (map.email < 0) return plan;
  const seen = new Set<string>();
  const offset = t.headerless ? 1 : 2; // file row numbers: row 1 is the heading when there is one
  t.rows.forEach((r, idx) => {
    const raw = (r[map.email] ?? "").trim();
    if (!raw) {
      plan.blank += 1;
      return;
    }
    const email = normaliseEmail(raw);
    if (!email) {
      plan.invalid.push({ row: idx + offset, value: raw.slice(0, 80) });
      return;
    }
    if (seen.has(email)) {
      plan.duplicates += 1;
      return;
    }
    if (plan.recipients.length >= max) {
      plan.overflow += 1;
      return;
    }
    seen.add(email);
    if (ROLE_LOCAL.test(email.split("@")[0]!)) plan.roleAddresses += 1;
    const given = map.name >= 0 ? (r[map.name] ?? "").trim().replace(/\s+/g, " ").slice(0, 80) : "";
    plan.recipients.push({
      email,
      name: given || nameFromEmail(email),
      nameFromEmail: !given,
      company: map.company >= 0 ? (r[map.company] ?? "").trim().replace(/\s+/g, " ").slice(0, 80) || null : null,
      phone: map.phone >= 0 ? cleanPhone(r[map.phone] ?? "") : null,
    });
  });
  return plan;
}

/* ───────────────────── what Zoho sends back ───────────────────── */

export const ZOHO_REPORT_KINDS = ["sent", "opened", "clicked", "bounced", "unsubscribed", "complained"] as const;
export type ZohoReportKind = (typeof ZOHO_REPORT_KINDS)[number];

export const ZOHO_KIND_LABELS: Record<ZohoReportKind, string> = {
  sent: "Sent / delivered",
  opened: "Opened",
  clicked: "Clicked",
  bounced: "Bounced",
  unsubscribed: "Unsubscribed",
  complained: "Marked as spam",
};

export type ZohoRow = {
  email: string;
  /** When Zoho says it happened, if the report has a date column; else null. */
  at: string | null;
  /** How many times, if the report has a count column. */
  count: number | null;
};

/** Parse a date cell as Zoho or Excel writes it. Null when it is not a date we can trust. */
export function parseReportDate(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  // Excel serial days (e.g. 45963.5), as a number cell becomes in a re-saved report.
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const ms = Math.round((Number(s) - 25569) * 86_400_000);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  // dd/mm/yyyy [hh:mm] — Indian order, the way Zoho shows it.
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T,]+(\d{1,2}):(\d{2}))?/.exec(s);
  if (dmy) {
    const [, d, m, y, hh, mm] = dmy;
    // Report times are IST (+05:30).
    const ms = Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh ?? 0), Number(mm ?? 0)) - 330 * 60_000;
    return Number.isNaN(ms) ? null : new Date(ms).toISOString();
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** Read a Zoho report: the e-mail column, plus a date and a count when the report has them. */
export function planZohoReport(t: Table): { rows: ZohoRow[]; skipped: number; noEmailColumn: boolean } {
  const map = guessColumns(t);
  if (map.email < 0) return { rows: [], skipped: 0, noEmailColumn: true };
  const dateCol = t.headers.findIndex((h) => /date|time|opened\s?on|clicked\s?on|sent\s?on|\bat\b/i.test(h));
  const countCol = t.headers.findIndex((h) => /count|times|number of (opens|clicks)|opens|clicks/i.test(h));
  const rows: ZohoRow[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const r of t.rows) {
    const email = normaliseEmail(r[map.email] ?? "");
    if (!email) {
      skipped += 1;
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    const n = countCol >= 0 ? Number((r[countCol] ?? "").replace(/[^\d]/g, "")) : NaN;
    rows.push({
      email,
      at: dateCol >= 0 ? parseReportDate(r[dateCol] ?? "") : null,
      count: Number.isFinite(n) && n > 0 ? Math.min(n, 100_000) : null,
    });
  }
  return { rows, skipped, noEmailColumn: false };
}
