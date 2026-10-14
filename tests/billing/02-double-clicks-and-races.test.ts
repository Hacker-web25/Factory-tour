import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { makeWorld, BUYER, freshIp, type World } from "./harness/world";

/**
 * "If the user clicks two times, only one payment should be cut."
 * Everything here fires the same thing more than once, often at the same time.
 */
describe("double clicks, retries and races", () => {
  let w: World;
  before(async () => {
    w = await makeWorld();
  });
  beforeEach(async () => {
    await w.reset();
  });
  after(() => w.gw.uninstall());

  async function expectSingleCustomer(email = BUYER.email) {
    assert.equal(await w.count("organizations"), 1, "exactly one organisation");
    assert.equal(await w.count("billing_invoices"), 1, "exactly one invoice");
    assert.equal(await w.count("billing_payments", "status = 'captured'"), 1, "exactly one captured payment");
    assert.equal((await w.q(`select count(*)::int n from auth.users`))[0].n, 1, "exactly one login");
    assert.equal(await w.count("profiles"), 1, "exactly one profile");
    const welcome = w.gw.emailsTo(email).filter((m) => /workspace/i.test(m.subject));
    assert.equal(welcome.length, 1, "the welcome e-mail (with the password) is sent once");
    const invoice = w.gw.emailsTo(email).filter((m) => /invoice/i.test(m.subject));
    assert.equal(invoice.length, 1, "the invoice e-mail is sent once");
  }

  it("two simultaneous 'Pay' clicks open ONE order and hand back the same Razorpay order", async () => {
    const ip = freshIp();
    const [a, b] = await Promise.all([w.openOrder({ scenes: 6, ip }), w.openOrder({ scenes: 6, ip })]);
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.equal(b.status, 200, JSON.stringify(b.body));
    assert.equal(a.body.orderId, b.body.orderId);
    assert.equal(a.body.razorpayOrderId, b.body.razorpayOrderId);
    assert.equal(await w.count("billing_orders"), 1);
    // If a spare Razorpay order was created by the loser, nobody can ever pay it into our books.
    const linked = (await w.q(`select razorpay_order_id from public.billing_orders`))[0].razorpay_order_id;
    assert.equal(linked, a.body.razorpayOrderId);
  });

  it("eight rapid clicks in a row still leave exactly one open order", async () => {
    const ip = freshIp();
    const results = await Promise.all(Array.from({ length: 8 }, () => w.openOrder({ scenes: 4, ip })));
    for (const r of results) assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(new Set(results.map((r) => r.body.orderId)).size, 1);
    assert.equal(await w.count("billing_orders", "status = 'created'"), 1);
  });

  it("clicking Pay again later (page reload) reuses the same open order", async () => {
    const first = await w.openOrder({ scenes: 7 });
    const second = await w.openOrder({ scenes: 7 });
    assert.equal(first.body.orderId, second.body.orderId);
    assert.equal(first.body.razorpayOrderId, second.body.razorpayOrderId);
    assert.equal(second.body.reused, true);
  });

  it("changing the scene count opens a NEW order and closes the old one (no stale amount can be paid into the new books)", async () => {
    const a = await w.openOrder({ scenes: 5 });
    const b = await w.openOrder({ scenes: 9 });
    assert.notEqual(a.body.orderId, b.body.orderId);
    assert.notEqual(a.body.amountPaise, b.body.amountPaise);
    assert.equal(await w.count("billing_orders", "status = 'created'"), 1);
  });

  it("browser callback and webhook landing at the same instant build ONE customer", async () => {
    const { body: order } = await w.openOrder({ scenes: 5 });
    const pay = w.gw.pay(order.razorpayOrderId);
    const sig = w.gw.checkoutSignature(order.razorpayOrderId, pay.id);
    const confirm = () =>
      w.routes.confirm.POST(
        w.request("/api/billing/confirm", {
          body: { orderId: order.orderId, razorpay_order_id: order.razorpayOrderId, razorpay_payment_id: pay.id, razorpay_signature: sig },
        })
      );
    const results = await Promise.all([
      confirm(),
      w.deliver(w.gw.paymentEvent("payment.captured", pay)),
      w.deliver(w.gw.paymentEvent("order.paid", pay)),
      confirm(),
    ]);
    for (const r of results) {
      const status = "status" in r ? (r as { status: number }).status : (r as Response).status;
      assert.ok(status === 200 || status === 500, `unexpected status ${status}`);
    }
    // Whoever lost the race must have caught up by the time we look again.
    await w.poll(order.orderId);
    await w.deliver(w.gw.paymentEvent("payment.captured", pay)); // a redelivery
    await expectSingleCustomer();
  });

  it("the very same webhook delivered 6 times in parallel is processed once", async () => {
    const { body: order } = await w.openOrder({ scenes: 5 });
    const pay = w.gw.pay(order.razorpayOrderId);
    const wh = w.gw.paymentEvent("payment.captured", pay, "evt_same_event_id");
    const out = await Promise.all(Array.from({ length: 6 }, () => w.deliver(wh)));
    // A duplicate that lands while the first is still building the customer is
    // told "retry later" (5xx) rather than being dropped; the rest are acknowledged.
    for (const o of out) assert.ok(o.status === 200 || o.status === 500, `status ${o.status}: ${o.text}`);
    assert.ok(out.some((o) => o.status === 200), "at least one delivery completed");
    // Razorpay's later retry is simply acknowledged.
    const again = await w.deliver(wh);
    assert.equal(again.status, 200);
    await expectSingleCustomer();
    assert.equal(await w.count("billing_webhook_events"), 1);
    assert.equal(await w.count("billing_webhook_events", "processed_at is not null and error is null"), 1);
  });

  it("the same browser callback sent 4 times (impatient customer) is idempotent", async () => {
    const { body: order } = await w.openOrder({ scenes: 5 });
    const pay = w.gw.pay(order.razorpayOrderId);
    const sig = w.gw.checkoutSignature(order.razorpayOrderId, pay.id);
    const call = () =>
      w.routes.confirm.POST(
        w.request("/api/billing/confirm", {
          body: { orderId: order.orderId, razorpay_order_id: order.razorpayOrderId, razorpay_payment_id: pay.id, razorpay_signature: sig },
        })
      );
    const res = await Promise.all([call(), call(), call(), call()]);
    for (const r of res) assert.equal(r.status, 200);
    const bodies = await Promise.all(res.map((r) => r.json()));
    // Whoever lost the claim may say "processing"; after one more look everything is ready.
    const after = await w.poll(order.orderId);
    assert.equal(after.body.status, "ready");
    assert.ok(bodies.every((b) => ["ready", "processing"].includes(b.status)));
    await expectSingleCustomer();
  });

  it("five customers paying at the same moment get distinct, gap-free invoice numbers", async () => {
    const buyers = Array.from({ length: 5 }, (_, i) => ({
      email: `buyer${i}@company${i}.in`,
      company: `Company ${i} Pvt Ltd`,
    }));
    const orders = await Promise.all(buyers.map((b) => w.openOrder({ scenes: 5, buyer: b })));
    for (const o of orders) assert.equal(o.status, 200, JSON.stringify(o.body));
    await Promise.all(orders.map((o) => w.payInBrowser(o.body)));
    for (const o of orders) assert.equal((await w.poll(o.body.orderId)).body.status, "ready");

    const nos = (await w.q(`select invoice_no from public.billing_invoices order by invoice_no`)).map((r) => r.invoice_no as string);
    assert.equal(nos.length, 5);
    assert.equal(new Set(nos).size, 5, "no duplicate invoice numbers");
    const seq = nos.map((n) => Number(n.split("/").pop())).sort((a, b) => a - b);
    assert.deepEqual(seq, [1, 2, 3, 4, 5], "numbers run 1..5 with no gaps");
    assert.equal(await w.count("organizations"), 5);
  });

  it("two customers with the same company name get different workspace addresses", async () => {
    const orders = await Promise.all([
      w.openOrder({ scenes: 3, buyer: { email: "one@same-co.in", company: "Same Co" } }),
      w.openOrder({ scenes: 3, buyer: { email: "two@same-co.in", company: "Same Co" } }),
    ]);
    await Promise.all(orders.map((o) => w.payInBrowser(o.body)));
    for (const o of orders) await w.poll(o.body.orderId);
    const slugs = (await w.q(`select slug from public.organizations`)).map((r) => r.slug);
    assert.equal(slugs.length, 2);
    assert.equal(new Set(slugs).size, 2);
  });

  it("a customer who paid but whose workspace is still being built cannot open a second payment", async () => {
    w.sb.failNext("auth.createUser", 50); // the build keeps failing for now
    const { body: order } = await w.openOrder({ scenes: 5 });
    await w.payInBrowser(order);
    assert.equal(await w.count("billing_orders", "status = 'paid' and provisioned_at is null"), 1);
    const again = await w.openOrder({ scenes: 5 });
    assert.equal(again.status, 409);
    assert.equal(again.body.error, "payment_in_progress");
    assert.equal(await w.count("billing_orders"), 1, "no second order was opened");
  });

  it("two tabs paying the same order: the second capture is refunded automatically, the customer is built once", async () => {
    const { body: order } = await w.openOrder({ scenes: 5 });
    const first = w.gw.pay(order.razorpayOrderId);
    const second = w.gw.pay(order.razorpayOrderId, { force: true }); // gateway race: two captures
    await w.deliver(w.gw.paymentEvent("payment.captured", first));
    const d1 = await w.deliver(w.gw.paymentEvent("payment.captured", second));
    const d2 = await w.deliver(w.gw.paymentEvent("payment.captured", second)); // Razorpay retries
    assert.equal(d1.status, 200);
    assert.equal(d2.status, 200);

    await expectSingleCustomer();
    // One refund, for the SECOND payment only — however many times we heard about it.
    const refunds = [...w.gw.refunds.values()];
    assert.equal(refunds.length, 1);
    assert.equal(refunds[0].payment_id, second.id);
    assert.equal(refunds[0].amount, second.amount);
    // When Razorpay confirms that refund, the customer's real purchase stays untouched.
    await w.deliver(w.gw.refundEvent("refund.processed", refunds[0]));
    const [org] = await w.q(`select plan_status from public.organizations`);
    assert.equal(org.plan_status, "active");
    assert.equal(await w.count("billing_credit_notes"), 0, "a duplicate refund needs no credit note");
    assert.equal((await w.q(`select status from public.billing_orders`))[0].status, "paid");
  });

  it("paying an order that was superseded by a changed order does not lose the customer's money", async () => {
    const a = await w.openOrder({ scenes: 5 });
    await w.openOrder({ scenes: 8 }); // customer changed their mind; order A is closed on our side
    // ...but they still had A open in another tab and paid it.
    const paidA = await w.payInBrowser(a.body);
    assert.equal(paidA.res.status, 200);
    const s = await w.poll(a.body.orderId);
    assert.equal(s.body.status, "ready", "money taken → customer is served, not stranded");
    assert.equal(await w.count("organizations"), 1);
  });
});
