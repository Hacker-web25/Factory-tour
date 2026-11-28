/**
 * Applying the Units tool to a tour, and taking it back. A fake tour stands in
 * for the editor page: it keeps scenes in memory and records what was written.
 */
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Scene } from "../../lib/types";
import { proposeUnits } from "../../lib/units";
import {
  applyUnits,
  buildUnitsPlan,
  undoUnits,
  unitIsReady,
  type PlanUnit,
  type UnitsContext,
} from "../../lib/unitsPlan";

let n = 0;
function scene(name: string, extra: Partial<Scene> = {}): Scene {
  n++;
  return {
    id: `s${String(n).padStart(3, "0")}`,
    tour_id: "t1",
    name,
    image_path: `t1/${name.replace(/\W+/g, "_")}.jpg`,
    order_index: n,
    is_flat: false,
    folder: null,
    thumbnail_path: null,
    ...extra,
  } as Scene;
}

const OPTS = { direction: "down", space: false, keepRoom: true } as const;

function toPlanUnits(scenes: Scene[], titles: Record<string, string> = {}): PlanUnit[] {
  return proposeUnits(scenes).units.map((u) => ({
    ...u,
    title: titles[u.key] ?? u.title,
    addDivider: true,
    redraw: false,
  }));
}

/** An in-memory tour that behaves like the editor page does. */
function fakeTour(initial: Scene[]) {
  const state = { scenes: initial.map((s) => ({ ...s })), files: new Set<string>(), pictures: 0, failInsertAt: -1, inserts: 0, orderWrites: 0 };
  const ctx: UnitsContext = {
    tourId: "t1",
    getScenes: () => state.scenes.map((s) => ({ ...s })),
    async makeDividerPicture(title) {
      const p = `t1/divider-${title.toLowerCase().replace(/\W+/g, "-")}-${++state.pictures}.png`;
      state.files.add(p);
      return p;
    },
    async insertScene(row) {
      if (state.inserts++ === state.failInsertAt) return null;
      const s = { ...(row as unknown as Scene), id: `new${state.inserts}` } as Scene;
      state.scenes.push(s);
      return s;
    },
    changeScene(next) {
      state.scenes = state.scenes.map((s) => (s.id === next.id ? { ...next } : s));
    },
    async writeOrder(ids) {
      state.orderWrites++;
      state.scenes = state.scenes.map((s) => ({ ...s, order_index: ids.indexOf(s.id) })).sort((a, b) => a.order_index - b.order_index);
    },
    async deleteScene(id) {
      state.scenes = state.scenes.filter((s) => s.id !== id);
    },
    async removeFile(path) {
      state.files.delete(path);
    },
  };
  return { state, ctx };
}

const names = (scenes: Scene[]) => [...scenes].sort((a, b) => a.order_index - b.order_index).map((s) => s.name);

