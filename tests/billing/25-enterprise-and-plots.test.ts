/**
 * The seven plans sold by factory size (20 Nov 2026), and the gold ones.
 *
 * What matters: the headline prices, sizes and AOAs are pinned; the cost
 * per AOA falls plan by plan; VPV and VPV Signature (Mr. Gupta's own plans)
 * are charged the right amount; and the recommendation never pushes a small
 * plant into a gold plan or leaves a big plant on a plan sized for less.
 * The four plans sold before stay known, so the workspaces that bought them
 * keep working, but can no longer be bought.
 */

import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import {
  ENTERPRISE_PERSONAL,
  LEGACY_PLAN_ORDER,
  PLOT_BANDS,
  SITE_PLANS,
  SITE_PLAN_ORDER,
  costPerAoa,
  infoIconsLabel,
  linkControlLabels,
  isKnownPlanId,
  isPlotBand,
  isSitePlanId,
  planForPlot,
  planForSqft,
  siteQuote,
  sitePlanFromNotes,
  toPaise,
  withGst,
} from "@/lib/pricing";
import { recommendPlan } from "@/lib/funnel";
import { makeWorld, BUYER, freshIp, type World } from "./harness/world";

describe("seven plans: sizes, prices and AOAs", () => {
  it("lists the seven plans in order, each with its factory size", () => {
    assert.deepEqual([...SITE_PLAN_ORDER], ["lite", "plus", "pro", "premium", "ultra", "vpv", "signature"]);
    assert.deepEqual(
      SITE_PLAN_ORDER.map((id) => SITE_PLANS[id].plot.area),
      [
        "Under 2,000 sq ft",
        "2,000–5,000 sq ft",
        "5,000–10,000 sq ft",
        "10,000–20,000 sq ft",
        "20,000–40,000 sq ft",
        "40,000–80,000 sq ft",
        "80,000+ sq ft",
      ]
    );
    // Each band starts where the one before it stops.
    for (let i = 1; i < SITE_PLAN_ORDER.length; i++) {
      assert.equal(SITE_PLANS[SITE_PLAN_ORDER[i]].plot.minSqft, SITE_PLANS[SITE_PLAN_ORDER[i - 1]].plot.maxSqft);
    }
    assert.equal(SITE_PLANS.signature.plot.maxSqft, null);
  });

  it("pins the prices (just below a round figure; the gold plans round) and the AOAs", () => {
    assert.deepEqual(
      SITE_PLAN_ORDER.map((id) => SITE_PLANS[id].priceInr),
      [34_999, 64_999, 94_999, 1_19_999, 1_99_999, 4_50_000, 6_00_000]
    );
    assert.deepEqual(SITE_PLAN_ORDER.map((id) => SITE_PLANS[id].scenes), [2, 5, 8, 14, 40, 100, 150]);
    for (const id of SITE_PLAN_ORDER) assert.equal(SITE_PLANS[id].regularInr, SITE_PLANS[id].priceInr * 2, id);
  });

  it("makes the cost per AOA fall on every step up", () => {
    assert.deepEqual(
      SITE_PLAN_ORDER.map((id) => costPerAoa(id, true)),
      [17_500, 13_000, 11_875, 8_571, 5_000, 4_500, 4_000]
    );
    for (let i = 1; i < SITE_PLAN_ORDER.length; i++) {
      assert.ok(costPerAoa(SITE_PLAN_ORDER[i]) < costPerAoa(SITE_PLAN_ORDER[i - 1]), SITE_PLAN_ORDER[i]);
    }
  });

  it("spreads the features: Lite/Plus base, Pro up media, link controls one by one, VIP/Signature Mr. Gupta", () => {
    assert.deepEqual(SITE_PLAN_ORDER.map((id) => SITE_PLANS[id].level), [0, 0, 1, 1, 2, 3, 3]);
    // The owner's split of the link controls (20 Nov 2026).
    assert.deepEqual(SITE_PLAN_ORDER.map((id) => linkControlLabels(id)), [
      [],
      [],
      [],
      ["One-time view link"],
      ["One-time view link", "Password-protected link"],
      ["One-time view link", "Control link expiry time", "Password-protected link"],
      ["One-time view link", "Control link expiry time", "Limit device access", "Password-protected link"],
    ]);
    assert.deepEqual(SITE_PLAN_ORDER.map((id) => SITE_PLANS[id].sharingControls), [false, false, false, true, true, true, true]);
    // Information icons: 10 and 20, then unlimited.
    assert.deepEqual(SITE_PLAN_ORDER.map((id) => infoIconsLabel(id)), [
      "10 information icons",
      "20 information icons",
      ...Array(5).fill("Unlimited information icons"),
    ]);
    assert.deepEqual(SITE_PLAN_ORDER.map((id) => SITE_PLANS[id].personal), [false, false, false, false, false, true, true]);
    for (const id of ["lite", "plus"] as const) {
      assert.equal(SITE_PLANS[id].videos, 0);
      assert.equal(SITE_PLANS[id].pdfs, 0);
    }
    for (const id of ["pro", "premium", "ultra", "vpv", "signature"] as const) {
      assert.ok(SITE_PLANS[id].videos > 0 && SITE_PLANS[id].pdfs > 0, id);
    }
  });

  it("sells only the seven; the four before them stay known for the workspaces that have them", () => {
    for (const id of SITE_PLAN_ORDER) assert.ok(isSitePlanId(id), id);
    for (const id of LEGACY_PLAN_ORDER) {
      assert.ok(!isSitePlanId(id), id);
      assert.ok(isKnownPlanId(id), id);
      assert.equal(SITE_PLANS[id].legacy, true, id);
    }
    assert.ok(!isSitePlanId("platinum"));
    assert.ok(!isKnownPlanId("platinum"));
  });

  it("reads the plan back from an order's description, never confusing VPV VIP with the scene licence", () => {
    assert.equal(sitePlanFromNotes("VPV VIP — 100 areas, Special offer, 24 hours shoot"), "vpv");
    assert.equal(sitePlanFromNotes("VPV — 100 areas"), "vpv", "its name on its first day");
    assert.equal(sitePlanFromNotes("VPV Signature — 150 areas"), "signature");
    assert.equal(sitePlanFromNotes("VPV Pro — 8 areas"), "pro");
    assert.equal(sitePlanFromNotes("VPV Control — 15 areas, 9 process videos"), "control");
    assert.equal(sitePlanFromNotes("VPV Basic licence — 5 scenes (includes 1 year support and hosting)"), null);
    assert.equal(sitePlanFromNotes(null), null);
  });

  it("names Mr. Nitin Gupta in both personal benefits", () => {
    assert.match(ENTERPRISE_PERSONAL.discussion.short, /Mr\. Gupta/);
    assert.match(ENTERPRISE_PERSONAL.shoot.short, /Nitin Gupta/);
    assert.match(ENTERPRISE_PERSONAL.discussion.long, /Nitin Gupta/);
    assert.match(ENTERPRISE_PERSONAL.shoot.long, /Nitin Gupta/);
  });

  it("charges Signature ₹6,00,000 + 18% GST under the offer, and ₹12,00,000 + GST after it", () => {
    const on = siteQuote("signature", { offerOpen: true });
    const off = siteQuote("signature", { offerOpen: false });
    assert.equal(withGst(6_00_000).total, 7_08_000);
    assert.equal(withGst(12_00_000).total, 14_16_000);
    const planPart = (q: ReturnType<typeof siteQuote>) =>
      q.lines.filter((l) => l.kind === "plan" || l.kind === "offer").reduce((x, l) => x + l.amountInr, 0);
    assert.equal(planPart(on), 6_00_000);
    assert.equal(planPart(off), 12_00_000);
  });
});

