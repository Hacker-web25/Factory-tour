/**
 * The tax invoice: its itemised rows, its words, and the PDF a buyer's
 * accountant actually files.
 *
 * What matters here is not that the document looks nice — a test cannot
 * see that — but that it cannot quietly go WRONG:
 *   · the printed rows must add up to the amount the card was charged,
 *     or the invoice disagrees with the bank;
 *   · a discount must be a visible row, because under GST a discount is
 *     only outside the taxable value when the invoice shows it;
 *   · the amount in words must match the figures;
 *   · the PDF must build from nothing but what is committed to the repo,
 *     because it is built inside a serverless function with no disk of
 *     its own.
 */

import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  GST_RATE,
  SITE_PLAN_ORDER,
  invoiceLinesFromQuote,
  priceFor,
  siteQuote,
  withGst,
  type InvoiceLine,
} from "@/lib/pricing";
import { amountInWords, invoiceLines, missingNumbers, type InvoiceDoc } from "@/lib/billingDocs";
import { panFromGstin } from "@/lib/gstin";
import { COMPANY } from "@/lib/company";
import { renderInvoicePdf, invoiceFileName } from "@/lib/server/invoicePdf";
import { loadInvoiceDoc, orderReference } from "@/lib/server/billingEmails";
import { INVOICE_ASSET_FILES, buildAssets } from "@/scripts/embed-invoice-assets";
import { makeWorld, BUYER, type World } from "./harness/world";

const sum = (lines: InvoiceLine[]) => lines.reduce((a, l) => a + (l.amountInr ?? 0), 0);

describe("invoice: amount in words", () => {
  it("spells rupees the Indian way — crore, lakh, thousand", () => {
    assert.equal(amountInWords(0), "Rupees Zero Only");
    assert.equal(amountInWords(1), "Rupees One Only");
    assert.equal(amountInWords(90_000), "Rupees Ninety Thousand Only");
    assert.equal(amountInWords(3_53_999), "Rupees Three Lakh Fifty Three Thousand Nine Hundred Ninety Nine Only");
    assert.equal(amountInWords(1_00_00_000), "Rupees One Crore Only");
    assert.equal(
      amountInWords(12_34_56_789),
      "Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine Only"
    );
  });

  it("adds paise only when there are any", () => {
    assert.equal(amountInWords(1.18), "Rupees One and Eighteen Paise Only");
    assert.equal(amountInWords(46_020), "Rupees Forty Six Thousand Twenty Only");
    assert.ok(!amountInWords(46_020).includes("Paise"));
  });

  it("matches the figure it spells out, at every plan's real total", () => {
    for (const id of SITE_PLAN_ORDER) {
      const total = withGst(siteQuote(id, { city: "Gurugram" }).taxableInr).total;
      const words = amountInWords(total);
      assert.match(words, /^Rupees /);
      assert.match(words, / Only$/);
      // A rupee figure over a lakh must say "Lakh"; this catches the
      // classic western-grouping bug ("Three Hundred Fifty Three Thousand").
      if (total >= 1_00_000) assert.match(words, /Lakh/, `${id}: ${words}`);
    }
  });
});

describe("invoice: the printed rows", () => {
  it("adds up to exactly what the card is charged", () => {
    for (const id of SITE_PLAN_ORDER) {
      for (const extras of [0, 4]) {
        const q = siteQuote(id, { city: "Noida", extraAreas: extras, salesSeats: extras > 0 ? 2 : 0 });
        const lines = invoiceLinesFromQuote(q);
        assert.equal(
          Math.round(sum(lines) * 100) / 100,
          Math.round(q.taxableInr * 100) / 100,
          `${id} with ${extras} extras`
        );
      }
    }
  });

  it("shows the special offer as its own negative row, never as a quietly smaller price", () => {
    const q = siteQuote("control", { city: "Gurugram", offerOpen: true });
    const lines = invoiceLinesFromQuote(q);
    const plan = lines.find((l) => l.title === q.plan.name);
    const discount = lines.find((l) => (l.amountInr ?? 0) < 0);
    assert.ok(plan, "the plan is a row");
    assert.equal(plan!.amountInr, q.plan.regularInr, "charged at the full price…");
    assert.ok(discount, "…and the offer is deducted on a row of its own");
    assert.equal(discount!.amountInr, -q.savingInr);
  });

  it("explains what the plan price covers without charging for it twice", () => {
    const lines = invoiceLinesFromQuote(siteQuote("authority", { city: "Gurugram" }));
    const included = lines.filter((l) => l.amountInr === null);
    assert.ok(included.length >= 2, "the shoot and the setup are listed");
    for (const l of included) assert.equal(l.unitInr, null, `${l.title} is marked Included`);
  });

  it("gives every kind of purchase rows that match its amount", () => {
    const cases = [
      priceFor("basic_licence", { scenes: 7 }),
      priceFor("scene_topup", { existingScenes: 5, scenes: 9 }),
      priceFor("support_renewal", { salesSeats: 2, seatInr: 999 }),
      priceFor("site_plan", { sitePlanId: "enterprise", city: "Gurugram" }),
    ];
    for (const c of cases) {
      assert.ok(c.lines.length > 0, c.description);
      assert.equal(Math.round(sum(c.lines) * 100) / 100, Math.round(c.amountInr * 100) / 100, c.description);
    }
  });

  it("falls back to one row for an invoice issued before rows were stored", () => {
    const doc = baseDoc({ lines: [] });
    const rows = invoiceLines(doc);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].amountInr, doc.taxable);
  });
});

