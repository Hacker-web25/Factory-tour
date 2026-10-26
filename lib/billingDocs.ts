/**
 * lib/billingDocs.ts — what the customer sees on a tax invoice and on a
 * credit note (the document that goes with every refund).
 *
 * Pure: takes plain data, returns an HTML fragment. No database, no network,
 * so it is tested directly and reused by the e-mails.
 *
 * A GST tax invoice in India must show: the seller's name, address and GSTIN;
 * a unique invoice number and date; the buyer's name (and address, GSTIN when
 * they have one); the description and SAC code of the service; the taxable
 * value; the tax split (CGST + SGST inside the seller's state, IGST outside);
 * the total; and the place of supply. A credit note must show the same, plus
 * the invoice it corrects. Everything here is frozen on the invoice row at the
 * time of sale, so a re-sent invoice always reads the same.
 */

import { esc } from "@/lib/server/email";
import { inr2, type InvoiceLine } from "@/lib/pricing";

export type Party = {
  name: string;
  addressLines: string[];
  gstin: string;
  state: string;
};

export type InvoiceDoc = {
  invoiceNo: string;
  issuedAt: Date | string;
  seller: Party;
  billTo: { name: string; email: string; address: string | null; gstin: string | null; state: string | null };
  placeOfSupply: string | null;
  description: string;
  sac: string;
  gstRatePct: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  /** Razorpay payment id, so the customer can match it to their statement. */
  paymentId: string | null;
  /** "UPI", "Card ending 4242", "Netbanking (HDFC Bank)" … */
  paymentLabel: string | null;

  /* ── Only the printed invoice needs these; the e-mail body ignores
     them, and an invoice issued before they existed simply has none. ── */

  /** Our own order reference, short enough to quote on the phone. */
  orderNo?: string | null;
  orderedAt?: Date | string | null;
  paidAt?: Date | string | null;
  /** The itemised rows. Empty falls back to one row from `description`. */
  lines?: InvoiceLine[];
  /** The buyer's phone, when we have it. */
  billToPhone?: string | null;
};

/* ───────────────────────── amount in words ────────────────────────── */

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

/** 0–99 in words. */
function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  const o = ONES[n % 10];
  return o ? `${t} ${o}` : t;
}

/** 0–999 in words. */
function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const head = h ? `${ONES[h]} Hundred` : "";
  const tail = rest ? twoDigits(rest) : "";
  return head && tail ? `${head} ${tail}` : head || tail;
}

/**
 * A rupee amount in words, Indian style — crore, lakh, thousand — as a
 * tax invoice must carry it. 3,53,999 reads "Rupees Three Lakh Fifty
 * Three Thousand Nine Hundred Ninety Nine Only".
 *
 * Paise are included only when there are any, because "and Zero Paise"
 * on every invoice reads like a machine wrote it.
 */
export function amountInWords(amount: number): string {
  const neg = amount < 0;
  const abs = Math.abs(amount);
  const rupees = Math.floor(Math.round(abs * 100) / 100);
  const paise = Math.round(abs * 100) % 100;

  const say = (n: number): string => {
    if (n === 0) return "Zero";
    const crore = Math.floor(n / 10_000_000);
    const lakh = Math.floor((n % 10_000_000) / 100_000);
    const thousand = Math.floor((n % 100_000) / 1_000);
    const rest = n % 1_000;
    const parts: string[] = [];
    if (crore) parts.push(`${say(crore)} Crore`);
    if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
    if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
    if (rest) parts.push(threeDigits(rest));
    return parts.join(" ");
  };

  const head = `Rupees ${say(rupees)}`;
  const tail = paise > 0 ? ` and ${twoDigits(paise)} Paise` : "";
  return `${neg ? "Minus " : ""}${head}${tail} Only`;
}

/**
 * Which numbers in a "VPV/2026-27/0001" series are missing.
 *
 * A gap is not automatically wrong — a number is allocated before the
 * invoice row is written, so a crash in between leaves one unused — but
 * it is the sort of thing an auditor asks about, and it is far easier to
 * explain in the same month than a year later.
 */
export function missingNumbers(invoiceNos: string[]): number[] {
  const seen = new Set<number>();
  for (const no of invoiceNos) {
    const m = /\/(\d+)$/.exec(no);
    if (m) seen.add(Number(m[1]));
  }
  if (seen.size === 0) return [];
  const highest = Math.max(...seen);
  const out: number[] = [];
  for (let i = 1; i <= highest; i += 1) if (!seen.has(i)) out.push(i);
  return out;
}

