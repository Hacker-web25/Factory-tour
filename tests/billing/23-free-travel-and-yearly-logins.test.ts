import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { makeWorld, BUYER, freshIp, type World } from "./harness/world";
import {
  MIN_PAYABLE_INR,
  SALES_TEAM,
  SUPPORT_ANNUAL_INR,
  priceFor,
  renewalAmount,
  seatsFromOrderNotes,
  siteQuote,
  toPaise,
  withGst,
} from "@/lib/pricing";

/**
 * 26 Oct 2026: cab travel is free for our first 50 customers, Confidence and
 * Authority went up by ₹4,000, and Sales Team logins became YEARLY (₹199 per
 * login for the first 50, ₹999 after), renewed with support at the price the
 * customer bought at.
 */
describe("the new bill", () => {
  it("Confidence for a Gurugram factory: ₹39,000 + GST and nothing else under the offer", () => {
    const q = siteQuote("confidence", { city: "Gurugram", offerOpen: true });
    assert.equal(q.taxableInr, 39_000);
    assert.equal(q.lines.find((l) => l.kind === "travel")!.amountInr, 0);
    assert.equal(q.lines.find((l) => l.kind === "support")!.amountInr, 0);
  });

  it("a 100% coupon still leaves ₹1 + GST, because Razorpay cannot take ₹0", () => {
    const q = siteQuote("confidence", {
      city: "Gurugram",
      offerOpen: true,
      coupon: { code: "OWNERTEST", percentOff: 100, amountOffInr: null },
    });
    assert.equal(q.taxableInr, MIN_PAYABLE_INR);
    assert.equal(q.totalInr, withGst(1).total);
    assert.equal(q.couponInr, 39_000 - 1);
    // A smaller coupon is untouched by the floor.
    const ten = siteQuote("confidence", { city: "Gurugram", offerOpen: true, coupon: { code: "TEN", percentOff: 10, amountOffInr: null } });
    assert.equal(ten.couponInr, 3_900);
  });

  it("logins go on the order notes with their yearly price, and are read back", () => {
    const d = priceFor("site_plan", { sitePlanId: "authority", city: "Manesar", offerOpen: true, salesSeats: 10 }).description;
    assert.match(d, /sales team 10 logins at ₹199\/yr/);
    assert.match(d, /cab Manesar \(free\)/);
    assert.deepEqual(seatsFromOrderNotes(d), { seats: 10, seatInr: 199 });
    // after the offer
    const late = priceFor("site_plan", { sitePlanId: "authority", city: "Manesar", offerOpen: false, salesSeats: 3 }).description;
    assert.deepEqual(seatsFromOrderNotes(late), { seats: 3, seatInr: 999 });
    // orders from before logins were yearly were paid once: they renew at nothing
    assert.deepEqual(seatsFromOrderNotes("VPV Authority — 8 areas, sales team 4 logins, cab Manesar"), { seats: 4, seatInr: 0 });
    assert.deepEqual(seatsFromOrderNotes(null), { seats: 0, seatInr: 0 });
  });

  it("a renewal is support plus each login at its locked price", () => {
    assert.equal(renewalAmount(0, 0), SUPPORT_ANNUAL_INR);
    assert.equal(renewalAmount(10, 199), SUPPORT_ANNUAL_INR + 1_990);
    const r = priceFor("support_renewal", { salesSeats: 10, seatInr: 199 });
    assert.equal(r.amountInr, SUPPORT_ANNUAL_INR + 1_990);
    assert.match(r.description, /sales team 10 logins at ₹199\/yr/);
    // legacy one-time logins add nothing
    assert.equal(priceFor("support_renewal", { salesSeats: 4, seatInr: 0 }).amountInr, SUPPORT_ANNUAL_INR);
    assert.equal(SALES_TEAM.offerInr, 199);
  });
});

describe("yearly logins through the real payment flow", () => {
  let w: World;
  before(async () => { w = await makeWorld(); });
  beforeEach(async () => { await w.reset(); w.sb.clearFailures(); });
  after(() => w.gw.uninstall());

  async function buyPlan(seats: number) {
    const res = await w.routes.order.POST(
      w.request("/api/billing/order", {
        ip: freshIp(),
        body: { purpose: "site_plan", buyer: { ...BUYER }, sitePlanId: "confidence", city: "Gurugram", salesSeats: seats },
      })
    );
    const order = await w.readJson(res);
    assert.equal(res.status, 200, JSON.stringify(order));
    assert.equal(order.amountPaise, toPaise(siteQuote("confidence", { city: "Gurugram", salesSeats: seats }).totalInr));
    await w.payInBrowser(order);
    assert.equal((await w.poll(order.orderId)).body.status, "ready");
    return order;
  }

  it("the workspace remembers its logins and their price when it is built", async () => {
    await buyPlan(10);
    const [org] = await w.q(`select sales_seats, sales_seat_inr from public.organizations`);
    assert.equal(Number(org.sales_seats), 10);
    assert.equal(Number(org.sales_seat_inr), 199);
  });

  it("the renewal charges support plus those logins, at ₹199 each", async () => {
    await buyPlan(10);
    const [org] = await w.q(`select id from public.organizations`);
    // the support year is about to end, so renewal is open
    await w.q(`update public.organizations set support_until = now() + interval '5 days' where id = $1`, [org.id]);
    const [admin] = await w.q(`select id from public.profiles where org_id = $1`, [org.id]);
    const res = await w.routes.order.POST(
      w.request("/api/billing/order", { as: admin.id, body: { purpose: "support_renewal", buyer: {} } })
    );
    const body = await w.readJson(res);
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.amountPaise, toPaise(withGst(SUPPORT_ANNUAL_INR + 1_990).total));
  });

  it("a plan without logins renews at support alone", async () => {
    await buyPlan(0);
    const [org] = await w.q(`select id, sales_seats from public.organizations`);
    assert.equal(Number(org.sales_seats), 0);
    await w.q(`update public.organizations set support_until = now() + interval '5 days' where id = $1`, [org.id]);
    const [admin] = await w.q(`select id from public.profiles where org_id = $1`, [org.id]);
    const res = await w.routes.order.POST(w.request("/api/billing/order", { as: admin.id, body: { purpose: "support_renewal", buyer: {} } }));
    assert.equal((await w.readJson(res)).amountPaise, toPaise(withGst(SUPPORT_ANNUAL_INR).total));
  });

  it("the ₹1 coupon floor makes a real ₹1.18 order", async () => {
    await w.q(`insert into public.coupons (code, percent_off, max_uses) values ('OWNERTEST', 100, 1)`);
    const res = await w.routes.order.POST(
      w.request("/api/billing/order", {
        ip: freshIp(),
        body: { purpose: "site_plan", buyer: { ...BUYER }, sitePlanId: "confidence", city: "Gurugram", coupon: "OWNERTEST" },
      })
    );
    const body = await w.readJson(res);
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.amountPaise, 118);
  });
});
