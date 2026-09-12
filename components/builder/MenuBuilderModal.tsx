"use client";

/**
 * MenuBuilderModal — bulk-create a grid of nav hotspots on a FLAT scene.
 *
 * The presenter picks:
 *   • which scenes to include as menu items,
 *   • how many columns to lay them out in,
 *   • how much padding to keep around the edges.
 *
 * We compute an evenly-spaced grid inside a bounding box (default =
 * full image with 8% padding on each edge), then create one icon
 * hotspot per menu item at the correct (flat_x, flat_y). Each hotspot
 * is pre-configured with:
 *   • type: "icon"
 *   • action: "nav" + target_scene_id
 *   • label: the destination scene's name (edit inline afterwards)
 *   • sticky style applied (colour / size / icon / effects match the
 *     rest of the tour so the menu doesn't stand out awkwardly).
 *
 * Turns 12 menu items × 30 seconds of copy-paste-align into a single
 * 3-click flow.
 */

import { useMemo, useState } from "react";
import type { Hotspot, Scene } from "@/lib/types";
import { loadStickyStyle } from "@/lib/hotspotStyleMemory";
import {
  LayoutGrid,
  Check,
  X,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";

type Props = {
  /** The scene currently being built (the flat "dashboard" image). */
  activeScene: Scene;
  /** Every scene in the tour — used to populate the menu picker. */
  scenes: Scene[];
  /** Tour id — needed so sticky style is scoped correctly. */
  tourId: string;
  /** Fires once with the full batch of draft hotspots the wizard
   *  wants to create. Parent inserts them (using its existing
   *  Supabase insert path). */
  onGenerate: (drafts: Partial<Hotspot>[]) => Promise<void> | void;
  onCancel: () => void;
};

export default function MenuBuilderModal({
  activeScene,
  scenes,
  tourId,
  onGenerate,
  onCancel,
}: Props) {
  // Default: every scene EXCEPT the current one (you can't nav to the
  // scene you're already on).
  const [pickedIds, setPickedIds] = useState<Set<string>>(
    () => new Set(scenes.filter((s) => s.id !== activeScene.id).map((s) => s.id))
  );
  const [columns, setColumns] = useState<number>(2);
  const [padPct, setPadPct] = useState<number>(8); // % of image edges kept empty
  const [labelSuffix, setLabelSuffix] = useState<"none" | "arrow">("none");
  const [busy, setBusy] = useState(false);

  const picked = useMemo(
    () => scenes.filter((s) => pickedIds.has(s.id)),
    [scenes, pickedIds]
  );
  const rows = Math.max(1, Math.ceil(picked.length / columns));

  function toggle(id: string) {
    setPickedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAll() {
    setPickedIds(new Set(scenes.filter((s) => s.id !== activeScene.id).map((s) => s.id)));
  }
  function selectNone() {
    setPickedIds(new Set());
  }

  /**
   * Compute (flat_x, flat_y) for the i-th menu item.
   * Grid spans (padPct%, 100 - padPct%) × (padPct%, 100 - padPct%).
   * Items are laid out row-major. If the last row is shorter, its
   * columns are re-centered horizontally so the layout looks balanced.
   */
  function positionFor(index: number, total: number) {
    const colsInThisRow =
      Math.floor(index / columns) === rows - 1
        ? total - (rows - 1) * columns
        : columns;
    const row = Math.floor(index / columns);
    const colInRow = index % columns;
    const pad = padPct / 100;
    const bandLeft = pad;
    const bandRight = 1 - pad;
    const bandTop = pad;
    const bandBottom = 1 - pad;
    // Column spacing: divide the row band into (colsInThisRow) slots,
    // each item sits at the slot centre.
    const colSlot = (bandRight - bandLeft) / colsInThisRow;
    const x = bandLeft + colSlot * (colInRow + 0.5);
    // Row spacing: divide the vertical band into (rows) slots, item at
    // slot centre.
    const rowSlot = (bandBottom - bandTop) / rows;
    const y = bandTop + rowSlot * (row + 0.5);
    return { x, y };
  }

  async function handleGenerate() {
    if (picked.length === 0) return;
    setBusy(true);
    const sticky = loadStickyStyle(tourId);
    const drafts: Partial<Hotspot>[] = picked.map((s, i) => {
      const { x, y } = positionFor(i, picked.length);
      const suffix = labelSuffix === "arrow" ? "  ›" : "";
      const draft: Partial<Hotspot> = {
        ...sticky,
        type: "icon",
        action: "nav",
        target_scene_id: s.id,
        // If sticky doesn't have an icon, default to the target-ring
        // shape — it's what most menu-style hotspots want.
        icon_key: (sticky as any).icon_key ?? "target-ring",
        label: `${s.name}${suffix}`,
        flat_x: x,
        flat_y: y,
      };
      return draft;
    });
    try {
      await onGenerate(drafts);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 bg-black/70 z-50 grid place-items-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-panel border border-border rounded-lg w-[720px] max-w-full max-h-[88vh] flex flex-col shadow-panel"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <LayoutGrid size={14} className="text-accent" />
            <h3 className="text-[14px] font-semibold">Menu builder</h3>
            <span className="text-[11px] text-neutral-500">
              · lay out nav buttons on this flat scene
            </span>
          </div>
          <button
            onClick={onCancel}
            className="text-neutral-500 hover:text-white text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Two-column body */}
        <div className="flex-1 overflow-hidden grid grid-cols-2 gap-3 p-3">
          {/* Left: scene picker */}
          <div className="border border-border rounded bg-panelSoft/40 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between text-[11px]">
              <span className="text-neutral-400">
                Menu items ({pickedIds.size}/{scenes.length - 1})
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={selectAll}
                  className="text-accent hover:underline"
                >
                  All
                </button>
                <span className="text-neutral-700">·</span>
                <button
                  onClick={selectNone}
                  className="text-neutral-400 hover:text-white"
                >
                  None
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto panel-scroll p-2 space-y-1">
              {scenes.length <= 1 && (
                <div className="text-[11px] text-neutral-500 py-6 text-center">
                  You need at least one other scene in this tour before you
                  can build a menu.
                </div>
              )}
              {scenes
                .filter((s) => s.id !== activeScene.id)
                .map((s) => {
                  const on = pickedIds.has(s.id);
                  return (
                    <label
                      key={s.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer border transition-colors ${
                        on
                          ? "border-accent/50 bg-accent/5"
                          : "border-transparent hover:bg-white/5"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded shrink-0 grid place-items-center border ${
                          on
                            ? "bg-accent border-accent text-black"
                            : "border-white/25"
                        }`}
                      >
                        {on && <Check size={11} strokeWidth={3} />}
                      </div>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={on}
                        onChange={() => toggle(s.id)}
                      />
                      <div className="min-w-0 flex-1 text-[12.5px] truncate">
                        {s.name}
                      </div>
                    </label>
                  );
                })}
            </div>
          </div>

          {/* Right: layout config + preview */}
          <div className="flex flex-col gap-3 overflow-hidden">
            {/* Columns picker */}
            <div>
              <div className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1.5">
                Columns
              </div>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    onClick={() => setColumns(n)}
                    className={`w-8 h-8 rounded border text-[12px] font-medium transition-colors ${
                      columns === n
                        ? "bg-accent text-black border-accent"
                        : "border-border text-neutral-300 hover:border-white/30"
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => setColumns((c) => Math.max(1, c - 1))}
                  className="ml-1 p-1 text-neutral-400 hover:text-white"
                  title="Fewer columns"
                >
                  <ChevronDown size={12} />
                </button>
                <button
                  onClick={() => setColumns((c) => Math.min(6, c + 1))}
                  className="p-1 text-neutral-400 hover:text-white"
                  title="More columns"
                >
                  <ChevronUp size={12} />
                </button>
                <span className="text-[11px] text-neutral-500 ml-1">
                  · {rows} row{rows === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            {/* Padding slider */}
            <div>
              <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-neutral-400 mb-1.5">
                <span>Edge padding</span>
                <span className="text-white/70 normal-case tracking-normal">
                  {padPct}%
                </span>
              </div>
              <input
                type="range"
                min={2}
                max={25}
                value={padPct}
                onChange={(e) => setPadPct(Number(e.target.value))}
                className="w-full accent-accent"
              />
              <div className="text-[10.5px] text-neutral-500 mt-1">
                How much empty space to leave around the grid.
              </div>
            </div>

            {/* Label style */}
            <div>
              <div className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1.5">
                Label
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setLabelSuffix("none")}
                  className={`flex-1 px-2 py-1.5 rounded border text-[11px] transition-colors ${
                    labelSuffix === "none"
                      ? "bg-accent text-black border-accent"
                      : "border-border text-neutral-300 hover:border-white/30"
                  }`}
                >
                  Scene name only
                </button>
                <button
                  onClick={() => setLabelSuffix("arrow")}
                  className={`flex-1 px-2 py-1.5 rounded border text-[11px] transition-colors flex items-center justify-center gap-1 ${
                    labelSuffix === "arrow"
                      ? "bg-accent text-black border-accent"
                      : "border-border text-neutral-300 hover:border-white/30"
                  }`}
                >
                  Name <ArrowRight size={10} />
                </button>
              </div>
            </div>

            {/* Live preview */}
            <div className="flex-1 min-h-0 border border-border rounded bg-black overflow-hidden relative">
              <div className="absolute inset-0 p-2 grid place-items-center pointer-events-none">
                <span className="text-[10px] text-neutral-500 uppercase tracking-wider">
                  Preview · {picked.length} item
                  {picked.length === 1 ? "" : "s"}
                </span>
              </div>
              {picked.map((s, i) => {
                const { x, y } = positionFor(i, picked.length);
                return (
                  <div
                    key={s.id}
                    className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
                  >
                    <div className="w-6 h-6 rounded-full border-2 border-accent bg-black/60 grid place-items-center">
                      <div className="w-2 h-2 rounded-full bg-accent" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-2">
          <div className="text-[11px] text-neutral-500 flex items-center gap-1.5">
            <Info size={11} />
            Uses your last-used hotspot style so the menu blends in.
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="text-[12px] text-neutral-400 hover:text-white px-3 py-1.5 flex items-center gap-1"
            >
              <X size={12} /> Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={picked.length === 0 || busy}
              className="bg-accent hover:bg-accentHover text-black text-[12px] font-semibold px-3 py-1.5 rounded disabled:opacity-50 flex items-center gap-1.5"
            >
              <Check size={12} />
              {busy
                ? "Creating…"
                : `Generate ${picked.length} hotspot${
                    picked.length === 1 ? "" : "s"
                  }`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
