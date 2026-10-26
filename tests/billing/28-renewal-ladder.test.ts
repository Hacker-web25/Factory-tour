import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { makeWorld, type World } from "./harness/world";
import { SUPPORT_ANNUAL_INR, toPaise, withGst } from "@/lib/pricing";
import { parseReminderKind, reminderMail } from "@/lib/server/billingEmails";

const DAY = 86_400_000;
const at = (ms: number) => new Date(Date.now() + ms).toISOString();

/**
 * Renewals that chase themselves, and Sales Team logins that stop on their own.
 *
 *   30 days · 1 week · 1 day before → one e-mail every day of the 7-day grace
 *   period → one "locked" e-mail. Never the same stage twice.
 *
 * Support unpaid  → the whole workspace locks (covered in 07).
 * Logins unpaid   → only the salespeople are switched off.
 * A workspace cannot add more salespeople than it has paid for.
 */
describe("renewal ladder, separate login dues, and the cap on salespeople", () => {
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
      slug?: string;
      supportUntil?: string | null;
      loginsUntil?: string | null;
      seats?: number;
      seatInr?: number | null;
      plan?: "basic" | "pro";
    } = {}
  ) {
    const slug = o.slug ?? "acme";
    const org = await w.seedOrg({
      name: `Org ${slug}`,
      slug,
      plan: o.plan ?? "basic",
      supportUntil: o.supportUntil === undefined ? at(200 * DAY) : o.supportUntil,
    });
    await w.q(
      `update public.organizations
          set billing_email = $2, sales_seats = $3, sales_seat_inr = $4, sales_seats_until = $5
        where id = $1`,
      [org.id, `owner@${slug}.in`, o.seats ?? 0, o.seatInr === undefined ? null : o.seatInr, o.loginsUntil ?? null]
    );
    const admin = await w.seedUser({ email: `admin@${slug}.in`, orgId: org.id, role: "org_admin" });
    return { org, admin, slug };
  }

  const salesperson = (org: string, n: number) => w.seedUser({ email: `rep${n}@${org}.in`, orgId: org, role: "presenter" });
  const mailsFor = (slug: string) => w.gw.emailsTo(`owner@${slug}.in`);
  const kindAt = async (gapDays: number, nag = 7) =>
    (await w.q(`select public.vpv_reminder_kind(($1 || ' days')::interval, $2) as k`, [String(gapDays), nag]))[0].k as string | null;

  /* ───────────────────────────── which stage is due ───────────────────────────── */

  describe("the stage boundaries (one rule, in the database)", () => {
    const cases: Array<[number, string | null]> = [
      [-40, null],
      [-30.01, null],
      [-30, "t30"],
      [-29, "t30"],
      [-7.01, "t30"],
      [-7, "t7"],
      [-6, "t7"],
      [-1.01, "t7"],
      [-1, "t1"],
      [-0.5, "t1"],
      [-0.0001, "t1"],
      [0, "d0"],
      [0.99, "d0"],
      [1, "d1"],
      [3.5, "d3"],
      [6.99, "d6"],
      [7, "locked"],
      [9.99, "locked"],
      [10, null],
      [30, null],
    ];
    for (const [gap, want] of cases) {
      it(`${gap} days from the end date → ${want ?? "nothing"}`, async () => {
        assert.equal(await kindAt(gap), want);
      });
    }
  });

  /* ───────────────────────────── a whole year, day by day ───────────────────────────── */

  describe("the ladder, one night at a time", () => {
    it("sends exactly 11 e-mails — 30d, 1 week, 1 day, 7 daily, then locked — and never repeats one", async () => {
      const { org, slug } = await workspace();
      const sent: string[] = [];
      // Walk the clock: the end date starts 31 days away and the nightly job runs once a day.
      for (let d = 31; d >= -11; d--) {
        const end = at((d + 0.3) * DAY);
        await w.q(`update public.organizations set support_until = $2 where id = $1`, [org.id, end]);
        await w.q(`update public.support_reminders set support_until = $2 where org_id = $1`, [org.id, end]);
        const before = mailsFor(slug).length;
        const r = await w.reconcile();
        assert.equal(r.status, 200, JSON.stringify(r.body));
        const mails = mailsFor(slug);
        for (const m of mails.slice(before)) sent.push(`${d}|${m.subject}`);
      }
      assert.equal(sent.length, 11, sent.join("\n"));

      const subjects = sent.map((x) => x.split("|")[1]);
      assert.match(subjects[0], /about a month/i);
      assert.match(subjects[1], /in a week/i);
      assert.match(subjects[2], /due tomorrow/i);
      const countdown = subjects.slice(3, 10);
      ["7 days", "6 days", "5 days", "4 days", "3 days", "2 days", "1 day"].forEach((left, i) => {
        assert.match(countdown[i], new RegExp(`locks in ${left}\\b`, "i"), countdown[i]);
      });
      assert.match(subjects[10], /is locked/i);
      assert.equal(new Set(subjects).size, 11, "no two e-mails are the same");

      // The days they went out on: the first night inside each window.
      const days = sent.map((x) => Number(x.split("|")[0]));
      assert.deepEqual(days, [29, 6, 0, -1, -2, -3, -4, -5, -6, -7, -8]);
    });

    it("a daily reminder whose send failed is retried the next night, not skipped", async () => {
      await workspace({ supportUntil: at(-2.5 * DAY) });
      w.gw.emailsDown = true;
      const down = await w.reconcile();
      assert.equal(down.body.reminders, 0);
      assert.equal(down.body.reminderFailures, 1);
      w.gw.emailsDown = false;
      assert.equal((await w.reconcile()).body.reminders, 1);
      assert.equal((await w.reconcile()).body.reminders, 0);
    });

    it("a renewed workspace gets a fresh ladder for its next year", async () => {
      const { org, slug } = await workspace({ supportUntil: at(5 * DAY) });
      await w.reconcile();
      assert.equal(mailsFor(slug).length, 1);
      await w.q(`update public.organizations set support_until = $2 where id = $1`, [org.id, at(370 * DAY)]);
      assert.equal((await w.reconcile()).body.reminders, 0, "a year away: nothing");
      await w.q(`update public.organizations set support_until = $2 where id = $1`, [org.id, at(25 * DAY)]);
      assert.equal((await w.reconcile()).body.reminders, 1, "a month before the new end date");
    });
  });

  /* ───────────────────────────── what the e-mail says ───────────────────────────── */

  describe("what each e-mail says", () => {
    const base = {
      orgName: "Acme Textiles",
      dueAt: "2027-03-10T00:00:00Z",
      locksAt: "2027-03-17T00:00:00Z",
      supportInr: SUPPORT_ANNUAL_INR,
      seats: 3,
      seatInr: 199,
    };

    it("support and logins ending together: one e-mail, both lines, one total", () => {
      const m = reminderMail({ ...base, kind: "t7", scope: "both" })!;
      assert.match(m.body, /3 Sales Team logins/);
      assert.match(m.body, /₹11,988/);
      assert.match(m.body, /₹597/);
      assert.match(m.body, /₹12,585/);
      assert.match(m.body, /renew support alone/i, "tells them support alone is allowed");
      assert.match(m.button, /₹12,585/);
    });

    it("support only: no mention of logins", () => {
      const m = reminderMail({ ...base, seats: 0, kind: "t30", scope: "support" })!;
      assert.doesNotMatch(m.body, /Sales Team/);
      assert.match(m.button, /₹11,988/);
    });

    it("logins only: says the salespeople stop, and that the owner and tours do not", () => {
      const m = reminderMail({ ...base, kind: "Ld2", scope: "logins" })!;
      assert.match(m.subject, /Sales Team logins stop in 5 days/);
      assert.match(m.body, /salespeople are switched off/i);
      assert.match(m.body, /tours and your data keep working/i);
      assert.match(m.button, /₹597/);
    });

    it("the locked notice reassures: tours and data are kept", () => {
      const m = reminderMail({ ...base, seats: 0, kind: "locked", scope: "support" })!;
      assert.match(m.body, /tours and data are kept/i);
    });

    it("the last daily e-mail says it is the last day", () => {
      assert.equal(reminderMail({ ...base, kind: "d6", scope: "support" })!.title, "Last day to renew");
    });

    it("kinds from the database are understood, including the old five-stage ones", () => {
      assert.deepEqual(parseReminderKind("t30"), { stage: "t30", logins: false });
      assert.deepEqual(parseReminderKind("d4"), { stage: "day", day: 4, logins: false });
      assert.deepEqual(parseReminderKind("Ld0"), { stage: "day", day: 0, logins: true });
      assert.deepEqual(parseReminderKind("Llocked"), { stage: "locked", logins: true });
      assert.deepEqual(parseReminderKind("t6"), { stage: "day", day: 6, logins: false });
      assert.equal(parseReminderKind("nonsense"), null);
    });

    it("the e-mail that is actually sent carries the amount for this workspace", async () => {
      const { slug } = await workspace({ supportUntil: at(5 * DAY), seats: 3, seatInr: 199 });
      await w.reconcile();
      const [m] = mailsFor(slug);
      assert.ok(m, "sent");
      assert.match(m.subject, /in a week/i);
      assert.match(m.html, /3 Sales Team logins/);
      assert.match(m.html, /₹12,585/);
    });
  });

  /* ───────────────────────────── you are told, too ───────────────────────────── */

  describe("founder alerts", () => {
    const alerts = async () =>
      (await w.q(`select kind, severity from public.billing_alerts order by created_at`)) as Array<{ kind: string; severity: string }>;

    it("the first day overdue is a warning; the day it locks is critical — one per workspace", async () => {
      const a = await workspace({ slug: "alpha", supportUntil: at(-0.5 * DAY) });
      const b = await workspace({ slug: "bravo", supportUntil: at(-8 * DAY) });
      await w.reconcile();
      const got = await alerts();
      assert.ok(got.some((x) => x.kind === "renewal_overdue:alpha" && x.severity === "warning"), JSON.stringify(got));
      assert.ok(got.some((x) => x.kind === "workspace_locked:bravo" && x.severity === "critical"), JSON.stringify(got));
      assert.ok(a.org.id && b.org.id);
    });

    it("an ordinary reminder (a week before) raises no alert", async () => {
      await workspace({ supportUntil: at(5 * DAY) });
      await w.reconcile();
      assert.equal((await alerts()).length, 0);
    });
  });

  /* ───────────────────────────── logins have their own date ───────────────────────────── */

  describe("Sales Team logins on their own date", () => {
    const loginsState = async (orgId: string) => (await w.q(`select public.org_logins_state_of($1) as s`, [orgId]))[0].s as string;

    it("states: active → in grace → switched off, 7 days after THEIR end date", async () => {
      const cases: Array<[string, number, string]> = [
        ["a month left", 30 * DAY, "active"],
        ["a minute left", 60_000, "active"],
        ["a minute past", -60_000, "nag"],
        ["6 days 23 hours past", -(7 * DAY - 3_600_000), "nag"],
        ["7 days and a minute past", -(7 * DAY + 60_000), "lapsed"],
      ];
      for (const [label, off, want] of cases) {
        await w.reset();
        const { org } = await workspace({ supportUntil: at(300 * DAY), loginsUntil: at(off), seats: 3, seatInr: 199 });
        assert.equal(await loginsState(org.id), want, label);
      }
    });

    it("no end date of its own → follows support", async () => {
      const { org } = await workspace({ supportUntil: at(-3 * DAY), seats: 3, seatInr: 199 });
      assert.equal(await loginsState(org.id), "nag");
    });

    it("logins bought one-time (price 0), none bought, Pro, and closed workspaces are never switched off", async () => {
      const oneOff = await workspace({ slug: "oneoff", supportUntil: at(300 * DAY), loginsUntil: at(-30 * DAY), seats: 3, seatInr: 0 });
      const none = await workspace({ slug: "none", supportUntil: at(300 * DAY), loginsUntil: at(-30 * DAY), seats: 0, seatInr: 199 });
      const pro = await workspace({ slug: "pro", plan: "pro", supportUntil: null, loginsUntil: at(-30 * DAY), seats: 3, seatInr: 199 });
      const closed = await workspace({ slug: "closed", supportUntil: at(300 * DAY), loginsUntil: at(-30 * DAY), seats: 3, seatInr: 199 });
      await w.q(`update public.organizations set plan_status = 'cancelled' where id = $1`, [closed.org.id]);
      for (const x of [oneOff, none, pro, closed]) assert.equal(await loginsState(x.org.id), "none", x.slug);
    });

    it("renewing support alone leaves the logins on their old date; the logins get their own e-mails", async () => {
      const { org, admin, slug } = await workspace({ supportUntil: at(5 * DAY), seats: 3, seatInr: 199 });
      const oldEnd = (await w.q(`select support_until from public.organizations where id = $1`, [org.id]))[0].support_until as string;

      const res = await w.routes.order.POST(
        w.request("/api/billing/order", { as: admin, body: { purpose: "support_renewal", renewLogins: false, buyer: {} } })
      );
      const order = await w.readJson(res);
      assert.equal(res.status, 200, JSON.stringify(order));
      assert.equal(order.amountPaise, toPaise(withGst(SUPPORT_ANNUAL_INR).total), "support alone is charged");
      assert.equal((await w.q(`select renews_logins from public.billing_orders`))[0].renews_logins, false);

      await w.payInBrowser(order);
      assert.equal((await w.poll(order.orderId)).body.status, "ready");
      const [o] = await w.q(`select support_until, sales_seats_until, sales_seats from public.organizations where id = $1`, [org.id]);
      assert.ok(new Date(o.support_until).getTime() > Date.now() + 360 * DAY, "support is renewed for a year");
      assert.equal(new Date(o.sales_seats_until).toISOString(), new Date(oldEnd).toISOString(), "logins stayed on the old date");
      assert.equal(Number(o.sales_seats), 3);

      // 8 days after the old date: the logins stop, the workspace does not.
      await w.q(`update public.organizations set sales_seats_until = $2 where id = $1`, [org.id, at(-8 * DAY)]);
      assert.equal((await w.q(`select public.org_logins_state_of($1) as s`, [org.id]))[0].s, "lapsed");
      assert.equal((await w.q(`select public.org_access_state_of($1) as s`, [org.id]))[0].s, "active", "the workspace itself is fine");

      // …and they are told, in e-mails about the logins only.
      await w.reconcile();
      const subjects = mailsFor(slug).map((m) => m.subject);
      assert.ok(subjects.some((s) => /Sales Team logins have been switched off/i.test(s)), subjects.join(" | "));
      assert.ok(!subjects.some((s) => /workspace is locked/i.test(s)), "the workspace is not locked");
      const al = await w.q(`select kind, severity from public.billing_alerts`);
      assert.ok(al.some((x) => x.kind === `logins_switched_off:${slug}` && x.severity === "critical"), JSON.stringify(al));
    });

    it("renewing with the logins (the default) moves both dates together", async () => {
      const { org, admin } = await workspace({ supportUntil: at(5 * DAY), seats: 3, seatInr: 199 });
      const res = await w.routes.order.POST(w.request("/api/billing/order", { as: admin, body: { purpose: "support_renewal", buyer: {} } }));
      const order = await w.readJson(res);
      assert.equal(order.amountPaise, toPaise(withGst(SUPPORT_ANNUAL_INR + 597).total));
      await w.payInBrowser(order);
      assert.equal((await w.poll(order.orderId)).body.status, "ready");
      const [o] = await w.q(`select support_until, sales_seats_until from public.organizations where id = $1`, [org.id]);
      assert.equal(new Date(o.support_until).toISOString(), new Date(o.sales_seats_until).toISOString());
    });

    it("a workspace with no paid logins ignores renewLogins and charges support only", async () => {
      const { admin } = await workspace({ supportUntil: at(5 * DAY) });
      const res = await w.routes.order.POST(
        w.request("/api/billing/order", { as: admin, body: { purpose: "support_renewal", renewLogins: true, buyer: {} } })
      );
      assert.equal((await w.readJson(res)).amountPaise, toPaise(withGst(SUPPORT_ANNUAL_INR).total));
    });

    it("unpaid logins ARE e-mailed on their own ladder while support is fine", async () => {
      const { slug } = await workspace({ supportUntil: at(300 * DAY), loginsUntil: at(5 * DAY), seats: 3, seatInr: 199 });
      const r = await w.reconcile();
      assert.equal(r.body.reminders, 1, JSON.stringify(r.body));
      const [m] = mailsFor(slug);
      assert.match(m.subject, /Sales Team logins renew in a week/i);
      assert.doesNotMatch(m.html, /Support, hosting/);
    });

    it("what the signed-in person is told: a salesperson of a lapsed workspace sees 'lapsed'; the owner never does", async () => {
      const { org, admin } = await workspace({ supportUntil: at(300 * DAY), loginsUntil: at(-9 * DAY), seats: 3, seatInr: 199 });
      const rep = await salesperson(org.id, 1);
      const owner = await w.seedUser({ email: "owner@vpv.in", role: "owner", orgId: org.id });
      const ask = async (sub: string) =>
        ((await w.sb.as("authenticated", sub).rpc("my_org_access_state", {})).data as Array<Record<string, unknown>>)[0];
      assert.equal((await ask(rep)).logins_state, "lapsed");
      assert.equal((await ask(rep)).state, "active", "the workspace is open; only this login is off");
      assert.equal((await ask(admin)).logins_state, "lapsed", "the admin sees why their team is off");
      assert.equal((await ask(owner)).logins_state, "none");
    });
  });

  /* ───────────────────────────── switched off for real ───────────────────────────── */

  describe("a switched-off salesperson is stopped by the database", () => {
    const readClients = async (sub: string) => {
      const r = await w.sb.as("authenticated", sub).run(`select * from public.clients`, []);
      return r.rows.length;
    };

    it("cannot read or write client records; the admin and active teams can", async () => {
      const dead = await workspace({ slug: "dead", supportUntil: at(300 * DAY), loginsUntil: at(-9 * DAY), seats: 2, seatInr: 199 });
      const live = await workspace({ slug: "live", supportUntil: at(300 * DAY), loginsUntil: at(100 * DAY), seats: 2, seatInr: 199 });
      const deadRep = await salesperson(dead.org.id, 1);
      const liveRep = await salesperson(live.org.id, 2);
      await w.q(`insert into public.clients (presenter_user_id, org_id, name) values ($1,$2,'A'), ($3,$4,'B')`, [
        deadRep,
        dead.org.id,
        liveRep,
        live.org.id,
      ]);
      assert.equal(await readClients(deadRep), 0, "switched off: sees nothing");
      assert.equal(await readClients(liveRep), 2, "paid up: works as before");
      assert.equal(await readClients(dead.admin), 2, "the admin of the lapsed company still sees its records");
      let refused = false;
      try {
        await w.sb.as("authenticated", deadRep).run(`insert into public.clients (presenter_user_id, org_id, name) values ($1,$2,'X')`, [deadRep, dead.org.id]);
      } catch {
        refused = true;
      }
      assert.ok(refused, "cannot write either");
    });

    it("renewing switches them straight back on", async () => {
      const { org } = await workspace({ supportUntil: at(300 * DAY), loginsUntil: at(-9 * DAY), seats: 2, seatInr: 199 });
      const rep = await salesperson(org.id, 1);
      await w.q(`insert into public.clients (presenter_user_id, org_id, name) values ($1,$2,'A')`, [rep, org.id]);
      assert.equal(await readClients(rep), 0);
      await w.q(`update public.organizations set sales_seats_until = $2 where id = $1`, [org.id, at(300 * DAY)]);
      assert.equal(await readClients(rep), 1);
    });
  });

  /* ───────────────────────────── you cannot add more than you paid for ───────────────────────────── */

  describe("the cap on salespeople", () => {
    const addRep = async (orgId: string, n: number) => {
      try {
        await salesperson(orgId, n);
        return "ok";
      } catch (e) {
        return /sales_logins_full/.test((e as Error).message) ? "full" : (e as Error).message;
      }
    };

    it("allows exactly the number of logins that were paid for, then refuses", async () => {
      const { org } = await workspace({ seats: 2, seatInr: 199 });
      assert.equal(await addRep(org.id, 1), "ok");
      assert.equal(await addRep(org.id, 2), "ok");
      assert.equal(await addRep(org.id, 3), "full");
    });

    it("holds when an existing profile is moved into the workspace or made a salesperson", async () => {
      const { org } = await workspace({ seats: 1, seatInr: 199 });
      await salesperson(org.id, 1);
      const stray = await w.seedUser({ email: "stray@x.in", role: "org_admin", orgId: null });
      await assert.rejects(() => w.q(`update public.profiles set org_id = $2, role = 'presenter' where id = $1`, [stray, org.id]), /sales_logins_full/);
      const admin2 = await w.seedUser({ email: "admin2@x.in", role: "org_admin", orgId: org.id });
      await assert.rejects(() => w.q(`update public.profiles set role = 'presenter' where id = $1`, [admin2]), /sales_logins_full/);
    });

    it("does not count admins, and changing someone's name is not a new login", async () => {
      const { org } = await workspace({ seats: 1, seatInr: 199 });
      await w.seedUser({ email: "a2@x.in", role: "org_admin", orgId: org.id });
      const rep = await salesperson(org.id, 1);
      await w.q(`update public.profiles set full_name = 'Renamed' where id = $1`, [rep]);
    });

    it("a workspace that never bought logins, and Pro, are not capped", async () => {
      const none = await workspace({ slug: "none", seats: 0, seatInr: null });
      const pro = await workspace({ slug: "pro", plan: "pro", supportUntil: null, seats: 0, seatInr: null });
      for (let i = 1; i <= 4; i++) {
        assert.equal(await addRep(none.org.id, i), "ok");
        assert.equal(await addRep(pro.org.id, i), "ok");
      }
    });

    it("a lapsed login still counts against the cap (they cannot add people while switched off)", async () => {
      const { org } = await workspace({ loginsUntil: at(-30 * DAY), seats: 1, seatInr: 199 });
      assert.equal(await addRep(org.id, 1), "ok");
      assert.equal(await addRep(org.id, 2), "full");
    });

    it("the sign-up page asks first, so a full workspace does not use up an invite code", async () => {
      const { org } = await workspace({ seats: 1, seatInr: 199 });
      await w.q(`insert into public.invite_codes (code, org_id, max_uses) values ('ROOM0001', $1, 5)`, [org.id]);
      const room = async () => (await w.sb.as("authenticated").rpc("invite_code_has_room", { p_code: " room0001 " })).data;
      assert.equal(await room(), true);
      await salesperson(org.id, 1);
      assert.equal(await room(), false);
      assert.equal((await w.sb.as("authenticated").rpc("invite_code_has_room", { p_code: "NOSUCH" })).data, true, "unknown codes are the redeemer's problem, not this check's");
    });
  });

  /* ───────────────────────────── the admin board ───────────────────────────── */

  describe("admin_renewals_overview", () => {
    it("shows every Basic workspace with its stage, and only to the platform owner", async () => {
      await workspace({ slug: "locked", supportUntil: at(-9 * DAY), seats: 2, seatInr: 199 });
      await workspace({ slug: "grace", supportUntil: at(-2 * DAY) });
      await workspace({ slug: "due1", supportUntil: at(0.5 * DAY) });
      await workspace({ slug: "due7", supportUntil: at(5 * DAY) });
      await workspace({ slug: "due30", supportUntil: at(20 * DAY) });
      await workspace({ slug: "fine", supportUntil: at(200 * DAY) });
      await workspace({ slug: "pro", plan: "pro", supportUntil: null });
      const owner = await w.seedUser({ email: "owner@vpv.in", role: "owner" });
      const stranger = await w.seedUser({ email: "s@x.in", role: "org_admin" });

      const rows = (await w.sb.as("authenticated", owner).rpc("admin_renewals_overview", {})).data as Array<Record<string, unknown>>;
      const stage = Object.fromEntries(rows.map((r) => [r.slug, r.support_stage]));
      assert.deepEqual(stage, { locked: "locked", grace: "grace", due1: "due_1", due7: "due_7", due30: "due_30", fine: "ok" });

      const theirs = (await w.sb.as("authenticated", stranger).rpc("admin_renewals_overview", {})).data as unknown[];
      assert.equal(theirs?.length ?? 0, 0);
      const anon = await w.sb.as("anon").rpc("admin_renewals_overview", {});
      assert.ok(anon.error || !(anon.data as unknown[])?.length);
    });

    it("reports how many salespeople are in use against how many were paid for, and the last reminder sent", async () => {
      const { org, slug } = await workspace({ supportUntil: at(5 * DAY), seats: 3, seatInr: 199 });
      await salesperson(org.id, 1);
      await salesperson(org.id, 2);
      await w.reconcile();
      const owner = await w.seedUser({ email: "owner@vpv.in", role: "owner" });
      const [r] = ((await w.sb.as("authenticated", owner).rpc("admin_renewals_overview", {})).data as Array<Record<string, unknown>>).filter(
        (x) => x.slug === slug
      );
      assert.equal(Number(r.salespeople), 2);
      assert.equal(Number(r.sales_seats), 3);
      assert.equal(r.last_reminder, "t7");
    });
  });

  /* ───────────────────────────── the claim function is internal ───────────────────────────── */

  describe("who may call what", () => {
    it("the reminder claim, the logins check and the renewal step are service-role only", async () => {
      const { org } = await workspace();
      for (const [fn, args] of [
        ["billing_claim_support_reminders", {}],
        ["org_logins_state_of", { p_org: org.id }],
        ["billing_apply_support_renewal", { p_order: org.id }],
      ] as const) {
        for (const role of ["anon", "authenticated"] as const) {
          const r = await w.sb.as(role).rpc(fn, args as Record<string, unknown>);
          assert.ok(r.error, `${fn} must refuse ${role}`);
        }
      }
    });
  });
});