describe("planning", () => {
  beforeEach(() => {
    n = 0;
  });

  it("needs a title and a code before a unit is included", () => {
    assert.equal(unitIsReady({ title: "", code: "HO", memberIds: ["a"], dividerId: null }), false);
    assert.equal(unitIsReady({ title: "Head office", code: " ", memberIds: ["a"], dividerId: null }), false);
    assert.equal(unitIsReady({ title: "Head office", code: "HO", memberIds: [], dividerId: null }), false);
    assert.equal(unitIsReady({ title: "Head office", code: "HO", memberIds: ["a"], dividerId: null }), true);
  });

  it("converts a hand-made divider and renumbers its unit without drawing a new card", () => {
    const scenes = [scene("HEADOFFICE", { is_flat: true }), scene("x1"), scene("x2 Reception"), scene("x3")];
    const units = toPlanUnits(scenes).map((u) => ({ ...u, code: "HO" }));
    const plan = buildUnitsPlan(scenes, units, OPTS);
    assert.equal(plan.newDividers.length, 0);
    assert.equal(plan.newPictures.length, 0);
    assert.equal(plan.summary.dividersConverted, 1);
    const byId = new Map(plan.patches.map((p) => [p.id, p.patch]));
    assert.deepEqual(byId.get(scenes[0].id), { is_divider: true, folder: "HEADOFFICE", unit_code: "HO" });
    assert.equal(byId.get(scenes[1].id)?.name, "HO3");
    assert.equal(byId.get(scenes[2].id)?.name, "HO2 · Reception");
    assert.equal(byId.get(scenes[3].id)?.name, "HO1");
    assert.equal(byId.get(scenes[3].id)?.folder, "HEADOFFICE");
  });

  it("adds a divider before the first scene of a unit that has none", () => {
    const scenes = [scene("IMG_1"), scene("IMG_2"), scene("IMG_3")];
    const units = toPlanUnits(scenes).map((u) => ({ ...u, title: "Nutra unit", code: "NU" }));
    const plan = buildUnitsPlan(scenes, units, OPTS);
    assert.equal(plan.newDividers.length, 1);
    assert.deepEqual(plan.finalOrder, ["new-" + units[0].key, ...scenes.map((s) => s.id)]);
  });

  it("leaves a unit alone until it has a title", () => {
    const scenes = [scene("IMG_1"), scene("IMG_2")];
    const plan = buildUnitsPlan(scenes, toPlanUnits(scenes), OPTS);
    assert.equal(plan.patches.length, 0);
    assert.equal(plan.summary.units, 0);
  });

  it("draws the card again when the title changes or when asked", () => {
    const scenes = [scene("KHOPOLI", { is_flat: true }), scene("F2"), scene("F1")];
    const base = toPlanUnits(scenes)[0];
    assert.equal(buildUnitsPlan(scenes, [{ ...base }], OPTS).newPictures.length, 0);
    assert.equal(buildUnitsPlan(scenes, [{ ...base, redraw: true }], OPTS).newPictures.length, 1);
    const renamed = buildUnitsPlan(scenes, [{ ...base, title: "Khopoli Nutra Unit" }], OPTS);
    assert.deepEqual(renamed.newPictures, [{ id: scenes[0].id, title: "Khopoli Nutra Unit" }]);
    assert.equal(renamed.patches.find((p) => p.id === scenes[0].id)?.patch.name, "Khopoli Nutra Unit");
  });

  it("changes nothing when the tour is already as asked", () => {
    const scenes = [
      scene("HEAD OFFICE", { is_flat: true, is_divider: true, folder: "HEAD OFFICE", unit_code: "HO" }),
      scene("HO2", { folder: "HEAD OFFICE" }),
      scene("HO1", { folder: "HEAD OFFICE" }),
    ];
    const plan = buildUnitsPlan(scenes, toPlanUnits(scenes), OPTS);
    assert.equal(plan.patches.length, 0);
    assert.equal(plan.renames.length, 0);
  });
});

