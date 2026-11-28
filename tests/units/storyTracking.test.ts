/**
 * The extra tracking behind the personal QR letters: how the home page story
 * was READ, and what happened to the welcome. These keep the pieces that must
 * agree in step: the story's own part names, the server's allowlist, the
 * trackers, and the owner's journey page.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { EVENT_NAME_SET, HOME_PARTS } from "@/lib/analytics/signals";
import { describeEvent, personJourney } from "@/lib/personJourney";
import type { FolderCodeRow, FolderEventRow, FolderRow, FolderScanRow, FolderVisitorRow } from "@/lib/campaignFolders";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const story = read("scripts/home-story/src/story.ts");
const builtStory = read("public/home-story/story.js");

describe("what the server will store", () => {
  it("knows the three new events", () => {
    for (const n of ["story_dwell", "welcome_seen", "welcome_skipped"]) assert.ok(EVENT_NAME_SET.has(n), n);
  });
});

describe("the story's reading time", () => {
  it("names the same seven parts, in the same order, as the story itself", () => {
    const block = story.slice(story.indexOf("const PARTS = ["), story.indexOf("const PART_COST"));
    const ids = [...block.matchAll(/id: "([a-z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(ids, HOME_PARTS.map((p) => p.id));
  });

  it("sends story_dwell, and the shipped bundle has it (rebuild story.js after editing story.ts)", () => {
    assert.ok(story.includes('"story_dwell"'));
    assert.ok(builtStory.includes("story_dwell"), "public/home-story/story.js is stale: cd scripts/home-story && npm run build");
    assert.ok(builtStory.includes("deepest"));
  });

  it("keeps story_dwell to twelve keys, which is all /api/track will store", () => {
    const fixed = [...story.matchAll(/^\s+meta\.([a-z]+) = /gm)].map((m) => m[1]);
    assert.deepEqual(fixed, ["deepest", "moves", "touches", "custom", "total"]);
    assert.ok(HOME_PARTS.length + fixed.length <= 12, `${HOME_PARTS.length + fixed.length} keys`);
  });

  it("only counts time while the page is in front of them and the story is on screen", () => {
    assert.match(story, /document\.visibilityState === "visible"/);
    assert.match(story, /onScreen\(\)/);
    assert.match(story, /DWELL_CAP_S/);
  });

  it("is sent when the page is hidden or left, never lost with the tab", () => {
    assert.match(story, /const flush = \(\) => \{ save\(true\); sendDwell\(true\); \}/);
  });
});

describe("both trackers report the welcome", () => {
  it("the marketing pages' tracker and the app's tracker send both events", () => {
    const measure = read("lib/site/measure.ts");
    const client = read("lib/analytics/client.ts");
    for (const src of [measure, client]) {
      assert.ok(src.includes('"welcome_seen"') && src.includes('"welcome_skipped"'));
      assert.ok(src.includes("vpv:welcome") && src.includes("__vpvWelcome"));
    }
  });
  it("the welcome publishes the event and the global the trackers listen for", () => {
    const w = read("scripts/welcome/welcome.src.js");
    assert.ok(w.includes('"vpv:welcome"') && w.includes("window.__vpvWelcome"));
  });
});

/* ── the journey page ─────────────────────────────────────────────────────── */

const folder: FolderRow = {
  id: "f1", slug: "nov", name: "Nov letters", city: null, state: null, channel: "letter", destination: "/",
  printed_count: 5, distributed_at: null, notes: null, active: true, created_at: "2026-11-20T00:00:00Z",
};
const code: FolderCodeRow = {
  code: "K7M2XQ", folder_id: "f1", label: "Aryan", person_name: "Aryan Kapoor", person_company: "Kapoor Pumps",
  recipient_role: null, recipient_phone: null, recipient_email: null, delivery_state: "made", delivered_at: null,
  print_seq: 1, created_at: "2026-11-20T00:00:00Z", outreach_state: "new", contacted_at: null, rep_notes: null, follow_up_on: null,
};
const scan: FolderScanRow = {
  code: "K7M2XQ", visitor_id: "v1", created_at: "2026-11-28T10:00:00Z", device: "phone", is_repeat: false, os: "Android", browser: "Chrome",
};
const visitor: FolderVisitorRow = {
  visitor_id: "v1", first_code: "K7M2XQ", first_seen_at: "2026-11-28T10:00:00Z", last_seen_at: "2026-11-28T10:03:00Z",
  city: "Pune", device: "phone", os: "Android", browser: "Chrome", page_views: 1, first_source: "letter", first_referrer: null,
};
let n = 0;
const ev = (name: string, at: string, meta: Record<string, unknown> | null = null, p = "/"): FolderEventRow =>
  ({ visitor_id: "v1", session_id: "s", name, path: p, created_at: at, meta, ...({ id: ++n } as object) }) as FolderEventRow;

describe("what the owner reads on a person's page", () => {
  it("says whether they watched the welcome or tapped past it", () => {
    const seen = describeEvent({ name: "welcome_seen", path: "/", meta: { ms: 2400, ink: true } })!;
    assert.equal(seen.title, "Watched the welcome animation");
    assert.equal(seen.detail, "2.4 s");
    const skipped = describeEvent({ name: "welcome_skipped", path: "/", meta: { ms: 600 } })!;
    assert.equal(skipped.title, "Tapped past the welcome animation");
    assert.equal(skipped.detail, "after 0.6 s");
  });

  it("folds story_dwell into the home page row instead of listing it as an action", () => {
    assert.equal(describeEvent({ name: "story_dwell", path: "/", meta: { cost: 20 } }), null);
    const j = personJourney({
      folder, code, scans: [scan], visitors: [visitor],
      events: [
        ev("page_view", "2026-11-28T10:00:05Z"),
        ev("welcome_seen", "2026-11-28T10:00:08Z", { ms: 2300, ink: true }),
        ev("story_dwell", "2026-11-28T10:01:00Z", { problem: 6, trust: 4, cost: 24, deepest: 3, moves: 2, touches: 5, custom: 0, total: 34 }),
        ev("story_dwell", "2026-11-28T10:02:00Z", { cost: 10, proof: 31, deepest: 4, moves: 1, touches: 2, custom: 1, total: 41 }),
        ev("page_time", "2026-11-28T10:03:00Z", { seconds: 170, scroll: 40 }),
      ],
      leads: [], orders: [],
    });
    const home = j.visits[0]!.stops.find((s) => s.path === "/")!;
    assert.equal(home.reading?.cost, 34, "the two reports are added up");
    assert.equal(home.reading?.proof, 31);
    assert.equal(home.deepestPart, 4);
    assert.equal(home.storyTouches, 7);
    const row = j.visits[0]!.items.find((i) => i.kind === "page" && i.title.includes("Home"))!;
    assert.match(row.detail ?? "", /reached part 4 of 7 \(The proof video\)/);
    assert.match(row.detail ?? "", /longest on The cost calculator 34 s, The proof video 31 s/);
    assert.match(row.detail ?? "", /changed the calculator 7 times/);
    const titles = j.visits[0]!.items.map((i) => i.title);
    assert.ok(titles.includes("Watched the welcome animation"), titles.join(" | "));
    assert.ok(!titles.some((t) => /story dwell/i.test(t)), "never shown as a raw event name");
  });

  it("says how many different sets of numbers they tried in the calculator", () => {
    const d = describeEvent({
      name: "calculator_used", path: "/",
      meta: { leads: 500, valueLakh: 10, conv: 5, lift: 5, opportunity: 1, recovered: 1, saves: 3 },
    })!;
    assert.match(d.detail ?? "", /3 different sets of numbers so far/);
  });
});
