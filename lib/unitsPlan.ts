/**
 * lib/unitsPlan.ts — turning the person's choices in the Units tool into changes
 * to the tour, and taking them back.
 *
 * buildUnitsPlan() only works out what would change (so the screen can show a
 * preview and tests can check it). applyUnits() / undoUnits() carry it out
 * through a few callbacks the editor page gives them, so this file knows
 * nothing about Supabase or React.
 *
 * Nothing is half done: every new picture is made and every new divider row is
 * added before any existing scene is touched, and if one of those steps fails
 * the new dividers are removed again and the tour is as it was.
 */

import type { Scene } from "@/lib/types";
import { isDivider, planUnitRenames, type ProposedUnit, type RenameOptions, type RenameStep } from "@/lib/units";

export type PlanUnit = ProposedUnit & {
  /** Add a divider card before the unit when it has none. */
  addDivider: boolean;
  /** Draw the divider picture again (an existing divider keeps its picture unless the title changed). */
  redraw: boolean;
};

export type PlanOptions = Pick<RenameOptions, "direction" | "space" | "keepRoom">;

export type SceneFields = Partial<
  Pick<Scene, "name" | "folder" | "is_divider" | "is_flat" | "unit_code" | "image_path" | "thumbnail_path">
>;

export type ScenePatch = { id: string; patch: SceneFields; before: SceneFields };
export type NewDivider = { tempId: string; title: string; code: string; beforeId: string };

export type UnitsPlan = {
  /** Changes to scenes that already exist (not their order). */
  patches: ScenePatch[];
  /** Divider cards to create. */
  newDividers: NewDivider[];
  /** Existing dividers that need a new picture, with the text to draw. */
  newPictures: Array<{ id: string; title: string }>;
  /** Every scene id in its new order; new dividers appear as their tempId. */
  finalOrder: string[];
  renames: RenameStep[];
  summary: { units: number; renamed: number; dividersAdded: number; dividersConverted: number; redrawn: number };
};

const tidy = (s: string) => s.trim().replace(/\s+/g, " ");

/** A unit is ready to apply when it has a title and a code. */
export function unitIsReady(u: Pick<PlanUnit, "title" | "code" | "memberIds" | "dividerId">): boolean {
  return tidy(u.title) !== "" && u.code.trim() !== "" && (u.memberIds.length > 0 || u.dividerId != null);
}

export function buildUnitsPlan(scenes: readonly Scene[], units: readonly PlanUnit[], opts: PlanOptions): UnitsPlan {
  const ordered = [...scenes].sort((a, b) => a.order_index - b.order_index || a.id.localeCompare(b.id));
  const byId = new Map(ordered.map((s) => [s.id, s]));

  const patchFor = new Map<string, SceneFields>();
  const add = (id: string, fields: SceneFields) => {
    const cur = patchFor.get(id) ?? {};
    patchFor.set(id, { ...cur, ...fields });
  };

  const newDividers: NewDivider[] = [];
  const newPictures: Array<{ id: string; title: string }> = [];
  const renames: RenameStep[] = [];
  let converted = 0;
  let readyUnits = 0;

  for (const u of units) {
    if (!unitIsReady(u)) continue;
    readyUnits++;
    const title = tidy(u.title);
    const code = u.code.trim();
    const members = u.memberIds.map((id) => byId.get(id)).filter((s): s is Scene => !!s && !isDivider(s));

    for (const m of members) add(m.id, { folder: title });
    for (const r of planUnitRenames(members, { ...opts, code })) {
      add(r.id, { name: r.to });
      renames.push(r);
    }

    if (u.dividerId && byId.has(u.dividerId)) {
      const d = byId.get(u.dividerId)!;
      const titleChanged = tidy(d.name) !== title;
      if (!isDivider(d)) converted++;
      add(d.id, { is_divider: true, is_flat: true, folder: title, unit_code: code, ...(titleChanged ? { name: title } : {}) });
      if (titleChanged || u.redraw) newPictures.push({ id: d.id, title });
    } else if (u.addDivider && members.length) {
      newDividers.push({ tempId: `new-${u.key}`, title, code, beforeId: members[0].id });
    }
  }

  const patches: ScenePatch[] = [];
  for (const [id, patch] of patchFor) {
    const s = byId.get(id)!;
    const before: SceneFields = {};
    const changed: SceneFields = {};
    for (const k of Object.keys(patch) as Array<keyof SceneFields>) {
      const now = (s[k] ?? null) as unknown;
      const next = (patch[k] ?? null) as unknown;
      const same = k === "is_divider" || k === "is_flat" ? Boolean(now) === Boolean(next) : now === next;
      if (same) continue;
      (changed as Record<string, unknown>)[k] = patch[k];
      (before as Record<string, unknown>)[k] = s[k] ?? null;
    }
    if (Object.keys(changed).length) patches.push({ id, patch: changed, before });
  }

  const dividerBefore = new Map(newDividers.map((d) => [d.beforeId, d.tempId]));
  const finalOrder: string[] = [];
  for (const s of ordered) {
    const t = dividerBefore.get(s.id);
    if (t) finalOrder.push(t);
    finalOrder.push(s.id);
  }

  return {
    patches,
    newDividers,
    newPictures,
    finalOrder,
    renames,
    summary: {
      units: readyUnits,
      renamed: renames.length,
      dividersAdded: newDividers.length,
      dividersConverted: converted,
      redrawn: newPictures.length,
    },
  };
}

