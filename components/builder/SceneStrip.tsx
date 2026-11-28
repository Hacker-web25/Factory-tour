"use client";

import { formatBytes } from "@/lib/formatBytes";
import ScenePreviewImg from "@/components/ScenePreviewImg";
import { useState } from "react";
import type { Scene } from "@/lib/types";
import { Plus, Trash2, LayoutGrid, Pencil, Crown, Layers, ChevronRight } from "lucide-react";
import Link from "next/link";
import { dividerUnitKey, isDivider, unitKey } from "@/lib/units";

export default function SceneStrip({
  scenes,
  activeId,
  onSelect,
  onDelete,
  onReorder,
  tourId,
  hidden,
  /** When set (BASIC-plan orgs only), scenes at index >= cap are
   *  marked with a tasteful "Pro" chip and the banner above explains
   *  they're hidden from end-customers. Omit on PRO / ULTRA. */
  basicSceneCap,
  sizes,
  lowRes,
  onOpenUnits,
}: {
  scenes: Scene[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (from: number, to: number) => void;
  tourId: string;
  hidden?: boolean;
  basicSceneCap?: number;
  /** Bytes of each scene's panorama, by scene id (shown small on the tile). */
  sizes?: Record<string, number | null>;
  /** Scenes saved below full resolution: [width, height]. */
  lowRes?: Record<string, [number, number]>;
  /** Opens the Units tool (divider cards, grouping, numbering). */
  onOpenUnits?: () => void;
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  // Units folded up to their divider tile (double-click a divider to fold or open its unit).
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const toggleUnit = (key: string) =>
    setFolded((f) => {
      const n = new Set(f);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const unitSizes = new Map<string, number>();
  for (const x of scenes) {
    const k = unitKey(x);
    if (k && !isDivider(x)) unitSizes.set(k, (unitSizes.get(k) ?? 0) + 1);
  }
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [gridOpen, setGridOpen] = useState(false);

  // True once there's at least one scene past the Basic cap — drives
  // the inline banner above the strip. Author sees every scene (we
  // don't gate the editor), but we tell them which ones their
  // customers won't see yet.
  const hasHiddenForBasic =
    typeof basicSceneCap === "number" &&
    scenes.length > basicSceneCap;

  return (
    <>
      {!hidden && hasHiddenForBasic && (
        <div className="bg-chrome border-t border-border px-3 py-1.5 text-[11px] text-neutral-300 flex items-center gap-2">
          <Crown size={12} className="text-amber-300 shrink-0" />
          <span className="truncate">
            Scenes past #{basicSceneCap} are hidden from customers: your plan
            includes {basicSceneCap} areas. Add areas or upgrade from Plan and billing.
          </span>
        </div>
      )}
      <div
        style={hidden ? { display: "none" } : undefined}
        className="h-[88px] bg-chrome border-t border-border flex items-center gap-1 px-2 relative"
        onDragEnd={() => {
          setDragFrom(null);
          setDropAt(null);
        }}
      >
        {/* Scrolling thumbnail row (leaves room for the right-side actions) */}
        <div className="flex-1 flex items-center gap-1 overflow-x-auto panel-scroll py-2">
          {scenes.map((s, i) => {
            // A folded unit shows only its divider tile. Indexes stay those of the full list.
            const key = unitKey(s);
            if (!isDivider(s) && key && folded.has(key)) return null;
            const divider = isDivider(s);
            const dKey = divider ? dividerUnitKey(s) : "";
            const isFolded = divider && folded.has(dKey);
            const isDragging = dragFrom === i;
            const hiddenFromBasic =
              typeof basicSceneCap === "number" && i >= basicSceneCap;
            return (
              <div
                key={s.id}
                className="relative flex items-center shrink-0"
                style={{
                  transition:
                    "transform 220ms cubic-bezier(0.2, 0.9, 0.35, 1.1)",
                }}
              >
                <DropIndicator
                  active={
                    dropAt === i &&
                    dragFrom !== null &&
                    dragFrom !== i &&
                    dragFrom !== i - 1
                  }
                />

                <div
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", String(i));
                    e.dataTransfer.setData("application/x-scene-id", s.id);
                    e.dataTransfer.effectAllowed = "copyMove";
                    setDragFrom(i);
                    if (e.currentTarget instanceof HTMLElement) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      e.dataTransfer.setDragImage(
                        e.currentTarget,
                        rect.width / 2,
                        rect.height / 2
                      );
                    }
                  }}
                  onDragOver={(e) => {
                    if (dragFrom == null) return;
                    e.preventDefault();
                    const rect = (
                      e.currentTarget as HTMLElement
                    ).getBoundingClientRect();
                    const before = e.clientX < rect.left + rect.width / 2;
                    const target = before ? i : i + 1;
                    if (target !== dropAt) setDropAt(target);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragFrom == null) return;
                    const raw = parseInt(
                      e.dataTransfer.getData("text/plain"),
                      10
                    );
                    if (isNaN(raw)) return;
                    let target = dropAt ?? i;
                    if (target > raw) target -= 1;
                    if (target !== raw) onReorder(raw, target);
                    setDragFrom(null);
                    setDropAt(null);
                  }}
                  onClick={() => onSelect(s.id)}
                  onDoubleClick={divider ? () => toggleUnit(dKey) : undefined}
                  className={`relative shrink-0 w-24 h-[60px] rounded-md overflow-hidden cursor-grab active:cursor-grabbing group transition-all duration-200 ${
                    activeId === s.id
                      ? "ring-2 ring-accent"
                      : "ring-1 ring-border hover:ring-neutral-500"
                  } ${
                    isDragging
                      ? "opacity-40 scale-95"
                      : "opacity-100 scale-100"
                  }`}
                  style={{
                    transition:
                      "transform 220ms cubic-bezier(0.2, 0.9, 0.35, 1.1), opacity 180ms",
                  }}
                  title={
                    divider
                      ? `${s.name}: double-click to ${isFolded ? "show" : "hide"} this unit's scenes`
                      : `Drag onto panorama to create a "go to ${s.name}" hotspot`
                  }
                >
                  <ScenePreviewImg
                    imagePath={s.image_path}
                    thumbnailPath={s.thumbnail_path}
                    alt={s.name}
                    draggable={false}
                    generate
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent text-[10px] px-1.5 py-0.5 truncate text-white">
                    {s.name}
                  </div>
                  {divider && (
                    <span
                      role="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleUnit(dKey);
                      }}
                      aria-label={`${isFolded ? "Show" : "Hide"} the scenes of ${s.name}`}
                      className="absolute top-1 left-1 flex items-center gap-0.5 rounded bg-black/80 px-1 text-[8.5px] font-bold uppercase leading-[14px] tracking-wider text-white cursor-pointer"
                      data-testid="unit-chip"
                    >
                      <ChevronRight size={8} className={`transition-transform ${isFolded ? "" : "rotate-90"}`} />
                      {isFolded ? `+${unitSizes.get(dKey) ?? 0}` : "Unit"}
                    </span>
                  )}
                  {hiddenFromBasic && (
                    <div
                      className="absolute top-1 left-1 flex items-center gap-0.5 px-1.5 py-[1px] rounded-full bg-amber-300/95 text-black text-[8.5px] font-bold uppercase tracking-wider shadow"
                      title="Beyond your plan's areas: customers do not see this scene yet."
                    >
                      <Crown size={8} /> Extra
                    </div>
                  )}
                  {lowRes?.[s.id] && (
                    <span
                      className={`absolute ${hiddenFromBasic ? "top-5" : "top-1"} left-1 rounded bg-amber-400/95 px-1 text-[8.5px] font-bold leading-[14px] text-black shadow`}
                      title={`Only ${lowRes[s.id][0]} × ${lowRes[s.id][1]} px, so it looks soft. Replace it with the camera original for full sharpness.`}
                    >
                      Low-res
                    </span>
                  )}
                  {sizes?.[s.id] != null && (
                    <span
                      className="absolute top-1 right-1 rounded bg-black/60 px-1 text-[8.5px] font-medium leading-[14px] text-white/85 tabular-nums transition-opacity group-hover:opacity-0"
                      title="Size of this scene's picture"
                    >
                      {formatBytes(sizes[s.id] as number)}
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(s.id);
                    }}
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 bg-black/70 rounded p-0.5 hover:bg-red-500/70 transition-colors"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>

                {i === scenes.length - 1 && (
                  <DropIndicator
                    active={
                      dropAt === scenes.length &&
                      dragFrom !== null &&
                      dragFrom !== scenes.length - 1
                    }
                  />
                )}
              </div>
            );
          })}

          <Link
            href={`/upload?tour=${tourId}`}
            className="shrink-0 w-24 h-[60px] rounded-md border-2 border-dashed border-border grid place-items-center text-neutral-500 hover:text-accent hover:border-accent transition-colors ml-1"
            title="Add scenes"
          >
            <Plus size={18} />
          </Link>
        </div>

        {/* Right-side actions: Edit tour / Grid view */}
        <div className="flex items-center gap-1.5 pl-2 border-l border-border h-full py-2">
          <button
            className="chip"
            title="Edit tour settings"
          >
            <Pencil size={11} /> Edit tour
          </button>
          {onOpenUnits && (
            <button onClick={onOpenUnits} className="chip" title="Group scenes into units with divider cards and numbering">
              <Layers size={11} /> Units
            </button>
          )}
          <button
            onClick={() => setGridOpen(true)}
            className="chip"
            title="Show all scenes as a grid"
          >
            <LayoutGrid size={11} /> Grid view
          </button>
        </div>
      </div>

      {gridOpen && (
        <SceneGridModal
          scenes={scenes}
          activeId={activeId}
          onClose={() => setGridOpen(false)}
          onSelect={(id) => {
            onSelect(id);
            setGridOpen(false);
          }}
        />
      )}
    </>
  );
}