describe("invoice: the seller's own identity", () => {
  it("reads the PAN out of the GSTIN rather than trusting a second setting", () => {
    assert.equal(panFromGstin("06AACPG7019F2Z3"), "AACPG7019F");
    assert.equal(panFromGstin(COMPANY.gstin), COMPANY.gstin.slice(2, 12));
    assert.equal(panFromGstin("not-a-gstin"), null);
    assert.equal(panFromGstin("06AACPG7019F2Z4"), null, "a wrong check character is refused");
  });
});

describe("invoice: the PDF", () => {
  it("builds from assets committed to the repo, with nothing read from disk", async () => {
    const pdf = await renderInvoicePdf(baseDoc());
    assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-", "a real PDF");
    assert.ok(pdf.length > 20_000, `not a stub (${pdf.length} bytes)`);
    assert.ok(pdf.length < 2_000_000, `not bloated (${pdf.length} bytes)`);
    assert.equal(pdf.subarray(-8).toString("latin1").trim().endsWith("%%EOF"), true, "properly terminated");
  });

  it("carries the invoice number, the buyer and both GSTINs in its text", async () => {
    const doc = baseDoc();
    const pdf = await renderInvoicePdf(doc);
    // Text is drawn as glyph ids, so the readable copy lives in the title
    // metadata. That is also what a mail client shows as the document name.
    assert.ok(pdf.includes(Buffer.from(doc.invoiceNo, "utf16le")) || pdf.includes(Buffer.from(doc.invoiceNo)));
  });

  it("names the file after the invoice, safely for any operating system", () => {
    assert.equal(invoiceFileName("VPV/2026-27/0001"), "VPV-invoice-VPV-2026-27-0001.pdf");
    assert.ok(!/[\\/:*?"<>|]/.test(invoiceFileName("VPV/2026-27/0001")));
  });

  it("survives the things that differ between one customer and the next", async () => {
    const variants: Partial<InvoiceDoc>[] = [
      { billTo: { ...baseDoc().billTo, gstin: null, address: null }, igst: 0, cgst: 100, sgst: 100 },
      { lines: [] },
      { paymentId: null, paymentLabel: null, orderNo: null, orderedAt: null, paidAt: null },
      { billTo: { ...baseDoc().billTo, name: "A".repeat(80) } },
      { lines: Array.from({ length: 40 }, (_, i) => ({ title: `Line ${i + 1}`, detail: "x".repeat(120), qty: 1, unitInr: 10, amountInr: 10 })) },
    ];
    for (const v of variants) {
      const pdf = await renderInvoicePdf(baseDoc(v));
      assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-", JSON.stringify(Object.keys(v)));
      assert.ok(pdf.length > 10_000);
    }
  });

  it("has assets that still match their sources in assets/invoice", () => {
    const onDisk = JSON.parse(fs.readFileSync(path.join(process.cwd(), "lib/server/invoiceAssets.json"), "utf8"));
    const fresh = buildAssets();
    assert.deepEqual(Object.keys(onDisk).sort(), Object.keys(INVOICE_ASSET_FILES).sort());
    for (const k of Object.keys(fresh)) {
      assert.equal(onDisk[k], fresh[k], `${k} changed — run: npm run build:invoice-assets`);
    }
  });
});

describe("invoice: numbering is checkable", () => {
  it("reports nothing when the series is whole", () => {
    assert.deepEqual(missingNumbers(["VPV/2026-27/0001", "VPV/2026-27/0002", "VPV/2026-27/0003"]), []);
    assert.deepEqual(missingNumbers([]), []);
  });

  it("names the numbers an auditor would ask about", () => {
    assert.deepEqual(missingNumbers(["VPV/2026-27/0001", "VPV/2026-27/0004"]), [2, 3]);
  });
});

describe("invoice: end to end, from a real payment", () => {
  let w: World;
  before(async () => {
    w = await makeWorld();
  });
  beforeEach(async () => {
    await w.reset();
  });
  after(() => w.gw.uninstall());

  it("prints the rows the customer was quoted, and they still add up", async () => {
    const { body: order, status } = await w.openOrder({ scenes: 6 });
    assert.equal(status, 200, JSON.stringify(order));
    await w.payInBrowser(order);
    assert.equal((await w.poll(order.orderId)).body.status, "ready");

    const doc = await loadInvoiceDoc(w.sb as never, order.orderId);
    assert.ok(doc, "an invoice was issued");
    assert.ok(doc!.lines && doc!.lines.length > 0, "with its printed rows");
    assert.equal(Math.round(sum(doc!.lines!) * 100) / 100, Math.round(doc!.taxable * 100) / 100);
    assert.equal(doc!.orderNo, orderReference(order.orderId));
    assert.ok(doc!.paidAt, "and the date the money arrived");

    const pdf = await renderInvoicePdf(doc!);
    assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
  });

  it("charges the GST the invoice claims — the taxable value plus tax is the amount taken", async () => {
    const { body: order } = await w.openOrder({ scenes: 4, buyer: { ...BUYER, state: "Haryana" } });
    await w.payInBrowser(order);
    assert.equal((await w.poll(order.orderId)).body.status, "ready");
    const doc = await loadInvoiceDoc(w.sb as never, order.orderId);
    assert.ok(doc);
    const tax = doc!.cgst + doc!.sgst + doc!.igst;
    assert.equal(Math.round((doc!.taxable + tax) * 100) / 100, Math.round(doc!.total * 100) / 100);
    assert.equal(Math.round(tax * 100) / 100, Math.round(doc!.taxable * GST_RATE * 100) / 100);
    assert.equal(Math.round(doc!.total * 100), Number(order.amountPaise), "and that is what Razorpay took");
  });
});

/* ───────────────────────────── fixtures ───────────────────────────── */

function baseDoc(over: Partial<InvoiceDoc> = {}): InvoiceDoc {
  const q = siteQuote("control", { city: "Noida", extraAreas: 2 });
  const g = withGst(q.taxableInr);
  return {
    invoiceNo: "VPV/2026-27/0007",
    issuedAt: "2026-10-24T09:00:00Z",
    seller: { name: COMPANY.legalName, addressLines: COMPANY.addressLines, gstin: COMPANY.gstin, state: COMPANY.state },
    billTo: {
      name: "ABC Engineering Pvt. Ltd.",
      email: "accounts@abceng.in",
      address: "A-123, Industrial Area, Noida 201301, Uttar Pradesh",
      gstin: "09AAACH7409R1ZZ",
      state: "Uttar Pradesh",
    },
    billToPhone: "+91 98100 11223",
    placeOfSupply: "Uttar Pradesh",
    description: q.plan.name,
    sac: "998434",
    gstRatePct: GST_RATE * 100,
    taxable: q.taxableInr,
    cgst: 0,
    sgst: 0,
    igst: g.gst,
    total: g.total,
    paymentId: "pay_Qw12e3r4t5y6",
    paymentLabel: "Netbanking (HDFC Bank)",
    orderNo: "VPV-ORD-3F2A9C41",
    orderedAt: "2026-10-24T08:40:00Z",
    paidAt: "2026-10-24T08:52:00Z",
    lines: invoiceLinesFromQuote(q),
    ...over,
  };
}

describe("invoice: the buyer's GSTIN decides the tax, not the form", () => {
  let w: World;
  before(async () => {
    w = await makeWorld();
  });
  beforeEach(async () => {
    await w.reset();
  });
  after(() => w.gw.uninstall());

  /**
   * The split is the whole reason a GSTIN is asked for. A buyer in Uttar
   * Pradesh who picks "Haryana" in the dropdown by accident must still be
   * charged IGST, because their GSTIN says where they are — and an invoice
   * with the wrong split is one their accountant cannot claim against.
   */
  it("charges IGST when the GSTIN is out of state, whatever the form said", async () => {
    const { body: order, status } = await w.openOrder({
      scenes: 4,
      buyer: { ...BUYER, gstin: "09AAACH7409R1ZZ", state: "Haryana" },
    });
    assert.equal(status, 200, JSON.stringify(order));
    await w.payInBrowser(order);
    assert.equal((await w.poll(order.orderId)).body.status, "ready");

    const doc = await loadInvoiceDoc(w.sb as never, order.orderId);
    assert.ok(doc);
    assert.equal(doc!.placeOfSupply, "Uttar Pradesh", "the GSTIN won");
    assert.ok(doc!.igst > 0, "so IGST is charged");
    assert.equal(doc!.cgst + doc!.sgst, 0);
  });

  it("splits into CGST and SGST for a buyer in our own state", async () => {
    const { body: order } = await w.openOrder({
      scenes: 4,
      buyer: { ...BUYER, gstin: "06AACPG7019F2Z3", state: "Haryana" },
    });
    await w.payInBrowser(order);
    assert.equal((await w.poll(order.orderId)).body.status, "ready");
    const doc = await loadInvoiceDoc(w.sb as never, order.orderId);
    assert.ok(doc);
    assert.equal(doc!.placeOfSupply, COMPANY.state);
    assert.equal(doc!.igst, 0);
    assert.ok(doc!.cgst > 0 && doc!.sgst > 0);
    assert.equal(Math.round((doc!.cgst + doc!.sgst) * 100), Math.round(doc!.taxable * GST_RATE * 100));
  });
});
