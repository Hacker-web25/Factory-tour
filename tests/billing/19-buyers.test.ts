/**
 * Personal QR codes and the per-buyer report.
 *
 * One QR is made for each buyer. When a buyer scans theirs, the owner needs
 * to see who opened it, what they read, for how long, and how far they got.
 * The rules worth pinning down:
 *
 *   • codes are random and never contain a name (the code is shared with
 *     Google and Microsoft; the name must stay in our own database);
 *   • a batch never reuses a code, and a pasted list becomes exactly the
 *     people in it;
 *   • "opened" is decided by the server-side scan, not by a script the
 *     visitor may block, while time and reading depth come from the page;
 *   • a buyer is hot only on real signals, and the ranking puts the people
 *     worth calling first.
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  CODE_ALPHABET,
  cleanPrefix,
  makeCodes,
  parsePeople,
  peopleCsv,
  personLabel,
} from "@/lib/personCodes";
import {
  buyerJourney,
  buyerReport,
  buyerSummary,
  formatDuration,
  pageLabel,
  pagePath,
  type BuyerEventRow,
  type BuyerLeadRow,
  type PersonCodeRow,
} from "@/lib/buyerReport";
import { makeWorld, freshIp, type World } from "./harness/world";
import { VISITOR_HEADER } from "@/lib/analytics/attribution";

/* ─────────────────────────────── codes ─────────────────────────────── */

describe("pasted list → people", () => {
  it("takes a name, with a company after a comma, tab, pipe or semicolon", () => {
    const { people } = parsePeople("Aryan, Acme Pumps\nMeera Shah\tShah Castings\nR. Kulkarni | Kulkarni Forge\nSolo;Solo Ltd");
    assert.deepEqual(people, [
      { name: "Aryan", company: "Acme Pumps" },
      { name: "Meera Shah", company: "Shah Castings" },
      { name: "R. Kulkarni", company: "Kulkarni Forge" },
      { name: "Solo", company: "Solo Ltd" },
    ]);
  });

  it("ignores blank lines and Windows line endings, and keeps a name with no company", () => {
    const { people } = parsePeople("\r\nAryan\r\n\r\n  \r\nMeera\r\n");
    assert.deepEqual(people, [
      { name: "Aryan", company: null },
      { name: "Meera", company: null },
    ]);
  });

  it("keeps two people with the same name as two people", () => {
    assert.equal(parsePeople("Aryan\nAryan").people.length, 2);
  });

  it("says how many lines were past the cap instead of dropping them silently", () => {
    const r = parsePeople("a\nb\nc\nd\ne", 3);
    assert.equal(r.people.length, 3);
    assert.equal(r.overflow, 2);
  });

  it("copes with anything that is not text", () => {
    assert.deepEqual(parsePeople(undefined), { people: [], overflow: 0 });
    assert.deepEqual(parsePeople(42), { people: [], overflow: 0 });
  });

  it("labels a person the way the owner will look for them", () => {
    assert.equal(personLabel({ name: "Aryan", company: "Acme Pumps" }), "Aryan · Acme Pumps");
    assert.equal(personLabel({ name: "Aryan", company: null }), "Aryan");
  });
});

