"use client";

import { useMemo, useState } from "react";
import type { MenuPosition, Scene, Tour } from "@/lib/types";
import { publicUrl } from "@/lib/supabase";
import { ChevronDown, ChevronRight, Folder } from "lucide-react";

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
        <SceneList
          scenes={scenes}
          activeSceneId={activeSceneId}
          onSelect={(id) => {
            onSelectScene(id);
            setOpen(false);
          }}
        />
      </div>
    </div>
  );
}

/* ------------ Scene list with folder grouping + thumbnails ------------ */

function SceneList({
  scenes,
  activeSceneId,
  onSelect,
}: {
  scenes: Scene[];
  activeSceneId: string | null;
  onSelect: (id: string) => void;
}) {
  // Group scenes by folder (preserving encounter order for both folder + item).
  const groups = useMemo(() => {
    const map = new Map<string, Scene[]>();
    for (const s of scenes) {
      const key = (s.folder ?? "").trim() || "__root__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries()).map(([key, list]) => ({
      key,
      label: key === "__root__" ? null : key,
      scenes: list,
    }));
  }, [scenes]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    <ul className="space-y-0.5">
      {groups.map((g) => {
        const isFolder = g.label !== null;
        const isCollapsed = !!collapsed[g.key];
        return (
          <li key={g.key}>
            {isFolder && (
              <button
                onClick={() =>
                  setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))
                }
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] uppercase tracking-wide text-neutral-300 hover:text-white"
              >
                {isCollapsed ? (
                  <ChevronRight size={12} />
                ) : (
                  <ChevronDown size={12} />
                )}
                <Folder size={12} />
                <span className="truncate flex-1 text-left">{g.label}</span>
                <span className="text-[10px] text-neutral-500">
                  {g.scenes.length}
                </span>
              </button>
            )}
            {(!isFolder || !isCollapsed) && (
              <ul className={isFolder ? "space-y-0.5 pl-3" : "space-y-0.5"}>
                {g.scenes.map((s, i) => (
                  <li key={s.id}>
                    <SceneRow
                      scene={s}
                      index={i}
                      active={s.id === activeSceneId}
                      onClick={() => onSelect(s.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SceneRow({
  scene: s,
  index,
  active,
  onClick,
}: {
  scene: Scene;
  index: number;
  active: boolean;
  onClick: () => void;
}) {
  const thumbUrl = publicUrl(s.thumbnail_path ?? s.image_path);
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 text-sm transition ${active ? "bg-accent text-black font-medium" : "hover:bg-white/10 text-neutral-100"}`}
    >
      {thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbUrl} alt="" draggable={false} className="w-10 h-6 object-cover rounded border border-white/10 shrink-0" />
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? "bg-black/70" : "bg-cyan-400"}`} />
      )}
      <span className="truncate flex-1">{s.name || `Scene ${index + 1}`}</span>
    </button>
  );
}

function positionOffsets(pos: MenuPosition) {
  switch (pos) {
    case "top-left": return { top: 16, left: 16 };
    case "top-right": return { top: 16, right: 16 };
    case "bottom-left": return { bottom: 96, left: 16 };
    case "bottom-right": return { bottom: 96, right: 16 };
  }
}

function anchorForPosition(pos: MenuPosition): React.CSSProperties {
  switch (pos) {
    case "top-left": return { top: "calc(100% + 8px)", left: 0 };
    case "top-right": return { top: "calc(100% + 8px)", right: 0 };
    case "bottom-left": return { bottom: "calc(100% + 8px)", left: 0 };
    case "bottom-right": return { bottom: "calc(100% + 8px)", right: 0 };
  }
}

function transformOriginFor(pos: MenuPosition): string {
  switch (pos) {
    case "top-left": return "top left";
    case "top-right": return "top right";
    case "bottom-left": return "bottom left";
    case "bottom-right": return "bottom right";
  }
}

function MenuGlyph({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="7" cy="8" r="2.4" fill="currentColor" />
      <circle cx="7" cy="16" r="2.4" fill="currentColor" />
      <circle cx="7" cy="24" r="2.4" fill="currentColor" />
      <rect x="13" y="6" width="14" height="4" rx="2" fill="currentColor" />
      <rect x="13" y="14" width="14" height="4" rx="2" fill="currentColor" />
      <rect x="13" y="22" width="14" height="4" rx="2" fill="currentColor" />
      <style>{`svg { color: white; }`}</style>
    </svg>
  );
}
