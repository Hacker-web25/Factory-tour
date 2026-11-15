/**
 * "What does your factory produce?" — typed in the buyer's own words.
 *
 * These pin the matcher to what a person would expect: ONE industry per
 * answer (never "steel pipes and metal melting"), typos and plurals
 * forgiven, Hindi words understood, and areas that belong to the trade —
 * a food plant is never offered a foundry.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { INDUSTRY_PROFILES, matchIndustries, shortLabels } from "@/lib/industryProfiles";
import {
  ALL_AREAS,
  ALL_PROCESSES,
  CURATED_AREA_PICKS,
  FACTORY_AREAS,
  SHOP_SPECIFIC_AREAS,
  areaById,
  processById,
} from "@/lib/factoryAreas";

const id = (t: string, excluded: string[] = []) => matchIndustries(t, excluded).profile?.id ?? null;

describe("matching what a factory makes", () => {
  it("understands plain answers", () => {
    const cases: [string, string][] = [
      ["textile", "textiles"],
      ["garments", "garments"],
      ["auto parts", "auto"],
      ["casting and forging", "foundry"],
      ["tablets and capsules", "pharma"],
      ["namkeen", "snacks"],
      ["LED lights", "lighting"],
      ["corrugated boxes", "corrugated"],
      ["plywood", "plywood"],
      ["ceramic tiles", "tiles"],
      ["shoes", "footwear"],
      ["gold jewellery", "jewellery"],
      ["paints", "paints"],
      ["injection moulding", "injection-moulding"],
      ["machine tools", "machinery"],
      ["food processing", "food"],
      ["medical equipment", "medical-equipment"],
      ["basmati rice", "grain-milling"],
      ["frozen shrimp", "frozen-seafood"],
      ["solar panels", "solar"],
      ["aac blocks", "concrete-products"],
      ["pp woven sacks", "woven-sacks"],
      ["pressure die casting", "die-casting"],
      ["tmt bars", "steel-plant"],
      ["stainless steel sheets", "steel-flat"],
    ];
    for (const [text, want] of cases) assert.equal(id(text), want, text);
  });

  it("picks one narrow industry, not a mix", () => {
    // The answer that started this: steel pipes are not a melting shop.
    const pipes = matchIndustries("steel pipes");
    assert.equal(pipes.profile?.id, "steel-pipes");
    assert.equal(pipes.profiles.length, 1);
    assert.ok(!pipes.areaIds.includes("melting-shop"));
    assert.ok(pipes.areaIds.includes("tube-mill"));
    assert.ok(pipes.areaIds.includes("hydro-testing"));
    for (const t of ["cotton yarn and garments", "food and packaging", "CI castings for pumps", "pipes"]) {
      assert.ok(matchIndustries(t).profiles.length <= 1, t);
    }
    assert.equal(id("cotton yarn and garments"), "spinning");
    assert.equal(id("CI castings for pumps"), "foundry");
  });

  it("forgives plurals, half-typed words, typos and US spellings", () => {
    assert.equal(id("Textiles"), "textiles");
    assert.equal(id("texti"), "textiles");
    assert.equal(id("textle"), "textiles");
    assert.equal(id("stell pipes"), "steel-pipes");
    assert.equal(id("medical equipments"), "medical-equipment");
    assert.equal(id("medcal equipmnt"), "medical-equipment");
    assert.equal(id("food procesing"), "food");
    assert.equal(id("CI castngs for pumps"), "foundry");
    assert.equal(id("garmnts"), "garments");
    assert.equal(id("jewelry"), "jewellery");
    assert.equal(id("aluminum extrusions"), "aluminium");
    assert.equal(id("Steel Pipes & Tubes"), "steel-pipes");
    assert.equal(id("batteries"), "lead-acid-battery");
  });

  it("understands common Hindi words", () => {
    assert.equal(id("kapda"), "textiles");
    assert.equal(id("dawai"), "pharma");
    assert.equal(id("loha dhalai"), "foundry");
    assert.equal(id("mithai"), "snacks");
    assert.equal(id("saria"), "steel-plant");
  });

  it("lets a whole phrase decide, and the first word break a tie", () => {
    assert.equal(id("plastic pipes"), "plastic-pipes");
    assert.equal(id("hair oil"), "cosmetics");
    assert.equal(id("engine oil"), "lubricants");
    assert.equal(id("edible oil"), "edible-oil");
    assert.equal(id("ayurvedic tablets"), "ayurvedic");
    assert.equal(id("medical gloves"), "medical-disposables");
    assert.equal(id("fabric"), "weaving");
    assert.equal(id("fabrication"), "heavy-fabrication");
  });

  it("knows a maker of machines from the trade the machines serve", () => {
    assert.equal(id("food processing machinery"), "machinery");
    assert.equal(id("pharma machinery"), "machinery");
    assert.equal(id("packaging machines"), "machinery");
    assert.equal(id("washing machine"), "appliances");
    assert.equal(id("medical equipments manufacturer"), "medical-equipment");
  });

  it("chooses the first listed meaning when one word could be either", () => {
    assert.equal(id("pipes"), "steel-pipes");
  });

  it("can still set a guess aside", () => {
    assert.equal(id("pipes", ["steel-pipes"]), "plastic-pipes");
  });

  it("falls back to our general picks when nothing matches", () => {
    const m = matchIndustries("our company");
    assert.equal(m.matched, false);
    assert.equal(m.profile, null);
    assert.deepEqual(m.areaIds, CURATED_AREA_PICKS);
    assert.deepEqual(m.moreAreaIds, FACTORY_AREAS.map((a) => a.id));
    assert.equal(matchIndustries("").matched, false);
    assert.equal(matchIndustries(undefined).matched, false);
  });

  it("recommends areas and processes that exist", () => {
    const ids = new Set<string>();
    for (const p of INDUSTRY_PROFILES) {
      assert.ok(!ids.has(p.id), `duplicate profile ${p.id}`);
      ids.add(p.id);
      assert.ok(p.areas.length >= 6, `${p.id}: too few areas`);
      for (const a of p.areas) assert.ok(areaById(a), `${p.id}: unknown area ${a}`);
      for (const x of p.processes) assert.ok(processById(x), `${p.id}: unknown process ${x}`);
    }
    // Lead rows store area NAMES, and popular picks map them back, so
    // names must be unique.
    const names = ALL_AREAS.map((a) => a.name);
    assert.equal(new Set(names).size, names.length);
    assert.equal(new Set(ALL_AREAS.map((a) => a.id)).size, ALL_AREAS.length);
    assert.equal(new Set(ALL_PROCESSES.map((a) => a.id)).size, ALL_PROCESSES.length);
  });

  it("keeps each trade's areas to that trade", () => {
    for (const t of ["textile", "castings", "food", "plastic pipes", "zzz", "medical equipment"]) {
      assert.equal(matchIndustries(t).areaIds[0], "factory-exterior", t);
    }
    const metal = ["melting-shop", "foundry-casting-area", "cnc-machining-area", "welding-fabrication-area", "forge-shop", "tool-room"];
    for (const t of ["food processing", "namkeen", "dairy", "spices", "biscuits", "mango pulp", "packaged drinking water"]) {
      const m = matchIndustries(t);
      for (const a of metal) {
        assert.ok(!m.areaIds.includes(a), `${t}: picked ${a}`);
        assert.ok(!m.moreAreaIds.includes(a), `${t}: offered ${a}`);
      }
      assert.ok(m.areaIds.includes("hygiene-zone") || m.areaIds.includes("laboratory"), t);
    }
    // Shop-specific general areas appear only when the trade picked them.
    const auto = matchIndustries("auto parts");
    assert.ok(auto.areaIds.includes("cnc-machining-area"));
    for (const a of SHOP_SPECIFIC_AREAS) assert.ok(!auto.moreAreaIds.includes(a), a);
    const textile = matchIndustries("textile");
    assert.ok(textile.areaIds.includes("spinning-department"));
    assert.ok(textile.processIds.includes("dyeing"));
    assert.ok(!textile.areaIds.includes("canteen"));
    assert.ok(textile.moreAreaIds.includes("canteen"));
    const pharma = matchIndustries("tablets");
    assert.ok(pharma.areaIds.includes("granulation-compression"));
    assert.ok(pharma.areaIds.includes("microbiology-lab"));
  });

  it("is quick", () => {
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) matchIndustries("medcal equipmnts for hospitls");
    assert.ok((performance.now() - t0) / 100 < 10);
  });

  it("names the industry in a sentence", () => {
    assert.equal(shortLabels(matchIndustries("steel pipes").profiles), "steel pipe");
    assert.equal(shortLabels(matchIndustries("textile").profiles), "textile");
    assert.equal(shortLabels([]), "");
  });

  it("has an icon for every area and process", () => {
    const src = readFileSync("components/funnel/FunnelIcon.tsx", "utf8");
    const listed = new Set(src.match(/\b[A-Z][A-Za-z0-9]+\b/g) ?? []);
    for (const item of [...ALL_AREAS, ...ALL_PROCESSES]) assert.ok(listed.has(item.icon), `${item.id}: icon ${item.icon}`);
  });
});
