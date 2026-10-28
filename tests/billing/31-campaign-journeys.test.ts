/**
 * Campaign journeys: who is on the list, who opened it, who reached the
 * website, how interested they look, and how to reach them.
 *
 * All pure, plus one fake database that behaves like Supabase where it
 * matters here — it returns at most 1,000 rows per request, however many
 * were asked for. A report that quietly stops at 1,000 looks right with 347
 * people and is wrong the day the third campaign lands.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CURIOUS_SECONDS,
  INTEREST_LEVELS,
  PRICE_STUDY_SECONDS,
  WARM_READING_SECONDS,
  formatSeconds,
  interestOf,
  type InterestInput,
} from "@/lib/interest";
import {
  folderDetail,
  isOutreachState,
  OUTREACH_STATES,
  type FolderCodeRow,
  type FolderEventRow,
  type FolderPerson,
  type FolderRow,
  type FolderScanRow,
  type FolderVisitorRow,
} from "@/lib/campaignFolders";
import { describeEvent, personJourney, type JourneyLeadRow, type JourneyOrderRow } from "@/lib/personJourney";
import {
  ROSTER_CSV_HEADER,
  ago,
  csvCell,
  filterRoster,
  istDateTime,
  istToday,
  mailHref,
  matchesQuery,
  openedAt,
  phoneDigits,
  rosterCsv,
  sortRoster,
  telHref,
  whatsappHref,
} from "@/lib/campaignView";
import { CHUNK, loadCampaignBundle, pageAll } from "@/lib/server/campaignQueries";

/* ── fixtures ─────────────────────────────────────────────────────────────── */

const folder = (over: Partial<FolderRow> = {}): FolderRow => ({
  id: "f1",
  slug: "food-graphic",
  name: "Food Graphic",
  city: null,
  state: null,
  channel: "letter",
  destination: "/",
  printed_count: 5,
  distributed_at: null,
  notes: null,
  active: true,
  created_at: "2026-10-20T00:00:00Z",
  ...over,
});

const code = (c: string, seq: number, over: Partial<FolderCodeRow> = {}): FolderCodeRow => ({
  code: c,
  folder_id: "f1",
  label: c,
  person_name: `Person ${seq}`,
  person_company: `Company ${seq}`,
  recipient_role: null,
  recipient_phone: null,
  recipient_email: null,
  delivery_state: "made",
  delivered_at: null,
  print_seq: seq,
  created_at: "2026-10-20T00:00:00Z",
  outreach_state: "new",
  contacted_at: null,
  rep_notes: null,
  follow_up_on: null,
  ...over,
});

const scan = (c: string, visitor: string | null, at: string, over: Partial<FolderScanRow> = {}): FolderScanRow => ({
  code: c,
  visitor_id: visitor,
  created_at: at,
  device: "phone",
  is_repeat: false,
  os: "Android",
  browser: "Chrome",
  ...over,
});

const visitor = (id: string, firstCode: string | null, at: string, pageViews = 1): FolderVisitorRow => ({
  visitor_id: id,
  first_code: firstCode,
  first_seen_at: at,
  last_seen_at: at,
  city: "Mumbai",
  device: "phone",
  os: "Android",
  browser: "Chrome",
  page_views: pageViews,
  first_source: "qr",
  first_referrer: null,
});

let eventId = 0;
const ev = (
  v: string,
  name: string,
  path: string,
  at: string,
  meta: Record<string, unknown> | null = null
): FolderEventRow => ({
  visitor_id: v,
  session_id: "s",
  name,
  path,
  created_at: at,
  meta,
  // Distinct, so two events in the same second keep their order.
  ...({ id: ++eventId } as object),
});

const lead = (over: Partial<JourneyLeadRow> = {}): JourneyLeadRow => ({
  id: "l1",
  created_at: "2026-10-28T10:20:00Z",
  updated_at: "2026-10-28T10:24:00Z",
  visitor_id: "v1",
  campaign_code: "AAAA1111",
  stage: "info",
  name: "Puneet Kapoor",
  company: "Kapoor Foods",
  phone: "+91 98765 43210",
  email: "puneet@kapoorfoods.test",
  email_verified_at: null,
  industry: "Food",
  industry_text: null,
  factory_city: "Ludhiana",
  factory_state: "Punjab",
  plot_size: null,
  areas: ["Packing", "Cold store"],
  processes: null,
  aoa_count: null,
  video_count: null,
  pdf_count: null,
  wants_sharing_controls: null,
  recommended_plan: "standard",
  chosen_plan: null,
  extra_areas: null,
  extra_videos: null,
  quoted_total_inr: null,
  has_sales_team: null,
  sales_seats: null,
  terms_accepted_at: null,
  marketing_consent: true,
  order_id: null,
  ...over,
});