describe("the codes themselves", () => {
  it("are PREFIX-XXXXXX, from an alphabet with no look-alike characters", () => {
    const codes = makeCodes(300, "GGN", new Set());
    for (const c of codes) {
      assert.match(c, /^GGN-[A-Z0-9]{6}$/);
      for (const ch of c.slice(4)) assert.ok(CODE_ALPHABET.includes(ch), `${ch} is not in the alphabet`);
    }
    assert.equal(/[01OIL]/.test(CODE_ALPHABET), false, "no 0, 1, O, I or L");
  });

  it("are never repeated, and never reuse one already in use (in any letter case)", () => {
    const taken = new Set(["GGN-AAAAAA"]);
    let calls = 0;
    // First draw would be GGN-AAAAAA (taken); then it moves on.
    const rnd = () => (calls++ < 6 ? 0 : 0.5);
    const [code] = makeCodes(1, "GGN", taken, rnd);
    assert.notEqual(code, "GGN-AAAAAA");
    const batch = makeCodes(2000, "P", new Set());
    assert.equal(new Set(batch.map((c) => c.toUpperCase())).size, 2000);
  });

  it("add themselves to the taken set, so two batches in a row cannot collide", () => {
    const taken = new Set<string>();
    const a = makeCodes(500, "P", taken);
    const b = makeCodes(500, "P", taken);
    assert.equal(new Set([...a, ...b]).size, 1000);
  });

  it("contain no part of the name, whatever the name is", () => {
    const people = parsePeople("Aryan Bansal, Acme Pumps").people;
    const [code] = makeCodes(people.length, "P", new Set());
    assert.equal(/aryan|bansal|acme|pumps/i.test(code!), false);
  });

  it("gives up with an error, not an endless loop, when nothing is left", () => {
    const all = new Set<string>();
    assert.throws(() => makeCodes(2, "P", all, () => 0), /enough unused codes/);
  });

  it("makes a usable prefix from anything", () => {
    assert.equal(cleanPrefix("ggn"), "GGN");
    assert.equal(cleanPrefix(" g g-n! "), "GGN");
    assert.equal(cleanPrefix(""), "P");
    assert.equal(cleanPrefix(undefined), "P");
    assert.equal(cleanPrefix("abcdefghijklmnop").length, 10);
  });
});

describe("the CSV for the QR tool", () => {
  it("has one row per person, with quoting where a comma needs it", () => {
    const csv = peopleCsv([
      { name: "Aryan", company: 'Acme, "Pumps"', code: "P-ABC234", url: "https://myvpv.com/q/P-ABC234" },
      { name: "Meera", company: null, code: "P-DEF567", url: "https://myvpv.com/q/P-DEF567" },
    ]);
    assert.equal(
      csv,
      'name,company,code,link\nAryan,"Acme, ""Pumps""",P-ABC234,https://myvpv.com/q/P-ABC234\nMeera,,P-DEF567,https://myvpv.com/q/P-DEF567\n'
    );
  });

  it("cannot be turned into a spreadsheet formula by a name", () => {
    const csv = peopleCsv([{ name: "=HYPERLINK(\"http://evil\")", company: "+cmd", code: "P-X", url: "u" }]);
    const row = csv.split("\n")[1]!;
    assert.ok(row.startsWith("\"'=HYPERLINK"), row);
    assert.ok(row.includes(",'+cmd,"), row);
  });
});

/* ───────────────────────────── the report ──────────────────────────── */

const T0 = Date.parse("2026-10-26T10:00:00Z");
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();
const person = (code: string, name: string, company: string | null = null): PersonCodeRow => ({
  code,
  person_name: name,
  person_company: company,
  campaign: "gurugram-oct26",
  created_at: at(-60),
});
const ev = (
  visitor: string,
  min: number,
  name: string,
  path: string | null,
  meta: Record<string, unknown> | null = null,
  session: string | null = "s-" + visitor
): BuyerEventRow => ({ visitor_id: visitor, session_id: session, name, path, created_at: at(min), meta });

const lead = (o: Partial<BuyerLeadRow>): BuyerLeadRow => ({
  visitor_id: null,
  campaign_code: null,
  name: null,
  company: null,
  phone: null,
  email: null,
  stage: "info",
  chosen_plan: null,
  recommended_plan: null,
  quoted_total_inr: null,
  factory_city: null,
  industry: null,
  order_id: null,
  ...o,
});

