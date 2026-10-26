/**
 * "What does your factory make?" — typed in the buyer's own words.
 *
 * These pin the matcher to what a person would expect, including the
 * awkward cases: half-typed words, typos, Hindi words, two industries in
 * one answer, and words that only look alike.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { INDUSTRY_PROFILES, matchIndustries, shortLabels } from "@/lib/industryProfiles";
import { CURATED_AREA_PICKS, areaById, processById } from "@/lib/factoryAreas";

const ids = (t: string, excluded: string[] = []) => matchIndustries(t, excluded).profiles.map((p) => p.id);

describe("matching what a factory makes", () => {
  it("understands plain answers", () => {
    const cases: [string, string[]][] = [
      ["textile", ["textiles"]],
      ["garments", ["garments"]],
      ["auto parts", ["auto"]],
      ["casting and forging", ["foundry"]],
      ["tablets and capsules", ["pharma"]],
      ["namkeen", ["food"]],
      ["LED lights", ["electronics"]],
      ["corrugated boxes", ["packaging"]],
      ["plywood", ["furniture"]],
      ["ceramic tiles", ["ceramics"]],
      ["shoes", ["leather"]],
      ["gold jewellery", ["jewellery"]],
      ["paints", ["chemicals"]],
      ["injection moulding", ["plastics"]],
      ["machine tools", ["machinery"]],
    ];
    for (const [text, want] of cases) assert.deepEqual(ids(text), want, text);
  });

  it("forgives plurals, half-typed words and one typo", () => {
    assert.deepEqual(ids("Textiles"), ["textiles"]);
    assert.deepEqual(ids("texti"), ["textiles"]);
    assert.deepEqual(ids("textle"), ["textiles"]);
    assert.deepEqual(ids("batteries"), ["electronics"]);
    // A typo in one word must not lose that industry to a correctly spelt
    // second word.
    assert.deepEqual(ids("CI castngs for pumps").sort(), ["foundry", "machinery"]);
  });

  it("understands common Hindi words", () => {
    assert.deepEqual(ids("kapda"), ["textiles"]);
    assert.deepEqual(ids("dawai"), ["pharma"]);
    assert.deepEqual(ids("loha dhalai"), ["foundry"]);
    assert.deepEqual(ids("mithai"), ["food"]);
  });

  it("finds two industries when the answer names two", () => {
    assert.deepEqual(ids("cotton yarn and garments"), ["textiles", "garments"]);
    assert.deepEqual(ids("food and packaging"), ["food", "packaging"]);
    assert.deepEqual(ids("CI castings for pumps"), ["foundry", "machinery"]);
  });

  it("does not invent a second industry from a shared or look-alike word", () => {
    assert.deepEqual(ids("plastic pipes"), ["plastics"]);
    assert.deepEqual(ids("fabric"), ["textiles"]);
    assert.deepEqual(ids("fabrication"), ["machinery"]);
  });

  it("keeps both when one word could mean either", () => {
    assert.deepEqual(ids("pipes").sort(), ["plastics", "steel"]);
  });

  it("lets the buyer remove a guess", () => {
    assert.deepEqual(ids("pipes", ["steel"]), ["plastics"]);
  });

  it("falls back to our general picks when nothing matches", () => {
    const m = matchIndustries("our company");
    assert.equal(m.matched, false);
    assert.deepEqual(m.areaIds, CURATED_AREA_PICKS);
    assert.equal(matchIndustries("").matched, false);
  });

  it("recommends areas and processes that exist, specific to the industry", () => {
    for (const p of INDUSTRY_PROFILES) {
      for (const a of p.areas) assert.ok(areaById(a), `${p.id}: unknown area ${a}`);
      for (const x of p.processes) assert.ok(processById(x), `${p.id}: unknown process ${x}`);
    }
    const textile = matchIndustries("textile");
    assert.ok(textile.areaIds.includes("spinning-department"));
    assert.ok(textile.processIds.includes("dyeing"));
    assert.ok(!textile.areaIds.includes("canteen"));
    // The factory exterior leads every list; then the industry's own first pick.
    const pharma = matchIndustries("tablets");
    assert.equal(pharma.areaIds[0], "factory-exterior");
    assert.equal(pharma.areaIds[1], "clean-room");
    for (const t of ["textile", "castings", "food", "plastic pipes", "zzz"]) {
      assert.equal(matchIndustries(t).areaIds[0], "factory-exterior", t);
    }
    // Two industries share the list rather than one crowding out the other.
    const both = matchIndustries("cotton yarn and garments");
    assert.ok(both.areaIds.includes("spinning-department"));
    assert.ok(both.areaIds.includes("stitching-floor"));
    assert.ok(both.areaIds.length <= 12);
  });

  it("says the industries in a sentence", () => {
    assert.equal(shortLabels(matchIndustries("food and packaging").profiles), "food and packaging");
    assert.equal(shortLabels(matchIndustries("textile").profiles), "textile");
  });
});