const AAAA = code("AAAA1111", 1);
const BBBB = code("BBBB2222", 2);
const CCCC = code("CCCC3333", 3);
const DDDD = code("DDDD4444", 4);
const ALL = [AAAA, BBBB, CCCC, DDDD];

/** A morning's reading by one visitor on AAAA: scan, load, read the price, ask a question. */
const reader = {
  scans: [scan("AAAA1111", "v1", "2026-10-28T10:00:00Z")],
  visitors: [visitor("v1", "AAAA1111", "2026-10-28T10:00:05Z")],
  events: [
    ev("v1", "page_view", "/", "2026-10-28T10:00:05Z"),
    ev("v1", "page_time", "/", "2026-10-28T10:00:50Z", { seconds: 45, scroll: 70 }),
    ev("v1", "page_view", "/plans", "2026-10-28T10:00:51Z"),
    ev("v1", "faq_open", "/plans", "2026-10-28T10:01:10Z", { question: "Do you offer EMI?" }),
    ev("v1", "page_time", "/plans", "2026-10-28T10:01:40Z", { seconds: 49, scroll: 100 }),
  ],
};

/* ── interest: a ladder, not a number ─────────────────────────────────────── */

const base: InterestInput = {
  opened: true,
  paid: false,
  stage: null,
  activeSeconds: 0,
  priceSeconds: 0,
  visits: 1,
  objections: 0,
  leftContact: false,
  clickedPay: false,
};

describe("how interested somebody is", () => {
  it("puts each kind of person on the right rung", () => {
    assert.equal(interestOf({ ...base, opened: false }).level, "unopened");
    assert.equal(interestOf({ ...base, activeSeconds: 4 }).level, "glanced");
    assert.equal(interestOf({ ...base, activeSeconds: CURIOUS_SECONDS }).level, "curious");
    assert.equal(interestOf({ ...base, activeSeconds: WARM_READING_SECONDS }).level, "warm");
    assert.equal(interestOf({ ...base, priceSeconds: PRICE_STUDY_SECONDS }).level, "warm");
    assert.equal(interestOf({ ...base, visits: 2 }).level, "warm");
    assert.equal(interestOf({ ...base, objections: 1 }).level, "warm");
    assert.equal(interestOf({ ...base, stage: "info" }).level, "warm");
    assert.equal(interestOf({ ...base, leftContact: true }).level, "hot");
    assert.equal(interestOf({ ...base, stage: "plan" }).level, "hot");
    assert.equal(interestOf({ ...base, stage: "billing" }).level, "hot");
    assert.equal(interestOf({ ...base, clickedPay: true }).level, "hot");
    assert.equal(interestOf({ ...base, paid: true, stage: "paid" }).level, "customer");
  });

  it("a payment beats everything, even a card that was never scanned", () => {
    assert.equal(interestOf({ ...base, opened: false, paid: true }).level, "customer");
  });

  it("says why, in words, strongest first", () => {
    const r = interestOf({ ...base, leftContact: true, stage: "plan", priceSeconds: 80, visits: 3 });
    assert.equal(r.level, "hot");
    assert.equal(r.why[0], "Chose a plan");
    assert.ok(r.why.includes("Left a phone number or email"));
    assert.ok(r.why.some((w) => w.startsWith("Spent 1 min 20 s on the price")), r.why.join(" | "));
    assert.ok(r.why.some((w) => w.includes("3 visits")));
  });

  it("never lets a score carry somebody across a level", () => {
    // The strongest possible Warm person must still sit below the weakest Hot one.
    const strongestWarm = interestOf({
      ...base,
      stage: "info",
      activeSeconds: 100_000,
      priceSeconds: 100_000,
      visits: 50,
      objections: 20,
    });
    const weakestHot = interestOf({ ...base, leftContact: true });
    assert.equal(strongestWarm.level, "warm");
    assert.equal(weakestHot.level, "hot");
    assert.ok(strongestWarm.score < weakestHot.score, `${strongestWarm.score} !< ${weakestHot.score}`);

    // Every rung against the next, with the most generous inputs the lower can have.
    const rungs = INTEREST_LEVELS.map((level) => {
      const inputs: Record<string, InterestInput> = {
        customer: { ...base, paid: true, stage: "paid", activeSeconds: 0 },
        hot: { ...base, leftContact: true, activeSeconds: 0, visits: 1 },
        warm: { ...base, stage: "info", activeSeconds: 1e6, priceSeconds: 1e6, visits: 99, objections: 99 },
        curious: { ...base, activeSeconds: 89 },
        glanced: { ...base, activeSeconds: 0 },
        unopened: { ...base, opened: false },
      };
      return { level, strong: interestOf(inputs[level]!) };
    });
    for (let i = 1; i < rungs.length; i++) {
      assert.ok(
        rungs[i]!.strong.score < interestOf(
          // weakest member of the rung above
          [
            { ...base, paid: true },
            { ...base, leftContact: true },
            { ...base, stage: "info" },
            { ...base, activeSeconds: CURIOUS_SECONDS },
            { ...base, activeSeconds: 0 },
          ][i - 1]!
        ).score,
        `${rungs[i]!.level} must stay below ${rungs[i - 1]!.level}`
      );
    }
  });

  it("keeps the score between 0 and 100", () => {
    for (const level of [{ ...base, paid: true }, { ...base, opened: false }, { ...base, leftContact: true, stage: "billing", activeSeconds: 1e9, visits: 1e6 }]) {
      const s = interestOf(level).score;
      assert.ok(s >= 0 && s <= 100, String(s));
    }
  });

  it("writes durations the way a person says them", () => {
    assert.equal(formatSeconds(0), "0 s");
    assert.equal(formatSeconds(59.4), "59 s");
    assert.equal(formatSeconds(60), "1 min");
    assert.equal(formatSeconds(130), "2 min 10 s");
    assert.equal(formatSeconds(3600), "1 h");
    assert.equal(formatSeconds(3900), "1 h 5 min");
    assert.equal(formatSeconds(-5), "0 s");
  });
});