/* ------------------------------------------------------------------ apply */

/** What the editor page lends this file. */
export type UnitsContext = {
  tourId: string;
  getScenes(): Scene[];
  /** Draws the divider card and stores it. Returns the stored picture's path. */
  makeDividerPicture(title: string): Promise<string>;
  /** Adds a scene row and returns it, or null when it could not be added. */
  insertScene(row: Record<string, unknown>): Promise<Scene | null>;
  /** Shows and saves a scene's new field values. */
  changeScene(next: Scene): void;
  /** Gives the scenes this order (0, 1, 2…) and saves the ones that moved. */
  writeOrder(ids: string[]): Promise<void>;
  deleteScene(id: string): Promise<void>;
  /** Best-effort removal of a stored picture nobody uses any more. */
  removeFile(path: string): Promise<void>;
};

export type UnitsUndo = {
  patches: Array<{ id: string; before: SceneFields }>;
  createdIds: string[];
  createdFiles: string[];
  /** Scene ids in the order they were in before. */
  orderBefore: string[];
  summary: UnitsPlan["summary"];
};

export async function applyUnits(ctx: UnitsContext, plan: UnitsPlan): Promise<UnitsUndo> {
  const before = [...ctx.getScenes()].sort((a, b) => a.order_index - b.order_index || a.id.localeCompare(b.id));
  const created: Scene[] = [];
  const createdFiles: string[] = [];
  const patches = new Map(plan.patches.map((p) => [p.id, { patch: { ...p.patch }, before: { ...p.before } }]));
  const scenesById = new Map(before.map((s) => [s.id, s]));

  const rollback = async () => {
    for (const s of created) await ctx.deleteScene(s.id).catch(() => {});
    for (const f of createdFiles) await ctx.removeFile(f).catch(() => {});
  };

  try {
    // 1. New pictures for dividers that already exist.
    for (const n of plan.newPictures) {
      const path = await ctx.makeDividerPicture(n.title);
      createdFiles.push(path);
      const cur = scenesById.get(n.id)!;
      const entry = patches.get(n.id) ?? { patch: {}, before: {} };
      entry.patch.image_path = path;
      entry.patch.thumbnail_path = null;
      entry.before.image_path = cur.image_path;
      entry.before.thumbnail_path = cur.thumbnail_path ?? null;
      patches.set(n.id, entry);
    }

    // 2. New divider cards.
    const realId = new Map<string, string>();
    for (const d of plan.newDividers) {
      const path = await ctx.makeDividerPicture(d.title);
      createdFiles.push(path);
      const row = await ctx.insertScene({
        tour_id: ctx.tourId,
        name: d.title,
        image_path: path,
        order_index: before.length + created.length,
        is_flat: true,
        is_divider: true,
        folder: d.title,
        unit_code: d.code,
      });
      if (!row) throw new Error(`Could not add the divider card for ${d.title}.`);
      created.push(row);
      realId.set(d.tempId, row.id);
    }

    // 3. Only now touch the scenes that already exist.
    for (const [id, entry] of patches) {
      const cur = scenesById.get(id);
      if (cur) ctx.changeScene({ ...cur, ...entry.patch } as Scene);
    }

    // 4. The new order.
    const finalIds = plan.finalOrder.map((id) => realId.get(id) ?? id);
    await ctx.writeOrder(finalIds);

    return {
      patches: Array.from(patches, ([id, e]) => ({ id, before: e.before })),
      createdIds: created.map((s) => s.id),
      createdFiles,
      orderBefore: before.map((s) => s.id),
      summary: plan.summary,
    };
  } catch (e) {
    await rollback();
    throw e;
  }
}

export async function undoUnits(ctx: UnitsContext, undo: UnitsUndo): Promise<void> {
  const created = new Set(undo.createdIds);
  for (const id of undo.createdIds) await ctx.deleteScene(id);
  const byId = new Map(ctx.getScenes().map((s) => [s.id, s]));
  for (const p of undo.patches) {
    const cur = byId.get(p.id);
    if (cur && !created.has(p.id)) ctx.changeScene({ ...cur, ...p.before } as Scene);
  }
  await ctx.writeOrder(undo.orderBefore.filter((id) => !created.has(id)));
  // The pictures only the undone divider cards used are no longer needed.
  for (const f of undo.createdFiles) await ctx.removeFile(f).catch(() => {});
}
