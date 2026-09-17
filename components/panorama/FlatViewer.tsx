"use client";

import { useEffect, useRef, useState } from "react";
import type { Hotspot } from "@/lib/types";
import { findIcon } from "@/lib/iconLibrary";
import { fontFor } from "@/lib/fonts";
import {
  type ImageAdjustments,
  normalizeAdjustments,
  buildFilterCSS,
  warmthOverlayStyle,
  vignetteOverlayStyle,
  gradientOverlayStyle,
} from "@/lib/imageAdjustments";

/**
 * Non-panoramic image viewer — used when scene.is_flat is true.
 * Renders a single image scaled to fit, with wheel-zoom + drag-pan, plus
 * absolutely-positioned hotspot overlays at each hotspot's (flat_x, flat_y).
 *
 * In editable mode the parent can:
 *   - click empty image → place a pending hotspot at that spot (via onPlace)
 *   - drag an existing hotspot → parent gets (id, flat_x, flat_y) callbacks
 *   - click a hotspot → parent selects it
 */
export default function FlatViewer({
  imageUrl,
  hotspots = [],
  editable = false,
  selectedHotspotId,
  selectedHotspotIds,
  pendingHotspot,
  onPlace,
  onHotspotClick,
  onHotspotDoubleClick,
  onHotspotDrag,
  onHotspotDragEnd,
  adjustments,
}: {
  imageUrl: string;
  hotspots?: Hotspot[];
  editable?: boolean;
  /** Per-scene colour grading — applied to the flat image + overlays. */
  adjustments?: Partial<ImageAdjustments> | null;
  selectedHotspotId?: string | null;
  /** Optional multi-select set for bulk highlighting. */
  selectedHotspotIds?: Set<string> | null;
  /** If non-null, next click on the image will place this draft. */
  pendingHotspot?: unknown;
  onPlace?: (x: number, y: number) => void;
  onHotspotClick?: (h: Hotspot) => void;
  onHotspotDoubleClick?: (h: Hotspot) => void;
  /** Live position update (unthrottled from viewer's POV — parent can throttle). */
  onHotspotDrag?: (id: string, x: number, y: number) => void;
  /** Fires ONCE on release with the final position — parent should force-persist. */
  onHotspotDragEnd?: (id: string, x: number, y: number) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // Colour grading (matches the 360 PanoramaViewer): CSS filter on the
  // image + blended overlay layers sized to the image box.
  const adj = normalizeAdjustments(adjustments);
  const gradeFilter = buildFilterCSS(adj);
  const warmthStyle = warmthOverlayStyle(adj);
  const vignetteStyle = vignetteOverlayStyle(adj);
  const gradientStyle = gradientOverlayStyle(adj);

  // Reset viewport whenever the underlying image (scene) changes.
  // Without this, switching to another scene and coming back leaves
  // stale pan/zoom values from the previous visit, which shifts every
  // absolutely-positioned hotspot (labels included) by a few pixels —
  // exactly the "text moves a little" bug reported by presenters.
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [imageUrl]);
  const [dragging, setDragging] = useState<null | {
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>(null);

  const imgRef = useRef<HTMLImageElement>(null);

  // Hotspot drag: ref-based (not React state) so the very first pointermove
  // sees the latest value without waiting for a re-render, and we can attach
  // window listeners that survive the cursor leaving the container.
  const dragHotspotRef = useRef<string | null>(null);
  const lastDragPosRef = useRef<{ x: number; y: number } | null>(null);
  const [isDraggingHotspot, setIsDraggingHotspot] = useState(false);

  /* -------- Magnetic snap state (only during drag) -----------------------
   * When the dragged hotspot's raw cursor position gets within SNAP_PX of
   * another hotspot's x or y, the position is locked to that line — with a
   * larger BREAK_PX threshold you can pull past to release. Guide lines
   * (dashed cyan) render at every active snap axis so the user sees exactly
   * what they're aligning to (Figma / Sketch / Kuula-style). */
  const [snapGuides, setSnapGuides] = useState<{
    v: number | null; // vertical guide x (0..1 image pct)
    h: number | null; // horizontal guide y (0..1 image pct)
  }>({ v: null, h: null });
  // Track whether we're currently "stuck" to a snap line and how far the
  // cursor has drifted from it — used for the break-away feel.
  const stickyRef = useRef<{
    stuckX: number | null;
    stuckY: number | null;
  }>({ stuckX: null, stuckY: null });

  function screenToImagePct(clientX: number, clientY: number) {
    const el = imgRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    // Clamp so releasing off-image still commits a valid final position.
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return { x, y };
  }

  function startHotspotDrag(id: string) {
    dragHotspotRef.current = id;
    lastDragPosRef.current = null;
    setIsDraggingHotspot(true);
    stickyRef.current = { stuckX: null, stuckY: null };

    // Snap thresholds — attract within SNAP_PX, break away after BREAK_PX
    // of drift. Feels like the Kuula / Figma / Sketch magnet.
    const SNAP_PX = 8;
    const BREAK_PX = 18;

    const el = imgRef.current;
    const imgRect0 = el?.getBoundingClientRect();
    const imgW0 = imgRect0?.width ?? 1000;
    const imgH0 = imgRect0?.height ?? 1000;

    /* --- Build snap targets from ACTUAL DOM centres of icons and labels ---
     * Snap by real visible parts, not by flat_x/flat_y (which is the flex
     * container's centre and shifts whenever a label sits beside the icon).
     * Two rows of hotspots, one with labels and one without, will now
     * align by their ICON centres like the user expects. */
    const iconTargetsX: number[] = [];
    const iconTargetsY: number[] = [];
    const labelTargetsX: number[] = [];
    const labelTargetsY: number[] = [];
    if (imgRect0) {
      const nodes = el?.parentElement?.querySelectorAll<HTMLElement>(
        "[data-hotspot-id]"
      );
      nodes?.forEach((node) => {
        if (node.dataset.hotspotId === id) return; // exclude the dragged one
        const iconEl = node.querySelector<HTMLElement>('[data-part="icon"]');
        const labelEl = node.querySelector<HTMLElement>('[data-part="label"]');
        if (iconEl) {
          const r = iconEl.getBoundingClientRect();
          iconTargetsX.push(((r.left + r.width / 2) - imgRect0.left) / imgRect0.width);
          iconTargetsY.push(((r.top + r.height / 2) - imgRect0.top) / imgRect0.height);
        }
        if (labelEl) {
          const r = labelEl.getBoundingClientRect();
          labelTargetsX.push(((r.left + r.width / 2) - imgRect0.left) / imgRect0.width);
          labelTargetsY.push(((r.top + r.height / 2) - imgRect0.top) / imgRect0.height);
        }
      });
    }

    /* --- Compute the offset from the dragged hotspot's ANCHOR (flat_x/y)
     * to its own icon centre and label centre. When we snap the icon's
     * centre to some target, we place the anchor at target - iconOffset. */
    let iconOffX = 0, iconOffY = 0;
    let labelOffX = 0, labelOffY = 0;
    let hasIcon = false, hasLabel = false;
    if (imgRect0) {
      const draggedNode = el?.parentElement?.querySelector<HTMLElement>(
        `[data-hotspot-id="${CSS.escape(id)}"]`
      );
      const dr = draggedNode?.getBoundingClientRect();
      const iconEl = draggedNode?.querySelector<HTMLElement>('[data-part="icon"]');
      const labelEl = draggedNode?.querySelector<HTMLElement>('[data-part="label"]');
      if (dr && iconEl) {
        const ir = iconEl.getBoundingClientRect();
        iconOffX = ((ir.left + ir.width / 2) - (dr.left + dr.width / 2)) / imgRect0.width;
        iconOffY = ((ir.top + ir.height / 2) - (dr.top + dr.height / 2)) / imgRect0.height;
        hasIcon = true;
      }
      if (dr && labelEl) {
        const lr = labelEl.getBoundingClientRect();
        labelOffX = ((lr.left + lr.width / 2) - (dr.left + dr.width / 2)) / imgRect0.width;
        labelOffY = ((lr.top + lr.height / 2) - (dr.top + dr.height / 2)) / imgRect0.height;
        hasLabel = true;
      }
    }

    // legacy container-centre targets — still useful when nothing was
    // tagged (e.g. text-type hotspots have no icon).
    const targets = hotspots.filter((o) => o.id !== id && o.flat_x != null && o.flat_y != null);

    const onMove = (ev: PointerEvent) => {
      if (!dragHotspotRef.current) return;
      const rawP = screenToImagePct(ev.clientX, ev.clientY);
      if (!rawP) return;

      const rect = imgRef.current?.getBoundingClientRect();
      const imgW = rect?.width ?? imgW0;
      const imgH = rect?.height ?? imgH0;

      const snapX = SNAP_PX / imgW;
      const snapY = SNAP_PX / imgH;
      const breakX = BREAK_PX / imgW;
      const breakY = BREAK_PX / imgH;

      /* Snap by the dragged hotspot's ICON centre AND its LABEL centre,
       * to other hotspots' icon centres and label centres. Each attempt
       * carries the offset that reconciles snap-point → anchor. */
      type Candidate = { anchor: number; guide: number; d: number };

      function bestOnAxis(
        rawAnchor: number,
        offsets: number[],
        targetsList: number[],
        snap: number
      ): Candidate | null {
        let best: Candidate | null = null;
        for (const off of offsets) {
          const partPos = rawAnchor + off; // where our part currently sits
          for (const t of targetsList) {
            const d = Math.abs(partPos - t);
            if (d < snap && (!best || d < best.d)) {
              best = { anchor: t - off, guide: t, d };
            }
          }
        }
        return best;
      }

      // Which parts of the dragged hotspot are available as snap sources?
      const offsetsX: number[] = [];
      const offsetsY: number[] = [];
      if (hasIcon) { offsetsX.push(iconOffX); offsetsY.push(iconOffY); }
      if (hasLabel) { offsetsX.push(labelOffX); offsetsY.push(labelOffY); }
      // Fallback: anchor centre itself (legacy behaviour).
      if (!hasIcon && !hasLabel) { offsetsX.push(0); offsetsY.push(0); }

      // Targets: real DOM centres (icon + label of every other hotspot),
      // plus legacy container centres as a safety net.
      const targetsX = [
        ...iconTargetsX,
        ...labelTargetsX,
        ...targets.map((o) => o.flat_x as number),
      ];
      const targetsY = [
        ...iconTargetsY,
        ...labelTargetsY,
        ...targets.map((o) => o.flat_y as number),
      ];

      let x = rawP.x;
      let y = rawP.y;
      let guideV: number | null = null;
      let guideH: number | null = null;

      /* --- X (vertical guide) --- */
      if (stickyRef.current.stuckX != null) {
        if (Math.abs(rawP.x - stickyRef.current.stuckX) > breakX) {
          stickyRef.current.stuckX = null;
        } else {
          x = stickyRef.current.stuckX;
          guideV = x + iconOffX; // draw at the icon we snapped to
        }
      }
      if (stickyRef.current.stuckX == null) {
        const cand = bestOnAxis(rawP.x, offsetsX, targetsX, snapX);
        if (cand) {
          stickyRef.current.stuckX = cand.anchor;
          x = cand.anchor;
          guideV = cand.guide;
        }
      }

      /* --- Y (horizontal guide) --- */
      if (stickyRef.current.stuckY != null) {
        if (Math.abs(rawP.y - stickyRef.current.stuckY) > breakY) {
          stickyRef.current.stuckY = null;
        } else {
          y = stickyRef.current.stuckY;
          guideH = y + iconOffY;
        }
      }
      if (stickyRef.current.stuckY == null) {
        const cand = bestOnAxis(rawP.y, offsetsY, targetsY, snapY);
        if (cand) {
          stickyRef.current.stuckY = cand.anchor;
          y = cand.anchor;
          guideH = cand.guide;
        }
      }

      setSnapGuides({ v: guideV, h: guideH });
      const p = { x, y };
      lastDragPosRef.current = p;
      onHotspotDrag?.(dragHotspotRef.current, p.x, p.y);
    };
    const onUp = () => {
      const id2 = dragHotspotRef.current;
      const last = lastDragPosRef.current;
      dragHotspotRef.current = null;
      lastDragPosRef.current = null;
      stickyRef.current = { stuckX: null, stuckY: null };
      setIsDraggingHotspot(false);
      setSnapGuides({ v: null, h: null });
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      // Force a final commit so the last position isn't lost to any throttle.
      if (id2 && last) onHotspotDragEnd?.(id2, last.x, last.y);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  // Safety: if the component unmounts mid-drag, detach listeners.
  useEffect(() => {
    return () => {
      dragHotspotRef.current = null;
    };
  }, []);

  return (
    <div
      className="w-full h-full bg-black overflow-hidden grid place-items-center relative select-none"
      onWheel={(e) => {
        e.preventDefault();
        const next = zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15);
        setZoom(Math.max(0.5, Math.min(6, next)));
      }}
      onPointerDown={(e) => {
        // Hotspot drag is fully handled by window listeners (see startHotspotDrag).
        // This handler only starts an image PAN drag.
        if (pendingHotspot) return;
        if (isDraggingHotspot) return;
        setDragging({
          startX: e.clientX,
          startY: e.clientY,
          origX: pan.x,
          origY: pan.y,
        });
      }}
      onPointerMove={(e) => {
        if (isDraggingHotspot) return; // hotspot drag owns the pointer
        if (!dragging) return;
        setPan({
          x: dragging.origX + (e.clientX - dragging.startX),
          y: dragging.origY + (e.clientY - dragging.startY),
        });
      }}
      onPointerUp={() => setDragging(null)}
      onPointerCancel={() => setDragging(null)}
      style={{
        cursor: isDraggingHotspot
          ? "grabbing"
          : dragging
          ? "grabbing"
          : pendingHotspot
          ? "crosshair"
          : "grab",
      }}
    >
      {/* Zoom+pan transform wrapper — everything inside inherits the transform,
          so hotspots stay locked to the image. */}
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "center",
          transition:
            dragging || isDraggingHotspot ? "none" : "transform 0.08s ease-out",
          position: "relative",
          maxWidth: "100%",
          maxHeight: "100%",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={imageUrl}
          alt=""
          draggable={false}
          onClick={(e) => {
            if (!editable || !pendingHotspot || !onPlace) return;
            const p = screenToImagePct(e.clientX, e.clientY);
            if (p) onPlace(p.x, p.y);
          }}
          style={{
            maxWidth: "min(100vw, 100%)",
            maxHeight: "min(100vh, 100%)",
            objectFit: "contain",
            display: "block",
            pointerEvents: "auto",
            filter: gradeFilter === "none" ? undefined : gradeFilter,
          }}
        />

        {/* Grading overlay layers — cover the image box, blended, and let
            clicks pass through so hotspot placement / drag still works. */}
        {warmthStyle && <div style={warmthStyle} />}
        {gradientStyle && <div style={gradientStyle} />}
        {vignetteStyle && <div style={vignetteStyle} />}

        {/* Magnetic-snap guide lines — dashed cyan strokes that appear only
            while dragging a hotspot near another's x or y axis. Positioned
            in image-pct so they inherit pan/zoom via the transform wrapper. */}
        {editable && (snapGuides.v != null || snapGuides.h != null) && (
          <>
            {snapGuides.v != null && (
              <div
                className="pointer-events-none"
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `${snapGuides.v * 100}%`,
                  width: 0,
                  borderLeft: "1px dashed rgba(34,211,238,0.9)",
                  boxShadow: "0 0 6px rgba(34,211,238,0.4)",
                  zIndex: 30,
                }}
              />
            )}
            {snapGuides.h != null && (
              <div
                className="pointer-events-none"
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: `${snapGuides.h * 100}%`,
                  height: 0,
                  borderTop: "1px dashed rgba(34,211,238,0.9)",
                  boxShadow: "0 0 6px rgba(34,211,238,0.4)",
                  zIndex: 30,
                }}
              />
            )}
          </>
        )}

        {/* Hotspots overlay — inside the same transform so they scale/pan with the image */}
        {hotspots.map((h) => (
          <FlatHotspot
            key={h.id}
            hotspot={h}
            selected={
              selectedHotspotId === h.id ||
              (selectedHotspotIds ? selectedHotspotIds.has(h.id) : false)
            }
            editable={editable}
            onPointerDown={(e) => {
              if (editable) {
                e.stopPropagation();
                e.preventDefault();
                startHotspotDrag(h.id);
              }
            }}
            onClick={() => onHotspotClick?.(h)}
            onDoubleClick={() => onHotspotDoubleClick?.(h)}
          />
        ))}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          setZoom(1);
          setPan({ x: 0, y: 0 });
        }}
        className="absolute bottom-3 right-3 bg-black/60 hover:bg-black/80 border border-white/20 text-white text-xs px-3 py-2 rounded-full backdrop-blur-sm"
      >
        Reset view
      </button>

      {Boolean(pendingHotspot) && editable && (
        <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 bg-black/85 border border-accent text-xs px-3 py-2 rounded">
          Click on the image to place this hotspot
        </div>
      )}
    </div>
  );
}