/* ── the list: everyone, in print order ──────────────────────────────────── */

describe("the campaign list", () => {
  const detail = folderDetail({
    folder: folder(),
    codes: [DDDD, BBBB, AAAA, CCCC], // deliberately out of order
    scans: [...reader.scans, scan("BBBB2222", "v2", "2026-10-28T11:00:00Z")],
    visitors: [...reader.visitors, visitor("v2", "BBBB2222", "2026-10-28T11:00:02Z", 0)],
    events: reader.events,
    leads: [],
    orders: [],
  });

  it("lists every person, opened or not, in the order the letters were printed", () => {
    assert.deepEqual(
      detail.roster.map((p) => p.printSeq),
      [1, 2, 3, 4]
    );
    assert.equal(detail.roster.length, 4);
    assert.deepEqual(
      detail.roster.map((p) => p.opened),
      [true, true, false, false]
    );
  });

  it("separates 'scanned' from 'the website loaded'", () => {
    const [a, b, c] = detail.roster;
    assert.equal(a!.visited, true, "AAAA loaded the site");
    assert.equal(b!.opened, true, "BBBB scanned the card");
    assert.equal(b!.visited, false, "but its website never loaded: red dot");
    assert.equal(c!.visited, false);
    assert.equal(openedAt(c!), null, "never opened: the cell is a dash");
    assert.ok(openedAt(a!), "opened: there is a time");
  });

  it("agrees with the campaign totals", () => {
    assert.equal(detail.stat.scannedCodes, 2);
    assert.equal(detail.stat.visited, 1);
    assert.equal(detail.stat.neverOpened, 2);
  });

  it("never counts a robot's link preview as somebody opening the card", () => {
    const d = folderDetail({
      folder: folder(),
      codes: ALL,
      scans: [scan("CCCC3333", null, "2026-10-28T09:00:00Z", { device: "bot" })],
      visitors: [],
      events: [],
      leads: [],
      orders: [],
    });
    const c = d.roster.find((p) => p.code === "CCCC3333")!;
    assert.equal(c.opened, false);
    assert.equal(c.scans, 0);
    assert.equal(c.botScans, 1);
    assert.equal(c.visited, false);
    assert.equal(c.interest, "unopened");
    assert.equal(d.stat.scannedCodes, 0);
  });

  it("matches a case-different scan to its person", () => {
    const d = folderDetail({
      folder: folder(),
      codes: [AAAA],
      scans: [scan("aaaa1111", "v1", "2026-10-28T10:00:00Z")],
      visitors: [],
      events: [],
      leads: [],
      orders: [],
    });
    assert.equal(d.roster[0]!.opened, true);
  });

  it("takes the phone and e-mail from the website form, over the letter", () => {
    const d = folderDetail({
      folder: folder(),
      codes: [{ ...AAAA, recipient_phone: "+91 11111 11111", recipient_email: "old@printed.test" }],
      scans: reader.scans,
      visitors: reader.visitors,
      events: reader.events,
      leads: [lead()],
      orders: [],
    });
    const p = d.roster[0]!;
    assert.equal(p.contact.phone, "+91 98765 43210");
    assert.equal(p.contact.email, "puneet@kapoorfoods.test");
    assert.equal(p.contact.source, "form");
    assert.equal(p.interest, "hot", "leaving a phone number is the strongest signal short of paying");
  });

  it("keeps a hand-entered number when they never filled the form", () => {
    const d = folderDetail({
      folder: folder(),
      codes: [{ ...CCCC, recipient_phone: "+91 22222 22222" }],
      scans: [],
      visitors: [],
      events: [],
      leads: [],
      orders: [],
    });
    const p = d.roster[0]!;
    assert.equal(p.contact.phone, "+91 22222 22222");
    assert.equal(p.contact.source, "manual");
    assert.equal(p.interest, "unopened", "a number we typed in is not interest");
  });

  it("carries the follow-up log onto the row", () => {
    const d = folderDetail({
      folder: folder(),
      codes: [{ ...AAAA, outreach_state: "booked", contacted_at: "2026-10-29T05:00:00Z", rep_notes: "Call Monday", follow_up_on: "2026-11-02" }],
      scans: [],
      visitors: [],
      events: [],
      leads: [],
      orders: [],
    });
    assert.deepEqual(d.roster[0]!.outreach, {
      state: "booked",
      contactedAt: "2026-10-29T05:00:00Z",
      notes: "Call Monday",
      followUpOn: "2026-11-02",
    });
  });
});