describe("what each buyer did", () => {
  const people = [
    person("P-AAAAAA", "Aryan", "Acme Pumps"),
    person("P-BBBBBB", "Meera", "Shah Castings"),
    person("P-CCCCCC", "Ravi", "Kulkarni Forge"),
    person("P-DDDDDD", "Sunita", "Desai Tools"),
    person("P-EEEEEE", "Imran", "Khan Fabrication"),
  ];

  const visitors = [
    { visitor_id: "va", first_code: "P-AAAAAA", first_seen_at: at(0), last_seen_at: at(6), city: "Gurugram" },
    { visitor_id: "vc", first_code: "P-CCCCCC", first_seen_at: at(10), last_seen_at: at(30), city: "Pune" },
    // Imran saw the site from Google first, then scanned his own code later.
    { visitor_id: "ve", first_code: null, first_seen_at: at(-500), last_seen_at: at(100), city: null },
    // Sunita's browser arrived by P-DDDDDD but nothing was recorded (scripts blocked).
    { visitor_id: "vd", first_code: "P-DDDDDD", first_seen_at: at(20), last_seen_at: at(20), city: null },
  ];

  const scans = [
    { code: "P-AAAAAA", visitor_id: "va", created_at: at(0) },
    { code: "P-AAAAAA", visitor_id: "va", created_at: at(5) },
    { code: "P-CCCCCC", visitor_id: "vc", created_at: at(10) },
    { code: "P-DDDDDD", visitor_id: "vd", created_at: at(20) },
    { code: "p-eeeeee", visitor_id: "ve", created_at: at(100) }, // wrong case, still his
  ];

  const events: BuyerEventRow[] = [
    // Aryan: Home 20s, Plans 125s (read 90%), Case studies 80s.
    ev("va", 0, "page_view", "/"),
    ev("va", 1, "page_time", "/", { seconds: 20, scroll: 40 }),
    ev("va", 1, "page_view", "/plans?utm_source=pamphlet"),
    ev("va", 3, "page_time", "/plans", { seconds: 125, scroll: 90 }),
    ev("va", 3, "page_view", "/case-studies"),
    ev("va", 5, "page_time", "/case-studies", { seconds: 80, scroll: 60 }),
    // Ravi: reached the bill and paid.
    ev("vc", 10, "page_view", "/"),
    ev("vc", 11, "page_time", "/", { seconds: 15, scroll: 30 }),
    ev("vc", 12, "page_view", "/assessment/billing"),
    ev("vc", 14, "page_time", "/assessment/billing", { seconds: 200, scroll: 100 }),
    // Imran: a single page view, no time.
    ev("ve", 100, "page_view", "/"),
  ];

  const leads = [
    lead({
      visitor_id: "vc",
      name: "Ravi Kulkarni",
      company: "Kulkarni Forge",
      phone: "+919800000001",
      stage: "paid",
      chosen_plan: "authority",
      quoted_total_inr: 120000,
      order_id: "o1",
      factory_city: "Pune",
    }),
  ];

  const orders = [{ id: "o1", amount_paise: 12_000_000, status: "paid" }];

  const rows = buyerReport({ people, visitors, events, scans, leads, orders });
  const by = (code: string) => rows.find((r) => r.code === code)!;

  it("counts scans and browsers separately, and finds a scan typed in the wrong case", () => {
    assert.equal(by("P-AAAAAA").scans, 2);
    assert.equal(by("P-AAAAAA").visitors, 1);
    assert.equal(by("P-EEEEEE").scans, 1);
    assert.equal(by("P-EEEEEE").visitors, 1, "his browser belongs to him even though Google came first");
  });

  it("adds up the time actually spent, page by page", () => {
    const a = by("P-AAAAAA");
    assert.equal(a.activeSeconds, 225);
    assert.deepEqual(
      a.pages.map((p) => [p.label, p.seconds, p.scroll]),
      [
        ["Plans & pricing", 125, 90],
        ["Case studies", 80, 60],
        ["Home", 20, 40],
      ]
    );
    assert.equal(a.topPage?.label, "Plans & pricing", "?utm_source does not make it a different page");
    assert.equal(a.pageViews, 3);
  });

  it("calls a buyer who read pricing and a case study warm, not hot", () => {
    assert.equal(by("P-AAAAAA").interest, "warm");
  });

  it("calls a buyer who paid hot, with their money and details", () => {
    const c = by("P-CCCCCC");
    assert.equal(c.interest, "hot");
    assert.equal(c.paid, true);
    assert.equal(c.revenueInr, 120000);
    assert.equal(c.lead?.plan, "authority");
    assert.equal(c.lead?.phone, "+919800000001");
    assert.equal(c.city, "Pune");
  });

  it("calls a buyer who only scanned 'opened', even with no page activity at all", () => {
    const d = by("P-DDDDDD");
    assert.equal(d.interest, "opened");
    assert.equal(d.activeSeconds, 0);
    assert.equal(d.visits, 1);
    assert.equal(by("P-EEEEEE").interest, "opened");
  });

  it("calls a buyer nobody has scanned 'not opened'", () => {
    const b = by("P-BBBBBB");
    assert.equal(b.interest, "not_opened");
    assert.equal(b.visits, 0);
    assert.equal(b.firstOpenedAt, null);
  });

  it("puts the people worth calling first", () => {
    // Hot (paid), then warm (read pricing), then the two who only opened
    // (alphabetical when nothing else separates them), then nobody.
    assert.deepEqual(
      rows.map((r) => r.code),
      ["P-CCCCCC", "P-AAAAAA", "P-EEEEEE", "P-DDDDDD", "P-BBBBBB"]
    );
  });

  it("opens a buyer's story with when they first opened it", () => {
    assert.equal(by("P-AAAAAA").firstOpenedAt, at(0));
    assert.equal(by("P-EEEEEE").firstOpenedAt, at(100));
  });

  it("ignores another person's lead and a lead that has not paid", () => {
    const r = buyerReport({
      people,
      visitors,
      events,
      scans,
      leads: [lead({ visitor_id: "va", stage: "scope", name: "Aryan B" }), lead({ visitor_id: "zz", stage: "billing" })],
      orders: [],
    });
    const a = r.find((x) => x.code === "P-AAAAAA")!;
    assert.equal(a.lead?.name, "Aryan B");
    assert.equal(a.paid, false);
    assert.equal(a.interest, "warm", "started the assessment but not past choosing a plan");
    assert.equal(r.filter((x) => x.lead).length, 1);
  });

  it("finds a lead by the code stamped on it, even without the browser", () => {
    const r = buyerReport({
      people,
      visitors: [],
      events: [],
      scans: [],
      leads: [lead({ campaign_code: "p-bbbbbb", stage: "plan", name: "Meera S" })],
      orders: [],
    });
    const b = r.find((x) => x.code === "P-BBBBBB")!;
    assert.equal(b.lead?.name, "Meera S");
    assert.equal(b.interest, "hot", "got as far as choosing a plan");
  });

  it("caps a single absurd reading so one open tab cannot swamp the average", () => {
    const r = buyerReport({
      people: [person("P-AAAAAA", "Aryan")],
      visitors: [],
      events: [ev("va", 0, "page_time", "/", { seconds: 999999, scroll: 500 })],
      scans: [{ code: "P-AAAAAA", visitor_id: "va", created_at: at(0) }],
      leads: [],
      orders: [],
    });
    assert.equal(r[0]!.activeSeconds, 1800);
    assert.equal(r[0]!.pages[0]!.scroll, 100);
  });
});

