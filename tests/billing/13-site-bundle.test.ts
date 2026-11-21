/**
 * The marketing site's bundle must show the prices the checkout charges.
 *
 * The site in /public/static is pre-built, so its plan data is a copy of
 * lib/pricing.ts written in by `npm run sync:site`. This suite fails the
 * build if that copy is stale — a price changed in lib/pricing.ts without
 * re-running the sync would otherwise go live with the old figures on the
 * plan cards and the new ones on the bill.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { bundleCareData, bundlePlanData, bundleTextPatches, bundleTravelData } from "@/lib/site/bundleData";
import { SITE_PLANS, SITE_PLAN_ORDER, planPrice } from "@/lib/pricing";

const home = fs.readFileSync(path.join(process.cwd(), "lib/site/home.ts"), "utf8");
const jsSrc = home.match(/const JS_SRC = "(\/static\/js\/main\.[0-9a-f]+\.js)";/)![1];
const bundle = fs.readFileSync(path.join(process.cwd(), "public", jsSrc), "utf8");

describe("the marketing site's bundle agrees with lib/pricing.ts", () => {
  it("carries the generated plan and offer data, exactly", () => {
    assert.ok(
      bundle.includes(bundlePlanData()),
      "Plan data in the site bundle is stale. Run: npm run sync:site"
    );
  });

  it("carries the generated travel data, exactly", () => {
    assert.ok(bundle.includes(bundleTravelData()), "Travel data is stale. Run: npm run sync:site");
    assert.ok(bundle.includes(bundleCareData()), "Support fee data is stale. Run: npm run sync:site");
  });

  it("has every hard-coded sentence patched", () => {
    for (const [from, to] of bundleTextPatches()) {
      assert.ok(!bundle.includes(from), `Unpatched sentence: ${from.slice(0, 80)}`);
      assert.ok(bundle.includes(to), `Missing sentence: ${to.slice(0, 80)}`);
    }
  });

  it("never shows a placeholder badge or an old price", () => {
    assert.ok(!bundle.includes("placeholder:!0"));
    for (const old of ["price:49e3", "price:99e3", "price:199e3", '"5 AOAs"', '"20 AOAs"']) {
      assert.ok(!bundle.includes(old), `old figure still in bundle: ${old}`);
    }
    // Since 21 Nov 2026 the bundle prices a plan per month (the regular price
    // per month; its own offer maths halves it) and bills it yearly.
    for (const id of SITE_PLAN_ORDER) {
      assert.ok(bundle.includes(`price:${SITE_PLANS[id].regularMonthlyInr},billed:${planPrice(id)},period:"month"`), id);
    }
    for (const gone of ["sq ft", "per AOA", "One-time investment", "first year of support", "VPV Signature", "VPV VIP"]) {
      assert.ok(!bundle.includes(gone), `old wording still in bundle: ${gone}`);
    }
  });

  it("is served under a name that changes when its content does", () => {
    // A content-hashed name means no browser can serve stale prices from cache.
    const { createHash } = require("node:crypto") as typeof import("node:crypto");
    const hash = createHash("sha256").update(bundle).digest("hex").slice(0, 8);
    assert.equal(jsSrc, `/static/js/main.${hash}.js`);
  });
});