/* ── one person's journey ────────────────────────────────────────────────── */

describe("a person's journey", () => {
  const journey = () =>
    personJourney({
      folder: folder(),
      code: AAAA,
      scans: reader.scans,
      visitors: reader.visitors,
      events: reader.events,
      leads: [],
      orders: [],
    });

  it("tells one visit from scan to the last click, in time order", () => {
    const j = journey();
    assert.equal(j.visits.length, 1);
    const v = j.visits[0]!;
    assert.equal(v.scanned, true);
    assert.equal(v.activeSeconds, 94, "45 s on the home page and 49 s on the plans page");
    assert.deepEqual(
      v.stops.map((s) => s.label.length > 0 && s.path),
      ["/", "/plans"]
    );
    const titles = v.items.map((i) => i.title);
    assert.equal(titles[0], "Scanned the card");
    assert.ok(titles.some((t) => t.includes("Do you offer EMI?")), titles.join(" | "));
    const times = v.items.map((i) => new Date(i.at).getTime());
    assert.deepEqual(times, [...times].sort((a, b) => a - b), "never out of order");
  });

  it("puts a long silence between two visits", () => {
    const j = personJourney({
      folder: folder(),
      code: AAAA,
      scans: reader.scans,
      visitors: reader.visitors,
      // A new session id after a long idle, as the site issues one.
      events: [
        ...reader.events,
        { ...ev("v1", "page_view", "/plans", "2026-10-28T15:00:00Z"), session_id: "s2" },
        { ...ev("v1", "page_time", "/plans", "2026-10-28T15:01:00Z", { seconds: 60 }), session_id: "s2" },
      ],
      leads: [],
      orders: [],
    });
    assert.equal(j.visits.length, 2);
    assert.equal(j.person.visits, 2);
    assert.equal(j.visits[1]!.n, 2);
    assert.equal(j.visits[1]!.scanned, false, "the second visit was not a scan");
  });

  it("shows the same headline numbers as the campaign table", () => {
    const whole = folderDetail({
      folder: folder(),
      codes: ALL,
      scans: reader.scans,
      visitors: reader.visitors,
      events: reader.events,
      leads: [lead()],
      orders: [],
    });
    const row = whole.roster.find((p) => p.code === "AAAA1111")!;
    // The route hands the person page only that person's rows.
    const j = personJourney({
      folder: folder(),
      code: AAAA,
      scans: reader.scans,
      visitors: reader.visitors,
      events: reader.events,
      leads: [lead()],
      orders: [],
    });
    const keys: (keyof FolderPerson)[] = [
      "opened",
      "visited",
      "scans",
      "visits",
      "pageViews",
      "activeSeconds",
      "stage",
      "interest",
      "interestScore",
      "firstScanAt",
    ];
    for (const k of keys) assert.deepEqual(j.person[k], row[k], `${k} differs between the table and the person page`);
    assert.deepEqual(j.person.contact, row.contact);
  });

  it("reports someone who never opened it as an empty journey, not an error", () => {
    const j = personJourney({
      folder: folder(),
      code: CCCC,
      scans: [],
      visitors: [],
      events: [],
      leads: [],
      orders: [],
    });
    assert.equal(j.visits.length, 0);
    assert.equal(j.person.opened, false);
    assert.equal(j.lead, null);
    assert.equal(j.order, null);
    assert.ok(j.ladder.every((s) => !s.reached));
  });

  it("reports a scan that never loaded the site as opened, with a visit but no pages", () => {
    const j = personJourney({
      folder: folder(),
      code: BBBB,
      scans: [scan("BBBB2222", "v2", "2026-10-28T11:00:00Z")],
      visitors: [visitor("v2", "BBBB2222", "2026-10-28T11:00:02Z", 0)],
      events: [],
      leads: [],
      orders: [],
    });
    assert.equal(j.person.opened, true);
    assert.equal(j.person.visited, false);
    assert.equal(j.visits.length, 1);
    assert.equal(j.visits[0]!.stops.length, 0);
  });

  it("ignores robot scans entirely", () => {
    const j = personJourney({
      folder: folder(),
      code: CCCC,
      scans: [scan("CCCC3333", null, "2026-10-28T09:00:00Z", { device: "bot" })],
      visitors: [],
      events: [],
      leads: [],
      orders: [],
    });
    assert.equal(j.visits.length, 0);
    assert.equal(j.person.opened, false);
  });

  it("carries everything the enquiry form collected", () => {
    const j = personJourney({
      folder: folder(),
      code: AAAA,
      scans: reader.scans,
      visitors: reader.visitors,
      events: reader.events,
      leads: [lead({ stage: "billing", chosen_plan: "standard", quoted_total_inr: 46000, order_id: "o1" })],
      orders: [
        {
          id: "o1",
          amount_paise: 4_600_000,
          status: "created",
          created_at: "2026-10-28T10:30:00Z",
          paid_at: null,
          refunded_paise: null,
          buyer_name: null,
          buyer_email: null,
          buyer_phone: null,
          buyer_company: null,
          buyer_city: null,
        } satisfies JourneyOrderRow,
      ],
    });
    assert.ok(j.lead);
    assert.equal(j.lead!.phone, "+91 98765 43210");
    assert.equal(j.lead!.email, "puneet@kapoorfoods.test");
    assert.deepEqual(j.lead!.areas, ["Packing", "Cold store"]);
    assert.equal(j.lead!.quotedTotalInr, 46000);
    assert.equal(j.lead!.marketingConsent, true);
    assert.equal(j.order?.amountInr, 46000);
    assert.equal(j.person.paid, false, "an unpaid order is not a customer");
    assert.equal(j.person.interest, "hot");
    assert.ok(j.ladder.find((s) => s.key === "billing")!.reached);
    assert.ok(!j.ladder.find((s) => s.key === "paid")!.reached);
  });

  it("describes what was pressed in plain English", () => {
    assert.equal(describeEvent({ name: "tel_click", path: "/", meta: null })?.tone, "good");
    assert.equal(describeEvent({ name: "page_view", path: "/", meta: null }), null, "page views are folded into the page");
    assert.equal(describeEvent({ name: "rage_click", path: "/", meta: { label: "Pay" } })?.tone, "bad");
    assert.equal(
      describeEvent({ name: "plan_selected", path: "/plans", meta: { plan: "standard" } })?.title,
      "Picked the Standard plan"
    );
    assert.equal(
      describeEvent({ name: "exit_intent", path: "/plans", meta: null })?.title,
      "Moved to close the tab while on the price"
    );
  });
});

