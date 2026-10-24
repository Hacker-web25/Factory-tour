import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { makeWorld, BUYER, type World } from "./harness/world";
import { COMPANY } from "@/lib/company";
import { creditNoteBodyHtml, invoiceBodyHtml, type CreditNoteDoc, type InvoiceDoc } from "@/lib/billingDocs";

/**
 * What the customer actually receives: a GST tax invoice with every required
 * particular after paying, and a credit note with a traceable refund reference
 * after a refund. And the safety net for a refund that does not land.
 */

const SELLER = { name: "The Next Design", addressLines: ["1 Road", "Gurgaon"], gstin: "06AACPG7019F2Z3", state: "Haryana" };
const INV: InvoiceDoc = {
  invoiceNo: "VPV/2026-27/0001",
  issuedAt: "2026-10-24T05:00:00Z",
  seller: SELLER,
  billTo: { name: "Asha Rao", email: "asha@acme.in", address: "12 Industrial Area", gstin: "07AAAAA0000A1Z5", state: "Delhi" },
  placeOfSupply: "Delhi",
  description: "VPV Confidence plan",
  sac: "998434",
  gstRatePct: 18,
  taxable: 35000,
  cgst: 0,
  sgst: 0,
  igst: 6300,
  total: 41300,
  paymentId: "pay_ABC123",
  paymentLabel: "UPI",
};

describe("the documents, as plain rendering", () => {
  it("a tax invoice carries every particular the GST rules ask for", () => {
    const h = invoiceBodyHtml(INV, "Asha", "support@myvpv.com");
    for (const need of [
      "The Next Design", "06AACPG7019F2Z3", "VPV/2026-27/0001", "24 October 2026", "Asha Rao",
      "07AAAAA0000A1Z5", "Place of supply", "Delhi", "998434", "35,000.00", "6,300.00", "41,300.00", "pay_ABC123", "UPI",
    ]) assert.ok(h.includes(need), `missing: ${need}`);
  });

  it("charges IGST OR CGST+SGST, never a mixture", () => {
    const igst = invoiceBodyHtml(INV, "A", "s@x.in");
    assert.ok(igst.includes("IGST @ 18%"));
    assert.ok(!igst.includes("CGST"));
    const local = invoiceBodyHtml({ ...INV, igst: 0, cgst: 3150, sgst: 3150, placeOfSupply: "Haryana" }, "A", "s@x.in");
    assert.ok(local.includes("CGST @ 9%") && local.includes("SGST @ 9%"));
    assert.ok(!local.includes("IGST"));
  });

  it("never lets a customer's text become markup", () => {
    const h = invoiceBodyHtml(
      { ...INV, billTo: { ...INV.billTo, name: `<script>alert(1)</script>`, address: `"><img src=x onerror=1>` } },
      `<b>x</b>`, "s@x.in"
    );
    assert.ok(!h.includes("<script>") && !h.includes("<img") && !h.includes("<b>x"));
  });

  it("a test invoice says so", () => {
    assert.ok(invoiceBodyHtml({ ...INV, invoiceNo: "TEST/2026-27/0001" }, "A", "s@x.in").includes("TEST document"));
    assert.ok(!invoiceBodyHtml(INV, "A", "s@x.in").includes("TEST document"));
  });

  it("a credit note names its invoice, its refund reference and the timeline", () => {
    const cn: CreditNoteDoc = {
      creditNoteNo: "VPV/CN/2026-27/0001", issuedAt: "2026-10-25T05:00:00Z", invoiceNo: INV.invoiceNo, invoiceDate: INV.issuedAt,
      seller: SELLER, billTo: INV.billTo, placeOfSupply: "Delhi", description: INV.description, sac: "998434",
      taxable: 35000, cgst: 0, sgst: 0, igst: 6300, total: 41300, refundId: "rfnd_XYZ789",
    };
    const h = creditNoteBodyHtml(cn, { greetingName: "Asha", fullyRefunded: true, closes: "", processing: "5 to 7 business days", supportEmail: "s@x.in" });
    for (const need of ["VPV/CN/2026-27/0001", "VPV/2026-27/0001", "rfnd_XYZ789", "5 to 7 business days", "Razorpay", "41,300.00", "IGST"]) {
      assert.ok(h.includes(need), `missing: ${need}`);
    }
    // a chargeback has no refund reference to quote
    assert.ok(!creditNoteBodyHtml({ ...cn, refundId: null }, { greetingName: "A", fullyRefunded: true, closes: "", processing: "x", supportEmail: "s@x.in" }).includes("Refund reference"));
  });
});

