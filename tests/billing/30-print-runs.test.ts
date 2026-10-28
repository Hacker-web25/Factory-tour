/**
 * Print runs: the folder report, the funnel from press to payment, and the
 * signals that say why somebody stopped.
 *
 * All pure. The point of keeping campaignFolders.ts dependency-free is that
 * the arithmetic a marketing decision rests on can be checked without a
 * database — so a wrong rate is caught here rather than after 5,000 cards
 * have been printed.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseUserAgent, isBot, deviceLabel } from "@/lib/analytics/userAgent";
import {
  EVENT_NAME_SET,
  furtherStage,
  isKnownEvent,
  pageLabel,
  stageLabel,
} from "@/lib/analytics/signals";
import {
  folderDetail,
  folderFunnel,
  folderOverview,
  folderSlug,
  isDeliveryState,
  isFolderChannel,
  PRICE_STALL_SECONDS,
  SILENT_INTEREST_SECONDS,
  type FolderCodeRow,
  type FolderEventRow,
  type FolderRow,
} from "@/lib/campaignFolders";

/* ── the three trackers must agree on the event names ─────────────────────
   This is the drift guard. The allowlist lives in lib/analytics/signals.ts,
   but the marketing site's tracker is plain JS inside a template string and
   cannot import it. When they drifted before, an event fired for weeks and
   was silently discarded by the route. */

function eventNamesIn(file: string, call: string): string[] {
  const src = readFileSync(join(process.cwd(), file), "utf8");
  const re = new RegExp(`${call}\\(\\s*"([a-z_]+)"`, "g");
  const out = new Set<string>();
  for (const m of src.matchAll(re)) out.add(m[1]!);
  return [...out];
}

describe("the trackers and the server agree on event names", () => {
  it("every event the marketing site sends is one the server stores", () => {
    const names = eventNamesIn("lib/site/measure.ts", "send");
    assert.ok(names.length > 10, `expected many signals, found ${names.length}`);
    for (const n of names) {
      assert.ok(EVENT_NAME_SET.has(n), `measure.ts sends "${n}", which /api/track would discard`);
    }
  });

  it("every event the app sends is one the server stores", () => {
    const names = eventNamesIn("lib/analytics/client.ts", "track");
    assert.ok(names.length > 10, `expected many signals, found ${names.length}`);
    for (const n of names) {
      assert.ok(EVENT_NAME_SET.has(n), `client.ts sends "${n}", which /api/track would discard`);
    }
  });

  it("both trackers cover the signals that explain a lost sale", () => {
    const site = eventNamesIn("lib/site/measure.ts", "send");
    const app = eventNamesIn("lib/analytics/client.ts", "track");
    for (const n of ["exit_intent", "faq_open", "form_abandon", "scroll_depth", "section_view"]) {
      assert.ok(site.includes(n), `measure.ts never sends ${n}`);
      assert.ok(app.includes(n), `client.ts never sends ${n}`);
    }
  });

  it("refuses an invented name", () => {
    assert.equal(isKnownEvent("page_view"), true);
    assert.equal(isKnownEvent("bought_a_boat"), false);
    assert.equal(isKnownEvent(42), false);
  });
});

/* ── who opened it ────────────────────────────────────────────────────────── */

