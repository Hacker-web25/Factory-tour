/**
 * lib/server/hiLetters.ts — the print pack for a batch of personal letters.
 * SERVER ONLY.
 *
 * One ZIP holds everything the printer or the owner's own letter template
 * needs:
 *
 *   links.csv                       name, code and link, one row per person
 *   letters.pdf                     one A4 page per person: name, QR, link
 *   png/007-aryan-kapoor-K7M2XQ.png the QR alone, 1,200 px, for any template
 *   svg/007-aryan-kapoor-K7M2XQ.svg the same, vector, for sharp large prints
 *   README.txt                      what is what, in two lines
 *
 * The pages are drawn with the invoice's embedded fonts (a serverless
 * function ships only what the bundler traced, so a font file read from disk
 * would be missing in production). They cover Latin letters; a name in
 * another script (Devanagari, say) is left off its page rather than printed
 * as empty boxes, and the QR, link and code still print. The PNG and SVG
 * never carry text, so they are unaffected.
 */

import PDFDocument from "pdfkit";
import { strToU8, zipSync, type Zippable } from "fflate";
import assets from "@/lib/server/invoiceAssets.json";
import {
  fileStem,
  letterUrl,
  lettersCsv,
  qrMatrix,
  qrPng,
  qrSvg,
  QUIET,
  type LetterRow,
} from "@/lib/hiPrint";

const INK = "#0C1017";
const MUTED = "#64748B";
const DEEP = "#0B3D91";
const LINE = "#DCE3EC";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 56;

const buf = (k: keyof typeof assets): Buffer => Buffer.from(assets[k], "base64");

/** Letters, digits and ordinary punctuation the embedded fonts can draw. */
const DRAWABLE = /^[ -~ -ɏ‘’“”–—·]*$/;
export const canDraw = (s: string | null | undefined): boolean => !!s && DRAWABLE.test(s);

/** Shorten `text` until it fits `w` at the current font and size. */
function fit(doc: PDFKit.PDFDocument, text: string, w: number): string {
  if (doc.widthOfString(text) <= w) return text;
  let t = text;
  while (t.length > 1 && doc.widthOfString(t + "…") > w) t = t.slice(0, -1);
  return t.trimEnd() + "…";
}

/** The QR as vector squares: crisp at any size, no image to blur. */
function drawQr(doc: PDFKit.PDFDocument, text: string, x: number, y: number, side: number): void {
  const m = qrMatrix(text);
  const total = m.size + QUIET * 2;
  const u = side / total;
  doc.save().rect(x, y, side, side).fill("#FFFFFF");
  doc.fillColor("#000000");
  for (let r = 0; r < m.size; r++) {
    let c = 0;
    while (c < m.size) {
      if (!m.dark(r, c)) {
        c++;
        continue;
      }
      let end = c;
      while (end < m.size && m.dark(r, end)) end++;
      doc.rect(x + (c + QUIET) * u, y + (r + QUIET) * u, (end - c) * u, u).fill();
      c = end;
    }
  }
  doc.restore();
}

