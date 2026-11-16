import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { BASIC_LICENCE_ON_SALE } from "@/lib/pricing";
import { makeWorld, BUYER, freshIp, type World } from "./harness/world";

/**
 * The scene-ladder Basic licence is retired (Terms, 16 Nov 2026). On live
 * keys nobody can buy a NEW one any more; site plans, which travel the same
 * payment path, must be untouched.
 */
describe("retired Basic licence", () => {
  let w: World;
  before(async () => {
    w = await makeWorld();
  });
  beforeEach(async () => {
    await w.reset();
  });
  after(() => w.gw.uninstall());

  const order = async (body: Record<string, unknown>) => {
    const res = await w.routes.order.POST(
      w.request("/api/billing/order", { ip: freshIp(), body: { buyer: { ...BUYER }, ...body } })
    );
    return { status: res.status, body: await w.readJson(res) };
  };

  const live = async (fn: () => Promise<void>) => {
    const keep = { k: process.env.RAZORPAY_KEY_ID, e: process.env.VERCEL_ENV };
    process.env.RAZORPAY_KEY_ID = "rzp_live_AbCdEf123456";
    process.env.VERCEL_ENV = "production";
    try {
      await fn();
    } finally {
      if (keep.k === undefined) delete process.env.RAZORPAY_KEY_ID;
      else process.env.RAZORPAY_KEY_ID = keep.k;
      if (keep.e === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = keep.e;
    }
  };

  it("is switched off", () => {
    assert.equal(BASIC_LICENCE_ON_SALE, false);
  });

  it("a new Basic licence is refused on live keys, and nothing is written", async () => {
    await live(async () => {
      const r = await order({ purpose: "basic_licence", scenes: 2 });
      assert.equal(r.status, 410, JSON.stringify(r.body));
      assert.equal(r.body.error, "plan_retired");
      assert.equal(await w.count("billing_orders"), 0);
      assert.equal(w.gw.orders.size, 0);
    });
  });

  it("a VPV plan on live keys still opens an order", async () => {
    await live(async () => {
      const r = await order({ purpose: "site_plan", sitePlanId: "confidence", travel: "ncr" });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.testMode, false);
    });
  });
});
