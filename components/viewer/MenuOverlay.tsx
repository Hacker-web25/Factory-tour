"use client";

/**
 * MenuOverlay — the scene-index side rail (a.k.a. the tour's "menu").
 *
 * Design goals (rewrite):
 *   • Glassmorphism styling matching the VPV brand — semi-transparent
 *     white, navy text, brand-blue accent for the active scene.
 *   • Pinnable: opens as a floating panel on click, then a pin icon
 *     locks it as a permanent LEFT or RIGHT rail (choice persisted per
 *     tour in localStorage).
 *   • Auto-collapses back to a discreet round chip when unpinned and
 *     the user clicks outside.
 *   • Folder grouping preserved from the old menu.
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
  ArrowLeftFromLine,
  ArrowRightFromLine,
} from "lucide-react";
import { useT } from "@/lib/TranslationContext";

type Side = "left" | "right";

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
  // Which side of the screen the rail lives on — user pref, per tour.
  const storageKey = `vpv-menu-side:${tour.id}`;
  const pinKey = `vpv-menu-pinned:${tour.id}`;

  const [side, setSide] = useState<Side>(() => {
    if (typeof window === "undefined") return sideFromTourDefault(tour);
    try {
      const v = window.localStorage.getItem(storageKey);
      if (v === "left" || v === "right") return v;
    } catch {}
    return sideFromTourDefault(tour);
  });
  const [pinned, setPinned] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(pinKey) === "1";
    } catch {
      return false;
    }
  });
  const [open, setOpen] = useState<boolean>(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Persist prefs whenever they change.
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, side);
    } catch {}
  }, [side, storageKey]);
  useEffect(() => {
    try {
      window.localStorage.setItem(pinKey, pinned ? "1" : "0");
    } catch {}
  }, [pinned, pinKey]);

  // Close-on-outside-click, but only when NOT pinned.
  useEffect(() => {
    if (!open || pinned) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, pinned]);

  if (!tour.menu_enabled) return null;

  const panelVisible = open || pinned;
  const size = 40;

  // The panel — glass sheet, full height, docked to the chosen side.
  const panelStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    bottom: 0,
    [side]: 0,
    width: 300,
    zIndex: 25,
    transform: panelVisible
      ? "translateX(0)"
      : side === "left"
        ? "translateX(-100%)"
        : "translateX(100%)",
    transition:
      "transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms",
    opacity: panelVisible ? 1 : 0,
    pointerEvents: panelVisible ? "auto" : "none",
  };

  // The trigger chip — visible only when the panel is closed.
  const chipStyle: React.CSSProperties = {
    position: "absolute",
    top: 16,
    [side === "left" ? "left" : "right"]: 16,
    zIndex: 26,
    width: size,
    height: size,
    opacity: panelVisible ? 0 : 1,
    pointerEvents: panelVisible ? "none" : "auto",
    transition: "opacity 180ms",
  };

  return (
    <div ref={wrapRef} className="select-none">
      {/* Trigger chip — always in the SAME corner as the pinned side. */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open scene index"
        style={chipStyle}
        className="grid place-items-center rounded-full bg-white/80 hover:bg-white border border-white/70 backdrop-blur-xl text-vpv-navy shadow-[0_10px_30px_-10px_rgba(11,61,145,0.4)] transition-transform hover:scale-105"
      >
        <Menu size={17} />
      </button>

      {/* The rail */}
      <aside
        style={panelStyle}
        className="flex flex-col bg-white/70 backdrop-blur-2xl border-white/60 shadow-[0_20px_60px_-20px_rgba(11,61,145,0.4)]"
      >
        <div
          className={`border-${side === "left" ? "r" : "l"} border-white/50 flex flex-col h-full`}
        >
          {/* Header — title + pin + close + side-swap */}
          <div className="flex items-center gap-1.5 px-3 py-3 border-b border-white/50">
            <div className="text-[11px] uppercase tracking-wider text-vpv-muted font-semibold flex-1">
              Scenes
              <span className="text-vpv-ink/50 ml-1.5 font-normal normal-case tracking-normal">
                {scenes.length}
              </span>
            </div>

            {/* Move to the other side */}
            <button
              onClick={() => setSide(side === "left" ? "right" : "left")}
              title={
                side === "left" ? "Dock on the right" : "Dock on the left"
              }
              className="w-7 h-7 grid place-items-center rounded-md text-vpv-muted hover:text-vpv-navy hover:bg-vpv-tint/60"
            >
              {side === "left" ? (
                <ArrowRightFromLine size={13} />
              ) : (
                <ArrowLeftFromLine size={13} />
              )}
            </button>

            {/* Pin toggle */}
            <button
              onClick={() => setPinned((v) => !v)}
              title={pinned ? "Unpin" : "Pin as a permanent rail"}
              className={`w-7 h-7 grid place-items-center rounded-md ${
                pinned
                  ? "bg-vpv-blue text-white"
                  : "text-vpv-muted hover:text-vpv-navy hover:bg-vpv-tint/60"
              }`}
            >
              {pinned ? <PinOff size={13} /> : <Pin size={13} />}
            </button>

            {/* Close (only useful when not pinned) */}
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

          {/* Scene list */}
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
                  if (!pinned) setOpen(false);
                }}
              />
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

/** Old tour.menu_position was corner-based — fold that down to left/right
 *  so users' historical prefs land somewhere sensible. */
function sideFromTourDefault(tour: Tour): Side {
  const pos = (tour.menu_position ?? "top-left") as MenuPosition;
  return pos.endsWith("right") ? "right" : "left";
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