/* ── the page's helpers ──────────────────────────────────────────────────── */

describe("times are Indian Standard Time", () => {
  it("shows 14:27 UTC as 7:57 pm", () => {
    assert.match(istDateTime("2026-10-28T14:27:00Z"), /28 Oct.*7:57\s?pm/i);
  });

  it("shows a dash, not 'Invalid Date', for nothing", () => {
    assert.equal(istDateTime(null), "—");
    assert.equal(istDateTime(undefined), "—");
    assert.equal(istDateTime("not a date"), "—");
  });

  it("knows it is already tomorrow in India", () => {
    assert.equal(istToday(new Date("2026-10-28T19:00:00Z")), "2026-10-29");
    assert.equal(istToday(new Date("2026-10-28T10:00:00Z")), "2026-10-28");
  });

  it("says how long ago, without being precise about it", () => {
    const now = new Date("2026-10-28T12:00:00Z");
    assert.equal(ago("2026-10-28T11:59:40Z", now), "just now");
    assert.equal(ago("2026-10-28T11:30:00Z", now), "30 min ago");
    assert.equal(ago("2026-10-28T09:00:00Z", now), "3 h ago");
    assert.equal(ago("2026-10-27T09:00:00Z", now), "1 day ago");
    assert.equal(ago(null, now), "");
  });
});

