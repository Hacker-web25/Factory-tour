import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { makeWorld, BUYER, type World } from "./harness/world";

describe("happy path: a new customer buys Basic", () => {
  let w: World;
  before(async () => {
    w = await makeWorld();
  });
  beforeEach(async () => {
    await w.reset();
  });
  after(() => w.gw.uninstall());

  it("prices on the server, creates one order, and tells the browser what Razorpay needs", async () => {
    const { status, body } = await w.openOrder({ scenes: 5 });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.ok, true);
    assert.match(body.razorpayOrderId, /^order_/);
    assert.equal(body.keyId, "rzp_test_AbCdEf123456");
    assert.ok(body.amountPaise > 0);
    assert.equal(await w.count("billing_orders"), 1);
    // The amount Razorpay was asked for equals our own row's amount.
    const rzpOrder = w.gw.orders.get(body.razorpayOrderId)!;
    assert.equal(rzpOrder.amount, body.amountPaise);
    // And the secret never leaves the server.
    assert.ok(!JSON.stringify(body).includes("test_key_secret"));
  });

  it("customer pays → workspace, login, invoice and e-mails exist exactly once", async () => {
    const { body: order } = await w.openOrder({ scenes: 5 });
    const paid = await w.payInBrowser(order);
    assert.equal(paid.res.status, 200, JSON.stringify(paid.body));
    assert.equal(paid.body.status, "ready");
    assert.ok(paid.body.slug);
    assert.match(paid.body.invoiceNo, /^TEST\/\d{4}-\d{2}\/\d{4}$|^TEST\//);

    assert.equal(await w.count("organizations"), 1);
    const [org] = await w.q(`select plan, scene_quota, plan_status, support_until from public.organizations`);
    assert.equal(org.plan, "basic");
    assert.equal(org.scene_quota, 5);
    assert.equal(org.plan_status, "active");
    const months = (new Date(org.support_until).getTime() - Date.now()) / (30.4 * 86_400_000);
    assert.ok(months > 11.8 && months < 12.2, `support_until ~12 months out, got ${months}`);

    assert.equal(await w.count("billing_invoices"), 1);
    assert.equal(await w.count("billing_payments", "status = 'captured'"), 1);
    const [u] = await w.q(`select email, encrypted_password from auth.users`);
    assert.equal(u.email, BUYER.email);
    const [prof] = await w.q(`select role, org_id from public.profiles`);
    assert.equal(prof.role, "org_admin");

    // Exactly one welcome (with a password) and one invoice e-mail to the customer.
    const mails = w.gw.emailsTo(BUYER.email);
    assert.equal(mails.length, 2, mails.map((m) => m.subject).join(" | "));
    const welcome = mails.find((m) => /workspace/i.test(m.subject))!;
    assert.ok(welcome, "welcome e-mail sent");
    assert.match(welcome.html, /[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/, "first password present");
  });

  it("the password in the e-mail is the one that was actually set", async () => {
    const { body: order } = await w.openOrder({ scenes: 4 });
    await w.payInBrowser(order);
    const welcome = w.gw.emailsTo(BUYER.email).find((m) => /workspace/i.test(m.subject))!;
    const pw = welcome.html.match(/[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/)![0];
    const [u] = await w.q(`select encrypted_password from auth.users`);
    assert.equal(u.encrypted_password, `pw:${pw}`);
  });

  it("the status endpoint reports ready with the slug and invoice number", async () => {
    const { body: order } = await w.openOrder({ scenes: 3 });
    await w.payInBrowser(order);
    const s = await w.poll(order.orderId);
    assert.equal(s.body.status, "ready");
    assert.ok(s.body.slug);
    assert.ok(s.body.invoiceNo);
  });
});
