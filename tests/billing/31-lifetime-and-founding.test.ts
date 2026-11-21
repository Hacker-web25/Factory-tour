import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { makeWorld, BUYER, freshIp, type World } from "./harness/world";
import {
  LAUNCH_OFFER,
  LIFETIME_EXTRA_AREA_MULTIPLE,
  SITE_PLANS,
  SITE_PLAN_ORDER,
  SUPPORT_ANNUAL_INR,
  extraAreaCost,
  firstPeriodMonths,
  foundingFromNotes,
  foundingOfferOpen,
  launchOfferOpen,
  planBillingFromNotes,
  planPrice,
  planYearlyFromNotes,
  priceFor,
  regularPlanPrice,
  renewalAmount,
  siteQuote,
  sitePlanFromNotes,
  toPaise,
  withGst,
} from "@/lib/pricing";
import { canBuyUpgrade, upgradeOptions } from "@/lib/entitlements";

/**
 * 22 Nov 2026: every plan can also be bought once, for life; support,
 * hosting & security (₹999/month, billed yearly as ₹11,988) is charged on
 * every plan again; and the offers are now the founding 20 (3 months free,
 * 50% off, free cab, first 15 months of support free) and customers 21 to
 * 30 (50% off only).
 */
describe("lifetime prices", () => {
  it("are the owner's just-below-round prices, with the struck price at twice that", () => {
    assert.deepEqual(SITE_PLAN_ORDER.map((id) => planPrice(id, true, "lifetime")), [1_99_999, 5_49_999, 7_49_999, 11_99_999]);
    assert.deepEqual(SITE_PLAN_ORDER.map((id) => regularPlanPrice(id, "lifetime")), [3_99_998, 10_99_998, 14_99_998, 23_99_998]);
    for (const id of SITE_PLAN_ORDER) {
      // 4.5 to 5 times the yearly offer price.
      const x = SITE_PLANS[id].lifetimeInr / SITE_PLANS[id].priceInr;
      assert.ok(x >= 4.5 && x <= 5, `${id}: ${x.toFixed(2)}×`);
      assert.equal(planPrice(id, false, "lifetime"), regularPlanPrice(id, "lifetime"), id);
    }
  });

  it("quotes a lifetime plan as one payment, with nothing of the plan renewing", () => {
    const q = siteQuote("premium", { city: "Manesar", billing: "lifetime" });
    assert.equal(q.billing, "lifetime");
    assert.match(q.lines[0].label, /lifetime/);
    assert.match(q.lines[0].note ?? "", /Pay once/);
    assert.equal(q.yearlyInr, 0, "only support renews");
    // Founding customer: support free for 15 months, cab free.
    assert.equal(q.taxableInr, 5_49_999);
    // Customer 21 to 30: support and cab charged.
    const later = siteQuote("premium", { city: "Manesar", billing: "lifetime", founding: false });
    assert.equal(later.taxableInr, 5_49_999 + 4_000 + SUPPORT_ANNUAL_INR);
    // After the offer: the regular lifetime price.
    const closed = siteQuote("premium", { city: "Manesar", billing: "lifetime", offerOpen: false });
    assert.equal(closed.taxableInr, 10_99_998 + 4_000 + SUPPORT_ANNUAL_INR);
  });

  it("prices extra areas on a lifetime plan once, at five times the yearly price", () => {
    assert.equal(LIFETIME_EXTRA_AREA_MULTIPLE, 5);
    for (const id of SITE_PLAN_ORDER) {
      assert.equal(extraAreaCost(id, 3, "lifetime"), extraAreaCost(id, 3, "annual") * 5, id);
    }
    const q = siteQuote("ultra", { city: "Manesar", billing: "lifetime", extraAreas: 3 });
    assert.equal(q.yearlyInr, 0);
  });

  it("writes the billing on the order notes, and reads it back", () => {
    const life = priceFor("site_plan", { sitePlanId: "ultra", city: "Manesar", offerOpen: true, founding: true, billing: "lifetime" }).description;
    assert.equal(planBillingFromNotes(life), "lifetime");
    assert.equal(planYearlyFromNotes(life), 0, "a lifetime plan has nothing to renew");
    assert.equal(sitePlanFromNotes(life), "ultra", "it still counts towards the offer");
    assert.equal(foundingFromNotes(life), true);

    const yearly = priceFor("site_plan", { sitePlanId: "ultra", city: "Manesar", offerOpen: true, founding: false, billing: "annual" }).description;
    assert.equal(planBillingFromNotes(yearly), "annual");
    assert.equal(planYearlyFromNotes(yearly), 1_62_504);
    assert.equal(foundingFromNotes(yearly), false);
    assert.equal(planBillingFromNotes("VPV Authority — 8 areas, cab Manesar"), null, "an old one-time plan is neither");
  });

  it("renews a lifetime plan at support alone, plus any logins", () => {
    assert.equal(renewalAmount(0, 0, 0), SUPPORT_ANNUAL_INR);
    assert.equal(renewalAmount(5, 199, 0), SUPPORT_ANNUAL_INR + 995);
  });

  it("moves a lifetime plan up only by speaking with us", () => {
    const base = { plan: "basic" };
    const facts = { ...base, site_plan: "premium", plan_billing: "lifetime" } as never;
    assert.deepEqual(upgradeOptions(facts), []);
    assert.equal(canBuyUpgrade(facts, "ultra"), false);
    const yearly = { ...base, site_plan: "premium", plan_billing: "annual" } as never;
    assert.ok(upgradeOptions(yearly).includes("ultra"));
    assert.equal(canBuyUpgrade(yearly, "ultra"), true);
  });
});

