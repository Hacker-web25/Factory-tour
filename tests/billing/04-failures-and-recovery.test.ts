import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { makeWorld, BUYER, freshIp, type World } from "./harness/world";

/**
 * "Each point of failure should be checked 100 times."
 * Here every step of the purchase is made to fail — once, repeatedly, and in the
 * worst possible order — and the customer must still end up with exactly one
 * workspace, one login, one invoice and one set of e-mails, with no money lost.
 */
describe("failures, outages and recovery", () => {
  let w: World;
  before(async () => {
    w = await makeWorld();
  });
  beforeEach(async () => {
    await w.reset();
    w.sb.clearFailures();
  });
  after(() => w.gw.uninstall());

  const orderRow = async () => (await w.q(`select * from public.billing_orders order by created_at desc limit 1`))[0];

  async function exactlyOneCustomer() {
    assert.equal(await w.count("organizations"), 1, "one organisation");
    assert.equal(await w.count("billing_invoices"), 1, "one invoice");
    assert.equal(await w.count("billing_payments", "status = 'captured'"), 1, "one captured payment");
    assert.equal((await w.q(`select count(*)::int n from auth.users`))[0].n, 1, "one login");
    assert.equal(await w.count("profiles"), 1, "one profile");
  }

  /** The e-mails the customer should have by now, each exactly once, and a password that really works. */
  async function emailsCompleteAndCorrect(email = BUYER.email) {
    const welcome = w.gw.emailsTo(email).filter((m) => /workspace/i.test(m.subject));
    const invoice = w.gw.emailsTo(email).filter((m) => /invoice/i.test(m.subject));
    assert.equal(welcome.length, 1, `welcome e-mails: ${welcome.length}`);
    assert.equal(invoice.length, 1, `invoice e-mails: ${invoice.length}`);
    const pw = welcome[0].html.match(/[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/)?.[0];
    assert.ok(pw, "the welcome e-mail contains the first password");
    const [u] = await w.q(`select encrypted_password from auth.users`);
    assert.equal(u.encrypted_password, `pw:${pw}`, "the e-mailed password is the one that is actually set");
  }

  /** Move an order's build far enough into the past for the reconciler to treat it as settled. */
  const ageBuild = (minutes = 10) =>
    w.q(`update public.billing_orders set provisioned_at = now() - make_interval(mins => $1) where provisioned_at is not null`, [minutes]);

  /* ───────────────────────── Razorpay unavailable ───────────────────────── */

  describe("when Razorpay misbehaves", () => {
    it("gateway down while opening the order → 502, nothing is left dangling, the retry works", async () => {
      w.gw.failNext("POST /v1/orders", 1, 503);
      const a = await w.openOrder({ scenes: 5 });
      assert.equal(a.status, 502, JSON.stringify(a.body));
      assert.equal(a.body.error, "gateway_error");
      assert.equal(w.gw.orders.size, 0, "no phantom Razorpay order");
      assert.equal(await w.count("billing_orders", "status = 'created'"), 0, "the half-open order is closed");

      const b = await w.openOrder({ scenes: 5 });
      assert.equal(b.status, 200, JSON.stringify(b.body));
      assert.equal(w.gw.orders.size, 1);
      assert.equal(await w.count("billing_orders", "status = 'created'"), 1);
    });

    it("gateway that never answers is cut off by the timeout (customer sees an error, not a hang)", async () => {
      w.gw.hangNext("POST /v1/orders", 1);
      const t0 = Date.now();
      const a = await w.openOrder({ scenes: 5 });
      assert.equal(a.status, 502, JSON.stringify(a.body));
      assert.ok(Date.now() - t0 < 25_000, "gave up in bounded time");
      const b = await w.openOrder({ scenes: 5 });
      assert.equal(b.status, 200, JSON.stringify(b.body));
    });

    it("Razorpay unreachable while the browser reports a payment → 'processing', money is not lost, the poll settles it later", async () => {
      const { body: order } = await w.openOrder({ scenes: 5 });
      w.gw.failNext("GET /v1/payments/", 1, 503);
      const paid = await w.payInBrowser(order);
      assert.equal(paid.res.status, 200);
      assert.equal(paid.body.status, "processing");
      assert.equal(await w.count("organizations"), 0, "nothing built on an unverified claim");

      const s = await w.poll(order.orderId);
      assert.equal(s.body.status, "ready");
      await exactlyOneCustomer();
    });

    it("Razorpay unreachable for the poll as well → the webhook still builds the customer", async () => {
      const { body: order } = await w.openOrder({ scenes: 5 });
      w.gw.failNext("GET /v1/payments/", 1, 503);
      w.gw.failNext("GET /v1/orders/", 5, 503);
      const paid = await w.payInBrowser(order);
      assert.equal(paid.body.status, "processing");
      const s = await w.poll(order.orderId);
      assert.equal(s.body.status, "awaiting_payment", "poll cannot reach Razorpay and does not guess");
      await w.deliver(w.gw.paymentEvent("payment.captured", paid.payment));
      assert.equal((await w.poll(order.orderId)).body.status, "ready");
      await exactlyOneCustomer();
    });

    it("a late 'payment.failed' for a first attempt does not disturb a later successful payment", async () => {
      const { body: order } = await w.openOrder({ scenes: 5 });
      const failed = w.gw.pay(order.razorpayOrderId, { status: "failed" });
      const good = await w.payInBrowser(order);
      assert.equal(good.body.status, "ready");
      await w.deliver(w.gw.paymentEvent("payment.failed", failed));
      assert.equal((await w.poll(order.orderId)).body.status, "ready");
      await exactlyOneCustomer();
    });
  });

  /* ───────────────────── crashes while building the customer ───────────────────── */

  describe("when building the customer crashes part-way", () => {
    const crashAt: Array<{ name: string; arm: () => void }> = [
      { name: "creating the organisation", arm: () => w.sb.failNext("rpc:billing_create_org_for_order", 1) },
      { name: "creating the login", arm: () => w.sb.failNext("auth.createUser", 1) },
      { name: "looking up an existing login", arm: () => w.sb.failNext("rpc:billing_find_auth_user", 1) },
      { name: "writing the profile", arm: () => w.sb.failNext("from:profiles", 2) },
      // billing_orders is read first by the confirm route itself, so the link step is the 2nd call and the final "built" mark the 3rd.
      { name: "linking the login to the order", arm: () => w.sb.failNext("from:billing_orders", 1, { message: "injected failure" }, 1) },
      { name: "issuing the invoice", arm: () => w.sb.failNext("rpc:billing_issue_invoice", 1) },
      { name: "marking the order as built", arm: () => w.sb.failNext("from:billing_orders", 1, { message: "injected failure" }, 2) },
    ];

    for (const c of crashAt) {
      it(`crash while ${c.name} → the retry finishes the job without duplicating anything`, async () => {
        const { body: order } = await w.openOrder({ scenes: 5 });
        c.arm();
        const paid = await w.payInBrowser(order);
        assert.equal(paid.res.status, 200);
        assert.equal(paid.body.status, "processing", `the customer is told to wait, not that it failed (${JSON.stringify(paid.body)})`);

        const s = await w.poll(order.orderId);
        assert.equal(s.body.status, "ready", JSON.stringify(s.body));
        await exactlyOneCustomer();
        await emailsCompleteAndCorrect();
      });
    }

    it("crash after the login was created but before the order learned about it → the retry reuses that login and still hands over the password", async () => {
      const { body: order } = await w.openOrder({ scenes: 5 });
      // 1st profiles call (select) and 2nd (upsert) fail: the user exists, the profile does not.
      w.sb.failNext("from:profiles", 2);
      await w.payInBrowser(order);
      assert.equal((await w.q(`select count(*)::int n from auth.users`))[0].n, 1, "login already exists");
      assert.equal(await w.count("profiles"), 0, "but no profile yet");

      assert.equal((await w.poll(order.orderId)).body.status, "ready");
      await exactlyOneCustomer();
      const o = await orderRow();
      assert.equal(o.admin_user_new, true, "recognised as the login created for THIS order");
      await emailsCompleteAndCorrect();
    });

    it("two crashes in a row, then success → still exactly one of everything", async () => {
      const { body: order } = await w.openOrder({ scenes: 5 });
      w.sb.failNext("rpc:billing_issue_invoice", 2);
      await w.payInBrowser(order);
      assert.equal((await w.poll(order.orderId)).body.status, "processing");
      assert.equal((await w.poll(order.orderId)).body.status, "ready");
      await exactlyOneCustomer();
      await emailsCompleteAndCorrect();
    });

    it("an invoice that crashes does not burn a number: the next customer gets the next number", async () => {
      const a = await w.openOrder({ scenes: 5, buyer: { email: "a@alpha-works.in", company: "Alpha Works" } });
      w.sb.failNext("rpc:billing_issue_invoice", 1);
      await w.payInBrowser(a.body);
      await w.poll(a.body.orderId);

      const b = await w.openOrder({ scenes: 5, buyer: { email: "b@beta-works.in", company: "Beta Works" } });
      await w.payInBrowser(b.body);
      await w.poll(b.body.orderId);

      const seq = (await w.q(`select invoice_no from public.billing_invoices`)).map((r) => Number(String(r.invoice_no).split("/").pop())).sort((x, y) => x - y);
      assert.deepEqual(seq, [1, 2], "numbers 1 and 2 with no gap");
    });

    it("a login that already belongs to another workspace is NEVER moved: the order is flagged for a person and the founders are alerted", async () => {
      const { body: order } = await w.openOrder({ scenes: 5 });
      assert.ok(order.orderId, JSON.stringify(order));
      const other = await w.seedOrg({ name: "Other Co", slug: "other-co" });
      await w.seedUser({ email: BUYER.email, orgId: other.id, role: "org_admin" });

      const paid = await w.payInBrowser(order);
      assert.equal(paid.res.status, 200);
      const s = await w.poll(order.orderId);
      assert.equal(s.body.status, "review", JSON.stringify(s.body));
      const [prof] = await w.q(`select org_id from public.profiles where lower(email) = lower($1)`, [BUYER.email]);
      assert.equal(prof.org_id, other.id, "the existing account was not moved");
      assert.ok((await w.count("billing_alerts", "kind = 'fulfilment_email_in_use' and severity = 'critical'")) >= 1);
      assert.ok(w.gw.emails.some((m) => /payments/i.test(m.subject)), "founders were e-mailed");
    });

    it("a build that keeps failing is retried exactly MAX times, then stops and shouts for a person", async () => {
      const { body: order } = await w.openOrder({ scenes: 5 });
      w.sb.failNext("auth.createUser", 500);
      await w.payInBrowser(order); // attempt 1
      for (let i = 0; i < 12; i++) await w.poll(order.orderId); // far more polls than attempts
      const o = await orderRow();
      assert.equal(Number(o.fulfilment_attempts), 8, "automatic attempts are capped");
      assert.equal(o.status, "paid");
      assert.equal(o.provisioned_at, null);
      assert.ok((await w.count("billing_alerts", "kind = 'fulfilment_stuck' and severity = 'critical'")) === 1, "exactly one critical alert");
      assert.equal(
        w.gw.emails.filter((m) => /fulfilment_stuck/.test(m.subject)).length,
        1,
        "founders e-mailed once, not once per poll"
      );
      // The customer is told the truth, not a spinner forever.
      assert.equal((await w.poll(order.orderId)).body.status, "processing");

      // Once the fault is fixed and a person resets the counter, the same order builds normally.
      w.sb.clearFailures();
      await w.q(`update public.billing_orders set fulfilment_attempts = 0, fulfilment_started_at = null`);
      assert.equal((await w.poll(order.orderId)).body.status, "ready");
      await exactlyOneCustomer();
    });
  });

  /* ───────────────────── workers that die mid-build ───────────────────── */

  describe("fulfilment claims", () => {
    it("a live worker's claim blocks a second builder; a dead worker's (stale) claim is taken over — one customer either way", async () => {
      const { body: order } = await w.openOrder({ scenes: 5 });
      w.sb.failNext("rpc:billing_create_org_for_order", 1);
      await w.payInBrowser(order); // paid, not built
      assert.equal(await w.count("billing_orders", "status = 'paid' and provisioned_at is null"), 1);

      // Pretend another worker started building a moment ago.
      await w.q(`update public.billing_orders set fulfilment_started_at = now()`);
      assert.equal((await w.poll(order.orderId)).body.status, "processing");
      assert.equal(await w.count("organizations"), 0, "second builder stood aside");

      // That worker died ten minutes ago.
      await w.q(`update public.billing_orders set fulfilment_started_at = now() - interval '10 minutes'`);
      assert.equal((await w.poll(order.orderId)).body.status, "ready");
      await exactlyOneCustomer();
    });

    it("eight pollers racing for a paid-but-unbuilt order build the customer once", async () => {
      const { body: order } = await w.openOrder({ scenes: 5 });
      w.sb.failNext("rpc:billing_create_org_for_order", 1);
      await w.payInBrowser(order);
      const ip = freshIp();
      await Promise.all(Array.from({ length: 8 }, () => w.poll(order.orderId, ip)));
      assert.equal((await w.poll(order.orderId)).body.status, "ready");
      await exactlyOneCustomer();
      await emailsCompleteAndCorrect();
    });
  });

  /* ───────────────────────── e-mail trouble ───────────────────────── */

  describe("when e-mail fails", () => {
    it("e-mail provider fully down: the customer is still built and told 'ready'; the reconciler sends each e-mail once when it is back", async () => {
      w.gw.emailsDown = true;
      const { body: order } = await w.openOrder({ scenes: 5 });
      const paid = await w.payInBrowser(order);
      assert.equal(paid.body.status, "ready", "payment never depends on e-mail");
      assert.equal(w.gw.emailsTo(BUYER.email).length, 0);
      const o = await orderRow();
      assert.equal(o.welcome_emailed_at, null);
      assert.equal(o.invoice_emailed_at, null);

      w.gw.emailsDown = false;
      // Too soon: the reconciler leaves a build younger than 2 minutes to the live flow.
      const early = await w.reconcile();
      assert.equal(early.body.emailed, 0);
      assert.equal(w.gw.emailsTo(BUYER.email).length, 0);

      await ageBuild(10);
      const r = await w.reconcile();
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.emailed, 1);
      await emailsCompleteAndCorrect();

      const again = await w.reconcile();
      assert.equal(again.body.emailed, 0, "nothing is sent twice");
      assert.equal(w.gw.emailsTo(BUYER.email).length, 2);
    });

    it("one bounced welcome e-mail → only the welcome is re-sent later, the invoice is not duplicated", async () => {
      w.gw.emailFailuresRemaining = 1; // the first send (welcome) bounces
      const { body: order } = await w.openOrder({ scenes: 5 });
      await w.payInBrowser(order);
      assert.equal(w.gw.emailsTo(BUYER.email).filter((m) => /invoice/i.test(m.subject)).length, 1);
      assert.equal(w.gw.emailsTo(BUYER.email).filter((m) => /workspace/i.test(m.subject)).length, 0);

      await ageBuild(10);
      await w.reconcile();
      await emailsCompleteAndCorrect();
    });

    it("two reconcilers at the same moment send each e-mail once (the welcome e-mail resets the password, so this matters)", async () => {
      w.gw.emailsDown = true;
      const { body: order } = await w.openOrder({ scenes: 5 });
      await w.payInBrowser(order);
      w.gw.emailsDown = false;
      await ageBuild(10);
      await Promise.all([w.reconcile(), w.reconcile(), w.reconcile()]);
      await emailsCompleteAndCorrect();
    });

    it("if the password cannot be set, no welcome e-mail promising one is sent", async () => {
      const { body: order } = await w.openOrder({ scenes: 5 });
      w.sb.failNext("auth.updateUser", 1);
      await w.payInBrowser(order);
      assert.equal(w.gw.emailsTo(BUYER.email).filter((m) => /workspace/i.test(m.subject)).length, 0);
      await ageBuild(10);
      await w.reconcile();
      await emailsCompleteAndCorrect();
    });

    it("a customer who already signed in never has their password reset by a late welcome e-mail", async () => {
      w.gw.emailsDown = true;
      const { body: order } = await w.openOrder({ scenes: 5 });
      await w.payInBrowser(order);
      // They used 'forgot password' and signed in before the e-mail finally went out.
      await w.q(`update auth.users set encrypted_password = 'pw:their-own-choice', last_sign_in_at = now()`);
      w.gw.emailsDown = false;
      await ageBuild(10);
      await w.reconcile();
      const [u] = await w.q(`select encrypted_password from auth.users`);
      assert.equal(u.encrypted_password, "pw:their-own-choice");
      const welcome = w.gw.emailsTo(BUYER.email).find((m) => /workspace/i.test(m.subject))!;
      assert.ok(welcome);
      assert.ok(!/[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/.test(welcome.html), "no password in the late e-mail");
    });
  });

  /* ───────────────────────── self-healing ───────────────────────── */

  describe("self-healing", () => {
    it("paid at Razorpay, but the browser died and the webhook was lost → the status poll settles it", async () => {
      const { body: order } = await w.openOrder({ scenes: 5 });
      w.gw.pay(order.razorpayOrderId); // customer paid; nothing else ever arrives
      const s = await w.poll(order.orderId);
      assert.equal(s.body.status, "ready", JSON.stringify(s.body));
      await exactlyOneCustomer();
      await emailsCompleteAndCorrect();
    });

    it("the poll asks Razorpay at most once every few seconds per order (a spamming browser cannot hammer the gateway)", async () => {
      const { body: order } = await w.openOrder({ scenes: 5 });
      const ip = freshIp();
      for (let i = 0; i < 6; i++) await w.poll(order.orderId, ip);
      const asked = w.gw.requests.filter((r) => r.url.includes(`/orders/${order.razorpayOrderId}/payments`)).length;
      assert.equal(asked, 1, `Razorpay was asked ${asked} times`);
    });

    it("the daily reconciler settles an order whose payment was never reported, but leaves a minutes-old one to the live flow", async () => {
      const old = await w.openOrder({ scenes: 5, buyer: { email: "old@oldco.in", company: "Old Co" } });
      const fresh = await w.openOrder({ scenes: 5, buyer: { email: "new@newco.in", company: "New Co" } });
      w.gw.pay(old.body.razorpayOrderId);
      w.gw.pay(fresh.body.razorpayOrderId);
      await w.q(`update public.billing_orders set created_at = now() - interval '30 minutes' where id = $1`, [old.body.orderId]);

      const r = await w.reconcile();
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.synced, 1);
      assert.equal(await w.count("organizations"), 1);
      assert.equal((await w.poll(fresh.body.orderId)).body.status, "ready"); // the poll covers the fresh one
      assert.equal(await w.count("organizations"), 2);
    });

    it("the reconciler builds paid-but-unbuilt orders, and skips ones that need a person", async () => {
      const a = await w.openOrder({ scenes: 5, buyer: { email: "a@alpha-works.in", company: "Alpha Works" } });
      const b = await w.openOrder({ scenes: 5, buyer: { email: "b@beta-works.in", company: "Beta Works" } });
      w.sb.failNext("rpc:billing_create_org_for_order", 2);
      await w.payInBrowser(a.body);
      await w.payInBrowser(b.body);
      assert.equal(await w.count("billing_orders", "status = 'paid' and provisioned_at is null"), 2);
      await w.q(`update public.billing_orders set review_flag = 'manual_hold' where id = $1`, [b.body.orderId]);

      const r = await w.reconcile();
      assert.equal(r.body.fulfilled, 1);
      assert.equal(await w.count("organizations"), 1);
      assert.equal((await w.q(`select provisioned_at from public.billing_orders where id = $1`, [b.body.orderId]))[0].provisioned_at, null);
    });

    it("the reconciler survives one broken step and still does the others (and reports it)", async () => {
      const { body: order } = await w.openOrder({ scenes: 5 });
      w.sb.failNext("rpc:billing_create_org_for_order", 1);
      await w.payInBrowser(order);
      w.sb.failNext("rpc:billing_claim_support_reminders", 1);
      const r = await w.reconcile();
      assert.equal(r.status, 200);
      assert.equal(r.body.fulfilled, 1);
      assert.ok(r.body.errors.some((e: string) => /reminders/.test(e)));
      assert.equal(await w.count("billing_alerts", "kind = 'reconcile_errors'"), 1);
    });

    it("the reconciler refuses strangers, a wrong secret, and a missing or too-short server secret", async () => {
      assert.equal((await w.reconcile("")).status, 401);
      assert.equal((await w.reconcile("not-the-secret-not-the-secret")).status, 401);
      assert.equal((await w.reconcile(process.env.CRON_SECRET + "x")).status, 401);
      const real = process.env.CRON_SECRET;
      try {
        process.env.CRON_SECRET = "short";
        assert.equal((await w.reconcile("short")).status, 401, "a weak server secret never authorises");
        delete process.env.CRON_SECRET;
        assert.equal((await w.reconcile("")).status, 401, "no secret configured → nobody is authorised");
      } finally {
        process.env.CRON_SECRET = real;
      }
      assert.equal((await w.reconcile()).status, 200);
    });
  });

  /* ───────────────────────── webhook plumbing ───────────────────────── */

  describe("webhook delivery under failure", () => {
    it("ledger database down → 503 (Razorpay retries), nothing half-processed; the retry succeeds", async () => {
      const { body: order } = await w.openOrder({ scenes: 5 });
      const pay = w.gw.pay(order.razorpayOrderId);
      const wh = w.gw.paymentEvent("payment.captured", pay, "evt_ledger_down");
      w.sb.failNext("rpc:billing_webhook_begin", 1);
      const first = await w.deliver(wh);
      assert.equal(first.status, 503);
      assert.equal(await w.count("organizations"), 0);
      const second = await w.deliver(wh);
      assert.equal(second.status, 200);
      await exactlyOneCustomer();
    });

    it("building fails during a webhook → 5xx so Razorpay retries; the retry builds it; the event ends up processed once", async () => {
      const { body: order } = await w.openOrder({ scenes: 5 });
      const pay = w.gw.pay(order.razorpayOrderId);
      const wh = w.gw.paymentEvent("payment.captured", pay, "evt_build_fails");
      w.sb.failNext("rpc:billing_create_org_for_order", 1);
      const first = await w.deliver(wh);
      assert.equal(first.status, 500);
      const row = (await w.q(`select processed_at, attempts from public.billing_webhook_events where event_id = 'evt_build_fails'`))[0];
      assert.equal(row.processed_at, null, "not marked done while the customer is unbuilt");

      const second = await w.deliver(wh);
      assert.equal(second.status, 200);
      const done = (await w.q(`select processed_at, error from public.billing_webhook_events where event_id = 'evt_build_fails'`))[0];
      assert.ok(done.processed_at);
      assert.equal(done.error, null);
      await exactlyOneCustomer();
      assert.equal((await w.deliver(wh)).status, 200); // a third delivery is a no-op
      await exactlyOneCustomer();
    });

    it("a webhook that can never succeed gets 5xx until the limit, then is acknowledged with a critical alert (no infinite retry storm)", async () => {
      const { body: order } = await w.openOrder({ scenes: 5 });
      const pay = w.gw.pay(order.razorpayOrderId);
      const wh = w.gw.paymentEvent("payment.captured", pay, "evt_never_works");
      w.sb.failNext("auth.createUser", 500);
      const statuses: number[] = [];
      for (let i = 0; i < 10; i++) {
        const d = await w.deliver(wh);
        statuses.push(d.status);
        if (d.status === 200) break;
      }
      assert.deepEqual(statuses, [500, 500, 500, 500, 500, 500, 500, 200], statuses.join(","));
      assert.equal(await w.count("billing_alerts", "kind = 'webhook_gave_up' and severity = 'critical'"), 1);
      // The money is safe and the order is still waiting for a person / the reconciler.
      const o = await orderRow();
      assert.equal(o.status, "paid");
      assert.equal(o.provisioned_at, null);
    });

    it("a webhook handler error never reveals internals in the response", async () => {
      const { body: order } = await w.openOrder({ scenes: 5 });
      const pay = w.gw.pay(order.razorpayOrderId);
      w.sb.failNext("rpc:billing_record_payment", 1, { message: "relation \"secret_table\" does not exist" });
      const d = await w.deliver(w.gw.paymentEvent("payment.captured", pay));
      assert.ok(d.status >= 500);
      assert.ok(!/secret_table|relation|postgres/i.test(d.text), d.text);
    });
  });
});
