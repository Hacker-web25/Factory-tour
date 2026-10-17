import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import {
  LAUNCH_OFFER,
  SITE_PLANS,
  SITE_PLAN_ORDER,
  TRAVEL_FEES,
  toPaise,
  withGst,
  sitePlanQuote,
  storedPurpose,
  type SitePlanId,
  type TravelZone,
} from "@/lib/pricing";
import { makeWorld, BUYER, freshIp, type World } from "./harness/world";

/**
 * The marketing site's named packs — VPV Confidence, Authority and
 * Control.
 *
 * They are not a fourth product. Each one is a Basic licence with a
 * fixed number of areas, sold at a flat price instead of by the scene
 * ladder, so the thing that matters here is that the SERVER decides the
 * amount and that what lands in the database is an ordinary
 * basic_licence which fulfilment, the one-workspace lock and the refund
 * reversal already understand.
 */
describe("site plans: the named packs sold by the marketing site", () => {
  let w: World;
  before(async () => {
    w = await makeWorld();
  });
  beforeEach(async () => {
    await w.reset();
  });
  after(() => w.gw.uninstall());

  const open = async (body: Record<string, unknown>, ip?: string) => {
    const res = await w.routes.order.POST(
      w.request("/api/billing/order", {
        ip: ip ?? freshIp(),
        body: { purpose: "site_plan", buyer: { ...BUYER }, ...body },
      })
    );
    return { res, body: await w.readJson(res), status: res.status };
  };

  const withEnv = async (patch: Record<string, string | undefined>, fn: () => Promise<void>) => {
    const before: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(patch)) {
      before[k] = process.env[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      await fn();
    } finally {
      for (const [k, v] of Object.entries(before)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };

  /* ── the price is the server's ─────────────────────────────────── */

  it("prices every plan and travel zone itself, and asks Razorpay for that exact amount", async () => {
    for (const planId of SITE_PLAN_ORDER) {
      for (const travel of ["ncr", "outside"] as TravelZone[]) {
        await w.reset();
        const r = await open({ sitePlanId: planId, travel });
        assert.equal(r.status, 200, `${planId}/${travel}: ${JSON.stringify(r.body)}`);

        const expected = toPaise(withGst(sitePlanQuote(planId, travel).amountInr).total);
        assert.equal(r.body.amountPaise, expected, `${planId}/${travel}`);
        assert.equal(w.gw.orders.get(r.body.razorpayOrderId)!.amount, expected);
      }
    }
  });

  it("charges plan − launch discount + travel, in rupees we can read", () => {
    // Hard numbers, so a silent edit to a plan price or the discount
    // fails here rather than in somebody's bank statement.
    assert.equal(LAUNCH_OFFER.active, true);
    assert.equal(LAUNCH_OFFER.percent, 20);
    assert.equal(SITE_PLANS.confidence.priceInr, 49_000);
    assert.equal(SITE_PLANS.authority.priceInr, 99_000);
    assert.equal(SITE_PLANS.control.priceInr, 199_000);
    assert.equal(TRAVEL_FEES.ncr.amountInr, 3_000);
    assert.equal(TRAVEL_FEES.outside.amountInr, 15_000);

    //              49,000 − 9,800 + 3,000
    assert.equal(sitePlanQuote("confidence", "ncr").amountInr, 42_200);
    //              99,000 − 19,800 + 15,000
    assert.equal(sitePlanQuote("authority", "outside").amountInr, 94_200);
    //             1,99,000 − 39,800 + 3,000
    assert.equal(sitePlanQuote("control", "ncr").amountInr, 162_200);
  });

  it("ignores any amount the browser tries to name", async () => {
    const honest = await open({ sitePlanId: "control", travel: "outside" });
    await w.reset();
    const liar = await open({
      sitePlanId: "control",
      travel: "outside",
      amount: 1,
      amountPaise: 100,
      price: 1,
      amountInr: 1,
    });
    assert.equal(liar.status, 200);
    assert.equal(liar.body.amountPaise, honest.body.amountPaise);
    assert.ok(liar.body.amountPaise > 100);
  });

  /* ── what it refuses ───────────────────────────────────────────── */

  it("refuses a plan or a travel zone it does not know", async () => {
    for (const bad of [
      { sitePlanId: "free", travel: "ncr" },
      { sitePlanId: "", travel: "ncr" },
      { travel: "ncr" },
      { sitePlanId: { toString: () => "control" }, travel: "ncr" },
    ]) {
      const r = await open(bad);
      assert.equal(r.status, 400, JSON.stringify(bad));
      assert.equal(r.body.error, "invalid_plan");
    }

    for (const bad of [
      { sitePlanId: "authority", travel: "mars" },
      { sitePlanId: "authority" },
      { sitePlanId: "authority", travel: null },
    ]) {
      const r = await open(bad);
      assert.equal(r.status, 400, JSON.stringify(bad));
      assert.equal(r.body.error, "invalid_travel");
    }
  });

  /* ── what it stores and builds ─────────────────────────────────── */

  it("stores an ordinary basic_licence, with the plan's areas as the scene quota", async () => {
    const r = await open({ sitePlanId: "authority", travel: "ncr" });
    assert.equal(r.status, 200);

    const [row] = await w.q(`select purpose, scenes, notes from public.billing_orders`);
    // Not a new purpose: fulfilment, the one-workspace lock and the
    // refund reversal all branch on this column.
    assert.equal(row.purpose, "basic_licence");
    assert.equal(storedPurpose("site_plan"), "basic_licence");
    assert.equal(row.scenes, SITE_PLANS.authority.scenes);
    assert.match(row.notes, /VPV Authority/);
    assert.match(row.notes, /Launch offer/);
  });

  it("paying builds the workspace, with the plan's areas and a free first year", async () => {
    const r = await open({ sitePlanId: "control", travel: "outside" });
    const paid = await w.payInBrowser(r.body);
    assert.equal(paid.res.status, 200, JSON.stringify(paid.body));
    assert.equal(paid.body.status, "ready");
    assert.ok(paid.body.slug);

    const [org] = await w.q(
      `select plan, scene_quota, plan_status, support_until from public.organizations`
    );
    assert.equal(org.plan, "basic");
    assert.equal(org.scene_quota, SITE_PLANS.control.scenes);
    assert.equal(org.plan_status, "active");
    const months = (new Date(org.support_until).getTime() - Date.now()) / (30.4 * 86_400_000);
    assert.ok(months > 11.8 && months < 12.2, `first year free, got ${months} months`);

    assert.equal(await w.count("billing_invoices"), 1);
    assert.equal(await w.count("billing_payments", "status = 'captured'"), 1);
  });

  it("a second plan purchase by the same buyer is refused, like any other licence", async () => {
    const first = await open({ sitePlanId: "confidence", travel: "ncr" });
    await w.payInBrowser(first.body);
    const second = await open({ sitePlanId: "control", travel: "ncr" });
    assert.equal(second.status, 409, JSON.stringify(second.body));
  });

  /* ── the placeholder guard ─────────────────────────────────────── */

  it("refuses live keys while the prices are still placeholders", async () => {
    await withEnv(
      { RAZORPAY_KEY_ID: "rzp_live_AbCdEf123456", VERCEL_ENV: "production" },
      async () => {
        const r = await open({ sitePlanId: "authority", travel: "ncr" });
        assert.equal(r.status, 503, JSON.stringify(r.body));
        assert.equal(r.body.error, "prices_not_final");
        assert.equal(await w.count("billing_orders"), 0, "no order is opened");
      }
    );
  });

  it("and a live key outside production is refused before that, as it always was", async () => {
    await withEnv({ RAZORPAY_KEY_ID: "rzp_live_AbCdEf123456", VERCEL_ENV: undefined }, async () => {
      const r = await open({ sitePlanId: "authority", travel: "ncr" });
      assert.equal(r.status, 503, JSON.stringify(r.body));
      assert.equal(r.body.error, "payments_unavailable");
      assert.equal(await w.count("billing_orders"), 0);
    });
  });

  it("but the whole flow still runs on test keys, so it can be rehearsed", async () => {
    const r = await open({ sitePlanId: "confidence", travel: "ncr" });
    assert.equal(r.status, 200);
    assert.equal(r.body.testMode, true);
    const paid = await w.payInBrowser(r.body);
    assert.equal(paid.body.status, "ready");
  });

  it("the scene-ladder purchase is untouched by any of this", async () => {
    const r = await w.openOrder({ scenes: 5 });
    assert.equal(r.status, 200);
    const [row] = await w.q(`select purpose, scenes from public.billing_orders`);
    assert.equal(row.purpose, "basic_licence");
    assert.equal(row.scenes, 5);
  });
});
