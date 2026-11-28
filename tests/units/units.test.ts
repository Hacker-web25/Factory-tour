/**
 * Units: finding where a factory's units start, numbering their scenes, and
 * fitting the divider text. Names below are shaped like the real Kilitch tour
 * (numbers counting down inside each unit, a flat capitals scene as a divider).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  countAreas,
  dividerFileName,
  extractRoom,
  groupByUnit,
  hiddenByCollapse,
  inferCode,
  isCameraName,
  layoutDividerText,
  looksLikeDivider,
  parseCodedName,
  planUnitRenames,
  proposeUnits,
  suggestCode,
  timeBreaks,
  type UnitScene,
} from "../../lib/units";

let n = 0;
function sc(name: string, extra: Partial<UnitScene> = {}): UnitScene {
  n++;
  return { id: `s${String(n).padStart(3, "0")}`, name, order_index: n, is_flat: false, ...extra };
}
const MIN = 60_000;
const at = (base: number, minutes: number) => new Date(base + minutes * MIN).toISOString();

function kilitchLike(): UnitScene[] {
  n = 0;
  const out: UnitScene[] = [sc("KHOPOLI", { is_flat: true })];
  for (let i = 77; i >= 1; i--) out.push(sc(i % 5 === 0 ? `F${i} Packing hall` : `F${i}`));
  out.push(sc("HEADOFFICE", { is_flat: true }));
  for (let i = 15; i >= 1; i--) out.push(sc(i <= 6 && i !== 4 ? `H0 ${i}` : `HO ${i}`));
  out.push(sc("R&D FACILITY", { is_flat: true }));
  for (let i = 16; i >= 1; i--) out.push(sc(`R&D ${i}`));
  out.push(sc("REGULATORY", { is_flat: true }));
  out.push(sc("RO-2"), sc("RO-1"));
  return out;
}

describe("reading names", () => {
  it("reads a code and a number in the ways people write them", () => {
    assert.deepEqual(parseCodedName("HO 15"), { code: "HO", num: 15, room: "" });
    assert.deepEqual(parseCodedName("HO15"), { code: "HO", num: 15, room: "" });
    assert.deepEqual(parseCodedName("R&D 16"), { code: "R&D", num: 16, room: "" });
    assert.deepEqual(parseCodedName("F77"), { code: "F", num: 77, room: "" });
    assert.deepEqual(parseCodedName("RO-2"), { code: "RO", num: 2, room: "" });
    assert.deepEqual(parseCodedName("HO 3 - Reception"), { code: "HO", num: 3, room: "Reception" });
  });

  it("treats the typo H0 as HO", () => {
    assert.equal(parseCodedName("H0 6")?.code, "HO");
  });

  it("does not mistake a room name or a camera name for a code", () => {
    assert.equal(parseCodedName("Reception 3"), null);
    assert.equal(parseCodedName("Lab 2"), null);
    assert.equal(parseCodedName("IMG_20261105_101530_00_001"), null);
    assert.equal(isCameraName("PXL_20261105_101530123"), true);
    assert.equal(isCameraName("Reception"), false);
  });

  it("keeps a room name and drops everything else", () => {
    assert.equal(extractRoom("F75 Packing hall"), "Packing hall");
    assert.equal(extractRoom("F75"), "");
    assert.equal(extractRoom("H0 6"), "");
    assert.equal(extractRoom("Reception"), "Reception");
    assert.equal(extractRoom("IMG_20261105_101530_00_001"), "");
  });

  it("finds the code a unit already uses, even with a typo or two", () => {
    const names = ["HO 15", "HO 14", "H0 6", "H0 5", "HO 4", "HO 3"];
    assert.equal(inferCode(names), "HO");
    assert.equal(inferCode(["Reception", "Lobby"]), null);
  });

  it("suggests a code from a title", () => {
    assert.equal(suggestCode("HEAD OFFICE"), "HO");
    assert.equal(suggestCode("R&D FACILITY"), "R&D");
    assert.equal(suggestCode("Khopoli Nutra Unit"), "KN");
    assert.equal(suggestCode("REGULATORY"), "REG");
    assert.equal(suggestCode(""), "");
  });
});

describe("renaming a unit", () => {
  it("counts down by position, first scene highest", () => {
    n = 0;
    const m = [sc("x1"), sc("x2"), sc("x3")];
    const steps = planUnitRenames(m, { code: "HO", keepRoom: false });
    assert.deepEqual(
      steps.map((s) => s.to),
      ["HO3", "HO2", "HO1"],
    );
  });

  it("can count up and put a space after the code", () => {
    n = 0;
    const m = [sc("a"), sc("b")];
    assert.deepEqual(
      planUnitRenames(m, { code: "R&D", direction: "up", space: true, keepRoom: false }).map((s) => s.to),
      ["R&D 1", "R&D 2"],
    );
  });

  it("keeps the room name after the number, unless asked not to", () => {
    n = 0;
    const m = [sc("F2 Reception"), sc("F1")];
    assert.deepEqual(planUnitRenames(m, { code: "HO" }).map((s) => s.to), ["HO2 · Reception", "HO1"]);
    assert.deepEqual(planUnitRenames(m, { code: "HO", keepRoom: false }).map((s) => s.to), ["HO2", "HO1"]);
  });

  it("does not count the divider or a flat picture, and leaves them alone", () => {
    n = 0;
    const m = [sc("HEAD OFFICE", { is_divider: true, is_flat: true }), sc("a"), sc("Floor plan", { is_flat: true }), sc("b")];
    const steps = planUnitRenames(m, { code: "HO", keepRoom: false });
    assert.deepEqual(steps.map((s) => [s.from, s.to]), [["a", "HO2"], ["b", "HO1"]]);
  });

  it("skips scenes whose name is already right and returns nothing without a code", () => {
    n = 0;
    const m = [sc("HO2"), sc("HO1")];
    assert.deepEqual(planUnitRenames(m, { code: "HO", keepRoom: false }), []);
    assert.deepEqual(planUnitRenames(m, { code: "  " }), []);
  });

  it("turns camera names into clean numbers", () => {
    n = 0;
    const m = [sc("IMG_20261105_101530_00_001"), sc("IMG_20261105_101544_00_002")];
    assert.deepEqual(planUnitRenames(m, { code: "HO" }).map((s) => s.to), ["HO2", "HO1"]);
  });
});

describe("finding the units", () => {
  it("uses the dividers already in the tour (the Kilitch tour)", () => {
    const scenes = kilitchLike();
    assert.equal(looksLikeDivider(scenes[0]), true);
    const p = proposeUnits(scenes);
    assert.equal(p.basis, "dividers");
    assert.deepEqual(
      p.units.map((u) => [u.title, u.code, u.memberIds.length, u.legacyDivider]),
      [
        ["KHOPOLI", "F", 77, true],
        ["HEADOFFICE", "HO", 15, true],
        ["R&D FACILITY", "R&D", 16, true],
        ["REGULATORY", "RO", 2, true],
      ],
    );
  });

  it("does not take a flat scene with a number for a divider", () => {
    n = 0;
    assert.equal(looksLikeDivider(sc("MAP 2", { is_flat: true })), false);
    assert.equal(looksLikeDivider(sc("Floor plan", { is_flat: true })), false);
    assert.equal(looksLikeDivider(sc("X", { is_flat: true })), false);
    assert.equal(looksLikeDivider(sc("KHOPOLI", { is_flat: false })), false);
  });

  it("keeps scenes that come before the first divider", () => {
    n = 0;
    const p = proposeUnits([sc("Gate"), sc("Lobby"), sc("STORES", { is_flat: true, is_divider: true }), sc("S2"), sc("S1")]);
    assert.equal(p.units.length, 2);
    assert.equal(p.units[0].dividerId, null);
    assert.equal(p.units[0].memberIds.length, 2);
    assert.equal(p.units[1].legacyDivider, false);
  });

  it("splits where the names change code when there are no dividers", () => {
    n = 0;
    const scenes = [sc("HO 3"), sc("HO 2"), sc("HO 1"), sc("RD 3"), sc("RD 2"), sc("RD 1")];
    const p = proposeUnits(scenes);
    assert.equal(p.basis, "names");
    assert.deepEqual(p.units.map((u) => [u.code, u.memberIds.length]), [["HO", 3], ["RD", 3]]);
  });

  it("splits at long pauses between photos taken", () => {
    n = 0;
    const t0 = Date.UTC(2026, 10, 5, 4, 0, 0);
    const scenes: UnitScene[] = [];
    // 10 photos a minute apart, a 40 minute drive, 8 more, a 3 hour lunch, 6 more.
    for (let i = 0; i < 10; i++) scenes.push(sc(`IMG_${i}`, { captured_at: at(t0, i) }));
    for (let i = 0; i < 8; i++) scenes.push(sc(`IMG_${i}`, { captured_at: at(t0, 50 + i) }));
    for (let i = 0; i < 6; i++) scenes.push(sc(`IMG_${i}`, { captured_at: at(t0, 240 + i) }));
    const p = proposeUnits(scenes);
    assert.equal(p.basis, "time");
    assert.deepEqual(p.units.map((u) => u.memberIds.length), [10, 8, 6]);
  });

  it("does not split a steady walk-through", () => {
    n = 0;
    const t0 = Date.UTC(2026, 10, 5, 4, 0, 0);
    const scenes = Array.from({ length: 30 }, (_, i) => sc(`p${i}`, { captured_at: at(t0, i) }));
    assert.equal(proposeUnits(scenes).units.length, 1);
  });

  it("ignores times when too few photos carry one", () => {
    n = 0;
    const t0 = Date.UTC(2026, 10, 5);
    const scenes = [sc("a", { captured_at: at(t0, 0) }), sc("b"), sc("c"), sc("d", { captured_at: at(t0, 500) }), sc("e")];
    assert.equal(timeBreaks(scenes), null);
  });

  it("splits more when asked to", () => {
    n = 0;
    const t0 = Date.UTC(2026, 10, 5);
    const scenes: UnitScene[] = [];
    for (let i = 0; i < 6; i++) scenes.push(sc(`IMG_${i}`, { captured_at: at(t0, i) }));
    for (let i = 0; i < 6; i++) scenes.push(sc(`IMG_${i}`, { captured_at: at(t0, 12 + i) })); // 7 minute pause
    assert.equal(proposeUnits(scenes, 1).units.length, 1);
    assert.equal(proposeUnits(scenes, 4).units.length, 2);
  });

  it("returns nothing for an empty tour", () => {
    assert.deepEqual(proposeUnits([]), { units: [], basis: "none" });
  });
});

describe("the menu and the strip", () => {
  it("groups a unit under its divider and keeps loose scenes apart", () => {
    n = 0;
    const scenes = [
      sc("Gate"),
      sc("HEAD OFFICE", { is_divider: true, is_flat: true, folder: "HEAD OFFICE" }),
      sc("HO2", { folder: "HEAD OFFICE" }),
      sc("HO1", { folder: "HEAD OFFICE" }),
    ];
    const g = groupByUnit(scenes);
    assert.equal(g.length, 2);
    assert.equal(g[0].label, null);
    assert.equal(g[1].label, "HEAD OFFICE");
    assert.equal(g[1].divider?.name, "HEAD OFFICE");
    assert.deepEqual(g[1].scenes.map((s) => s.name), ["HO2", "HO1"]);
  });

  it("uses the divider's own name when it has no folder", () => {
    n = 0;
    const g = groupByUnit([sc("STORES", { is_divider: true, is_flat: true })]);
    assert.equal(g[0].label, "STORES");
    assert.equal(g[0].divider?.name, "STORES");
  });

  it("folds a unit up to its divider", () => {
    n = 0;
    const scenes = [
      sc("A", { is_divider: true, folder: "A" }),
      sc("a1", { folder: "A" }),
      sc("a2", { folder: "A" }),
      sc("B", { is_divider: true, folder: "B" }),
      sc("b1", { folder: "B" }),
      sc("loose"),
    ];
    const shown = hiddenByCollapse(scenes, new Set(["A"])).map((s) => s.name);
    assert.deepEqual(shown, ["A", "B", "b1", "loose"]);
    assert.equal(hiddenByCollapse(scenes, new Set()).length, 6);
  });

  it("does not count a divider as an area", () => {
    n = 0;
    assert.equal(countAreas([sc("A", { is_divider: true }), sc("a1"), sc("a2")]), 2);
  });
});

describe("the divider card", () => {
  // A stand-in for the canvas: every letter is 0.6 of the font size wide.
  const measure = (text: string, fs: number) => text.length * fs * 0.6;

  it("puts a short title on one big line", () => {
    const t = layoutDividerText("Head Office", 4096, 2048, measure);
    assert.deepEqual(t.lines, ["HEAD OFFICE"]);
    assert.ok(t.fontSize > 300);
  });

  it("wraps and shrinks a long title so it fits", () => {
    const title = "KHOPOLI NUTRA UNIT AND ALL THE SATELLITE BUILDINGS BEHIND IT";
    const t = layoutDividerText(title, 4096, 2048, measure);
    assert.ok(t.lines.length <= 3);
    for (const line of t.lines) assert.ok(measure(line, t.fontSize) <= 4096 * 0.8 + 1);
    assert.ok(t.lines.length * t.fontSize * 1.12 <= 2048 * 0.62 + 1);
  });

  it("never loops on a single huge word", () => {
    const t = layoutDividerText("X".repeat(200), 4096, 2048, measure);
    assert.equal(t.lines.length, 1);
  });

  it("names the file after the title", () => {
    assert.equal(dividerFileName("R&D FACILITY"), "divider-r-and-d-facility.png");
    assert.equal(dividerFileName("   "), "divider-unit.png");
  });
});
