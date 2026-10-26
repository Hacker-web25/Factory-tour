/**
 * lib/server/invoicePdf.ts — the tax invoice as a PDF, the way a buyer's
 * accountant expects to receive it. SERVER ONLY.
 *
 * Why a PDF at all: the invoice e-mail used to put the figures in the
 * message body. An accountant cannot file a message body. They want one
 * attachment they can save, print and hand to an auditor, and it has to
 * still read the same in five years.
 *
 * Why the fonts and logos are imported rather than read from disk: this
 * runs inside a serverless function, where only what the bundler traced
 * is actually shipped. A JSON import is always traced. See
 * scripts/embed-invoice-assets.ts.
 *
 * Layout decisions worth knowing:
 *   · VPV leads the page and The Next Design sits under "Issued by",
 *     because the buyer bought VPV — but the seller of record, with the
 *     GSTIN that makes the buyer's input tax credit work, is The Next
 *     Design, so its name, address, GSTIN and PAN are never small print.
 *   · No bank account or UPI id anywhere. The invoice is already paid,
 *     and an invoice carrying bank details is the single most copied
 *     document in invoice fraud.
 *   · Discounts are printed as their own negative rows. Under GST a
 *     discount is only outside the taxable value if the invoice shows it.
 */

import PDFDocument from "pdfkit";
import { COMPANY } from "@/lib/company";
import { panFromGstin } from "@/lib/gstin";
import { GST_LABEL, inr2, type InvoiceLine } from "@/lib/pricing";
import { amountInWords, invoiceLines, type InvoiceDoc } from "@/lib/billingDocs";
import assets from "@/lib/server/invoiceAssets.json";

/* ───────────────────────────── the look ───────────────────────────── */

const INK = "#0C1017";
const MUTED = "#64748B";
const LINE = "#DCE3EC";
const BRAND = "#1468D8";
const DEEP = "#0B3D91";
const TINT = "#F2F7FE";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 40; // margin
const W = PAGE_W - M * 2; // 515.28 usable
const BOTTOM = PAGE_H - 92; // leave room for the footer

/** Column geometry of the line-items table, left edge → width. */
const COLS = { n: 22, desc: 236, sac: 46, qty: 34, rate: 82, amt: 95 };

const buf = (k: keyof typeof assets): Buffer => Buffer.from(assets[k], "base64");

const dateStr = (d: Date | string | null | undefined): string =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—";

/** Money for a table cell: grouped, two decimals, no symbol (the column header carries ₹). */
const money = (n: number): string => inr2(n).replace("₹", "");

/** Shorten `text` with an ellipsis until it fits `w` at the current font. */
function fit(doc: Doc, text: string, w: number): string {
  if (doc.widthOfString(text) <= w) return text;
  let s = text;
  while (s.length > 1 && doc.widthOfString(`${s}…`) > w) s = s.slice(0, -1);
  return `${s}…`;
}

type Doc = PDFKit.PDFDocument;

/* ─────────────────────────── small helpers ────────────────────────── */

function rule(doc: Doc, y: number, color = LINE, width = 0.8, x = M, w = W): void {
  doc.save().moveTo(x, y).lineTo(x + w, y).lineWidth(width).strokeColor(color).stroke().restore();
}

/** A label above a value, the shape used for every block of facts. */
function label(doc: Doc, text: string, x: number, y: number, w: number): number {
  doc.font("semibold").fontSize(7.5).fillColor(MUTED).text(text.toUpperCase(), x, y, { width: w, characterSpacing: 0.8 });
  return doc.y + 2;
}

/* ──────────────────────────── the sections ────────────────────────── */

/**
 * The masthead: VPV large on the left with its promise, The Next Design
 * on the right as the company that issues the bill.
 */
