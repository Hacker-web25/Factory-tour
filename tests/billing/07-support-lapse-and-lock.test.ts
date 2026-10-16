import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { makeWorld, BUYER, type World } from "./harness/world";
import { SUPPORT_GRACE_DAYS, SUPPORT_RENEW_WINDOW_DAYS, accessStateFor } from "@/lib/pricing";

const DAY = 86_400_000;
const at = (ms: number) => new Date(Date.now() + ms).toISOString();

/**
 * The ₹9,999 support year: free for 12 months, then a pop-up on every click for
 * 7 days (level 1), then the workspace locks (level 2) until it is renewed.
 * The database decides; the screen only shows it. Here the database is attacked
 * from every side: clocks, boundaries, direct table access, self-upgrades.
 */
describe("support lapse ladder and the lock", () => {
  let w: World;
  before(async () => {
    w = await makeWorld();
  });
  beforeEach(async () => {
    await w.reset();
    w.sb.clearFailures();
  });
  after(() => w.gw.uninstall());

  const stateOf = async (orgId: string) => (await w.q(`select public.org_access_state_of($1) as s`, [orgId]))[0].s as string;

  async function workspace(o: { supportUntil?: string | null; plan?: "basic" | "pro" | "ultra"; planStatus?: string; quota?: number | null; scenes?: number; slug?: string } = {}) {
    const org = await w.seedOrg({
      name: "Lock Co",
      slug: o.slug ?? "lock-co",
      plan: o.plan ?? "basic",
      quota: o.quota === undefined ? 3 : o.quota,
      supportUntil: o.supportUntil,
      planStatus: o.planStatus,
    });
    const admin = await w.seedUser({ email: `admin@${o.slug ?? "lock-co"}.in`, orgId: org.id, role: "org_admin" });
    const tour = await w.seedTour(org.id, o.scenes ?? 6);
    return { org, admin, tour };
  }

  /* ───────────────────────────── the three states ───────────────────────────── */

  describe("states and boundaries", () => {
    it("the 7-day grace period is the same number in the app and in the database", async () => {
      assert.equal(SUPPORT_GRACE_DAYS, 7);
      assert.equal(Number((await w.q(`select public.vpv_support_nag_days() as d`))[0].d), SUPPORT_GRACE_DAYS);
    });

    const cases: Array<[string, number | null, string, { plan?: "basic" | "pro" | "ultra"; planStatus?: string }]> = [
      ["a year of support left", 200 * DAY, "active", {}],
      ["a day left", 1 * DAY, "active", {}],
      ["a minute left", 60_000, "active", {}],
      ["a minute past the end → level 1", -60_000, "nag", {}],
      ["3 days past → level 1", -3 * DAY, "nag", {}],
      ["6 days 23 hours past → still level 1", -(7 * DAY - 3_600_000), "nag", {}],
      ["7 days and a minute past → level 2, locked", -(7 * DAY + 60_000), "locked", {}],
      ["a year past → locked", -365 * DAY, "locked", {}],
      ["no support date on file (legacy) → not locked", null, "active", {}],
      ["Pro, lapsed → not locked (Pro is a subscription)", -30 * DAY, "active", { plan: "pro" }],
      ["Ultra, lapsed → not locked", -30 * DAY, "active", { plan: "ultra" }],
      ["suspended → locked", 200 * DAY, "locked", { planStatus: "suspended" }],
      ["cancelled (refund) → locked", 200 * DAY, "locked", { planStatus: "cancelled" }],
    ];
    for (const [label, offset, expected, extra] of cases) {
      it(`${label}: the database and the app's own copy of the rule agree on "${expected}"`, async () => {
        const supportUntil = offset === null ? null : at(offset);
        const { org } = await workspace({ supportUntil, ...extra });
        assert.equal(await stateOf(org.id), expected);
        const ts = accessStateFor({ plan: extra.plan ?? "basic", plan_status: extra.planStatus ?? "active", support_until: supportUntil }, new Date());
        assert.equal(ts.state, expected, "TypeScript copy");
      });
    }

    it("exact boundaries in the app's copy of the rule (to the millisecond)", () => {
      const now = new Date("2027-06-15T12:00:00.000Z");
      const until = (ms: number) => ({ plan: "basic", plan_status: "active", support_until: new Date(now.getTime() + ms) });
      assert.equal(accessStateFor(until(0), now).state, "active", "the very instant the year ends");
      assert.equal(accessStateFor(until(-1), now).state, "nag", "1 ms later");
      assert.equal(accessStateFor(until(-7 * DAY), now).state, "nag", "exactly 7 days later is still level 1");
      assert.equal(accessStateFor(until(-7 * DAY - 1), now).state, "locked", "1 ms after that");
      assert.equal(accessStateFor({ plan: "basic", plan_status: "active", support_until: "not a date" }, now).state, "active");
    });

    it("my_org_access_state tells the signed-in person their state, the lock date, and the days left", async () => {
      const { admin } = await workspace({ supportUntil: at(-3 * DAY) });
      const r = await w.sb.as("authenticated", admin).rpc("my_org_access_state", {});
      assert.equal(r.error, null, JSON.stringify(r.error));
      const row = (r.data as Array<Record<string, unknown>>)[0];
      assert.equal(row.state, "nag");
      assert.equal(row.days_to_lock, 4);
      assert.equal(row.role, "org_admin");
      const locksAt = new Date(String(row.locks_at)).getTime();
      assert.ok(Math.abs(locksAt - (Date.now() + 4 * DAY)) < 5_000, "locks_at = support end + 7 days");
    });

    it("a workspace in good standing reports 'active' and no countdown", async () => {
      const { admin } = await workspace({ supportUntil: at(100 * DAY) });
      const row = ((await w.sb.as("authenticated", admin).rpc("my_org_access_state", {})).data as Array<Record<string, unknown>>)[0];
      assert.equal(row.state, "active");
      assert.equal(row.days_to_lock, null);
    });

    it("the platform owner is never shown the wall, whatever workspace they look at", async () => {
      const { org } = await workspace({ supportUntil: at(-30 * DAY) });
      const owner = await w.seedUser({ email: "owner@vpv.in", role: "owner", orgId: org.id });
      const row = ((await w.sb.as("authenticated", owner).rpc("my_org_access_state", {})).data as Array<Record<string, unknown>>)[0];
      assert.equal(row.state, "active");
    });

    it("anonymous visitors cannot ask for anyone's state", async () => {
      await workspace({ supportUntil: at(-30 * DAY) });
      const r = await w.sb.as("anon").rpc("my_org_access_state", {});
      assert.ok(r.error || !(r.data as unknown[])?.length);
    });
  });

  /* ───────────────────────────── what the public sees ───────────────────────────── */

  describe("public viewers", () => {
    const scenes = async (tour: string, role: "anon" | "authenticated" = "anon", sub?: string) => {
      const r = await w.sb.as(role, sub).rpc("public_tour_scenes", { p_tour_id: tour });
      assert.equal(r.error, null, JSON.stringify(r.error));
      return r.data as Array<{ name: string; order_index: number }>;
    };

    it("active Basic: only the scenes paid for are served, in order", async () => {
      const { tour } = await workspace({ supportUntil: at(100 * DAY), quota: 3, scenes: 6 });
      const got = await scenes(tour);
      assert.deepEqual(got.map((s) => s.order_index), [0, 1, 2]);
    });

    it("Pro serves every scene", async () => {
      const { tour } = await workspace({ plan: "pro", supportUntil: null, quota: null, scenes: 6 });
      assert.equal((await scenes(tour)).length, 6);
    });

    it("level 1 (pop-ups) still serves the tours: customers' visitors are not punished yet", async () => {
      const { tour } = await workspace({ supportUntil: at(-3 * DAY), quota: 3, scenes: 6 });
      assert.equal((await scenes(tour)).length, 3);
    });

    it("level 2 (locked) serves NOTHING to the public, to a member, or to a stranger", async () => {
      const { tour, admin } = await workspace({ supportUntil: at(-8 * DAY), quota: 3, scenes: 6 });
      assert.equal((await scenes(tour)).length, 0, "anonymous");
      assert.equal((await scenes(tour, "authenticated", admin)).length, 0, "the workspace's own admin");
      const stranger = await w.seedUser({ email: "x@elsewhere.in", orgId: null });
      assert.equal((await scenes(tour, "authenticated", stranger)).length, 0, "an unrelated user");
    });

    it("level 2 still lets the platform owner see the scenes (support needs it)", async () => {
      const { tour } = await workspace({ supportUntil: at(-8 * DAY), quota: 3, scenes: 6 });
      const owner = await w.seedUser({ email: "owner@vpv.in", role: "owner" });
      assert.equal((await scenes(tour, "authenticated", owner)).length, 6);
    });

    it("a cancelled (refunded) workspace serves nothing either", async () => {
      const { tour } = await workspace({ supportUntil: at(100 * DAY), planStatus: "cancelled" });
      assert.equal((await scenes(tour)).length, 0);
    });

    it("tour_is_locked tells a viewer page to say so instead of showing an empty tour", async () => {
      const open = await workspace({ supportUntil: at(100 * DAY), slug: "open-co" });
      const shut = await workspace({ supportUntil: at(-10 * DAY), slug: "shut-co" });
      const lockedFor = async (t: string) => (await w.sb.as("anon").rpc("tour_is_locked", { p_tour_id: t })).data;
      assert.equal(await lockedFor(open.tour), false);
      assert.equal(await lockedFor(shut.tour), true);
      assert.equal(await lockedFor("00000000-0000-4000-8000-000000000000"), false, "unknown tour → not 'locked'");
    });

    it("renewing unlocks everything instantly", async () => {
      const { tour, org } = await workspace({ supportUntil: at(-10 * DAY), quota: 3, scenes: 6 });
      assert.equal((await scenes(tour)).length, 0);
      await w.q(`update public.organizations set support_until = now() + interval '1 year' where id = $1`, [org.id]);
      assert.equal((await scenes(tour)).length, 3);
    });
  });

  /* ───────────────────────────── the lock holds against direct access ───────────────────────────── */

  describe("a locked workspace cannot be reached around the screen", () => {
    const run = async (role: "anon" | "authenticated", sub: string | undefined, sql: string, params: unknown[] = []) => {
      try {
        const r = await w.sb.as(role, sub).run(sql, params);
        return { ok: true as const, rows: r.rows };
      } catch (e) {
        return { ok: false as const, error: (e as Error).message };
      }
    };

    it("reading the scenes table directly returns nothing when locked, everything when open", async () => {
      const shut = await workspace({ supportUntil: at(-10 * DAY), slug: "shut-co" });
      const r1 = await run("anon", undefined, `select * from public.scenes where tour_id = $1`, [shut.tour]);
      assert.ok(r1.ok && r1.rows.length === 0, "anonymous sees no scenes of a locked workspace");
      const r2 = await run("authenticated", shut.admin, `select * from public.scenes where tour_id = $1`, [shut.tour]);
      assert.ok(r2.ok && r2.rows.length === 0, "its own admin sees none either");

      const open = await workspace({ supportUntil: at(100 * DAY), slug: "open-co" });
      const r3 = await run("anon", undefined, `select * from public.scenes where tour_id = $1`, [open.tour]);
      assert.ok(r3.ok && r3.rows.length === 6, "an open workspace is unaffected");
    });

    it("adding, editing or deleting scenes in a locked workspace is refused", async () => {
      const { tour, admin } = await workspace({ supportUntil: at(-10 * DAY) });
      const ins = await run("authenticated", admin, `insert into public.scenes (tour_id, order_index, name) values ($1, 99, 'sneaky')`, [tour]);
      assert.equal(ins.ok, false);
      const upd = await run("authenticated", admin, `update public.scenes set name = 'x' where tour_id = $1 returning id`, [tour]);
      assert.ok(upd.ok && upd.rows.length === 0, "nothing updated");
      const del = await run("authenticated", admin, `delete from public.scenes where tour_id = $1 returning id`, [tour]);
      assert.ok(del.ok && del.rows.length === 0, "nothing deleted");
      assert.equal(await w.count("scenes", "name = 'sneaky'"), 0);
      assert.equal(await w.count("scenes"), 6);
    });

    it("creating, renaming or deleting tours in a locked workspace is refused — for signed-in AND anonymous callers", async () => {
      const { org, tour, admin } = await workspace({ supportUntil: at(-10 * DAY) });
      for (const [role, sub] of [["authenticated", admin], ["anon", undefined]] as const) {
        const ins = await run(role, sub, `insert into public.tours (org_id, name) values ($1, 'sneaky')`, [org.id]);
        assert.equal(ins.ok, false, `${role} insert`);
        const upd = await run(role, sub, `update public.tours set name = 'x' where id = $1 returning id`, [tour]);
        assert.ok(upd.ok && upd.rows.length === 0, `${role} update`);
        const del = await run(role, sub, `delete from public.tours where id = $1 returning id`, [tour]);
        assert.ok(del.ok && del.rows.length === 0, `${role} delete`);
      }
      assert.equal(await w.count("tours"), 1);
      assert.equal((await w.q(`select name from public.tours`))[0].name, "Tour");
    });

    it("an open workspace can still do all of that (the lock is not a blanket ban)", async () => {
      const { org, tour, admin } = await workspace({ supportUntil: at(100 * DAY) });
      assert.equal((await run("authenticated", admin, `insert into public.scenes (tour_id, order_index, name) values ($1, 50, 'ok')`, [tour])).ok, true);
      assert.equal((await run("authenticated", admin, `insert into public.tours (org_id, name) values ($1, 'new')`, [org.id])).ok, true);
      const upd = await run("authenticated", admin, `update public.tours set name = 'renamed' where id = $1 returning id`, [tour]);
      assert.ok(upd.ok && upd.rows.length === 1);
    });

    it("level 1 (pop-ups) does not block work", async () => {
      const { tour, admin } = await workspace({ supportUntil: at(-3 * DAY) });
      assert.equal((await run("authenticated", admin, `insert into public.scenes (tour_id, order_index, name) values ($1, 50, 'ok')`, [tour])).ok, true);
    });

    it("the platform owner can still work in a locked workspace", async () => {
      const { tour } = await workspace({ supportUntil: at(-10 * DAY) });
      const owner = await w.seedUser({ email: "owner@vpv.in", role: "owner" });
      const r = await run("authenticated", owner, `select * from public.scenes where tour_id = $1`, [tour]);
      assert.ok(r.ok && r.rows.length === 6);
    });
  });

  /* ───────────────────────────── nobody can grant themselves a plan ───────────────────────────── */

  describe("self-service tampering from the browser", () => {
    const attempt = async (sub: string, sql: string, params: unknown[] = []) => {
      try {
        const r = await w.sb.as("authenticated", sub).run(sql, params);
        return { ok: true as const, rows: r.rows };
      } catch (e) {
        return { ok: false as const, error: (e as Error).message };
      }
    };

    it("an organisation admin cannot change plan, quota, cap, status or support date — each is refused", async () => {
      const { org, admin } = await workspace({ supportUntil: at(-10 * DAY), quota: 3 });
      const edits = [
        `plan = 'ultra'`,
        `scene_quota = 999`,
        `basic_scene_cap = 10`,
        `support_until = now() + interval '50 years'`,
        `activated_at = now()`,
      ];
      for (const set of edits) {
        const r = await attempt(admin, `update public.organizations set ${set} where id = $1`, [org.id]);
        assert.equal(r.ok, false, set);
      }
      const [row] = await w.q(`select plan, scene_quota, support_until from public.organizations where id = $1`, [org.id]);
      assert.equal(row.plan, "basic");
      assert.equal(Number(row.scene_quota), 3);
      assert.ok(new Date(row.support_until).getTime() < Date.now(), "still lapsed");
      assert.equal(await stateOf(org.id), "locked", "and still locked");
    });

    it("a refunded (cancelled) workspace cannot reopen itself by editing its own status", async () => {
      const { org, admin } = await workspace({ supportUntil: at(100 * DAY), planStatus: "cancelled" });
      const r = await attempt(admin, `update public.organizations set plan_status = 'active' where id = $1`, [org.id]);
      assert.equal(r.ok, false);
      assert.equal(await stateOf(org.id), "locked");
    });

    it("harmless edits (the workspace name) still work", async () => {
      const { org, admin } = await workspace({ supportUntil: at(100 * DAY) });
      const r = await attempt(admin, `update public.organizations set name = 'Better Name' where id = $1 returning name`, [org.id]);
      assert.ok(r.ok && r.rows[0].name === "Better Name");
    });

    it("a brand-new organisation created from the browser always starts as plain Basic with nothing included", async () => {
      const user = await w.seedUser({ email: "new@person.in", orgId: null });
      const r = await attempt(
        user,
        `insert into public.organizations (name, slug, plan, plan_status, scene_quota, basic_scene_cap, support_until) values ('Mine', 'mine-co', 'basic', 'active', 500, 10, now() + interval '50 years') returning plan, scene_quota, support_until, basic_scene_cap`
      );
      assert.ok(r.ok, JSON.stringify(r));
      assert.equal(r.rows[0].scene_quota, null);
      assert.equal(r.rows[0].support_until, null);
      assert.equal(Number(r.rows[0].basic_scene_cap), 2);
    });

    it("the platform owner CAN change plans (support staff need to)", async () => {
      const { org } = await workspace({ supportUntil: at(100 * DAY) });
      const owner = await w.seedUser({ email: "owner@vpv.in", role: "owner" });
      const r = await attempt(owner, `update public.organizations set scene_quota = 12 where id = $1 returning scene_quota`, [org.id]);
      assert.ok(r.ok && Number(r.rows[0].scene_quota) === 12);
    });
  });

  /* ───────────────────────────── paying to get out ───────────────────────────── */

  describe("renewing the ₹9,999 support year", () => {
    async function renew(uid: string) {
      const res = await w.routes.order.POST(w.request("/api/billing/order", { as: uid, body: { purpose: "support_renewal", buyer: {} } }));
      return { res, body: await w.readJson(res), status: res.status };
    }

    it("a LOCKED workspace can still buy its renewal, and is unlocked the moment it is paid", async () => {
      const { admin, org, tour } = await workspace({ supportUntil: at(-30 * DAY), quota: 3 });
      assert.equal(await stateOf(org.id), "locked");
      const order = await renew(admin);
      assert.equal(order.status, 200, JSON.stringify(order.body));
      assert.equal(order.body.amountPaise, 1_179_882);

      await w.payInBrowser(order.body);
      assert.equal((await w.poll(order.body.orderId)).body.status, "ready");
      assert.equal(await stateOf(org.id), "active");
      const [o] = await w.q(`select support_until, plan_status from public.organizations where id = $1`, [org.id]);
      const months = (new Date(o.support_until).getTime() - Date.now()) / (30.4 * DAY);
      assert.ok(months > 11.8 && months < 12.2, `a year from today (not from the lapsed date): ${months}`);
      const r = await w.sb.as("anon").rpc("public_tour_scenes", { p_tour_id: tour });
      assert.equal((r.data as unknown[]).length, 3, "visitors see the tour again");
    });

    it("renewing early extends from the current end date, so no paid time is lost", async () => {
      const end = new Date(Date.now() + 20 * DAY);
      const { admin, org } = await workspace({ supportUntil: end.toISOString() });
      const order = await renew(admin);
      await w.payInBrowser(order.body);
      await w.poll(order.body.orderId);
      const [o] = await w.q(`select support_until from public.organizations where id = $1`, [org.id]);
      const expected = new Date(end);
      expected.setMonth(expected.getMonth() + 12);
      assert.ok(Math.abs(new Date(o.support_until).getTime() - expected.getTime()) < 2 * DAY);
    });

    it("a year that is already paid for cannot be bought twice", async () => {
      const { admin } = await workspace({ supportUntil: at(-2 * DAY) });
      const first = await renew(admin);
      await w.payInBrowser(first.body);
      await w.poll(first.body.orderId);
      const second = await renew(admin);
      assert.equal(second.status, 409);
      assert.equal(second.body.error, "too_early");
      assert.ok(SUPPORT_RENEW_WINDOW_DAYS > 0);
    });

    it("clicking Renew twice at once opens one order; paying one tab twice refunds the second charge and extends once", async () => {
      const { admin, org } = await workspace({ supportUntil: at(-2 * DAY) });
      const [a, b] = await Promise.all([renew(admin), renew(admin)]);
      assert.equal(a.status, 200);
      assert.equal(b.status, 200);
      assert.equal(a.body.orderId, b.body.orderId);
      assert.equal(await w.count("billing_orders"), 1);

      const first = w.gw.pay(a.body.razorpayOrderId);
      const second = w.gw.pay(a.body.razorpayOrderId, { force: true });
      await w.deliver(w.gw.paymentEvent("payment.captured", first));
      await w.deliver(w.gw.paymentEvent("payment.captured", second));
      await w.deliver(w.gw.paymentEvent("payment.captured", second));
      await w.poll(a.body.orderId);
      assert.equal(w.gw.refunds.size, 1, "exactly one refund");
      const [o] = await w.q(`select support_until from public.organizations where id = $1`, [org.id]);
      const months = (new Date(o.support_until).getTime() - Date.now()) / (30.4 * DAY);
      assert.ok(months > 11.8 && months < 12.2, `extended once: ${months}`);
      assert.equal(await w.count("billing_invoices"), 1);
    });

    it("only the workspace's admin can renew; a presenter, a stranger, a Pro customer and a signed-out visitor cannot", async () => {
      const { org } = await workspace({ supportUntil: at(-2 * DAY) });
      const presenter = await w.seedUser({ email: "p@lock-co.in", orgId: org.id, role: "presenter" });
      assert.equal((await renew(presenter)).status, 403);
      const noOrg = await w.seedUser({ email: "x@elsewhere.in", orgId: null, role: "org_admin" });
      assert.equal((await renew(noOrg)).status, 403);
      const pro = await workspace({ plan: "pro", supportUntil: null, slug: "pro-co" });
      assert.equal((await renew(pro.admin)).status, 400);
      const res = await w.routes.order.POST(w.request("/api/billing/order", { body: { purpose: "support_renewal", buyer: {} } }));
      assert.equal(res.status, 401);
      assert.equal(await w.count("billing_orders"), 0);
    });

    it("an admin can only ever renew THEIR OWN workspace — the body cannot point at someone else's", async () => {
      const mine = await workspace({ supportUntil: at(-2 * DAY), slug: "mine-co" });
      const theirs = await workspace({ supportUntil: at(-2 * DAY), slug: "theirs-co" });
      const myAdmin = (await w.q(`select id from public.profiles where org_id = $1`, [mine.org.id]))[0].id as string;
      const res = await w.routes.order.POST(
        w.request("/api/billing/order", {
          as: myAdmin,
          body: { purpose: "support_renewal", orgId: theirs.org.id, org_id: theirs.org.id, buyer: { email: "evil@x.in", company: "Evil" } },
        })
      );
      assert.equal(res.status, 200);
      const [row] = await w.q(`select org_id, buyer_email, buyer_company from public.billing_orders`);
      assert.equal(row.org_id, mine.org.id);
      assert.notEqual(row.buyer_email, "evil@x.in", "invoices go to the organisation's own address on file");
    });
  });

  /* ───────────────────────────── the reminders ───────────────────────────── */

  describe("reminder e-mails", () => {
    async function remindable(slug: string, supportUntil: string, extra: Partial<{ plan: "basic" | "pro"; planStatus: string }> = {}) {
      const org = await w.seedOrg({ name: `Org ${slug}`, slug, plan: extra.plan ?? "basic", supportUntil, planStatus: extra.planStatus });
      await w.q(`update public.organizations set billing_email = $2 where id = $1`, [org.id, `owner@${slug}.in`]);
      return org;
    }
    const mailsFor = (slug: string) => w.gw.emailsTo(`owner@${slug}.in`);

    it("each stage sends its own message, once, and nothing is sent outside the window", async () => {
      await remindable("t30-co", at(25 * DAY));
      await remindable("t7-co", at(5 * DAY));
      await remindable("t0-co", at(-1 * DAY));
      await remindable("t3-co", at(-4 * DAY));
      await remindable("t6-co", at(-6.5 * DAY));
      await remindable("far-co", at(40 * DAY));
      await remindable("locked-co", at(-8 * DAY));
      await remindable("pro-co", at(-1 * DAY), { plan: "pro" });
      await remindable("gone-co", at(-1 * DAY), { planStatus: "cancelled" });

      const first = await w.reconcile();
      assert.equal(first.status, 200, JSON.stringify(first.body));
      assert.equal(first.body.reminders, 5, JSON.stringify(first.body));
      assert.match(mailsFor("t30-co")[0].subject, /about a month/i);
      assert.match(mailsFor("t7-co")[0].subject, /in a week/i);
      assert.match(mailsFor("t0-co")[0].subject, /has ended/i);
      assert.match(mailsFor("t3-co")[0].subject, /locks in a few days/i);
      assert.match(mailsFor("t6-co")[0].subject, /final notice/i);
      for (const quiet of ["far-co", "locked-co", "pro-co", "gone-co"]) assert.equal(mailsFor(quiet).length, 0, quiet);

      const second = await w.reconcile();
      assert.equal(second.body.reminders, 0, "the same stage is never sent twice");
      assert.equal(mailsFor("t7-co").length, 1);
    });

    it("if the e-mail provider is down the reminder is handed back and sent on the next run — once", async () => {
      await remindable("t7-co", at(5 * DAY));
      w.gw.emailsDown = true;
      const down = await w.reconcile();
      assert.equal(down.body.reminders, 0);
      assert.equal(down.body.reminderFailures, 1);
      w.gw.emailsDown = false;
      const up = await w.reconcile();
      assert.equal(up.body.reminders, 1);
      assert.equal((await w.reconcile()).body.reminders, 0);
      assert.equal(mailsFor("t7-co").length, 1);
    });

    it("two overlapping reconcilers send a reminder once", async () => {
      await remindable("t7-co", at(5 * DAY));
      await Promise.all([w.reconcile(), w.reconcile(), w.reconcile()]);
      assert.equal(mailsFor("t7-co").length, 1);
    });

    it("a renewed workspace gets a fresh set of reminders for its next year (the reminder key includes the support end date)", async () => {
      const org = await remindable("t7-co", at(5 * DAY));
      await w.reconcile();
      assert.equal(mailsFor("t7-co").length, 1);
      // A renewal moves the end date; when the new year approaches, the same stage is due again.
      await w.q(`update public.organizations set support_until = $2 where id = $1`, [org.id, at(4 * DAY)]);
      const again = await w.reconcile();
      assert.equal(again.body.reminders, 1);
      assert.equal(mailsFor("t7-co").length, 2);
    });
  });
});
