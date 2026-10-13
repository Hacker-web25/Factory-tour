"use client";

/**
 * Floating pill toolbar for hotspot style actions.
 *
 * Design points
 * -------------
 * • Compact — small text (10px), tight padding (py-1 px-1), so it
 *   doesn't cover the panorama chrome. Was previously twice this size
 *   which cluttered the top of flat "menu" scenes.
 *
 * • Draggable — grab any empty spot on the pill (not on a button) and
 *   drop it anywhere in the panorama pane. Position is saved in
 *   localStorage under a global key so it survives page reloads AND
 *   applies across every tour.
 *
 * • Collapsible — idle state shows only Copy Style + Paste Style.
 *   Hover expands to reveal Auto-match + Select all. Runs on GPU-
 *   composited properties (max-width, opacity, transform) for 60fps.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Copy,
  ClipboardPaste,
  Sparkles,
  LayoutList,
  GripVertical,
} from "lucide-react";

type Props = {
  stickyEnabled: boolean;
  hasSelection: boolean;
  hasClipboard: boolean;
  selectionCount: number;
  hasHotspotsInScene: boolean;
  onToggleSticky: () => void;
  onCopyStyle: () => void;
  onOpenPaste: () => void;
  onSelectAll: () => void;
};

/** localStorage key for the toolbar's drag position. Global (not
 *  per-tour) — the presenter learns where they want the pill once
 *  and it stays there forever. */
const POS_KEY = "factour:toolbarPos";

type Pos = { x: number; y: number };

/** Read a stored position, defaulting to the top-centre of the parent. */
function loadPos(): Pos | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.x === "number" && typeof p?.y === "number") return p;
    return null;
  } catch {
    return null;
  }
}

function savePos(p: Pos): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(POS_KEY, JSON.stringify(p));
  } catch {}
}

