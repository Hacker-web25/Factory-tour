import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { makeWorld, BUYER, freshIp, type World } from "./harness/world";

/**
 * Money going back out. A refund (from the Razorpay dashboard, or a bank
 * chargeback) must take back exactly what the purchase gave, issue a GST
 * credit note once, tell the customer once, and never double-count however
 * many times Razorpay repeats itself or in whatever order events arrive.
 */
describe("refunds, partial refunds and chargebacks", () => {
  let w: World;
  before(async () => {
    w = await makeWorld();
  });
  beforeEach(async () => {
    await w.reset();
    w.sb.clearFailures();
  });
  after(() => w.gw.uninstall());

  async function buyBasic(scenes = 5, buyer: Partial<typeof BUYER> = {}) {
    const { body: order } = await w.openOrder({ scenes, buyer });
    assert.ok(order.orderId, JSON.stringify(order));
    const paid = await w.payInBrowser(order);
    assert.equal((await w.poll(order.orderId)).body.status, "ready");
    return { order, payment: paid.payment };
  }

  async function openAuthed(userId: string, purpose: "scene_topup" | "support_renewal", scenes?: number) {
    const res = await w.routes.order.POST(w.request("/api/billing/order", { as: userId, body: { purpose, scenes, buyer: {} } }));
    return { res, body: await w.readJson(res), status: res.status };
  }

  const org = async () => (await w.q(`select * from public.organizations order by created_at limit 1`))[0];
  const order0 = async () => (await w.q(`select * from public.billing_orders order by created_at limit 1`))[0];
  const refundMails = (email = BUYER.email) => w.gw.emailsTo(email).filter((m) => /refund/i.test(m.subject));

  /* ─────────────────────────────── full refunds ─────────────────────────────── */

  describe("full refund of a Basic licence", () => {
    it("closes the order and workspace, issues one credit note, e-mails the customer once", async () => {
      const { payment } = await buyBasic();
      const refund = w.gw.makeRefund(payment.id, payment.amount);
      const d = await w.deliver(w.gw.refundEvent("refund.processed", refund));
      assert.equal(d.status, 200);

      const o = await order0();
      assert.equal(o.status, "refunded");
      assert.equal(Number(o.refunded_paise), payment.amount);
      assert.ok(o.revoked_at);
      assert.equal((await org()).plan_status, "cancelled");
      assert.equal(await w.count("billing_credit_notes"), 1);
      const [cn] = await w.q(`select * from public.billing_credit_notes`);
      assert.match(cn.credit_note_no, /^TEST\/CN\//);
      assert.equal(Number(cn.total_paise), payment.amount);
      assert.equal(refundMails().length, 1);
      assert.ok(cn.emailed_at, "credit note marked as sent");
      assert.ok(refundMails()[0].html.includes(cn.credit_note_no), "the e-mail names the credit note");
      assert.equal((await w.q(`select status from public.billing_payments`))[0].status, "refunded");
    });

    it("'refund.created' alone changes nothing; 'refund.processed' then completes it", async () => {
      const { payment } = await buyBasic();
      const refund = w.gw.makeRefund(payment.id, payment.amount);
      await w.deliver(w.gw.refundEvent("refund.created", refund));
      assert.equal((await org()).plan_status, "active");
      assert.equal(await w.count("billing_credit_notes"), 0);
      assert.equal(refundMails().length, 0);

      await w.deliver(w.gw.refundEvent("refund.processed", refund));
      assert.equal((await org()).plan_status, "cancelled");
      assert.equal(await w.count("billing_credit_notes"), 1);
    });

    it("the same 'processed' event delivered many times (same id, new ids, in parallel) changes things once", async () => {
      const { payment } = await buyBasic();
      const refund = w.gw.makeRefund(payment.id, payment.amount);
      const same = w.gw.refundEvent("refund.processed", refund, "evt_refund_same");
      await Promise.all([
        w.deliver(same),
        w.deliver(same),
        w.deliver(w.gw.refundEvent("refund.processed", refund)),
        w.deliver(w.gw.refundEvent("refund.processed", refund)),
        w.deliver(w.gw.refundEvent("refund.processed", refund)),
      ]);
      await w.deliver(w.gw.refundEvent("refund.processed", refund));
      assert.equal(await w.count("billing_refunds"), 1);
      assert.equal(await w.count("billing_credit_notes"), 1);
      assert.equal(refundMails().length, 1, "one refund e-mail");
      assert.equal(Number((await order0()).refunded_paise), payment.amount, "not double-counted");
    });

    it("a late 'refund.failed' for a refund that did succeed cannot reopen the workspace", async () => {
      const { payment } = await buyBasic();
      const refund = w.gw.makeRefund(payment.id, payment.amount);
      await w.deliver(w.gw.refundEvent("refund.processed", refund));
      await w.deliver(w.gw.refundEvent("refund.failed", { ...refund, status: "failed" }));
      assert.equal((await order0()).status, "refunded");
      assert.equal((await org()).plan_status, "cancelled");
      assert.equal((await w.q(`select status from public.billing_refunds`))[0].status, "processed");
    });

    it("a refund that FAILS revokes nothing and alerts the founders", async () => {
      const { payment } = await buyBasic();
      const refund = { ...w.gw.makeRefund(payment.id, payment.amount), status: "failed" as const };
      await w.deliver(w.gw.refundEvent("refund.failed", refund));
      assert.equal((await org()).plan_status, "active");
      assert.equal((await order0()).status, "paid");
      assert.equal(await w.count("billing_credit_notes"), 0);
      assert.equal(await w.count("billing_alerts", "kind = 'refund_failed' and severity = 'critical'"), 1);
    });

    it("a refund for a payment that is not ours (another product on the same Razorpay account) is acknowledged and ignored", async () => {
      await buyBasic();
      const foreign = w.gw.foreignPayment();
      const stranger = w.gw.makeRefund(foreign.id, 100000);
      const d = await w.deliver(w.gw.refundEvent("refund.processed", stranger));
      assert.equal(d.status, 200);
      assert.equal((await org()).plan_status, "active");
      assert.equal(await w.count("billing_credit_notes"), 0);
    });

    it("a refund event with a missing payment or refund id is ignored without crashing", async () => {
      const bad = w.gw.signedWebhook("refund.processed", { refund: { entity: { id: "rfnd_x" } } });
      assert.equal((await w.deliver(bad)).status, 200);
      const bad2 = w.gw.signedWebhook("refund.processed", {});
      assert.equal((await w.deliver(bad2)).status, 200);
    });

    it("if the e-mail provider is down when the refund lands, the credit note still reaches the customer later — once", async () => {
      const { payment } = await buyBasic();
      w.gw.emailsDown = true;
      const refund = w.gw.makeRefund(payment.id, payment.amount);
      assert.equal((await w.deliver(w.gw.refundEvent("refund.processed", refund))).status, 200);
      assert.equal(refundMails().length, 0);
      assert.equal((await w.q(`select emailed_at from public.billing_credit_notes`))[0].emailed_at, null);

      w.gw.emailsDown = false;
      await w.unprotected(() => w.q(`update public.billing_credit_notes set issued_at = now() - interval '10 minutes'`));
      const r = await w.reconcile();
      assert.equal(r.body.creditNotes, 1, JSON.stringify(r.body));
      assert.equal(refundMails().length, 1);
      assert.equal((await w.reconcile()).body.creditNotes, 0);
      assert.equal(refundMails().length, 1);
    });
  });

  /* ─────────────────────────────── partial refunds ─────────────────────────────── */

  describe("partial refunds", () => {
    it("a partial refund keeps the workspace, issues a proportional credit note, and a second one that completes the total closes it", async () => {
      const { payment } = await buyBasic(8);
      const first = Math.round(payment.amount * 0.3);
      const r1 = w.gw.makeRefund(payment.id, first);
      await w.deliver(w.gw.refundEvent("refund.processed", r1));

      let o = await order0();
      assert.equal(o.status, "paid", "still a paying customer");
      assert.equal(Number(o.refunded_paise), first);
      assert.equal((await org()).plan_status, "active");
      assert.equal(await w.count("billing_credit_notes"), 1);
      assert.equal((await w.q(`select status from public.billing_payments`))[0].status, "partially_refunded");

      const r2 = w.gw.makeRefund(payment.id, payment.amount - first);
      await w.deliver(w.gw.refundEvent("refund.processed", r2));
      o = await order0();
      assert.equal(o.status, "refunded");
      assert.equal((await org()).plan_status, "cancelled");
      assert.equal(await w.count("billing_credit_notes"), 2);
      const sum = (await w.q(`select sum(total_paise)::bigint s, sum(taxable_paise + cgst_paise + sgst_paise + igst_paise)::bigint t from public.billing_credit_notes`))[0];
      assert.equal(Number(sum.s), payment.amount, "credit notes add up to the invoice");
      assert.equal(Number(sum.t), payment.amount, "taxable + tax on the notes equals what was refunded");
      const nos = (await w.q(`select credit_note_no from public.billing_credit_notes order by credit_note_no`)).map((x) => Number(String(x.credit_note_no).split("/").pop()));
      assert.deepEqual(nos, [1, 2], "credit-note numbers run without gaps");
    });

    it("replaying the first partial refund after the second one does not change the totals", async () => {
      const { payment } = await buyBasic(8);
      const first = Math.round(payment.amount * 0.4);
      const r1 = w.gw.makeRefund(payment.id, first);
      const r2 = w.gw.makeRefund(payment.id, payment.amount - first);
      await w.deliver(w.gw.refundEvent("refund.processed", r1));
      await w.deliver(w.gw.refundEvent("refund.processed", r2));
      await w.deliver(w.gw.refundEvent("refund.processed", r1));
      assert.equal(Number((await order0()).refunded_paise), payment.amount);
      assert.equal(await w.count("billing_credit_notes"), 2);
    });
  });

  /* ─────────────────────── refund before / during the build ─────────────────────── */

  describe("a refund that lands before the customer is fully built", () => {
    it("refunded before any workspace exists → nothing is ever built afterwards", async () => {
      const { body: order } = await w.openOrder({ scenes: 5 });
      w.sb.failNext("rpc:billing_create_org_for_order", 50);
      const pay = w.gw.pay(order.razorpayOrderId);
      assert.equal((await w.deliver(w.gw.paymentEvent("payment.captured", pay))).status, 500);

      const refund = w.gw.makeRefund(pay.id, pay.amount);
      assert.equal((await w.deliver(w.gw.refundEvent("refund.processed", refund))).status, 200);
      w.sb.clearFailures();

      assert.equal((await w.poll(order.orderId)).body.status, "refunded");
      await w.reconcile();
      assert.equal(await w.count("organizations"), 0);
      assert.equal(await w.count("billing_invoices"), 0);
      assert.equal((await w.q(`select count(*)::int n from auth.users`))[0].n, 0);
      assert.equal(w.gw.emailsTo(BUYER.email).filter((m) => /workspace/i.test(m.subject)).length, 0);
      // The retry of the original "captured" webhook cannot resurrect the order either.
      assert.equal((await w.deliver(w.gw.paymentEvent("payment.captured", pay))).status, 200);
      assert.equal(await w.count("organizations"), 0);
    });

    it("refunded in the middle of the build → the build stops: no invoice, no welcome e-mail, workspace closed", async () => {
      const { body: order } = await w.openOrder({ scenes: 5 });
      w.sb.failNext("rpc:billing_issue_invoice", 1); // org + login exist; invoice step fails
      const paid = await w.payInBrowser(order);
      assert.equal(paid.body.status, "processing");
      assert.equal(await w.count("organizations"), 1);

      const refund = w.gw.makeRefund(paid.payment.id, paid.payment.amount);
      await w.deliver(w.gw.refundEvent("refund.processed", refund));
      assert.equal((await org()).plan_status, "cancelled");

      assert.equal((await w.poll(order.orderId)).body.status, "refunded");
      await w.reconcile();
      assert.equal(await w.count("billing_invoices"), 0, "no invoice for a refunded order");
      assert.equal(w.gw.emailsTo(BUYER.email).filter((m) => /workspace/i.test(m.subject)).length, 0);
    });

    it("the database itself refuses to build, invoice, top up or renew an order that was refunded (defence in depth)", async () => {
      const { order, payment } = await buyBasic();
      const refund = w.gw.makeRefund(payment.id, payment.amount);
      await w.deliver(w.gw.refundEvent("refund.processed", refund));
      for (const [fn, args] of [
        ["billing_issue_invoice", { p_order: order.orderId, p_description: "x", p_our_state: "Haryana", p_gst_rate: 18, p_sac: "998313" }],
        ["billing_apply_topup", { p_order: order.orderId }],
        ["billing_apply_support_renewal", { p_order: order.orderId }],
        ["billing_create_org_for_order", { p_order: order.orderId, p_slug: "x-co", p_scenes: 5, p_support_months: 12 }],
      ] as const) {
        const r = await w.sb.rpc(fn, args as Record<string, unknown>);
        assert.ok(r.error, `${fn} must refuse`);
        assert.match(String(r.error.message), /order_not_payable/, fn);
      }
    });
  });

  /* ─────────────────────────────── top-ups & renewals ─────────────────────────────── */

  describe("refunding the other purchases", () => {
    it("refunding a scene top-up takes the extra scenes back — and only those", async () => {
      const o = await w.seedOrg({ name: "Top Co", slug: "top-co", quota: 5 });
      const uid = await w.seedUser({ email: "admin@top-co.in", orgId: o.id });
      const a = await openAuthed(uid, "scene_topup", 8);
      assert.equal(a.status, 200, JSON.stringify(a.body));
      const paidA = await w.payInBrowser(a.body);
      assert.equal((await w.poll(a.body.orderId)).body.status, "ready");
      assert.equal(Number((await org()).scene_quota), 8);

      const b = await openAuthed(uid, "scene_topup", 12);
      assert.equal(b.status, 200, JSON.stringify(b.body));
      const paidB = await w.payInBrowser(b.body);
      await w.poll(b.body.orderId);
      assert.equal(Number((await org()).scene_quota), 12);

      await w.deliver(w.gw.refundEvent("refund.processed", w.gw.makeRefund(paidA.payment.id, paidA.payment.amount)));
      assert.equal(Number((await org()).scene_quota), 9, "A's 3 extra scenes removed");
      await w.deliver(w.gw.refundEvent("refund.processed", w.gw.makeRefund(paidB.payment.id, paidB.payment.amount)));
      assert.equal(Number((await org()).scene_quota), 5, "back to the original");
      assert.equal((await org()).plan_status, "active", "the licence itself is untouched");
      assert.equal(await w.count("billing_credit_notes"), 2);
    });

    it("replaying a top-up refund does not remove scenes twice", async () => {
      const o = await w.seedOrg({ name: "Top Co", slug: "top-co", quota: 5 });
      const uid = await w.seedUser({ email: "admin@top-co.in", orgId: o.id });
      const a = await openAuthed(uid, "scene_topup", 9);
      const paid = await w.payInBrowser(a.body);
      await w.poll(a.body.orderId);
      const refund = w.gw.makeRefund(paid.payment.id, paid.payment.amount);
      await Promise.all([1, 2, 3].map(() => w.deliver(w.gw.refundEvent("refund.processed", refund))));
      await w.deliver(w.gw.refundEvent("refund.processed", refund));
      assert.equal(Number((await org()).scene_quota), 5);
    });

    it("refunding a support renewal restores the previous support date exactly", async () => {
      const until = new Date(Date.now() + 10 * 86_400_000).toISOString();
      const o = await w.seedOrg({ name: "Ren Co", slug: "ren-co", quota: 5, supportUntil: until });
      const uid = await w.seedUser({ email: "admin@ren-co.in", orgId: o.id });
      const a = await openAuthed(uid, "support_renewal");
      assert.equal(a.status, 200, JSON.stringify(a.body));
      const paid = await w.payInBrowser(a.body);
      assert.equal((await w.poll(a.body.orderId)).body.status, "ready");
      const extended = new Date((await org()).support_until).getTime();
      assert.ok(extended > new Date(until).getTime() + 300 * 86_400_000, "a year was added");

      await w.deliver(w.gw.refundEvent("refund.processed", w.gw.makeRefund(paid.payment.id, paid.payment.amount)));
      assert.equal(new Date((await org()).support_until).getTime(), new Date(until).getTime());
      assert.equal((await org()).plan_status, "active");
    });

    it("a partial refund of a top-up or renewal takes nothing back", async () => {
      const o = await w.seedOrg({ name: "Top Co", slug: "top-co", quota: 5 });
      const uid = await w.seedUser({ email: "admin@top-co.in", orgId: o.id });
      const a = await openAuthed(uid, "scene_topup", 9);
      const paid = await w.payInBrowser(a.body);
      await w.poll(a.body.orderId);
      await w.deliver(w.gw.refundEvent("refund.processed", w.gw.makeRefund(paid.payment.id, Math.round(paid.payment.amount / 4))));
      assert.equal(Number((await org()).scene_quota), 9);
    });
  });

  /* ─────────────────────────────── chargebacks ─────────────────────────────── */

  describe("chargebacks (disputes)", () => {
    it("a dispute being OPENED changes no access but raises a critical alert and e-mails the founders", async () => {
      const { payment } = await buyBasic();
      const d = await w.deliver(w.gw.disputeEvent("payment.dispute.created", payment.id, payment.amount));
      assert.equal(d.status, 200);
      assert.equal((await org()).plan_status, "active");
      assert.equal((await order0()).status, "paid");
      assert.equal(await w.count("billing_alerts", "kind = 'payment_dispute_created' and severity = 'critical'"), 1);
      assert.ok(w.gw.emails.some((m) => /payment_dispute_created/.test(m.subject)));
    });

    it("two different customers' disputes each raise their own alert", async () => {
      const a = await buyBasic(5, { email: "a@alpha-works.in", company: "Alpha Works" });
      const b = await buyBasic(5, { email: "b@beta-works.in", company: "Beta Works" });
      await w.deliver(w.gw.disputeEvent("payment.dispute.created", a.payment.id, a.payment.amount, "disp_A"));
      await w.deliver(w.gw.disputeEvent("payment.dispute.created", b.payment.id, b.payment.amount, "disp_B"));
      assert.equal(await w.count("billing_alerts", "kind = 'payment_dispute_created'"), 2);
    });

    it("a dispute WON changes nothing; closing it later still changes nothing", async () => {
      const { payment } = await buyBasic();
      await w.deliver(w.gw.disputeEvent("payment.dispute.created", payment.id, payment.amount));
      await w.deliver(w.gw.disputeEvent("payment.dispute.won", payment.id, payment.amount));
      await w.deliver(w.gw.disputeEvent("payment.dispute.closed", payment.id, payment.amount));
      assert.equal((await org()).plan_status, "active");
      assert.equal((await order0()).status, "paid");
      assert.equal(await w.count("billing_credit_notes"), 0);
    });

    it("a dispute LOST is handled like a full refund: access removed, credit note issued, founders alerted", async () => {
      const { payment } = await buyBasic();
      await w.deliver(w.gw.disputeEvent("payment.dispute.created", payment.id, payment.amount));
      const d = await w.deliver(w.gw.disputeEvent("payment.dispute.lost", payment.id, payment.amount));
      assert.equal(d.status, 200);
      assert.equal((await order0()).status, "refunded");
      assert.equal((await org()).plan_status, "cancelled");
      assert.equal(await w.count("billing_credit_notes"), 1);
      assert.equal((await w.q(`select kind from public.billing_refunds`))[0].kind, "chargeback");
      assert.equal(await w.count("billing_alerts", "kind = 'chargeback_lost' and severity = 'critical'"), 1);
    });

    it("replaying 'dispute lost' (even with new event ids, in parallel) takes things back once", async () => {
      const { payment } = await buyBasic();
      await Promise.all(Array.from({ length: 4 }, () => w.deliver(w.gw.disputeEvent("payment.dispute.lost", payment.id, payment.amount))));
      await w.deliver(w.gw.disputeEvent("payment.dispute.lost", payment.id, payment.amount));
      assert.equal(await w.count("billing_refunds"), 1);
      assert.equal(await w.count("billing_credit_notes"), 1);
      assert.equal(Number((await order0()).refunded_paise), payment.amount);
    });

    it("a dispute lost AFTER a manual refund of the same payment does not push the total past the order or revoke twice", async () => {
      const { payment } = await buyBasic();
      await w.deliver(w.gw.refundEvent("refund.processed", w.gw.makeRefund(payment.id, payment.amount)));
      await w.deliver(w.gw.disputeEvent("payment.dispute.lost", payment.id, payment.amount));
      assert.equal((await order0()).status, "refunded");
      assert.equal((await w.q(`select count(*)::int n from public.plan_events where event = 'refund_revoked'`))[0].n, 1, "revoked once");
      assert.equal(await w.count("billing_credit_notes"), 1, "the same money is never credited twice");
      assert.equal(await w.count("billing_alerts", "kind = 'refund_exceeds_order' and severity = 'critical'"), 1, "a human is told it was refunded twice");
    });

    it("a dispute on a payment that is not ours is ignored", async () => {
      await buyBasic();
      const foreign = w.gw.foreignPayment();
      const d = await w.deliver(w.gw.disputeEvent("payment.dispute.lost", foreign.id, 100000));
      assert.equal(d.status, 200);
      assert.equal((await org()).plan_status, "active");
    });
  });

  /* ─────────────────────── what a refunded customer can do next ─────────────────────── */

  describe("after a full refund", () => {
    it("the cancelled workspace cannot buy anything more (top-up, renewal)", async () => {
      const { payment } = await buyBasic();
      await w.deliver(w.gw.refundEvent("refund.processed", w.gw.makeRefund(payment.id, payment.amount)));
      const [prof] = await w.q(`select id from public.profiles limit 1`);
      const t = await openAuthed(prof.id, "scene_topup", 9);
      assert.equal(t.status, 403, JSON.stringify(t.body));
      const r = await openAuthed(prof.id, "support_renewal");
      assert.equal(r.status, 403, JSON.stringify(r.body));
    });

    it("the same person can start over with a fresh purchase only through sign-in (their login still exists, so the public checkout refuses to touch it)", async () => {
      const { payment } = await buyBasic();
      await w.deliver(w.gw.refundEvent("refund.processed", w.gw.makeRefund(payment.id, payment.amount)));
      const again = await w.openOrder({ scenes: 5, ip: freshIp() });
      assert.equal(again.status, 409);
      assert.equal(again.body.error, "account_exists");
    });
  });
});