describe("reaching them", () => {
  it("dials only what could be a phone number", () => {
    assert.equal(telHref("+91 98765 43210"), "tel:+919876543210");
    assert.equal(telHref("098765-43210"), "tel:09876543210");
    assert.equal(telHref("12"), null);
    assert.equal(telHref("call me"), null);
    assert.equal(telHref(null), null);
    assert.equal(phoneDigits("1234567890123456"), null, "more than 15 digits is not a phone number");
  });

  it("opens WhatsApp with an Indian country code when there is none", () => {
    assert.equal(whatsappHref("98765 43210"), "https://wa.me/919876543210");
    assert.equal(whatsappHref("098765 43210"), "https://wa.me/919876543210");
    assert.equal(whatsappHref("+91 98765 43210"), "https://wa.me/919876543210");
    assert.equal(whatsappHref("+44 7700 900123"), "https://wa.me/447700900123", "a foreign number is left alone");
    assert.equal(whatsappHref("nope"), null);
  });

  it("will not build a mail link from something that is not an address", () => {
    assert.equal(mailHref("a@b.test"), "mailto:a@b.test");
    assert.equal(mailHref("a b@c.test"), null);
    assert.equal(mailHref("no-at-sign"), null);
    assert.equal(mailHref('x@y.test"><script>'), null);
  });
});

describe("filtering and sorting the list", () => {
  const people = (() => {
    const d = folderDetail({
      folder: folder(),
      codes: [
        AAAA,
        BBBB,
        CCCC,
        { ...DDDD, person_name: "Dilip Kumar", person_company: "Kumar Pharma", follow_up_on: "2026-10-20", outreach_state: "tried" },
      ],
      scans: [...reader.scans, scan("BBBB2222", "v2", "2026-10-28T11:00:00Z")],
      visitors: [...reader.visitors, visitor("v2", "BBBB2222", "2026-10-28T11:00:02Z", 0)],
      events: reader.events,
      leads: [lead()],
      orders: [],
    });
    return d.roster;
  })();
  const today = "2026-10-28";

  it("finds who to call today, who is stuck, who never opened it", () => {
    assert.deepEqual(filterRoster(people, "hot", "", today).map((p) => p.code), ["AAAA1111"]);
    assert.deepEqual(filterRoster(people, "stuck", "", today).map((p) => p.code), ["BBBB2222"]);
    assert.deepEqual(filterRoster(people, "unopened", "", today).map((p) => p.code), ["CCCC3333", "DDDD4444"]);
    assert.deepEqual(filterRoster(people, "opened", "", today).map((p) => p.code), ["AAAA1111", "BBBB2222"]);
    assert.deepEqual(filterRoster(people, "contact", "", today).map((p) => p.code), ["AAAA1111"]);
    assert.deepEqual(filterRoster(people, "due", "", today).map((p) => p.code), ["DDDD4444"]);
    assert.equal(filterRoster(people, "all", "", today).length, 4);
  });

  it("stops asking to call somebody who has been dealt with", () => {
    const won = people.map((p) => (p.code === "AAAA1111" ? { ...p, outreach: { ...p.outreach, state: "won" } } : p));
    assert.deepEqual(filterRoster(won, "hot", "", today), []);
  });

  it("searches by any word, in any field", () => {
    assert.deepEqual(filterRoster(people, "all", "kumar pharma", today).map((p) => p.code), ["DDDD4444"]);
    assert.deepEqual(filterRoster(people, "all", "98765", today).map((p) => p.code), ["AAAA1111"]);
    assert.deepEqual(filterRoster(people, "all", "cccc", today).map((p) => p.code), ["CCCC3333"]);
    assert.deepEqual(filterRoster(people, "all", "puneet kapoorfoods", today).map((p) => p.code), ["AAAA1111"]);
    assert.equal(matchesQuery(people[0]!, "   "), true);
    assert.equal(filterRoster(people, "all", "zzzz", today).length, 0);
  });

  it("sorts without losing or duplicating anybody", () => {
    for (const by of ["print", "interest", "recent", "name"] as const) {
      const out = sortRoster(people, by);
      assert.equal(out.length, people.length, by);
      assert.deepEqual(new Set(out.map((p) => p.code)), new Set(people.map((p) => p.code)), by);
    }
    assert.equal(sortRoster(people, "interest")[0]!.code, "AAAA1111");
    assert.equal(sortRoster(people, "recent")[0]!.code, "BBBB2222", "scanned at 11:00, after AAAA's last event at 10:01");
    assert.deepEqual(sortRoster(people, "print").map((p) => p.printSeq), [1, 2, 3, 4]);
  });
});