describe("the documents, end to end", () => {
  let w: World;
  before(async () => { w = await makeWorld(); });
  beforeEach(async () => { await w.reset(); w.sb.clearFailures(); });
  after(() => w.gw.uninstall());

  async function buy(buyer: Partial<typeof BUYER> = {}) {
    const { body: order } = await w.openOrder({ scenes: 5, buyer });
    assert.ok(order.orderId, JSON.stringify(order));
    const paid = await w.payInBrowser(order);
    assert.equal((await w.poll(order.orderId)).body.status, "ready");
    return { order, payment: paid.payment };
  }
  const invoiceMail = (email = BUYER.email) => w.gw.emailsTo(email).find((m) => /invoice/i.test(m.subject));
  const refundMails = (email = BUYER.email) => w.gw.emailsTo(email).filter((m) => /refund/i.test(m.subject));

  it("after paying, the customer gets a full tax invoice (local buyer: CGST + SGST)", async () => {
    const { payment } = await buy();
    const m = invoiceMail();
    assert.ok(m, "an invoice e-mail was sent");
    const [inv] = await w.q(`select * from public.billing_invoices`);
    for (const need of [
      COMPANY.legalName, COMPANY.gstin, inv.invoice_no, BUYER.name, BUYER.address, "998434", payment.id, "CGST", "SGST", "Place of supply",
    ]) assert.ok(m!.html.includes(need), `invoice e-mail is missing: ${need}`);
    assert.ok(!m!.html.includes("IGST"));
  });

  it("a buyer in another state gets IGST", async () => {
    await buy({ state: "Maharashtra" });
    const m = invoiceMail();
    assert.ok(m!.html.includes("IGST") && !m!.html.includes("CGST"));
  });

  it("a refund e-mail carries the credit note, the invoice it corrects and the refund reference", async () => {
    const { payment } = await buy();
    const refund = w.gw.makeRefund(payment.id, payment.amount);
    await w.deliver(w.gw.refundEvent("refund.processed", refund));
    const [cn] = await w.q(`select * from public.billing_credit_notes`);
    const [inv] = await w.q(`select * from public.billing_invoices`);
    const [m] = refundMails();
    assert.ok(m, "refund e-mail sent");
    for (const need of [cn.credit_note_no, inv.invoice_no, refund.id, "5 to 7 business days", "Razorpay"]) {
      assert.ok(m.html.includes(need), `refund e-mail is missing: ${need}`);
    }
  });

  it("a partial refund shows only what was refunded, and the workspace stays", async () => {
    const { payment } = await buy();
    const half = Math.floor(payment.amount / 2);
    const refund = w.gw.makeRefund(payment.id, half);
    await w.deliver(w.gw.refundEvent("refund.processed", refund));
    const [cn] = await w.q(`select * from public.billing_credit_notes`);
    assert.equal(Number(cn.total_paise), half);
    assert.equal((await w.q(`select plan_status from public.organizations limit 1`))[0].plan_status, "active");
    assert.equal(refundMails().length, 1);
  });

  describe("a refund that is slow to land", () => {
    const setup = async () => {
      const { payment } = await buy();
      const refund = w.gw.makeRefund(payment.id, payment.amount);
      refund.status = "pending";
      await w.deliver(w.gw.refundEvent("refund.created", refund));
      // old enough that the 48-hour sweep no longer sees it: only the pending-refund check can
      w.gw.age(refund.id, 3 * 86400);
      return refund;
    };
    const backdate = (days: number) =>
      w.q(`update public.billing_refunds set created_at = now() - interval '${days} days'`);
    const alerts = () => w.q(`select * from public.billing_alerts where kind = 'refund_stuck'`);

    it("if Razorpay has finished it but we never heard, the nightly check completes it", async () => {
      const refund = await setup();
      await backdate(1);
      assert.equal(refundMails().length, 0);
      refund.status = "processed"; // the "processed" message never reached us
      await w.reconcile();
      assert.equal(await w.count("billing_credit_notes"), 1);
      assert.equal(refundMails().length, 1);
      assert.equal((await alerts()).length, 0);
    });

    it("still pending after a day: nothing is said yet", async () => {
      await setup();
      await backdate(1);
      await w.reconcile();
      assert.equal((await alerts()).length, 0);
      assert.equal(await w.count("billing_credit_notes"), 0);
    });

    it("still pending after 10 days: the founders are told, once", async () => {
      await setup();
      await backdate(11);
      await w.reconcile();
      await w.reconcile();
      const a = await alerts();
      assert.equal(a.length, 1);
      assert.equal(a[0].severity, "critical");
      assert.ok(String(a[0].detail).includes("pending at Razorpay"));
      assert.ok(w.gw.emailsTo(COMPANY.emails.support).some((m) => /refund_stuck/.test(m.subject)));
    });

    it("a failed refund is reported, never silently dropped", async () => {
      const refund = await setup();
      await backdate(1);
      refund.status = "failed";
      await w.reconcile();
      assert.equal((await w.q(`select * from public.billing_alerts where kind = 'refund_failed'`)).length, 1);
    });
  });
});
