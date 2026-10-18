import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import {
  EXTRA_AREA_MAX,
  LAUNCH_OFFER,
  SITE_PLANS,
  SITE_PLAN_ORDER,
  TRAVEL_FEES,
  extraAreaCost,
  launchDiscount,
  siteQuote,
  sitePerArea,
  toPaise,
  withGst,
  sitePlanQuote,
  storedPurpose,
  type SitePlanId,
  type TravelZone,
} from "@/lib/pricing";
import { logisticsFor } from "@/lib/logistics";
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

  it("charges plan + travel, in rupees we can read", () => {
    // Hard numbers, so a silent edit to a plan price fails here rather than
    // in somebody's bank statement.
    assert.equal(SITE_PLANS.confidence.priceInr, 35_000);
    assert.equal(SITE_PLANS.authority.priceInr, 55_000);
    assert.equal(SITE_PLANS.control.priceInr, 90_000);

    // Areas rise in even steps, and the price PER AREA falls as they do —
    // that fall is what moves a buyer up a tier, so it is pinned here.
    assert.equal(SITE_PLANS.confidence.scenes, 4);
    assert.equal(SITE_PLANS.authority.scenes, 8);
    assert.equal(SITE_PLANS.control.scenes, 15);
    assert.equal(sitePerArea("confidence"), 8_750);
    assert.equal(sitePerArea("authority"), 6_875);
    assert.equal(sitePerArea("control"), 6_000);

    // Sharing controls are Control's ONLY exclusive, and are not sold as an
    // add-on anywhere. If this ever becomes true elsewhere, Control has no
    // reason to exist and the ladder above collapses.
    assert.equal(SITE_PLANS.confidence.sharingControls, false);
    assert.equal(SITE_PLANS.authority.sharingControls, false);
    assert.equal(SITE_PLANS.control.sharingControls, true);

    // The launch discount is OFF: the list prices were cut instead. Leaving
    // it on would quietly sell Control at ₹72,000.
    assert.equal(LAUNCH_OFFER.active, false);
    assert.equal(launchDiscount(SITE_PLANS.control.priceInr), 0);

    // Legacy two-zone travel, now mapped onto the real logistics tiers.
    assert.equal(TRAVEL_FEES.ncr.amountInr, 4_000);
    assert.equal(TRAVEL_FEES.outside.amountInr, 15_000);

    //              35,000 + 4,000
    assert.equal(sitePlanQuote("confidence", "ncr").amountInr, 39_000);
    //              55,000 + 15,000
    assert.equal(sitePlanQuote("authority", "outside").amountInr, 70_000);
    //              90,000 + 4,000
    assert.equal(sitePlanQuote("control", "ncr").amountInr, 94_000);
  });

  it("keeps every upgrade path pointing UP", () => {
    // The whole tier structure rests on this: buying a cheaper plan and
    // adding enough areas to match the next plan must always cost MORE than
    // just buying the next plan. If it ever does not, the dearer tier is
    // pointless and buyers will work that out faster than we will.
    const conf = SITE_PLANS.confidence;
    const auth = SITE_PLANS.authority;
    const ctrl = SITE_PLANS.control;

    const confToAuth = conf.priceInr + extraAreaCost("confidence", auth.scenes - conf.scenes);
    assert.ok(
      confToAuth > auth.priceInr,
      `Confidence + ${auth.scenes - conf.scenes} areas = ${confToAuth}, must exceed Authority ${auth.priceInr}`
    );
    assert.equal(confToAuth, 59_000);

    const authToCtrl = auth.priceInr + extraAreaCost("authority", ctrl.scenes - auth.scenes);
    assert.ok(
      authToCtrl > ctrl.priceInr,
      `Authority + ${ctrl.scenes - auth.scenes} areas = ${authToCtrl}, must exceed Control ${ctrl.priceInr}`
    );
    assert.equal(authToCtrl, 91_500);
  });

  it("makes the price per area fall as areas are added, on every plan", () => {
    for (const planId of SITE_PLAN_ORDER) {
      let previous = sitePerArea(planId, 0);
      for (let extras = 1; extras <= 10; extras++) {
        const now = sitePerArea(planId, extras);
        assert.ok(
          now <= previous,
          `${planId}: per-area rose from ${previous} to ${now} at +${extras}`
        );
        previous = now;
      }
      // And it must genuinely fall, not merely stay flat — the falling
      // number is the thing the slider is for.
      assert.ok(sitePerArea(planId, 10) < sitePerArea(planId, 0), planId);
    }
  });

  it("prices travel from the factory's city, not a two-way guess", () => {
    // Tier 1 (road) and Tier 5 (air) are the two ends of the sheet.
    const ncr = siteQuote("authority", { city: "Manesar" });
    const air = siteQuote("authority", { city: "Coimbatore" });
    assert.equal(ncr.logistics?.tier, 1);
    assert.equal(air.logistics?.tier, 5);
    assert.equal(ncr.logistics?.amountInr, 4_000);
    assert.equal(air.logistics?.amountInr, 2_000);

    // Tier 5 does NOT cover the flights, and the quote has to say so —
    // this list is what the billing screen prints as "arranged by you".
    assert.ok(air.logistics!.spec.clientArranges.length > 0);
    assert.equal(ncr.logistics!.spec.clientArranges.length, 0);

    // A city we have not priced still gets a number, flagged for a rep.
    const unknown = siteQuote("authority", { city: "Nowhere-upon-Sea" });
    assert.equal(unknown.logistics?.needsConfirmation, true);
    assert.equal(unknown.logistics?.tier, 5);
    assert.equal(logisticsFor("Manesar").needsConfirmation, false);
  });

  it("only charges a second shoot day for a shoot that needs one", () => {
    // No stock plan may trigger a second day, and nor may a few extras —
    // a ₹20,000 jump next to a ₹4,500 slider step reads as a trick.
    for (const planId of SITE_PLAN_ORDER) {
      assert.equal(siteQuote(planId, { city: "Manesar" }).shootDays, 1, planId);
    }
    assert.equal(siteQuote("control", { city: "Manesar", extraAreas: 5 }).shootDays, 1);

    // A genuinely bigger shoot does, and it is a line on the bill.
    const big = siteQuote("control", { city: "Manesar", extraAreas: 10 });
    assert.equal(big.shootDays, 2);
    assert.ok(big.lines.some((l) => /additional shoot day/i.test(l.label)));
  });

  it("totals the quote to the sum of the lines it showed, plus GST", () => {
    // Nothing may appear in the total that was not a visible line: that is
    // the whole promise of the billing screen.
    const q = siteQuote("control", { city: "Pune", extraAreas: 6, extraVideos: 3 });
    const sum = q.lines.reduce((t, l) => t + l.amountInr, 0);
    assert.equal(q.taxableInr, sum);
    assert.equal(q.gstInr, Math.round(sum * 0.18 * 100) / 100);
    assert.equal(q.totalInr, q.taxableInr + q.gstInr);
    assert.equal(q.totalAreas, SITE_PLANS.control.scenes + 6);
    assert.equal(q.totalVideos, SITE_PLANS.control.videos + 3);
  });

  it("prices the funnel's add-ons server-side, whatever the browser asks", async () => {
    await w.reset();
    const r = await open({
      sitePlanId: "authority",
      city: "Coimbatore",
      extraAreas: 4,
      extraVideos: 2,
      // All of these are attempts to name a price. None may be read.
      amount: 1,
      amountInr: 1,
      extraAreaCost: 1,
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const expected = toPaise(
      siteQuote("authority", { city: "Coimbatore", extraAreas: 4, extraVideos: 2 }).totalInr
    );
    assert.equal(r.body.amountPaise, expected);
    assert.equal(w.gw.orders.get(r.body.razorpayOrderId)!.amount, expected);
  });

  it("clamps add-ons out of range instead of refusing a real purchase", async () => {
    await w.reset();
    const r = await open({
      sitePlanId: "control",
      city: "Manesar",
      extraAreas: 9_999,
      extraVideos: -5,
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const expected = toPaise(
      siteQuote("control", { city: "Manesar", extraAreas: EXTRA_AREA_MAX, extraVideos: 0 }).totalInr
    );
    assert.equal(r.body.amountPaise, expected);
  });

  it("refuses a site plan with neither a city nor a travel zone", async () => {
    await w.reset();
    const r = await open({ sitePlanId: "authority" });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "invalid_travel");
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
    // The launch offer is off, so it must NOT appear on a stored order.
    assert.doesNotMatch(row.notes, /Launch offer/);
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