describe("the batch summary", () => {
  it("tells the owner how many opened, what held attention, and the average stay", () => {
    const people = [person("P-A", "A"), person("P-B", "B"), person("P-C", "C"), person("P-D", "D")];
    const rows = buyerReport({
      people,
      visitors: [],
      events: [
        ev("va", 0, "page_time", "/plans", { seconds: 100, scroll: 50 }),
        ev("vb", 0, "page_time", "/plans", { seconds: 60, scroll: 50 }),
        ev("vb", 1, "page_time", "/faq", { seconds: 20, scroll: 50 }),
      ],
      scans: [
        { code: "P-A", visitor_id: "va", created_at: at(0) },
        { code: "P-B", visitor_id: "vb", created_at: at(0) },
        { code: "P-C", visitor_id: "vc", created_at: at(0) },
      ],
      leads: [],
      orders: [],
    });
    const s = buyerSummary(rows);
    assert.equal(s.people, 4);
    assert.equal(s.opened, 3);
    assert.equal(s.openedPct, 75);
    assert.equal(s.avgSeconds, 90, "(100 + 80) / 2: only people with time recorded");
    assert.equal(s.topPages[0]!.label, "Plans & pricing");
    assert.equal(s.topPages[0]!.seconds, 160);
    assert.equal(s.topPages[0]!.people, 2);
  });

  it("is all zeros, not a crash, for an empty batch", () => {
    const s = buyerSummary([]);
    assert.deepEqual([s.people, s.opened, s.openedPct, s.avgSeconds], [0, 0, 0, 0]);
  });
});

