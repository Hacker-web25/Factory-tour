import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { makeWorld, BUYER, freshIp, type World } from "./harness/world";
import {
  LEGACY_PLAN_ORDER,
  OLD_SCENE_LADDER,
  SITE_PLANS,
  SITE_PLAN_ORDER,
  isSitePlanId,
  isYearlyPlan,
  linkControlLabels,
  infoIconsLabel,
  planMonthly,
  planYearlyFromNotes,
  priceFor,
  siteQuote,
  sitePlanFromNotes,
  toPaise,
  withGst,
} from "@/lib/pricing";
import { recommendPlan } from "@/lib/funnel";

/**
 * 21 Nov 2026: four plans, billed YEARLY and shown per month (VPV Light,
 * VPV Premium, VPV Ultra, White Glove), with support, hosting & security
 * included; no factory area anywhere; the old one-time pricing closed.
 */
describe("four yearly plans", () => {
  it("lists the four plans in order, with the owner's per-month prices and AOAs", () => {
    assert.deepEqual([...SITE_PLAN_ORDER], ["light", "premium", "ultra", "white_glove"]);
    assert.deepEqual(SITE_PLAN_ORDER.map((id) => SITE_PLANS[id].name), ["VPV Light", "VPV Premium", "VPV Ultra", "White Glove"]);
    assert.deepEqual(SITE_PLAN_ORDER.map((id) => SITE_PLANS[id].scenes), [5, 20, 45, 100]);
    assert.deepEqual(SITE_PLAN_ORDER.map((id) => planMonthly(id, true)), [3_560, 10_000, 13_542, 20_452]);
    // The struck price: twice the offer, per month too.
    assert.deepEqual(SITE_PLAN_ORDER.map((id) => planMonthly(id, false)), [7_120, 20_000, 27_084, 40_904]);
    // Billed yearly: exactly twelve of them.
    assert.deepEqual(SITE_PLAN_ORDER.map((id) => SITE_PLANS[id].priceInr), [42_720, 1_20_000, 1_62_504, 2_45_424]);
    for (const id of SITE_PLAN_ORDER) assert.ok(isYearlyPlan(id), id);
    for (const id of LEGACY_PLAN_ORDER) {
      assert.ok(!isYearlyPlan(id), id);
      assert.ok(!isSitePlanId(id), `${id} is not sold`);
    }
  });

  it("has no factory area in any plan", () => {
    for (const id of [...SITE_PLAN_ORDER, ...LEGACY_PLAN_ORDER]) {
      assert.ok(!("plot" in SITE_PLANS[id]), id);
    }
  });

  it("spreads the features like the seven plans: Light basic, Premium media + one-time, Ultra + passwords, White Glove everything + Mr. Gupta", () => {
    assert.deepEqual(SITE_PLAN_ORDER.map(infoIconsLabel), [
      "20 information icons",
      "Unlimited information icons",
      "Unlimited information icons",
      "Unlimited information icons",
    ]);
    assert.deepEqual(SITE_PLAN_ORDER.map((id) => [SITE_PLANS[id].videos, SITE_PLANS[id].pdfs]), [[0, 0], [5, 30], [8, 50], [20, 150]]);
    assert.deepEqual(SITE_PLAN_ORDER.map(linkControlLabels), [
      [],
      ["One-time view link"],
      ["One-time view link", "Password-protected link"],
      ["One-time view link", "Password-protected link", "Control link expiry time", "Limit device access"],
    ]);
    assert.deepEqual(SITE_PLAN_ORDER.map((id) => SITE_PLANS[id].personal), [false, false, false, true]);
  });

  it("reads a yearly plan and its renewal back from an order's description", () => {
    const d = priceFor("site_plan", { sitePlanId: "ultra", city: "Gurugram", extraAreas: 2, offerOpen: true }).description;
    assert.equal(sitePlanFromNotes(d), "ultra");
    assert.equal(planYearlyFromNotes(d), 1_62_504 + 2 * 3_200);
    assert.match(d, /Special offer/);
    assert.equal(sitePlanFromNotes("White Glove — 100 areas"), "white_glove");
    assert.equal(sitePlanFromNotes("VPV Basic licence — 7 scenes"), null);
    // The seven plans of 20 Nov 2026 were never sold.
    assert.equal(sitePlanFromNotes("VPV Lite — 2 areas"), null);
    assert.equal(planYearlyFromNotes("VPV Control — 15 areas"), 0);
  });

  it("a coupon comes off the first year only: the renewal is the plan at its price", () => {
    const q = siteQuote("premium", { city: "Manesar", coupon: { code: "HALF", percentOff: 50, amountOffInr: null } });
    assert.ok(q.couponInr > 0);
    assert.equal(q.yearlyInr, 1_20_000);
  });
});

