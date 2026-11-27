import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { FACTORIES, ORDER_STEPS, PROOF, CALC_VALUES, CALC_LEADS, CALC_CONVS, worked } from "../../scripts/home-story/src/data";
import { EVENT_NAME_SET } from "@/lib/analytics/signals";

/**
 * The home page story (27 Nov 2026): seven parts, no live demo, the right-hand
 * side is a picture, a table, a video or a small animation. These tests keep
 * the pieces that must agree with other parts of the site in step.
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const story = read("scripts/home-story/src/story.ts");
const built = read("public/home-story/story.js");

describe("the home page story (27 Nov 2026)", () => {
  it("says what the owner asked for, part by part", () => {
    for (const text of [
      "You meet hundreds of buyers at exhibitions and generate opportunities worth crores,",
      "conversion is low.",
      "Lack of trust.",
      "Corporate videos, brochures and video calls don't build enough of the trust buyers need.",
      "How much is it costing you?",
      "Show your factory only to buyers. Keep competitors out.",
      "Control link expiry time",
      "Limit device access",
      "One-time view links",
      "Password protected link",
      "Order now in just 5 simple steps.",
    ]) {
      assert.ok(story.includes(text), text);
      assert.ok(built.includes(text.replace(/'/g, "'")), `built: ${text}`);
    }
  });

  it("has seven parts and no live demo in the page", () => {
    assert.equal((story.match(/<article class="hs-part" data-i="\d"/g) ?? []).length, 7);
    assert.equal((story.match(/<div class="hs-vis"[^>]*data-v="\d"/g) ?? []).length + (story.match(/<div class="hs-vis hs-vis--video" data-v="\d"/g) ?? []).length, 7);
    assert.ok(!story.includes("/experience"), "the story no longer frames the demo");
    assert.ok(!built.includes("/experience"), "nor does the built file");
    assert.ok(!/kuula\.co/i.test(built), "no Kuula frame either");
  });

  it("keeps the demo one click away", () => {
    assert.ok(story.includes('href="/demo"'), "a link in the how-it-works part");
    assert.ok(read("lib/site/header.ts").includes('{ href: "/demo", label: "Demo" }'), "and the header's Demo link");
    assert.ok(fs.existsSync(path.join(process.cwd(), "app/demo")), "and the page itself");
  });

  it("sends the buttons where the owner said", () => {
    assert.match(story, /href="\/case-studies"[^>]*data-testid="home-story-case-study"/);
    assert.match(story, /href="\/plans"[^>]*data-testid="home-story-cta"/);
  });

  it("is still mounted by the site's loader, with the plain hero as the fallback", () => {
    const home = read("lib/site/home.ts");
    assert.ok(home.includes('import("/home-story/story.js")'));
    assert.ok(home.includes("#home-classic{display:none}"));
  });

  it("only sends events the server accepts", () => {
    for (const name of ["section_view", "video_play", "calculator_used"]) {
      assert.ok(EVENT_NAME_SET.has(name), name);
      assert.ok(story.includes(`"${name}"`), `${name} is sent`);
    }
  });

  it("uses pictures that exist", () => {
    for (const f of ["home-expo-tablet.webp", "home-expo-tablet-sm.webp", "home-buyer-tablet.webp", "home-buyer-tablet-sm.webp", "trusted-manufacturers.webp"]) {
      assert.ok(story.includes(f), `${f} is used`);
      assert.ok(fs.existsSync(path.join(process.cwd(), "public/img", f)), `${f} exists`);
    }
  });
});

describe("the five order steps", () => {
  it("are the How it works page's five steps, word for word", () => {
    const guide = read("scripts/hiw-guide/src/guide.ts");
    const block = guide.slice(guide.indexOf("const STEPS: Step[] = ["), guide.indexOf("type Deliverable"));
    const titles = [...block.matchAll(/^\s{4}title: "([^"]+)"/gm)].map((m) => m[1]);
    const whens = [...block.matchAll(/^\s{4}when: "([^"]+)"/gm)].map((m) => m[1]);
    const who = [...block.matchAll(/^\s{4}who: "(you|us)"/gm)].map((m) => m[1]);
    assert.equal(titles.length, 5);
    assert.deepEqual(ORDER_STEPS.map((s) => s.title), titles);
    assert.deepEqual(ORDER_STEPS.map((s) => s.when), whens);
    assert.deepEqual(ORDER_STEPS.map((s) => s.who.toLowerCase()), who);
  });
});

describe("the four example factories", () => {
  it("use only values the calculator can be set to, so a tap lands exactly on a chip and the sliders", () => {
    for (const f of FACTORIES) {
      assert.ok(CALC_VALUES.includes(f.lakh), `${f.id}: business per lead is one of the chips`);
      assert.ok(f.leads >= CALC_LEADS.min && f.leads <= CALC_LEADS.max && (f.leads - CALC_LEADS.min) % CALC_LEADS.step === 0, `${f.id}: leads on the slider`);
      assert.ok(Number.isInteger(f.conv) && f.conv >= CALC_CONVS.min && f.conv <= CALC_CONVS.max, `${f.id}: conversion on the slider`);
    }
  });

  it("show the calculator's own figures", () => {
    // 1,000 leads × ₹50L each = ₹500 Cr; 5% won = ₹25 Cr; ₹475 Cr lost.
    const large = FACTORIES.find((f) => f.id === "large")!;
    assert.deepEqual(worked(large), { opportunity: 500_00_00_000, won: 25_00_00_000, lost: 475_00_00_000 });
    for (const f of FACTORIES) {
      const w = worked(f);
      assert.equal(w.won + w.lost, w.opportunity, f.id);
      assert.ok(w.lost > w.won, `${f.id}: most of the business is the part that did not convert`);
    }
  });

  it("tell the story the owner described: mega has few, valuable, well-converting leads; small and medium have very many and low value; large sits between", () => {
    const by = Object.fromEntries(FACTORIES.map((f) => [f.id, f]));
    assert.deepEqual(FACTORIES.map((f) => f.id), ["small", "medium", "large", "mega"]);
    assert.ok(by.mega.leads < by.large.leads && by.large.leads < by.medium.leads && by.medium.leads < by.small.leads, "fewer leads as the factory grows");
    assert.ok(by.small.lakh < by.medium.lakh && by.medium.lakh < by.large.lakh && by.large.lakh < by.mega.lakh, "more value per lead as the factory grows");
    assert.ok(by.small.conv < by.medium.conv && by.medium.conv < by.large.conv && by.large.conv < by.mega.conv, "better conversion as the factory grows");
    assert.ok(worked(by.mega).opportunity > worked(by.large).opportunity && worked(by.large).opportunity > worked(by.medium).opportunity, "bigger total value as the factory grows");
  });

  it("are labelled as examples on the page", () => {
    assert.ok(story.includes("Illustrative examples"));
  });
});

describe("the proof video", () => {
  it("is Mr. Anuj Anand's story, the one the case studies page opens on", () => {
    assert.equal(PROOF.id, "62asCfqRRbw");
    assert.ok(read("lib/site/home.ts").includes(`var ID="${PROOF.id}"`), "the case studies page autoplays the same video");
    assert.ok(read("lib/site/bundleData.ts").includes(`id:\\"${PROOF.id}\\",name:\\"Mr. Anuj Anand\\"`), "and puts him first");
  });

  it("starts muted (browsers refuse autoplay with sound) and offers a button for the sound", () => {
    assert.ok(story.includes("autoplay=1&mute=${muted ? 1 : 0}"));
    assert.ok(story.includes("ytSrc(true)"), "starts muted");
    assert.ok(story.includes("ytSrc(false,"), "the button turns the sound on");
    assert.ok(story.includes("Tap for sound"));
  });
});

describe("Premium's link controls in the database", () => {
  it("are the same in premium_perks.sql as in plans_yearly.sql, and both give Premium every control", () => {
    const fnOf = (sql: string) => {
      const a = sql.indexOf("create or replace function public.org_link_controls");
      return sql.slice(a, sql.indexOf("grant execute on function public.org_link_controls", a)).replace(/\s+/g, " ").trim();
    };
    const yearly = read("supabase/plans_yearly.sql");
    const perks = read("supabase/premium_perks.sql");
    assert.equal(fnOf(perks), fnOf(yearly));
    assert.ok(fnOf(yearly).includes("o.site_plan in ('premium', 'ultra', 'white_glove', 'control', 'enterprise')"));
    assert.ok(!/when o\.site_plan = 'premium'/.test(fnOf(yearly)), "no separate, smaller Premium case");
    assert.ok(!fs.existsSync(path.join(process.cwd(), "supabase/ultra_perks.sql")), "ultra_perks.sql was replaced by premium_perks.sql");
  });
});
