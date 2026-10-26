import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { makeWorld, BUYER, freshIp, type World } from "./harness/world";
import {
  SITE_PLANS,
  monthsUntil,
  priceFor,
  seatTopupAmount,
  siteQuote,
  toPaise,
  upgradeQuote,
  withGst,
} from "@/lib/pricing";
import {
  FEATURE_KEYS,
  ROLLOUT,
  accessTo,
  canUse,
  effectivePlan,
  nextPlan,
  planLimits,
  upgradeOptions,
} from "@/lib/entitlements";

const DAY = 86_400_000;
const at = (ms: number) => new Date(Date.now() + ms).toISOString();

/* ═══════════════════════ the rules, on their own ═══════════════════════ */

describe("entitlements: each plan gets exactly what the website promises", () => {
  const ws = (site_plan: string | null, extra: Record<string, unknown> = {}) => ({
    plan: "basic",
    site_plan,
    sales_seats: 0,
    role: "org_admin",
    ...extra,
  });

  it("every plan: tours, information icons, password login, own address, branding, links", () => {
    for (const p of ["confidence", "authority", "control", "enterprise"]) {
      for (const k of ["tours", "info_icons", "dashboard_password", "custom_domain", "branding", "share_links"] as const) {
        assert.equal(canUse(ws(p), k), true, `${p} / ${k}`);
      }
    }
  });

  it("process videos and PDF reports: locked on Confidence (upgrade to Authority), open from Authority up", () => {
    assert.deepEqual(accessTo(ws("confidence"), "process_videos"), { state: "locked", upgradeTo: "authority" });
    assert.deepEqual(accessTo(ws("confidence"), "pdf_reports"), { state: "locked", upgradeTo: "authority" });
    for (const p of ["authority", "control", "enterprise"]) {
      assert.equal(canUse(ws(p), "process_videos"), true, p);
      assert.equal(canUse(ws(p), "pdf_reports"), true, p);
    }
  });

  it("sharing controls: locked below Control (upgrade to Control), open on Control and Enterprise", () => {
    assert.deepEqual(accessTo(ws("confidence"), "sharing_controls"), { state: "locked", upgradeTo: "control" });
    assert.deepEqual(accessTo(ws("authority"), "sharing_controls"), { state: "locked", upgradeTo: "control" });
    assert.equal(canUse(ws("control"), "sharing_controls"), true);
    assert.equal(canUse(ws("enterprise"), "sharing_controls"), true);
  });

  it("the plan's allowances are the website's numbers", () => {
    for (const p of ["confidence", "authority", "control", "enterprise"] as const) {
      assert.deepEqual(planLimits(ws(p)), { videos: SITE_PLANS[p].videos, pdfs: SITE_PLANS[p].pdfs });
    }
  });

  it("the Sales Team features open with logins, on any plan, and are offered without them", () => {
    assert.deepEqual(accessTo(ws("control"), "sales_team"), { state: "locked", upgradeTo: "sales_team" });
    assert.equal(canUse(ws("confidence", { sales_seats: 2 }), "sales_team"), true);
  });

  it("everything promised nowhere is hidden from every customer, on every plan", () => {
    const hidden = FEATURE_KEYS.filter((k) => ROLLOUT[k].tier === "hidden");
    assert.ok(hidden.includes("meeting_recording") && hidden.includes("ai_meeting_analysis") && hidden.includes("visitor_analytics"));
    for (const p of ["confidence", "authority", "control", "enterprise"]) {
      for (const k of hidden) {
        assert.equal(accessTo(ws(p, { sales_seats: 10 }), k).state, "hidden", `${p} / ${k}`);
        assert.equal(accessTo({ role: "presenter", site_plan: p, sales_seats: 10, plan: "basic" }, k).state, "hidden");
      }
    }
    // A visitor who is not signed in is treated the same way.
    assert.equal(accessTo({}, "auto_tour").state, "hidden");
  });

  it("our own team (the platform owner) sees everything, released or not", () => {
    for (const k of FEATURE_KEYS) assert.equal(canUse({ role: "owner" }, k), true, k);
  });

  it("no plan recorded = Confidence; the old monthly Pro and Ultra = Enterprise", () => {
    assert.equal(effectivePlan(ws(null)), "confidence");
    assert.equal(effectivePlan(ws("nonsense")), "confidence");
    assert.equal(effectivePlan({ plan: "pro" }), "enterprise");
    assert.equal(effectivePlan({ plan: "ultra" }), "enterprise");
  });

  it("only the NEXT plan is ever suggested; Control and Enterprise are never sold to", () => {
    assert.equal(nextPlan(ws("confidence")), "authority");
    assert.equal(nextPlan(ws("authority")), "control");
    assert.equal(nextPlan(ws("control")), null);
    assert.equal(nextPlan(ws("enterprise")), null);
    assert.deepEqual(upgradeOptions(ws("confidence")), ["authority", "control"]);
    assert.deepEqual(upgradeOptions(ws("authority")), ["control"]);
    assert.deepEqual(upgradeOptions(ws("control")), []);
  });
});

