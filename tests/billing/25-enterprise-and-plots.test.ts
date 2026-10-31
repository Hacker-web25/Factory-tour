/**
 * VPV Enterprise, plant sizes and the new PDF counts.
 *
 * What matters: the headline prices and PDF counts are pinned, Enterprise is
 * charged the right amount (₹2,99,999 + GST under the offer, ₹3,74,999 after
 * it), and the recommendation never pushes a small plant into Enterprise or
 * leaves a 1,000+ sq yard plant on a plan sized for less.
 */

import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import {
  ENTERPRISE_PERSONAL,
  PLOT_BANDS,
  SITE_PLANS,
  SITE_PLAN_ORDER,
  isPlotBand,
  isSitePlanId,
  planForPlot,
  siteQuote,
  toPaise,
  withGst,
} from "@/lib/pricing";
import { recommendPlan } from "@/lib/funnel";
import { makeWorld, BUYER, freshIp, type World } from "./harness/world";

describe("enterprise: the plan and its plot sizes", () => {
  it("lists four plans in order, with the plot size each is for", () => {
    assert.deepEqual([...SITE_PLAN_ORDER], ["confidence", "authority", "control", "enterprise"]);
    assert.equal(SITE_PLANS.confidence.plot.maxGaj, 200);
    assert.equal(SITE_PLANS.authority.plot.maxGaj, 600);
    assert.equal(SITE_PLANS.control.plot.maxGaj, 1000);
    assert.equal(SITE_PLANS.enterprise.plot.maxGaj, null);
    assert.match(SITE_PLANS.enterprise.plot.label, /1,000\+/);
  });

  it("pins the new PDF counts and the Enterprise price", () => {
    assert.equal(SITE_PLANS.authority.pdfs, 20);
    assert.equal(SITE_PLANS.control.pdfs, 50);
    assert.equal(SITE_PLANS.enterprise.pdfs, 100);
    assert.equal(SITE_PLANS.enterprise.priceInr, 299_999);
    assert.equal(SITE_PLANS.enterprise.regularInr, 374_999);
    assert.equal(SITE_PLANS.enterprise.sharingControls, true);
    assert.ok(isSitePlanId("enterprise"));
    assert.ok(!isSitePlanId("platinum"));
  });

  it("names Mr. Nitin Gupta in both personal benefits", () => {
    assert.match(ENTERPRISE_PERSONAL.discussion.short, /Mr\. Gupta/);
    assert.match(ENTERPRISE_PERSONAL.shoot.short, /Nitin Gupta/);
    assert.match(ENTERPRISE_PERSONAL.discussion.long, /Nitin Gupta/);
    assert.match(ENTERPRISE_PERSONAL.shoot.long, /Nitin Gupta/);
  });

  it("charges ₹2,99,999 + 18% GST under the offer, and ₹3,74,999 + GST after it", () => {
    const on = siteQuote("enterprise", { offerOpen: true });
    const off = siteQuote("enterprise", { offerOpen: false });
    const gstOn = withGst(299_999);
    const gstOff = withGst(374_999);
    assert.ok(gstOn.total > 353_000 && gstOn.total < 354_100, String(gstOn.total));
    assert.ok(gstOff.total > 442_000 && gstOff.total < 443_000, String(gstOff.total));
    const planPart = (q: ReturnType<typeof siteQuote>) =>
      q.lines.filter((l) => l.kind === "plan" || l.kind === "offer").reduce((x, l) => x + l.amountInr, 0);
    assert.equal(planPart(on), 299_999);
    assert.equal(planPart(off), 374_999);
  });
});

describe("enterprise: plot band → plan", () => {
  it("maps each band to its plan", () => {
    assert.equal(planForPlot("upto200"), "confidence");
    assert.equal(planForPlot("upto600"), "authority");
    assert.equal(planForPlot("upto1000"), "control");
    assert.equal(planForPlot("above1000"), "enterprise");
    assert.equal(planForPlot(null), null);
    assert.deepEqual(PLOT_BANDS.map((b) => b.id), ["upto200", "upto600", "upto1000", "above1000"]);
    assert.ok(isPlotBand("above1000"));
    assert.ok(!isPlotBand("huge"));
  });

  it("recommends by the smallest plan that fits the scope, never below the plant's plan", () => {
    assert.equal(recommendPlan({ aoaCount: 3 }).plan, "confidence");
    assert.equal(recommendPlan({ aoaCount: 3, plotBand: "upto200" }).plan, "confidence");
    assert.equal(recommendPlan({ aoaCount: 3, plotBand: "upto600" }).plan, "authority");
    assert.equal(recommendPlan({ aoaCount: 3, plotBand: "upto1000" }).plan, "control");
  });

  it("never recommends Enterprise to a smaller plant, however much they ask for", () => {
    const r = recommendPlan({ aoaCount: 60, videoCount: 40, pdfCount: 300 });
    assert.notEqual(r.plan, "enterprise");
    assert.equal(r.needsExtras, true);
    const r2 = recommendPlan({ aoaCount: 60, plotBand: "upto1000" });
    assert.equal(r2.plan, "control");
  });

  it("recommends Enterprise for a 1,000+ sq yard plant, with extras if the scope is bigger", () => {
    const small = recommendPlan({ aoaCount: 5, plotBand: "above1000" });
    assert.equal(small.plan, "enterprise");
    assert.equal(small.needsExtras, false);
    const big = recommendPlan({ aoaCount: 30, plotBand: "above1000" });
    assert.equal(big.plan, "enterprise");
    assert.equal(big.extraAreas, 30 - SITE_PLANS.enterprise.scenes);
  });

  it("keeps the sharing-controls filter: only Control and Enterprise have it", () => {
    assert.equal(recommendPlan({ aoaCount: 3, wantsSharingControls: true }).plan, "control");
    assert.equal(recommendPlan({ aoaCount: 3, wantsSharingControls: true, plotBand: "above1000" }).plan, "enterprise");
  });
});

describe("enterprise: the order route", () => {
  let w: World;
  before(async () => {
    w = await makeWorld();
  });
  beforeEach(async () => {
    await w.reset();
  });
  after(() => w.gw.uninstall());

  it("opens an Enterprise order for the server-computed amount", async () => {
    const res = await w.routes.order.POST(
      w.request("/api/billing/order", {
        ip: freshIp(),
        body: { purpose: "site_plan", buyer: { ...BUYER }, sitePlanId: "enterprise", travel: "ncr" },
      })
    );
    const body = await w.readJson(res);
    assert.equal(res.status, 200, JSON.stringify(body));
    const expected = toPaise(withGst(siteQuote("enterprise", { travel: "ncr" }).lines.reduce((a, l) => a + l.amountInr, 0)).total);
    assert.equal(body.amountPaise, expected);
    assert.ok(body.amountPaise > 35_000_000, "about ₹3.5 lakh with GST");
  });

  it("refuses a plan that does not exist", async () => {
    const res = await w.routes.order.POST(
      w.request("/api/billing/order", {
        ip: freshIp(),
        body: { purpose: "site_plan", buyer: { ...BUYER }, sitePlanId: "platinum", travel: "ncr" },
      })
    );
    assert.equal(res.status, 400);
  });
});
