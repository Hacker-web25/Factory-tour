import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { makeWorld, BUYER, type World } from "./harness/world";
import { gstinCheckChar } from "@/lib/gstin";
import { priceForScenes, toPaise } from "@/lib/pricing";

/** A well-formed Haryana GSTIN with a correct check character. */
const GOOD_GSTIN = (() => {
  const first14 = "06AAACA1234A1Z";
  return first14 + gstinCheckChar(first14);
})();

/**
 * Forged callbacks, forged webhooks, wrong amounts, half-finished payments.
 * Nothing here may ever create a workspace or an invoice.
 */
describe("fraud, forgery and verification", () => {
  let w: World;
  before(async () => {
    w = await makeWorld();
  });
  beforeEach(async () => {
    await w.reset();
  });
  after(() => w.gw.uninstall());

  async function nothingWasGranted() {
    assert.equal(await w.count("organizations"), 0, "no organisation");
    assert.equal(await w.count("billing_invoices"), 0, "no invoice");
    assert.equal((await w.q(`select count(*)::int n from auth.users`))[0].n, 0, "no login");
    assert.equal(await w.count("billing_orders", "status = 'paid'"), 0, "order not marked paid");
  }

  const confirmBody = (o: any, payId: string, sig: string) => ({
    orderId: o.orderId,
    razorpay_order_id: o.razorpayOrderId,
    razorpay_payment_id: payId,
    razorpay_signature: sig,
  });

  /* ─────────────────────────── price ─────────────────────────── */

  it("the browser cannot choose the price — extra amount fields are ignored", async () => {
    const res = await w.routes.order.POST(
      w.request("/api/billing/order", {
        body: {
          purpose: "basic_licence",
          scenes: 10,
          amount: 1,
          amountPaise: 100,
          price: 1,
          total: 1,
          buyer: { ...BUYER, amount: 1 },
        },
      })
    );
    const body = await w.readJson(res);
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.amountPaise, toPaise(priceForScenes(10)));
    assert.equal(w.gw.orders.get(body.razorpayOrderId)!.amount, toPaise(priceForScenes(10)));
  });

  for (const scenes of [0, 1, 21, 100, -3, 2.5, "5", null, NaN, 1e9, "abc", [5], { a: 1 }]) {
    it(`rejects an impossible scene count: ${JSON.stringify(scenes)}`, async () => {
      const res = await w.routes.order.POST(
        w.request("/api/billing/order", { body: { purpose: "basic_licence", scenes, buyer: BUYER } })
      );
      assert.equal(res.status, 400);
      assert.equal(await w.count("billing_orders"), 0);
      assert.equal(w.gw.orders.size, 0, "Razorpay was never asked for an order");
    });
  }

  for (const scenes of [2, 20]) {
    it(`accepts the boundary scene count ${scenes}`, async () => {
      const r = await w.openOrder({ scenes });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.amountPaise, toPaise(priceForScenes(scenes)));
    });
  }

  /* ───────────────────── browser callback forgery ───────────────────── */

  it("callback with a made-up signature grants nothing", async () => {
    const { body: o } = await w.openOrder();
    const pay = w.gw.pay(o.razorpayOrderId);
    const res = await w.routes.confirm.POST(w.request("/api/billing/confirm", { body: confirmBody(o, pay.id, "a".repeat(64)) }));
    assert.equal(res.status, 400);
    await nothingWasGranted();
  });

  it("callback signed with the wrong secret (an attacker who does not know ours) grants nothing", async () => {
    const { body: o } = await w.openOrder();
    const pay = w.gw.pay(o.razorpayOrderId);
    const forged = w.gw.checkoutSignature(o.razorpayOrderId, pay.id, "attacker_guess_secret");
    const res = await w.routes.confirm.POST(w.request("/api/billing/confirm", { body: confirmBody(o, pay.id, forged) }));
    assert.equal(res.status, 400);
    await nothingWasGranted();
  });

  it("callback with a signature that is not even hex is rejected before any lookup", async () => {
    const { body: o } = await w.openOrder();
    for (const sig of ["", "zz", "x".repeat(64), "A".repeat(63), "A".repeat(65), "<script>", "' or 1=1 --"]) {
      const res = await w.routes.confirm.POST(w.request("/api/billing/confirm", { body: confirmBody(o, "pay_123456", sig) }));
      assert.equal(res.status, 400, `sig=${sig}`);
    }
    await nothingWasGranted();
  });

  it("a real signature for payment X cannot be replayed for payment Y", async () => {
    const { body: o } = await w.openOrder();
    const x = w.gw.pay(o.razorpayOrderId, { status: "failed" });
    const y = w.gw.pay(o.razorpayOrderId);
    const sigForX = w.gw.checkoutSignature(o.razorpayOrderId, x.id);
    const res = await w.routes.confirm.POST(w.request("/api/billing/confirm", { body: confirmBody(o, y.id, sigForX) }));
    assert.equal(res.status, 400);
    await nothingWasGranted();
  });

  it("a valid (order, payment) pair presented against someone else's order id is refused", async () => {
    const a = (await w.openOrder({ buyer: { email: "a@one.in", company: "One" } })).body;
    const b = (await w.openOrder({ buyer: { email: "b@two.in", company: "Two" } })).body;
    const payA = w.gw.pay(a.razorpayOrderId);
    const res = await w.routes.confirm.POST(
      w.request("/api/billing/confirm", {
        body: { orderId: b.orderId, razorpay_order_id: a.razorpayOrderId, razorpay_payment_id: payA.id, razorpay_signature: w.gw.checkoutSignature(a.razorpayOrderId, payA.id) },
      })
    );
    assert.equal(res.status, 400);
    assert.equal((await w.q(`select status from public.billing_orders where id = $1`, [b.orderId]))[0].status, "created");
  });

  it("the callback never trusts the browser about WHAT was paid: a payment on a different Razorpay order is refused", async () => {
    const a = (await w.openOrder({ buyer: { email: "a@one.in", company: "One" } })).body;
    const b = (await w.openOrder({ buyer: { email: "b@two.in", company: "Two" } })).body;
    const payB = w.gw.pay(b.razorpayOrderId);
    // Someone holding the API secret (we model an impossible-but-worst case) signs (orderA|payB):
    const res = await w.routes.confirm.POST(
      w.request("/api/billing/confirm", { body: confirmBody(a, payB.id, w.gw.checkoutSignature(a.razorpayOrderId, payB.id)) })
    );
    assert.equal(res.status, 400);
    assert.equal((await w.q(`select status from public.billing_orders where id = $1`, [a.orderId]))[0].status, "created");
  });

  it("a payment that is only AUTHORIZED (not captured) grants nothing until it is captured", async () => {
    const { body: o } = await w.openOrder();
    const authorized = w.gw.pay(o.razorpayOrderId, { status: "authorized" });
    const res = await w.routes.confirm.POST(
      w.request("/api/billing/confirm", { body: confirmBody(o, authorized.id, w.gw.checkoutSignature(o.razorpayOrderId, authorized.id)) })
    );
    const body = await w.readJson(res);
    assert.equal(res.status, 200);
    assert.equal(body.status, "processing");
    await nothingWasGranted();
    // Later the bank captures it, Razorpay says so, and only then is the customer built.
    const captured = w.gw.capture(authorized.id);
    await w.deliver(w.gw.paymentEvent("payment.captured", captured));
    assert.equal((await w.poll(o.orderId)).body.status, "ready");
    assert.equal(await w.count("organizations"), 1);
  });

  it("a failed payment grants nothing and leaves the order open for another try", async () => {
    const { body: o } = await w.openOrder();
    const failed = w.gw.pay(o.razorpayOrderId, { status: "failed" });
    await w.deliver(w.gw.paymentEvent("payment.failed", failed));
    await nothingWasGranted();
    assert.equal((await w.q(`select status from public.billing_orders where id = $1`, [o.orderId]))[0].status, "created");
    // They retry with another method and succeed.
    const ok = await w.payInBrowser(o);
    assert.equal(ok.body.status, "ready");
    assert.equal(await w.count("organizations"), 1);
    assert.equal(await w.count("billing_payments"), 2, "both attempts are on record");
  });

  it("a late 'failed' event cannot undo a captured payment", async () => {
    const { body: o } = await w.openOrder();
    const paid = await w.payInBrowser(o);
    const lateFail = { ...paid.payment, status: "failed" as const, captured: false };
    await w.deliver(w.gw.paymentEvent("payment.failed", lateFail));
    assert.equal((await w.q(`select status from public.billing_payments where razorpay_payment_id = $1`, [paid.payment.id]))[0].status, "captured");
    assert.equal((await w.poll(o.orderId)).body.status, "ready");
  });

  /* ───────────────────────── webhook forgery ───────────────────────── */

  it("webhook with a wrong signature is refused and leaves no trace", async () => {
    const { body: o } = await w.openOrder();
    const pay = w.gw.pay(o.razorpayOrderId);
    const wh = w.gw.paymentEvent("payment.captured", pay);
    wh.headers["x-razorpay-signature"] = "b".repeat(64);
    const r = await w.deliver(wh);
    assert.equal(r.status, 400);
    assert.equal(await w.count("billing_webhook_events"), 0);
    await nothingWasGranted();
  });

  it("webhook signed with an attacker's secret is refused", async () => {
    const { body: o } = await w.openOrder();
    const pay = w.gw.pay(o.razorpayOrderId);
    const wh = w.gw.signedWebhook("payment.captured", { payment: { entity: pay } }, { secret: "not_the_real_webhook_secret" });
    assert.equal((await w.deliver(wh)).status, 400);
    await nothingWasGranted();
  });

  it("webhook whose body was altered after signing (amount cut to 1 rupee) is refused", async () => {
    const { body: o } = await w.openOrder();
    const pay = w.gw.pay(o.razorpayOrderId);
    const wh = w.gw.signedWebhook("payment.captured", { payment: { entity: pay } }, { tamper: true });
    assert.equal((await w.deliver(wh)).status, 400);
    await nothingWasGranted();
  });

  it("webhook with no signature header, or an empty one, is refused", async () => {
    const { body: o } = await w.openOrder();
    const pay = w.gw.pay(o.razorpayOrderId);
    const wh = w.gw.paymentEvent("payment.captured", pay);
    delete wh.headers["x-razorpay-signature"];
    assert.equal((await w.deliver(wh)).status, 400);
    wh.headers["x-razorpay-signature"] = "";
    assert.equal((await w.deliver(wh)).status, 400);
    await nothingWasGranted();
  });

  it("webhook with garbage JSON (correctly signed) is rejected cleanly", async () => {
    const crypto = await import("node:crypto");
    const raw = "{not json";
    const sig = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!).update(raw).digest("hex");
    const r = await w.deliver({ body: raw, headers: { "x-razorpay-signature": sig, "content-type": "application/json" } });
    assert.equal(r.status, 400);
  });

  it("an oversized webhook body is refused without being buffered", async () => {
    const big = "x".repeat(300 * 1024);
    const r = await w.deliver({ body: big, headers: { "x-razorpay-signature": "c".repeat(64) } });
    assert.equal(r.status, 413);
  });

  /* ───────────────────── amount / currency checks ───────────────────── */

  it("money that does not match the order (short by ₹1) is NOT accepted, and the founders are alerted", async () => {
    const { body: o } = await w.openOrder({ scenes: 5 });
    const pay = w.gw.pay(o.razorpayOrderId, { amount: o.amountPaise - 100 });
    const r = await w.deliver(w.gw.paymentEvent("payment.captured", pay));
    assert.equal(r.status, 200, "not retriable — a human decides");
    await nothingWasGranted();
    assert.equal(await w.count("billing_orders", "review_flag = 'amount_mismatch'"), 1);
    assert.equal(await w.count("billing_alerts", "kind = 'amount_mismatch' and severity = 'critical'"), 1);
  });

  it("an over-payment is not silently accepted either", async () => {
    const { body: o } = await w.openOrder({ scenes: 5 });
    const pay = w.gw.pay(o.razorpayOrderId, { amount: o.amountPaise + 5000 });
    await w.deliver(w.gw.paymentEvent("payment.captured", pay));
    await nothingWasGranted();
    assert.equal(await w.count("billing_orders", "review_flag = 'amount_mismatch'"), 1);
  });

  it("a payment in another currency is refused", async () => {
    const { body: o } = await w.openOrder({ scenes: 5 });
    const pay = w.gw.pay(o.razorpayOrderId, { currency: "USD" });
    await w.deliver(w.gw.paymentEvent("payment.captured", pay));
    await nothingWasGranted();
  });

  it("the browser callback path applies the same amount rule", async () => {
    const { body: o } = await w.openOrder({ scenes: 5 });
    const pay = w.gw.pay(o.razorpayOrderId, { amount: o.amountPaise - 1 });
    const res = await w.routes.confirm.POST(
      w.request("/api/billing/confirm", { body: confirmBody(o, pay.id, w.gw.checkoutSignature(o.razorpayOrderId, pay.id)) })
    );
    assert.equal(res.status, 200);
    await nothingWasGranted();
  });

  it("a webhook for an order that is not ours (another product on the same account) is ignored", async () => {
    const stranger = { id: "pay_Stranger12345", order_id: "order_NotOurs12345", amount: 99900, currency: "INR", status: "captured", captured: true };
    const r = await w.deliver(w.gw.signedWebhook("payment.captured", { payment: { entity: stranger } }));
    assert.equal(r.status, 200);
    await nothingWasGranted();
  });

  it("a webhook with no payment entity, or no order, does not crash anything", async () => {
    for (const payload of [{}, { payment: {} }, { payment: { entity: {} } }, { payment: { entity: { id: "pay_x" } } }]) {
      const r = await w.deliver(w.gw.signedWebhook("payment.captured", payload));
      assert.equal(r.status, 200);
    }
    await nothingWasGranted();
  });

  it("unknown event types are acknowledged and ignored", async () => {
    const r = await w.deliver(w.gw.signedWebhook("settlement.processed", { settlement: { entity: { id: "setl_1" } } }));
    assert.equal(r.status, 200);
  });

  /* ───────────────────── the status endpoint ───────────────────── */

  it("the status endpoint reveals nothing but a status word for a stranger's guess", async () => {
    const r = await w.poll("00000000-0000-4000-8000-000000000000");
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "unknown");
    // An unknown id yields only a status word — not even a field that could hint at what exists.
    assert.deepEqual(Object.keys(r.body).sort(), ["ok", "status"]);
  });

  it("the status endpoint exposes only status, purpose, workspace address and invoice number for a real order (never e-mail, amount, GSTIN, payment ids or password)", async () => {
    const { body: order } = await w.openOrder({ scenes: 5, buyer: { gstin: GOOD_GSTIN } });
    await w.payInBrowser(order);
    const r = await w.poll(order.orderId);
    assert.equal(r.body.status, "ready");
    assert.deepEqual(Object.keys(r.body).sort(), ["invoiceNo", "ok", "purpose", "slug", "status"]);
    const text = JSON.stringify(r.body);
    for (const secret of ["asha@acme-steel.in", GOOD_GSTIN, "pay_", "Acme Steel", "pw:"]) {
      assert.ok(!text.includes(secret), `leaked ${secret}`);
    }
  });

  it("the status endpoint refuses malformed ids", async () => {
    for (const id of ["", "1", "../../etc/passwd", "' or 1=1 --", "x".repeat(200)]) {
      const r = await w.poll(encodeURIComponent(id));
      assert.equal(r.status, 400, id);
    }
  });
});
