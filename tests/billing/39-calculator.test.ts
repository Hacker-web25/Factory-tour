/**
 * The /why-vpv calculator's autosave, and the owner's report of it.
 *
 * A visitor moves the sliders; a moment later the numbers they settled on are
 * saved as `calculator_used`. The owner then sees every visitor ranked by how
 * big a business they typed in, with a name when we know one.
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EVENT_NAME_SET } from "@/lib/analytics/signals";
import {
  CALC_DEFAULTS,
  SIZE_BANDS,
  calcFigures,
  inputsFromMeta,
  metaFromInputs,
  sizeBand,
} from "@/lib/whyVpvCalc";
import { calculatorReport } from "@/lib/calculatorReport";
import { describeEvent } from "@/lib/personJourney";
import { makeWorld, freshIp, type World } from "./harness/world";
import { VISITOR_HEADER } from "@/lib/analytics/attribution";

const CRORE = 1_00_00_000;

describe("the calculator's arithmetic", () => {
  it("matches what the page has always shown", () => {
    const f = calcFigures(CALC_DEFAULTS); // 120 leads × ₹10 lakh, 10%, +5 points
    assert.equal(f.opportunity, 12 * CRORE);
    assert.equal(f.won, 1.2 * CRORE);
    assert.equal(f.lost, 10.8 * CRORE);
    assert.equal(f.recovered, 0.6 * CRORE);
    assert.equal(f.newConv, 15);
  });

  it("never lifts conversion past 100%", () => {
    const f = calcFigures({ leads: 100, valueLakh: 1, conv: 95, lift: 30 });
    assert.equal(f.liftApplied, 5);
    assert.equal(f.newConv, 100);
  });

  it("puts a size on the business", () => {
    assert.equal(sizeBand(50_00_000).key, "small");
    assert.equal(sizeBand(CRORE).key, "mid");
    assert.equal(sizeBand(12 * CRORE).key, "large");
    assert.equal(sizeBand(80 * CRORE).key, "major");
    assert.equal(SIZE_BANDS.length, 4);
  });

  it("refuses stored numbers outside what the page allows", () => {
    assert.ok(inputsFromMeta(metaFromInputs(CALC_DEFAULTS)));
    assert.equal(inputsFromMeta({ ...metaFromInputs(CALC_DEFAULTS), leads: 10_000_000 }), null);
    assert.equal(inputsFromMeta({ ...metaFromInputs(CALC_DEFAULTS), conv: 0 }), null);
    assert.equal(inputsFromMeta({ leads: 5 }), null);
    assert.equal(inputsFromMeta(null), null);
  });
});

describe("the page really saves, and the server will store it", () => {
  const src = readFileSync(join(process.cwd(), "components/site/WhyVpv.tsx"), "utf8");
  it("sends calculator_used, which the server allowlists", () => {
    assert.match(src, /track\(\s*"calculator_used"/);
    assert.ok(EVENT_NAME_SET.has("calculator_used"));
  });
  it("waits for the slider to rest, and saves on the way out", () => {
    assert.match(src, /SAVE_AFTER_MS/);
    assert.match(src, /pagehide/);
    assert.match(src, /visibilitychange/);
  });
});

describe("the owner's report", () => {
  const ev = (visitor_id: string, at: string, over: Record<string, number> = {}) => ({
    visitor_id,
    created_at: at,
    meta: metaFromInputs({ ...CALC_DEFAULTS, ...over }),
  });

  it("ranks visitors by the size they typed, using their last numbers", () => {
    const { rows, summary } = calculatorReport(
      [
        ev("a", "2026-11-05T10:00:00Z", { leads: 50 }),
        ev("a", "2026-11-05T10:00:40Z", { leads: 400, valueLakh: 25 }), // ₹100 crore
        ev("b", "2026-11-05T11:00:00Z", { leads: 30, valueLakh: 5 }), // ₹1.5 crore
        ev("c", "2026-11-05T12:00:00Z", { leads: 10, valueLakh: 2 }), // ₹20 lakh
      ],
      [],
      [],
      []
    );
    assert.deepEqual(rows.map((r) => r.visitorId), ["a", "b", "c"]);
    assert.equal(rows[0]!.opportunity, 100 * CRORE);
    assert.equal(rows[0]!.saves, 2);
    assert.equal(rows[0]!.playedSeconds, 40);
    assert.deepEqual(summary.bands.map((b) => b.count), [1, 1, 0, 1]);
    assert.equal(summary.medianOpportunity, 1.5 * CRORE);
    assert.equal(summary.visitors, 3);
  });

  it("does not count somebody who never moved a slider", () => {
    const { rows } = calculatorReport([ev("a", "2026-11-05T10:00:00Z")], [], [], []);
    assert.equal(rows.length, 0);
  });

  it("recomputes the size and ignores a forged one", () => {
    const forged = { visitor_id: "a", created_at: "2026-11-05T10:00:00Z", meta: { ...metaFromInputs({ ...CALC_DEFAULTS, leads: 10 }), opportunity: 9e15 } };
    const { rows } = calculatorReport([forged], [], [], []);
    assert.equal(rows[0]!.opportunity, 1 * CRORE);
  });

  it("drops events whose numbers are out of range", () => {
    const bad = { visitor_id: "a", created_at: "2026-11-05T10:00:00Z", meta: { ...metaFromInputs(CALC_DEFAULTS), leads: 9e9 } };
    assert.equal(calculatorReport([bad], [], [], []).rows.length, 0);
  });

  it("puts a name to a visitor from an enquiry, or from a personal QR", () => {
    const { rows } = calculatorReport(
      [ev("a", "2026-11-05T10:00:00Z", { leads: 20 }), ev("b", "2026-11-05T10:05:00Z", { leads: 30 }), ev("c", "2026-11-05T10:06:00Z", { leads: 40 })],
      [
        { visitor_id: "b", first_source: null, first_code: "GGN-K4F9X2", city: "Gurugram" },
        { visitor_id: "c", first_source: "google", first_code: null, city: "Pune" },
      ],
      [{ visitor_id: "a", name: "Meera Shah", company: "Shah Castings", phone: "9810000000", email: null, stage: "plan", factory_city: "Rajkot" }],
      [{ code: "ggn-k4f9x2", person_name: "Aryan", person_company: "Acme Pumps" }]
    );
    const by = Object.fromEntries(rows.map((r) => [r.visitorId, r]));
    assert.equal(by.a!.name, "Meera Shah");
    assert.equal(by.a!.knownFrom, "enquiry");
    assert.equal(by.a!.city, "Rajkot");
    assert.equal(by.b!.name, "Aryan");
    assert.equal(by.b!.company, "Acme Pumps");
    assert.equal(by.b!.knownFrom, "qr");
    assert.equal(by.c!.name, null);
    assert.equal(by.c!.source, "google");
  });

  it("reads as one line in a person's journey", () => {
    const d = describeEvent({ name: "calculator_used", path: "/why-vpv", meta: metaFromInputs({ ...CALC_DEFAULTS, leads: 400, valueLakh: 25 }) });
    assert.equal(d?.title, "Tried the Why VPV calculator");
    assert.match(d?.detail ?? "", /400 leads/);
    assert.match(d?.detail ?? "", /100 crore/);
  });
});

describe("saving and reading it back through the real routes", () => {
  let w: World;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let track: any, report: any;
  let ownerId: string;
  const VID = "44444444-4444-4444-8444-444444444444";

  before(async () => {
    w = await makeWorld();
    ownerId = await w.seedUser({ email: "owner@vpv.in", role: "owner" });
    track = await import("@/app/api/track/route");
    report = await import("@/app/api/admin/marketing/calculator/route");
  });
  after(async () => w.reset?.());
  beforeEach(async () => {
    await w.q("delete from public.site_events");
    await w.q("delete from public.site_visitors");
    await w.q("delete from public.funnel_leads");
  });

  const post = (body: unknown, vid: string | null = VID) =>
    track.POST(w.request("/api/track", { body, ip: freshIp(), headers: vid ? { [VISITOR_HEADER]: vid } : {} }));

  it("stores a save and shows it to the owner, biggest first", async () => {
    await post({ name: "calculator_used", path: "/why-vpv", meta: metaFromInputs({ ...CALC_DEFAULTS, leads: 400, valueLakh: 25 }, { field: "leads", saves: 1 }) });
    await post({ name: "calculator_used", path: "/why-vpv", meta: metaFromInputs({ ...CALC_DEFAULTS, leads: 10 }) }, "55555555-5555-4555-8555-555555555555");
    const stored = await w.q(`select name, path, meta from public.site_events order by id`);
    assert.equal(stored.length, 2);
    assert.equal(stored[0].meta.leads, 400);
    assert.equal(stored[0].meta.field, "leads");

    const res = await report.GET(w.request("/api/admin/marketing/calculator", { method: "GET", as: ownerId }));
    const body = await w.readJson(res);
    assert.equal(res.status, 200);
    assert.equal(body.rows.length, 2);
    assert.equal(body.rows[0].opportunity, 100 * CRORE);
    assert.equal(body.rows[0].visitorId, VID);
    assert.equal(body.summary.visitors, 2);
  });

  it("names the visitor once they have filled in the enquiry", async () => {
    await post({ name: "calculator_used", path: "/why-vpv", meta: metaFromInputs({ ...CALC_DEFAULTS, leads: 200 }) });
    await w.q(`insert into public.funnel_leads (visitor_id, name, company, phone) values ($1, 'Meera Shah', 'Shah Castings', '9810000000')`, [VID]);
    const res = await report.GET(w.request("/api/admin/marketing/calculator", { method: "GET", as: ownerId }));
    const body = await w.readJson(res);
    assert.equal(body.rows[0].name, "Meera Shah");
    assert.equal(body.rows[0].company, "Shah Castings");
    assert.equal(body.summary.identified, 1);
  });

  it("is for the owner only", async () => {
    const customer = await w.seedUser({ email: "c@x.in", role: "org_admin" });
    const res = await report.GET(w.request("/api/admin/marketing/calculator", { method: "GET", as: customer }));
    assert.equal(res.status, 403);
  });

  it("drops a save from a visitor who declined measurement", async () => {
    await track.POST(
      w.request("/api/track", {
        body: { name: "calculator_used", path: "/why-vpv", meta: metaFromInputs({ ...CALC_DEFAULTS, leads: 200 }) },
        ip: freshIp(),
        headers: { [VISITOR_HEADER]: VID, cookie: "vpv_no_analytics=1" },
      })
    );
    assert.equal((await w.q(`select count(*)::int n from public.site_events`))[0].n, 0);
  });
});
