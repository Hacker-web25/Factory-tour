import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { accessTo, FEATURE_KEYS } from "@/lib/entitlements";
import {
  PLAN_PERKS,
  SITE_PLANS,
  SITE_PLAN_ORDER,
  SITE_PLAN_DISPLAY_ORDER,
  includedSalesLogins,
  siteQuote,
} from "@/lib/pricing";

/**
 * 22 Nov 2026: plans are shown most expensive first, and White Glove carries
 * two extras: one free salesperson dashboard and one free update shoot a year.
 */
describe("the order plans are shown in", () => {
  it("shows White Glove first, then Ultra, Premium, Light", () => {
    assert.deepEqual(SITE_PLAN_DISPLAY_ORDER, ["white_glove", "ultra", "premium", "light"]);
  });

  it("leaves the ascending order alone, which the rest of the code relies on", () => {
    assert.deepEqual([...SITE_PLAN_DISPLAY_ORDER].reverse(), SITE_PLAN_ORDER);
    const prices = SITE_PLAN_ORDER.map((id) => SITE_PLANS[id].regularInr);
    assert.deepEqual([...prices].sort((a, b) => a - b), prices);
  });
});

describe("what White Glove includes", () => {
  it("has one free Sales Team login and one update shoot a year, and no other plan does", () => {
    assert.equal(SITE_PLANS.white_glove.freeSalesLogins, 1);
    assert.equal(SITE_PLANS.white_glove.updateShoots, 1);
    for (const id of SITE_PLAN_ORDER.filter((p) => p !== "white_glove")) {
      assert.equal(SITE_PLANS[id].freeSalesLogins, 0, id);
      assert.equal(SITE_PLANS[id].updateShoots, 0, id);
    }
  });

  it("counts the free login from the plan, and not for a plan we do not know", () => {
    assert.equal(includedSalesLogins("white_glove"), 1);
    for (const id of ["light", "premium", "ultra", "confidence", "", null, undefined, "nonsense"]) {
      assert.equal(includedSalesLogins(id), 0, String(id));
    }
  });

  it("opens the Sales Team features with no paid seat, only for White Glove", () => {
    const salesKeys = FEATURE_KEYS.filter((k) => accessTo({ plan: "basic", site_plan: "light", sales_seats: 0 }, k).state === "locked" &&
      (accessTo({ plan: "basic", site_plan: "light", sales_seats: 0 }, k) as { upgradeTo: string }).upgradeTo === "sales_team");
    assert.ok(salesKeys.length > 0, "there is at least one Sales Team feature");
    for (const k of salesKeys) {
      assert.equal(accessTo({ plan: "basic", site_plan: "white_glove", sales_seats: 0 }, k).state, "open", k);
      assert.equal(accessTo({ plan: "basic", site_plan: "ultra", sales_seats: 0 }, k).state, "locked", k);
      assert.equal(accessTo({ plan: "basic", site_plan: "ultra", sales_seats: 1 }, k).state, "open", k);
    }
  });

  it("shows both on the bill at no charge, and only on White Glove", () => {
    const wg = siteQuote("white_glove", { city: "Manesar" });
    const login = wg.lines.find((l) => l.kind === "bonus" && l.label.includes(PLAN_PERKS.salesLogin.row));
    const shoot = wg.lines.find((l) => l.kind === "bonus" && l.label.includes(PLAN_PERKS.updateShoot.row));
    assert.ok(login && shoot, "both perks are on the bill");
    assert.equal(login!.amountInr, 0);
    assert.equal(shoot!.amountInr, 0);

    const regular = siteQuote("white_glove", { city: "Manesar", offerOpen: false });
    assert.ok(regular.lines.some((l) => l.label.includes(PLAN_PERKS.updateShoot.row)), "still there once the offer ends");

    const ultra = siteQuote("ultra", { city: "Manesar" });
    assert.ok(!ultra.lines.some((l) => l.label.includes(PLAN_PERKS.salesLogin.row) || l.label.includes(PLAN_PERKS.updateShoot.row)));
  });

  it("does not change what White Glove costs", () => {
    const before = siteQuote("white_glove", { city: "Manesar" });
    assert.equal(before.lines.filter((l) => l.kind === "bonus").every((l) => l.amountInr === 0), true);
  });
});

describe("the recommendation does not move with the wider slider", () => {
  it("still sends a plant past the largest plan plus 15 extra areas to White Glove", async () => {
    const { recommendPlan } = await import("@/lib/funnel");
    const at60 = recommendPlan({ aoaCount: 60, pdfCount: 0, wantsSharingControls: false });
    assert.equal(at60.plan, "ultra");
    assert.equal(at60.extraAreas, 15);
    const at61 = recommendPlan({ aoaCount: 61, pdfCount: 0, wantsSharingControls: false });
    assert.equal(at61.plan, "white_glove");
  });
});

describe("the plan cards on the marketing site (22 Nov 2026)", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const home = fs.readFileSync(path.join(process.cwd(), "lib/site/home.ts"), "utf8");
  const jsSrc = home.match(/const JS_SRC = "(\/static\/js\/main\.[0-9a-f]+\.js)";/)![1];
  const bundle = fs.readFileSync(path.join(process.cwd(), "public", jsSrc), "utf8");

  it("puts the support block, with the free months, beside the AOAs on every card", () => {
    assert.ok(bundle.includes('className:"vpv-pc-care"'));
    assert.ok(bundle.includes("Support, hosting & security: ₹999/month"));
    assert.ok(bundle.includes("Billed yearly (₹11,988 + GST)."));
    assert.ok(bundle.includes("First 15 months "), "the free months");
    assert.ok(bundle.includes('className:"vpv-care-free",children:"FREE"'));
    assert.ok(bundle.includes(" for first 20 customers."));
  });

  it("strikes the regular price as the larger figure and sets /month smaller", () => {
    assert.ok(bundle.includes('children:[mn(t.price),m]'), "/month is its own, smaller span inside the struck price");
    assert.match(home, /\.vpv-pc \.vpv-was \.vpv-strike\{font-size:clamp\(1\.9rem/);
    assert.match(home, /\.vpv-pc \.vpv-now\{[^}]*font-size:clamp\(1\.5rem/);
  });

  it("sets the sales team note in the brand blue", () => {
    assert.ok(bundle.includes('className:"vpv-sales-note"'));
    assert.match(home, /\.vpv-sales-note\{color:" \+ BRAND/);
  });

  it("marks VPV Premium, and only Premium, as the most popular plan", () => {
    assert.ok(bundle.includes('("premium"===t.id?"vpv-pc-pop ":"")'), "the blue frame class is set from the plan id");
    assert.ok(bundle.includes('"premium"===t.id&&(0,Dt.jsx)("span",{className:"vpv-pc-poptag"'), "the tag is set from the plan id");
    assert.ok(bundle.includes('children:"Most popular"'));
    assert.equal(bundle.split("vpv-pc-poptag").length - 1, 1, "one tag in the card, nowhere else");
    assert.match(home, /\.vpv-pc-pop\{border-color:#0b5cff!important/);
    assert.match(home, /\.vpv-pc-poptag\{position:absolute/);
    assert.match(home, /prefers-reduced-motion:no-preference\)\{\.vpv-pc-pop::before\{animation/, "the glow is gated");
  });
});
