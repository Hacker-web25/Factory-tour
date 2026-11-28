/**
 * Deciding the groups by hand: an old tour with no photo times and no codes
 * (the six "Shree Foods Cafe" scenes) cannot be grouped by guessing, so the
 * person chooses where each unit starts. Every way of choosing must give the
 * same kind of answer: the cut points, in order, that the Units window uses.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Scene } from "../../lib/types";
import {
  contentScenes,
  cutsEqual,
  cutsEvery,
  cutsFromSizes,
  parseSizes,
  proposeCuts,
  proposeUnits,
  unitsFromCuts,
  type UnitScene,
} from "../../lib/units";
import { buildUnitsPlan, type PlanUnit } from "../../lib/unitsPlan";

let n = 0;
function sc(name: string, extra: Partial<UnitScene> = {}): UnitScene {
  n++;
  return { id: `s${String(n).padStart(3, "0")}`, name, order_index: n, is_flat: false, ...extra };
}
function cafe(): UnitScene[] {
  n = 0;
  return [
    sc("01-OUTSIDE LOCATION"),
    sc("02-SHREE FOODS CAFE"),
    sc("03-ENTRANCE"),
    sc("04-CAFE IMAGE1"),
    sc("05-CAFE IMAGE2"),
    sc("06 (CAFE IMAGE3)"),
  ];
}
const ids = (scenes: UnitScene[], ...at: number[]) => at.map((i) => scenes[i].id);
const sizesOf = (scenes: UnitScene[], cuts: string[]) => unitsFromCuts(scenes, cuts).map((u) => u.memberIds.length);

describe("typing how many scenes go in each unit", () => {
  it("reads the numbers however they are separated", () => {
    assert.deepEqual(parseSizes("3, 2, 4"), [3, 2, 4]);
    assert.deepEqual(parseSizes("3 2 4"), [3, 2, 4]);
    assert.deepEqual(parseSizes("3+2+4"), [3, 2, 4]);
    assert.deepEqual(parseSizes(" 3,2 ,4, "), [3, 2, 4]);
    assert.deepEqual(parseSizes("7"), [7]);
  });

  it("refuses what cannot be a size", () => {
    assert.equal(parseSizes(""), null);
    assert.equal(parseSizes("abc"), null);
    assert.equal(parseSizes("3, 0, 2"), null);
    assert.equal(parseSizes("99999"), null);
  });

  it("first three here, the next two there, the rest in a last unit", () => {
    const s = cafe();
    assert.deepEqual(cutsFromSizes(s, [3, 2]), ids(s, 3, 5));
    assert.deepEqual(sizesOf(s, cutsFromSizes(s, [3, 2])), [3, 2, 1]);
  });

  it("makes no extra unit when the sizes use every scene", () => {
    const s = cafe();
    assert.deepEqual(sizesOf(s, cutsFromSizes(s, [3, 3])), [3, 3]);
    assert.deepEqual(sizesOf(s, cutsFromSizes(s, [2, 2, 2])), [2, 2, 2]);
  });

  it("ignores sizes that run past the last scene", () => {
    const s = cafe();
    assert.deepEqual(sizesOf(s, cutsFromSizes(s, [4, 9, 5])), [4, 2]);
    assert.deepEqual(sizesOf(s, cutsFromSizes(s, [50])), [6]);
  });

  it("a size of 1 is a unit of one scene", () => {
    const s = cafe();
    assert.deepEqual(sizesOf(s, cutsFromSizes(s, [1, 1, 1])), [1, 1, 1, 3]);
  });
});

describe("equal groups and every N scenes", () => {
  it("shares the scenes as evenly as possible, the first units taking the extra", () => {
    const s = cafe();
    assert.deepEqual(sizesOf(s, cutsEqual(s, 2)), [3, 3]);
    assert.deepEqual(sizesOf(s, cutsEqual(s, 3)), [2, 2, 2]);
    assert.deepEqual(sizesOf(s, cutsEqual(s, 4)), [2, 2, 1, 1]);
    assert.deepEqual(sizesOf(s, cutsEqual(s, 1)), [6]);
  });

  it("never makes more units than scenes, or fewer than one", () => {
    const s = cafe();
    assert.deepEqual(sizesOf(s, cutsEqual(s, 40)), [1, 1, 1, 1, 1, 1]);
    assert.deepEqual(sizesOf(s, cutsEqual(s, 0)), [6]);
    assert.deepEqual(sizesOf(s, cutsEqual(s, -3)), [6]);
  });

  it("starts a new unit every N scenes", () => {
    const s = cafe();
    assert.deepEqual(sizesOf(s, cutsEvery(s, 4)), [4, 2]);
    assert.deepEqual(sizesOf(s, cutsEvery(s, 2)), [2, 2, 2]);
    assert.deepEqual(sizesOf(s, cutsEvery(s, 6)), [6]);
    assert.deepEqual(sizesOf(s, cutsEvery(s, 100)), [6]);
  });
});

describe("splitting and joining by hand", () => {
  it("a tour nobody can guess is one group, and one cut makes two", () => {
    const s = cafe();
    assert.deepEqual(proposeCuts(s), { cutIds: [], basis: "none" });
    assert.equal(proposeUnits(s).units.length, 1);
    const u = unitsFromCuts(s, [s[2].id]);
    assert.deepEqual(u.map((x) => x.memberIds), [ids(s, 0, 1), ids(s, 2, 3, 4, 5)]);
  });

  it("the order the cuts were added in does not matter, and repeats do no harm", () => {
    const s = cafe();
    const a = unitsFromCuts(s, [s[4].id, s[2].id, s[2].id]);
    const b = unitsFromCuts(s, [s[2].id, s[4].id]);
    assert.deepEqual(a.map((x) => x.memberIds), b.map((x) => x.memberIds));
    assert.deepEqual(a.map((x) => x.memberIds.length), [2, 2, 2]);
  });

  it("a cut on the first scene, or on a scene that does not exist, changes nothing", () => {
    const s = cafe();
    assert.deepEqual(sizesOf(s, [s[0].id, "nope"]), [6]);
  });

  it("each unit is keyed by its first scene, so a name typed for it survives other splits", () => {
    const s = cafe();
    const before = unitsFromCuts(s, [s[3].id]);
    const after = unitsFromCuts(s, [s[1].id, s[3].id]);
    assert.equal(before[1].key, after[2].key);
    assert.equal(before[1].key, `g-${s[3].id}`);
  });

  it("scenes are taken in tour order, not the order they were handed over", () => {
    const s = cafe().reverse();
    assert.deepEqual(contentScenes(s).map((x) => x.name.slice(0, 2)), ["01", "02", "03", "04", "05", "06"]);
    assert.deepEqual(sizesOf(s, cutsFromSizes(s, [3])), [3, 3]);
  });
});

describe("a tour that already has dividers", () => {
  function withDividers(): UnitScene[] {
    n = 0;
    return [
      sc("HEAD OFFICE", { is_flat: true, is_divider: true }),
      sc("HO3"), sc("HO2"), sc("HO1"), sc("HO0"),
      sc("STORES", { is_flat: true, is_divider: true }),
      sc("S2"), sc("S1"),
    ];
  }

  it("a divider always starts its own unit; the guess is the dividers", () => {
    const s = withDividers();
    assert.equal(proposeCuts(s).basis, "dividers");
    assert.deepEqual(unitsFromCuts(s, []).map((u) => [u.title, u.memberIds.length]), [["HEAD OFFICE", 4], ["STORES", 2]]);
  });

  it("a unit can be split further, and the new part has no divider yet", () => {
    const s = withDividers();
    const u = unitsFromCuts(s, [s[3].id]);
    assert.deepEqual(u.map((x) => [x.dividerId ? x.title : null, x.memberIds.length]), [["HEAD OFFICE", 2], [null, 2], ["STORES", 2]]);
    assert.equal(u[1].title, "");
  });

  it("dividers are not counted as scenes when sharing them out", () => {
    const s = withDividers();
    assert.equal(contentScenes(s).length, 6);
  });
});

describe("from the chosen groups to the changes made", () => {
  function asScenes(list: UnitScene[]): Scene[] {
    return list.map((u) => ({ ...u, tour_id: "t1", image_path: `t1/${u.id}.jpg`, thumbnail_path: null, folder: null }) as unknown as Scene);
  }
  const OPTS = { direction: "down", space: false, keepRoom: true } as const;

  it("two named units give each their own folder and numbering; an unnamed one is left alone", () => {
    const s = asScenes(cafe());
    const cuts = cutsFromSizes(s, [3, 2]);
    const units: PlanUnit[] = unitsFromCuts(s, cuts).map((u, i) => ({
      ...u,
      title: ["Outside", "Cafe", ""][i],
      code: ["OU", "CF", ""][i],
      addDivider: true,
      redraw: false,
    }));
    const plan = buildUnitsPlan(s, units, OPTS);
    assert.equal(plan.summary.dividersAdded, 2, "the unnamed third unit gets no divider");
    const folderOf = (id: string) => plan.patches.find((p) => p.id === id)?.patch.folder;
    assert.deepEqual(s.slice(0, 3).map((x) => folderOf(x.id)), ["Outside", "Outside", "Outside"]);
    assert.deepEqual(s.slice(3, 5).map((x) => folderOf(x.id)), ["Cafe", "Cafe"]);
    assert.equal(folderOf(s[5].id), undefined, "the last scene is untouched");
    const toName = (id: string) => plan.patches.find((p) => p.id === id)?.patch.name;
    assert.deepEqual(s.slice(0, 3).map((x) => toName(x.id)?.slice(0, 4)), ["OU3 ", "OU2 ", "OU1 "]);
  });
});

describe("keeping the room name of an old, hand-numbered scene", () => {
  it("drops the number typed in front, and the brackets around the room", async () => {
    const { extractRoom } = await import("../../lib/units");
    assert.equal(extractRoom("01-OUTSIDE LOCATION"), "OUTSIDE LOCATION");
    assert.equal(extractRoom("02 - Shree Foods Cafe"), "Shree Foods Cafe");
    assert.equal(extractRoom("3) Store"), "Store");
    assert.equal(extractRoom("2. Lobby"), "Lobby");
    assert.equal(extractRoom("06 (CAFE IMAGE3)"), "CAFE IMAGE3");
    assert.equal(extractRoom("(Reception)"), "Reception");
  });

  it("keeps a number that belongs to the name", async () => {
    const { extractRoom } = await import("../../lib/units");
    assert.equal(extractRoom("3D Printer Lab"), "3D Printer Lab");
    assert.equal(extractRoom("2 Floor Store"), "2 Floor Store");
    assert.equal(extractRoom("Blender 2"), "Blender 2");
    assert.equal(extractRoom("01"), "");
    assert.equal(extractRoom("12-"), "");
  });

  it("the Shree Foods scenes come out as clean numbers with their rooms", async () => {
    const { planUnitRenames } = await import("../../lib/units");
    const s = cafe();
    const steps = planUnitRenames(s.slice(0, 3), { code: "OU", direction: "down", keepRoom: true });
    assert.deepEqual(steps.map((x) => x.to), ["OU3 · OUTSIDE LOCATION", "OU2 · SHREE FOODS CAFE", "OU1 · ENTRANCE"]);
  });
});