describe("the founding 20 and the first 30", () => {
  it("counts the founding places inside the 30", () => {
    assert.equal(LAUNCH_OFFER.foundingLimit, 20);
    assert.equal(LAUNCH_OFFER.limit, 30);
    assert.equal(foundingOfferOpen(19), true);
    assert.equal(foundingOfferOpen(20), false);
    assert.equal(launchOfferOpen(20), true);
    assert.equal(launchOfferOpen(30), false);
    assert.equal(firstPeriodMonths(true), 15);
    assert.equal(firstPeriodMonths(false), 12);
  });

  it("gives a founding customer all four benefits, and customer 21 the 50% only", () => {
    const f = siteQuote("light", { city: "Gurugram" });
    assert.equal(f.founding, true);
    assert.equal(f.firstMonths, 15);
    assert.ok(f.lines.some((l) => l.kind === "offer"), "50% off");
    assert.ok(f.lines.some((l) => l.kind === "bonus" && l.amountInr === 0), "3 months free");
    assert.equal(f.lines.find((l) => l.kind === "travel")!.amountInr, 0, "free cab");
    assert.equal(f.lines.find((l) => l.kind === "support")!.amountInr, 0, "support free for 15 months");
    assert.equal(f.taxableInr, 42_720);

    const n21 = siteQuote("light", { city: "Gurugram", founding: false });
    assert.equal(n21.founding, false);
    assert.equal(n21.firstMonths, 12);
    assert.ok(n21.lines.some((l) => l.kind === "offer"), "still 50% off");
    assert.ok(!n21.lines.some((l) => l.kind === "bonus"));
    assert.equal(n21.taxableInr, 42_720 + 4_000 + SUPPORT_ANNUAL_INR);
  });
});

