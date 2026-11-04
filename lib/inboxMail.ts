/**
 * lib/inboxMail.ts — the pure rules behind the VPV Inbox (support@myvpv.com).
 *
 * No database, no network: reading an address, recognising a ticket number,
 * deciding whether a message is a robot (so we never answer a robot, which is
 * how two auto-replies start an endless loop), turning HTML mail into safe
 * text, counting a reply target in OFFICE hours, and writing the automatic
 * acknowledgement. Everything that touches Supabase or Resend lives in
 * lib/server/inbox*.ts and calls these.
 */

/* ───────────────────────────── addresses ───────────────────────────── */

export type Address = { email: string; name: string };

const EMAIL_RE = /^[^\s@<>"',;:()[\]\\]+@[^\s@<>"',;:()[\]\\]+\.[^\s@<>"',;:()[\]\\]+$/;

/** "Asha Rao <asha@acme.in>", '"Rao, Asha" <asha@acme.in>' or "asha@acme.in". */
export function parseAddress(raw: unknown): Address | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s.length > 500) return null;
  const m = s.match(/^(.*)<([^<>]+)>\s*$/);
  const email = (m ? m[2]! : s).trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return null;
  const name = m ? m[1]!.trim().replace(/^"+|"+$/g, "").trim() : "";
  return { email, name: name.slice(0, 120) };
}

/** True when the address belongs to one of our own domains (never auto-answered). */
export function isOwnAddress(email: string, ownDomains: readonly string[] = ["myvpv.com"]): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return ownDomains.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/* ───────────────────────────── tickets ───────────────────────────── */

export const TICKET_PREFIX = "VPV";

export function ticketLabel(n: number): string {
  return `${TICKET_PREFIX}-${n}`;
}

/** "[VPV-1042]" in a subject line → 1042. */
export function ticketFromSubject(subject: string | null | undefined): number | null {
  const m = String(subject ?? "").match(/\[\s*VPV-(\d{3,12})\s*\]/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) ? n : null;
}

/** The subject without "Re:" / "Fwd:" chains and without our ticket tag. */
export function cleanSubject(subject: string | null | undefined): string {
  let s = String(subject ?? "").replace(/\[\s*VPV-\d{3,12}\s*\]/gi, " ");
  // Strip any run of reply/forward prefixes in a few languages' common forms.
  for (let i = 0; i < 10; i++) {
    const next = s.replace(/^\s*(re|fwd?|aw|sv|vs|ref)\s*:\s*/i, "");
    if (next === s) break;
    s = next;
  }
  s = s.replace(/\s+/g, " ").trim().slice(0, 200);
  return s || "(no subject)";
}

/** What we put on a message to the customer: their subject, our ticket tag. */
export function replySubject(ticketNo: number, subject: string | null | undefined): string {
  return `Re: ${cleanSubject(subject)} [${ticketLabel(ticketNo)}]`;
}

/* ───────────────────────── is it a robot? ───────────────────────── */

const SYSTEM_SENDER = /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|donotreply|mailer[-_.]?daemon|postmaster|bounces?|notifications?|alerts?|auto[-_.]?(reply|response|mail)|daemon)(\b|[-_.+0-9])/i;
const AUTO_SUBJECT = /^\s*(auto(matic)?[- ]?(reply|response)|auto:|out of (the )?office|undeliverable|delivery (status|failure)|mail delivery|returned mail|failure notice)/i;

/**
 * Why this message must NOT be auto-answered, or null when a person sent it.
 *
 * Two auto-responders that answer each other loop forever; answering a mailing
 * list or a bounce sends noise to people who never wrote to us. So anything
 * that looks automatic is stored (a person may still need to read it) but
 * gets no acknowledgement.
 */
export function automatedReason(a: {
  from: string;
  subject?: string | null;
  headers?: Record<string, unknown> | null;
}): string | null {
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(a.headers ?? {})) h[k.toLowerCase()] = String(Array.isArray(v) ? v.join(", ") : v ?? "");

  const autoSub = h["auto-submitted"]?.trim().toLowerCase();
  if (autoSub && autoSub !== "no") return "auto-submitted";
  const prec = h["precedence"]?.trim().toLowerCase();
  if (prec && ["bulk", "junk", "list", "auto_reply"].includes(prec)) return "precedence";
  if ("x-auto-response-suppress" in h) return "auto-response-suppress";
  if ("x-autoreply" in h || "x-autorespond" in h) return "x-autoreply";
  if ("list-id" in h || "list-unsubscribe" in h) return "mailing-list";
  if (h["return-path"]?.replace(/\s/g, "") === "<>") return "null-sender";

  const local = a.from.split("@")[0] ?? "";
  if (SYSTEM_SENDER.test(local)) return "system-sender";
  if (AUTO_SUBJECT.test(String(a.subject ?? ""))) return "auto-subject";
  return null;
}

/* ───────────────────────── text from HTML ───────────────────────── */

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&rsquo;": "’", "&lsquo;": "‘",
  "&rdquo;": "”", "&ldquo;": "“", "&ndash;": "–", "&mdash;": "—", "&hellip;": "…", "&copy;": "©",
};