describe("upgrade prices", () => {
  it("the difference at today's prices, with the areas the higher plan adds", () => {
    assert.deepEqual(upgradeQuote("confidence", "authority", true), { amountInr: 20_000, addAreas: 4, addVideos: 3, addPdfs: 20 });
    assert.deepEqual(upgradeQuote("confidence", "control", true), { amountInr: 51_000, addAreas: 11, addVideos: 8, addPdfs: 50 });
    assert.deepEqual(upgradeQuote("authority", "control", true), { amountInr: 31_000, addAreas: 7, addVideos: 5, addPdfs: 30 });
    // After the offer, both prices are the regular ones.
    assert.equal(upgradeQuote("confidence", "control", false).amountInr, 112_500 - 48_750);
  });

  it("the invoice line says what was bought", () => {
    const q = priceFor("plan_upgrade", { fromPlan: "confidence", toPlan: "control", existingScenes: 6, offerOpen: true });
    assert.equal(q.amountInr, 51_000);
    assert.equal(q.scenes, 17, "extras already bought are kept");
    assert.match(q.lines[0].title, /VPV Control/);
    assert.match(q.lines[0].detail ?? "", /11 more areas.*sharing restrictions/);
  });

  it("extra logins pay only for the whole months left until the logins renew", () => {
    assert.equal(seatTopupAmount(2, 199, 6), 199);
    assert.equal(seatTopupAmount(1, 999, 12), 999);
    assert.equal(seatTopupAmount(3, 199, 1), 50);
    assert.equal(monthsUntil(null), 12);
    assert.equal(monthsUntil(new Date(Date.now() - DAY)), 12, "a date in the past means a fresh year");
    assert.equal(monthsUntil(new Date(Date.now() + 20 * DAY)), 1);
    assert.equal(monthsUntil(new Date(Date.now() + 182 * DAY)), 6);
    assert.equal(monthsUntil(new Date(Date.now() + 400 * DAY)), 12);
  });
});

/* ═══════════════════════ in the database, through the real routes ═══════════════════════ */

