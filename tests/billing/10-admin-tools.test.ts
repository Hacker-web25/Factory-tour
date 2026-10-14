import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { makeWorld, BUYER, freshIp, type World } from "./harness/world";

/**
 * The owner's repair buttons on /admin/payments.
 *
 * They are the last line of defence when something in the pipeline has given
 * up, so they must (a) be unreachable by anyone but the platform owner,
 * (b) be safe to press twice or at the same time as the automatic machinery,
 * (c) be unable to build a customer for money that was never taken or was
 * given back, and (d) leave a trail even when they fail.
 */
describe("owner tools: retry, resync, resolve, dismiss", () => {
  let w: World;
  before(async () => {
    w = await makeWorld();
  });
  beforeEach(async () => {
    await w.reset();
    w.sb.clearFailures();
  });
  after(() => w.gw.uninstall());

  const admin = async (as: string | undefined, body: Record<string, unknown>, o: { raw?: string; ip?: string } = {}) => {
    const res = await w.routes.adminBilling.POST(
      w.request("/api/admin/billing", { as, body, raw: o.raw, ip: o.ip ?? freshIp() })
    );
    const out = await w.readJson(res);
    return { res, status: res.status, body: out, text: JSON.stringify(out) };
  };
  const owner = () => w.seedUser({ email: "owner@vpv.in", role: "owner" });
  const audits = () =>
    w.q(`select detail, severity, resolved_at, order_id from public.billing_alerts where kind = 'admin_action' order by created_at, id`);
  const orderRow = async () => (await w.q(`select * from public.billing_orders order by created_at desc limit 1`))[0];

  /** A customer who PAID, whose workspace could not be built, after the automatic retries gave up. */
  async function stuckOrder(buyer: Partial<typeof BUYER> = {}) {
    const { body: order } = await w.openOrder({ scenes: 5, buyer });
    w.sb.failNext("auth.createUser", 500);
    await w.payInBrowser(order);
    for (let i = 0; i < 12; i++) await w.poll(order.orderId);
    w.sb.clearFailures();
    const o = await orderRow();
    assert.equal(Number(o.fulfilment_attempts), 8, "precondition: automatic retries have given up");
    assert.equal(o.provisioned_at, null);
    return order as { orderId: string; razorpayOrderId: string; amountPaise: number };
  }

  /** Customer logins (the owner's own login is not a customer). */
  const customerLogins = async () =>
    Number((await w.q(`select count(*)::int n from auth.users where email <> 'owner@vpv.in'`))[0].n);
  const customerProfiles = async () => w.count("profiles", "role <> 'owner'");

  async function exactlyOneCustomer() {
    assert.equal(await w.count("organizations"), 1, "one organisation");
    assert.equal(await w.count("billing_invoices"), 1, "one invoice");
    assert.equal(await w.count("billing_payments", "status = 'captured'"), 1, "one captured payment");
    assert.equal(await customerLogins(), 1, "one login");
    assert.equal(await customerProfiles(), 1, "one profile");
    const welcome = w.gw.emailsTo(BUYER.email).filter((m) => /workspace/i.test(m.subject));
    const invoice = w.gw.emailsTo(BUYER.email).filter((m) => /invoice/i.test(m.subject));
    assert.equal(welcome.length, 1, `welcome e-mails: ${welcome.length}`);
    assert.equal(invoice.length, 1, `invoice e-mails: ${invoice.length}`);
    const pw = welcome[0].html.match(/[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/)?.[0];
    const [u] = await w.q(`select encrypted_password from auth.users where email = lower($1)`, [BUYER.email]);
    assert.equal(u.encrypted_password, `pw:${pw}`, "the e-mailed password is the one that works");
  }

  /* ───────────────────────────── who may press the buttons ───────────────────────────── */

  describe("access", () => {
    it("signed-out visitors, presenters, organisation admins and made-up tokens are all refused, and nothing is recorded", async () => {
      const org = await w.seedOrg({ slug: "some-co" });
      const orgAdmin = await w.seedUser({ email: "admin@some-co.in", orgId: org.id, role: "org_admin" });
      const presenter = await w.seedUser({ email: "pres@some-co.in", orgId: org.id, role: "presenter" });
      const order = await stuckOrder();
      const body = { action: "retry_fulfilment", orderId: order.orderId };
      assert.equal((await admin(undefined, body)).status, 401);
      assert.equal((await admin("00000000-0000-4000-8000-000000000000", body)).status, 401);
      assert.equal((await admin(orgAdmin, body)).status, 403);
      assert.equal((await admin(presenter, body)).status, 403);
      assert.equal((await audits()).length, 0, "refused callers leave no admin rows");
      assert.equal(
        Number((await w.q(`select count(*)::int n from auth.users where email = lower($1)`, [BUYER.email]))[0].n),
        0,
        "nothing was built"
      );
      assert.equal((await orderRow()).provisioned_at, null);
      assert.equal(Number((await orderRow()).fulfilment_attempts), 8, "the order was not touched");
    });

    it("an organisation admin cannot resolve alerts or clear flags either", async () => {
      const org = await w.seedOrg({ slug: "some-co" });
      const orgAdmin = await w.seedUser({ email: "admin@some-co.in", orgId: org.id, role: "org_admin" });
      await stuckOrder();
      const [alert] = await w.q(`select id from public.billing_alerts where resolved_at is null limit 1`);
      assert.equal((await admin(orgAdmin, { action: "resolve_alert", alertId: alert.id })).status, 403);
      assert.equal((await admin(orgAdmin, { action: "dismiss_flag", orderId: crypto.randomUUID(), note: "just because" })).status, 403);
      assert.ok((await w.count("billing_alerts", "resolved_at is null")) >= 1, "alert still open");
    });

    it("only POST exists", async () => {
      assert.equal(typeof w.routes.adminBilling.GET, "undefined");
      assert.equal(typeof w.routes.adminBilling.PUT, "undefined");
      assert.equal(typeof w.routes.adminBilling.DELETE, "undefined");
    });
  });

  /* ───────────────────────────── hostile or sloppy input ───────────────────────────── */

  describe("input", () => {
    it("rejects bad JSON, arrays, oversize bodies, unknown actions and malformed ids — with no audit rows and no changes", async () => {
      const o = await owner();
      const order = await stuckOrder();
      const before = await orderRow();

      assert.equal((await admin(o, {}, { raw: "not json at all" })).status, 400);
      assert.equal((await admin(o, {}, { raw: "[1,2,3]" })).status, 400);
      assert.equal((await admin(o, {}, { raw: "null" })).status, 400);
      assert.equal((await admin(o, { action: "x", pad: "a".repeat(5000) })).status, 413);

      for (const action of ["", "DROP TABLE", "retry_fulfilment ", "RETRY_FULFILMENT", "refund", "mark_paid", "set_amount", 7, null, ["retry_fulfilment"]]) {
        const r = await admin(o, { action: action as never, orderId: order.orderId });
        assert.equal(r.status, 400, `action ${JSON.stringify(action)} → ${r.status}`);
        assert.equal(r.body.error, "bad_action");
      }

      for (const bad of ["", "1", "' or 1=1 --", "../../etc/passwd", "00000000-0000-0000-0000-000000000000", order.orderId + "x", 42, null, {}, [order.orderId]]) {
        const r = await admin(o, { action: "retry_fulfilment", orderId: bad as never });
        assert.equal(r.status, 400, `orderId ${JSON.stringify(bad)} → ${r.status}`);
        assert.equal(r.body.error, "bad_order_id");
      }
      assert.equal((await admin(o, { action: "resolve_alert" })).body.error, "bad_alert_id");
      assert.equal((await admin(o, { action: "resolve_alert", alertId: "nope" })).status, 400);

      assert.equal((await audits()).length, 0, "validation failures write nothing");
      const after = await orderRow();
      assert.equal(after.fulfilment_attempts, before.fulfilment_attempts);
      assert.equal(after.updated_at?.toString(), before.updated_at?.toString());
    });

    it("clearing a flag needs a reason", async () => {
      const o = await owner();
      const id = crypto.randomUUID();
      assert.equal((await admin(o, { action: "dismiss_flag", orderId: id })).body.error, "note_required");
      assert.equal((await admin(o, { action: "dismiss_flag", orderId: id, note: "ok" })).body.error, "note_required");
      assert.equal((await admin(o, { action: "dismiss_flag", orderId: id, note: "     " })).body.error, "note_required");
    });

    it("is rate limited: the 121st action in an hour is refused", async () => {
      const o = await owner();
      const statuses: number[] = [];
      for (let i = 0; i < 125; i++) statuses.push((await admin(o, { action: "nope" })).status);
      assert.ok(statuses.slice(0, 120).every((s) => s === 400), "the first 120 are processed");
      assert.ok(statuses.slice(120).every((s) => s === 429), "then the limit bites");
    });
  });

  /* ───────────────────────────── retry the build ───────────────────────────── */

  describe("retry_fulfilment", () => {
    it("builds a customer whose payment was taken but whose setup gave up — once, completely", async () => {
      const o = await owner();
      const order = await stuckOrder();
      assert.equal(await customerLogins(), 0, "no login yet");
      assert.equal(await w.count("billing_alerts", "kind = 'fulfilment_stuck' and resolved_at is null"), 1);

      const r = await admin(o, { action: "retry_fulfilment", orderId: order.orderId });
      assert.equal(r.status, 200, r.text);
      assert.equal(r.body.built, true);
      assert.ok(r.body.slug);
      assert.ok(r.body.invoiceNo);
      assert.equal(r.body.error, null);

      await exactlyOneCustomer();
      assert.equal((await w.poll(order.orderId)).body.status, "ready");
      assert.equal(await w.count("billing_alerts", "kind = 'fulfilment_stuck' and resolved_at is null"), 0, "the 'could not set up' alert closes itself");
      const [org] = await w.q(`select plan, scene_quota, plan_status from public.organizations`);
      assert.deepEqual({ ...org }, { plan: "basic", scene_quota: 5, plan_status: "active" });
    });

    it("pressing it again after success is refused — it cannot build a second customer", async () => {
      const o = await owner();
      const order = await stuckOrder();
      assert.equal((await admin(o, { action: "retry_fulfilment", orderId: order.orderId })).status, 200);
      const again = await admin(o, { action: "retry_fulfilment", orderId: order.orderId });
      assert.equal(again.status, 409);
      assert.equal(again.body.error, "already_built");
      await exactlyOneCustomer();
    });

    it("six simultaneous presses build exactly one customer", async () => {
      const o = await owner();
      const order = await stuckOrder();
      const rs = await Promise.all(Array.from({ length: 6 }, () => admin(o, { action: "retry_fulfilment", orderId: order.orderId })));
      for (const r of rs) assert.ok([200, 409].includes(r.status), `status ${r.status}: ${r.text}`);
      assert.ok(rs.some((r) => r.status === 200 && r.body.built === true), "one of them built it");
      await w.poll(order.orderId);
      await exactlyOneCustomer();
    });

    it("pressed at the same time as the reconciler, a status poll and a webhook redelivery: still one customer", async () => {
      const o = await owner();
      const order = await stuckOrder();
      const pay = [...w.gw.payments.values()][0];
      await Promise.all([
        admin(o, { action: "retry_fulfilment", orderId: order.orderId }),
        w.reconcile(),
        w.poll(order.orderId),
        w.deliver(w.gw.paymentEvent("payment.captured", pay)),
        admin(o, { action: "retry_fulfilment", orderId: order.orderId }),
      ]);
      await w.poll(order.orderId);
      await w.reconcile();
      await exactlyOneCustomer();
    });

    it("a permanent problem (the e-mail belongs to another workspace) stays flagged — and once a person fixes the cause the same button finishes the job", async () => {
      const o = await owner();
      const { body: order } = await w.openOrder({ scenes: 5 });
      const other = await w.seedOrg({ name: "Other Co", slug: "other-co" });
      const otherUser = await w.seedUser({ email: BUYER.email, orgId: other.id, role: "org_admin" });
      await w.payInBrowser(order);
      assert.equal((await orderRow()).review_flag, "email_in_use");

      const r1 = await admin(o, { action: "retry_fulfilment", orderId: order.orderId });
      assert.equal(r1.status, 200, r1.text);
      assert.equal(r1.body.built, false);
      assert.match(String(r1.body.error), /email_in_use/);
      assert.equal((await orderRow()).review_flag, "email_in_use", "flagged again, not silently forgotten");
      assert.equal((await orderRow()).provisioned_at, null, "no workspace was handed over, and the other customer was not touched");
      const [p] = await w.q(`select org_id from public.profiles where id = $1`, [otherUser]);
      assert.equal(p.org_id, other.id, "the existing login was not moved");

      // The founder arranges a different login e-mail with the customer, then presses retry again.
      await w.q(`update public.billing_orders set buyer_email = 'asha.new@acme-steel.in' where id = $1`, [order.orderId]);
      const r2 = await admin(o, { action: "retry_fulfilment", orderId: order.orderId });
      assert.equal(r2.status, 200, r2.text);
      assert.equal(r2.body.built, true);
      assert.equal(await w.count("organizations"), 2);
      assert.equal(await w.count("billing_invoices"), 1);
      assert.equal((await orderRow()).review_flag, null);
    });

    it("a still-failing build reports the failure honestly and can be pressed again later", async () => {
      const o = await owner();
      const order = await stuckOrder();
      w.sb.failNext("auth.createUser", 500);
      const r1 = await admin(o, { action: "retry_fulfilment", orderId: order.orderId });
      assert.equal(r1.status, 200, r1.text);
      assert.equal(r1.body.built, false);
      assert.equal(r1.body.retriable, true);
      assert.equal(await customerLogins(), 0);
      assert.equal(await w.count("billing_invoices"), 0);
      w.sb.clearFailures();
      const r2 = await admin(o, { action: "retry_fulfilment", orderId: order.orderId });
      assert.equal(r2.body.built, true);
      await exactlyOneCustomer();
    });

    it("cannot build an order that is not paid (nobody paid, or a card was only authorised)", async () => {
      const o = await owner();
      const { body: unpaid } = await w.openOrder({ scenes: 5 });
      const r = await admin(o, { action: "retry_fulfilment", orderId: unpaid.orderId });
      assert.equal(r.status, 409);
      assert.equal(r.body.error, "not_paid");

      const { body: auth } = await w.openOrder({ scenes: 6, buyer: { email: "x@auth-co.in", company: "Auth Co" } });
      w.gw.pay(auth.razorpayOrderId, { status: "authorized" });
      const r2 = await admin(o, { action: "retry_fulfilment", orderId: auth.orderId });
      assert.equal(r2.status, 409);
      assert.equal(await customerLogins(), 0);
      assert.equal(await w.count("billing_invoices"), 0);
      assert.equal(w.gw.emails.filter((m) => /workspace|invoice/i.test(m.subject)).length, 0);
    });

    it("cannot build an order that was refunded before it was built", async () => {
      const o = await owner();
      const order = await stuckOrder();
      const pay = [...w.gw.payments.values()][0];
      const refund = w.gw.makeRefund(pay.id, pay.amount);
      await w.deliver(w.gw.refundEvent("refund.processed", refund));
      assert.equal((await orderRow()).status, "refunded");

      const r = await admin(o, { action: "retry_fulfilment", orderId: order.orderId });
      assert.equal(r.status, 409, r.text);
      assert.equal(r.body.error, "order_refunded");
      assert.equal(await customerLogins(), 0, "no login for refunded money");
      assert.equal((await orderRow()).provisioned_at, null);
      assert.equal(
        await w.count("organizations", "plan_status = 'active'"),
        0,
        "any half-made workspace shell stays cancelled"
      );
      assert.equal(w.gw.emails.filter((m) => /workspace/i.test(m.subject)).length, 0, "no welcome e-mail");
    });

    it("unknown order → 404, and a well-formed random id changes nothing", async () => {
      const o = await owner();
      const r = await admin(o, { action: "retry_fulfilment", orderId: crypto.randomUUID() });
      assert.equal(r.status, 404);
      assert.equal(r.body.error, "order_not_found");
    });

    it("the 'already built' answer does not leak who the customer is", async () => {
      const o = await owner();
      const { body: order } = await w.openOrder({ scenes: 5 });
      await w.payInBrowser(order);
      const r = await admin(o, { action: "retry_fulfilment", orderId: order.orderId });
      assert.equal(r.status, 409);
      assert.ok(!r.text.includes(BUYER.email));
      assert.ok(!r.text.includes("Acme"));
    });
  });

  /* ───────────────────────────── re-ask Razorpay ───────────────────────────── */

  describe("resync_order", () => {
    it("heals a payment whose webhook and browser callback never arrived", async () => {
      const o = await owner();
      const { body: order } = await w.openOrder({ scenes: 5 });
      w.gw.pay(order.razorpayOrderId); // captured at Razorpay; we heard nothing
      assert.equal((await orderRow()).status, "created");

      const r = await admin(o, { action: "resync_order", orderId: order.orderId });
      assert.equal(r.status, 200, r.text);
      assert.equal(r.body.checked, true);
      assert.equal(r.body.status, "paid");
      assert.equal(r.body.built, true);
      await exactlyOneCustomer();
    });

    it("pressing it again never refunds or rebuilds anything", async () => {
      const o = await owner();
      const { body: order } = await w.openOrder({ scenes: 5 });
      w.gw.pay(order.razorpayOrderId);
      for (let i = 0; i < 4; i++) {
        const r = await admin(o, { action: "resync_order", orderId: order.orderId });
        assert.equal(r.status, 200, r.text);
        assert.equal(r.body.status, "paid");
      }
      assert.equal(w.gw.refunds.size, 0, "the customer's real payment was never treated as a duplicate");
      await exactlyOneCustomer();
    });

    it("simultaneous presses settle once", async () => {
      const o = await owner();
      const { body: order } = await w.openOrder({ scenes: 5 });
      w.gw.pay(order.razorpayOrderId);
      const rs = await Promise.all(Array.from({ length: 5 }, () => admin(o, { action: "resync_order", orderId: order.orderId })));
      for (const r of rs) assert.equal(r.status, 200, r.text);
      assert.equal(w.gw.refunds.size, 0);
      await exactlyOneCustomer();
    });

    it("when nobody has paid it reports that plainly and builds nothing", async () => {
      const o = await owner();
      const { body: order } = await w.openOrder({ scenes: 5 });
      const r = await admin(o, { action: "resync_order", orderId: order.orderId });
      assert.equal(r.status, 200);
      assert.equal(r.body.status, "created");
      assert.equal(r.body.built, false);
      assert.equal(await customerLogins(), 0);

      w.gw.pay(order.razorpayOrderId, { status: "failed" });
      const r2 = await admin(o, { action: "resync_order", orderId: order.orderId });
      assert.equal(r2.body.built, false);
      assert.equal(await w.count("billing_invoices"), 0);
    });

    it("a payment of the wrong amount is NOT accepted by pressing resync", async () => {
      const o = await owner();
      const { body: order } = await w.openOrder({ scenes: 5 });
      w.gw.pay(order.razorpayOrderId, { amount: order.amountPaise - 100 });
      const r = await admin(o, { action: "resync_order", orderId: order.orderId });
      assert.equal(r.status, 200, r.text);
      assert.notEqual(r.body.status, "paid");
      assert.equal(r.body.built, false);
      assert.equal(await customerLogins(), 0);
      assert.equal(await w.count("billing_alerts", "kind = 'amount_mismatch' and severity = 'critical'"), 1);
    });

    it("Razorpay down → 502, nothing changes, and the next press works", async () => {
      const o = await owner();
      const { body: order } = await w.openOrder({ scenes: 5 });
      w.gw.pay(order.razorpayOrderId);
      w.gw.failNext("GET /v1/orders", 1, 503);
      const r = await admin(o, { action: "resync_order", orderId: order.orderId });
      assert.equal(r.status, 502, r.text);
      assert.equal((await orderRow()).status, "created");
      assert.equal(await customerLogins(), 0);

      const r2 = await admin(o, { action: "resync_order", orderId: order.orderId });
      assert.equal(r2.status, 200, r2.text);
      assert.equal(r2.body.built, true);
      await exactlyOneCustomer();
    });

    it("an order that never reached Razorpay, and an unknown order, are refused", async () => {
      const o = await owner();
      const { body: order } = await w.openOrder({ scenes: 5 });
      await w.q(`update public.billing_orders set razorpay_order_id = null where id = $1`, [order.orderId]);
      const r = await admin(o, { action: "resync_order", orderId: order.orderId });
      assert.equal(r.status, 409);
      assert.equal(r.body.error, "no_gateway_order");
      assert.equal((await admin(o, { action: "resync_order", orderId: crypto.randomUUID() })).status, 404);
    });

    it("does not resurrect an order that was refunded", async () => {
      const o = await owner();
      const { body: order } = await w.openOrder({ scenes: 5 });
      const pay = w.gw.pay(order.razorpayOrderId);
      await w.deliver(w.gw.paymentEvent("payment.captured", pay));
      await w.poll(order.orderId);
      const refund = w.gw.makeRefund(pay.id, pay.amount);
      await w.deliver(w.gw.refundEvent("refund.processed", refund));
      const orgsBefore = await w.count("organizations");

      const r = await admin(o, { action: "resync_order", orderId: order.orderId });
      assert.equal(r.status, 200, r.text);
      assert.notEqual((await orderRow()).status, "paid", "refunded money does not become a live order again");
      assert.equal(await w.count("organizations"), orgsBefore);
      assert.equal(await w.count("billing_invoices"), 1);
      assert.equal(w.gw.refunds.size, 1, "no extra refund either");
    });
  });

  /* ───────────────────────────── alerts and flags ───────────────────────────── */

  describe("resolve_alert", () => {
    it("closes an open alert once; closing it again, or an unknown one, is told so", async () => {
      const o = await owner();
      await stuckOrder();
      const [alert] = await w.q(`select id from public.billing_alerts where kind = 'fulfilment_stuck' and resolved_at is null`);
      const r = await admin(o, { action: "resolve_alert", alertId: alert.id });
      assert.equal(r.status, 200, r.text);
      assert.equal(r.body.resolved, true);
      assert.equal(await w.count("billing_alerts", "kind = 'fulfilment_stuck' and resolved_at is null"), 0);

      const again = await admin(o, { action: "resolve_alert", alertId: alert.id });
      assert.equal(again.status, 409);
      assert.equal(again.body.error, "already_resolved");
      assert.equal((await admin(o, { action: "resolve_alert", alertId: crypto.randomUUID() })).status, 404);
    });

    it("an audit row can never be 'resolved' away or rewritten through this tool", async () => {
      const o = await owner();
      await admin(o, { action: "retry_fulfilment", orderId: crypto.randomUUID() });
      const [row] = await w.q(`select id, detail from public.billing_alerts where kind = 'admin_action'`);
      const r = await admin(o, { action: "resolve_alert", alertId: row.id });
      assert.equal(r.status, 409);
      const [after] = await w.q(`select detail from public.billing_alerts where id = $1`, [row.id]);
      assert.ok(String(after.detail).startsWith(String(row.detail).split(" · ")[0]));
    });
  });

  describe("dismiss_flag", () => {
    it("clears the flag on an order a person has dealt with, and says what it was", async () => {
      const o = await owner();
      const { body: order } = await w.openOrder({ scenes: 5 });
      w.gw.pay(order.razorpayOrderId, { amount: order.amountPaise - 100 });
      await admin(o, { action: "resync_order", orderId: order.orderId });
      assert.equal((await orderRow()).review_flag, "amount_mismatch");

      const r = await admin(o, { action: "dismiss_flag", orderId: order.orderId, note: "Refunded the short payment in the Razorpay dashboard" });
      assert.equal(r.status, 200, r.text);
      assert.equal(r.body.was, "amount_mismatch");
      assert.equal((await orderRow()).review_flag, null);

      const again = await admin(o, { action: "dismiss_flag", orderId: order.orderId, note: "Pressed twice by mistake" });
      assert.equal(again.status, 409);
      assert.equal(again.body.error, "not_flagged");

      const trail = (await audits()).map((a) => String(a.detail)).join("\n");
      assert.match(trail, /Refunded the short payment/, "the reason is in the audit trail");
    });

    it("refuses to hide a PAID customer who is not set up yet — that needs the retry button", async () => {
      const o = await owner();
      const { body: order } = await w.openOrder({ scenes: 5 });
      const other = await w.seedOrg({ name: "Other Co", slug: "other-co" });
      await w.seedUser({ email: BUYER.email, orgId: other.id, role: "org_admin" });
      await w.payInBrowser(order);
      assert.equal((await orderRow()).review_flag, "email_in_use");

      const r = await admin(o, { action: "dismiss_flag", orderId: order.orderId, note: "I will sort it out later" });
      assert.equal(r.status, 409);
      assert.equal(r.body.error, "use_retry");
      assert.equal((await orderRow()).review_flag, "email_in_use", "still visible on the payments page");
    });

    it("an unflagged or unknown order is refused", async () => {
      const o = await owner();
      const { body: order } = await w.openOrder({ scenes: 5 });
      assert.equal((await admin(o, { action: "dismiss_flag", orderId: order.orderId, note: "nothing to clear" })).status, 409);
      assert.equal((await admin(o, { action: "dismiss_flag", orderId: crypto.randomUUID(), note: "nothing to clear" })).status, 404);
    });
  });

  /* ───────────────────────────── trail and fail-closed ───────────────────────────── */

  describe("audit trail", () => {
    it("every action leaves exactly one row with who, what, which order and what happened", async () => {
      const o = await owner();
      const order = await stuckOrder();
      const r = await admin(o, { action: "retry_fulfilment", orderId: order.orderId });
      assert.equal(r.status, 200);
      await admin(o, { action: "retry_fulfilment", orderId: order.orderId }); // refused: already built

      const rows = await audits();
      assert.equal(rows.length, 2);
      assert.ok(rows.every((x) => x.severity === "info" && x.resolved_at), "audit rows are informational and never 'open'");
      assert.match(String(rows[0].detail), /owner@vpv\.in/);
      assert.match(String(rows[0].detail), /retry_fulfilment/);
      assert.ok(String(rows[0].detail).includes(order.orderId));
      assert.match(String(rows[0].detail), /built/);
      assert.match(String(rows[1].detail), /already built/);
      assert.equal(rows[0].order_id, order.orderId);
    });

    it("audit rows are not shown among the open alerts on the payments page", async () => {
      const o = await owner();
      await admin(o, { action: "retry_fulfilment", orderId: crypto.randomUUID() });
      const health = await w.sb.as("authenticated", o).rpc("admin_billing_health");
      assert.equal(health.error, null, JSON.stringify(health.error));
      assert.ok(!(health.data.open_alerts as { kind: string }[]).some((a) => a.kind === "admin_action"));
    });

    it("FAILS CLOSED: if the audit row cannot be written, the action does not run", async () => {
      const o = await owner();
      const order = await stuckOrder();
      w.sb.failNext("from:billing_alerts", 1);
      const r = await admin(o, { action: "retry_fulfilment", orderId: order.orderId });
      assert.equal(r.status, 503, r.text);
      assert.equal(r.body.error, "audit_unavailable");
      assert.equal(await customerLogins(), 0, "nothing was built without a record");
      assert.equal(Number((await orderRow()).fulfilment_attempts), 8, "not even the counter was reset");

      const ok = await admin(o, { action: "retry_fulfilment", orderId: order.orderId });
      assert.equal(ok.status, 200, ok.text);
      assert.equal(ok.body.built, true);
    });

    it("a database error inside an action never leaks internals, and is recorded", async () => {
      const o = await owner();
      const order = await stuckOrder();
      w.sb.failNext("from:billing_orders", 1, { message: 'relation "secret_internal_table" violates constraint xyz' });
      const r = await admin(o, { action: "retry_fulfilment", orderId: order.orderId });
      assert.equal(r.status, 500, r.text);
      assert.ok(!r.text.includes("secret_internal_table"));
      assert.ok(!/violates|constraint|relation/i.test(r.text));
      const rows = await audits();
      assert.equal(rows.length, 1);
      assert.match(String(rows[0].detail), /failed/);
      assert.equal(await customerLogins(), 0);

      // ...and pressing it again afterwards works.
      assert.equal((await admin(o, { action: "retry_fulfilment", orderId: order.orderId })).body.built, true);
    });

    it("responses are never cached", async () => {
      const o = await owner();
      const r = await admin(o, { action: "resolve_alert", alertId: crypto.randomUUID() });
      assert.match(r.res.headers.get("cache-control") || "", /no-store/);
    });
  });
});
