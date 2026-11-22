import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import {
  EXTRA_AREA_MAX,
  EXTRA_HOUR_INR,
  EXTRA_VIDEO_MAX,
  LAUNCH_OFFER,
  PLACEHOLDER_PRICES,
  SITE_PLANS,
  SITE_PLAN_ORDER,
  SUPPORT_ANNUAL_INR,
  TRAVEL_FEES,
  discountBands,
  extraAreaCost,
  launchOfferOpen,
  offerSaving,
  planPrice,
  shootTimeFor,
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
import { launchOfferState } from "@/lib/server/launchOffer";
import { makeWorld, BUYER, freshIp, type World } from "./harness/world";

/**
 * The marketing site's named packs — the seven plans from VPV Lite to
 * VPV Signature.
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

  it("prices every plan itself, and asks Razorpay for that exact amount", async () => {
    for (const planId of SITE_PLAN_ORDER) {
      for (const travel of ["ncr"] as TravelZone[]) {
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
    // in somebody's bank statement. 21 Nov 2026: four yearly plans, priced
    // per month by the owner; the yearly charge is exactly 12 months.
    assert.deepEqual(SITE_PLAN_ORDER.map((id) => SITE_PLANS[id].monthlyInr), [3_560, 10_000, 13_542, 20_452]);
    assert.equal(SITE_PLANS.light.priceInr, 42_720);
    assert.equal(SITE_PLANS.premium.priceInr, 1_20_000);
    assert.equal(SITE_PLANS.ultra.priceInr, 1_62_504);
    assert.equal(SITE_PLANS.white_glove.priceInr, 2_45_424);
    for (const id of SITE_PLAN_ORDER) {
      assert.equal(SITE_PLANS[id].billing, "yearly", id);
      assert.equal(SITE_PLANS[id].priceInr, SITE_PLANS[id].monthlyInr * 12, id);
      assert.equal(SITE_PLANS[id].regularMonthlyInr, SITE_PLANS[id].monthlyInr * 2, id);
    }

    // The price per area still falls as the plans grow (it is no longer
    // printed on the cards, but the plans must stay sensible).
    assert.equal(sitePerArea("light"), 8_544);
    assert.equal(sitePerArea("premium"), 6_000);
    assert.equal(sitePerArea("ultra"), 3_611);
    for (let i = 1; i < SITE_PLAN_ORDER.length; i++) {
      assert.ok(sitePerArea(SITE_PLAN_ORDER[i]) < sitePerArea(SITE_PLAN_ORDER[i - 1]), SITE_PLAN_ORDER[i]);
    }

    // Link controls start at Premium (one-time view links) and are not sold as an add-on anywhere.
    assert.equal(SITE_PLANS.light.sharingControls, false);
    assert.equal(SITE_PLANS.premium.sharingControls, true);

    // The special offer: for the first 20 customers only, one tier: 50% off
    // the regular price (landing exactly on the decided prices), 3 months
    // free, free cab, 15 months of support free and the Sales Team logins at
    // the offer price. The regular prices are what is charged from the 21st
    // buyer, so they are pinned too.
    assert.equal(LAUNCH_OFFER.active, true);
    assert.equal(LAUNCH_OFFER.percent, 50);
    assert.equal(LAUNCH_OFFER.limit, 20);
    assert.equal(LAUNCH_OFFER.foundingLimit, 20, "there is no second tier");
    assert.equal(LAUNCH_OFFER.freeMonths, 3);
    assert.equal(SITE_PLANS.light.regularInr, 85_440);
    assert.equal(SITE_PLANS.ultra.regularInr, 3_25_008);
    assert.equal(SITE_PLANS.white_glove.regularInr, 4_90_848);
    for (const id of SITE_PLAN_ORDER) {
      const p = SITE_PLANS[id];
      assert.equal(p.priceInr, Math.round(p.regularInr * (1 - LAUNCH_OFFER.percent / 100)), id);
      assert.equal(planPrice(id, true), p.priceInr, id);
      assert.equal(planPrice(id, false), p.regularInr, id);
      assert.equal(offerSaving(id, false), 0, id);
    }

    // Legacy two-zone travel: the cab inside NCR. "Outside" is a place we
    // do not shoot yet, and the order route refuses it.
    assert.equal(TRAVEL_FEES.ncr.amountInr, 4_000);

    // Under the offer the cab is free: the plan price is the whole bill.
    assert.equal(sitePlanQuote("light", "ncr").amountInr, 42_720);
    assert.equal(sitePlanQuote("premium", "ncr").amountInr, 1_20_000);
    assert.equal(sitePlanQuote("ultra", "ncr").amountInr, 1_62_504);
    // Once it closes: regular price + ₹4,000 cab.
    assert.equal(sitePlanQuote("light", "ncr", false).amountInr, 85_440 + 4_000);
    assert.equal(sitePlanQuote("ultra", "ncr", false).amountInr, 3_25_008 + 4_000);
  });

  it("keeps every upgrade path pointing UP", () => {
    // The whole plan structure rests on this: buying a cheaper plan and
    // adding enough areas to match the next plan must always cost MORE than
    // just buying the next plan. If it ever does not, the dearer plan is
    // pointless and buyers will work that out faster than we will. (Into
    // White Glove the rule does not apply: it is priced for Mr. Gupta's own time.)
    for (let i = 1; i < SITE_PLAN_ORDER.length; i++) {
      const lo = SITE_PLAN_ORDER[i - 1];
      const hi = SITE_PLAN_ORDER[i];
      if (SITE_PLANS[hi].personal && !SITE_PLANS[lo].personal) continue;
      const need = SITE_PLANS[hi].scenes - SITE_PLANS[lo].scenes;
      // Past the slider's 15 extras a buyer cannot reach the next plan this way at all.
      if (need > EXTRA_AREA_MAX) continue;
      const via = SITE_PLANS[lo].priceInr + extraAreaCost(lo, need);
      assert.ok(via > SITE_PLANS[hi].priceInr, `${lo} + ${need} areas = ${via}, must exceed ${hi} ${SITE_PLANS[hi].priceInr}`);
    }
    assert.equal(SITE_PLANS.light.priceInr + extraAreaCost("light", 15), 1_27_720);
    // And the extras never cost more on a bigger plan.
    for (let i = 1; i < SITE_PLAN_ORDER.length; i++) {
      const a = SITE_PLANS[SITE_PLAN_ORDER[i - 1]].extraAreaLadder[0].each;
      const b = SITE_PLANS[SITE_PLAN_ORDER[i]].extraAreaLadder[0].each;
      assert.ok(b <= a, SITE_PLAN_ORDER[i]);
    }
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

  it("travels by cab only, and only to the cities we shoot in", () => {
    const ncr = siteQuote("premium", { city: "Manesar" });
    assert.equal(ncr.available, true);
    assert.equal(ncr.logistics?.amountInr, 4_000);
    const cab = ncr.lines.find((l) => l.kind === "travel");
    assert.ok(cab && /cab/i.test(cab.label), "the travel line is the cab");
    // Free for the first 20, shown at its real price struck out (like support)…
    assert.equal(cab!.amountInr, 0);
    assert.equal(cab!.regularInr, 4_000);
    assert.match(cab!.note ?? "", /Free for our first 20 customers/);
    // …and charged once the offer has closed.
    const closedCab = siteQuote("premium", { city: "Manesar", offerOpen: false }).lines.find((l) => l.kind === "travel");
    assert.equal(closedCab!.amountInr, 4_000);
    assert.ok(!ncr.lines.some((l) => /air|flight|airport|train/i.test(`${l.label} ${l.note ?? ""}`)));

    // Anywhere else is "coming soon": a bill can be shown, not paid, and no
    // travel is charged for a trip we will not make.
    for (const city of ["Coimbatore", "Panipat", "Nowhere-upon-Sea"]) {
      const q = siteQuote("premium", { city });
      assert.equal(q.available, false, city);
      assert.ok(!q.lines.some((l) => l.kind === "travel"), city);
      assert.equal(logisticsFor(city).inServiceArea, false, city);
    }
    assert.equal(logisticsFor("gurgaon").inServiceArea, true);
  });

  it("bills support, hosting & security on every plan: free for 15 months for the first 20", () => {
    // One of the first 20: a 15-month first period, support free for it.
    const founding = siteQuote("premium", { city: "Manesar" });
    assert.equal(founding.founding, true);
    assert.equal(founding.firstMonths, 15);
    assert.match(founding.lines[0].label, /first 15 months/);
    const fSupport = founding.lines.find((l) => l.kind === "support");
    assert.ok(fSupport, "the support line is shown");
    assert.equal(fSupport!.amountInr, 0);
    assert.equal(founding.supportInr, 0);
    assert.ok(founding.lines.some((l) => l.kind === "bonus" && /3 months free/.test(l.label)));
    // Everyone once the offer closes: one year, support charged.
    for (const opts of [{ offerOpen: false }]) {
      const q = siteQuote("premium", { city: "Manesar", ...opts });
      assert.equal(q.founding, false, JSON.stringify(opts));
      assert.equal(q.firstMonths, 12);
      assert.match(q.lines[0].label, /first year/);
      assert.match(q.lines[0].note ?? "", /billed yearly/);
      assert.equal(q.lines.find((l) => l.kind === "support")!.amountInr, SUPPORT_ANNUAL_INR);
      assert.equal(q.supportInr, SUPPORT_ANNUAL_INR);
      assert.ok(!q.lines.some((l) => l.kind === "bonus"));
    }
    // What renews every year: the plan at today's price plus the extra areas.
    assert.equal(siteQuote("premium", { city: "Manesar" }).yearlyInr, 1_20_000);
    assert.equal(siteQuote("premium", { city: "Manesar", extraAreas: 2 }).yearlyInr, 1_20_000 + 9_000);
    assert.equal(siteQuote("premium", { city: "Manesar", offerOpen: false }).yearlyInr, 2_40_000);
    // The old one-time plans kept their separate support year (SUPPORT_ANNUAL_INR).
    assert.equal(SUPPORT_ANNUAL_INR, 11_988);
    assert.equal(siteQuote("control", { city: "Manesar", offerOpen: false }).supportInr, SUPPORT_ANNUAL_INR);
  });

  it("takes a coupon off the plan and extras, never the cab or the support year", () => {
    const base = siteQuote("premium", { city: "Manesar", offerOpen: false, extraAreas: 2 });
    const pct = siteQuote("premium", {
      city: "Manesar",
      offerOpen: false,
      extraAreas: 2,
      coupon: { code: "FRIENDS10", percentOff: 10, amountOffInr: null },
    });
    const discountable = base.lines
      .filter((l) => l.kind !== "travel" && l.kind !== "support")
      .reduce((t, l) => t + l.amountInr, 0);
    assert.equal(pct.couponInr, Math.round(discountable * 0.1));
    assert.equal(pct.taxableInr, base.taxableInr - pct.couponInr);
    assert.ok(pct.lines.some((l) => l.kind === "coupon" && l.amountInr === -pct.couponInr));

    // A fixed amount can never take more than the discountable part.
    const huge = siteQuote("premium", {
      city: "Manesar",
      offerOpen: false,
      coupon: { code: "ALL", percentOff: null, amountOffInr: 10_000_000 },
    });
    assert.equal(huge.taxableInr, 4_000 + SUPPORT_ANNUAL_INR);
  });

  it("includes 2 to 24 hours of shoot time by plan, and charges extra time by the hour", () => {
    assert.deepEqual(SITE_PLAN_ORDER.map((id) => shootTimeFor(id).totalHours), [2, 7, 13, 24]);
    for (const id of SITE_PLAN_ORDER) {
      const q = siteQuote(id, { city: "Manesar" });
      assert.equal(q.shoot.extraHours, 0, id);
      assert.ok(!q.lines.some((l) => /extra shoot time/i.test(l.label)), id);
    }

    // 4 extra areas = 60 minutes = exactly one extra hour.
    const one = siteQuote("premium", { city: "Manesar", extraAreas: 4 });
    assert.equal(one.shoot.extraHours, 1);
    assert.equal(one.shoot.totalHours, 8);
    const line = one.lines.find((l) => /extra shoot time/i.test(l.label));
    assert.ok(line);
    assert.equal(line!.amountInr, EXTRA_HOUR_INR);

    // 5 extra areas = 75 minutes, rounded UP to two hours.
    assert.equal(shootTimeFor("premium", 5).extraHours, 2);
    // Videos count too.
    assert.equal(shootTimeFor("light", 0, 4).extraHours, 1);
  });

  it("shows a two-day shoot but never bills the same hours twice", () => {
    assert.equal(siteQuote("premium", { city: "Manesar", extraAreas: 4 }).shoot.days, 1);
    // 7 h + 5 areas (75 min → 2 h) = 9 h: past an 8-hour day.
    const big = siteQuote("premium", { city: "Manesar", extraAreas: 5 });
    assert.equal(big.shoot.days, 2);
    // Time is billed by the hour; no day fee on top, so one extra area can
    // never jump the total by ₹20,000.
    assert.ok(!big.lines.some((l) => /additional shoot day/i.test(l.label)));
    const nine = siteQuote("premium", { city: "Manesar", extraAreas: 8 });
    const ten = siteQuote("premium", { city: "Manesar", extraAreas: 9 });
    assert.ok(ten.taxableInr - nine.taxableInr <= 4_500 + EXTRA_HOUR_INR);
    // The big plans are several days on site from the start, shown and not billed as days.
    assert.equal(siteQuote("ultra", { city: "Manesar" }).shoot.days, 2);
    assert.equal(siteQuote("white_glove", { city: "Manesar" }).shoot.days, 3);
  });

  it("shows the discount bands with percentages the buyer can check", () => {
    const bands = discountBands("premium");
    assert.deepEqual(
      bands.map((b) => [b.from, b.to, b.each, b.percentOff]),
      [
        [1, 5, 4_500, 25],
        [6, null, 4_000, 33],
      ]
    );
    // Every band on every plan is cheaper than the plan's own per-area rate.
    for (const id of SITE_PLAN_ORDER) {
      for (const b of discountBands(id)) assert.ok(b.percentOff > 0, `${id} ${b.each}`);
    }
  });

  it("totals the quote to the sum of the lines it showed, plus GST", () => {
    // Nothing may appear in the total that was not a visible line: that is
    // the whole promise of the billing screen.
    const q = siteQuote("premium", { city: "Pune", extraAreas: 6, selfVideos: 10, shotVideos: 3 });
    const sum = q.lines.reduce((t, l) => t + l.amountInr, 0);
    assert.equal(q.taxableInr, sum);
    assert.equal(q.gstInr, Math.round(sum * 0.18 * 100) / 100);
    assert.equal(q.totalInr, q.taxableInr + q.gstInr);
    assert.equal(q.totalAreas, SITE_PLANS.premium.scenes + 6);
    // 10 uploaded + 3 shot. Premium's allowance covers 5 of the uploads,
    // so only 5 of them are charged; every shot video is.
    assert.equal(q.totalVideos, 13);
    assert.equal(q.paidSelfVideos, 10 - SITE_PLANS.premium.videos);
    assert.equal(q.shotVideos, 3);
  });

  it("prices the funnel's add-ons server-side, whatever the browser asks", async () => {
    await w.reset();
    const r = await open({
      sitePlanId: "premium",
      city: "Gurugram",
      extraAreas: 4,
      selfVideos: 5,
      shotVideos: 2,
      // All of these are attempts to name a price. None may be read.
      amount: 1,
      amountInr: 1,
      extraAreaCost: 1,
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const expected = toPaise(
      siteQuote("premium", { city: "Gurugram", extraAreas: 4, selfVideos: 5, shotVideos: 2 }).totalInr
    );
    assert.equal(r.body.amountPaise, expected);
    assert.equal(w.gw.orders.get(r.body.razorpayOrderId)!.amount, expected);
  });

  it("clamps add-ons out of range instead of refusing a real purchase", async () => {
    await w.reset();
    const r = await open({
      sitePlanId: "premium",
      city: "Manesar",
      extraAreas: 9_999,
      selfVideos: -5,
      shotVideos: 9_999,
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const expected = toPaise(
      siteQuote("premium", { city: "Manesar", extraAreas: EXTRA_AREA_MAX, selfVideos: 0, shotVideos: EXTRA_VIDEO_MAX }).totalInr
    );
    assert.equal(r.body.amountPaise, expected);
  });

  it("refuses a site plan with neither a city nor a travel zone", async () => {
    await w.reset();
    const r = await open({ sitePlanId: "premium" });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "invalid_travel");
  });

  it("ignores any amount the browser tries to name", async () => {
    const honest = await open({ sitePlanId: "premium", travel: "ncr" });
    await w.reset();
    const liar = await open({
      sitePlanId: "premium",
      travel: "ncr",
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
      { sitePlanId: { toString: () => "premium" }, travel: "ncr" },
    ]) {
      const r = await open(bad);
      assert.equal(r.status, 400, JSON.stringify(bad));
      assert.equal(r.body.error, "invalid_plan");
    }

    for (const bad of [
      { sitePlanId: "premium", travel: "mars" },
      { sitePlanId: "premium" },
      { sitePlanId: "premium", travel: null },
    ]) {
      const r = await open(bad);
      assert.equal(r.status, 400, JSON.stringify(bad));
      assert.equal(r.body.error, "invalid_travel");
    }
  });

  /* ── what it stores and builds ─────────────────────────────────── */

  it("stores an ordinary basic_licence, with the plan's areas as the scene quota", async () => {
    const r = await open({ sitePlanId: "premium", travel: "ncr" });
    assert.equal(r.status, 200);

    const [row] = await w.q(`select purpose, scenes, notes from public.billing_orders`);
    // Not a new purpose: fulfilment, the one-workspace lock and the
    // refund reversal all branch on this column.
    assert.equal(row.purpose, "basic_licence");
    assert.equal(storedPurpose("site_plan"), "basic_licence");
    assert.equal(row.scenes, SITE_PLANS.premium.scenes);
    assert.match(row.notes, /^VPV Premium — /);
    // A yearly plan says what it renews at, read back when the workspace is built.
    assert.match(row.notes, /renews yearly at ₹1,20,000/);
    // The offer is open in a fresh world, and the order says it took it.
    assert.match(row.notes, /Special offer/);
  });

  it("paying builds the workspace, with the plan's areas and a free first 15 months (founding)", async () => {
    const r = await open({ sitePlanId: "premium", travel: "ncr" });
    const paid = await w.payInBrowser(r.body);
    assert.equal(paid.res.status, 200, JSON.stringify(paid.body));
    assert.equal(paid.body.status, "ready");
    assert.ok(paid.body.slug);

    const [org] = await w.q(
      `select plan, scene_quota, plan_status, support_until from public.organizations`
    );
    assert.equal(org.plan, "basic");
    assert.equal(org.scene_quota, SITE_PLANS.premium.scenes);
    assert.equal(org.plan_status, "active");
    const months = (new Date(org.support_until).getTime() - Date.now()) / (30.4 * 86_400_000);
    assert.ok(months > 14.8 && months < 15.2, `first 15 months free, got ${months} months`);

    assert.equal(await w.count("billing_invoices"), 1);
    assert.equal(await w.count("billing_payments", "status = 'captured'"), 1);
  });

  it("a second plan purchase by the same buyer is refused, like any other licence", async () => {
    const first = await open({ sitePlanId: "light", travel: "ncr" });
    await w.payInBrowser(first.body);
    const second = await open({ sitePlanId: "premium", travel: "ncr" });
    assert.equal(second.status, 409, JSON.stringify(second.body));
  });

  /* ── the placeholder guard ─────────────────────────────────────── */

  it("the plan prices are final, so live keys in production are NOT refused by the price guard", async () => {
    assert.equal(PLACEHOLDER_PRICES, false);
    await withEnv(
      { RAZORPAY_KEY_ID: "rzp_live_AbCdEf123456", VERCEL_ENV: "production" },
      async () => {
        const r = await open({ sitePlanId: "premium", travel: "ncr" });
        assert.notEqual(r.body.error, "prices_not_final", JSON.stringify(r.body));
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(r.body.testMode, false, "a live key opens a live order");
      }
    );
  });

  it("and a live key outside production is refused before that, as it always was", async () => {
    await withEnv({ RAZORPAY_KEY_ID: "rzp_live_AbCdEf123456", VERCEL_ENV: undefined }, async () => {
      const r = await open({ sitePlanId: "premium", travel: "ncr" });
      assert.equal(r.status, 503, JSON.stringify(r.body));
      assert.equal(r.body.error, "payments_unavailable");
      assert.equal(await w.count("billing_orders"), 0);
    });
  });

  it("but the whole flow still runs on test keys, so it can be rehearsed", async () => {
    const r = await open({ sitePlanId: "light", travel: "ncr" });
    assert.equal(r.status, 200);
    assert.equal(r.body.testMode, true);
    const paid = await w.payInBrowser(r.body);
    assert.equal(paid.body.status, "ready");
  });

  it("keeps the first-20 promise: the whole offer closes together", async () => {
    // A fake client returning N paid site-plan orders, plus noise that must
    // NOT count: a scene-ladder licence, and a refunded plan (filtered by
    // the status query, so it is simply never returned).
    const fake = (n: number) =>
      ({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: async () => ({
                  data: [
                    ...Array.from({ length: n }, (_, i) => ({
                      // The four yearly plans on sale, and the one-time plans sold before.
                      notes: `${["VPV Light", "VPV Premium", "VPV Ultra", "White Glove", "VPV Confidence", "VPV Control"][i % 6]} — 8 areas`,
                    })),
                    { notes: "VPV Basic licence — 7 scenes (includes 1 year support and hosting)" },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }) as never;

    const at19 = await launchOfferState(fake(19));
    assert.equal(at19.sold, 19);
    assert.equal(at19.open, true);
    assert.equal(at19.founding, true);
    assert.equal(at19.foundingRemaining, 1);

    const at20 = await launchOfferState(fake(20));
    assert.equal(at20.open, false, "the 21st customer gets none of it");
    assert.equal(at20.founding, false);
    assert.equal(at20.foundingRemaining, 0);
    assert.equal(at20.remaining, 0);
    assert.equal(launchOfferOpen(20), false);
    assert.equal(launchOfferOpen(19), true);

    // Once closed, the quote charges the regular price and shows no saving.
    const closed = siteQuote("premium", { city: "Manesar", offerOpen: false });
    assert.equal(closed.savingInr, 0);
    assert.ok(!closed.lines.some((l) => l.kind === "offer"));
    assert.equal(closed.taxableInr, 2_40_000 + 4_000 + SUPPORT_ANNUAL_INR);
  });

  it("charges the regular price for real once 20 customers have paid", async () => {
    await w.reset();
    for (let i = 0; i < 20; i++) {
      await w.q(
        `insert into public.billing_orders (purpose, scenes, amount_paise, status, buyer_name, buyer_email, buyer_company, notes)
         values ('basic_licence', 8, 100, 'paid', 'Earlier buyer', $1, 'Co', 'VPV Authority — 8 areas')`,
        [`buyer${i}@example.com`]
      );
    }
    const r = await open({ sitePlanId: "premium", city: "Manesar" });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const expected = toPaise(siteQuote("premium", { city: "Manesar", offerOpen: false }).totalInr);
    assert.equal(r.body.amountPaise, expected);
    const [row] = await w.q(`select notes from public.billing_orders where status = 'created'`);
    assert.doesNotMatch(row.notes, /Special offer/);
  });

  it("the scene-ladder purchase is untouched by any of this", async () => {
    const r = await w.openOrder({ scenes: 5 });
    assert.equal(r.status, 200);
    const [row] = await w.q(`select purpose, scenes from public.billing_orders`);
    assert.equal(row.purpose, "basic_licence");
    assert.equal(row.scenes, 5);
  });

  /* ── cities we do not shoot in yet, and coupons ───────────────────── */

  it("refuses an order for a city we do not shoot in yet", async () => {
    await w.reset();
    for (const body of [{ city: "Ludhiana" }, { city: "Panipat" }, { travel: "outside" }]) {
      const r = await open({ sitePlanId: "premium", ...body });
      assert.equal(r.status, 400, JSON.stringify(r.body));
      assert.equal(r.body.error, "city_not_served");
      assert.match(String(r.body.message), /coming to/i);
    }
    assert.equal(await w.count("billing_orders"), 0);
  });

  it("applies a real coupon server-side, and refuses a made-up one", async () => {
    await w.reset();
    await w.q(`insert into public.coupons (code, percent_off, max_uses) values ('FRIENDS10', 10, 1)`);

    const fake = await open({ sitePlanId: "premium", city: "Manesar", coupon: "NOPE123" });
    assert.equal(fake.status, 400);
    assert.equal(fake.body.error, "coupon_invalid");

    const r = await open({ sitePlanId: "premium", city: "Manesar", coupon: " friends10 " });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const expected = toPaise(
      siteQuote("premium", { city: "Manesar", coupon: { code: "FRIENDS10", percentOff: 10, amountOffInr: null } }).totalInr
    );
    assert.equal(r.body.amountPaise, expected);
    const [row] = await w.q(`select notes from public.billing_orders where status = 'created'`);
    assert.match(row.notes, /, coupon FRIENDS10(, | \()/);
  });

  it("a one-use coupon cannot be used twice", async () => {
    await w.reset();
    await w.q(`insert into public.coupons (code, amount_off_inr, max_uses) values ('ONCE5K', 5000, 1)`);
    await w.q(
      `insert into public.billing_orders (purpose, scenes, amount_paise, status, buyer_name, buyer_email, buyer_company, notes)
       values ('basic_licence', 8, 100, 'paid', 'Earlier buyer', 'early@example.com', 'Co', 'VPV Authority — 8 areas, cab Manesar, coupon ONCE5K (includes year 1 of support, hosting & security, free)')`
    );
    const r = await open({ sitePlanId: "premium", city: "Manesar", coupon: "ONCE5K" });
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.match(String(r.body.message), /already been used/);
  });
});