describe("lifetime and founding through the real payment flow", () => {
  let w: World;
  before(async () => {
    w = await makeWorld();
  });
  beforeEach(async () => {
    await w.reset();
    w.sb.clearFailures();
  });
  after(() => w.gw.uninstall());

  const open = async (body: Record<string, unknown>) => {
    const res = await w.routes.order.POST(
      w.request("/api/billing/order", { ip: freshIp(), body: { purpose: "site_plan", buyer: { ...BUYER }, city: "Gurugram", ...body } })
    );
    return { status: res.status, body: await w.readJson(res) };
  };

  async function paidOrders(n: number) {
    for (let i = 0; i < n; i++) {
      await w.q(
        `insert into public.billing_orders (purpose, scenes, amount_paise, status, buyer_name, buyer_email, buyer_company, notes)
         values ('basic_licence', 5, 100, 'paid', 'Earlier buyer', $1, 'Co', 'VPV Light — 5 areas, Special offer')`,
        [`early${i}@example.com`]
      );
    }
  }

  it("a founding lifetime buyer pays the lifetime price once, and the workspace records it", async () => {
    const o = await open({ sitePlanId: "premium", billing: "lifetime" });
    assert.equal(o.status, 200, JSON.stringify(o.body));
    assert.equal(o.body.amountPaise, toPaise(withGst(5_49_999).total));
    await w.payInBrowser(o.body);
    assert.equal((await w.poll(o.body.orderId)).body.status, "ready");
    const [org] = await w.q(`select site_plan, plan_billing, plan_yearly_inr, support_until from public.organizations`);
    assert.equal(org.site_plan, "premium");
    assert.equal(org.plan_billing, "lifetime");
    assert.equal(org.plan_yearly_inr, null);
    const months = (new Date(org.support_until).getTime() - Date.now()) / (30.4 * 86_400_000);
    assert.ok(months > 14.8 && months < 15.2, `15 months, got ${months}`);
  });

  it("customer 21 pays the 50% price with the cab and a year of support, for 12 months", async () => {
    await paidOrders(20);
    const o = await open({ sitePlanId: "light" });
    assert.equal(o.status, 200, JSON.stringify(o.body));
    assert.equal(o.body.amountPaise, toPaise(withGst(42_720 + 4_000 + SUPPORT_ANNUAL_INR).total));
    const [row] = await w.q(`select notes from public.billing_orders where status = 'created'`);
    assert.match(row.notes, /Special offer/);
    assert.doesNotMatch(row.notes, /Founding offer/);
    await w.payInBrowser(o.body);
    assert.equal((await w.poll(o.body.orderId)).body.status, "ready");
    const [org] = await w.q(`select plan_billing, plan_yearly_inr, support_until from public.organizations`);
    assert.equal(org.plan_billing, "annual");
    assert.equal(Number(org.plan_yearly_inr), 42_720);
    const months = (new Date(org.support_until).getTime() - Date.now()) / (30.4 * 86_400_000);
    assert.ok(months > 11.8 && months < 12.2, `12 months, got ${months}`);
  });

  it("a lifetime workspace renews support alone, and cannot buy an upgrade itself", async () => {
    const o = await open({ sitePlanId: "premium", billing: "lifetime" });
    await w.payInBrowser(o.body);
    await w.poll(o.body.orderId);
    const [org] = await w.q(`select id from public.organizations`);
    await w.q(`update public.organizations set support_until = now() + interval '5 days' where id = $1`, [org.id]);
    const [admin] = await w.q(`select id from public.profiles where org_id = $1`, [org.id]);
    const ask = (body: Record<string, unknown>) =>
      w.routes.order.POST(w.request("/api/billing/order", { as: admin.id, body: { buyer: {}, ...body } }));

    const renew = await ask({ purpose: "support_renewal" });
    const rb = await w.readJson(renew);
    assert.equal(renew.status, 200, JSON.stringify(rb));
    assert.equal(rb.amountPaise, toPaise(withGst(SUPPORT_ANNUAL_INR).total));

    const up = await ask({ purpose: "plan_upgrade", upgradeTo: "ultra" });
    assert.equal(up.status, 400);
    assert.equal((await w.readJson(up)).error, "invalid_upgrade");
  });

  it("ignores a billing it does not know, and sells the yearly plan", async () => {
    const o = await open({ sitePlanId: "light", billing: "forever" });
    assert.equal(o.status, 200, JSON.stringify(o.body));
    assert.equal(o.body.amountPaise, toPaise(withGst(42_720).total));
  });
});
