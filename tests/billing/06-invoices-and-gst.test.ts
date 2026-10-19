import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { makeWorld, BUYER, freshIp, type World } from "./harness/world";
import { gstinCheckChar, validGstin, stateFromGstin } from "@/lib/gstin";
import { COMPANY } from "@/lib/company";
import { canonicalIndianState } from "@/lib/indianStates";
import {
  GST_RATE,
  SCENE_MAX,
  SCENE_MIN,
  SUPPORT_ANNUAL_INR,
  pricePerScene,
  priceForScenes,
  withGst,
  toPaise,
} from "@/lib/pricing";

const withCheck = (first14: string) => first14 + gstinCheckChar(first14);
/** Well-formed GSTINs with correct check characters. */
const GSTIN_MH = "27AAPFU0939F1ZV"; // Maharashtra (a published sample)
const GSTIN_HR = withCheck("06AAACA1234A1Z");

/**
 * What the customer is charged and what the tax invoice says. A GST invoice
 * that is wrong is a legal problem, so this checks the maths on every price
 * on the ladder, both tax splits, numbering, and that issued documents can
 * no longer be edited.
 */
describe("prices, GST invoices and credit notes", () => {
  let w: World;
  before(async () => {
    w = await makeWorld();
  });
  beforeEach(async () => {
    await w.reset();
    w.sb.clearFailures();
  });
  after(() => w.gw.uninstall());

  let n = 0;
  const uniqueBuyer = (extra: Partial<typeof BUYER> = {}) => {
    n += 1;
    return { email: `buyer${n}@firm${n}-works.in`, company: `Firm ${n} Works`, ...extra };
  };

  async function buy(scenes: number, buyer: Partial<typeof BUYER> = {}) {
    const b = uniqueBuyer(buyer);
    const { body: order, status } = await w.openOrder({ scenes, buyer: b });
    assert.equal(status, 200, JSON.stringify(order));
    const paid = await w.payInBrowser(order);
    assert.equal((await w.poll(order.orderId)).body.status, "ready", JSON.stringify(paid.body));
    const [inv] = await w.q(`select * from public.billing_invoices where order_id = $1`, [order.orderId]);
    return { order, payment: paid.payment, invoice: inv, buyer: b };
  }

  const num = (v: unknown) => Number(v);

  /* ─────────────────────────────── the price ladder ─────────────────────────────── */

  describe("price ladder", () => {
    it("the more scenes, the higher the total — and the lower the price per scene", () => {
      let prevTotal = 0;
      let prevPer = Infinity;
      for (let k = SCENE_MIN; k <= SCENE_MAX; k++) {
        const total = priceForScenes(k);
        assert.ok(Number.isInteger(total), `whole rupees at ${k}`);
        assert.ok(total > prevTotal, `total rises at ${k}`);
        const per = pricePerScene(k);
        assert.ok(per <= prevPer, `price per scene never rises at ${k} (${per} vs ${prevPer})`);
        prevTotal = total;
        prevPer = per;
      }
    });

    it("known points on the ladder", () => {
      assert.equal(priceForScenes(2), 9_000);
      assert.equal(priceForScenes(5), 19_500);
      assert.equal(priceForScenes(10), 33_750);
      assert.equal(priceForScenes(15), 45_000);
      assert.equal(priceForScenes(20), 54_995);
    });

    it("the server charges exactly the ladder price for EVERY scene count", async () => {
      for (let k = SCENE_MIN; k <= SCENE_MAX; k++) {
        const r = await w.openOrder({ scenes: k, buyer: uniqueBuyer() });
        assert.equal(r.status, 200, `scenes=${k}: ${JSON.stringify(r.body)}`);
        assert.equal(r.body.amountPaise, toPaise(withGst(priceForScenes(k)).total), `scenes=${k}`);
        assert.equal(w.gw.orders.get(r.body.razorpayOrderId)!.amount, toPaise(withGst(priceForScenes(k)).total));
      }
    });

    it("support is ₹999 a month, billed yearly as ₹11,988 + 18% GST, and a renewal is charged ₹14,145.84", async () => {
      assert.equal(SUPPORT_ANNUAL_INR, 11_988);
      const o = await w.seedOrg({ name: "Ren Co", slug: "ren-co", quota: 5, supportUntil: new Date(Date.now() + 5 * 86_400_000).toISOString() });
      const uid = await w.seedUser({ email: "admin@ren-co.in", orgId: o.id });
      const res = await w.routes.order.POST(w.request("/api/billing/order", { as: uid, body: { purpose: "support_renewal", buyer: {} } }));
      const body = await w.readJson(res);
      assert.equal(res.status, 200, JSON.stringify(body));
      assert.equal(body.amountPaise, toPaise(withGst(SUPPORT_ANNUAL_INR).total));
    });
  });

  /* ─────────────────────────────── CGST+SGST vs IGST ─────────────────────────────── */

  describe("tax split", () => {
    it("our own state and GSTIN are consistent (otherwise every CGST/SGST decision is wrong)", () => {
      assert.ok(validGstin(COMPANY.gstin), "company GSTIN has a valid check character");
      assert.equal(canonicalIndianState(COMPANY.state), COMPANY.state, "company state is spelled exactly like the list");
      assert.equal(stateFromGstin(COMPANY.gstin), COMPANY.state, "the GSTIN's state code matches the state we invoice from");
    });

    it("same state as us (Haryana): CGST + SGST, never IGST — for every price on the ladder", async () => {
      for (let k = SCENE_MIN; k <= SCENE_MAX; k++) {
        const { invoice: inv } = await buy(k, { state: "Haryana" });
        const total = num(inv.total_paise);
        assert.equal(total, toPaise(withGst(priceForScenes(k)).total), `total at ${k}`);
        assert.equal(num(inv.igst_paise), 0);
        assert.equal(num(inv.taxable_paise) + num(inv.cgst_paise) + num(inv.sgst_paise), total, `adds up at ${k}`);
        assert.ok(Math.abs(num(inv.cgst_paise) - num(inv.sgst_paise)) <= 1, "halves differ by at most a paisa");
        assert.ok(Math.abs(num(inv.taxable_paise) * (1 + GST_RATE) - total) <= 1, `taxable is total ÷ 1.18 at ${k}`);
        assert.equal(inv.place_of_supply, "Haryana");
      }
    });

    it("a different state: IGST only, never CGST/SGST — for every price on the ladder", async () => {
      for (let k = SCENE_MIN; k <= SCENE_MAX; k++) {
        const { invoice: inv } = await buy(k, { state: "Maharashtra" });
        const total = num(inv.total_paise);
        assert.equal(num(inv.cgst_paise), 0);
        assert.equal(num(inv.sgst_paise), 0);
        assert.equal(num(inv.taxable_paise) + num(inv.igst_paise), total, `adds up at ${k}`);
        assert.ok(num(inv.igst_paise) > 0);
        assert.equal(inv.place_of_supply, "Maharashtra");
      }
    });

    it("the state is matched however the browser spelled it", async () => {
      for (const spelling of ["haryana", "  HARYANA  ", "Haryana"]) {
        const { invoice: inv } = await buy(5, { state: spelling });
        assert.equal(num(inv.igst_paise), 0, spelling);
        assert.ok(num(inv.cgst_paise) > 0, spelling);
        assert.equal(inv.place_of_supply, "Haryana");
      }
    });

    it("a blank, unknown or non-string state is refused (never guessed)", async () => {
      for (const state of ["", "   ", "Atlantis", "Hary", "0", "<script>"]) {
        const r = await w.openOrder({ scenes: 5, buyer: uniqueBuyer({ state }) });
        assert.equal(r.status, 400, JSON.stringify(state));
        assert.equal(r.body.error, "state_required");
      }
      const res = await w.routes.order.POST(
        w.request("/api/billing/order", { body: { purpose: "basic_licence", scenes: 5, buyer: { ...BUYER, ...uniqueBuyer(), state: { a: 1 } } } })
      );
      assert.equal(res.status, 400);
      assert.equal(await w.count("billing_orders"), 0);
    });

    it("a GST-registered customer is taxed by the state in their GSTIN, whatever the dropdown said", async () => {
      const { invoice: inv } = await buy(5, { gstin: GSTIN_MH, state: "Haryana" });
      assert.equal(inv.bill_to_gstin, GSTIN_MH);
      assert.equal(inv.place_of_supply, "Maharashtra");
      assert.equal(num(inv.cgst_paise), 0);
      assert.ok(num(inv.igst_paise) > 0);
    });

    it("a customer with a Haryana GSTIN is billed CGST+SGST even if the dropdown was left on another state", async () => {
      const { invoice: inv } = await buy(5, { gstin: GSTIN_HR, state: "Kerala" });
      assert.equal(inv.place_of_supply, "Haryana");
      assert.equal(num(inv.igst_paise), 0);
      assert.ok(num(inv.cgst_paise) > 0);
    });

    it("a GSTIN alone is enough: the state is taken from it", async () => {
      const { invoice: inv } = await buy(5, { gstin: GSTIN_MH, state: "" });
      assert.equal(inv.place_of_supply, "Maharashtra");
    });

    it("GSTINs are accepted in any case but a wrong one is refused before any order exists", async () => {
      const lower = await w.openOrder({ scenes: 5, buyer: uniqueBuyer({ gstin: GSTIN_MH.toLowerCase() }) });
      assert.equal(lower.status, 200, JSON.stringify(lower.body));

      const typo = GSTIN_MH.slice(0, 5) + (GSTIN_MH[5] === "A" ? "B" : "A") + GSTIN_MH.slice(6); // one wrong character
      const bads = [
        typo,
        GSTIN_MH.slice(0, 14), // too short
        GSTIN_MH + "1", // too long
        GSTIN_MH.slice(0, 14) + (GSTIN_MH[14] === "V" ? "W" : "V"), // wrong check character
        withCheck("28AAPFU0939F1Z"), // 28 is not a current state code
        "ABCDEFGHIJKLMNO",
        "27AAPFU0939F1Z!",
      ];
      for (const gstin of bads) {
        const r = await w.openOrder({ scenes: 5, buyer: uniqueBuyer({ gstin }) });
        assert.equal(r.status, 400, gstin);
        assert.equal(r.body.error, "bad_gstin", gstin);
      }
    });

    it("an old, unchecked GSTIN already on file never blocks a renewal (it is simply left off)", async () => {
      const o = await w.seedOrg({ name: "Old Co", slug: "old-co", quota: 5, supportUntil: new Date(Date.now() + 5 * 86_400_000).toISOString() });
      await w.q(`update public.organizations set billing_gstin = '06AAAAA0000A1Z9' where id = $1`, [o.id]); // fails the check character
      const uid = await w.seedUser({ email: "admin@old-co.in", orgId: o.id });
      const res = await w.routes.order.POST(w.request("/api/billing/order", { as: uid, body: { purpose: "support_renewal", buyer: {} } }));
      assert.equal(res.status, 200, JSON.stringify(await w.readJson(res)));
      const [row] = await w.q(`select buyer_gstin from public.billing_orders`);
      assert.ok(!row.buyer_gstin, "the unverifiable number is not printed on the invoice");
    });
  });

  /* ─────────────────────────────── invoice numbers ─────────────────────────────── */

  describe("invoice numbering and the financial year", () => {
    it("the financial year rolls over at midnight India time on 1 April", async () => {
      const fy = async (iso: string) => (await w.q(`select public.vpv_financial_year($1::timestamptz) as fy`, [iso]))[0].fy;
      assert.equal(await fy("2026-03-31T18:29:59Z"), "2025-26"); // 23:59:59 IST, 31 March
      assert.equal(await fy("2026-03-31T18:30:00Z"), "2026-27"); // 00:00:00 IST, 1 April
      assert.equal(await fy("2026-12-31T23:59:59Z"), "2026-27");
      assert.equal(await fy("2027-03-31T18:29:59Z"), "2026-27");
      assert.equal(await fy("2027-03-31T18:30:00Z"), "2027-28");
    });

    it("test-mode invoices are visibly marked TEST/ and numbered from 0001", async () => {
      const { invoice } = await buy(5);
      assert.match(invoice.invoice_no, /^TEST\/\d{4}-\d{2}\/0001$/);
    });

    it("each financial year has its own series starting at 0001, and the year follows the PAYMENT date, not the build date", async () => {
      const mk = async (i: number) => {
        const { body: order } = await w.openOrder({ scenes: 4, buyer: uniqueBuyer() });
        return order;
      };
      w.sb.failNext("rpc:billing_create_org_for_order", 10);
      const a = await mk(1);
      const b = await mk(2);
      const c = await mk(3);
      for (const o of [a, b, c]) await w.payInBrowser(o);
      w.sb.clearFailures();
      await w.q(`update public.billing_orders set paid_at = '2026-03-31T18:29:00Z' where id = $1`, [a.orderId]);
      await w.q(`update public.billing_orders set paid_at = '2026-03-31T18:31:00Z' where id = $1`, [b.orderId]);
      await w.q(`update public.billing_orders set paid_at = '2026-04-01T10:00:00Z' where id = $1`, [c.orderId]);
      for (const o of [a, b, c]) assert.equal((await w.poll(o.orderId)).body.status, "ready");
      const no = async (o: { orderId: string }) => (await w.q(`select invoice_no from public.billing_invoices where order_id = $1`, [o.orderId]))[0].invoice_no;
      assert.equal(await no(a), "TEST/2025-26/0001");
      assert.equal(await no(b), "TEST/2026-27/0001");
      assert.equal(await no(c), "TEST/2026-27/0002");
    });

    it("live invoices (VPV/…) and test invoices (TEST/…) are separate series", async () => {
      w.sb.failNext("rpc:billing_create_org_for_order", 10);
      const live = (await w.openOrder({ scenes: 4, buyer: uniqueBuyer() })).body;
      const test = (await w.openOrder({ scenes: 4, buyer: uniqueBuyer() })).body;
      await w.payInBrowser(live);
      await w.payInBrowser(test);
      w.sb.clearFailures();
      await w.q(`update public.billing_orders set livemode = true where id = $1`, [live.orderId]);
      await w.poll(live.orderId);
      await w.poll(test.orderId);
      const nos = (await w.q(`select invoice_no from public.billing_invoices order by invoice_no`)).map((r) => r.invoice_no as string);
      assert.equal(nos.length, 2);
      assert.ok(nos.some((x) => /^VPV\/\d{4}-\d{2}\/0001$/.test(x)), nos.join());
      assert.ok(nos.some((x) => /^TEST\/\d{4}-\d{2}\/0001$/.test(x)), nos.join());
    });

    it("asking for the invoice of an already-invoiced order returns the same number, never a new one", async () => {
      const { order, invoice } = await buy(5);
      const args = { p_order: order.orderId, p_description: "again", p_our_state: "Haryana", p_gst_rate: 0.18, p_sac: "998434" };
      // The order is now built (and 'paid'), so the database hands back the existing number.
      const again = await w.sb.rpc("billing_issue_invoice", args);
      assert.equal(again.error, null);
      assert.equal(again.data, invoice.invoice_no);
      assert.equal(await w.count("billing_invoices"), 1);
    });
  });

  /* ─────────────────────────────── what an invoice says, and that it stays that way ─────────────────────────────── */

  describe("the invoice document", () => {
    it("carries the buyer's details, SAC code and a plain description, and is e-mailed with its number and total", async () => {
      const { invoice: inv, buyer } = await buy(5, { gstin: GSTIN_HR, address: "9 Mill Road, Gurugram" });
      assert.equal(inv.bill_to_name, buyer.company);
      assert.equal(inv.bill_to_email, buyer.email);
      assert.equal(inv.bill_to_address, "9 Mill Road, Gurugram");
      assert.equal(inv.bill_to_gstin, GSTIN_HR);
      assert.equal(inv.sac_code, "998434");
      assert.match(inv.description, /5 scenes/);
      assert.match(inv.description, /1 year/);
      const mail = w.gw.emailsTo(buyer.email).find((m) => /invoice/i.test(m.subject))!;
      assert.ok(mail.subject.includes(inv.invoice_no));
      assert.ok(mail.html.includes(inv.invoice_no));
      assert.ok(mail.html.includes("19,500"), "grand total shown");
    });

    it("is a frozen snapshot: renaming the workspace later does not change an issued invoice", async () => {
      const { invoice: inv } = await buy(5);
      await w.q(`update public.organizations set name = 'Renamed Corp', billing_name = 'Renamed Corp', billing_gstin = null`);
      const [after] = await w.q(`select * from public.billing_invoices where id = $1`, [inv.id]);
      assert.equal(after.bill_to_name, inv.bill_to_name);
      assert.equal(after.bill_to_gstin, inv.bill_to_gstin);
    });

    it("cannot be edited or deleted — not even with the service key — except by a deliberate override", async () => {
      const { invoice: inv, order } = await buy(5);
      const attempt = async (sql: string) => {
        try {
          await w.q(sql);
          return null;
        } catch (e) {
          return (e as Error).message;
        }
      };
      assert.match((await attempt(`update public.billing_invoices set total_paise = 1 where id = '${inv.id}'`)) ?? "", /invoice_is_frozen/);
      assert.match((await attempt(`update public.billing_invoices set invoice_no = 'X/1' where id = '${inv.id}'`)) ?? "", /invoice_is_frozen/);
      assert.match((await attempt(`update public.billing_invoices set bill_to_gstin = '06AAAAA0000A1Z9' where id = '${inv.id}'`)) ?? "", /invoice_is_frozen/);
      assert.match((await attempt(`delete from public.billing_invoices where id = '${inv.id}'`)) ?? "", /cannot_be_deleted/);
      assert.match((await attempt(`delete from public.billing_orders where id = '${order.orderId}'`)) ?? "", /cannot_be_deleted/);
      assert.match((await attempt(`delete from public.billing_payments`)) ?? "", /cannot_be_deleted/);
      assert.equal(await w.count("billing_invoices"), 1);
      assert.equal(await w.count("billing_orders"), 1);

      // Bookkeeping fields stay writable (e-mail sent, workspace unlinked).
      assert.equal(await attempt(`update public.billing_invoices set emailed_at = now() where id = '${inv.id}'`), null);
      // Deleting a workspace must never destroy its invoices.
      assert.equal(await attempt(`delete from public.organizations`), null);
      assert.equal(await w.count("billing_invoices"), 1);
      assert.equal((await w.q(`select org_id from public.billing_invoices`))[0].org_id, null);

      // The operator's deliberate override works.
      const err = await w.unprotected(() => attempt(`delete from public.billing_invoices where id = '${inv.id}'`));
      assert.equal(err, null);
      assert.equal(await w.count("billing_invoices"), 0);
    });

    it("an invoice whose parts do not add up cannot be stored at all", async () => {
      const { body: order } = await w.openOrder({ scenes: 5, buyer: uniqueBuyer() });
      const insert = (taxable: number, cgst: number, sgst: number, igst: number, total: number) =>
        w
          .q(
            `insert into public.billing_invoices (order_id, invoice_no, fy, bill_to_name, bill_to_email, description, taxable_paise, gst_rate, cgst_paise, sgst_paise, igst_paise, total_paise)
             values ($1, 'X/${Math.random()}', '2026-27', 'n', 'e@x.in', 'd', $2,0.18,$3,$4,$5,$6)`,
            [order.orderId, taxable, cgst, sgst, igst, total]
          )
          .then(() => null, (e: Error) => e.message);
      assert.match((await insert(100, 9, 9, 0, 200)) ?? "", /billing_invoices_adds_up/, "does not add up");
      assert.match((await insert(100, 9, 0, 9, 118)) ?? "", /billing_invoices_adds_up/, "CGST and IGST together");
      assert.match((await insert(100, 9, 9, 0, 118)) ?? "ok", /ok/, "a correct one is accepted");
    });
  });

  /* ─────────────────────────────── top-up and renewal invoices ─────────────────────────────── */

  describe("other purchases", () => {
    async function authed(state: string) {
      const o = await w.seedOrg({ name: "Org Co", slug: `org-${state.slice(0, 3).toLowerCase()}`, quota: 5, state, supportUntil: new Date(Date.now() + 5 * 86_400_000).toISOString() });
      const uid = await w.seedUser({ email: `admin@org-${state.slice(0, 3).toLowerCase()}.in`, orgId: o.id });
      return { org: o, uid };
    }
    const open = async (uid: string, purpose: string, scenes?: number) => {
      const res = await w.routes.order.POST(w.request("/api/billing/order", { as: uid, body: { purpose, scenes, buyer: {} } }));
      return { body: await w.readJson(res), status: res.status };
    };

    it("a top-up is charged the difference on the ladder, and the invoice says so", async () => {
      const { uid } = await authed("Haryana");
      const { body, status } = await open(uid, "scene_topup", 9);
      assert.equal(status, 200, JSON.stringify(body));
      const expected = toPaise(withGst(priceForScenes(9) - priceForScenes(5)).total);
      assert.equal(body.amountPaise, expected);
      await w.payInBrowser(body);
      assert.equal((await w.poll(body.orderId)).body.status, "ready");
      const [inv] = await w.q(`select * from public.billing_invoices`);
      assert.equal(num(inv.total_paise), expected);
      assert.match(inv.description, /top-up/i);
      assert.match(inv.description, /9 scenes/);
    });

    it("a renewal invoice for ₹11,988 splits to the paisa — CGST+SGST in-state", async () => {
      const { uid } = await authed("Haryana");
      const { body } = await open(uid, "support_renewal");
      await w.payInBrowser(body);
      await w.poll(body.orderId);
      const [inv] = await w.q(`select * from public.billing_invoices`);
      const total = toPaise(withGst(SUPPORT_ANNUAL_INR).total);
      const taxable = toPaise(withGst(SUPPORT_ANNUAL_INR).taxable);
      assert.equal(num(inv.total_paise), total);
      assert.equal(num(inv.taxable_paise), taxable);
      assert.equal(num(inv.igst_paise), 0);
      assert.equal(num(inv.cgst_paise) + num(inv.sgst_paise), total - taxable);
      assert.match(inv.description, /annual technical support/i);
    });

    it("a renewal invoice for an out-of-state customer is IGST", async () => {
      const { uid } = await authed("Karnataka");
      const { body } = await open(uid, "support_renewal");
      await w.payInBrowser(body);
      await w.poll(body.orderId);
      const [inv] = await w.q(`select * from public.billing_invoices`);
      assert.equal(num(inv.cgst_paise), 0);
      assert.equal(num(inv.sgst_paise), 0);
      assert.equal(num(inv.igst_paise), toPaise(withGst(SUPPORT_ANNUAL_INR).total) - num(inv.taxable_paise));
    });
  });

  /* ─────────────────────────────── credit notes ─────────────────────────────── */

  describe("credit notes", () => {
    for (const [label, state, intra] of [
      ["in-state (CGST+SGST)", "Haryana", true],
      ["out-of-state (IGST)", "Gujarat", false],
    ] as const) {
      it(`three awkward partial refunds ${label} add up to the invoice to the paisa`, async () => {
        const { payment, invoice: inv } = await buy(7, { state });
        const total = payment.amount;
        const parts = [1, 333_333, 1_000_001];
        parts.push(total - parts.reduce((a, b) => a + b, 0));
        for (const amount of parts) {
          await w.deliver(w.gw.refundEvent("refund.processed", w.gw.makeRefund(payment.id, amount)));
        }
        const notes = await w.q(`select * from public.billing_credit_notes order by credit_note_no`);
        assert.equal(notes.length, 4);
        const sum = (k: string) => notes.reduce((a, r) => a + num(r[k]), 0);
        assert.equal(sum("total_paise"), num(inv.total_paise));
        assert.equal(sum("taxable_paise"), num(inv.taxable_paise));
        assert.equal(sum("cgst_paise"), num(inv.cgst_paise));
        assert.equal(sum("sgst_paise"), num(inv.sgst_paise));
        assert.equal(sum("igst_paise"), num(inv.igst_paise));
        for (const r of notes) {
          assert.equal(num(r.taxable_paise) + num(r.cgst_paise) + num(r.sgst_paise) + num(r.igst_paise), num(r.total_paise));
          if (intra) assert.equal(num(r.igst_paise), 0);
          else assert.equal(num(r.cgst_paise) + num(r.sgst_paise), 0);
        }
      });
    }

    it("an issued credit note is frozen too (but its e-mailed flag is not)", async () => {
      const { payment } = await buy(5);
      await w.deliver(w.gw.refundEvent("refund.processed", w.gw.makeRefund(payment.id, payment.amount)));
      const err = await w.q(`update public.billing_credit_notes set total_paise = 1`).then(() => null, (e: Error) => e.message);
      assert.match(err ?? "", /credit_note_is_frozen/);
      const del = await w.q(`delete from public.billing_credit_notes`).then(() => null, (e: Error) => e.message);
      assert.match(del ?? "", /cannot_be_deleted/);
      await w.q(`update public.billing_credit_notes set emailed_at = null`); // allowed
    });
  });
});