/** The rows to print, falling back to one row for an older invoice. */
export function invoiceLines(d: InvoiceDoc): InvoiceLine[] {
  if (d.lines && d.lines.length > 0) return d.lines;
  return [{ title: d.description, detail: null, qty: 1, unitInr: d.taxable, amountInr: d.taxable }];
}

export type CreditNoteDoc = {
  creditNoteNo: string;
  issuedAt: Date | string;
  invoiceNo: string | null;
  invoiceDate: Date | string | null;
  seller: Party;
  billTo: InvoiceDoc["billTo"];
  placeOfSupply: string | null;
  description: string;
  sac: string;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  /** Razorpay refund id: what to quote to a bank if the money is late. */
  refundId: string | null;
};

const dateStr = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

const CELL = "padding:9px 14px;border-bottom:1px solid #e2e8f0;";
const LBL = "color:#64748b;";

function line(label: string, value: string, opts: { strong?: boolean; last?: boolean } = {}): string {
  const b = opts.last ? "padding:10px 14px;" : CELL;
  return `<tr><td style="${b}${LBL}">${esc(label)}</td><td style="${b}text-align:right;${
    opts.strong ? "font-weight:700;color:#0C1017;" : ""
  }">${value}</td></tr>`;
}

function box(rows: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;font-size:14px;color:#334155;margin:0 0 16px;">${rows}</table>`;
}

function partyBlock(title: string, lines: string[]): string {
  const body = lines.filter(Boolean).map((l) => esc(l)).join("<br>");
  return `<td valign="top" width="50%" style="padding:0 8px 0 0;font-size:13px;line-height:1.6;color:#334155;">
    <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;margin-bottom:4px;">${esc(title)}</div>${body}</td>`;
}

