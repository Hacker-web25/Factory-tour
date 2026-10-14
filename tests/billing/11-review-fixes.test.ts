import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { makeWorld, BUYER, freshIp, type World } from "./harness/world";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Regression suite for the findings of the independent review.
 * Every test here was first written as a proof-of-concept that REPRODUCED a flaw;
 * each now asserts the corrected behaviour.
 */
describe("independent review — every finding stays fixed", () => {
  let w: World;
  before(async () => {
    w = await makeWorld();
  });
  beforeEach(async () => {
    await w.reset();
    w.sb.clearFailures();
  });
  after(() => w.gw.uninstall());

  const orderRow = async (id?: string) =>
    (await w.q(id ? `select * from public.billing_orders where id = $1` : `select * from public.billing_orders order by created_at desc limit 1`, id ? [id] : []))[0];
  const uniq = () => {
    const n = Math.random().toString(36).slice(2, 8);
    return { email: `u${n}@corp-${n}.in`, company: `Corp ${n}` };
  };
  const clearGatewayFailures = () => ((w.gw as any).failures = []);
  const withEnv = async (patch: Record<string, string | undefined>, fn: () => Promise<void>) => {
    const saved: Record<string, string | undefined> = {};
    for (const k of Object.keys(patch)) saved[k] = process.env[k];
    try {
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      await fn();
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };

  /* ───────────────────────── money that arrives late ───────────────────────── */

  describe("late and out-of-order money", () => {
    it("a second captured payment that lands AFTER the order was refunded is refunded too, once, and never revives the order", async () => {
      const { body: order } = await w.openOrder({ scenes: 5 });
      const a = await w.payInBrowser(order);
      const refund = w.gw.makeRefund(a.payment.id, a.payment.amount);
      await w.deliver(w.gw.refundEvent("refund.processed", refund));
      assert.equal((await orderRow()).status, "refunded");

      const b = w.gw.pay(order.razorpayOrderId, { force: true });
      const d1 = await w.deliver(w.gw.paymentEvent("payment.captured", b));
      const d2 = await w.deliver(w.gw.paymentEvent("payment.captured", b)); // Razorpay retries
      assert.equal(d1.status, 200);
      assert.equal(d2.status, 200);

      const refunds = [...w.gw.refunds.values()];
      assert.equal(refunds.length, 2, "one refund per payment, however often we heard about it");
      const forB = refunds.filter((r) => r.payment_id === b.id);
      assert.equal(forB.length, 1);
      assert.equal(forB[0].amount, b.amount, "the late payment is returned in full");

      assert.equal((await orderRow()).status, "refunded", "a stray payment does not revive a refunded order");
      const [org] = await w.q(`select plan_status from public.organizations`);
      assert.notEqual(org.plan_status, "active");
      const dup = await w.q(`select is_duplicate from public.billing_payments where razorpay_payment_id = $1`, [b.id]);
      assert.equal(dup[0].is_duplicate, true);
    });

    it("the refund of an auto-refunded DUPLICATE is not counted against the real purchase (a later 20% goodwill refund keeps it)", async () => {
      const { body: order } = await w.openOrder({ scenes: 5 });
      const first = w.gw.pay(order.razorpayOrderId);
      const second = w.gw.pay(order.razorpayOrderId, { force: true });
      await w.deliver(w.gw.paymentEvent("payment.captured", first));
      await w.deliver(w.gw.paymentEvent("payment.captured", second));
      const dupRefund = [...w.gw.refunds.values()][0];
      await w.deliver(w.gw.refundEvent("refund.processed", dupRefund));
      assert.equal((await orderRow()).status, "paid");

      const partial = w.gw.makeRefund(first.id, Math.round(first.amount * 0.2));
      await w.deliver(w.gw.refundEvent("refund.processed", partial));

      const o = await orderRow();
      const [org] = await w.q(`select plan_status from public.organizations`);
      assert.equal(o.status, "paid", "a 20% refund must not cancel the purchase");
      assert.equal(org.plan_status, "active");
      assert.equal(Number(o.refunded_paise), partial.amount, "only the real refund is counted");
      assert.equal(await w.count("billing_credit_notes"), 1, "the real partial refund gets exactly one credit note");
    });

    it("a PARTIAL refund that lands before the invoice exists still gets its credit note once the invoice is issued", async () => {
      w.sb.failNext("rpc:billing_issue_invoice", 1);
      const { body: order } = await w.openOrder({ scenes: 5 });
      const paid = await w.payInBrowser(order);
      assert.equal(paid.body.status, "processing");
      const partial = w.gw.makeRefund(paid.payment.id, 100_000);
      await w.deliver(w.gw.refundEvent("refund.processed", partial));
      for (let i = 0; i < 3; i++) await w.poll(order.orderId);
      await w.reconcile();
      await w.reconcile();

      assert.equal(Number((await orderRow()).refunded_paise), 100_000);
      assert.equal(await w.count("billing_invoices"), 1);
      assert.equal(await w.count("billing_credit_notes"), 1, "the credit note is created after the invoice");
      // and a second pass does not issue another
      await w.reconcile();
      assert.equal(await w.count("billing_credit_notes"), 1);
    });

    it("a refund that arrives BEFORE its payment is on file is not lost, and the stale 'captured' snapshot that follows builds no customer", async () => {
      const { body: order } = await w.openOrder({ scenes: 5 });
      const pay = w.gw.pay(order.razorpayOrderId);
      const snapshot = { ...pay }; // what the (late) captured webhook will carry
      const refund = w.gw.makeRefund(pay.id, pay.amount);
      const r1 = await w.deliver(w.gw.refundEvent("refund.processed", refund));
      assert.equal(r1.status, 200);
      const r2 = await w.deliver(w.gw.paymentEvent("payment.captured", snapshot as any));
      assert.equal(r2.status, 200);
      for (let i = 0; i < 3; i++) await w.poll(order.orderId);

      assert.equal(await w.count("billing_refunds"), 1, "the refund was recorded, not dropped");
      assert.equal((await orderRow()).status, "refunded");
      assert.equal(await w.count("organizations", "plan_status = 'active'"), 0, "no live customer for money the gateway gave back");
      assert.equal(w.gw.emailsTo(BUYER.email).filter((m) => /workspace/i.test(m.subject)).length, 0, "no welcome e-mail for refunded money");
    });

    it("if Razorpay cannot be reached when a refund arrives first, the webhook is answered with an error so Razorpay retries — and the retry then succeeds", async () => {
      const { body: order } = await w.openOrder({ scenes: 5 });
      const pay = w.gw.pay(order.razorpayOrderId);
      const refund = w.gw.makeRefund(pay.id, pay.amount);
      const evt = w.gw.refundEvent("refund.processed", refund, "evt_refund_first_1");
      w.gw.failNext("GET /v1/payments", 50, 503);
      const bad = await w.deliver(evt);
      assert.ok(bad.status >= 500, `expected a retryable error, got ${bad.status}`);
      assert.equal(await w.count("billing_refunds"), 0);

      clearGatewayFailures();
      const good = await w.deliver(evt);
      assert.equal(good.status, 200);
      assert.equal(await w.count("billing_refunds"), 1);
      assert.equal((await orderRow()).status, "refunded");
    });

    it("a replayed payment.captured / order.paid cannot flip a partially refunded payment back to 'captured'", async () => {
      const { body: order } = await w.openOrder({ scenes: 5 });
      const pay = w.gw.pay(order.razorpayOrderId);
      await w.deliver(w.gw.paymentEvent("payment.captured", pay));
      const partial = w.gw.makeRefund(pay.id, 100_000);
      await w.deliver(w.gw.refundEvent("refund.processed", partial));
      await w.deliver(w.gw.paymentEvent("order.paid", pay));
      await w.deliver(w.gw.paymentEvent("payment.captured", pay));
      const st = (await w.q(`select status from public.billing_payments`))[0].status;
      assert.equal(st, "partially_refunded");
    });
  });

  /* ───────────────────────── one licence per buyer ───────────────────────── */

  describe("one workspace per buyer", () => {
    it("two tabs at different slider positions, both paid: ONE workspace is built and the second payment is refunded", async () => {
      const a = await w.openOrder({ scenes: 5 });
      const b = await w.openOrder({ scenes: 8 });
      const payA = await w.payInBrowser(a.body);
      const payB = await w.payInBrowser(b.body);
      for (let i = 0; i < 4; i++) {
        await w.poll(a.body.orderId);
        await w.poll(b.body.orderId);
      }
      await w.reconcile();

      assert.equal(await w.count("organizations"), 1, "never two workspaces for one buyer");
      assert.equal((await w.q(`select count(*)::int n from auth.users`))[0].n, 1);
      const refunds = [...w.gw.refunds.values()];
      assert.equal(refunds.length, 1, "exactly one payment is given back");
      assert.equal(refunds[0].payment_id, payB.payment.id, "the later payment is the one refunded");
      assert.equal(refunds[0].amount, payB.payment.amount);
      assert.equal(await w.count("billing_invoices"), 1, "one invoice, for the purchase that stands");
      assert.equal(w.gw.emailsTo(BUYER.email).filter((m) => /workspace/i.test(m.subject)).length, 1, "one welcome e-mail");
      assert.equal((await orderRow(a.body.orderId)).status, "paid");
      assert.ok(payA.payment.id);
    });

    it("an admin-created or already-signed-up owner's profile is never overwritten by a purchase; the order is flagged for a human", async () => {
      const { body: order } = await w.openOrder({ scenes: 5 });
      const id = await w.seedUser({ email: BUYER.email, role: "owner", orgId: null });
      await w.payInBrowser(order);
      for (let i = 0; i < 3; i++) await w.poll(order.orderId);
      await w.reconcile();

      const p = await w.q(`select role, org_id from public.profiles where id = $1`, [id]);
      assert.equal(p[0].role, "owner", "the owner stays the owner");
      assert.equal(p[0].org_id, null);
      assert.equal(await w.count("organizations"), 0, "no workspace was attached to someone else's login");
      const o = await orderRow();
      assert.equal(o.review_flag, "email_in_use");
      const alerts = await w.q(`select kind from public.billing_alerts where kind <> 'admin_action'`);
      assert.ok(alerts.length >= 1, "the founders are told a paid order needs them");
    });
  });

  /* ───────────────────────── the safety net finds what webhooks missed ───────────────────────── */

  describe("reconciler sweeps", () => {
    it("money captured on an order we cancelled (slider moved), with the webhook and callback both lost, is found and served", async () => {
      const a = await w.openOrder({ scenes: 5 });
      await w.openOrder({ scenes: 8 }); // retires order A on our side
      w.gw.pay(a.body.razorpayOrderId); // ...but the customer paid it in another tab
      await w.q(`update public.billing_orders set created_at = now() - interval '2 hours'`);
      w.gw.ageAll(3600);

      const rec = await w.reconcile();
      assert.equal(rec.status, 200, JSON.stringify(rec.body));
      assert.ok(rec.body.sweptPayments >= 1, JSON.stringify(rec.body));
      assert.equal(await w.count("billing_payments", "status = 'captured'"), 1, "the payment is now on our books");
      await w.reconcile();
      assert.equal(await w.count("organizations"), 1, "the customer who paid is served");
      assert.equal(w.gw.refunds.size, 0, "nothing needed refunding: one buyer, one payment");
    });

    it("51 abandoned checkouts do not hide a paid order from the reconciler", async () => {
      const made: any[] = [];
      for (let i = 0; i < 51; i++) {
        const r = await w.openOrder({ scenes: 5, buyer: { email: `buyer${i}@corp${i}.in`, company: `Corp ${i}` }, ip: freshIp() });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        made.push(r.body);
        await w.q(`update public.billing_orders set created_at = now() - ($1::int * interval '1 minute') where id = $2`, [3000 - i, r.body.orderId]);
      }
      w.gw.pay(made[50].razorpayOrderId); // the newest is genuinely paid; webhook + callback lost
      w.gw.ageAll(3600);
      await w.reconcile();
      await w.reconcile();
      const o = await orderRow(made[50].orderId);
      assert.equal(o.status, "paid");
      assert.ok(o.provisioned_at, "and the customer was served");
    });

    it("a refund made in the Razorpay dashboard whose webhook was lost is picked up by the reconciler", async () => {
      const { body: order } = await w.openOrder({ scenes: 5 });
      const paid = await w.payInBrowser(order);
      assert.equal(paid.body.status, "ready");
      w.gw.makeRefund(paid.payment.id, paid.payment.amount); // done by hand in the dashboard; no webhook
      w.gw.ageAll(3600);

      const rec = await w.reconcile();
      assert.ok(rec.body.sweptRefunds >= 1, JSON.stringify(rec.body));
      assert.equal((await orderRow()).status, "refunded");
      const [org] = await w.q(`select plan_status from public.organizations`);
      assert.notEqual(org.plan_status, "active", "the workspace is closed when its money was returned");
      assert.equal(await w.count("billing_credit_notes"), 1);
      await w.reconcile();
      assert.equal(await w.count("billing_credit_notes"), 1, "idempotent");
    });

    it("an order that ran out of automatic tries gets a fresh set after six quiet hours (not before)", async () => {
      w.sb.failNext("auth.createUser", 500);
      const { body: order } = await w.openOrder({ scenes: 5 });
      await w.payInBrowser(order);
      assert.equal(Boolean((await orderRow()).provisioned_at), false, "the build failed, the money is safe");

      // The short outage is over, but the order already used up its tries.
      w.sb.clearFailures();
      await w.q(`update public.billing_orders set fulfilment_attempts = 8, updated_at = now() - interval '1 hour'`);
      const early = await w.reconcile();
      assert.equal(early.body.attemptsReset, 0, "too soon to reset");
      assert.equal(Boolean((await orderRow()).provisioned_at), false);

      await w.q(`update public.billing_orders set updated_at = now() - interval '7 hours'`);
      const later = await w.reconcile();
      assert.equal(later.body.attemptsReset, 1);
      assert.ok((await orderRow()).provisioned_at, "and this time the customer is served");
      assert.equal(w.gw.emailsTo(BUYER.email).filter((m) => /workspace/i.test(m.subject)).length, 1);
    });
  });

  /* ───────────────────────── is the shop safe to open? ───────────────────────── */

  describe("set-up check", () => {
    const owner = () => w.seedUser({ email: "owner@vpv.in", role: "owner" });
    const check = async (as?: string) => {
      const res = await w.routes.adminBilling.POST(w.request("/api/admin/billing", { as, body: { action: "config_check" }, ip: freshIp() }));
      return { res, status: res.status, body: await w.readJson(res) };
    };

    it("with LIVE keys and the e-mail provider missing, checkout refuses to open (no payment we could not deliver on)", async () => {
      await withEnv(
        { VERCEL_ENV: "production", RAZORPAY_KEY_ID: "rzp_live_AbCdEf123456", RESEND_API_KEY: undefined },
        async () => {
          const r = await w.openOrder({ scenes: 5 });
          assert.equal(r.status, 503, JSON.stringify(r.body));
          assert.equal(r.body.error, "payments_unavailable");
          assert.equal(w.gw.requests.filter((x) => x.url.includes("razorpay")).length, 0, "Razorpay was never asked for an order");
          assert.equal(await w.count("billing_orders"), 0);
        }
      );
    });

    it("with LIVE keys and everything in place, checkout opens", async () => {
      await withEnv({ VERCEL_ENV: "production", RAZORPAY_KEY_ID: "rzp_live_AbCdEf123456" }, async () => {
        const r = await w.openOrder({ scenes: 5 });
        // the fake gateway only knows the test key, so a 502 here proves we got as far as asking it
        assert.notEqual(r.body.error, "payments_unavailable", JSON.stringify(r.body));
      });
    });

    it("in TEST mode a missing e-mail provider only warns: you can still test checkout", async () => {
      await withEnv({ RESEND_API_KEY: undefined }, async () => {
        const r = await w.openOrder({ scenes: 5 });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        const c = await check(await owner());
        assert.equal(c.status, 200);
        assert.equal(c.body.mode, "test");
        assert.ok(c.body.problems.some((p: string) => /RESEND/.test(p)));
      });
    });

    it("test keys on the production site are called out", async () => {
      await withEnv({ VERCEL_ENV: "production" }, async () => {
        const c = await check(await owner());
        assert.equal(c.body.mode, "test");
        assert.equal(c.body.problems.length, 0, JSON.stringify(c.body));
        assert.ok(c.body.warnings.some((x: string) => /TEST keys/i.test(x)));
      });
    });

    it("the check is owner-only, writes no audit row, and never returns a secret", async () => {
      const anon = await check(undefined);
      assert.equal(anon.status, 401);
      const org = await w.seedOrg({ slug: "nosy-co" });
      const nosy = await w.seedUser({ email: "admin@nosy-co.in", orgId: org.id });
      assert.equal((await check(nosy)).status, 403);

      const ok = await check(await owner());
      assert.equal(ok.status, 200);
      const text = JSON.stringify(ok.body);
      for (const secret of [process.env.RAZORPAY_KEY_SECRET!, process.env.RAZORPAY_WEBHOOK_SECRET!, process.env.SUPABASE_SERVICE_ROLE_KEY!, process.env.CRON_SECRET!, process.env.RESEND_API_KEY!]) {
        assert.ok(!text.includes(secret), "a secret leaked into the response");
      }
      assert.equal(await w.count("billing_alerts"), 0, "read-only: nothing was written");
    });

    it("every problem the check names is a real, actionable sentence (short webhook secret, short cron secret, no service key)", async () => {
      await withEnv(
        { RAZORPAY_WEBHOOK_SECRET: "tooshort", CRON_SECRET: "tiny", RESEND_API_KEY: undefined },
        async () => {
          const c = await check(await owner());
          assert.equal(c.status, 200);
          const joined = c.body.problems.join(" | ");
          assert.match(joined, /RAZORPAY_WEBHOOK_SECRET/);
          assert.match(joined, /CRON_SECRET/);
          assert.match(joined, /RESEND_API_KEY/);
        }
      );
    });
  });

  /* ───────────────────────── customers set up by hand ───────────────────────── */

  describe("workspaces created by hand", () => {
    it("a workspace with no billing state is asked for it once, then remembered", async () => {
      const org = await w.seedOrg({ slug: "prov-co", quota: 5, state: null });
      const user = await w.seedUser({ email: "admin@prov-co.in", orgId: org.id });
      const ask = async (body: Record<string, unknown>) => {
        const res = await w.routes.order.POST(w.request("/api/billing/order", { as: user, body: { purpose: "scene_topup", scenes: 8, ...body }, ip: freshIp() }));
        return { res, status: res.status, body: await w.readJson(res) };
      };

      const first = await ask({});
      assert.equal(first.status, 400);
      assert.equal(first.body.error, "state_required");

      const bad = await ask({ buyer: { state: "Atlantis" } });
      assert.equal(bad.status, 400);

      const withState = await ask({ buyer: { state: "karnataka" } });
      assert.equal(withState.status, 200, JSON.stringify(withState.body));
      const [o] = await w.q(`select billing_state from public.organizations where id = $1`, [org.id]);
      assert.equal(o.billing_state, "Karnataka", "remembered in canonical spelling");
      assert.equal((await orderRow()).buyer_state, "Karnataka");

      // the next purchase no longer asks
      const next = await ask({ scenes: 9 });
      assert.equal(next.status, 200, JSON.stringify(next.body));
    });

    it("a state already on file is never overwritten by whatever the browser sends", async () => {
      const org = await w.seedOrg({ slug: "has-state", quota: 5, state: "Haryana" });
      const user = await w.seedUser({ email: "admin@has-state.in", orgId: org.id });
      const res = await w.routes.order.POST(
        w.request("/api/billing/order", { as: user, body: { purpose: "scene_topup", scenes: 8, buyer: { state: "Kerala" } }, ip: freshIp() })
      );
      assert.equal(res.status, 200);
      const [o] = await w.q(`select billing_state from public.organizations where id = $1`, [org.id]);
      assert.equal(o.billing_state, "Haryana");
    });

    describe("the admin 'create customer' tool", () => {
      const provision = async (as: string, body: Record<string, unknown>) => {
        const res = await w.routes.provision.POST(w.request("/api/admin/provision", { as, body, ip: freshIp() }));
        return { res, status: res.status, body: await w.readJson(res) };
      };

      it("stores the customer's state, and refuses one it does not recognise", async () => {
        const owner = await w.seedUser({ email: "owner@vpv.in", role: "owner" });
        const bad = await provision(owner, { company: "Bad State Co", adminEmail: "a@badstate.in", plan: "basic", scenes: 5, state: "Atlantis" });
        assert.equal(bad.status, 400);
        assert.equal(bad.body.error, "bad_state");
        assert.equal(await w.count("organizations"), 0, "nothing was created");

        const ok = await provision(owner, { company: "Good State Co", adminEmail: "a@goodstate.in", plan: "basic", scenes: 5, state: "karnataka" });
        assert.equal(ok.status, 200, JSON.stringify(ok.body));
        const [o] = await w.q(`select billing_state from public.organizations where slug = $1`, [ok.body.slug]);
        assert.equal(o.billing_state, "Karnataka");
      });

      it("the state is optional", async () => {
        const owner = await w.seedUser({ email: "owner@vpv.in", role: "owner" });
        const r = await provision(owner, { company: "No State Co", adminEmail: "a@nostate.in", plan: "pro" });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        const [o] = await w.q(`select billing_state from public.organizations where slug = $1`, [r.body.slug]);
        assert.equal(o.billing_state, null);
      });
    });
  });

  /* ───────────────────────── passwords stay with the customer ───────────────────────── */

  describe("first passwords", () => {
    const PASSWORD = /[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/;

    it("the welcome e-mail with the first password goes to the customer ONLY — no BCC to any shared inbox", async () => {
      const { body: order } = await w.openOrder({ scenes: 5 });
      await w.payInBrowser(order);
      const withPassword = w.gw.emails.filter((m) => PASSWORD.test(m.html));
      assert.equal(withPassword.length, 1);
      assert.deepEqual(withPassword[0].to, [BUYER.email]);
      assert.ok(!withPassword[0].bcc || withPassword[0].bcc.length === 0, `BCC: ${JSON.stringify(withPassword[0].bcc)}`);
    });

    it("the admin 'create customer' welcome e-mail is not copied to anyone either", async () => {
      const owner = await w.seedUser({ email: "owner@vpv.in", role: "owner" });
      const res = await w.routes.provision.POST(
        w.request("/api/admin/provision", { as: owner, body: { company: "Hand Co", adminEmail: "boss@hand-co.in", plan: "pro" }, ip: freshIp() })
      );
      assert.equal(res.status, 200);
      const withPassword = w.gw.emails.filter((m) => PASSWORD.test(m.html));
      assert.equal(withPassword.length, 1);
      assert.deepEqual(withPassword[0].to, ["boss@hand-co.in"]);
      assert.ok(!withPassword[0].bcc || withPassword[0].bcc.length === 0);
    });
  });

  /* ───────────────────────── limiter fairness ───────────────────────── */

  describe("rate limits cannot be used against real customers", () => {
    it("a flood of malformed requests does not use up the shop-wide allowance", async () => {
      await withEnv({ BILLING_GLOBAL_ORDERS_PER_HOUR: "3" }, async () => {
        for (let i = 0; i < 8; i++) {
          const junk = await w.openOrder({ scenes: 9999, buyer: uniq(), ip: freshIp() });
          assert.equal(junk.status, 400);
        }
        const statuses: number[] = [];
        for (let i = 0; i < 4; i++) statuses.push((await w.openOrder({ scenes: 5, buyer: uniq(), ip: freshIp() })).status);
        assert.deepEqual(statuses, [200, 200, 200, 429], "three real customers still got through");
      });
    });

    it("a+1@, a+2@, a+3@… share one allowance (tags do not mint fresh limits)", async () => {
      let ok = 0;
      let limited = 0;
      for (let i = 0; i < 16; i++) {
        const r = await w.openOrder({ scenes: 5, buyer: { email: `bot+${i}@botnet-co.in`, company: "Bot Co" }, ip: freshIp() });
        if (r.status === 200) ok += 1;
        if (r.status === 429) limited += 1;
      }
      assert.ok(ok <= 12, `${ok} orders went through`);
      assert.ok(limited >= 4, `${limited} were limited`);
    });

    it("Gmail dots and googlemail.com are the same inbox as far as the limiter is concerned", async () => {
      const variants = ["first.last@gmail.com", "firstlast@gmail.com", "f.i.r.s.t.l.a.s.t@gmail.com", "firstlast@googlemail.com", "first.last+x@gmail.com"];
      let limited = 0;
      for (let round = 0; round < 3; round++) {
        for (const email of variants) {
          const r = await w.openOrder({ scenes: 5, buyer: { email, company: "Dots Co" }, ip: freshIp() });
          if (r.status === 429) limited += 1;
        }
      }
      assert.ok(limited >= 1, "after 12 tries on one inbox the rest are limited");
    });

    it("the enquiry form acknowledges at most two a day per inbox, tags included", async () => {
      for (let i = 0; i < 5; i++) {
        const res = await w.routes.enquiry.POST(
          w.request("/api/billing/enquiry", {
            ip: freshIp(),
            body: { plan: "pro", name: "Spam", company: "Spam Co", email: `victim+${i}@target-co.in`, message: "hello" },
          })
        );
        assert.equal(res.status, 200);
      }
      const acks = w.gw.emails.filter((m) => m.to.some((t) => t.endsWith("@target-co.in")));
      assert.ok(acks.length <= 2, `${acks.length} acknowledgements were sent to one inbox`);
    });

    it("junk to the enquiry form does not use up the site-wide daily allowance", async () => {
      for (let i = 0; i < 30; i++) {
        const res = await w.routes.enquiry.POST(w.request("/api/billing/enquiry", { ip: freshIp(), body: { name: "", company: "", email: "nope" } }));
        assert.equal(res.status, 400);
      }
      const [row] = await w.q(`select count(*)::int n from public.rate_limits where key like 'bk:%'`);
      // 30 junk posts from 30 IPs created at most one counter each (per-IP), and none for the global key.
      assert.ok(row.n <= 30, `limiter rows: ${row.n}`);
    });
  });
});