describe("device from the user agent", () => {
  it("knows a phone from a computer from a tablet", () => {
    const iphone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1";
    const android =
      "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36";
    const ipad =
      "Mozilla/5.0 (iPad; CPU OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/604.1";
    const win =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

    assert.deepEqual(parseUserAgent(iphone), { device: "phone", os: "iOS", browser: "Safari" });
    assert.deepEqual(parseUserAgent(android), { device: "phone", os: "Android", browser: "Chrome" });
    assert.equal(parseUserAgent(ipad).device, "tablet");
    assert.deepEqual(parseUserAgent(win), { device: "desktop", os: "Windows", browser: "Chrome" });
  });

  it("an Android without Mobile is a tablet, which is the only hint Google gives", () => {
    const tab =
      "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
    assert.equal(parseUserAgent(tab).device, "tablet");
  });

  it("is not fooled by browsers that claim to be Chrome", () => {
    const edge =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0";
    const samsung =
      "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115 Mobile Safari/537.36";
    assert.equal(parseUserAgent(edge).browser, "Edge");
    assert.equal(parseUserAgent(samsung).browser, "Samsung Internet");
  });

  it("marks crawlers, so a Googlebot pass is never a factory owner", () => {
    assert.equal(isBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"), true);
    assert.equal(isBot("curl/8.4.0"), true);
    assert.equal(parseUserAgent("Googlebot/2.1").os, null, "a crawler's OS is noise");
  });

  it("says it does not know rather than guessing", () => {
    assert.deepEqual(parseUserAgent(null), { device: null, os: null, browser: null });
    assert.deepEqual(parseUserAgent(""), { device: null, os: null, browser: null });
    assert.equal(deviceLabel(null), "Unknown");
  });
});

/* ── naming a run ─────────────────────────────────────────────────────────── */

describe("folder slugs mirror the database constraint", () => {
  it("turns a name into something safe for a URL", () => {
    assert.equal(folderSlug("Gurugram — Oct 26, batch 1"), "gurugram-oct-26-batch-1");
    assert.equal(folderSlug("  Manesar Expo  "), "manesar-expo");
  });

  it("refuses a name with nothing usable in it", () => {
    for (const bad of ["", "—", "!!!", null, 7, "a"]) {
      assert.equal(folderSlug(bad as unknown), null, String(bad));
    }
  });

  it("knows its own channels and delivery states", () => {
    assert.ok(isFolderChannel("pamphlet"));
    assert.ok(!isFolderChannel("billboard"));
    assert.ok(isDeliveryState("delivered"));
    assert.ok(!isDeliveryState("posted"));
  });
});

/* ── the rollup ───────────────────────────────────────────────────────────── */

const folder = (over: Partial<FolderRow> = {}): FolderRow => ({
  id: "f1",
  slug: "ggn-oct26",
  name: "Gurugram — Oct 26",
  city: "Gurugram",
  state: "Haryana",
  channel: "pamphlet",
  destination: "/",
  printed_count: 220,
  distributed_at: "2026-10-20",
  notes: null,
  active: true,
  created_at: "2026-10-18T00:00:00Z",
  ...over,
});

const code = (c: string, over: Partial<FolderCodeRow> = {}): FolderCodeRow => ({
  code: c,
  folder_id: "f1",
  label: c,
  person_name: `Name ${c}`,
  person_company: `Co ${c}`,
  recipient_role: null,
  recipient_phone: null,
  recipient_email: null,
  delivery_state: "made",
  delivered_at: null,
  print_seq: Number(c.replace(/\D/g, "")) || null,
  created_at: "2026-10-18T00:00:00Z",
  ...over,
});

const scan = (c: string, visitor: string | null, repeat = false) => ({
  code: c,
  visitor_id: visitor,
  created_at: "2026-10-21T10:00:00Z",
  device: "phone",
  is_repeat: repeat,
});

describe("a print run is measured against what was printed", () => {
  it("rates the run on the printed count, not on the scans", () => {
    const [row] = folderOverview({
      folders: [folder({ printed_count: 220 })],
      codes: [code("C1"), code("C2"), code("C3"), code("C4")],
      scans: [scan("C1", "v1"), scan("C2", "v2")],
      leads: [],
      orders: [],
    });
    assert.equal(row!.printed, 220);
    assert.equal(row!.codes, 4);
    assert.equal(row!.scannedCodes, 2);
    // 2 of 220, not 2 of 4. The 216 nobody scanned are the point.
    assert.equal(row!.scanRatePct, 0.9);
    assert.equal(row!.neverOpened, 2);
  });

  it("refuses to invent a rate when the printed count is unknown", () => {
    const [row] = folderOverview({
      folders: [folder({ printed_count: null })],
      codes: [code("C1"), code("C2")],
      scans: [scan("C1", "v1")],
      leads: [],
      orders: [],
    });
    assert.equal(row!.printed, null);
    assert.equal(row!.scanRatePct, null, "a guessed rate is worse than no rate");
    assert.equal(row!.revenuePerPieceInr, null);
    assert.equal(row!.scannedCodes, 1, "but the counts are still real");
  });

  it("counts one card scanned twice as one piece and two taps", () => {
    const [row] = folderOverview({
      folders: [folder()],
      codes: [code("C1")],
      scans: [scan("C1", "v1"), scan("C1", "v2", true)],
      leads: [],
      orders: [],
    });
    assert.equal(row!.scans, 2);
    assert.equal(row!.scannedCodes, 1);
    assert.equal(row!.repeatScans, 1);
    assert.equal(row!.people, 2);
  });

  it("counts only money that settled", () => {
    const [row] = folderOverview({
      folders: [folder({ printed_count: 100 })],
      codes: [code("C1"), code("C2")],
      scans: [scan("C1", "v1"), scan("C2", "v2")],
      leads: [
        { ...lead("C1", "v1"), stage: "paid", order_id: "o1" },
        { ...lead("C2", "v2"), stage: "billing", order_id: "o2" },
      ],
      orders: [
        { id: "o1", amount_paise: 4_600_000, status: "paid" },
        { id: "o2", amount_paise: 4_600_000, status: "created" },
      ],
    });
    assert.equal(row!.paid, 1);
    assert.equal(row!.revenueInr, 46_000);
    assert.equal(row!.reachedBilling, 2, "both reached the bill");
    assert.equal(row!.revenuePerPieceInr, 460);
  });
});

function lead(code: string | null, visitor: string | null) {
  return {
    visitor_id: visitor,
    campaign_code: code,
    name: "A Buyer",
    company: "Acme",
    phone: "+919000000000",
    email: "b@acme.test",
    stage: "info" as string | null,
    chosen_plan: null as string | null,
    quoted_total_inr: null as number | null,
    factory_city: "Gurugram",
    industry: "pumps",
    order_id: null as string | null,
  };
}

/* ── the ladder ───────────────────────────────────────────────────────────── */

describe("the funnel from the press to the money", () => {
  it("falls monotonically and names the biggest loss", () => {
    // A run where one rung leaks badly and the rest leak a little: 58 start
    // the assessment, 38 get past the first question. The 20 lost there are
    // the thing to fix.
    const steps = folderFunnel({
      printed: 220,
      delivered: 198,
      codesMade: 220,
      scannedCodes: 64,
      readIt: 60,
      stages: [
        ...Array(20).fill("info"),
        ...Array(2).fill("scope"),
        ...Array(2).fill("security"),
        ...Array(2).fill("plan"),
        ...Array(2).fill("sales"),
        ...Array(2).fill("billing"),
        ...Array(28).fill("paid"),
      ],
    });
    const by = Object.fromEntries(steps.map((s) => [s.key, s]));
    assert.equal(by.printed!.count, 220);
    assert.equal(by.delivered!.count, 198);
    assert.equal(by.scanned!.count, 64);
    assert.equal(by.read!.count, 60);
    // Counts are "at or past this step", so they fall as the ladder goes on.
    assert.equal(by.info!.count, 58);
    assert.equal(by.scope!.count, 38);
    assert.equal(by.billing!.count, 30);
    assert.equal(by.paid!.count, 28);

    // Monotonic the whole way down: a later step can never exceed an earlier.
    for (let i = 1; i < steps.length; i++) {
      assert.ok(
        steps[i]!.count <= steps[i - 1]!.count,
        `${steps[i]!.key} (${steps[i]!.count}) exceeds ${steps[i - 1]!.key} (${steps[i - 1]!.count})`
      );
    }

    assert.equal(by.scanned!.ofPrintedPct, 29.1, "64 of 220");

    const worst = steps.filter((x) => x.biggestLoss);
    assert.equal(worst.length, 1, "exactly one step is ever called out");
    assert.equal(worst[0]!.key, "scope");
    assert.equal(worst[0]!.lost, 20);
    assert.ok(worst[0]!.note?.includes("20 of 58"), worst[0]!.note ?? "no note");
  });

  it("names the earlier step when two leak equally, because that is the one to fix first", () => {
    const steps = folderFunnel({
      printed: 220,
      delivered: 0,
      codesMade: 220,
      // 51 read it, 31 started, 11 got past the first question: 20 lost at
      // each of the two steps.
      scannedCodes: 64,
      readIt: 51,
      stages: [...Array(20).fill("info"), ...Array(8).fill("plan"), ...Array(3).fill("billing")],
    });
    const worst = steps.filter((s) => s.biggestLoss);
    assert.equal(worst.length, 1, "exactly one step is ever called out");
    assert.equal(worst[0]!.key, "info");
    assert.equal(worst[0]!.lost, 20);
  });

  it("hides the delivered step until somebody has recorded a delivery", () => {
    const steps = folderFunnel({
      printed: 220,
      delivered: 0,
      codesMade: 220,
      scannedCodes: 10,
      readIt: 8,
      stages: [],
    });
    assert.ok(
      !steps.some((s) => s.key === "delivered"),
      "a zero there would read as a catastrophe at step two, which is a lie"
    );
    assert.equal(steps[0]!.key, "printed");
    assert.equal(steps[1]!.key, "scanned");
    assert.equal(steps[1]!.ofPreviousPct, 4.5);
  });

  it("uses the code count only when nothing was ever printed", () => {
    const steps = folderFunnel({
      printed: null,
      delivered: 0,
      codesMade: 12,
      scannedCodes: 3,
      readIt: 2,
      stages: [],
    });
    assert.equal(steps[0]!.count, 12);
    assert.equal(steps[0]!.ofPrintedPct, null);
  });

  it("never shows a negative loss when a card was passed to somebody else", () => {
    // Two people behind one scanned code: the later step is larger.
    const steps = folderFunnel({
      printed: 10,
      delivered: 0,
      codesMade: 10,
      scannedCodes: 1,
      readIt: 2,
      stages: ["info", "info"],
    });
    for (const s of steps) assert.ok(s.lost >= 0, `${s.key} lost ${s.lost}`);
  });
});

/* ── the signals ──────────────────────────────────────────────────────────── */

const ev = (
  visitor: string,
  name: string,
  path: string,
  meta: Record<string, unknown> | null = null,
  at = "2026-10-21T10:05:00Z"
): FolderEventRow => ({
  visitor_id: visitor,
  session_id: "s1",
  name,
  path,
  created_at: at,
  meta,
});

describe("why we think they stopped", () => {
  it("spots somebody who stalled on the price", () => {
    const d = folderDetail({
      folder: folder(),
      codes: [code("C1")],
      scans: [scan("C1", "v1")],
      visitors: [
        {
          visitor_id: "v1",
          first_code: "C1",
          first_seen_at: "2026-10-21T10:00:00Z",
          last_seen_at: "2026-10-21T10:10:00Z",
          city: "Gurugram",
          device: "phone",
          os: "Android",
          browser: "Chrome",
        },
      ],
      events: [
        ev("v1", "page_view", "/plans"),
        ev("v1", "page_time", "/plans", { seconds: PRICE_STALL_SECONDS + 30, scroll: 90 }),
        ev("v1", "exit_intent", "/plans"),
      ],
      leads: [],
      orders: [],
    });
    const p = d.people[0]!;
    const kinds = p.signals.map((s) => s.kind);
    assert.ok(kinds.includes("price_stall"), `got ${kinds.join(", ")}`);
    assert.ok(kinds.includes("exit_on_price"));
    assert.equal(p.topPage?.path, "/plans");
    assert.ok(d.headlines.some((h) => h.includes("stalled on the price")));
  });

  it("spots interest that never left a name", () => {
    const d = folderDetail({
      folder: folder(),
      codes: [code("C1")],
      scans: [scan("C1", "v1")],
      visitors: [
        {
          visitor_id: "v1",
          first_code: "C1",
          first_seen_at: "2026-10-21T10:00:00Z",
          last_seen_at: "2026-10-21T10:10:00Z",
          city: null,
          device: "phone",
          os: null,
          browser: null,
        },
      ],
      events: [
        ev("v1", "page_view", "/case-studies"),
        ev("v1", "page_time", "/case-studies", { seconds: SILENT_INTEREST_SECONDS + 60 }),
      ],
      leads: [],
      orders: [],
    });
    const kinds = d.people[0]!.signals.map((s) => s.kind);
    assert.ok(kinds.includes("silent_interest"), `got ${kinds.join(", ")}`);
  });

  it("collects their objections from the questions they opened", () => {
    const d = folderDetail({
      folder: folder(),
      codes: [code("C1")],
      scans: [scan("C1", "v1")],
      visitors: [
        {
          visitor_id: "v1",
          first_code: "C1",
          first_seen_at: "2026-10-21T10:00:00Z",
          last_seen_at: "2026-10-21T10:10:00Z",
          city: null,
          device: "phone",
          os: null,
          browser: null,
        },
      ],
      events: [
        ev("v1", "page_view", "/faq"),
        ev("v1", "faq_open", "/faq", { question: "Who owns the footage?" }),
        ev("v1", "faq_open", "/faq", { question: "How long does a shoot take?" }),
      ],
      leads: [],
      orders: [],
    });
    assert.deepEqual(d.people[0]!.objections, [
      "Who owns the footage?",
      "How long does a shoot take?",
    ]);
    assert.deepEqual(
      d.objections.map((o) => o.people),
      [1, 1]
    );
  });

  it("knows when the card was shown to somebody else", () => {
    const d = folderDetail({
      folder: folder(),
      codes: [code("C1")],
      scans: [scan("C1", "v1"), { ...scan("C1", "v2", true), device: "desktop" }],
      visitors: [],
      events: [],
      leads: [],
      orders: [],
    });
    const kinds = d.people[0]!.signals.map((s) => s.kind);
    assert.ok(kinds.includes("shown_to_others"));
    assert.equal(d.people[0]!.scans, 2);
    assert.equal(d.people[0]!.repeatScans, 1);
  });

  it("reports a scan with no journey as opened, not as a failure", () => {
    // Somebody who declined the cookie notice or blocks scripts.
    const d = folderDetail({
      folder: folder(),
      codes: [code("C1")],
      scans: [scan("C1", null)],
      visitors: [],
      events: [],
      leads: [],
      orders: [],
    });
    const p = d.people[0]!;
    assert.equal(p.opened, true, "the scan is logged on our server, so it is known");
    assert.equal(p.activeSeconds, 0);
    assert.equal(p.topPage, null);
    assert.equal(p.stage, null);
    assert.equal(p.stageLabel, "Never started");
  });

  it("separates who never opened it from who did", () => {
    const d = folderDetail({
      folder: folder(),
      codes: [code("C1"), code("C2"), code("C3")],
      scans: [scan("C1", "v1")],
      visitors: [],
      events: [],
      leads: [],
      orders: [],
    });
    assert.equal(d.people.length, 1);
    assert.equal(d.neverOpened.length, 2);
    assert.deepEqual(
      d.neverOpened.map((p) => p.code),
      ["C2", "C3"]
    );
  });
});

/* ── small things that carry meaning ──────────────────────────────────────── */

describe("the funnel ladder and its labels", () => {
  it("keeps the furthest of two stages", () => {
    assert.equal(furtherStage("info", "billing"), "billing");
    assert.equal(furtherStage("billing", "info"), "billing");
    assert.equal(furtherStage(null, "plan"), "plan");
    assert.equal(furtherStage(null, null), null);
    assert.equal(furtherStage("nonsense", null), null);
  });

  it("writes the assessment steps out in words", () => {
    assert.equal(stageLabel("billing"), "Reached the bill");
    assert.equal(stageLabel(null), "Never started");
  });

  it("names the sales-team step by its real path", () => {
    // The path is /assessment/sales-team; labelling it by "/assessment/sales"
    // left the raw URL showing in the report.
    assert.equal(pageLabel("/assessment/sales-team"), "Assessment: sales logins");
    assert.equal(pageLabel("/plans?utm_source=x"), "Plans & pricing");
    assert.equal(pageLabel("/plans/"), "Plans & pricing");
  });
});
