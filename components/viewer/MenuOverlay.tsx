"use client";

import { useState } from "react";
import type { MenuPosition, Scene, Tour } from "@/lib/types";

/**
 * Corner-docked scene-index menu.
 * Icon (custom "list" glyph — three dots and three bars, similar to but not
 * derived from any copyrighted set) sits in one of four corners with a
 * user-set size and resting opacity. Clicking it expands a smoothly-animated
 * panel with a clickable list of scene names.
 */
export default function MenuOverlay({
  tour,
  scenes,
  activeSceneId,
  onSelectScene,
}: {
  tour: Tour;
  scenes: Scene[];
  activeSceneId: string | null;
  onSelectScene: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!tour.menu_enabled) return null;

  const size = Math.max(28, Math.min(120, tour.menu_size ?? 44));
  const opacity = Math.max(0.15, Math.min(1, tour.menu_opacity ?? 0.75));
  const pos = (tour.menu_position ?? "top-left") as MenuPosition;

  const positionStyle: React.CSSProperties = {
    position: "absolute",
    ...positionOffsets(pos),
    zIndex: 30,
  };

  const menuAnchor = anchorForPosition(pos);

  return (
    <div style={positionStyle} className="select-none">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Scene index"
        style={{
          width: size,
          height: size,
          opacity: open ? 1 : opacity,
          transition: "opacity 200ms ease, transform 200ms ease",
        }}
        className="grid place-items-center rounded-lg bg-black/60 border border-white/20 backdrop-blur-sm hover:opacity-100 hover:scale-105 cursor-pointer"
      >
        <MenuGlyph size={Math.round(size * 0.55)} />
      </button>

      {/* Menu panel */}
      <div
        style={{
          ...menuAnchor,
          transformOrigin: transformOriginFor(pos),
          transform: open ? "scale(1)" : "scale(0.85)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition:
            "transform 220ms cubic-bezier(0.2, 0.9, 0.35, 1.15), opacity 180ms ease",
        }}
        className="absolute min-w-[240px] max-w-[320px] max-h-[70vh] overflow-auto rounded-lg bg-black/85 border border-white/15 backdrop-blur-md shadow-2xl p-2"
      >
        <div className="text-[10px] uppercase tracking-wide text-neutral-400 px-2 py-1.5">
          Scenes
        </div>
        {scenes.length === 0 && (
          <div className="text-xs text-neutral-500 px-2 py-3">
            No scenes yet.
          </div>
        )}
        <ul className="space-y-0.5">
          {scenes.map((s, i) => (
            <li key={s.id}>
              <button
                onClick={() => {
                  onSelectScene(s.id);
                  setOpen(false);
                }}
                className={`w-full text-left px-2.5 py-2 rounded flex items-center gap-2 text-sm transition ${
                  s.id === activeSceneId
                    ? "bg-accent text-black font-medium"
                    : "hover:bg-white/10 text-neutral-100"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    s.id === activeSceneId ? "bg-black/70" : "bg-cyan-400"
                  }`}
                />
                <span className="truncate flex-1">
                  {s.name || `Scene ${i + 1}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------- Helpers -------------------------------- */

function positionOffsets(pos: MenuPosition) {
  switch (pos) {
    case "top-left":
      return { top: 16, left: 16 };
    case "top-right":
      return { top: 16, right: 16 };
    case "bottom-left":
      return { bottom: 96, left: 16 };
    case "bottom-right":
      return { bottom: 96, right: 16 };
  }
}

function anchorForPosition(pos: MenuPosition): React.CSSProperties {
  switch (pos) {
    case "top-left":
      return { top: "calc(100% + 8px)", left: 0 };
    case "top-right":
      return { top: "calc(100% + 8px)", right: 0 };
    case "bottom-left":
      return { bottom: "calc(100% + 8px)", left: 0 };
    case "bottom-right":
      return { bottom: "calc(100% + 8px)", right: 0 };
  }
}

function transformOriginFor(pos: MenuPosition): string {
  switch (pos) {
    case "top-left":
      return "top left";
    case "top-right":
      return "top right";
    case "bottom-left":
      return "bottom left";
    case "bottom-right":
      return "bottom right";
  }
}

/**
 * Custom list glyph — three dots on the left, three bars on the right.
 * Drawn from scratch (not derived from any copyrighted icon set).
 */
function MenuGlyph({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* dots */}
      <circle cx="7" cy="8" r="2.4" fill="currentColor" />
      <circle cx="7" cy="16" r="2.4" fill="currentColor" />
      <circle cx="7" cy="24" r="2.4" fill="currentColor" />
      {/* bars */}
      <rect x="13" y="6" width="14" height="4" rx="2" fill="currentColor" />
      <rect x="13" y="14" width="14" height="4" rx="2" fill="currentColor" />
      <rect x="13" y="22" width="14" height="4" rx="2" fill="currentColor" />
      <style>{`svg { color: white; }`}</style>
    </svg>
  );
}