describe("one visit as a timeline", () => {
  it("lists each page in order, with how long they stayed and how far they read", () => {
    const j = buyerJourney([
      ev("v", 3, "page_view", "/case-studies"),
      ev("v", 0, "page_view", "/"),
      ev("v", 1, "page_time", "/", { seconds: 20, scroll: 40 }),
      ev("v", 2, "funnel_step", "/assessment", { step: "scope" }),
      ev("v", 5, "page_time", "/case-studies", { seconds: 80, scroll: 60 }),
      ev("v", 6, "page_time", "/case-studies", { seconds: 10, scroll: 100 }),
    ]);
    assert.deepEqual(
      j.map((x) => [x.label, x.seconds, x.scroll]),
      [
        ["Home", 20, 40],
        ["Reached the “scope” step of the assessment", null, null],
        ["Case studies", 90, 100],
      ]
    );
  });

  it("does not invent a time for a page that has none", () => {
    const j = buyerJourney([ev("v", 0, "page_view", "/faq")]);
    assert.equal(j[0]!.seconds, null);
  });
});

describe("small helpers", () => {
  it("treats a query string or trailing slash as the same page", () => {
    assert.equal(pagePath("/plans/?utm_source=x#top"), "/plans");
    assert.equal(pagePath("/?vpv=ABC"), "/");
    assert.equal(pagePath(null), "/");
    assert.equal(pageLabel("/assessment/billing?x=1"), "Assessment: bill");
    assert.equal(pageLabel("/some/new/page"), "/some/new/page");
  });

  it("writes a duration a person can read", () => {
    assert.equal(formatDuration(0), "—");
    assert.equal(formatDuration(40), "40 s");
    assert.equal(formatDuration(60), "1 min");
    assert.equal(formatDuration(135), "2 min 15 s");
    assert.equal(formatDuration(3720), "1 h 2 min");
  });
});

/* ───────────────────── the routes, against a real schema ───────────────────── */

