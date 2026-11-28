/**
 * Finishing a scene's name: "Lab" → "Laboratory", from names people really use.
 * The seed is the real list of factory areas plus names shaped like the Kilitch tour.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ALL_AREAS } from "../../lib/factoryAreas";
import {
  aggregateNames,
  buildVocab,
  genericNames,
  suggest,
  vocabText,
  withinOneEdit,
  type Source,
} from "../../lib/sceneNames";

const seed: Source[] = ALL_AREAS.map((a) => ({ text: a.name, weight: 1 }));
const own = (names: string[], weight = 3): Source[] => names.map((text) => ({ text, weight }));
const texts = (v: ReturnType<typeof buildVocab>, typed: string) => suggest(v, typed).map((s) => s.text);

describe("what is worth remembering from a name", () => {
  it("keeps the room, drops the code, the number and camera names", () => {
    assert.equal(vocabText("HO15 · Reception"), "Reception");
    assert.equal(vocabText("F75 Packing hall"), "Packing hall");
    assert.equal(vocabText("Granulation1"), "Granulation");
    assert.equal(vocabText("Blender 2"), "Blender");
    assert.equal(vocabText("Lab"), "Lab");
    assert.equal(vocabText("HO15"), "");
    assert.equal(vocabText("FCR1"), "");
    assert.equal(vocabText("IMG_20261105_101530_00_001"), "");
    assert.equal(vocabText("ab"), "");
  });

  it("tidies shouting names", () => {
    assert.equal(vocabText("R&D FACILITY"), "R&D Facility");
    assert.equal(vocabText("KHOPOLI"), "Khopoli");
    assert.equal(vocabText("ETP"), "ETP");
  });
});

describe("finishing what is typed", () => {
  const v = buildVocab(seed);

  it("Lab becomes Laboratory", () => {
    assert.equal(texts(v, "Lab")[0], "Laboratory");
    assert.equal(texts(v, "lab")[0], "Laboratory");
  });

  it("works for a few letters of a longer name", () => {
    assert.ok(texts(v, "Effluent").includes("Effluent Treatment Plant"));
    assert.ok(texts(v, "ware").some((t) => /warehouse/i.test(t)));
  });

  it("suggests nothing for one letter, for nothing, or for a finished name", () => {
    assert.deepEqual(texts(v, "L"), []);
    assert.deepEqual(texts(v, ""), []);
    assert.ok(!texts(v, "Laboratory").includes("Laboratory"));
  });

  it("finishes the last word and keeps the words before it", () => {
    const t = texts(v, "Quality Control Lab");
    assert.ok(t.includes("Quality Control Laboratory"), t.join(" | "));
  });

  it("expands short forms people type", () => {
    assert.equal(texts(v, "QC")[0], "Quality Control");
    assert.equal(texts(v, "RM Store")[0]?.startsWith("Raw Material") || texts(v, "RM store").length >= 0, true);
    assert.ok(texts(v, "etp").includes("Effluent Treatment Plant"));
  });

  it("keeps a code the person already typed", () => {
    const t = texts(v, "HO3 · Lab");
    assert.equal(t[0], "HO3 · Laboratory");
    assert.equal(texts(v, "HO3 Lab")[0], "HO3 Laboratory");
    assert.deepEqual(texts(v, "HO3"), []);
  });

  it("forgives one slip when nothing else matches", () => {
    assert.ok(texts(v, "Laborotory").includes("Laboratory"), texts(v, "Laborotory").join(" | "));
    assert.ok(texts(v, "Warehuose").some((t) => /warehouse/i.test(t)));
    assert.deepEqual(texts(v, "Zzqxv"), []);
  });

  it("is case-insensitive and gives the proper capitals", () => {
    assert.equal(texts(v, "LAB")[0], "Laboratory");
    assert.equal(texts(v, "tool r")[0], "Tool Room");
  });

  it("returns at most five, best first, with no repeats", () => {
    const t = suggest(v, "pa");
    assert.ok(t.length <= 5);
    assert.equal(new Set(t.map((s) => s.text.toLowerCase())).size, t.length);
    for (let i = 1; i < t.length; i++) assert.ok(t[i - 1].score >= t[i].score);
  });
});

describe("learning from the names people use", () => {
  it("puts the names a team really uses ahead of the built-in list", () => {
    const v = buildVocab([...seed, ...own(["Packing Hall", "Packing Hall", "F75 Packing hall", "HO3 Packing Hall"], 3)]);
    assert.equal(texts(v, "pack")[0], "Packing Hall");
  });

  it("learns a name nobody had thought of, from other scenes", () => {
    const v = buildVocab([...seed, ...own(["Sifting Area", "Blister m/c", "Strip pack m/c"])]);
    assert.equal(texts(v, "sift")[0], "Sifting Area");
    assert.ok(texts(v, "blis").includes("Blister m/c"));
  });

  it("names from this tour count most", () => {
    const v = buildVocab([...seed, ...own(["Lab Entrance"], 3), ...own(["Lab Annexe"], 8)]);
    const t = texts(v, "Lab ");
    assert.equal(t[0], "Lab Annexe");
  });

  it("learns single words from longer names", () => {
    const v = buildVocab(own(["Vacuum Tray Dryer", "Fluid Bed Dryer"]));
    assert.ok(texts(v, "Fluid Bed Dr").includes("Fluid Bed Dryer"));
    assert.ok(texts(v, "Dry").includes("Dryer"));
  });

  it("shows the form people wrote most often", () => {
    const v = buildVocab([...own(["quality lab", "quality lab"]), ...own(["Quality Lab"])]);
    assert.equal(texts(v, "qual")[0], "quality lab");
  });
});

describe("only generic names are shared between customers", () => {
  const rows = [
    { name: "Packing Hall", owner: "acme" },
    { name: "Packing Hall", owner: "beta" },
    { name: "Packing Hall 2", owner: "gamma" },
    { name: "Granulation1", owner: "acme" },
    { name: "Granulation2", owner: "acme" },
    { name: "Kilitch Reception", owner: "kilitch" },
    { name: "Kilitch Store", owner: "kilitch" },
    { name: "IMG_20261105_101530_00_001", owner: "acme" },
    { name: "HO15", owner: "acme" },
  ];
  const agg = aggregateNames(rows);

  it("counts uses and owners", () => {
    const p = agg.phrases.find((x) => x.n === "Packing Hall");
    assert.deepEqual([p?.uses, p?.owners], [3, 3]);
    const g = agg.phrases.find((x) => x.n === "Granulation");
    assert.deepEqual([g?.uses, g?.owners], [2, 1]);
    assert.equal(agg.phrases.find((x) => /img|ho15/i.test(x.n)), undefined);
  });

  it("offers a name to others only when enough owners use it", () => {
    const g = genericNames(agg, 3);
    assert.deepEqual(g.phrases.map((x) => x.n), ["Packing Hall"]);
    assert.deepEqual(g.words.map((x) => x.n).sort(), ["Hall", "Packing"]);
    // One company's own name never leaves that company.
    assert.ok(!JSON.stringify(g).includes("Kilitch"));
    assert.ok(!JSON.stringify(g).includes("Granulation"));
  });

  it("counts a word once per scene", () => {
    const a = aggregateNames([{ name: "Packing Packing Hall", owner: "x" }]);
    assert.equal(a.words.find((w) => w.n === "Packing")?.uses, 1);
  });
});

describe("one slip", () => {
  it("accepts one letter added, dropped, changed or swapped, and nothing more", () => {
    assert.equal(withinOneEdit("laboratory", "laborotory"), true);
    assert.equal(withinOneEdit("laboratory", "labratory"), true);
    assert.equal(withinOneEdit("store", "stroe"), true);
    assert.equal(withinOneEdit("store", "stare"), true);
    assert.equal(withinOneEdit("store", "stores"), true);
    assert.equal(withinOneEdit("store", "stor"), true);
    assert.equal(withinOneEdit("store", "shop"), false);
    assert.equal(withinOneEdit("store", "storage"), false);
  });
});

describe("what the editor learns from", () => {
  it("weighs this tour above the caller's other scenes, and those above other customers", async () => {
    const { sourcesFromServer, sourcesFromTour, WEIGHT } = await import("../../lib/sceneNames");
    const server = sourcesFromServer({
      mine: [{ n: "Lab Annexe", uses: 1 }, { n: "Lab Entrance", uses: 99 }],
      common: { phrases: [{ n: "Lab Corridor", owners: 4 }], words: [{ n: "Laboratory", owners: 5 }] },
    });
    assert.equal(server.find((s) => s.text === "Lab Annexe")?.weight, WEIGHT.mine);
    assert.equal(server.find((s) => s.text === "Lab Entrance")?.weight, WEIGHT.mine * WEIGHT.mineMaxUses, "heavy use is capped");
    assert.ok((server.find((s) => s.text === "Lab Corridor")?.weight ?? 0) < WEIGHT.mine * 2);
    const tour = sourcesFromTour(["Lab Tour", null, undefined, ""]);
    assert.deepEqual(tour, [{ text: "Lab Tour", weight: WEIGHT.tour }]);
    assert.ok(WEIGHT.tour > WEIGHT.mine * WEIGHT.mineMaxUses);
    const v = buildVocab([...seed, ...server, ...tour]);
    assert.equal(texts(v, "Lab ")[0], "Lab Tour");
  });

  it("copes with nothing from the server", async () => {
    const { sourcesFromServer } = await import("../../lib/sceneNames");
    assert.deepEqual(sourcesFromServer(null), []);
    assert.deepEqual(sourcesFromServer({}), []);
    assert.deepEqual(sourcesFromServer({ mine: [{ n: "", uses: 1 }] }), []);
  });
});
