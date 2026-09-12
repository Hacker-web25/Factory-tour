"use client";

/**
 * Floating pill toolbar shown while a hotspot is selected.
 *
 * Collapse behavior
 * -----------------
 * Idle: only Copy Style and Paste Style are visible — those are the
 * "action" buttons the presenter reaches for most often.
 *
 * Hover (or focus): the pill expands smoothly to reveal Auto-match
 * toggle and Select all. Animation uses opacity + translateX +
 * max-width transitions on a fixed 300ms cubic-bezier curve so the
 * expansion stays crisp at 60fps and doesn't cause layout jank.
 *
 * The trigger area is the whole pill so a presenter can hover
 * anywhere on it and see everything unfurl instantly.
 */

import { useEffect, useRef, useState } from "react";
import {
  Copy,
  ClipboardPaste,
  Sparkles,
  LayoutList,
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
  // Manual open/close so we can also expand on focus (keyboard users)
  // and pin it open briefly after a click so the user's next action
  // has time to land without the toolbar collapsing mid-motion.
  const [expanded, setExpanded] = useState(false);
  const pinTimerRef = useRef<number | null>(null);

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

  return (
    <div
      className="absolute top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-auto"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => {
        // Only collapse if we're not currently pinned by a click.
        if (pinTimerRef.current == null) setExpanded(false);
      }}
      onFocus={() => setExpanded(true)}
      onBlur={() => setExpanded(false)}
    >
      <div className="bg-black/75 backdrop-blur-md border border-white/10 rounded-full pl-1 pr-1 py-1 flex items-center gap-1 shadow-panel">
        {/* --- Collapsible left group: Auto-match + Select all --- */}
        <CollapsibleGroup expanded={expanded}>
          {/* Auto-match toggle */}
          <button
            onClick={onToggleSticky}
            title={
              stickyEnabled
                ? "Auto-match style is ON — new hotspots inherit your last-used look. Click to turn off."
                : "Auto-match style is OFF — new hotspots use factory defaults. Click to turn on."
            }
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-colors ${
              stickyEnabled
                ? "bg-accent/20 text-accent hover:bg-accent/30"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Sparkles size={12} />
            Auto-match
            <span
              className={`ml-0.5 w-6 h-3 rounded-full flex items-center transition-colors ${
                stickyEnabled ? "bg-accent" : "bg-white/20"
              }`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full bg-white shadow transform transition-transform ${
                  stickyEnabled ? "translate-x-3" : "translate-x-0.5"
                }`}
              />
            </span>
          </button>

          <div className="w-px h-4 bg-white/10 mx-0.5" />

          {/* Select all */}
          <button
            onClick={() => {
              onSelectAll();
              pinOpen();
            }}
            disabled={!hasHotspotsInScene}
            title="Select every hotspot in this scene (Ctrl+A / ⌘A)"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium text-neutral-300 hover:text-white hover:bg-white/10 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
          >
            <LayoutList size={12} />
            Select all
            {selectionCount > 1 && (
              <span className="ml-0.5 bg-accent/30 text-accent text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none">
                {selectionCount}
              </span>
            )}
          </button>

          <div className="w-px h-4 bg-white/10 mx-0.5" />
        </CollapsibleGroup>

        {/* --- Always-visible right group: Copy + Paste --- */}
        <button
          onClick={() => {
            onCopyStyle();
            pinOpen();
          }}
          disabled={!hasSelection}
          title="Copy this hotspot's style"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium text-neutral-300 hover:text-white hover:bg-white/10 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
        >
          <Copy size={12} />
          Copy style
        </button>

        <button
          onClick={onOpenPaste}
          disabled={!hasSelection || !hasClipboard}
          title={
            !hasClipboard
              ? "Clipboard is empty — copy a style from another hotspot first"
              : "Paste style — pick which properties to apply"
          }
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium text-neutral-300 hover:text-white hover:bg-white/10 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
        >
          <ClipboardPaste size={12} />
          Paste style
        </button>
      </div>
    </div>
  );
}

/** Wraps left-side controls. Collapsed = zero-width slot with the
 *  children faded / slid off to the left. Expanded = full width with
 *  children snapped into place. Animation runs off transform + opacity
 *  + max-width which are all GPU-composited → 60fps on modest laptops. */
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
        // A generous max-width when expanded — enough to hold both
        // buttons plus the two dividers. Transitioning max-width (not
        // width) means we don't need to measure the content first,
        // and the browser can smoothly interpolate on the composite
        // thread.
        maxWidth: expanded ? 320 : 0,
        opacity: expanded ? 1 : 0,
        transform: expanded ? "translateX(0px)" : "translateX(-8px)",
        transition:
          "max-width 300ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease, transform 300ms cubic-bezier(0.22, 1, 0.36, 1)",
        willChange: "max-width, opacity, transform",
      }}
    >
      {/* Disable pointer + keyboard interaction while collapsed so a
          click on the (invisible) slot doesn't trigger a hidden button. */}
      <div
        className="flex items-center gap-1"
        style={{
          pointerEvents: expanded ? "auto" : "none",
        }}
        aria-hidden={!expanded}
      >
        {children}
      </div>
    </div>
  );
}
