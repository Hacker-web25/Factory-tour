"use client";

/**
 * MenuBuilderModal — bulk-create a grid of nav hotspots on a FLAT scene.
 *
 * Feature set
 * -----------
 * • Scene picker (checkbox list)
 * • Layout controls (columns, rows auto, edge padding, row/col gap)
 * • Icon controls (shape, size, tint)
 * • Label controls (position relative to icon, size, colour, weight,
 *   background chip, distance from icon)
 * • LIVE preview — shows the actual flat-scene image with real icon
 *   shapes and real label styling exactly where each hotspot will land.
 *
 * Each menu item becomes TWO hotspots:
 *   1. Icon hotspot (nav → target_scene_id)  — the clickable marker.
 *   2. Text hotspot (label only)             — placed relative to the
 *      icon per the "label position" choice.
 *
 * Splitting icon and text lets the presenter tweak either half
 * independently after generation, and unlocks the "text to the right"
 * horizontal layout the reference dashboard uses. Both hotspots carry
 * the target_scene_id so clicking either navigates.
 */

import { useMemo, useState } from "react";
import type { Hotspot, Scene } from "@/lib/types";
import { publicUrl } from "@/lib/supabase";
import { loadStickyStyle } from "@/lib/hotspotStyleMemory";
import { ICON_LIBRARY, findIcon } from "@/lib/iconLibrary";
import {
  LayoutGrid,
  Check,
  X,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Info,
  Type,
  Paintbrush,
} from "lucide-react";

type LabelPosition = "right" | "below" | "above" | "left";

