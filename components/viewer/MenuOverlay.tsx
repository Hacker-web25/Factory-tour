"use client";

/**
 * MenuOverlay — the scene-index menu.
 *
 * Two rendering modes:
 *   • Unpinned → corner chip + floating glass panel. Honours menu_position,
 *     menu_size, menu_opacity from the tour.
 *   • Pinned   → full-height vertical rail docked to the chosen side
 *     (left or right). Wider layout with thumbnail + name + optional
 *     description. Pinned state persists per tour in localStorage.
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

type ThumbSize = "sm" | "md" | "lg";

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

  const [open, setOpen] = useState<boolean>(pinned);
  const wrapRef = useRef<HTMLDivElement>(null);

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
  const thumbSize: ThumbSize = (tour.menu_thumb_size ?? "md") as ThumbSize;
  const side: "left" | "right" = pos.endsWith("right") ? "right" : "left";

  return (
    <div ref={wrapRef} className="select-none">
      {/* --- PINNED: full-height vertical rail --- */}
      {pinned ? (
        <aside
          className={`absolute top-0 bottom-0 z-31 flex flex-col bg-white/75 backdrop-blur-2xl border-white/60 shadow-[0_20px_60px_-20px_rgba(11,61,145,0.4)] ${
            side === "left" ? "left-0 border-r" : "right-0 border-l"
          }`}
          style={{ width: railWidth(thumbSize), zIndex: 31 }}
        >
          <PanelHeader
            count={scenes.length}
            pinned
            onPinToggle={() => {
              setPinned(false);
              // Keep it open as a floating panel right after unpin.
              setOpen(true);
            }}
          />
          <div className="flex-1 overflow-y-auto panel-scroll p-2">
            {scenes.length === 0 ? (
              <div className="text-xs text-vpv-muted px-2 py-3">
                No scenes yet.
              </div>
            ) : (
              <SceneList
                scenes={scenes}
                activeSceneId={activeSceneId}
                thumbSize={thumbSize}
                showDescription
                onSelect={onSelectScene}
              />
            )}
          </div>
        </aside>
      ) : (
        <>
          {/* --- UNPINNED: corner chip + floating panel --- */}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close scene index" : "Open scene index"}
            style={{
              position: "absolute",
              zIndex: 32,
              width: size,
              height: size,
              ...(pos.startsWith("top") ? { top: 16 } : { bottom: 16 }),
              ...(pos.endsWith("left") ? { left: 16 } : { right: 16 }),
              opacity: open ? 1 : opacity,
              transition: "opacity 200ms ease, transform 200ms ease",
            }}
            className="grid place-items-center rounded-full bg-white/85 hover:bg-white border border-white/60 backdrop-blur-xl text-vpv-navy shadow-[0_10px_30px_-10px_rgba(11,61,145,0.4)] hover:scale-105"
          >
            {open ? (
              <X size={Math.round(size * 0.42)} />
            ) : (
              <Menu size={Math.round(size * 0.42)} />
            )}
          </button>
          <div
            style={{
              position: "absolute",
              zIndex: 31,
              width: 300,
              maxHeight: "70vh",
              ...(pos.startsWith("top")
                ? { top: 16 + size + 8 }
                : { bottom: 16 + size + 8 }),
              ...(pos.endsWith("left") ? { left: 16 } : { right: 16 }),
              transformOrigin: transformOriginFor(pos),
              transform: open ? "scale(1)" : "scale(0.92)",
              opacity: open ? 1 : 0,
              pointerEvents: open ? "auto" : "none",
              transition:
                "transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease",
            }}
            className="rounded-2xl bg-white/75 backdrop-blur-2xl border border-white/60 shadow-[0_20px_60px_-20px_rgba(11,61,145,0.4)] overflow-hidden flex flex-col"
          >
            <PanelHeader
              count={scenes.length}
              pinned={false}
              onPinToggle={() => {
                setPinned(true);
                setOpen(true);
              }}
              onClose={() => setOpen(false)}
            />
            <div className="flex-1 overflow-y-auto panel-scroll p-2">
              {scenes.length === 0 ? (
                <div className="text-xs text-vpv-muted px-2 py-3">
                  No scenes yet.
                </div>
              ) : (
                <SceneList
                  scenes={scenes}
                  activeSceneId={activeSceneId}
                  thumbSize={thumbSize}
                  showDescription={false}
                  onSelect={(id) => {
                    onSelectScene(id);
                    setOpen(false);
                  }}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function railWidth(t: ThumbSize): number {
  return t === "lg" ? 320 : t === "md" ? 280 : 240;
}

function transformOriginFor(pos: MenuPosition): string {
  return `${pos.startsWith("top") ? "top" : "bottom"} ${
    pos.endsWith("left") ? "left" : "right"
  }`;
}

/* ------------------------------ Header ------------------------------- */

function PanelHeader({
  count,
  pinned,
  onPinToggle,
  onClose,
}: {
  count: number;
  pinned: boolean;
  onPinToggle: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="flex items-center gap-1 px-3 py-2.5 border-b border-white/50">
      <div className="text-[11px] uppercase tracking-wider text-vpv-muted font-semibold flex-1">
        Scenes{" "}
        <span className="text-vpv-ink/50 ml-1 font-normal normal-case tracking-normal">
          {count}
        </span>
      </div>
      <button
        onClick={onPinToggle}
        title={pinned ? "Unpin (back to a floating panel)" : "Pin as a rail"}
        className={`w-7 h-7 grid place-items-center rounded-md transition-colors ${
          pinned
            ? "bg-vpv-blue text-white"
            : "text-vpv-muted hover:text-vpv-navy hover:bg-vpv-tint/60"
        }`}
      >
        {pinned ? <PinOff size={13} /> : <Pin size={13} />}
      </button>
      {onClose && !pinned && (
        <button
          onClick={onClose}
          title="Close"
          className="w-7 h-7 grid place-items-center rounded-md text-vpv-muted hover:text-vpv-navy hover:bg-vpv-tint/60"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/* ------------ Scene list with folder grouping + thumbnails ------------ */

function SceneList({
  scenes,
  activeSceneId,
  thumbSize,
  showDescription,
  onSelect,
}: {
  scenes: Scene[];
  activeSceneId: string | null;
  thumbSize: ThumbSize;
  showDescription: boolean;
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
                      thumbSize={thumbSize}
                      showDescription={showDescription}
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
  thumbSize,
  showDescription,
  onClick,
}: {
  scene: Scene;
  index: number;
  active: boolean;
  thumbSize: ThumbSize;
  showDescription: boolean;
  onClick: () => void;
}) {
  const { t } = useT();
  const thumbUrl = publicUrl(s.thumbnail_path ?? s.image_path);
  const thumb =
    thumbSize === "lg"
      ? { w: 84, h: 52 }
      : thumbSize === "md"
        ? { w: 60, h: 36 }
        : { w: 40, h: 24 };
  const nameSize =
    thumbSize === "lg" ? 14 : thumbSize === "md" ? 13 : 12;
  const descSize =
    thumbSize === "lg" ? 11.5 : thumbSize === "md" ? 10.5 : 10;
  const description = s.description?.trim();

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-2 py-2 rounded-lg flex items-start gap-2.5 transition ${
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
          className={`object-cover rounded-md border shrink-0 ${
            active ? "border-white/40" : "border-vpv-line"
          }`}
          style={{ width: thumb.w, height: thumb.h }}
        />
      ) : (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 mt-2 ${
            active ? "bg-white" : "bg-vpv-blue"
          }`}
        />
      )}
      <div className="min-w-0 flex-1">
        <div
          className="truncate leading-tight"
          style={{ fontSize: nameSize, fontWeight: active ? 600 : 500 }}
        >
          {t(s.name) || `Scene ${index + 1}`}
        </div>
        {showDescription && description && (
          <div
            className={`mt-0.5 line-clamp-2 leading-snug ${
              active ? "text-white/85" : "text-vpv-muted"
            }`}
            style={{ fontSize: descSize }}
          >
            {t(description)}
          </div>
        )}
      </div>
    </button>
  );
}