describe("the funnel recommends without the factory's area", () => {
  it("picks the smallest plan that covers the areas and reports", () => {
    assert.equal(recommendPlan({ aoaCount: 3 }).plan, "light");
    assert.equal(recommendPlan({ aoaCount: 5 }).plan, "light");
    assert.equal(recommendPlan({ aoaCount: 6 }).plan, "premium");
    assert.equal(recommendPlan({ aoaCount: 3, pdfCount: 10 }).plan, "premium");
    assert.equal(recommendPlan({ aoaCount: 30 }).plan, "ultra");
  });

  it("wanting the link protected means Premium at least", () => {
    assert.equal(recommendPlan({ aoaCount: 3, wantsSharingControls: true }).plan, "premium");
  });

  it("goes past Ultra with extra areas before it ever suggests White Glove", () => {
    const fifty = recommendPlan({ aoaCount: 55 });
    assert.equal(fifty.plan, "ultra");
    assert.equal(fifty.extraAreas, 10);
    // Beyond what Ultra can reach with every extra area: White Glove.
    const big = recommendPlan({ aoaCount: 80 });
    assert.equal(big.plan, "white_glove");
    assert.equal(big.needsExtras, false);
    const huge = recommendPlan({ aoaCount: 110 });
    assert.equal(huge.plan, "white_glove");
    assert.equal(huge.extraAreas, 10);
  });
});

describe("the order route, on yearly plans", () => {
  let w: World;
  before(async () => {
    w = await makeWorld();
  });
  beforeEach(async () => {
    await w.reset();
    OLD_SCENE_LADDER.open = true;
  });
  after(() => {
    OLD_SCENE_LADDER.open = true;
    w.gw.uninstall();
  });

  const open = (body: Record<string, unknown>) =>
    w.routes.order.POST(
      w.request("/api/billing/order", {
        ip: freshIp(),
        body: { buyer: { ...BUYER }, ...body },
      })
    );

  it("opens a White Glove order for one year, at the server's amount", async () => {
    const res = await open({ purpose: "site_plan", sitePlanId: "white_glove", city: "Gurugram" });
    const body = await w.readJson(res);
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.amountPaise, toPaise(withGst(2_45_424).total), "₹2,45,424 + GST, cab free under the offer");
  });

  it("refuses a plan that does not exist, the plans sold before, and the seven that never were", async () => {
    for (const id of ["platinum", ...LEGACY_PLAN_ORDER, "lite", "plus", "pro", "vpv", "signature"]) {
      const res = await open({ purpose: "site_plan", sitePlanId: id, city: "Gurugram" });
      assert.equal(res.status, 400, id);
    }
  });

  it("closes the old one-time scene ladder in production, so nobody reaches the old pricing by mistake", async () => {
    OLD_SCENE_LADDER.open = false;
    const res = await open({ purpose: "basic_licence", scenes: 5 });
    assert.equal(res.status, 410);
    assert.equal((await w.readJson(res)).error, "old_pricing");
    assert.equal(await w.count("billing_orders"), 0);
  });
});
