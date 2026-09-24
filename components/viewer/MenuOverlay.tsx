"use client";

/**
 * MenuOverlay — the scene-index menu.
 *
 * Config comes from the tour: menu_enabled, menu_position (top-left /
 * top-right / bottom-left / bottom-right), menu_size (chip size in px),
 * menu_opacity (resting alpha 0.15–1.0). The chip lives in the chosen
 * corner; clicking it slides in a glass panel with the scene list rooted
 * at the same corner.
 *
 * Glass VPV theme, folder grouping + thumbnails preserved.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { MenuPosition, Scene, Tour } from "@/lib/types";
import { publicUrl } from "@/lib/supabase";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  Menu,
  Pin,
  PinOff,
  X,
} from "lucide-react";
import { useT } from "@/lib/TranslationContext";

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
  // Pinned state persists per tour so the viewer keeps their layout.
  const pinKey = `vpv-menu-pinned:${tour.id}`;
  const [pinned, setPinned] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(pinKey) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(pinKey, pinned ? "1" : "0");
    } catch {}
  }, [pinned, pinKey]);

  // Pinned panels start open so the layout persists across sessions.
  const [open, setOpen] = useState<boolean>(pinned);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close-on-outside-click — bypassed when pinned.
  useEffect(() => {
    if (!open || pinned) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, pinned]);

  if (!tour.menu_enabled) return null;

  const size = Math.max(28, Math.min(120, tour.menu_size ?? 44));
  const opacity = Math.max(0.15, Math.min(1, tour.menu_opacity ?? 0.75));
  const pos = (tour.menu_position ?? "top-left") as MenuPosition;

  // The chip in the corner.
  const chipOffset = 16;
  const chipStyle: React.CSSProperties = {
    position: "absolute",
    zIndex: 32,
    width: size,
    height: size,
    ...(pos.startsWith("top") ? { top: chipOffset } : { bottom: chipOffset }),
    ...(pos.endsWith("left") ? { left: chipOffset } : { right: chipOffset }),
    opacity: open ? 1 : opacity,
    transition: "opacity 200ms ease, transform 200ms ease",
  };

  // The panel — sized 300px wide, capped in height, anchored to the chip
  // corner and slides in from the same edge. When pinned the panel sits
  // tighter to the corner (no chip gap) since the chip is hidden.
  const panelBase: React.CSSProperties = {
    position: "absolute",
    zIndex: 31,
    width: 300,
    maxHeight: "70vh",
    ...(pos.startsWith("top")
      ? { top: pinned ? chipOffset : chipOffset + size + 8 }
      : { bottom: pinned ? chipOffset : chipOffset + size + 8 }),
    ...(pos.endsWith("left") ? { left: chipOffset } : { right: chipOffset }),
    transformOrigin: transformOriginFor(pos),
    transform: open ? "scale(1)" : "scale(0.92)",
    opacity: open ? 1 : 0,
    pointerEvents: open ? "auto" : "none",
    transition:
      "transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease",
  };

  return (
    <div ref={wrapRef} className="select-none">
      {/* Trigger chip — glass, translucent, positioned per tour settings.
          Hidden when the panel is pinned (the panel is always visible then,
          so the chip would just get in the way). */}
      {!pinned && (
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close scene index" : "Open scene index"}
          style={chipStyle}
          className="grid place-items-center rounded-full bg-white/85 hover:bg-white border border-white/60 backdrop-blur-xl text-vpv-navy shadow-[0_10px_30px_-10px_rgba(11,61,145,0.4)] hover:scale-105"
        >
          {open ? (
            <X size={Math.round(size * 0.42)} />
          ) : (
            <Menu size={Math.round(size * 0.42)} />
          )}
        </button>
      )}

      {/* Panel */}
      <div
        style={panelBase}
        className="rounded-2xl bg-white/75 backdrop-blur-2xl border border-white/60 shadow-[0_20px_60px_-20px_rgba(11,61,145,0.4)] overflow-hidden flex flex-col"
      >
        <div className="flex items-center gap-1 px-3 py-2.5 border-b border-white/50">
          <div className="text-[11px] uppercase tracking-wider text-vpv-muted font-semibold flex-1">
            Scenes{" "}
            <span className="text-vpv-ink/50 ml-1 font-normal normal-case tracking-normal">
              {scenes.length}
            </span>
          </div>
          {/* Pin — keeps the panel open across scene changes and outside
              clicks. Persisted per tour in localStorage. */}
          <button
            onClick={() => {
              setPinned((v) => !v);
              // When pinning, make sure the panel is showing.
              if (!pinned) setOpen(true);
            }}
            title={pinned ? "Unpin" : "Pin panel open"}
            className={`w-7 h-7 grid place-items-center rounded-md transition-colors ${
              pinned
                ? "bg-vpv-blue text-white"
                : "text-vpv-muted hover:text-vpv-navy hover:bg-vpv-tint/60"
            }`}
          >
            {pinned ? <PinOff size={13} /> : <Pin size={13} />}
          </button>
          {!pinned && (
            <button
              onClick={() => setOpen(false)}
              title="Close"
              className="w-7 h-7 grid place-items-center rounded-md text-vpv-muted hover:text-vpv-navy hover:bg-vpv-tint/60"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto panel-scroll p-2">
          {scenes.length === 0 ? (
            <div className="text-xs text-vpv-muted px-2 py-3">
              No scenes yet.
            </div>
          ) : (
            <SceneList
              scenes={scenes}
              activeSceneId={activeSceneId}
              onSelect={(id) => {
                onSelectScene(id);
                // Keep the panel visible when pinned so the viewer can
                // click through scenes without re-opening it.
                if (!pinned) setOpen(false);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function transformOriginFor(pos: MenuPosition): string {
  return `${pos.startsWith("top") ? "top" : "bottom"} ${
    pos.endsWith("left") ? "left" : "right"
  }`;
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
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] uppercase tracking-wide text-vpv-muted hover:text-vpv-navy"
              >
                {isCollapsed ? (
                  <ChevronRight size={12} />
                ) : (
                  <ChevronDown size={12} />
                )}
                <Folder size={12} />
                <span className="truncate flex-1 text-left">{g.label}</span>
                <span className="text-[10px] text-vpv-muted/60">
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
  const { t } = useT();
  const thumbUrl = publicUrl(s.thumbnail_path ?? s.image_path);
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 text-sm transition ${
        active
          ? "bg-vpv-blue text-white font-medium shadow-[0_6px_18px_-8px_rgba(20,104,216,0.6)]"
          : "hover:bg-vpv-tint/70 text-vpv-ink"
      }`}
    >
      {thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbUrl}
          alt=""
          draggable={false}
          className={`w-10 h-6 object-cover rounded border shrink-0 ${
            active ? "border-white/40" : "border-vpv-line"
          }`}
        />
      ) : (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            active ? "bg-white" : "bg-vpv-blue"
          }`}
        />
      )}
      <span className="truncate flex-1">
        {t(s.name) || `Scene ${index + 1}`}
      </span>
    </button>
  );
}