/* --------------- Single hotspot marker (HTML overlay) --------------- */

function FlatHotspot({
  hotspot: h,
  selected,
  editable,
  onPointerDown,
  onClick,
  onDoubleClick,
}: {
  hotspot: Hotspot;
  selected: boolean;
  editable: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onClick: () => void;
  onDoubleClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const w = Math.max(20, h.width_pct ?? 40);
  const hh = Math.max(20, h.height_pct ?? 40);
  const url = h.icon_url ?? (h.type === "image" ? h.image_url : null);
  const iconEntry = findIcon(h.icon_key);
  const rotation = h.rotation_deg ?? 0;
  const opacity = h.opacity ?? 1;
  // Animation ONLY plays while hovered (or selected in the editor) — never idle.
  const shouldAnimate =
    (hovered || selected) && h.animation && h.animation !== "none";

  return (
    <div
      onPointerDown={onPointerDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick();
      }}
      // Outer wrapper: OWNS positioning + centering only. No animation class
      // here — hs-anim-* keyframes set `transform`, which would clobber
      // translate(-50%, -50%) and visually shift the hotspot off its anchor
      // (the "glitch" you saw when the animation stopped on deselect).
      data-hotspot-id={h.id}
      className="absolute flex items-center gap-1"
      style={{
        left: `${(h.flat_x ?? 0.5) * 100}%`,
        top: `${(h.flat_y ?? 0.5) * 100}%`,
        opacity,
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
        cursor: editable ? "move" : "pointer",
        userSelect: "none",
        filter: h.shadow ? "drop-shadow(0 2px 6px rgba(0,0,0,0.6))" : undefined,
        outline: selected ? "2px solid rgb(34,211,238)" : undefined,
        outlineOffset: 4,
        padding: 6,
        // Label position: bottom (default) = icon on top of label,
        // top = label on top, left/right = side-by-side.
        flexDirection:
          (h.label_position ?? "bottom") === "top"
            ? "column-reverse"
            : (h.label_position ?? "bottom") === "left"
            ? "row-reverse"
            : (h.label_position ?? "bottom") === "right"
            ? "row"
            : "column",
      }}
    >
      {/* Inner wrapper: OWNS the animation only. Its own transform is safe
          to be replaced by hs-anim-* keyframes without breaking centering. */}
      <div
        className={`flex items-center gap-1 ${
          shouldAnimate ? `hs-anim-${h.animation}` : ""
        }`}
        style={{
          flexDirection:
            (h.label_position ?? "bottom") === "top"
              ? "column-reverse"
              : (h.label_position ?? "bottom") === "left"
              ? "row-reverse"
              : (h.label_position ?? "bottom") === "right"
              ? "row"
              : "column",
        }}
      >
      {/* Text-type hotspots render label ONLY — no icon marker.
          Icon wrapper carries data-part="icon" so the magnetic snap can
          measure the icon's true centre (not the flex container's centre,
          which shifts when a label is present). */}
      {h.type !== "text" && (
        <div
          data-part="icon"
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt=""
              draggable={false}
              style={{
                width: w,
                height: hh,
                objectFit: "contain",
                display: "block",
                pointerEvents: "none",
              }}
            />
          ) : iconEntry ? (
            <iconEntry.Icon
              size={Math.min(w, hh)}
              color={h.icon_tint ?? "#ffffff"}
              strokeWidth={2}
            />
          ) : (
            <div
              style={{
                width: w,
                height: hh,
                borderRadius: "50%",
                background: h.color ?? "#22c55e",
                border: "2px solid #fff",
              }}
            />
          )}
        </div>
      )}
      {h.label && (
        <span
          data-part="label"
          style={{
            color: h.label_color ?? "#ffffff",
            fontSize: h.label_size ?? 12,
            fontWeight: h.label_bold ? 700 : 400,
            fontFamily: fontFor(h.label_font),
            background: h.label_bg || "transparent",
            padding: h.label_bg ? "2px 6px" : 0,
            borderRadius: h.label_bg ? 4 : 0,
            textShadow: h.label_bg ? "none" : "0 1px 2px rgba(0,0,0,0.9)",
            // pre-wrap preserves user newlines. width:max-content
            // stops the label from inheriting the icon's narrow width
            // (which would wrap every single word).
            whiteSpace: "pre-wrap",
            textAlign: "center",
            width: "max-content",
            maxWidth: 320,
            wordBreak: "break-word",
            display: "inline-block",
           }}
        >
          {h.label}
        </span>
      )}
      </div>
    </div>
  );
}