describe("recording time on a page, and the owner's pages", () => {
  let w: World;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let track: any, people: any, buyers: any, marketing: any;
  const VID = "22222222-2222-4222-8222-222222222222";
  let ownerId: string;
  const owner = async () => ownerId;

  before(async () => {
    w = await makeWorld();
    ownerId = await w.seedUser({ email: "owner@vpv.in", role: "owner" });
    track = await import("@/app/api/track/route");
    people = await import("@/app/api/admin/marketing/people/route");
    buyers = await import("@/app/api/admin/marketing/buyers/route");
    marketing = await import("@/app/api/admin/marketing/route");
  });
  after(async () => w.reset?.());
  beforeEach(async () => {
    await w.q("delete from public.site_events");
    await w.q("delete from public.site_visitors");
    await w.q("delete from public.campaign_scans");
    await w.q("delete from public.campaign_codes");
    await w.q("delete from public.funnel_leads");
  });

  const post = (body: unknown, vid: string | null = VID) =>
    track.POST(
      w.request("/api/track", {
        body,
        ip: freshIp(),
        headers: vid ? { [VISITOR_HEADER]: vid } : {},
      })
    );

  it("stores page_time with its seconds and scroll", async () => {
    await post({ name: "page_time", path: "/plans", sessionId: "33333333-3333-4333-8333-333333333333", meta: { seconds: 42, scroll: 70 } });
    const [row] = await w.q(`select name, path, meta from public.site_events`);
    assert.equal(row.name, "page_time");
    assert.equal(row.path, "/plans");
    assert.equal(row.meta.seconds, 42);
    assert.equal(row.meta.scroll, 70);
  });

  it("still refuses an event name it does not know", async () => {
    await post({ name: "made_up", path: "/" });
    assert.equal((await w.q(`select count(*)::int n from public.site_events`))[0].n, 0);
  });

  const asOwner = async () => owner();
  const makePeople = async (as: string, text = "Aryan, Acme Pumps\nMeera Shah", extra: Record<string, unknown> = {}) => {
    const res = await people.POST(
      w.request("/api/admin/marketing/people", {
        as,
        body: { text, campaign: "Gurugram, Oct 26", prefix: "ggn", destination: "/plans", ...extra },
      })
    );
    return { res, body: await w.readJson(res) };
  };

  it("makes one random code per person, with a CSV, for the owner only", async () => {
    const o = await asOwner();
    const { res, body } = await makePeople(o);
    assert.equal(res.status, 200);
    assert.equal(body.count, 2);
    assert.equal(body.rows.length, 2);
    for (const r of body.rows) {
      assert.match(r.code, /^GGN-[A-Z0-9]{6}$/);
      assert.equal(r.url, `https://myvpv.com/q/${r.code}`);
      assert.equal(new RegExp(r.name.split(" ")[0], "i").test(r.code), false, "no name in the code");
    }
    assert.equal(body.csv.split("\n")[0], "name,company,code,link");
    const rows = await w.q(
      `select code, label, destination, campaign, person_name, person_company, source, medium
         from public.campaign_codes order by person_name`
    );
    assert.equal(rows.length, 2);
    assert.equal(rows[0].person_name, "Aryan");
    assert.equal(rows[0].person_company, "Acme Pumps");
    assert.equal(rows[0].label, "Aryan · Acme Pumps");
    assert.equal(rows[0].destination, "/plans");
    assert.equal(rows[0].campaign, "Gurugram, Oct 26");
    assert.equal(rows[0].source, "pamphlet");
    assert.equal(rows[0].medium, "qr");
  });

  it("turns away anyone who is not the owner, and anyone not signed in", async () => {
    const customer = await w.seedUser({ email: "c@x.in", role: "org_admin" });
    assert.equal((await makePeople(customer)).res.status, 403);
    const anon = await people.POST(
      w.request("/api/admin/marketing/people", { body: { text: "A", campaign: "x" } })
    );
    assert.equal(anon.status, 401);
    assert.equal((await w.q(`select count(*)::int n from public.campaign_codes`))[0].n, 0);
  });

  it("refuses an empty list, a missing batch name and a destination off the site", async () => {
    const o = await asOwner();
    assert.equal((await makePeople(o, "  \n\n")).res.status, 400);
    assert.equal((await makePeople(o, "A", { campaign: "" })).res.status, 400);
    assert.equal((await makePeople(o, "A", { destination: "https://evil.example/" })).res.status, 400);
    assert.equal((await makePeople(o, "A", { destination: "//evil.example" })).res.status, 400);
    assert.equal((await w.q(`select count(*)::int n from public.campaign_codes`))[0].n, 0);
  });

  it("never reuses a code across batches", async () => {
    const o = await asOwner();
    const names = Array.from({ length: 150 }, (_, i) => `Buyer ${i}`).join("\n");
    await makePeople(o, names);
    await makePeople(o, names);
    const [r] = await w.q(`select count(*)::int n, count(distinct upper(code))::int d from public.campaign_codes`);
    assert.equal(r.n, 300);
    assert.equal(r.d, 300);
  });

  it("keeps personal codes out of the campaign table, where they would bury the real ones", async () => {
    const o = await asOwner();
    await w.q(
      `insert into public.campaign_codes (code, label, destination, source, medium, campaign)
       values ('GGN','Gurugram pamphlet','/plans','pamphlet','qr','oct26')`
    );
    await makePeople(o, "A\nB\nC");
    const res = await marketing.GET(w.request("/api/admin/marketing", { method: "GET", as: o }));
    const body = await w.readJson(res);
    assert.deepEqual(body.campaigns.map((c: { code: string }) => c.code), ["GGN"]);
  });

  it("shows the owner who opened, what they did and for how long", async () => {
    const o = await asOwner();
    const { body: made } = await makePeople(o, "Aryan, Acme Pumps\nMeera Shah");
    const [aryan, meera] = made.rows as { name: string; code: string }[];

    // Aryan scans; the redirect would have logged this and stamped his browser.
    await w.q(`insert into public.campaign_scans (code, visitor_id) values ($1, $2)`, [aryan!.code, VID]);
    await w.q(`insert into public.site_visitors (visitor_id, first_code, city) values ($1, $2, 'Gurugram')`, [VID, aryan!.code]);
    const SESSION = "33333333-3333-4333-8333-333333333333";
    await post({ name: "page_view", path: "/plans", sessionId: SESSION, code: aryan!.code });
    await post({ name: "page_time", path: "/plans", sessionId: SESSION, meta: { seconds: 95, scroll: 80 } });

    const res = await buyers.GET(w.request("/api/admin/marketing/buyers", { method: "GET", as: o }));
    const body = await w.readJson(res);
    assert.equal(res.status, 200);
    const a = body.rows.find((r: { code: string }) => r.code === aryan!.code);
    const m = body.rows.find((r: { code: string }) => r.code === meera!.code);
    assert.equal(a.interest, "warm");
    assert.equal(a.activeSeconds, 95);
    assert.equal(a.topPage.label, "Plans & pricing");
    assert.equal(a.visits, 1);
    assert.equal(m.interest, "not_opened");
    assert.equal(body.rows[0].code, aryan!.code, "the one who opened is listed first");
    assert.equal(body.summary.people, 2);
    assert.equal(body.summary.opened, 1);
    assert.deepEqual(body.batches, [{ name: "Gurugram, Oct 26", count: 2 }]);

    // One person's visit.
    const one = await buyers.GET(
      w.request(`/api/admin/marketing/buyers?code=${aryan!.code}`, { method: "GET", as: o })
    );
    const j = await w.readJson(one);
    assert.equal(one.status, 200);
    assert.equal(j.person.person_name, "Aryan");
    assert.equal(j.journey.length, 1);
    assert.equal(j.journey[0].label, "Plans & pricing");
    assert.equal(j.journey[0].seconds, 95);
    assert.equal(j.journey[0].scroll, 80);
  });

  it("narrows to one batch", async () => {
    const o = await asOwner();
    await makePeople(o, "A\nB", { campaign: "Batch one" });
    await makePeople(o, "C", { campaign: "Batch two" });
    const res = await buyers.GET(
      w.request("/api/admin/marketing/buyers?batch=Batch%20two", { method: "GET", as: o })
    );
    const body = await w.readJson(res);
    assert.equal(body.rows.length, 1);
    assert.equal(body.batches.length, 2, "the picker still lists every batch");
  });

  it("is for the owner only, and says so for an unknown code", async () => {
    const customer = await w.seedUser({ email: "c2@x.in", role: "org_admin" });
    const res = await buyers.GET(w.request("/api/admin/marketing/buyers", { method: "GET", as: customer }));
    assert.equal(res.status, 403);
    const o = await asOwner();
    const nf = await buyers.GET(
      w.request("/api/admin/marketing/buyers?code=NOPE-123456", { method: "GET", as: o })
    );
    assert.equal(nf.status, 404);
  });
});