describe("seven plans: factory size → plan", () => {
  it("maps each band, and any square footage, to its plan", () => {
    assert.deepEqual(PLOT_BANDS.map((b) => b.plan), [...SITE_PLAN_ORDER]);
    assert.equal(planForPlot("lt2000"), "lite");
    assert.equal(planForPlot("10000to20000"), "premium");
    assert.equal(planForPlot("80000plus"), "signature");
    assert.equal(planForPlot(null), null);
    assert.ok(isPlotBand("40000to80000"));
    assert.ok(!isPlotBand("upto200"), "the old square-yard bands are gone");
    assert.equal(planForSqft(1_999), "lite");
    assert.equal(planForSqft(2_000), "plus");
    assert.equal(planForSqft(39_999), "ultra");
    assert.equal(planForSqft(40_000), "vpv");
    assert.equal(planForSqft(2_50_000), "signature");
  });

  it("recommends by the smallest plan that fits the scope, never below the plant's plan", () => {
    assert.equal(recommendPlan({ aoaCount: 2 }).plan, "lite");
    assert.equal(recommendPlan({ aoaCount: 3 }).plan, "plus");
    assert.equal(recommendPlan({ aoaCount: 3, plotBand: "lt2000" }).plan, "plus");
    assert.equal(recommendPlan({ aoaCount: 3, plotBand: "5000to10000" }).plan, "pro");
    assert.equal(recommendPlan({ aoaCount: 3, plotBand: "20000to40000" }).plan, "ultra");
    assert.equal(recommendPlan({ aoaCount: 20 }).plan, "ultra");
  });

  it("never recommends a gold plan to a smaller plant, however much they ask for", () => {
    const r = recommendPlan({ aoaCount: 60, pdfCount: 300 });
    assert.equal(r.plan, "ultra");
    assert.equal(r.needsExtras, true);
    assert.equal(recommendPlan({ aoaCount: 60, plotBand: "10000to20000" }).plan, "ultra");
  });

  it("recommends VPV or Signature for a 40,000+ sq ft plant, with extras if the scope is bigger", () => {
    const small = recommendPlan({ aoaCount: 5, plotBand: "40000to80000" });
    assert.equal(small.plan, "vpv");
    assert.equal(small.needsExtras, false);
    assert.equal(recommendPlan({ aoaCount: 120, plotBand: "40000to80000" }).plan, "signature");
    const big = recommendPlan({ aoaCount: 160, plotBand: "80000plus" });
    assert.equal(big.plan, "signature");
    assert.equal(big.extraAreas, 160 - SITE_PLANS.signature.scenes);
  });

  it("keeps the link-controls filter: a buyer who wants the link protected gets Premium at least", () => {
    assert.equal(recommendPlan({ aoaCount: 3, wantsSharingControls: true }).plan, "premium");
    assert.equal(recommendPlan({ aoaCount: 3, wantsSharingControls: true, plotBand: "80000plus" }).plan, "signature");
  });
});

describe("seven plans: the order route", () => {
  let w: World;
  before(async () => {
    w = await makeWorld();
  });
  beforeEach(async () => {
    await w.reset();
  });
  after(() => w.gw.uninstall());

  const open = (sitePlanId: string) =>
    w.routes.order.POST(
      w.request("/api/billing/order", {
        ip: freshIp(),
        body: { purpose: "site_plan", buyer: { ...BUYER }, sitePlanId, travel: "ncr" },
      })
    );

  it("opens a Signature order (150 areas) for the server-computed amount", async () => {
    const res = await open("signature");
    const body = await w.readJson(res);
    assert.equal(res.status, 200, JSON.stringify(body));
    const expected = toPaise(withGst(siteQuote("signature", { travel: "ncr" }).lines.reduce((a, l) => a + l.amountInr, 0)).total);
    assert.equal(body.amountPaise, expected);
    assert.equal(body.amountPaise, 70_800_000, "₹7,08,000 with GST");
  });

  it("refuses a plan that does not exist, and the plans no longer sold", async () => {
    assert.equal((await open("platinum")).status, 400);
    for (const id of LEGACY_PLAN_ORDER) assert.equal((await open(id)).status, 400, id);
  });
});