type Props = {
  activeScene: Scene;
  scenes: Scene[];
  tourId: string;
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
  const otherScenes = useMemo(
    () => scenes.filter((s) => s.id !== activeScene.id),
    [scenes, activeScene.id]
  );

  const sticky = useMemo(() => loadStickyStyle(tourId), [tourId]);

  // ---- Menu items ------------------------------------------------------
  const [pickedIds, setPickedIds] = useState<Set<string>>(
    () => new Set(otherScenes.map((s) => s.id))
  );
  const picked = useMemo(
    () => otherScenes.filter((s) => pickedIds.has(s.id)),
    [otherScenes, pickedIds]
  );

  // ---- Layout ---------------------------------------------------------
  const [columns, setColumns] = useState<number>(2);
  const [padPct, setPadPct] = useState<number>(8);
  /** Row spacing multiplier: 0.4 = rows cluster tightly around the
   *  vertical centre, 1.0 = evenly distributed across the padding
   *  band (default), 1.6 = spread apart with air between them.
   *  Values >1 may push rows into the padding — that's intentional so
   *  presenters can tune the "look" without editing padding too. */
  const [rowSpacing, setRowSpacing] = useState<number>(1);
  const rows = Math.max(1, Math.ceil(picked.length / Math.max(1, columns)));

  // ---- Icon ----------------------------------------------------------
  const stickyIconKey = (sticky as any).icon_key as string | undefined;
  const [iconKey, setIconKey] = useState<string>(stickyIconKey ?? "target-ring");
  const [iconSizePct, setIconSizePct] = useState<number>(
    (sticky as any).width_pct ?? 80
  );
  const [iconTint, setIconTint] = useState<string>(
    (sticky as any).icon_tint ?? "#111111"
  );

  // ---- Label ---------------------------------------------------------
  const [labelPos, setLabelPos] = useState<LabelPosition>("right");
  const [labelSize, setLabelSize] = useState<number>(
    (sticky as any).label_size ?? 18
  );
  const [labelColor, setLabelColor] = useState<string>(
    (sticky as any).label_color ?? "#111111"
  );
  const [labelBold, setLabelBold] = useState<boolean>(
    (sticky as any).label_bold ?? true
  );
  const [labelGap, setLabelGap] = useState<number>(12); // px between icon & label
  const [labelBg, setLabelBg] = useState<string | null>(
    (sticky as any).label_bg ?? null
  );
  const [labelSuffix, setLabelSuffix] = useState<"none" | "arrow">("none");

  const [tab, setTab] = useState<"layout" | "icon" | "label">("layout");
  const [busy, setBusy] = useState(false);

  // Image aspect ratio for the preview — measured on load so the
  // preview panel can shrink to match, eliminating the black bars
  // above/below that were making the hotspots look like they were
  // floating in space instead of sitting on the actual image.
  const [imgAspect, setImgAspect] = useState<number | null>(null);

  function toggle(id: string) {
    setPickedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAll() {
    setPickedIds(new Set(otherScenes.map((s) => s.id)));
  }
  function selectNone() {
    setPickedIds(new Set());
  }

  // Grid position for the i-th icon (in fractional coords 0..1).
  function iconPos(index: number, total: number) {
    const colsInRow =
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
    const colSlot = (bandRight - bandLeft) / colsInRow;
    // Row spacing: start from the natural even-distribution rowSlot,
    // then scale by the user-controlled multiplier. Centre the whole
    // block vertically so tightening rows keeps them balanced rather
    // than dragging them all to the top.
    const naturalRowSlot = (bandBottom - bandTop) / rows;
    const rowSlot = naturalRowSlot * rowSpacing;
    const yCentre = (bandTop + bandBottom) / 2;
    const y = yCentre + (row - (rows - 1) / 2) * rowSlot;
    return {
      x: bandLeft + colSlot * (colInRow + 0.5),
      y: Math.max(0.02, Math.min(0.98, y)),
    };
  }

  /** Compute the label anchor position (in fraction) from the icon
   *  anchor and the gap. Because the preview panel has variable
   *  aspect ratio we convert the gap to a fraction of the preview
   *  container dimensions when possible; for the DB write we use a
   *  rough estimate — presenters fine-tune per-hotspot afterwards. */
  function labelPos_forItem(
    iconX: number,
    iconY: number,
    previewW: number,
    previewH: number
  ) {
    const gapX = labelGap / Math.max(1, previewW);
    const gapY = labelGap / Math.max(1, previewH);
    switch (labelPos) {
      case "right":
        return { x: iconX + (iconSizePct / 100) * 0.05 + gapX * 3, y: iconY };
      case "left":
        return { x: iconX - (iconSizePct / 100) * 0.05 - gapX * 3, y: iconY };
      case "above":
        return { x: iconX, y: iconY - (iconSizePct / 100) * 0.03 - gapY * 2 };
      case "below":
        return { x: iconX, y: iconY + (iconSizePct / 100) * 0.03 + gapY * 2 };
    }
  }

  async function handleGenerate() {
    if (picked.length === 0) return;
    setBusy(true);

    // Rough preview dimensions used only for label placement math when
    // generating. Preview element supplies its real size during preview
    // render; here we use image dimensions or a sensible fallback.
    const w = 1600;
    const h = 900;

    const drafts: Partial<Hotspot>[] = [];
    for (let i = 0; i < picked.length; i++) {
      const s = picked[i];
      const { x, y } = iconPos(i, picked.length);
      const suffix = labelSuffix === "arrow" ? "  ›" : "";
      const iconDraft: Partial<Hotspot> = {
        ...sticky,
        type: "icon",
        action: "nav",
        target_scene_id: s.id,
        icon_key: iconKey,
        icon_tint: iconTint,
        width_pct: iconSizePct,
        height_pct: iconSizePct,
        label: null, // label is a separate hotspot for precise placement
        flat_x: x,
        flat_y: y,
      };
      const lp = labelPos_forItem(x, y, w, h);
      const textDraft: Partial<Hotspot> = {
        ...sticky,
        type: "text",
        action: "nav",
        target_scene_id: s.id,
        icon_key: null,
        label: `${s.name}${suffix}`,
        label_color: labelColor,
        label_size: labelSize,
        label_bold: labelBold,
        label_bg: labelBg,
        flat_x: Math.max(0.02, Math.min(0.98, lp.x)),
        flat_y: Math.max(0.02, Math.min(0.98, lp.y)),
      };
      drafts.push(iconDraft, textDraft);
    }

    try {
      await onGenerate(drafts);
    } finally {
      setBusy(false);
    }
  }

  // Real icon preview render
  const iconEntry = findIcon(iconKey);
  const IconCmp = iconEntry?.Icon;

  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 bg-black/70 z-50 grid place-items-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-panel border border-border rounded-lg w-[980px] max-w-full max-h-[92vh] flex flex-col shadow-panel"
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

        {/* Body: 3 columns → picker | preview | options */}
        <div
          className="flex-1 overflow-hidden grid gap-3 p-3"
          style={{ gridTemplateColumns: "240px 1fr 300px" }}
        >
          {/* --- LEFT: Scene picker --- */}
          <div className="border border-border rounded bg-panelSoft/40 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between text-[11px]">
              <span className="text-neutral-400">
                Items ({pickedIds.size}/{otherScenes.length})
              </span>
              <div className="flex items-center gap-2">
                <button onClick={selectAll} className="text-accent hover:underline">
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
              {otherScenes.length === 0 && (
                <div className="text-[11px] text-neutral-500 py-6 text-center">
                  You need at least one other scene in this tour.
                </div>
              )}
              {otherScenes.map((s) => {
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

          {/* --- CENTER: LIVE PREVIEW using the actual scene image --- */}
          <div className="border border-border rounded bg-black overflow-hidden relative min-h-0 flex flex-col">
            <div className="px-3 py-1.5 border-b border-border flex items-center justify-between text-[10.5px] text-neutral-500 shrink-0">
              <span>
                LIVE PREVIEW · {picked.length} item{picked.length === 1 ? "" : "s"}
              </span>
              <span>columns {columns} · {rows} row{rows === 1 ? "" : "s"}</span>
            </div>
            <div className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden p-2">
              {/* The <img> is the sizing element — max-w/h:100% shrinks
                  it to fit while preserving its natural aspect ratio.
                  The wrapper (inline-block via flex child) shrinks to
                  the img's rendered size. The absolute-positioned
                  hotspot layer sits exactly on top of the image, so
                  percentage positions align with the actual scene. */}
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={publicUrl(activeScene.image_path) ?? ""}
                  alt=""
                  className="block"
                  style={{
                    maxWidth: "100%",
                    maxHeight: "100%",
                    // Fallback while the natural dimensions haven't
                    // arrived yet — keeps the preview area non-empty.
                    minHeight: imgAspect ? undefined : 200,
                  }}
                  draggable={false}
                  onLoad={(e) => {
                    const el = e.currentTarget;
                    if (el.naturalWidth && el.naturalHeight) {
                      setImgAspect(el.naturalWidth / el.naturalHeight);
                    }
                  }}
                />
                {picked.map((s, i) => {
                const { x, y } = iconPos(i, picked.length);
                const iconPx = Math.max(16, iconSizePct * 0.6);
                // Anchor label using CSS relative to icon so preview
                // stays visually correct across container sizes.
                const isHoriz = labelPos === "right" || labelPos === "left";
                return (
                  <div
                    key={s.id}
                    className="absolute pointer-events-none"
                    style={{
                      left: `${x * 100}%`,
                      top: `${y * 100}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    <div
                      className="flex items-center"
                      style={{
                        flexDirection:
                          labelPos === "right"
                            ? "row"
                            : labelPos === "left"
                              ? "row-reverse"
                              : labelPos === "below"
                                ? "column"
                                : "column-reverse",
                        gap: `${labelGap}px`,
                        alignItems: "center",
                      }}
                    >
                      {IconCmp && (
                        <IconCmp
                          size={iconPx}
                          color={iconTint}
                          strokeWidth={2}
                        />
                      )}
                      <span
                        style={{
                          fontSize: `${labelSize}px`,
                          color: labelColor,
                          fontWeight: labelBold ? 700 : 400,
                          background: labelBg ?? "transparent",
                          padding: labelBg ? "1px 6px" : 0,
                          borderRadius: 4,
                          whiteSpace: isHoriz ? "nowrap" : "normal",
                          maxWidth: isHoriz ? "160px" : undefined,
                          textOverflow: "ellipsis",
                          overflow: "hidden",
                        }}
                      >
                        {s.name}
                        {labelSuffix === "arrow" ? "  ›" : ""}
                      </span>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          </div>

          {/* --- RIGHT: tabbed options --- */}
          <div className="border border-border rounded bg-panelSoft/40 flex flex-col overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-border">
              <TabBtn
                active={tab === "layout"}
                onClick={() => setTab("layout")}
                icon={<LayoutGrid size={11} />}
              >
                Layout
              </TabBtn>
              <TabBtn
                active={tab === "icon"}
                onClick={() => setTab("icon")}
                icon={<Paintbrush size={11} />}
              >
                Icon
              </TabBtn>
              <TabBtn
                active={tab === "label"}
                onClick={() => setTab("label")}
                icon={<Type size={11} />}
              >
                Label
              </TabBtn>
            </div>

            <div className="flex-1 overflow-auto panel-scroll p-3 space-y-4">
              {tab === "layout" && (
                <>
                  <Field label="Columns">
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
                    </div>
                  </Field>

                  <Field
                    label="Edge padding"
                    trailing={<span className="text-white/70">{padPct}%</span>}
                  >
                    <input
                      type="range"
                      min={2}
                      max={30}
                      value={padPct}
                      onChange={(e) => setPadPct(Number(e.target.value))}
                      className="w-full accent-accent"
                    />
                  </Field>

                  {rows > 1 && (
                    <Field
                      label="Row spacing"
                      trailing={
                        <span className="text-white/70">
                          {Math.round(rowSpacing * 100)}%
                        </span>
                      }
                    >
                      <input
                        type="range"
                        min={40}
                        max={180}
                        value={Math.round(rowSpacing * 100)}
                        onChange={(e) =>
                          setRowSpacing(Number(e.target.value) / 100)
                        }
                        className="w-full accent-accent"
                      />
                      <div className="text-[10.5px] text-neutral-500 mt-1">
                        Distance between rows. 100% = evenly distributed.
                        Lower = clustered near centre. Higher = pushed
                        toward top &amp; bottom edges.
                      </div>
                    </Field>
                  )}
                </>
              )}

              {tab === "icon" && (
                <>
                  <Field label="Icon shape">
                    <div className="grid grid-cols-6 gap-1.5 max-h-32 overflow-y-auto panel-scroll">
                      {ICON_LIBRARY.map(({ key, label, Icon }) => (
                        <button
                          key={key}
                          onClick={() => setIconKey(key)}
                          title={label}
                          className={`aspect-square rounded border grid place-items-center transition-colors ${
                            iconKey === key
                              ? "border-accent bg-accent/10"
                              : "border-border hover:border-white/30"
                          }`}
                        >
                          <Icon size={16} color={iconTint} />
                        </button>
                      ))}
                    </div>
                  </Field>

                  <Field
                    label="Icon size"
                    trailing={<span className="text-white/70">{iconSizePct}%</span>}
                  >
                    <input
                      type="range"
                      min={20}
                      max={200}
                      value={iconSizePct}
                      onChange={(e) => setIconSizePct(Number(e.target.value))}
                      className="w-full accent-accent"
                    />
                  </Field>

                  <Field label="Icon color">
                    <ColorInput value={iconTint} onChange={setIconTint} />
                  </Field>
                </>
              )}

              {tab === "label" && (
                <>
                  <Field label="Position (relative to icon)">
                    <div className="grid grid-cols-4 gap-1.5">
                      {(["left", "right", "above", "below"] as LabelPosition[]).map(
                        (p) => (
                          <button
                            key={p}
                            onClick={() => setLabelPos(p)}
                            className={`px-2 py-1.5 rounded border text-[11px] capitalize transition-colors ${
                              labelPos === p
                                ? "bg-accent text-black border-accent"
                                : "border-border text-neutral-300 hover:border-white/30"
                            }`}
                          >
                            {p}
                          </button>
                        )
                      )}
                    </div>
                  </Field>

                  <Field
                    label="Text size"
                    trailing={<span className="text-white/70">{labelSize}px</span>}
                  >
                    <input
                      type="range"
                      min={10}
                      max={48}
                      value={labelSize}
                      onChange={(e) => setLabelSize(Number(e.target.value))}
                      className="w-full accent-accent"
                    />
                  </Field>

                  <Field label="Text color">
                    <ColorInput value={labelColor} onChange={setLabelColor} />
                  </Field>

                  <Field label="Weight">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setLabelBold(false)}
                        className={`flex-1 px-2 py-1.5 rounded border text-[11px] transition-colors ${
                          !labelBold
                            ? "bg-accent text-black border-accent"
                            : "border-border text-neutral-300 hover:border-white/30"
                        }`}
                      >
                        Regular
                      </button>
                      <button
                        onClick={() => setLabelBold(true)}
                        className={`flex-1 px-2 py-1.5 rounded border text-[11px] transition-colors ${
                          labelBold
                            ? "bg-accent text-black border-accent"
                            : "border-border text-neutral-300 hover:border-white/30"
                        }`}
                      >
                        Bold
                      </button>
                    </div>
                  </Field>

                  <Field
                    label="Icon ↔ text gap"
                    trailing={<span className="text-white/70">{labelGap}px</span>}
                  >
                    <input
                      type="range"
                      min={0}
                      max={40}
                      value={labelGap}
                      onChange={(e) => setLabelGap(Number(e.target.value))}
                      className="w-full accent-accent"
                    />
                  </Field>

                  <Field label="Text background">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setLabelBg(null)}
                        className={`px-2 py-1.5 rounded border text-[11px] transition-colors ${
                          !labelBg
                            ? "bg-accent text-black border-accent"
                            : "border-border text-neutral-300 hover:border-white/30"
                        }`}
                      >
                        None
                      </button>
                      <ColorInput
                        value={labelBg ?? "#000000"}
                        onChange={(v) => setLabelBg(v)}
                      />
                    </div>
                  </Field>

                  <Field label="Trailing character">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setLabelSuffix("none")}
                        className={`flex-1 px-2 py-1.5 rounded border text-[11px] transition-colors ${
                          labelSuffix === "none"
                            ? "bg-accent text-black border-accent"
                            : "border-border text-neutral-300 hover:border-white/30"
                        }`}
                      >
                        Name only
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
                  </Field>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-2">
          <div className="text-[11px] text-neutral-500 flex items-center gap-1.5">
            <Info size={11} />
            Generates 2 hotspots per item (icon + text) so you can move
            either independently after placing.
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
                : `Generate ${picked.length} item${
                    picked.length === 1 ? "" : "s"
                  }`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------- UI atoms --------------------------------- */

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-2 py-2 text-[11px] flex items-center justify-center gap-1 relative transition-colors ${
        active ? "text-white" : "text-neutral-400 hover:text-white"
      }`}
    >
      {icon}
      {children}
      {active && (
        <span className="absolute left-2 right-2 bottom-0 h-[2px] bg-accent rounded-t" />
      )}
    </button>
  );
}

function Field({
  label,
  trailing,
  children,
}: {
  label: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[10.5px] uppercase tracking-wider text-neutral-400 mb-1.5">
        <span>{label}</span>
        {trailing && <span className="normal-case tracking-normal">{trailing}</span>}
      </div>
      {children}
    </div>
  );
}

function ColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="relative w-7 h-7 rounded border border-white/15 cursor-pointer overflow-hidden shrink-0">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div
          className="absolute inset-0"
          style={{ backgroundColor: value }}
        />
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-black/40 border border-border rounded px-2 py-1 text-[11px] font-mono text-white/80"
      />
    </div>
  );
}