export default function HotspotStyleToolbar({
  stickyEnabled,
  hasSelection,
  hasClipboard,
  selectionCount,
  hasHotspotsInScene,
  onToggleSticky,
  onCopyStyle,
  onOpenPaste,
  onSelectAll,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);

  // Position — null until we've measured, then either a saved value
  // or a computed top-centre default. Stored as absolute px inside the
  // parent (which is the panorama's `.relative` container).
  const [pos, setPos] = useState<Pos | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragOffsetRef = useRef<Pos>({ x: 0, y: 0 });

  const [expanded, setExpanded] = useState(false);
  const pinTimerRef = useRef<number | null>(null);

  // Snap the pill inside the parent's bounds so it can't escape when
  // the viewport shrinks or after a saved position is stale.
  const clampToParent = useCallback((raw: Pos): Pos => {
    const parent = wrapRef.current?.parentElement;
    const pill = pillRef.current;
    if (!parent || !pill) return raw;
    const parentRect = parent.getBoundingClientRect();
    const pillRect = pill.getBoundingClientRect();
    const maxX = Math.max(0, parentRect.width - pillRect.width - 4);
    const maxY = Math.max(0, parentRect.height - pillRect.height - 4);
    return {
      x: Math.max(4, Math.min(maxX, raw.x)),
      y: Math.max(4, Math.min(maxY, raw.y)),
    };
  }, []);

  // On mount: pick up saved position or default to top-centre.
  useEffect(() => {
    const parent = wrapRef.current?.parentElement;
    const pill = pillRef.current;
    if (!parent || !pill) return;
    const saved = loadPos();
    if (saved) {
      setPos(clampToParent(saved));
      return;
    }
    const parentRect = parent.getBoundingClientRect();
    const pillRect = pill.getBoundingClientRect();
    setPos({
      x: Math.max(4, (parentRect.width - pillRect.width) / 2),
      y: 12,
    });
  }, [clampToParent]);

  // Global pointer handlers while dragging — attach on window so the
  // pill keeps following the cursor even if it leaves the parent.
  useEffect(() => {
    if (!dragging) return;
    function onMove(e: PointerEvent) {
      const parent = wrapRef.current?.parentElement;
      if (!parent) return;
      const parentRect = parent.getBoundingClientRect();
      const rawX = e.clientX - parentRect.left - dragOffsetRef.current.x;
      const rawY = e.clientY - parentRect.top - dragOffsetRef.current.y;
      setPos(clampToParent({ x: rawX, y: rawY }));
    }
    function onUp() {
      setDragging(false);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging, clampToParent]);

  // Persist the position after each drag ends.
  useEffect(() => {
    if (dragging) return;
    if (pos) savePos(pos);
  }, [dragging, pos]);

  function startDrag(e: React.PointerEvent) {
    const pill = pillRef.current;
    if (!pill) return;
    const rect = pill.getBoundingClientRect();
    dragOffsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    setDragging(true);
  }

  function pinOpen(ms = 800) {
    setExpanded(true);
    if (pinTimerRef.current != null) window.clearTimeout(pinTimerRef.current);
    pinTimerRef.current = window.setTimeout(() => {
      setExpanded(false);
      pinTimerRef.current = null;
    }, ms);
  }

  useEffect(
    () => () => {
      if (pinTimerRef.current != null) window.clearTimeout(pinTimerRef.current);
    },
    []
  );

  // Hide until we've measured a position — prevents a one-frame flash
  // at (0,0) on mount.
  const visible = pos != null;

  return (
    <div
      ref={wrapRef}
      className="absolute z-30 pointer-events-auto"
      style={{
        left: pos ? pos.x : 0,
        top: pos ? pos.y : 0,
        opacity: visible ? 1 : 0,
        // No CSS transition on left/top so drag stays 1:1 with cursor;
        // opacity fades in when the initial position is set.
        transition: "opacity 120ms ease",
      }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => {
        if (pinTimerRef.current == null) setExpanded(false);
      }}
      onFocus={() => setExpanded(true)}
      onBlur={() => setExpanded(false)}
    >
      <div
        ref={pillRef}
        className={`bg-black/75 backdrop-blur-md border border-white/10 rounded-full pl-0.5 pr-1 py-0.5 flex items-center gap-0.5 shadow-panel ${
          dragging ? "cursor-grabbing" : ""
        }`}
      >
        {/* Drag handle — the ONLY spot with grab cursor so button
            hover doesn't feel confusing. */}
        <button
          onPointerDown={startDrag}
          title="Drag to reposition"
          className="p-1 text-white/40 hover:text-white/80 cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical size={11} />
        </button>

        {/* --- Collapsible left group: Auto-match + Select all --- */}
        <CollapsibleGroup expanded={expanded}>
          <button
            onClick={onToggleSticky}
            title={
              stickyEnabled
                ? "Auto-match ON — new hotspots inherit your last-used look"
                : "Auto-match OFF — new hotspots use defaults"
            }
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10.5px] font-medium transition-colors whitespace-nowrap ${
              stickyEnabled
                ? "bg-accent/20 text-accent hover:bg-accent/30"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Sparkles size={11} />
            Auto-match
            <span
              className={`ml-0.5 w-5 h-2.5 rounded-full flex items-center transition-colors ${
                stickyEnabled ? "bg-accent" : "bg-white/20"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full bg-white shadow transform transition-transform ${
                  stickyEnabled ? "translate-x-2.5" : "translate-x-0.5"
                }`}
              />
            </span>
          </button>

          <div className="w-px h-3 bg-white/10 mx-0.5" />

          <button
            onClick={() => {
              onSelectAll();
              pinOpen();
            }}
            disabled={!hasHotspotsInScene}
            title="Select every hotspot in this scene (Ctrl+A / ⌘A)"
            className="flex items-center gap-1 px-2 py-1 rounded-full text-[10.5px] font-medium text-neutral-300 hover:text-white hover:bg-white/10 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
          >
            <LayoutList size={11} />
            Select all
            {selectionCount > 1 && (
              <span className="ml-0.5 bg-accent/30 text-accent text-[9.5px] font-semibold px-1 py-0.5 rounded-full leading-none">
                {selectionCount}
              </span>
            )}
          </button>

          <div className="w-px h-3 bg-white/10 mx-0.5" />
        </CollapsibleGroup>

        {/* --- Always-visible right group: Copy + Paste --- */}
        <button
          onClick={() => {
            onCopyStyle();
            pinOpen();
          }}
          disabled={!hasSelection}
          title="Copy this hotspot's style"
          className="flex items-center gap-1 px-2 py-1 rounded-full text-[10.5px] font-medium text-neutral-300 hover:text-white hover:bg-white/10 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
        >
          <Copy size={11} />
          Copy
        </button>

        <button
          onClick={onOpenPaste}
          disabled={!hasSelection || !hasClipboard}
          title={
            !hasClipboard
              ? "Clipboard empty — copy a style first"
              : "Paste style — pick which properties to apply"
          }
          className="flex items-center gap-1 px-2 py-1 rounded-full text-[10.5px] font-medium text-neutral-300 hover:text-white hover:bg-white/10 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
        >
          <ClipboardPaste size={11} />
          Paste
        </button>
      </div>
    </div>
  );
}

/** Wraps left-side controls. Collapsed = zero-width slot with the
 *  children faded / slid off to the left. All transitions on
 *  GPU-composited props so drag remains smooth alongside hover
 *  expansion. */
function CollapsibleGroup({
  expanded,
  children,
}: {
  expanded: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center overflow-hidden"
      style={{
        maxWidth: expanded ? 320 : 0,
        opacity: expanded ? 1 : 0,
        transform: expanded ? "translateX(0px)" : "translateX(-8px)",
        transition:
          "max-width 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease, transform 260ms cubic-bezier(0.22, 1, 0.36, 1)",
        willChange: "max-width, opacity, transform",
      }}
    >
      <div
        className="flex items-center gap-0.5"
        style={{ pointerEvents: expanded ? "auto" : "none" }}
        aria-hidden={!expanded}
      >
        {children}
      </div>
    </div>
  );
}
