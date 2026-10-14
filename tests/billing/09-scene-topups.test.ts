import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { makeWorld, freshIp, type World } from "./harness/world";
import { SCENE_MAX, priceForScenes, toPaise } from "@/lib/pricing";

const DAY = 86_400_000;

/**
 * An existing Basic customer adds scenes. The price is the ladder difference,
 * the customer gets exactly the scenes they paid for, and no sequence of
 * double clicks, stale tabs or retries can give them (or cost them) more.
 */
describe("scene top-ups", () => {
  let w: World;
  before(async () => {
    w = await makeWorld();
  });
  beforeEach(async () => {
    await w.reset();
    w.sb.clearFailures();
  });
  after(() => w.gw.uninstall());

  async function customer(quota = 5, o: { plan?: "basic" | "pro" | "ultra"; planStatus?: string; slug?: string } = {}) {
    const slug = o.slug ?? "top-co";
    const org = await w.seedOrg({ name: "Top Co", slug, quota, plan: o.plan, planStatus: o.planStatus, supportUntil: new Date(Date.now() + 200 * DAY).toISOString() });
    const admin = await w.seedUser({ email: `admin@${slug}.in`, orgId: org.id });
    return { org, admin };
  }
  const topup = async (as: string, scenes: unknown, ip = freshIp()) => {
    const res = await w.routes.order.POST(w.request("/api/billing/order", { as, ip, body: { purpose: "scene_topup", scenes, buyer: {} } }));
    return { res, status: res.status, body: await w.readJson(res) };
  };
  const quota = async () => Number((await w.q(`select scene_quota from public.organizations order by created_at limit 1`))[0].scene_quota);

  describe("who can buy what", () => {
    it("only a larger whole number up to 20 is accepted", async () => {
      const { admin } = await customer(5);
      for (const bad of [5, 4, 1, 0, -3, 21, 100, 5.5, "9", null, undefined, NaN, [9], { a: 1 }, 1e9]) {
        const r = await topup(admin, bad);
        assert.equal(r.status, 400, JSON.stringify(bad));
        assert.equal(r.body.error, "invalid_scenes");
      }
      assert.equal(await w.count("billing_orders"), 0);
      for (const good of [6, 9, 20]) assert.equal((await topup(admin, good, freshIp())).status, 200, String(good));
    });

    it("the price is exactly the ladder difference for every possible target", async () => {
      const { admin } = await customer(5);
      for (let target = 6; target <= SCENE_MAX; target++) {
        const r = await topup(admin, target);
        assert.equal(r.status, 200, `${target}: ${JSON.stringify(r.body)}`);
        assert.equal(r.body.amountPaise, toPaise(priceForScenes(target) - priceForScenes(5)), `5→${target}`);
      }
    });

    it("a workspace with no paid scenes, a Pro/Ultra workspace and a closed workspace cannot buy a top-up", async () => {
      const none = await customer(0, { slug: "none-co" });
      assert.equal((await topup(none.admin, 6)).status, 400);
      const pro = await customer(5, { plan: "pro", slug: "pro-co" });
      assert.equal((await topup(pro.admin, 9)).status, 400);
      const ultra = await customer(5, { plan: "ultra", slug: "ultra-co" });
      assert.equal((await topup(ultra.admin, 9)).status, 400);
      const closed = await customer(5, { planStatus: "cancelled", slug: "closed-co" });
      assert.equal((await topup(closed.admin, 9)).status, 403);
      assert.equal(await w.count("billing_orders"), 0);
    });

    it("signed-out visitors and non-admin members cannot buy; the body cannot name another workspace", async () => {
      const a = await customer(5, { slug: "a-co" });
      const b = await customer(5, { slug: "b-co" });
      const presenter = await w.seedUser({ email: "p@a-co.in", orgId: a.org.id, role: "presenter" });
      assert.equal((await topup(presenter, 9)).status, 403);
      const anon = await w.routes.order.POST(w.request("/api/billing/order", { body: { purpose: "scene_topup", scenes: 9, buyer: {} } }));
      assert.equal(anon.status, 401);
      const sneaky = await w.routes.order.POST(
        w.request("/api/billing/order", { as: a.admin, body: { purpose: "scene_topup", scenes: 9, orgId: b.org.id, org_id: b.org.id, buyer: {} } })
      );
      assert.equal(sneaky.status, 200);
      assert.equal((await w.q(`select org_id from public.billing_orders`))[0].org_id, a.org.id);
    });
  });

  describe("paying", () => {
    it("pays → the scenes arrive, one invoice, one e-mail pair; the support date and plan are untouched", async () => {
      const { admin, org } = await customer(5);
      const before = (await w.q(`select support_until from public.organizations where id = $1`, [org.id]))[0].support_until;
      const r = await topup(admin, 9);
      await w.payInBrowser(r.body);
      assert.equal((await w.poll(r.body.orderId)).body.status, "ready");
      assert.equal(await quota(), 9);
      assert.equal(await w.count("billing_invoices"), 1);
      assert.equal((await w.q(`select support_until from public.organizations where id = $1`, [org.id]))[0].support_until.toString(), before.toString());
      assert.equal(w.gw.emailsTo("admin@top-co.in").filter((m) => /scenes are live/i.test(m.subject)).length, 1);
      assert.equal(w.gw.emailsTo("admin@top-co.in").filter((m) => /invoice/i.test(m.subject)).length, 1);
    });

    it("the same payment reported by browser, webhook, retry and poll adds the scenes once", async () => {
      const { admin } = await customer(5);
      const r = await topup(admin, 9);
      const pay = w.gw.pay(r.body.razorpayOrderId);
      const sig = w.gw.checkoutSignature(r.body.razorpayOrderId, pay.id);
      const confirm = () =>
        w.routes.confirm.POST(w.request("/api/billing/confirm", { body: { orderId: r.body.orderId, razorpay_order_id: r.body.razorpayOrderId, razorpay_payment_id: pay.id, razorpay_signature: sig } }));
      await Promise.all([confirm(), confirm(), w.deliver(w.gw.paymentEvent("payment.captured", pay)), w.deliver(w.gw.paymentEvent("order.paid", pay))]);
      await w.deliver(w.gw.paymentEvent("payment.captured", pay));
      await w.poll(r.body.orderId);
      await w.poll(r.body.orderId);
      assert.equal(await quota(), 9, "not 13, not 17");
      assert.equal(await w.count("billing_invoices"), 1);
      assert.equal((await w.q(`select count(*)::int n from public.plan_events where event = 'quota_changed'`))[0].n, 1);
    });

    it("the webhook alone (browser closed) delivers the scenes", async () => {
      const { admin } = await customer(5);
      const r = await topup(admin, 7);
      const pay = w.gw.pay(r.body.razorpayOrderId);
      await w.deliver(w.gw.paymentEvent("payment.captured", pay));
      assert.equal(await quota(), 7);
    });

    it("two clicks on 'Add scenes' open one order; a changed slider opens a new one and closes the old", async () => {
      const { admin } = await customer(5);
      const [a, b] = await Promise.all([topup(admin, 9), topup(admin, 9)]);
      assert.equal(a.body.orderId, b.body.orderId);
      const c = await topup(admin, 12);
      assert.notEqual(c.body.orderId, a.body.orderId);
      assert.equal(await w.count("billing_orders", "status = 'created'"), 1);
      assert.equal(await w.count("billing_orders", "status = 'cancelled'"), 1);
    });

    it("two top-ups in a row each deliver exactly what was paid for, and the second is priced from the new total", async () => {
      const { admin } = await customer(5);
      const a = await topup(admin, 9);
      await w.payInBrowser(a.body);
      await w.poll(a.body.orderId);
      assert.equal(await quota(), 9);
      const stale = await topup(admin, 8);
      assert.equal(stale.status, 400, "9 scenes already, so 8 is not an upgrade");
      const b = await topup(admin, 12);
      assert.equal(b.body.amountPaise, toPaise(priceForScenes(12) - priceForScenes(9)));
      await w.payInBrowser(b.body);
      await w.poll(b.body.orderId);
      assert.equal(await quota(), 12);
      assert.equal(await w.count("billing_invoices"), 2);
    });

    it("a stale tab: paying an order that was replaced still delivers what that order sold — nothing is lost, nothing extra is given", async () => {
      const { admin } = await customer(5);
      const a = await topup(admin, 8); // +3
      await topup(admin, 10); // replaces it on our side
      const paid = await w.payInBrowser(a.body); // ...but the old tab was still open
      assert.equal(paid.res.status, 200);
      assert.equal((await w.poll(a.body.orderId)).body.status, "ready");
      assert.equal(await quota(), 8, "exactly the +3 that was paid for");
    });

    it("paid top-ups that would take a workspace past 20 scenes are NOT delivered silently: flagged, alerted, money untouched", async () => {
      const { admin } = await customer(12);
      const a = await topup(admin, 20); // +8
      const b = await topup(admin, 19); // retires a (+7)
      const paidA = await w.payInBrowser(a.body); // 12 + 8 = 20 ✔
      await w.poll(a.body.orderId);
      assert.equal(await quota(), 20);
      await w.payInBrowser(b.body); // 20 + 7 = 27 ✘
      const s = await w.poll(b.body.orderId);
      assert.equal(s.body.status, "review");
      assert.equal(await quota(), 20, "never above the plan's maximum");
      assert.equal(await w.count("billing_alerts", "kind = 'fulfilment_topup_exceeds_cap' and severity = 'critical'"), 1);
      assert.equal(paidA.res.status, 200);
      assert.equal(w.gw.refunds.size, 0, "nothing is refunded behind a person's back — they decide");
    });

    it("a top-up refunded in full removes only those scenes (covered in depth in the refund suite)", async () => {
      const { admin } = await customer(5);
      const r = await topup(admin, 9);
      const paid = await w.payInBrowser(r.body);
      await w.poll(r.body.orderId);
      await w.deliver(w.gw.refundEvent("refund.processed", w.gw.makeRefund(paid.payment.id, paid.payment.amount)));
      assert.equal(await quota(), 5);
    });
  });
});