describe("the spreadsheet export", () => {
  it("quotes what needs quoting", () => {
    assert.equal(csvCell("plain"), "plain");
    assert.equal(csvCell("a,b"), '"a,b"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(csvCell("two\nlines"), '"two\nlines"');
    assert.equal(csvCell(null), "");
    assert.equal(csvCell(0), "0");
  });

  it("will not let a visitor's text run as a formula", () => {
    // These come from a public form.
    for (const evil of ['=HYPERLINK("http://x.test","hi")', "@SUM(A1)", "+cmd|' /C calc'!A0", "-2+3+cmd", "\t=1+1"]) {
      assert.ok(csvCell(evil).replace(/^"/, "").startsWith("'"), `${JSON.stringify(evil)} was left live`);
    }
  });

  it("leaves a real phone number alone", () => {
    assert.equal(csvCell("+91 98765 43210"), "+91 98765 43210");
    assert.equal(csvCell("-5"), "-5");
  });

  it("has one row per person plus a header, and a column for every heading", () => {
    const d = folderDetail({
      folder: folder(),
      codes: ALL,
      scans: reader.scans,
      visitors: reader.visitors,
      events: reader.events,
      leads: [lead({ name: "=EVIL()" })],
      orders: [],
    });
    const csv = rosterCsv(d.roster);
    assert.ok(csv.startsWith("﻿"), "Excel needs the BOM to read names as UTF-8");
    const lines = csv.trimEnd().split("\r\n");
    assert.equal(lines.length, 5);
    assert.equal(lines[0]!.split(",").length, ROSTER_CSV_HEADER.length);
    assert.ok(lines[1]!.includes("'=EVIL()"), "the typed name was defanged");
    assert.ok(lines[1]!.includes("+91 98765 43210"));
    // A never-opened person has blanks, not 'undefined' or 'null'.
    assert.ok(!csv.includes("undefined") && !csv.includes("null"));
  });
});

describe("follow-up states", () => {
  it("mirror the database constraint", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/campaign_outreach.sql"), "utf8");
    const m = sql.match(/outreach_state in \(([^)]*)\)/);
    assert.ok(m, "the CHECK constraint is in the migration");
    const inSql = [...m![1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!);
    assert.deepEqual([...OUTREACH_STATES].sort(), inSql.sort());
    assert.ok(isOutreachState("won"));
    assert.ok(!isOutreachState("ghosted"));
  });
});

/* ── reading more rows than one request returns ──────────────────────────── */

/** A table behind a project that returns at most `cap` rows per request. */
function fakeDb(tables: Record<string, Record<string, unknown>[]>, cap = 1000) {
  const calls: { table: string; inSize: number }[] = [];
  const db = {
    from(table: string) {
      let rows = tables[table] ?? [];
      let inSize = 0;
      let lo = 0;
      let hi = cap - 1;
      let orderKeys: string[] = [];
      const chain = {
        select: () => chain,
        not: () => chain,
        eq: (c: string, v: unknown) => {
          rows = rows.filter((r) => r[c] === v);
          return chain;
        },
        in: (c: string, vals: unknown[]) => {
          inSize = Math.max(inSize, vals.length);
          const set = new Set(vals);
          rows = rows.filter((r) => set.has(r[c]));
          return chain;
        },
        order: (c: string) => {
          orderKeys.push(c);
          return chain;
        },
        range: (a: number, b: number) => {
          lo = a;
          hi = Math.min(b, a + cap - 1);
          return chain;
        },
        then(ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) {
          calls.push({ table, inSize });
          const sorted = [...rows];
          for (const k of [...orderKeys].reverse()) {
            sorted.sort((x, y) => (x[k]! < y[k]! ? -1 : x[k]! > y[k]! ? 1 : 0));
          }
          return Promise.resolve({ data: sorted.slice(lo, hi + 1), error: null }).then(ok, bad);
        },
      };
      return chain;
    },
  };
  return { db: db as never, calls };
}

type Fake = { from: (t: string) => { select: () => { order: (c: string) => { range: (a: number, b: number) => PromiseLike<{ data: unknown; error: null }> } } } };
const readT = (db: unknown, a: number, b: number) => (db as Fake).from("t").select().order("n").range(a, b);

describe("reading everything, a page at a time", () => {
  it("returns all 2,500 rows when each request returns at most 1,000", async () => {
    const { db } = fakeDb({ t: Array.from({ length: 2500 }, (_, i) => ({ n: i })) });
    const r = await pageAll<{ n: number }>((a, b) => readT(db, a, b));
    assert.equal(r.rows.length, 2500);
    assert.equal(r.error, null);
    assert.equal(r.truncated, false);
    assert.deepEqual(r.rows.map((x) => x.n).slice(998, 1002), [998, 999, 1000, 1001], "no gap or repeat at the page edge");
  });

  it("copes with a project that caps requests lower than we ask", async () => {
    const { db } = fakeDb({ t: Array.from({ length: 1234 }, (_, i) => ({ n: i })) }, 400);
    const r = await pageAll<{ n: number }>((a, b) => readT(db, a, b));
    assert.equal(r.rows.length, 1234);
    assert.equal(new Set(r.rows.map((x) => x.n)).size, 1234);
  });

  it("stops and says so on an error", async () => {
    const r = await pageAll<number>(async () => ({ data: null, error: { message: "boom" } }));
    assert.equal(r.error?.message, "boom");
    assert.equal(r.rows.length, 0);
  });

  it("keeps every long in() list under the chunk size", async () => {
    const codes = Array.from({ length: 640 }, (_, i) => `C${String(i).padStart(4, "0")}`);
    const { db, calls } = fakeDb({
      campaign_scans: codes.map((c, i) => ({
        code: c,
        visitor_id: `v${i}`,
        created_at: "2026-10-28T10:00:00Z",
        id: i,
        device: "phone",
      })),
      site_visitors: [],
      site_events: [],
      funnel_leads: [],
      billing_orders: [],
    });
    const out = await loadCampaignBundle(db, codes, { events: true, leadCols: "x", orderCols: "x" });
    assert.ok(out.ok);
    if (!out.ok) return;
    assert.equal(out.bundle.scans.length, 640, "every scan, past the 200-code chunk edge");
    assert.ok(calls.every((c) => c.inSize <= CHUNK), `an in() list of ${Math.max(...calls.map((c) => c.inSize))} would not fit in a URL`);
  });

  it("finds a lead left on a phone that scanned the card, even without the code on it", async () => {
    const { db } = fakeDb({
      campaign_scans: [{ code: "AAAA1111", visitor_id: "v9", created_at: "2026-10-28T10:00:00Z", id: 1, device: "phone" }],
      site_visitors: [{ visitor_id: "v9", first_code: null }],
      site_events: [],
      funnel_leads: [
        { id: "l1", visitor_id: "v9", campaign_code: null, created_at: "2026-10-28T10:05:00Z", stage: "info" },
        { id: "l2", visitor_id: "other", campaign_code: null, created_at: "2026-10-28T10:05:00Z", stage: "info" },
      ],
      billing_orders: [],
    });
    const out = await loadCampaignBundle(db, ["AAAA1111"], { events: false, leadCols: "x", orderCols: "x" });
    assert.ok(out.ok);
    if (!out.ok) return;
    assert.deepEqual(out.bundle.leads.map((l) => (l as unknown as { id: string }).id), ["l1"]);
  });

  it("does not follow a robot's browser into the report", async () => {
    const { db } = fakeDb({
      campaign_scans: [{ code: "AAAA1111", visitor_id: "bot1", created_at: "2026-10-28T10:00:00Z", id: 1, device: "bot" }],
      site_visitors: [{ visitor_id: "bot1", first_code: null }],
      site_events: [{ id: 1, visitor_id: "bot1", name: "page_view", created_at: "2026-10-28T10:00:00Z" }],
      funnel_leads: [],
      billing_orders: [],
    });
    const out = await loadCampaignBundle(db, ["AAAA1111"], { events: true, leadCols: "x", orderCols: "x" });
    assert.ok(out.ok);
    if (!out.ok) return;
    assert.equal(out.bundle.events.length, 0);
    assert.equal(out.bundle.visitors.length, 0);
  });
});

/* ── the admin routes stay admin-only ────────────────────────────────────── */

describe("admin-only", () => {
  const routes = [
    "app/api/admin/marketing/folders/route.ts",
    "app/api/admin/marketing/folders/[slug]/route.ts",
    "app/api/admin/marketing/folders/[slug]/people/[code]/route.ts",
  ];
  for (const file of routes) {
    it(`${file} checks the owner before every handler`, () => {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      const handlers = [...src.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)\b/g)].map((m) => m[1]!);
      assert.ok(handlers.length > 0, "no handlers found");
      for (const h of handlers) {
        const start = src.indexOf(`export async function ${h}`);
        const body = src.slice(start, start + 400);
        assert.match(body, /await ownerGuard\(req\)/, `${h} in ${file} does not check the owner first`);
      }
    });
  }

  it("the person page and campaign page both refuse anyone but the owner", () => {
    for (const file of [
      "app/admin/marketing/folders/[slug]/page.tsx",
      "app/admin/marketing/folders/[slug]/people/[code]/page.tsx",
      "app/admin/marketing/folders/page.tsx",
    ]) {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      assert.match(src, /role !== "owner"/, file);
    }
  });
});
