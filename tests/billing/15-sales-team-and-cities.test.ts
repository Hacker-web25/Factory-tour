/**
 * The Sales Team add-on, its calculator, and the city list.
 *
 * The sales-team price is charged by the server like everything else; the
 * calculator must be plain arithmetic on what the buyer typed; and the city
 * picker's narrow list must not stop a typed city being priced honestly.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  LAUNCH_OFFER,
  SALES_TEAM,
  inrLakhs,
  salesTeamMaths,
  seatPrice,
  siteQuote,
  toPaise,
} from "@/lib/pricing";
import { SERVICE_AREAS, findCity, isServiceCity, logisticsFor } from "@/lib/logistics";
import { cityDemand } from "@/lib/cityDemand";
import { makeWorld, BUYER, freshIp, type World } from "./harness/world";

describe("sales team logins", () => {
  it("are ₹999 per login per year, ₹199 for our first 50 customers (26 Oct 2026)", () => {
    assert.equal(SALES_TEAM.regularInr, 999);
    assert.equal(SALES_TEAM.offerInr, 199);
    assert.equal(SALES_TEAM.percentOff, 80);
    assert.equal(SALES_TEAM.period, "year");
    assert.equal(seatPrice(true), 199);
    assert.equal(seatPrice(false), 999);
    // "Even 10 salespeople cost about ₹2,000 a year."
    assert.equal(10 * seatPrice(true), 1_990);
  });

  it("go on the bill as their own lines, with the offer shown as a saving", () => {
    const q = siteQuote("authority", { city: "Manesar", salesSeats: 10, offerOpen: true });
    const seats = q.lines.find((l) => /sales team — 10 salesperson logins/i.test(l.label));
    const offer = q.lines.find((l) => /₹199 per login per year/i.test(l.label));
    assert.equal(seats?.amountInr, 9_990);
    assert.equal(offer?.amountInr, -8_000);
    assert.match(seats?.note ?? "", /per year/);
    const without = siteQuote("authority", { city: "Manesar", offerOpen: true });
    assert.equal(q.taxableInr - without.taxableInr, 1_990);
    // Logins add no shoot time.
    assert.equal(q.shoot.totalHours, without.shoot.totalHours);
  });

  it("are charged at the regular price once the offer has closed", () => {
    const q = siteQuote("authority", { city: "Manesar", salesSeats: 10, offerOpen: false });
    assert.ok(!q.lines.some((l) => l.kind === "offer" && /login/i.test(l.label)));
    const without = siteQuote("authority", { city: "Manesar", offerOpen: false });
    assert.equal(q.taxableInr - without.taxableInr, 9_990);
  });

  it("are one flat price per login, whatever the number", () => {
    const one = siteQuote("control", { city: "Manesar", salesSeats: 1 }).taxableInr;
    const none = siteQuote("control", { city: "Manesar" }).taxableInr;
    const fifty = siteQuote("control", { city: "Manesar", salesSeats: 50 }).taxableInr;
    assert.equal((fifty - none) / 50, one - none);
  });
});

describe("the sales-team calculator", () => {
  it("is plain arithmetic on what the buyer typed", () => {
    const m = salesTeamMaths(10, 30_000, true);
    assert.equal(m.monthlySalaryBill, 3_00_000);
    assert.equal(m.annualSalaryBill, 36_00_000);
    assert.equal(m.addOnCost, 1_990);
    assert.equal(m.regularAddOnCost, 9_990);
    assert.equal(m.percentOfAnnualSalary, 0.06);
    assert.ok(m.daysOfSalaryPerLogin < 1);
  });

  it("says big numbers the way a factory owner does", () => {
    assert.equal(inrLakhs(36_00_000), "₹36 lakh");
    assert.equal(inrLakhs(3_00_000), "₹3 lakh");
    assert.equal(inrLakhs(1_08_00_000), "₹1.08 crore");
    assert.equal(inrLakhs(4_50_000), "₹4.5 lakh");
  });
});

describe("cities", () => {
  it("offer only the area we shoot in today", () => {
    assert.deepEqual(
      SERVICE_AREAS.map((g) => g.group),
      ["Haryana", "Delhi NCR"]
    );
    for (const c of ["Gurugram", "Manesar", "Delhi", "Noida", "Greater Noida", "Ghaziabad"]) {
      assert.ok(isServiceCity(c), c);
      assert.equal(logisticsFor(c).inServiceArea, true, c);
      assert.equal(logisticsFor(c).amountInr, 4_000, c);
    }
    assert.equal(isServiceCity("Panipat"), false, "Panipat is no longer offered");
    assert.ok(!SERVICE_AREAS.some((g) => g.cities.includes("Panipat")));
  });

  it("understand the names people type", () => {
    assert.equal(findCity("gurgaon")?.city, "Gurugram");
    assert.equal(findCity("New Delhi")?.city, "Delhi");
    assert.ok(isServiceCity("Gurgaon"));
  });

  it("call any other city 'coming soon', with nothing to charge for travel", () => {
    for (const c of ["Jaipur", "Faridabad", "Ludhiana", "Nowhere-upon-Sea"]) {
      const q = logisticsFor(c);
      assert.equal(q.inServiceArea, false, c);
      assert.equal(q.amountInr, 0, c);
    }
    assert.equal(logisticsFor("Jaipur").matched?.state, "Rajasthan", "still recognised, for the demand report");
  });

  it("are counted by demand, one company once, at its furthest step", () => {
    const rows = cityDemand([
      { email: "a@x.com", factory_city: "Ludhiana", stage: "info" },
      { email: "a@x.com", factory_city: "ludhiana", stage: "billing" },
      { email: "b@x.com", factory_city: "Ludhiana", stage: "plan" },
      { email: "c@x.com", factory_city: "Gurgaon", stage: "paid" },
      { email: "d@x.com", factory_city: "Coimbatore", stage: "scope" },
    ]);
    const lud = rows.find((r) => r.city === "Ludhiana")!;
    assert.equal(lud.enquiries, 2);
    assert.equal(lud.reachedPlan, 2);
    assert.equal(lud.reachedBilling, 1);
    assert.equal(lud.inServiceArea, false);
    const gur = rows.find((r) => r.city === "Gurugram")!;
    assert.equal(gur.paid, 1);
    assert.equal(gur.inServiceArea, true);
    assert.equal(rows[0].city, "Gurugram"); // paid orders sort first
  });
});

describe("the order route", () => {
  let w: World;
  before(async () => {
    w = await makeWorld();
  });
  after(() => w.gw.uninstall());

  it("prices sales-team logins itself, and clamps a silly count", async () => {
    await w.reset();
    const res = await w.routes.order.POST(
      w.request("/api/billing/order", {
        ip: freshIp(),
        body: { purpose: "site_plan", buyer: { ...BUYER }, sitePlanId: "authority", city: "Manesar", salesSeats: 12, amount: 1 },
      })
    );
    const body = await w.readJson(res);
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.amountPaise, toPaise(siteQuote("authority", { city: "Manesar", salesSeats: 12 }).totalInr));
    const [row] = await w.q(`select notes from public.billing_orders`);
    assert.match(row.notes, /sales team 12 logins at ₹199\/yr/);

    await w.reset();
    const big = await w.routes.order.POST(
      w.request("/api/billing/order", {
        ip: freshIp(),
        body: { purpose: "site_plan", buyer: { ...BUYER }, sitePlanId: "authority", city: "Manesar", salesSeats: 99_999 },
      })
    );
    const bigBody = await w.readJson(big);
    assert.equal(bigBody.amountPaise, toPaise(siteQuote("authority", { city: "Manesar", salesSeats: SALES_TEAM.maxSeats }).totalInr));
    assert.equal(LAUNCH_OFFER.limit, 50);
  });
});