/**
 * HTML mail → readable plain text. The inbox only ever SHOWS text: mail from
 * the internet is untrusted, so its HTML is never put on the page.
 */
export function htmlToText(html: string | null | undefined): string {
  let t = String(html ?? "").slice(0, 500_000);
  t = t
    .replace(/<(script|style|head|title)[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote|table)\s*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "");
  t = t.replace(/&#(\d{1,6});/g, (_, d: string) => {
    const n = Number(d);
    return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
  });
  t = t.replace(/&[a-z]+;|&#39;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e);
  t = t.replace(/&amp;/gi, "&");
  return t
    .replace(/\r/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Cut a reply into what the person just wrote and the old message under it. */
export function splitQuoted(text: string): { fresh: string; quoted: string } {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const two = `${l} ${lines[i + 1] ?? ""}`;
    const isOn = /^\s*On .{5,250}wrote:\s*$/i.test(l) || (/^\s*On .{5,250}$/i.test(l) && /wrote:\s*$/i.test(two) && !/wrote:/i.test(l));
    const isOrig = /^\s*-{2,}\s*Original Message\s*-{2,}/i.test(l) || /^\s*_{5,}\s*$/.test(l);
    const isFrom = /^\s*From:\s.+/i.test(l) && /^\s*(Sent|Date):/i.test(lines[i + 1] ?? "");
    const isQuote = /^\s*>/.test(l) && /^\s*>/.test(lines[i + 1] ?? "");
    if (isOn || isOrig || isFrom || isQuote) {
      const fresh = lines.slice(0, i).join("\n").trimEnd();
      if (!fresh) return { fresh: String(text ?? "").trim(), quoted: "" };
      return { fresh, quoted: lines.slice(i).join("\n").trim() };
    }
  }
  return { fresh: String(text ?? "").trim(), quoted: "" };
}

/* ───────────────────────── office hours ───────────────────────── */

export type OfficeHours = {
  startHour: number;
  endHour: number;
  /** 0 = Sunday … 6 = Saturday. */
  days: number[];
  /** Minutes east of UTC (India: 330). */
  tzOffsetMin: number;
};

export const DEFAULT_OFFICE: OfficeHours = { startHour: 10, endHour: 18, days: [1, 2, 3, 4, 5, 6], tzOffsetMin: 330 };

const MIN = 60_000;
const DAY = 86_400_000;

/**
 * `from` + `minutes` of WORKING time. A message at 5:30 pm with a 4-hour target
 * is due at 12:30 pm the next working day, not 9:30 pm: the customer is
 * promised only what the team can keep.
 */
export function addWorkingMinutes(from: Date, minutes: number, oh: OfficeHours): Date {
  let remaining = Math.max(0, Math.round(minutes));
  if (!oh.days.length || oh.endHour <= oh.startHour) return new Date(from.getTime() + remaining * MIN);
  const startMin = oh.startHour * 60;
  const endMin = oh.endHour * 60;
  let L = from.getTime() + oh.tzOffsetMin * MIN; // the same instant on the office's wall clock
  for (let i = 0; i < 800; i++) {
    const dayStart = Math.floor(L / DAY) * DAY;
    const dow = new Date(L).getUTCDay();
    const mod = (L - dayStart) / MIN;
    if (!oh.days.includes(dow) || mod >= endMin) {
      L = dayStart + DAY + startMin * MIN;
      continue;
    }
    if (mod < startMin) {
      L = dayStart + startMin * MIN;
      continue;
    }
    const available = endMin - mod;
    if (remaining <= available) {
      L += remaining * MIN;
      return new Date(Math.round(L / MIN) * MIN - oh.tzOffsetMin * MIN);
    }
    remaining -= available;
    L = dayStart + DAY + startMin * MIN;
  }
  return new Date(from.getTime() + minutes * MIN); // unreachable with sane settings
}

/** Round up to the next quarter hour so a promise reads "by 3:30 PM", not "3:27 PM". */
export function roundUpMinutes(d: Date, step = 15): Date {
  const ms = step * MIN;
  return new Date(Math.ceil(d.getTime() / ms) * ms);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function clock(L: number): string {
  const d = new Date(L);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function zoneLabel(tzOffsetMin: number): string {
  if (tzOffsetMin === 330) return "IST";
  const sign = tzOffsetMin < 0 ? "-" : "+";
  const a = Math.abs(tzOffsetMin);
  return `UTC${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

/** "today by 3:30 PM IST", "tomorrow by 11:00 AM IST", or "by Mon 10 Nov, 11:00 AM IST". */
export function etaPhrase(due: Date, now: Date, tzOffsetMin = 330): string {
  const dueL = due.getTime() + tzOffsetMin * MIN;
  const nowL = now.getTime() + tzOffsetMin * MIN;
  const diff = Math.floor(dueL / DAY) - Math.floor(nowL / DAY);
  const zone = zoneLabel(tzOffsetMin);
  if (diff <= 0) return `today by ${clock(dueL)} ${zone}`;
  if (diff === 1) return `tomorrow by ${clock(dueL)} ${zone}`;
  const d = new Date(dueL);
  return `by ${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${clock(dueL)} ${zone}`;
}

/* ───────────────────────── writing the mail ───────────────────────── */

export function escHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Plain text → safe HTML paragraphs, with web addresses made clickable. */
export function textToHtml(text: string): string {
  return String(text ?? "")
    .replace(/\r/g, "")
    .trim()
    .split(/\n{2,}/)
    .map((p) => {
      const safe = escHtml(p).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" style="color:#1468D8">$1</a>');
      return `<p style="margin:0 0 14px">${safe.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}

export type InboxSettings = {
  support_address: string;
  from_name: string;
  ack_enabled: boolean;
  ack_body: string;
  reply_target_hours: number;
  office_start_hour: number;
  office_end_hour: number;
  office_days: number[];
  tz_offset_min: number;
  signature: string;
};

export const DEFAULT_SETTINGS: InboxSettings = {
  support_address: "support@myvpv.com",
  from_name: "VPV Support",
  ack_enabled: true,
  ack_body:
    "Hello {name},\n\nThank you for writing to VPV. We have your message and your reference is {ticket}.\n\nA member of our team will reply {eta}.\n\nIf you want to add something, just reply to this e-mail. It will be added to the same ticket.",
  reply_target_hours: 4,
  office_start_hour: 10,
  office_end_hour: 18,
  office_days: [1, 2, 3, 4, 5, 6],
  tz_offset_min: 330,
  signature: "VPV Support Team\nVirtual Plant Visit\nhttps://myvpv.com",
};

export function officeOf(s: InboxSettings): OfficeHours {
  return { startHour: s.office_start_hour, endHour: s.office_end_hour, days: s.office_days, tzOffsetMin: s.tz_offset_min };
}

/** When a message that arrives `now` is promised an answer. */
export function dueFor(now: Date, s: InboxSettings): Date {
  return roundUpMinutes(addWorkingMinutes(now, s.reply_target_hours * 60, officeOf(s)));
}

/** The automatic acknowledgement: subject, plain text, and a quiet branded HTML twin. */
export function buildAck(
  s: InboxSettings,
  ctx: { name: string; ticketNo: number; subject: string; due: Date; now: Date }
): { subject: string; text: string; html: string } {
  const first = ctx.name.trim().split(/\s+/)[0] || "there";
  const eta = etaPhrase(ctx.due, ctx.now, s.tz_offset_min);
  const body = s.ack_body
    .replace(/\{name\}/g, first)
    .replace(/\{ticket\}/g, ticketLabel(ctx.ticketNo))
    .replace(/\{eta\}/g, eta);
  const text = `${body.trim()}\n\n${s.signature.trim()}`;
  const html =
    `<div style="font-family:Inter,'Segoe UI',Arial,sans-serif;font-size:15px;line-height:24px;color:#1d2733;max-width:560px">` +
    `<div style="height:4px;background:#1468D8;background-image:linear-gradient(120deg,#0B3D91,#1468D8 52%,#19B8F2);border-radius:4px;margin-bottom:18px"></div>` +
    textToHtml(body) +
    `<p style="margin:18px 0 0;color:#526071;font-size:14px">${escHtml(s.signature.trim()).replace(/\n/g, "<br>")}</p>` +
    `<p style="margin:20px 0 0;color:#8a97a8;font-size:12px">This is an automatic acknowledgement. Your reference is ${ticketLabel(ctx.ticketNo)}.</p>` +
    `</div>`;
  return { subject: replySubject(ctx.ticketNo, ctx.subject), text, html };
}

/** "> " in front of every line, newest message quoted under a reply. */
export function quoteForReply(from: string, when: Date, text: string): string {
  const body = String(text ?? "").trim().split("\n").slice(0, 60).join("\n").slice(0, 4000);
  const stamp = `${WEEKDAYS[when.getUTCDay()]}, ${when.getUTCDate()} ${MONTHS[when.getUTCMonth()]} ${when.getUTCFullYear()}`;
  return `On ${stamp}, ${from} wrote:\n${body.split("\n").map((l) => `> ${l}`).join("\n")}`;
}

/** A staff reply, ready to send: text and HTML, signature and quoted history included. */
export function buildReply(args: { text: string; signature: string; quoted?: string }): { text: string; html: string } {
  const sig = args.signature.trim();
  const text = `${args.text.trim()}\n\n${sig}${args.quoted ? `\n\n${args.quoted}` : ""}`;
  const quotedHtml = args.quoted
    ? `<blockquote style="margin:18px 0 0;padding:0 0 0 12px;border-left:3px solid #d5dde8;color:#526071">${textToHtml(
        args.quoted.replace(/^> ?/gm, "")
      )}</blockquote>`
    : "";
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#1d2733">` +
    textToHtml(args.text) +
    `<p style="margin:0;color:#526071">${escHtml(sig).replace(/\n/g, "<br>")}</p>` +
    quotedHtml +
    `</div>`;
  return { text, html };
}