describe("plans in the workspace, upgrades and extra logins", () => {
  let w: World;
  before(async () => {
    w = await makeWorld();
  });
  beforeEach(async () => {
    await w.reset();
    w.sb.clearFailures();
  });
  after(() => w.gw.uninstall());

  async function workspace(o: { plan?: string | null; quota?: number; seats?: number; seatInr?: number | null; loginsUntil?: string | null; supportUntil?: string } = {}) {
    const org = await w.seedOrg({ name: "Acme Textiles", slug: "acme", quota: o.quota ?? 4, supportUntil: o.supportUntil ?? at(300 * DAY) });
    await w.q(
      `update public.organizations set site_plan = $2, sales_seats = $3, sales_seat_inr = $4, sales_seats_until = $5, billing_email = 'md@acme.in' where id = $1`,
      [org.id, o.plan === undefined ? "confidence" : o.plan, o.seats ?? 0, o.seatInr ?? null, o.loginsUntil ?? null]
    );
    const admin = await w.seedUser({ email: "md@acme.in", orgId: org.id, role: "org_admin" });
    return { org, admin };
  }

  const orgRow = async (id: string) =>
    (await w.q(`select site_plan, scene_quota, sales_seats, sales_seat_inr, sales_seats_until from public.organizations where id = $1`, [id]))[0];

  async function order(admin: string, body: Record<string, unknown>) {
    const res = await w.routes.order.POST(w.request("/api/billing/order", { as: admin, body: { buyer: {}, ...body } }));
    return { status: res.status, body: await w.readJson(res) };
  }

  it("a plan bought on the website is recorded on the workspace it builds", async () => {
    const res = await w.routes.order.POST(
      w.request("/api/billing/order", {
        ip: freshIp(),
        body: { purpose: "site_plan", buyer: { ...BUYER }, sitePlanId: "authority", city: "Gurugram" },
      })
    );
    const o = await w.readJson(res);
    assert.equal(res.status, 200, JSON.stringify(o));
    assert.equal(o.amountPaise, toPaise(siteQuote("authority", { city: "Gurugram" }).totalInr));
    await w.payInBrowser(o);
    assert.equal((await w.poll(o.orderId)).body.status, "ready");
    const [org] = await w.q(`select site_plan from public.organizations`);
    assert.equal(org.site_plan, "authority");
  });

  it("the migration fills the plan in for workspaces built before it, from their paid order", async () => {
    const { org } = await workspace({ plan: null });
    await w.q(
      `insert into public.billing_orders (purpose, scenes, amount_paise, taxable_paise, gst_paise, gst_rate, buyer_email, buyer_name, buyer_company, buyer_state, org_id, status, notes)
       values ('basic_licence', 15, 100, 85, 15, 0.18, 'md@acme.in', 'MD', 'Acme', 'Haryana', $1, 'paid', 'VPV Control — 15 areas, 6 hours shoot')`,
      [org.id]
    );
    const fs = await import("node:fs");
    const sql = fs.readFileSync("supabase/plan_features.sql", "utf8");
    await w.raw.exec(sql);
    assert.equal((await orgRow(org.id)).site_plan, "control");
  });

  it("Confidence → Control: pays the difference, gets Control and 11 more areas at once, with an invoice", async () => {
    const { org, admin } = await workspace({ plan: "confidence", quota: 6 });
    const o = await order(admin, { purpose: "plan_upgrade", upgradeTo: "control" });
    assert.equal(o.status, 200, JSON.stringify(o.body));
    assert.equal(o.body.amountPaise, toPaise(withGst(51_000).total));
    await w.payInBrowser(o.body);
    assert.equal((await w.poll(o.body.orderId)).body.status, "ready");

    const after = await orgRow(org.id);
    assert.equal(after.site_plan, "control");
    assert.equal(Number(after.scene_quota), 17, "6 (4 + 2 extra) + 11");
    const [inv] = await w.q(`select description from public.billing_invoices where org_id = $1`, [org.id]);
    assert.match(inv.description, /Upgrade to VPV Control/);
    assert.ok(w.gw.emailsTo("md@acme.in").some((m) => /plan is upgraded/i.test(m.subject)));
  });

  it("refuses a downgrade, the same plan, Enterprise and nonsense — before any money moves", async () => {
    const { admin } = await workspace({ plan: "authority" });
    for (const upgradeTo of ["confidence", "authority", "enterprise", "platinum", undefined]) {
      const o = await order(admin, { purpose: "plan_upgrade", upgradeTo });
      assert.equal(o.status, 400, String(upgradeTo));
      assert.equal(o.body.error, "invalid_upgrade");
    }
    assert.equal(Number((await w.q(`select count(*) as n from public.billing_orders`))[0].n), 0);
  });

  it("the price is from the plan the DATABASE says they have, not what the browser claims", async () => {
    const { admin } = await workspace({ plan: "authority" });
    const o = await order(admin, { purpose: "plan_upgrade", upgradeTo: "control", fromPlan: "confidence", sitePlanId: "confidence" });
    assert.equal(o.body.amountPaise, toPaise(withGst(31_000).total));
  });

  it("a full refund of an upgrade puts the plan and the areas back", async () => {
    const { org, admin } = await workspace({ plan: "confidence", quota: 4 });
    const o = await order(admin, { purpose: "plan_upgrade", upgradeTo: "authority" });
    const paid = await w.payInBrowser(o.body);
    await w.poll(o.body.orderId);
    assert.equal((await orgRow(org.id)).site_plan, "authority");
    await w.deliver(w.gw.refundEvent("refund.processed", w.gw.makeRefund(paid.payment.id, Number(o.body.amountPaise))));
    const back = await orgRow(org.id);
    assert.equal(back.site_plan, "confidence");
    assert.equal(Number(back.scene_quota), 4);
  });

  it("extra logins: priced for the months left, added to the workspace, the renewal date unchanged", async () => {
    const until = at(182 * DAY);
    const { org, admin } = await workspace({ seats: 3, seatInr: 199, loginsUntil: until });
    const o = await order(admin, { purpose: "seat_topup", salesSeats: 2 });
    assert.equal(o.status, 200, JSON.stringify(o.body));
    assert.equal(o.body.amountPaise, toPaise(withGst(seatTopupAmount(2, 199, 6)).total));
    await w.payInBrowser(o.body);
    assert.equal((await w.poll(o.body.orderId)).body.status, "ready");
    const r = await orgRow(org.id);
    assert.equal(Number(r.sales_seats), 5);
    assert.equal(Number(r.sales_seat_inr), 199);
    assert.equal(new Date(r.sales_seats_until).toISOString(), new Date(until).toISOString());
  });

  it("first logins for a workspace that had none: a full year at today's price, which is then locked in", async () => {
    const { org, admin } = await workspace({ seats: 0, seatInr: null, supportUntil: at(-1 * DAY) });
    const o = await order(admin, { purpose: "seat_topup", salesSeats: 4 });
    assert.equal(o.status, 200, JSON.stringify(o.body));
    assert.equal(o.body.amountPaise, toPaise(withGst(4 * 199).total));
    await w.payInBrowser(o.body);
    assert.equal((await w.poll(o.body.orderId)).body.status, "ready");
    const r = await orgRow(org.id);
    assert.equal(Number(r.sales_seats), 4);
    assert.equal(Number(r.sales_seat_inr), 199);
    const months = (new Date(r.sales_seats_until).getTime() - Date.now()) / (30.4 * DAY);
    assert.ok(months > 11.8 && months < 12.2, String(months));
    // and the new logins can be used at once
    await w.seedUser({ email: "rep1@acme.in", orgId: org.id, role: "presenter" });
  });

  it("refunding extra logins takes them back", async () => {
    const { org, admin } = await workspace({ seats: 2, seatInr: 199, loginsUntil: at(100 * DAY) });
    const o = await order(admin, { purpose: "seat_topup", salesSeats: 3 });
    const paid = await w.payInBrowser(o.body);
    await w.poll(o.body.orderId);
    assert.equal(Number((await orgRow(org.id)).sales_seats), 5);
    await w.deliver(w.gw.refundEvent("refund.processed", w.gw.makeRefund(paid.payment.id, Number(o.body.amountPaise))));
    assert.equal(Number((await orgRow(org.id)).sales_seats), 2);
  });

  it("a salesperson cannot buy for the company", async () => {
    const { org } = await workspace({ seats: 2, seatInr: 199 });
    const rep = await w.seedUser({ email: "rep@acme.in", orgId: org.id, role: "presenter" });
    const o = await order(rep, { purpose: "seat_topup", salesSeats: 1 });
    assert.equal(o.status, 403);
  });

  it("the browser cannot give itself a plan or logins; our team can", async () => {
    const { org, admin } = await workspace({ plan: "confidence", seats: 1, seatInr: 199 });
    for (const sql of [
      `update public.organizations set site_plan = 'control' where id = $1`,
      `update public.organizations set sales_seats = 50 where id = $1`,
      `update public.organizations set sales_seat_inr = 1 where id = $1`,
      `update public.organizations set sales_seats_until = now() + interval '10 years' where id = $1`,
    ]) {
      await assert.rejects(() => w.sb.as("authenticated", admin).run(sql, [org.id]), /billing system/, sql);
    }
    const owner = await w.seedUser({ email: "owner@vpv.in", role: "owner" });
    await w.sb.as("authenticated", owner).run(`update public.organizations set site_plan = 'authority' where id = $1`, [org.id]);
    assert.equal((await orgRow(org.id)).site_plan, "authority");
  });

  it("sharing controls on a link need Control or Enterprise, whatever the browser sends", async () => {
    const { org, admin } = await workspace({ plan: "authority" });
    const tour = await w.seedTour(org.id, 2);
    const add = (cols: string, vals: string) =>
      w.sb.as("authenticated", admin).run(`insert into public.share_links (tour_id, token, ${cols}) values ($1, $2, ${vals}) returning id`, [tour, `t${Math.random()}`]);

    await add("kind", "'viewer'");
    await add("kind", "'presenter'");
    for (const [cols, vals] of [
      ["expires_at", "now() + interval '1 day'"],
      ["view_limit", "1"],
      ["device_limit", "1"],
      ["password_hash", "'abc'"],
      ["require_email", "true"],
      ["session_minutes", "30"],
    ]) {
      await assert.rejects(() => add(cols, vals), /sharing_controls_need_control/, cols);
    }

    // An existing plain link can still be revoked.
    const [{ id }] = (await add("kind", "'viewer'")).rows as Array<{ id: string }>;
    await w.sb.as("authenticated", admin).run(`update public.share_links set revoked_at = now(), used = true where id = $1`, [id]);
    await assert.rejects(
      () => w.sb.as("authenticated", admin).run(`update public.share_links set expires_at = now() where id = $1`, [id]),
      /sharing_controls_need_control/
    );

    // On Control it all works.
    await w.q(`update public.organizations set site_plan = 'control' where id = $1`, [org.id]);
    await add("expires_at, device_limit, view_limit", "now() + interval '1 day', 1, 1");
  });
});