/** Vertical accent bar showing the drop target between thumbnails. */
function DropIndicator({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden
      className="h-[60px] flex items-center pointer-events-none"
      style={{
        width: active ? 10 : 4,
        transition: "width 180ms ease",
        marginLeft: 2,
        marginRight: 2,
      }}
    >
      <div
        className="w-full rounded-full"
        style={{
          height: active ? "100%" : 0,
          background:
            "linear-gradient(180deg, rgba(29,181,132,0.95), rgba(29,181,132,0.45))",
          boxShadow: active
            ? "0 0 12px rgba(29,181,132,0.9), 0 0 3px rgba(29,181,132,1)"
            : "none",
          transition: "height 180ms ease, box-shadow 180ms ease",
        }}
      />
    </div>
  );
}

/** All-scenes-at-once grid overlay — opened via the "Grid view" chip. */
function SceneGridModal({
  scenes,
  activeId,
  onClose,
  onSelect,
}: {
  scenes: Scene[];
  activeId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/80 z-40 grid place-items-center p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-panel border border-border rounded-lg w-[min(1100px,95vw)] max-h-[85vh] flex flex-col shadow-panel overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="text-[13px] font-medium">
            All scenes{" "}
            <span className="text-neutral-500 text-xs ml-1">
              ({scenes.length})
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-white text-lg leading-none"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-auto panel-scroll p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {scenes.map((s) => (
              <button
                key={s.id}
                onClick={() => onSelect(s.id)}
                className={`relative aspect-video rounded overflow-hidden group ${
                  activeId === s.id
                    ? "ring-2 ring-accent"
                    : "ring-1 ring-border hover:ring-accent/60"
                }`}
              >
                <ScenePreviewImg
                  imagePath={s.image_path}
                  thumbnailPath={s.thumbnail_path}
                  alt={s.name}
                  generate
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2 py-1 text-[11px] text-white truncate text-left">
                  {s.name}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
