import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { makeWorld, BUYER, freshIp, type World } from "./harness/world";
import {
  SITE_PLANS,
  monthsUntil,
  planYearlyFromNotes,
  priceFor,
  rateFor,
  seatTopupAmount,
  sitePlanFromNotes,
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

  const ALL = ["light", "premium", "white_glove", "confidence", "authority", "control", "enterprise"];

  it("every plan: tours, information icons, password login, own address, branding, links", () => {
    for (const p of ALL) {
      for (const k of ["tours", "info_icons", "dashboard_password", "custom_domain", "branding", "share_links"] as const) {
        assert.equal(canUse(ws(p), k), true, `${p} / ${k}`);
      }
    }
  });

  it("process videos and lab reports: locked on Light (upgrade to Premium), open from Premium up", () => {
    for (const p of ["light", "confidence"]) {
      assert.deepEqual(accessTo(ws(p), "process_videos"), { state: "locked", upgradeTo: "premium" }, p);
      assert.deepEqual(accessTo(ws(p), "pdf_reports"), { state: "locked", upgradeTo: "premium" }, p);
    }
    for (const p of ["premium", "white_glove", "authority", "control", "enterprise"]) {
      assert.equal(canUse(ws(p), "process_videos"), true, p);
      assert.equal(canUse(ws(p), "pdf_reports"), true, p);
    }
  });

  it("every link control opens from Premium (VPV Ultra's controls were folded into it on 27 Nov 2026)", () => {
    const opens = (k: "link_one_time" | "link_password" | "link_expiry" | "link_devices" | "link_email_gate") =>
      ALL.filter((p) => canUse(ws(p), k));
    for (const k of ["link_one_time", "link_password", "link_expiry", "link_devices", "link_email_gate"] as const) {
      assert.deepEqual(opens(k), ["premium", "white_glove", "control", "enterprise"], k);
    }
    // Locked: the pop-up offers the first plan this workspace can buy that has it: Premium.
    assert.deepEqual(accessTo(ws("light"), "link_one_time"), { state: "locked", upgradeTo: "premium" });
    assert.deepEqual(accessTo(ws("light"), "link_password"), { state: "locked", upgradeTo: "premium" });
    assert.deepEqual(accessTo(ws("confidence"), "link_password"), { state: "locked", upgradeTo: "premium" });
    assert.deepEqual(accessTo(ws("light"), "link_expiry"), { state: "locked", upgradeTo: "premium" });
    assert.deepEqual(accessTo(ws("premium"), "link_expiry"), { state: "open" });
    // A stray stored "ultra" is read as Premium, so nobody is ever left without what Ultra had.
    assert.deepEqual(accessTo(ws("ultra"), "link_expiry"), { state: "open" });
  });

  it("the plan's allowances are the website's numbers", () => {
    for (const p of ALL as (keyof typeof SITE_PLANS)[]) {
      assert.deepEqual(planLimits(ws(p)), { videos: SITE_PLANS[p].videos, pdfs: SITE_PLANS[p].pdfs, infoIcons: SITE_PLANS[p].infoIcons });
    }
    assert.equal(planLimits(ws("light")).infoIcons, 20);
    assert.equal(planLimits(ws("premium")).infoIcons, Infinity);
  });

  it("the Sales Team features open with logins, on any plan, and are offered without them", () => {
    assert.deepEqual(accessTo(ws("light"), "sales_team"), { state: "locked", upgradeTo: "sales_team" });
    assert.deepEqual(accessTo(ws("premium"), "sales_team"), { state: "open" }, "Premium includes one free login since 27 Nov 2026");
    assert.deepEqual(accessTo(ws("white_glove"), "sales_team"), { state: "open" });
    assert.equal(canUse(ws("light", { sales_seats: 2 }), "sales_team"), true);
  });

  it("everything promised nowhere is hidden from every customer, on every plan", () => {
    const hidden = FEATURE_KEYS.filter((k) => ROLLOUT[k].tier === "hidden");
    assert.ok(hidden.includes("meeting_recording") && hidden.includes("ai_meeting_analysis") && hidden.includes("visitor_analytics"));
    for (const p of ALL) {
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

  it("no plan recorded = Confidence's features; the old monthly Pro and Ultra = the top features", () => {
    assert.equal(effectivePlan(ws(null)), "confidence");
    assert.equal(effectivePlan(ws("nonsense")), "confidence");
    // The seven plans of 20 Nov 2026 were never sold; an id from them is unknown.
    assert.equal(effectivePlan(ws("lite")), "confidence");
    assert.equal(effectivePlan({ plan: "pro" }), "enterprise");
    assert.equal(effectivePlan({ plan: "ultra" }), "enterprise");
    // site_plan "ultra" is the withdrawn yearly plan, not the old monthly one: it reads as Premium.
    assert.equal(effectivePlan(ws("ultra")), "premium");
  });

  it("only the plan that opens new features is suggested; nothing is sold to Premium and up, or from a one-time plan", () => {
    assert.equal(nextPlan(ws("light")), "premium");
    for (const p of ["premium", "ultra", "white_glove", "control", "enterprise"]) assert.equal(nextPlan(ws(p)), null, p);
    assert.deepEqual(upgradeOptions(ws("light")), ["premium"]);
    assert.deepEqual(upgradeOptions(ws("premium")), []);
    assert.deepEqual(upgradeOptions(ws("ultra")), []);
    // A one-time plan from before 21 Nov 2026 cannot be prorated: moving it
    // to a yearly plan is arranged with our team.
    for (const p of ["confidence", "authority", "control", "enterprise"]) {
      assert.deepEqual(upgradeOptions(ws(p)), [], p);
      assert.equal(nextPlan(ws(p)), null, p);
    }
  });
});

describe("upgrade prices", () => {
  it("the yearly difference, for the months left, at the customer's own rate", () => {
    assert.deepEqual(upgradeQuote("light", "premium", "offer", 12), {
      amountInr: 42_024,
      yearlyDiffInr: 42_024,
      months: 12,
      addAreas: 40,
      addVideos: 8,
      addPdfs: 50,
    });
    assert.deepEqual(upgradeQuote("light", "premium", "offer", 6), {
      amountInr: 21_012,
      yearlyDiffInr: 42_024,
      months: 6,
      addAreas: 40,
      addVideos: 8,
      addPdfs: 50,
    });
    // A customer who bought after the offer pays the regular difference.
    assert.equal(upgradeQuote("light", "premium", "regular", 12).amountInr, 1_55_280 - 71_232);
    // The rate a workspace keeps: the offer if it bought on it.
    assert.equal(rateFor(true), "offer");
    assert.equal(rateFor(false), "regular");
  });

  it("the invoice line says what was bought, and what the workspace renews at from now on", () => {
    const q = priceFor("plan_upgrade", { fromPlan: "light", toPlan: "premium", existingScenes: 7, rate: "offer", monthsLeft: 6, planYearlyInr: 35_616 + 12_000 });
    assert.equal(q.amountInr, 21_012);
    assert.equal(q.scenes, 47, "extras already bought are kept");
    assert.match(q.lines[0].title, /VPV Premium/);
    assert.match(q.lines[0].detail ?? "", /6 months until your plan renews/);
    assert.match(q.lines[0].detail ?? "", /40 more areas/);
    // Its extra areas keep renewing too: 47,616 + 42,024.
    assert.equal(planYearlyFromNotes(q.description), 89_640);
    assert.equal(sitePlanFromNotes(q.description), null, "an upgrade is not a new plan order");
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

  async function workspace(
    o: {
      plan?: string | null;
      quota?: number;
      seats?: number;
      seatInr?: number | null;
      loginsUntil?: string | null;
      supportUntil?: string;
      /** What a yearly plan renews at; defaults to the plan's offer price. */
      yearly?: number | null;
      offerLocked?: boolean | null;
    } = {}
  ) {
    const org = await w.seedOrg({ name: "Acme Textiles", slug: "acme", quota: o.quota ?? 4, supportUntil: o.supportUntil ?? at(300 * DAY) });
    const plan = o.plan === undefined ? "confidence" : o.plan;
    const yearlyPlan = plan !== null && plan in SITE_PLANS && SITE_PLANS[plan as keyof typeof SITE_PLANS].billing === "yearly";
    const yearly = o.yearly !== undefined ? o.yearly : yearlyPlan ? SITE_PLANS[plan as keyof typeof SITE_PLANS].priceInr : null;
    await w.q(
      `update public.organizations set site_plan = $2, sales_seats = $3, sales_seat_inr = $4, sales_seats_until = $5, billing_email = 'md@acme.in',
              plan_yearly_inr = $6, plan_offer_locked = $7 where id = $1`,
      [org.id, plan, o.seats ?? 0, o.seatInr ?? null, o.loginsUntil ?? null, yearly, yearlyPlan ? (o.offerLocked ?? true) : null]
    );
    const admin = await w.seedUser({ email: "md@acme.in", orgId: org.id, role: "org_admin" });
    return { org, admin };
  }

  const orgRow = async (id: string) =>
    (await w.q(`select site_plan, scene_quota, sales_seats, sales_seat_inr, sales_seats_until, plan_yearly_inr from public.organizations where id = $1`, [id]))[0];

  async function order(admin: string, body: Record<string, unknown>) {
    const res = await w.routes.order.POST(w.request("/api/billing/order", { as: admin, body: { buyer: {}, ...body } }));
    return { status: res.status, body: await w.readJson(res) };
  }

  it("a plan bought on the website is recorded on the workspace it builds", async () => {
    const res = await w.routes.order.POST(
      w.request("/api/billing/order", {
        ip: freshIp(),
        body: { purpose: "site_plan", buyer: { ...BUYER }, sitePlanId: "white_glove", city: "Gurugram", extraAreas: 3 },
      })
    );
    const o = await w.readJson(res);
    assert.equal(res.status, 200, JSON.stringify(o));
    assert.equal(o.amountPaise, toPaise(siteQuote("white_glove", { city: "Gurugram", extraAreas: 3 }).totalInr));
    await w.payInBrowser(o);
    assert.equal((await w.poll(o.orderId)).body.status, "ready");
    // White Glove, with all 103 of its areas (not held to the scene ladder's 20),
    // renewing at the plan plus its extra areas, with the offer kept.
    const [org] = await w.q(`select site_plan, scene_quota, plan_yearly_inr, plan_offer_locked from public.organizations`);
    assert.equal(org.site_plan, "white_glove");
    assert.equal(Number(org.scene_quota), 103);
    assert.equal(Number(org.plan_yearly_inr), 1_60_560 + 3 * 9_000);
    assert.equal(org.plan_offer_locked, true);
    const [inv] = await w.q(`select description from public.billing_invoices`);
    assert.match(inv.description, /^White Glove — yearly plan, 103 areas, first 15 months/);
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

  it("plans_yearly.sql fills in what a yearly plan renews at, from its paid order", async () => {
    // The plan could not be saved when it was bought (database not ready yet).
    const { org } = await workspace({ plan: null, yearly: null });
    await w.q(
      `insert into public.billing_orders (purpose, scenes, amount_paise, taxable_paise, gst_paise, gst_rate, buyer_email, buyer_name, buyer_company, buyer_state, org_id, status, notes)
       values ('basic_licence', 5, 100, 85, 15, 0.18, 'md@acme.in', 'MD', 'Acme', 'Haryana', $1, 'paid',
               'VPV Light — 5 areas, Special offer, 2 hours shoot, cab Gurugram (free), renews yearly at ₹35,616 (yearly plan, year 1, support, hosting & security included)')`,
      [org.id]
    );
    const fs = await import("node:fs");
    await w.raw.exec(fs.readFileSync("supabase/plans_yearly.sql", "utf8"));
    const [r] = await w.q(`select site_plan, plan_yearly_inr, plan_offer_locked from public.organizations where id = $1`, [org.id]);
    assert.equal(r.site_plan, "light");
    assert.equal(Number(r.plan_yearly_inr), 35_616);
    assert.equal(r.plan_offer_locked, true);
  });

  it("Light → Premium half-way through the year: pays half the yearly difference, gets Premium and 40 more areas, renews at Premium", async () => {
    const { org, admin } = await workspace({ plan: "light", quota: 5, supportUntil: at(182 * DAY) });
    const o = await order(admin, { purpose: "plan_upgrade", upgradeTo: "premium" });
    assert.equal(o.status, 200, JSON.stringify(o.body));
    assert.equal(o.body.amountPaise, toPaise(withGst(21_012).total));
    await w.payInBrowser(o.body);
    assert.equal((await w.poll(o.body.orderId)).body.status, "ready");

    const after = await orgRow(org.id);
    assert.equal(after.site_plan, "premium");
    assert.equal(Number(after.scene_quota), 45, "5 + 40");
    assert.equal(Number(after.plan_yearly_inr), 77_640, "renews at Premium, at the offer rate it keeps");
    const [inv] = await w.q(`select description from public.billing_invoices where org_id = $1`, [org.id]);
    assert.match(inv.description, /Upgrade to VPV Premium/);
    assert.ok(w.gw.emailsTo("md@acme.in").some((m) => /plan is upgraded/i.test(m.subject)));
  });

  it("refuses a downgrade, the same plan, White Glove, an old or withdrawn plan and nonsense — before any money moves", async () => {
    const { admin } = await workspace({ plan: "premium", quota: 45 });
    for (const upgradeTo of ["light", "premium", "ultra", "white_glove", "control", "enterprise", "lite", "platinum", undefined]) {
      const o = await order(admin, { purpose: "plan_upgrade", upgradeTo });
      assert.equal(o.status, 400, String(upgradeTo));
      assert.equal(o.body.error, "invalid_upgrade");
    }
    assert.equal(Number((await w.q(`select count(*) as n from public.billing_orders`))[0].n), 0);
  });

  it("a one-time plan from before 21 Nov 2026 cannot buy a prorated upgrade: it is arranged with our team", async () => {
    const { admin } = await workspace({ plan: "control", quota: 15 });
    const o = await order(admin, { purpose: "plan_upgrade", upgradeTo: "premium" });
    assert.equal(o.status, 400);
    assert.equal(o.body.error, "invalid_upgrade");
  });

  it("the price is from the plan and rate the DATABASE says they have, not what the browser claims", async () => {
    // Light, 300 days left (10 months), bought on the offer. The browser claims it is
    // already on Premium and bought at the regular rate; the database says otherwise.
    const { admin } = await workspace({ plan: "light", quota: 5 });
    const o = await order(admin, { purpose: "plan_upgrade", upgradeTo: "premium", fromPlan: "premium", sitePlanId: "premium", rate: "regular" });
    assert.equal(o.body.amountPaise, toPaise(withGst(Math.round((42_024 * 10) / 12)).total));
    // Bought after the offer: the regular difference.
    await w.reset();
    const late = await workspace({ plan: "light", quota: 5, offerLocked: false, yearly: 71_232 });
    const r = await order(late.admin, { purpose: "plan_upgrade", upgradeTo: "premium" });
    assert.equal(r.body.amountPaise, toPaise(withGst(Math.round((84_048 * 10) / 12)).total));
  });

  it("a full refund of an upgrade puts the plan, the areas and the renewal amount back", async () => {
    const { org, admin } = await workspace({ plan: "light", quota: 5 });
    const o = await order(admin, { purpose: "plan_upgrade", upgradeTo: "premium" });
    const paid = await w.payInBrowser(o.body);
    await w.poll(o.body.orderId);
    const up = await orgRow(org.id);
    assert.equal(up.site_plan, "premium");
    assert.equal(Number(up.plan_yearly_inr), 77_640);
    await w.deliver(w.gw.refundEvent("refund.processed", w.gw.makeRefund(paid.payment.id, Number(o.body.amountPaise))));
    const back = await orgRow(org.id);
    assert.equal(back.site_plan, "light");
    assert.equal(Number(back.scene_quota), 5);
    assert.equal(Number(back.plan_yearly_inr), 35_616);
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
      `update public.organizations set plan_yearly_inr = 1 where id = $1`,
      `update public.organizations set plan_offer_locked = true where id = $1`,
    ]) {
      await assert.rejects(() => w.sb.as("authenticated", admin).run(sql, [org.id]), /billing system/, sql);
    }
    const owner = await w.seedUser({ email: "owner@vpv.in", role: "owner" });
    await w.sb.as("authenticated", owner).run(`update public.organizations set site_plan = 'authority' where id = $1`, [org.id]);
    assert.equal((await orgRow(org.id)).site_plan, "authority");
  });

  it("each link control needs the plan that includes it, whatever the browser sends", async () => {
    const { org, admin } = await workspace({ plan: "light" });
    const tour = await w.seedTour(org.id, 2);
    const add = (cols: string, vals: string) =>
      w.sb.as("authenticated", admin).run(`insert into public.share_links (tour_id, token, ${cols}) values ($1, $2, ${vals}) returning id`, [tour, `t${Math.random()}`]);
    const CONTROLS: [string, string][] = [
      ["view_limit", "1"],
      ["session_minutes", "30"],
      ["password_hash", "'abc'"],
      ["expires_at", "now() + interval '1 day'"],
      ["device_limit", "1"],
      ["require_email", "true"],
    ];
    const allowed = async () => {
      const ok: string[] = [];
      for (const [cols, vals] of CONTROLS) {
        try {
          await add(cols, vals);
          ok.push(cols);
        } catch (e) {
          assert.match(String((e as Error).message), /sharing_controls_need_control/, cols);
        }
      }
      return ok;
    };

    // Light: plain links only.
    await add("kind", "'viewer'");
    await add("kind", "'presenter'");
    assert.deepEqual(await allowed(), []);

    // An existing plain link can still be revoked, but not given a control.
    const [{ id }] = (await add("kind", "'viewer'")).rows as Array<{ id: string }>;
    await w.sb.as("authenticated", admin).run(`update public.share_links set revoked_at = now(), used = true where id = $1`, [id]);
    await assert.rejects(
      () => w.sb.as("authenticated", admin).run(`update public.share_links set expires_at = now() where id = $1`, [id]),
      /sharing_controls_need_control/
    );

    const on = async (plan: string) => {
      await w.q(`update public.organizations set site_plan = $2 where id = $1`, [org.id, plan]);
      return allowed();
    };
    const all = CONTROLS.map(([c]) => c);
    assert.deepEqual(await on("premium"), all, "Premium has every control since 27 Nov 2026");
    assert.deepEqual(await on("ultra"), all, "a workspace still recorded as the withdrawn Ultra keeps every control");
    assert.deepEqual(await on("white_glove"), all);
    assert.deepEqual(await on("control"), all, "the old Control keeps every control");

    // Turning a control OFF is always allowed, even on a plan without it.
    await w.q(`update public.organizations set site_plan = 'white_glove' where id = $1`, [org.id]);
    const [{ id: guarded }] = (await add("device_limit, password_hash", "2, 'x'")).rows as Array<{ id: string }>;
    await w.q(`update public.organizations set site_plan = 'light' where id = $1`, [org.id]);
    await w.sb.as("authenticated", admin).run(`update public.share_links set device_limit = null, password_hash = null where id = $1`, [guarded]);
  });
});