function page(doc: PDFKit.PDFDocument, r: LetterRow, origin: string): void {
  const url = letterUrl(r, origin);
  const shown = url.replace(/^https?:\/\//, "");
  const cx = PAGE_W / 2;

  // Brand line, the same one the invoices carry.
  doc.image(buf("vpvLogo"), M, M, { width: 104 });
  doc
    .font("regular")
    .fontSize(9)
    .fillColor(MUTED)
    .text("myvpv.com", M, M + 8, { width: PAGE_W - M * 2, align: "right", lineBreak: false });
  doc.save().moveTo(M, M + 44).lineTo(PAGE_W - M, M + 44).lineWidth(0.75).strokeColor(LINE).stroke().restore();

  // Who it is for. A name in a script the fonts cannot draw is left off.
  let y = 200;
  if (canDraw(r.name)) {
    doc.font("semibold").fontSize(9).fillColor(MUTED).text("PREPARED FOR", M, y, { width: PAGE_W - M * 2, align: "center", characterSpacing: 1.2, lineBreak: false });
    y += 20;
    doc.font("bold").fontSize(28).fillColor(INK);
    doc.text(fit(doc, r.name, PAGE_W - M * 2), M, y, { width: PAGE_W - M * 2, align: "center", lineBreak: false });
    y += 40;
    if (canDraw(r.company)) {
      doc.font("regular").fontSize(14).fillColor(MUTED);
      doc.text(fit(doc, r.company!, PAGE_W - M * 2), M, y, { width: PAGE_W - M * 2, align: "center", lineBreak: false });
    }
  }

  // The QR, centred, large enough to scan from arm's length.
  const side = 230;
  const qy = 300;
  drawQr(doc, url, cx - side / 2, qy, side);

  doc.font("semibold").fontSize(16).fillColor(DEEP);
  doc.text(fit(doc, shown, PAGE_W - M * 2), M, qy + side + 20, { width: PAGE_W - M * 2, align: "center", lineBreak: false });
  doc
    .font("regular")
    .fontSize(11)
    .fillColor(MUTED)
    .text("Point your phone's camera at the square to open your page.", M, qy + side + 46, {
      width: PAGE_W - M * 2,
      align: "center",
      lineBreak: false,
    });

  // Where this sits on the printed stack, so a piece can be found again.
  doc
    .font("regular")
    .fontSize(8)
    .fillColor(MUTED)
    .text(`No. ${r.seq}  ·  ${r.code.toUpperCase()}`, M, PAGE_H - M - 6, { width: PAGE_W - M * 2, align: "center", lineBreak: false });
}

/** All the letters as one PDF, one A4 page per person, in print order. */
export function lettersPdf(rows: LetterRow[], origin = "https://myvpv.com"): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    font: "",
    autoFirstPage: false,
    info: { Title: "Personal letters", Author: "VPV", Creator: "VPV — Virtual Plant Visit" },
  });
  doc.registerFont("regular", buf("regular"));
  doc.registerFont("semibold", buf("semibold"));
  doc.registerFont("bold", buf("bold"));
  for (const r of rows) {
    doc.addPage();
    page(doc, r, origin);
  }
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

const README = (n: number, skipped: number) =>
  [
    `Personal letters: ${n} people.`,
    "",
    "links.csv  - name, code and link for everyone (open in Excel or Google Sheets).",
    "letters.pdf - one A4 page per person, in print order, with their name and QR.",
    "png/ and svg/ - each person's QR on its own, to drop into your own letter.",
    "             File names start with the print number, so they sort in print order.",
    skipped
      ? `\n${skipped} name(s) are written in a script the letter pages cannot draw; their page shows the QR and link only.`
      : "",
    "",
    "Every QR opens myvpv.com/hi/<first name>-<code>: our own domain, with the person's own name.",
    "",
  ].join("\n");

/** The whole pack, ready to send as a download. */
export async function lettersPack(rows: LetterRow[], origin = "https://myvpv.com"): Promise<Uint8Array> {
  // PNGs and the PDF are already compressed; storing them avoids deflating for nothing.
  const stored = { level: 0 } as const;
  const files: Zippable = {};
  let skipped = 0;
  for (const r of rows) {
    const stem = fileStem(r);
    const url = letterUrl(r, origin);
    files[`png/${stem}.png`] = [qrPng(url), stored];
    files[`svg/${stem}.svg`] = strToU8(qrSvg(url));
    if (!canDraw(r.name)) skipped++;
  }
  files["links.csv"] = strToU8(lettersCsv(rows, origin));
  files["letters.pdf"] = [new Uint8Array(await lettersPdf(rows, origin)), stored];
  files["README.txt"] = strToU8(README(rows.length, skipped));
  return zipSync(files);
}