function header(doc: Doc, d: InvoiceDoc): number {
  const top = M;

  // VPV logo, sized by width so a new logo file cannot stretch it.
  const vpvW = 104;
  doc.image(buf("vpvLogo"), M, top, { width: vpvW });

  // The promise, divided from the logo by a hairline, as on the website.
  const px = M + vpvW + 12;
  doc.save().moveTo(px, top + 2).lineTo(px, top + 27).lineWidth(1).strokeColor(LINE).stroke().restore();
  doc.font("bold").fontSize(8.2).fillColor(DEEP).text("REAL FACTORIES.", px + 9, top + 3, { characterSpacing: 0.3 });
  doc.font("bold").fontSize(8.2).fillColor(DEEP).text("REAL CONFIDENCE.", px + 9, top + 14, { characterSpacing: 0.3 });

  doc.font("semibold").fontSize(9).fillColor(INK).text("VPV — Virtual Plant Visit", M, top + 36);
  doc.font("regular").fontSize(8.5).fillColor(MUTED).text(COMPANY.website.replace(/^https?:\/\//, ""), M, top + 48);

  // ── seller of record, right column ──
  const sx = M + W - 196;
  const tndW = 118;
  doc.image(buf("nextDesignLogo"), M + W - tndW, top, { width: tndW });

  let y = top + 44;
  doc.font("semibold").fontSize(7.5).fillColor(MUTED).text("ISSUED BY", sx, y, { width: 196, align: "right", characterSpacing: 0.8 });
  y = doc.y + 1;
  doc.font("bold").fontSize(9.5).fillColor(INK).text(d.seller.name, sx, y, { width: 196, align: "right" });
  y = doc.y + 1;
  doc.font("regular").fontSize(8).fillColor(MUTED).text(d.seller.addressLines.join("\n"), sx, y, { width: 196, align: "right", lineGap: 1 });
  y = doc.y + 2;
  const pan = panFromGstin(d.seller.gstin);
  const ids = [d.seller.gstin ? `GSTIN ${d.seller.gstin}` : "", pan ? `PAN ${pan}` : ""].filter(Boolean).join("   ·   ");
  if (ids) {
    doc.font("semibold").fontSize(8).fillColor(INK).text(ids, sx, y, { width: 196, align: "right" });
    y = doc.y;
  }
  return Math.max(top + 62, y) + 12;
}

/** "TAX INVOICE" plus the facts table on the right. */
function titleAndMeta(doc: Doc, d: InvoiceDoc, y0: number): number {
  rule(doc, y0, "#CBD5E1", 1.4);
  const top = y0 + 14;

  doc.font("bold").fontSize(26).fillColor(INK).text("TAX INVOICE", M, top, { characterSpacing: -0.4 });
  // GST invoices for a service are marked with who the copy is for.
  doc.font("semibold").fontSize(8).fillColor(MUTED)
    .text("ORIGINAL FOR RECIPIENT", M, top + 34, { characterSpacing: 0.8 });

  // Facts, right: two columns inside a boxed table like the sample.
  const bw = 236;
  const bx = M + W - bw;
  const rows: [string, string][] = [
    ["Invoice No.", d.invoiceNo],
    ["Invoice Date", dateStr(d.issuedAt)],
    ...(d.orderNo ? ([["Order No.", d.orderNo]] as [string, string][]) : []),
    ...(d.orderedAt ? ([["Order Date", dateStr(d.orderedAt)]] as [string, string][]) : []),
    ...(d.paidAt ? ([["Payment Date", dateStr(d.paidAt)]] as [string, string][]) : []),
    ["Payment Method", "Online · Razorpay"],
    ...(d.paymentLabel ? ([["Paid by", d.paymentLabel]] as [string, string][]) : []),
    ["Payment Status", "Paid"],
    ...(d.paymentId ? ([["Transaction ID", d.paymentId]] as [string, string][]) : []),
  ];

  const rh = 15.5;
  const labelW = 84;
  let y = top;
  doc.save().rect(bx, y, bw, rows.length * rh).fillColor("#FFFFFF").fill().restore();
  for (const [k, v] of rows) {
    doc.save().rect(bx, y, labelW, rh).fillColor(TINT).fill().restore();
    doc.font("semibold").fontSize(7.8).fillColor(MUTED).text(k, bx + 7, y + 4.4, { width: labelW - 12 });
    // One line, always: a value that wrapped here would print on top of the
    // row beneath it, and these rows are drawn at fixed heights.
    doc.font(k === "Invoice No." ? "bold" : "regular").fontSize(7.8).fillColor(INK);
    doc.text(fit(doc, v, bw - labelW - 14), bx + labelW + 7, y + 4.4, { width: bw - labelW - 14, lineBreak: false });
    doc.save().rect(bx, y, bw, rh).lineWidth(0.6).strokeColor(LINE).stroke().restore();
    doc.save().moveTo(bx + labelW, y).lineTo(bx + labelW, y + rh).lineWidth(0.6).strokeColor(LINE).stroke().restore();
    y += rh;
  }
  return Math.max(y, top + 48) + 16;
}

/** Who the invoice is for, and where the supply happened. */
function billTo(doc: Doc, d: InvoiceDoc, y0: number): number {
  let y = label(doc, "Bill to", M, y0, 300);
  doc.font("bold").fontSize(11.5).fillColor(INK).text(d.billTo.name, M, y, { width: 300 });
  y = doc.y + 2;

  const lines = [
    d.billTo.address ?? "",
    d.billTo.email,
    d.billToPhone ?? "",
    d.billTo.gstin ? `GSTIN: ${d.billTo.gstin}` : "",
  ].filter(Boolean);
  doc.font("regular").fontSize(8.6).fillColor(MUTED).text(lines.join("\n"), M, y, { width: 300, lineGap: 1.6 });
  const leftBottom = doc.y;

  // Place of supply sits opposite, because it is what decides IGST vs CGST+SGST.
  const bw = 236;
  const bx = M + W - bw;
  let ry = label(doc, "Place of supply", bx, y0, bw);
  doc.font("semibold").fontSize(9.5).fillColor(INK).text(d.placeOfSupply || d.billTo.state || "—", bx, ry, { width: bw });
  ry = doc.y + 6;
  doc.font("regular").fontSize(8).fillColor(MUTED)
    .text(
      d.igst > 0
        ? "Supplied across state lines, so IGST is charged."
        : `Supplied within ${d.seller.state}, so CGST and SGST are charged.`,
      bx,
      ry,
      { width: bw }
    );
  if (!d.billTo.gstin) {
    doc.font("regular").fontSize(7.6).fillColor(MUTED)
      .text("No GSTIN was given for this order, so no input tax credit can be claimed against it.", bx, doc.y + 4, { width: bw });
  }
  return Math.max(leftBottom, doc.y) + 14;
}

/** Table header row. Drawn again at the top of every page the table spills onto. */
function itemsHead(doc: Doc, y: number): number {
  const h = 20;
  doc.save().rect(M, y, W, h).fillColor(DEEP).fill().restore();
  let x = M;
  const cell = (text: string, w: number, align: "left" | "right" | "center") => {
    doc.font("semibold").fontSize(7.6).fillColor("#FFFFFF")
      .text(text, x + 6, y + 6.4, { width: w - 12, align, characterSpacing: 0.5 });
    x += w;
  };
  cell("#", COLS.n, "left");
  cell("DESCRIPTION", COLS.desc, "left");
  cell("SAC", COLS.sac, "left");
  cell("QTY", COLS.qty, "right");
  cell("RATE (₹)", COLS.rate, "right");
  cell("AMOUNT (₹)", COLS.amt, "right");
  return y + h;
}

/** How tall one row will be, so a row is never split across two pages. */
function rowHeight(doc: Doc, l: InvoiceLine): number {
  const titleH = doc.font("semibold").fontSize(9).heightOfString(l.title, { width: COLS.desc - 12 });
  const detailH = l.detail ? doc.font("regular").fontSize(7.6).heightOfString(l.detail, { width: COLS.desc - 12, lineGap: 0.6 }) : 0;
  return Math.max(26, titleH + detailH + (l.detail ? 13 : 11));
}

function itemsRows(doc: Doc, d: InvoiceDoc, y0: number, newPage: () => number): number {
  let y = y0;
  let n = 0;
  for (const l of invoiceLines(d)) {
    const h = rowHeight(doc, l);
    if (y + h > BOTTOM) {
      y = itemsHead(doc, newPage());
    }
    n += 1;
    if (n % 2 === 0) doc.save().rect(M, y, W, h).fillColor("#FAFCFF").fill().restore();

    let x = M;
    doc.font("regular").fontSize(8.4).fillColor(MUTED).text(String(n), x + 6, y + 7, { width: COLS.n - 12 });
    x += COLS.n;

    doc.font("semibold").fontSize(9).fillColor(INK).text(l.title, x + 6, y + 6, { width: COLS.desc - 12 });
    if (l.detail) {
      doc.font("regular").fontSize(7.6).fillColor(MUTED).text(l.detail, x + 6, doc.y + 1.5, { width: COLS.desc - 12, lineGap: 0.6 });
    }
    x += COLS.desc;

    doc.font("regular").fontSize(8).fillColor(MUTED).text(l.amountInr === null ? "—" : d.sac, x + 6, y + 7.4, { width: COLS.sac - 12 });
    x += COLS.sac;

    doc.font("regular").fontSize(8.4).fillColor(INK)
      .text(l.qty == null ? "—" : String(l.qty), x + 6, y + 7.2, { width: COLS.qty - 12, align: "right" });
    x += COLS.qty;

    doc.font("regular").fontSize(8.4).fillColor(l.unitInr == null ? MUTED : INK)
      .text(l.unitInr == null ? "Included" : money(l.unitInr), x + 6, y + 7.2, { width: COLS.rate - 12, align: "right" });
    x += COLS.rate;

    doc.font(l.amountInr === null ? "regular" : "semibold").fontSize(8.6).fillColor(l.amountInr === null ? MUTED : INK)
      .text(l.amountInr === null ? "—" : money(l.amountInr), x + 6, y + 7, { width: COLS.amt - 12, align: "right" });

    y += h;
    rule(doc, y, "#EDF1F6", 0.6);
  }
  return y;
}

/** Amount in words on the left, the tax build-up on the right. */
function totals(doc: Doc, d: InvoiceDoc, y0: number): number {
  const bw = 250;
  const bx = M + W - bw;
  const half = d.gstRatePct / 2;
  const pct = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

  const rows: [string, string, boolean][] = [
    ["Subtotal (taxable value)", money(d.taxable), false],
    ...(d.igst > 0
      ? ([[`IGST @ ${pct(d.gstRatePct)}%`, money(d.igst), false]] as [string, string, boolean][])
      : ([
          [`CGST @ ${pct(half)}%`, money(d.cgst), false],
          [`SGST @ ${pct(half)}%`, money(d.sgst), false],
        ] as [string, string, boolean][])),
    ["Total amount (₹)", money(d.total), true],
  ];

  let y = y0 + 8;
  for (const [k, v, strong] of rows) {
    const h = strong ? 26 : 18;
    if (strong) doc.save().rect(bx, y, bw, h).fillColor(TINT).fill().restore();
    doc.font(strong ? "bold" : "regular").fontSize(strong ? 11 : 8.6).fillColor(strong ? INK : MUTED)
      .text(k, bx + 10, y + (strong ? 7.5 : 4.6), { width: bw - 120 });
    doc.font("bold").fontSize(strong ? 12.5 : 8.8).fillColor(INK)
      .text(v, bx + bw - 112, y + (strong ? 6.6 : 4.4), { width: 102, align: "right" });
    y += h;
    if (!strong) rule(doc, y, "#EDF1F6", 0.6, bx, bw);
  }

  // Words, left — opposite the figures they spell out.
  let wy = label(doc, "Amount in words", M, y0 + 8, 230);
  doc.font("semibold").fontSize(9).fillColor(INK).text(amountInWords(d.total), M, wy, { width: 230, lineGap: 1.4 });
  wy = doc.y + 8;
  doc.font("regular").fontSize(7.6).fillColor(MUTED)
    .text(`All amounts in Indian Rupees. ${GST_LABEL} charged on SAC ${d.sac}.`, M, wy, { width: 230, lineGap: 1 });

  return Math.max(y, doc.y) + 16;
}

/** The thank-you strip and what happens next. */
function closing(doc: Doc, d: InvoiceDoc, y0: number): number {
  let y = y0;

  doc.save().rect(M, y, W, 42).fillColor(TINT).fill().restore();
  doc.save().rect(M, y, 3.5, 42).fillColor(BRAND).fill().restore();
  doc.font("bold").fontSize(11).fillColor(DEEP)
    .text("We're glad you invested in building trust with your buyers.", M + 16, y + 9, { width: W - 32 });
  doc.font("regular").fontSize(8.4).fillColor(MUTED)
    .text("This could be one of the most valuable investments you make in your business.", M + 16, doc.y + 1.5, { width: W - 32 });
  y += 54;

  const colW = (W - 24) / 2;
  let ly = label(doc, "Payment", M, y, colW);
  doc.font("regular").fontSize(8.4).fillColor(INK)
    .text(
      `Paid in full online through Razorpay${d.paymentLabel ? ` (${d.paymentLabel})` : ""}. Nothing further is due on this invoice.` +
        (d.paymentId ? `\nPayment reference: ${d.paymentId}` : ""),
      M,
      ly,
      { width: colW, lineGap: 2 }
    );
  const leftBottom = doc.y;

  const rx = M + colW + 24;
  let ry = label(doc, "What happens next", rx, y, colW);
  const steps = [
    "Your payment is confirmed and your VPV order is booked.",
    "We call you to agree the shoot date for your plant.",
    "Our crew shoots your plant on the agreed day.",
    "Your VPV goes live in your workspace, ready to share with buyers.",
  ];
  doc.font("regular").fontSize(8.4).fillColor(INK);
  for (let i = 0; i < steps.length; i += 1) {
    doc.text(`${i + 1}.  ${steps[i]}`, rx, ry, { width: colW, lineGap: 1.4 });
    ry = doc.y + 3;
  }
  return Math.max(leftBottom, ry) + 10;
}

/** Drawn at the bottom of every page, so a second page is never anonymous. */
function footer(doc: Doc, page: number): void {
  const y = PAGE_H - 62;
  rule(doc, y, LINE, 0.8);
  const bits = [COMPANY.phone, COMPANY.emails.support, "thenextdesign.com", COMPANY.website.replace(/^https?:\/\//, "")]
    .filter(Boolean)
    .join("   |   ");
  doc.font("regular").fontSize(8).fillColor(MUTED).text(bits, M, y + 8, { width: W, align: "center" });
  doc.font("regular").fontSize(7).fillColor("#94A3B8")
    .text(`This is a computer-generated tax invoice and needs no signature.   ·   Page ${page}`, M, y + 21, { width: W, align: "center" });
  // Put the cursor back at the top: every section below positions itself,
  // but PDFKit still decides when to break a page from where it thinks it is.
  doc.x = M;
  doc.y = M;
}

/* ────────────────────────────── the whole ─────────────────────────── */

/**
 * Render one invoice. Returns the finished PDF.
 *
 * `font: ""` on the constructor matters: without it PDFKit loads its
 * built-in Helvetica metrics from a file beside its own source, which a
 * bundled serverless function may not have. We never use Helvetica — the
 * three Inter weights below are the only fonts in the document — so the
 * safest thing is to never ask for it.
 */
export async function renderInvoicePdf(d: InvoiceDoc): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    // Bottom margin 0 because this document is positioned absolutely and
    // paginates itself: with a real bottom margin, PDFKit inserts a page of
    // its own the moment the footer is drawn below it.
    margins: { top: M, bottom: 0, left: M, right: M },
    font: "",
    autoFirstPage: true,
    info: {
      Title: `Tax invoice ${d.invoiceNo}`,
      Author: d.seller.name,
      Subject: `VPV — ${d.description}`.slice(0, 180),
      Creator: "VPV — Virtual Plant Visit",
    },
  });

  doc.registerFont("regular", buf("regular"));
  doc.registerFont("semibold", buf("semibold"));
  doc.registerFont("bold", buf("bold"));
  doc.font("regular");

  let pages = 1;
  footer(doc, pages);
  const newPage = (): number => {
    doc.addPage();
    pages += 1;
    footer(doc, pages);
    return M;
  };

  let y = header(doc, d);
  y = titleAndMeta(doc, d, y);
  y = billTo(doc, d, y);
  y = itemsHead(doc, y);
  y = itemsRows(doc, d, y, newPage);

  // Totals and the closing block belong together; move both rather than
  // leaving a total stranded at the top of a page on its own.
  if (y + 190 > BOTTOM) y = newPage();
  y = totals(doc, d, y);
  if (y + 150 > BOTTOM) y = newPage();
  closing(doc, d, y);

  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

/** "VPV-invoice-VPV-2026-27-0001.pdf" — safe on every operating system. */
export function invoiceFileName(invoiceNo: string): string {
  return `VPV-invoice-${invoiceNo.replace(/[^A-Za-z0-9]+/g, "-")}.pdf`;
}