function parties(seller: Party, billTo: InvoiceDoc["billTo"]): string {
  const sellerLines = [
    seller.name,
    ...seller.addressLines,
    seller.gstin ? `GSTIN: ${seller.gstin}` : "",
    seller.state ? `State: ${seller.state}` : "",
  ];
  const buyerLines = [
    billTo.name,
    billTo.address ?? "",
    billTo.email,
    billTo.gstin ? `GSTIN: ${billTo.gstin}` : "",
    billTo.state ? `State: ${billTo.state}` : "",
  ];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr>
    ${partyBlock("From", sellerLines)}${partyBlock("Billed to", buyerLines)}</tr></table>`;
}

/** The tax lines: CGST + SGST when both are charged, IGST otherwise. */
function taxLines(d: { cgst: number; sgst: number; igst: number }, ratePct: number | null): string {
  const half = ratePct != null ? ratePct / 2 : null;
  const pct = (v: number | null) => (v == null ? "" : ` @ ${Number.isInteger(v) ? v : v.toFixed(1)}%`);
  if (d.igst > 0) return line(`IGST${pct(ratePct)}`, esc(inr2(d.igst)));
  return line(`CGST${pct(half)}`, esc(inr2(d.cgst))) + line(`SGST${pct(half)}`, esc(inr2(d.sgst)));
}

function testBanner(no: string): string {
  return no.startsWith("TEST")
    ? `<p style="margin:0 0 14px;padding:8px 12px;background:#fef3c7;border-radius:8px;font-size:13px;color:#92400e;">This is a TEST document. No money moved.</p>`
    : "";
}

/**
 * The body of the invoice e-mail.
 *
 * When the PDF is attached this is a covering note, not the invoice: the
 * figures are repeated so the customer can check them at a glance on a
 * phone, and the attachment is what they forward to their accountant.
 * When the PDF could not be built the same body still carries everything
 * a tax invoice must show, so nobody is left without one.
 */
export function invoiceBodyHtml(
  d: InvoiceDoc,
  greetingName: string,
  supportEmail: string,
  attached = false
): string {
  const P = 'style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;"';
  const SMALL = 'style="margin:14px 0 0;font-size:12.5px;line-height:1.6;color:#64748b;"';
  const note = attached
    ? `<p ${P}>Your tax invoice <strong>${esc(d.invoiceNo)}</strong> is attached to this e-mail as a PDF.
         Please keep it for your records, and forward it to whoever handles your accounts.</p>`
    : "";
  const credit = d.billTo.gstin
    ? `<p ${SMALL}>This invoice shows your GSTIN <strong>${esc(d.billTo.gstin)}</strong>, the place of supply and our SAC,
         so your business can claim the ${esc(String(d.gstRatePct))}% GST shown above as input tax credit once we file our return for this month.</p>`
    : `<p ${SMALL}>No GSTIN was recorded for this order, so the GST on it cannot be claimed back.
         If your business is GST-registered, reply to this e-mail with your GSTIN and we will reissue the invoice.</p>`;

  return `${testBanner(d.invoiceNo)}
    <p ${P}>Hello ${esc(greetingName)}, thank you for your payment.</p>
    ${note}
    ${box(
      line("Tax invoice no.", `<strong style="color:#0C1017;">${esc(d.invoiceNo)}</strong>`) +
        line("Invoice date", esc(dateStr(d.issuedAt))) +
        (d.placeOfSupply ? line("Place of supply", esc(d.placeOfSupply)) : "") +
        (d.paymentId ? line("Payment reference", `<span style="font-family:ui-monospace,Menlo,monospace;">${esc(d.paymentId)}</span>`) : "") +
        (d.paymentLabel ? line("Paid by", esc(d.paymentLabel), { last: true }) : "")
    )}
    ${parties(d.seller, d.billTo)}
    ${box(
      line("Description", esc(d.description)) +
        line("SAC (service code)", esc(d.sac)) +
        line("Taxable value", esc(inr2(d.taxable))) +
        taxLines(d, d.gstRatePct) +
        line("Total paid", `<strong style="font-size:16px;color:#0C1017;">${esc(inr2(d.total))}</strong>`, { last: true })
    )}
    ${credit}
    <p ${SMALL}>Need the bill-to details or GSTIN corrected? Reply to this e-mail quoting the invoice number, or write to
      <a href="mailto:${esc(supportEmail)}" style="color:#1468D8;">${esc(supportEmail)}</a>. We correct an invoice with a
      credit note and a fresh one, so please tell us before your accountant files the month.</p>`;
}

/** The body of the refund e-mail: what was refunded, the credit note, and where the money is. */
export function creditNoteBodyHtml(
  d: CreditNoteDoc,
  opts: { greetingName: string; fullyRefunded: boolean; closes: string; processing: string; supportEmail: string }
): string {
  const P = 'style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;"';
  const SMALL = 'style="margin:14px 0 0;font-size:12.5px;line-height:1.6;color:#64748b;"';
  return `${testBanner(d.creditNoteNo)}
    <p ${P}>Hello ${esc(opts.greetingName)}, we have refunded <strong>${esc(inr2(d.total))}</strong> to the payment
      method you paid with.${esc(opts.closes)}</p>
    ${box(
      line("Where the money is", "Released to your bank by our payment provider, Razorpay", { strong: true }) +
        line("When you will see it", esc(opts.processing)) +
        (d.refundId
          ? line("Refund reference", `<span style="font-family:ui-monospace,Menlo,monospace;">${esc(d.refundId)}</span>`, { last: true })
          : "")
    )}
    <p ${P}>It does not come back as a new payment. It appears on your statement as a credit from the same source you paid with
      (your card, your UPI account or your bank). If it has not appeared after ${esc(opts.processing)}, ask your bank to check
      for an incoming refund from <strong>Razorpay</strong> quoting the reference above, then write to us and we will chase it from our side.</p>
    <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;margin:20px 0 6px;">Credit note</div>
    ${box(
      line("Credit note no.", `<strong style="color:#0C1017;">${esc(d.creditNoteNo)}</strong>`) +
        line("Credit note date", esc(dateStr(d.issuedAt))) +
        (d.invoiceNo
          ? line("Against invoice", esc(d.invoiceNo) + (d.invoiceDate ? ` (${esc(dateStr(d.invoiceDate))})` : ""), { last: true })
          : "")
    )}
    ${parties(d.seller, d.billTo)}
    ${box(
      line("Description", esc(d.description)) +
        line("SAC (service code)", esc(d.sac)) +
        line("Taxable value refunded", esc(inr2(d.taxable))) +
        taxLines(d, null) +
        line("Total refunded", `<strong style="font-size:16px;color:#0C1017;">${esc(inr2(d.total))}</strong>`, { last: true })
    )}
    <p ${SMALL}>This credit note reduces the tax invoice named above by the amount shown. Questions? Write to
      <a href="mailto:${esc(opts.supportEmail)}" style="color:#1468D8;">${esc(opts.supportEmail)}</a>.</p>`;
}