describe("applying and undoing", () => {
  beforeEach(() => {
    n = 0;
  });

  it("does the whole job on a tour shaped like Kilitch, then takes it back exactly", async () => {
    const scenes: Scene[] = [scene("KHOPOLI", { is_flat: true })];
    for (let i = 5; i >= 1; i--) scenes.push(scene(`F${i}`));
    scenes.push(scene("HEADOFFICE", { is_flat: true }));
    for (let i = 3; i >= 1; i--) scenes.push(scene(`HO ${i}`));
    // What matters to a person: order, name, group, whether it is a divider, its picture.
    const look = (list: Scene[]) =>
      [...list]
        .sort((a, b) => a.order_index - b.order_index)
        .map((s) => [s.id, s.name, s.folder ?? null, Boolean(s.is_divider), s.unit_code ?? null, s.image_path]);
    const original = look(scenes);

    const { state, ctx } = fakeTour(scenes);
    const units = toPlanUnits(scenes).map((u) => ({ ...u, title: u.title === "KHOPOLI" ? "Khopoli Nutra Unit" : u.title }));
    const plan = buildUnitsPlan(scenes, units, OPTS);
    const undo = await applyUnits(ctx, plan);

    assert.deepEqual(names(state.scenes), ["Khopoli Nutra Unit", "F5", "F4", "F3", "F2", "F1", "HEADOFFICE", "HO3", "HO2", "HO1"]);
    const khopoli = state.scenes.find((s) => s.name === "Khopoli Nutra Unit")!;
    assert.equal(khopoli.is_divider, true);
    assert.equal(khopoli.folder, "Khopoli Nutra Unit");
    assert.match(khopoli.image_path, /divider-khopoli-nutra-unit/);
    assert.equal(state.scenes.find((s) => s.name === "HO3")?.folder, "HEADOFFICE");
    assert.equal(undo.summary.units, 2);

    await undoUnits(ctx, undo);
    assert.deepEqual(look(state.scenes), original);
    assert.equal(state.files.size, 0, "the new picture is removed");
  });

  it("is repeatable: running it again on a finished tour changes nothing, and renumbers after a reorder", async () => {
    const scenes = [scene("IMG_1"), scene("F2 Reception"), scene("IMG_3"), scene("IMG_4")];
    const { state, ctx } = fakeTour(scenes);
    const first = toPlanUnits(scenes).map((u) => ({ ...u, title: "Head Office", code: "HO" }));
    await applyUnits(ctx, buildUnitsPlan(scenes, first, OPTS));
    assert.deepEqual(names(state.scenes), ["Head Office", "HO4", "HO3 · Reception", "HO2", "HO1"]);

    // The tour as it now stands: proposal finds the divider, plan has nothing to do.
    const again = toPlanUnits(state.scenes);
    assert.equal(again.length, 1);
    assert.equal(again[0].code, "HO");
    assert.equal(buildUnitsPlan(state.scenes, again, OPTS).patches.length, 0);

    // Someone moves the last scene to the front of the unit: numbers follow position, room names stay.
    const sorted = [...state.scenes].sort((a, b) => a.order_index - b.order_index);
    const moved = [sorted[0], sorted[4], sorted[1], sorted[2], sorted[3]].map((x, i) => ({ ...x, order_index: i }));
    const plan = buildUnitsPlan(moved, toPlanUnits(moved), OPTS);
    const renamed = new Map(plan.patches.map((p) => [p.id, p.patch.name]));
    assert.equal(renamed.get(sorted[4].id), "HO4");
    assert.equal(renamed.get(sorted[2].id), "HO2 · Reception");
  });

  it("adds divider cards where there are none and removes them on undo", async () => {
    const scenes = [scene("IMG_1"), scene("IMG_2"), scene("IMG_3"), scene("IMG_4")];
    const { state, ctx } = fakeTour(scenes);
    const units = toPlanUnits(scenes).map((u) => ({ ...u, title: "R&D facility", code: "R&D" }));
    const undo = await applyUnits(ctx, buildUnitsPlan(scenes, units, { ...OPTS, space: true, keepRoom: false }));
    assert.deepEqual(names(state.scenes), ["R&D facility", "R&D 4", "R&D 3", "R&D 2", "R&D 1"]);
    const card = state.scenes[0];
    assert.equal(card.is_divider, true);
    assert.equal(card.is_flat, true);
    assert.equal(card.unit_code, "R&D");

    await undoUnits(ctx, undo);
    assert.deepEqual(names(state.scenes), ["IMG_1", "IMG_2", "IMG_3", "IMG_4"]);
    assert.equal(state.files.size, 0);
  });

  it("leaves the tour as it was when a divider cannot be added", async () => {
    const scenes = [scene("A1"), scene("A2"), scene("B1"), scene("B2")];
    const { state, ctx } = fakeTour(scenes);
    state.failInsertAt = 1; // the second divider fails
    const units = toPlanUnits(scenes, {}).map((u, i) => ({ ...u, title: i === 0 ? "Alpha" : "Beta", code: i === 0 ? "A" : "B" }));
    assert.equal(units.length, 2);
    await assert.rejects(() => applyUnits(ctx, buildUnitsPlan(scenes, units, OPTS)), /Beta/);
    assert.deepEqual(names(state.scenes), ["A1", "A2", "B1", "B2"]);
    assert.equal(state.files.size, 0, "pictures made before the failure are removed");
    assert.equal(state.orderWrites, 0);
  });
});
