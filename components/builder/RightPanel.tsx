"use client";

import { useEffect, useRef, useState } from "react";
import type {
  Hotspot,
  HotspotAction,
  HotspotAnimation,
  LabelFont,
  Scene,
  Tour,
  TransitionEffect,
} from "@/lib/types";
import { supabase, publicUrl } from "@/lib/supabase";
import { findIcon } from "@/lib/iconLibrary";
import { FONT_OPTIONS, fontFor } from "@/lib/fonts";
import { PRESET_SOUNDS, playHotspotSound } from "@/lib/soundEffects";
import IconPicker from "./IconPicker";
import {
  Image as ImageIcon,
  Type,
  Info,
  Link,
  Bold,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Trash2,
  RotateCcw,
  Sliders,
  Move,
  Play,
  Layers,
  Sparkles,
  Pencil,
  Globe,
  Lock,
  Maximize2,
  EyeOff,
  Mic,
  UserCircle2,
} from "lucide-react";

type Tab = "photo" | "addon" | "hotspot" | "autotour";

type Props = {
  tour: Tour;
  scene: Scene | null;
  scenes: Scene[];
  selectedHotspot: Hotspot | null;
  allHotspots: Hotspot[];
  previewMode: boolean;
  onEnterEditMode: () => void;
  onEnterFullscreen?: () => void;
  onPatchTour: (fields: Partial<Tour>) => Promise<void>;
  /** Read the panorama camera's current yaw/pitch (radians). Used by the
   *  Camera section's "Use current view" button. */
  getCurrentAim?: () => { yaw: number; pitch: number } | null;
  /** Grab a PNG data URL of the current WebGL view. Used by "Set as thumbnail". */
  getSnapshot?: () => string | null;
  onStartAddHotspot: (draft: Partial<Hotspot>) => void;
  onStartReposition: (id: string) => void;
  onTestAction: (h: Hotspot) => void;
  onHotspotChange: (h: Hotspot) => void;
  onHotspotDelete: (id: string) => void;
  onHotspotDuplicate?: (id: string) => void;
  onSceneChange: (s: Scene) => void;
  onSave: () => Promise<void>;
  onPublishToggle: () => Promise<void>;
  /** When true, the panel is hidden via CSS (component stays mounted so state
   *  survives — this is how the editor hides the panel in fullscreen). */
  hidden?: boolean;
};

export default function RightPanel({
  tour,
  scene,
  scenes,
  selectedHotspot,
  allHotspots,
  previewMode,
  onEnterEditMode,
  onEnterFullscreen,
  onPatchTour,
  getCurrentAim,
  getSnapshot,
  onStartAddHotspot,
  onStartReposition,
  onTestAction,
  onHotspotChange,
  onHotspotDelete,
  onHotspotDuplicate,
  onSceneChange,
  onSave,
  onPublishToggle,
  hidden,
}: Props) {
  // Hooks must run in the same order on every render — declare them BEFORE
  // any conditional return, otherwise React sees a different hook count
  // when switching between Preview and Edit and the panel crashes / glitches.
  const [tab, setTab] = useState<Tab>("photo");
  const [saving, setSaving] = useState(false);

  // auto-switch to addon tab when a hotspot is selected
  useEffect(() => {
    if (selectedHotspot) setTab("hotspot");
  }, [selectedHotspot?.id]);

  async function handleSave() {
    setSaving(true);
    await onSave();
    setSaving(false);
  }

  // In Preview mode, show a simplified panel: tour title,
  // and a big "Edit tour" button to jump into edit mode.
  if (previewMode) {
    return (
      <PreviewPanel
        tour={tour}
        onEnterEditMode={onEnterEditMode}
        onPublishToggle={onPublishToggle}
        onEnterFullscreen={onEnterFullscreen}
        onPatchTour={onPatchTour}
        hidden={hidden}
      />
    );
  }

  return (
    <aside
      style={hidden ? { display: "none" } : undefined}
      className="w-[340px] shrink-0 bg-panel border-l border-border flex flex-col shadow-panel"
    >
      <div className="flex items-center border-b border-border bg-chrome min-w-0">
        <TabBtn active={tab === "photo"} onClick={() => setTab("photo")}>
          Photo
        </TabBtn>
        <TabBtn active={tab === "addon"} onClick={() => setTab("addon")}>
          Add
        </TabBtn>
        {selectedHotspot && (
          <TabBtn
            active={tab === "hotspot"}
            onClick={() => setTab("hotspot")}
          >
            Spot
          </TabBtn>
        )}
        {tour.auto_tour_enabled && (
          <TabBtn
            active={tab === "autotour"}
            onClick={() => setTab("autotour")}
          >
            Tour
          </TabBtn>
        )}
        <div className="flex-1 min-w-0" />
        <button
          onClick={handleSave}
          disabled={saving}
          className="shrink-0 bg-accent hover:bg-accentHover text-black text-[11px] font-semibold tracking-wide px-2.5 py-1 mr-1.5 my-1.5 rounded disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="flex-1 overflow-auto panel-scroll p-4 space-y-4">
        {tab === "photo" && scene && (
          <PhotoTab
            tour={tour}
            scene={scene}
            onStartAddHotspot={(d) => {
              onStartAddHotspot(d);
            }}
            onSceneChange={onSceneChange}
            onPublishToggle={onPublishToggle}
            onPatchTour={onPatchTour}
            getCurrentAim={getCurrentAim}
            getSnapshot={getSnapshot}
          />
        )}
        {tab === "addon" && scene && (
          <AddonsTab onStartAddHotspot={onStartAddHotspot} />
        )}
        {tab === "hotspot" && selectedHotspot && (
          <AddonTab
            hotspot={selectedHotspot}
            scenes={scenes}
            onChange={onHotspotChange}
            onDelete={onHotspotDelete}
            onDuplicate={
              onHotspotDuplicate
                ? () => onHotspotDuplicate(selectedHotspot.id)
                : undefined
            }
            onReposition={() => onStartReposition(selectedHotspot.id)}
            onTest={() => onTestAction(selectedHotspot)}
          />
        )}
        {tab === "autotour" && tour.auto_tour_enabled && (
          <AutoTourTab
            tour={tour}
            scenes={scenes}
            allHotspots={allHotspots}
            onPatchTour={onPatchTour}
            onSceneChange={onSceneChange}
            onHotspotChange={onHotspotChange}
          />
        )}
      </div>
    </aside>
  );
}

function VisibilityBtn({
  active,
  onClick,
  accent,
  children,
}: {
  active: boolean;
  onClick: () => void;
  accent: "neutral" | "amber" | "emerald";
  children: React.ReactNode;
}) {
  const activeCls =
    accent === "emerald"
      ? "bg-emerald-500/20 border-emerald-500/60 text-emerald-300"
      : accent === "amber"
      ? "bg-amber-500/20 border-amber-500/60 text-amber-300"
      : "bg-neutral-700 border-neutral-500 text-white";
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-1 py-1.5 text-[11px] rounded border ${
        active
          ? activeCls
          : "bg-panelSoft border-border text-neutral-300 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function TabBtn({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-2.5 py-2.5 text-[11px] tracking-wide font-semibold uppercase transition-colors relative ${
        active
          ? "text-white"
          : "text-neutral-500 hover:text-neutral-200"
      }`}
    >
      {children}
      {active && (
        <span className="absolute left-1.5 right-1.5 bottom-0 h-[2px] bg-accent rounded-t" />
      )}
    </button>
  );
}

/* ------------------------------ PREVIEW PANEL ---------------------------- */
function PreviewPanel({
  tour,
  onEnterEditMode,
  onPatchTour,
  hidden,
}: {
  tour: Tour;
  onEnterEditMode: () => void;
  onPublishToggle?: () => Promise<void>;
  onEnterFullscreen?: () => void;
  onPatchTour: (fields: Partial<Tour>) => Promise<void>;
  hidden?: boolean;
}) {
  const visibility: "private" | "unlisted" | "public" =
    (tour.visibility as "private" | "unlisted" | "public") ??
    (tour.published ? "public" : "private");

  async function setVisibility(v: "private" | "unlisted" | "public") {
    await onPatchTour({
      visibility: v,
      // Keep legacy `published` in sync for any older reads.
      published: v === "public",
    });
  }
  return (
    <aside
      style={hidden ? { display: "none" } : undefined}
      className="w-[340px] shrink-0 bg-panel border-l border-border flex flex-col"
    >
      <div className="p-5 space-y-4 overflow-auto panel-scroll">
        <button
          onClick={onEnterEditMode}
          className="w-full bg-accent text-black font-medium py-2.5 rounded flex items-center justify-center gap-2 hover:opacity-90"
        >
          <Pencil size={14} /> Edit tour
        </button>

        <button
          onClick={() => {
            // Open the public viewer with a fullscreen flag in a fresh tab.
            // The main editor stays untouched — no chrome-hiding state to
            // corrupt when the user comes back.
            window.open(`/tour/${tour.id}?fullscreen=1&preview=1`, "_blank");
          }}
          className="w-full bg-panelSoft border border-border text-neutral-100 font-medium py-2 rounded flex items-center justify-center gap-2 hover:bg-neutral-700"
        >
          <Maximize2 size={14} /> Fullscreen
        </button>

        {/* Three-state visibility */}
        <div>
          <div className="text-[10px] uppercase tracking-wide text-neutral-400 mb-1">
            Visibility
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <VisibilityBtn
              active={visibility === "private"}
              onClick={() => setVisibility("private")}
              accent="neutral"
            >
              <Lock size={12} /> Private
            </VisibilityBtn>
            <VisibilityBtn
              active={visibility === "unlisted"}
              onClick={() => setVisibility("unlisted")}
              accent="amber"
            >
              <EyeOff size={12} /> Unlisted
            </VisibilityBtn>
            <VisibilityBtn
              active={visibility === "public"}
              onClick={() => setVisibility("public")}
              accent="emerald"
            >
              <Globe size={12} /> Public
            </VisibilityBtn>
          </div>

          {visibility === "unlisted" && (
            <div className="mt-2">
              <div className="text-[10px] uppercase text-neutral-400 mb-1">
                Optional password
              </div>
              <input
                type="text"
                value={tour.unlisted_password ?? ""}
                onChange={(e) =>
                  onPatchTour({
                    unlisted_password: e.target.value || null,
                  })
                }
                placeholder="Leave blank for link-only"
                className="w-full bg-panelSoft border border-border rounded px-2 py-1.5 text-sm"
              />
              <div className="text-[10px] text-neutral-500 mt-1">
                Only people with the link (and password, if set) can view.
              </div>
            </div>
          )}
        </div>

        {/* Project title + description */}
        <div className="pt-3 border-t border-border min-w-0">
          <div className="text-lg font-semibold leading-tight break-words">
            {tour.title || "Untitled tour"}
          </div>
          {tour.description && (
            <div
              className="mt-2 text-sm text-neutral-300 whitespace-pre-wrap leading-relaxed break-words"
              style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
            >
              {tour.description}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

/* ------------------------------- ADDONS TAB ------------------------------ */

/** Just the add-on placement buttons. Selecting one puts the editor into
 *  "place mode" — user then clicks on the panorama to drop the hotspot. */
function AddonsTab({
  onStartAddHotspot,
}: {
  onStartAddHotspot: (d: Partial<Hotspot>) => void;
}) {
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <AddonBtn
          icon={<ImageIcon size={16} />}
          label="Image"
          onClick={() =>
            onStartAddHotspot({
              type: "image",
              action: "none",
              // Blue circle → morphing card renderer handles this type.
              // User fills in image_url and optional caption in the panel.
            })
          }
        />
        <AddonBtn
          icon={<Type size={16} />}
          label="Text"
          onClick={() =>
            onStartAddHotspot({ type: "text", label: "Text" })
          }
        />
        <AddonBtn
          icon={<Info size={16} />}
          label="Hotspot"
          onClick={() => onStartAddHotspot({ type: "icon" })}
        />
        <AddonBtn
          icon={<Info size={16} />}
          label="Info"
          onClick={() =>
            onStartAddHotspot({
              type: "info",
              action: "info_popup",
              icon_key: "info",
              info_title: "Info",
              info_body: "Add details here…",
            })
          }
        />
        <AddonBtn
          icon={<UserCircle2 size={16} />}
          label="Person"
          onClick={() =>
            onStartAddHotspot({
              type: "person",
              action: "none",
              label: "Person name",
              info_body: "Role · Details",
            })
          }
        />
        <AddonBtn
          icon={<Pencil size={16} />}
          label="Polygon"
          onClick={() =>
            onStartAddHotspot({
              type: "polygon",
              action: "info_popup",
              polygon_points: [],
              polygon_fill_color: "#22d3ee",
              polygon_stroke_color: "#22d3ee",
              polygon_fill_opacity: 0.15,
              polygon_stroke_width: 2,
            })
          }
        />
        <AddonBtn
          icon={<Mic size={16} />}
          label="Audio"
          onClick={() =>
            onStartAddHotspot({
              type: "audio",
              action: "audio_popup",
              icon_key: "mic",
            })
          }
        />
      </div>

      {imagePickerOpen && (
        <IconPicker
          tint="#ffffff"
          onClose={() => setImagePickerOpen(false)}
          onPick={(v) => {
            onStartAddHotspot({
              type: "image",
              overlay_mode: "billboard",
              icon_url: v.icon_url ?? null,
              icon_key: v.icon_key ?? null,
              image_url: v.icon_url ?? null,
            });
            setImagePickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------- PHOTO TAB ------------------------------- */
function PhotoTab({
  tour,
  scene,
  onStartAddHotspot,
  onSceneChange,
  onPublishToggle,
  onPatchTour,
  getCurrentAim,
  getSnapshot,
}: {
  tour: Tour;
  scene: Scene;
  onStartAddHotspot: (d: Partial<Hotspot>) => void;
  onSceneChange: (s: Scene) => void;
  onPublishToggle: () => Promise<void>;
  onPatchTour: (fields: Partial<Tour>) => Promise<void>;
  getCurrentAim?: () => { yaw: number; pitch: number } | null;
  getSnapshot?: () => string | null;
}) {
  return (
    <div className="space-y-5 text-sm">
      {/* Scene rename at the top so it's easy to find */}
      <div>
        <div className="text-xs uppercase text-neutral-400 mb-1">
          Scene name
        </div>
        <input
          value={scene.name}
          onChange={(e) => onSceneChange({ ...scene, name: e.target.value })}
          placeholder="Give this scene a name"
          className="w-full bg-panelSoft border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
        <div className="text-[11px] text-neutral-500 mt-1">
          Shows under the thumbnail in the bottom strip.
        </div>
      </div>

      <CameraSettings
        scene={scene}
        onSceneChange={onSceneChange}
        getCurrentAim={getCurrentAim}
      />

      {/* Add-on buttons moved to the dedicated ADDON tab so this panel
          stays focused on scene / camera settings.
          SceneActions (thumbnail, replace image, tripod, folder,
          copy/move) is pushed to the END of the tab — copy/move is a
          low-priority action so it sits at the very bottom. */}

      <div>
        <div className="text-xs uppercase text-neutral-400 mb-1">Tour</div>
        <input
          value={tour.title}
          onChange={async (e) => {
            await supabase
              .from("tours")
              .update({ title: e.target.value })
              .eq("id", tour.id);
          }}
          className="w-full bg-panelSoft border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
      </div>

      <div>
        <div className="text-xs uppercase text-neutral-400 mb-1">Privacy</div>
        <button
          onClick={onPublishToggle}
          className={`w-full text-left rounded px-2 py-1.5 text-sm ${
            tour.published
              ? "bg-accent text-black"
              : "bg-panelSoft border border-border"
          }`}
        >
          {tour.published ? "🌐 Public" : "🔒 Draft"}
        </button>
      </div>

      <div>
        <div className="text-xs uppercase text-neutral-400 mb-1">
          Scene transition
        </div>
        <select
          value={tour.transition_effect ?? "street_view"}
          onChange={(e) =>
            onPatchTour({
              transition_effect: e.target.value as TransitionEffect,
            })
          }
          className="w-full bg-panelSoft border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-accent"
        >
          <option value="street_view">Street View — stretch + edge blur</option>
          <option value="fade">Fade — simple crossfade</option>
          <option value="zoom">Zoom — target scales in</option>
          <option value="slide">Slide — outgoing slides off</option>
          <option value="instant">Instant — no animation</option>
        </select>
        <div className="text-[11px] text-neutral-500 mt-1">
          Applied to every scene switch in the public viewer.
        </div>
      </div>

      <AmbientAudioSettings
        scene={scene}
        onSceneChange={onSceneChange}
        tour={tour}
        onPatchTour={onPatchTour}
      />
      <NadirSettings tour={tour} onPatch={onPatchTour} />
      <AutoTourSettings tour={tour} onPatch={onPatchTour} />
      <MenuSettings tour={tour} onPatch={onPatchTour} />

      {/* Rendered LAST — copy/move is a low-priority action per user
          request and the other scene-scoped controls (thumbnail, tripod
          hide, replace image) are less frequently touched than camera /
          tour settings. */}
      <SceneActions
        scene={scene}
        tour={tour}
        onSceneChange={onSceneChange}
        getSnapshot={getSnapshot}
      />
    </div>
  );
}

/* -------- Ambient audio (per scene) ---------- */
/* ============================== AUTO-TOUR TAB ============================ */
function AutoTourTab({
  tour,
  scenes,
  allHotspots,
  onPatchTour,
  onSceneChange,
  onHotspotChange,
}: {
  tour: Tour;
  scenes: Scene[];
  allHotspots: Hotspot[];
  onPatchTour: (fields: Partial<Tour>) => Promise<void>;
  onSceneChange: (s: Scene) => void;
  onHotspotChange: (h: Hotspot) => void;
}) {
  return (
    <div className="space-y-5 text-sm">
      {/* Global playback settings */}
      <div>
        <div className="text-xs uppercase text-neutral-400 mb-2">
          Playback
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="text-xs text-neutral-400 w-20">
              Default duration
            </div>
            <input
              type="range"
              min={2}
              max={60}
              value={tour.auto_tour_interval ?? 6}
              onChange={(e) =>
                onPatchTour({ auto_tour_interval: parseInt(e.target.value) })
              }
              className="flex-1"
            />
            <div className="text-xs text-cyan-400 w-10 text-right">
              {tour.auto_tour_interval ?? 6}s
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={tour.auto_tour_rotate ?? true}
              onChange={(e) =>
                onPatchTour({ auto_tour_rotate: e.target.checked })
              }
            />
            Auto-rotate camera (slow 360° during playback)
          </label>

          {(tour.auto_tour_rotate ?? true) && (
            <div className="flex items-center gap-3 ml-6">
              <div className="text-xs text-neutral-400 w-16">Speed</div>
              <input
                type="range"
                min={0.3}
                max={6}
                step={0.1}
                value={tour.auto_tour_rotate_speed ?? 1.5}
                onChange={(e) =>
                  onPatchTour({
                    auto_tour_rotate_speed: parseFloat(e.target.value),
                  })
                }
                className="flex-1"
              />
              <div className="text-xs text-cyan-400 w-10 text-right">
                {(tour.auto_tour_rotate_speed ?? 1.5).toFixed(1)}
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={tour.auto_tour_loop ?? true}
              onChange={(e) =>
                onPatchTour({ auto_tour_loop: e.target.checked })
              }
            />
            Loop back to the first scene when finished
          </label>
        </div>
      </div>

      {/* Per-scene sequence */}
      <div>
        <div className="text-xs uppercase text-neutral-400 mb-2">
          Sequence ({scenes.length} scene{scenes.length === 1 ? "" : "s"})
        </div>
        <div className="space-y-3">
          {scenes.map((s, i) => (
            <SceneAutoTourRow
              key={s.id}
              index={i}
              scene={s}
              tour={tour}
              hotspotsInScene={allHotspots.filter((h) => {
                if (h.scene_id === s.id) return true;
                if (!h.is_master) return false;
                // Master with an allowlist → only show in those scenes
                const allow = h.master_scene_ids;
                if (allow && allow.length > 0) return allow.includes(s.id);
                return true;
              })}
              onSceneChange={onSceneChange}
              onHotspotChange={onHotspotChange}
            />
          ))}
        </div>
      </div>

      <div className="text-[11px] text-neutral-500 border-t border-border pt-3">
        Tip: hit <span className="text-accent">Preview</span> then the
        <span className="text-white"> Auto-tour </span> button (top-right of
        the viewer) to run it live. When a showcased hotspot fires, the
        walkthrough pauses until the modal is closed.
      </div>
    </div>
  );
}

function SceneAutoTourRow({
  index,
  scene,
  tour,
  hotspotsInScene,
  onSceneChange,
  onHotspotChange,
}: {
  index: number;
  scene: Scene;
  tour: Tour;
  hotspotsInScene: Hotspot[];
  onSceneChange: (s: Scene) => void;
  onHotspotChange: (h: Hotspot) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const showcased = hotspotsInScene.filter((h) => h.auto_tour_showcase);
  const effectiveDur =
    scene.auto_tour_duration && scene.auto_tour_duration > 0
      ? scene.auto_tour_duration
      : tour.auto_tour_interval ?? 6;

  return (
    <div className="bg-panelSoft border border-border rounded">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-2 text-left"
      >
        <span className="text-xs text-neutral-500 w-5">{index + 1}.</span>
        <span className="text-sm truncate flex-1">
          {scene.name || `Scene ${index + 1}`}
        </span>
        <span className="text-[11px] text-cyan-400">{effectiveDur}s</span>
        {showcased.length > 0 && (
          <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded">
            {showcased.length} showcase
          </span>
        )}
        <span className="text-neutral-500 text-xs">
          {expanded ? "▾" : "▸"}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border p-3 space-y-3">
          <div className="flex items-center gap-3">
            <div className="text-xs text-neutral-400 w-16">Duration</div>
            <input
              type="range"
              min={2}
              max={60}
              value={scene.auto_tour_duration ?? tour.auto_tour_interval ?? 6}
              onChange={(e) =>
                onSceneChange({
                  ...scene,
                  auto_tour_duration: parseInt(e.target.value),
                })
              }
              className="flex-1"
            />
            <input
              type="number"
              min={2}
              max={600}
              value={scene.auto_tour_duration ?? tour.auto_tour_interval ?? 6}
              onChange={(e) =>
                onSceneChange({
                  ...scene,
                  auto_tour_duration: parseInt(e.target.value) || 6,
                })
              }
              className="w-14 bg-panelSoft border border-border text-cyan-400 rounded text-xs text-right py-0.5 px-1"
            />
            <span className="text-[10px] text-neutral-500">sec</span>
          </div>
          {scene.auto_tour_duration != null && (
            <button
              onClick={() =>
                onSceneChange({ ...scene, auto_tour_duration: null })
              }
              className="text-[10px] text-neutral-400 hover:text-white"
            >
              use tour default
            </button>
          )}

          <div>
            <div className="text-[11px] uppercase text-neutral-400 mb-1">
              Showcase hotspots
            </div>
            {hotspotsInScene.length === 0 ? (
              <div className="text-[11px] text-neutral-500">
                No hotspots in this scene yet.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {hotspotsInScene.map((h) => (
                  <li
                    key={h.id}
                    className="flex items-center gap-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={h.auto_tour_showcase ?? false}
                      onChange={(e) =>
                        onHotspotChange({
                          ...h,
                          auto_tour_showcase: e.target.checked,
                        })
                      }
                    />
                    <span className="flex-1 truncate">
                      {h.label ||
                        h.info_title ||
                        `${h.type} · ${h.id.slice(0, 4)}`}
                      {h.is_master && (
                        <span className="ml-1 text-[9px] text-neutral-500">
                          [master]
                        </span>
                      )}
                    </span>
                    {h.auto_tour_showcase && (
                      <>
                        <span className="text-[10px] text-neutral-500">
                          at
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={effectiveDur}
                          value={h.auto_tour_showcase_at ?? 3}
                          onChange={(e) =>
                            onHotspotChange({
                              ...h,
                              auto_tour_showcase_at:
                                parseInt(e.target.value) || 0,
                            })
                          }
                          className="w-12 bg-panelSoft border border-border text-cyan-400 rounded text-xs text-right py-0.5 px-1"
                        />
                        <span className="text-[10px] text-neutral-500">
                          s, for
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={h.auto_tour_showcase_duration ?? 5}
                          onChange={(e) =>
                            onHotspotChange({
                              ...h,
                              auto_tour_showcase_duration:
                                parseInt(e.target.value) || 5,
                            })
                          }
                          className="w-12 bg-panelSoft border border-border text-cyan-400 rounded text-xs text-right py-0.5 px-1"
                          title="How long the popup stays open before auto-closing"
                        />
                        <span className="text-[10px] text-neutral-500">
                          s
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* =============================== CAMERA SETTINGS ========================= */

function CameraSettings({
  scene,
  onSceneChange,
  getCurrentAim,
}: {
  scene: Scene;
  onSceneChange: (s: Scene) => void;
  getCurrentAim?: () => { yaw: number; pitch: number } | null;
}) {
  const yawDeg = radToDeg(scene.initial_yaw ?? 0);
  const pitchDeg = radToDeg(scene.initial_pitch ?? 0);
  const levelDeg = radToDeg(scene.level_correction ?? 0);

  // Convert stored min/max radians to a single "range" degree value
  // (0 = locked, 180/360 = free). Symmetric around 0.
  const pitchRange =
    scene.pitch_min != null && scene.pitch_max != null
      ? Math.round(radToDeg(scene.pitch_max - scene.pitch_min))
      : 180;
  const yawRange =
    scene.yaw_min != null && scene.yaw_max != null
      ? Math.round(radToDeg(scene.yaw_max - scene.yaw_min))
      : 360;

  // Zoom
  const zoomMin = scene.zoom_min_fov ?? 30;
  const zoomMax = scene.zoom_max_fov ?? 90;
  const zoomInit = scene.zoom_initial_fov ?? 75;
  const sensitivity = scene.zoom_sensitivity ?? 1;

  function set(fields: Partial<Scene>) {
    onSceneChange({ ...scene, ...fields });
  }

  function useCurrentView() {
    const aim = getCurrentAim?.();
    if (!aim) return;
    set({ initial_yaw: aim.yaw, initial_pitch: aim.pitch });
  }

  function setPitchRange(deg: number) {
    if (deg >= 179) {
      set({ pitch_min: null, pitch_max: null }); // unlimited
    } else {
      const half = degToRad(deg / 2);
      set({ pitch_min: -half, pitch_max: half });
    }
  }
  function setYawRange(deg: number) {
    if (deg >= 359) {
      set({ yaw_min: null, yaw_max: null });
    } else {
      const half = degToRad(deg / 2);
      set({ yaw_min: -half, yaw_max: half });
    }
  }

  return (
    <div className="pt-4 border-t border-border space-y-5">
      <div className="text-xs uppercase text-neutral-400">Camera</div>

      {/* --- Heading --- */}
      <div>
        <div className="text-[11px] uppercase text-neutral-400 mb-1">
          Initial view
        </div>
        <button
          onClick={useCurrentView}
          disabled={!getCurrentAim}
          className="w-1/2 text-[11px] bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 rounded py-1 hover:bg-cyan-500/25 disabled:opacity-40 mb-2"
          title="Grab the panorama's current direction as the opening angle"
        >
          Use current view
        </button>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Horizontal °"
            value={yawDeg}
            min={-180}
            max={180}
            onChange={(v) => set({ initial_yaw: degToRad(v) })}
          />
          <NumberField
            label="Vertical °"
            value={pitchDeg}
            min={-89}
            max={89}
            onChange={(v) => set({ initial_pitch: degToRad(v) })}
          />
        </div>
      </div>

      {/* Pitch / yaw range + level correction are set once per scene
          and rarely revisited — collapse them behind a disclosure so
          the frequently-used Initial view / Zoom controls stay prime. */}
      <details className="group">
        <summary className="list-none cursor-pointer flex items-center justify-between text-[11px] uppercase text-neutral-400 hover:text-neutral-200 select-none py-1">
          <span>Advanced camera range</span>
          <span className="text-neutral-500 group-open:rotate-90 transition-transform inline-block">
            ▸
          </span>
        </summary>
        <div className="space-y-4 mt-3">
          {/* --- Movement range (Kuula-style single sliders) --- */}
          <div>
            <div className="text-[11px] uppercase text-neutral-400 mb-1">
              Vertical range (pitch)
            </div>
            <RangeLabelled
              left="Locked"
              right="Full"
              value={pitchRange}
              min={0}
              max={180}
              suffix="°"
              onChange={setPitchRange}
            />
          </div>

          <div>
            <div className="text-[11px] uppercase text-neutral-400 mb-1">
              Horizontal range (yaw)
            </div>
            <RangeLabelled
              left="Locked"
              right="Full"
              value={yawRange}
              min={0}
              max={360}
              suffix="°"
              onChange={setYawRange}
            />
          </div>

          {/* --- Level correction --- */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] uppercase text-neutral-400">
                Level correction
              </div>
              <button
                onClick={() => set({ level_correction: 0 })}
                className="text-[10px] text-neutral-400 hover:text-white"
              >
                Reset
              </button>
            </div>
            <RangeLabelled
              left="−30°"
              right="+30°"
              value={levelDeg}
              min={-30}
              max={30}
              step={0.5}
              suffix="°"
              onChange={(v) => set({ level_correction: degToRad(v) })}
            />
            <div className="text-[10px] text-neutral-500">
              Rotates the horizon to fix a crooked tripod.
            </div>
          </div>
        </div>
      </details>

      {/* --- Zoom controls --- */}
      <div className="pt-3 border-t border-border">
        <div className="text-[11px] uppercase text-neutral-400 mb-2">
          Zoom
        </div>

        {/* Zoom range — how far in / out */}
        <div className="mb-3">
          <div className="text-[10px] text-neutral-500 mb-1">
            Allowed zoom (FOV degrees — lower = more zoomed in)
          </div>
          <RangeLabelled
            left="Max in"
            right="Max out"
            value={zoomMin}
            min={20}
            max={90}
            suffix="°"
            onChange={(v) =>
              set({
                zoom_min_fov: Math.min(v, zoomMax - 5),
              })
            }
          />
          <RangeLabelled
            left=""
            right=""
            value={zoomMax}
            min={20}
            max={110}
            suffix="°"
            onChange={(v) =>
              set({
                zoom_max_fov: Math.max(v, zoomMin + 5),
              })
            }
          />
        </div>

        {/* Initial zoom */}
        <div className="mb-3">
          <div className="text-[10px] text-neutral-500 mb-1">
            Opening zoom
          </div>
          <RangeLabelled
            left="In"
            right="Out"
            value={zoomInit}
            min={zoomMin}
            max={zoomMax}
            suffix="°"
            onChange={(v) => set({ zoom_initial_fov: v })}
          />
        </div>

        {/* Sensitivity */}
        <div className="mb-1">
          <div className="text-[10px] text-neutral-500 mb-1">
            Zoom sensitivity
          </div>
          <RangeLabelled
            left="Slow"
            right="Fast"
            value={sensitivity}
            min={0.2}
            max={3}
            step={0.1}
            suffix="×"
            onChange={(v) => set({ zoom_sensitivity: v })}
          />
        </div>

        <button
          onClick={() =>
            set({
              zoom_min_fov: 30,
              zoom_max_fov: 90,
              zoom_initial_fov: 75,
              zoom_sensitivity: 1,
            })
          }
          className="mt-2 text-[10px] text-neutral-400 hover:text-white"
        >
          Reset zoom defaults
        </button>
      </div>
    </div>
  );
}

/** Slider with a text label on each end and a live value read-out on the right. */
function RangeLabelled({
  left,
  right,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  left: string;
  right: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-1">
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="flex-1"
        />
        <div className="text-xs text-cyan-400 w-14 text-right">
          {step < 1 ? value.toFixed(1) : Math.round(value)}
          {suffix}
        </div>
      </div>
      {(left || right) && (
        <div className="flex items-center justify-between text-[10px] text-neutral-500 -mt-0.5 mr-16">
          <span>{left}</span>
          <span>{right}</span>
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-[11px] text-neutral-400">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={0.5}
        value={Number.isFinite(value) ? value.toFixed(1) : 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="mt-0.5 w-full bg-panelSoft border border-border rounded px-2 py-1 text-sm"
      />
    </label>
  );
}

function RangeRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-xs text-neutral-400 w-10">{label}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1"
      />
      <div className="text-xs text-cyan-400 w-12 text-right">
        {value.toFixed(step < 1 ? 1 : 0)}°
      </div>
    </div>
  );
}

function radToDeg(r: number) {
  return (r * 180) / Math.PI;
}
function degToRad(d: number) {
  return (d * Math.PI) / 180;
}

/* =============================== SCENE ACTIONS =========================== */

function SceneActions({
  scene,
  tour,
  onSceneChange,
  getSnapshot,
}: {
  scene: Scene;
  tour: Tour;
  onSceneChange: (s: Scene) => void;
  getSnapshot?: () => string | null;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [otherTours, setOtherTours] = useState<
    { id: string; title: string }[]
  >([]);

  useEffect(() => {
    supabase
      .from("tours")
      .select("id, title")
      .neq("id", tour.id)
      .order("updated_at", { ascending: false })
      .then(({ data }) => setOtherTours((data ?? []) as { id: string; title: string }[]));
  }, [tour.id]);

  async function setFromCurrentView() {
    setBusy("thumb");
    try {
      const dataUrl = getSnapshot?.();
      if (!dataUrl) {
        alert("Couldn't grab the current view — try again after the panorama loads.");
        return;
      }
      const blob = await (await fetch(dataUrl)).blob();
      const path = `thumbnails/scene-${scene.id}-${crypto.randomUUID()}.png`;
      const { error } = await supabase.storage
        .from("panoramas")
        .upload(path, blob, { cacheControl: "3600", upsert: false });
      if (error) return alert(error.message);
      onSceneChange({ ...scene, thumbnail_path: path });
    } finally {
      setBusy(null);
    }
  }

  async function uploadCustomThumb(file: File) {
    setBusy("thumb");
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `thumbnails/scene-${scene.id}-${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("panoramas")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) return alert(error.message);
      onSceneChange({ ...scene, thumbnail_path: path });
    } finally {
      setBusy(null);
    }
  }

  async function downloadRaw() {
    setBusy("dl");
    try {
      const url = supabase.storage
        .from("panoramas")
        .getPublicUrl(scene.image_path).data.publicUrl;
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${scene.name || "scene"}.jpg`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setBusy(null);
    }
  }

  async function replaceImage(file: File) {
    setBusy("replace");
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${tour.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("panoramas")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) return alert(error.message);
      onSceneChange({ ...scene, image_path: path });
    } finally {
      setBusy(null);
    }
  }

  async function copyOrMove(targetTourId: string, mode: "copy" | "move") {
    if (!targetTourId) return;
    setBusy(mode);
    try {
      // Fetch the next order_index in the destination
      const { data: dest } = await supabase
        .from("scenes")
        .select("order_index")
        .eq("tour_id", targetTourId)
        .order("order_index", { ascending: false })
        .limit(1);
      const nextOrder = ((dest?.[0]?.order_index as number) ?? -1) + 1;

      if (mode === "move") {
        // Move: reassign tour_id + order_index. Hotspots follow automatically.
        await supabase
          .from("scenes")
          .update({ tour_id: targetTourId, order_index: nextOrder })
          .eq("id", scene.id);
        alert("Scene moved to the target tour. Reload to see updated list.");
        window.location.reload();
        return;
      }

      // Copy: insert a new scene row referencing the same image, then
      // duplicate every hotspot pointing at this scene.
      const {
        id: _id,
        created_at: _c,
        ...rest
      } = scene as Scene & { id: string; created_at: string };
      void _id;
      void _c;
      const { data: newScene, error: sceneErr } = await supabase
        .from("scenes")
        .insert({ ...rest, tour_id: targetTourId, order_index: nextOrder })
        .select()
        .single();
      if (sceneErr || !newScene) return alert(sceneErr?.message ?? "Copy failed");

      const { data: hots } = await supabase
        .from("hotspots")
        .select("*")
        .eq("scene_id", scene.id);
      if (hots?.length) {
        const dupes = hots.map((h) => {
          const {
            id: _hid,
            created_at: _hc,
            ...hRest
          } = h as { id: string; created_at: string };
          void _hid;
          void _hc;
          return { ...hRest, scene_id: newScene.id };
        });
        await supabase.from("hotspots").insert(dupes);
      }
      alert(
        `Scene copied to "${
          otherTours.find((t) => t.id === targetTourId)?.title
        }".`
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="pt-4 border-t border-border space-y-4">
      <div className="text-xs uppercase text-neutral-400">Scene</div>

      {/* Flat + hide stitching toggles */}
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={scene.is_flat ?? false}
            onChange={(e) =>
              onSceneChange({ ...scene, is_flat: e.target.checked })
            }
          />
          Flat photo (not panoramic)
        </label>
        {!scene.is_flat && (
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={scene.hide_stitching ?? false}
              onChange={(e) =>
                onSceneChange({ ...scene, hide_stitching: e.target.checked })
              }
            />
            Hide stitching line (blends the seam)
          </label>
        )}
        {!scene.is_flat && (
          <>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={scene.hide_tripod ?? false}
                onChange={(e) =>
                  onSceneChange({ ...scene, hide_tripod: e.target.checked })
                }
              />
              Remove tripod / selfie-stick shadow
            </label>
            {scene.hide_tripod && (
              <div className="pl-6">
                <div className="flex items-center justify-between text-[10px] text-neutral-400">
                  <span>Cover size</span>
                  <span>{scene.tripod_size ?? 30}%</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={60}
                  step={1}
                  value={scene.tripod_size ?? 30}
                  onChange={(e) =>
                    onSceneChange({
                      ...scene,
                      tripod_size: parseInt(e.target.value, 10),
                    })
                  }
                  className="w-full accent-cyan-400"
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Folder — groups this scene under a collapsible header in the menu */}
      <div>
        <div className="text-[11px] uppercase text-neutral-400 mb-1">
          Folder
        </div>
        <input
          type="text"
          value={scene.folder ?? ""}
          onChange={(e) =>
            onSceneChange({ ...scene, folder: e.target.value || null })
          }
          placeholder="Optional — e.g. Floor 1, Kitchen…"
          className="w-full bg-panelSoft border border-border rounded px-2 py-1.5 text-sm"
        />
        <div className="text-[10px] text-neutral-500 mt-1">
          Scenes sharing a folder name are grouped in the menu.
        </div>
      </div>

      {/* Camera height — assumption for the measuring tool */}
      <div>
        <div className="text-[11px] uppercase text-neutral-400 mb-1">
          Camera height (metres)
        </div>
        <input
          type="number"
          step={0.05}
          min={0.3}
          max={5}
          value={scene.camera_height ?? 1.6}
          onChange={(e) =>
            onSceneChange({
              ...scene,
              camera_height: parseFloat(e.target.value) || 1.6,
            })
          }
          className="w-full bg-panelSoft border border-border rounded px-2 py-1.5 text-sm"
        />
        <div className="text-[10px] text-neutral-500 mt-1">
          Used by the Measure tool to project clicks onto the floor.
        </div>
      </div>

      {/* Thumbnail */}
      <div>
        <div className="text-[11px] uppercase text-neutral-400 mb-1">
          Thumbnail
        </div>
        {scene.thumbnail_path && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={
              supabase.storage
                .from("panoramas")
                .getPublicUrl(scene.thumbnail_path).data.publicUrl
            }
            alt=""
            className="w-full aspect-video object-cover rounded border border-border mb-1.5"
          />
        )}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={setFromCurrentView}
            disabled={!getSnapshot || busy === "thumb" || scene.is_flat}
            className="text-xs bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 rounded py-1.5 disabled:opacity-40"
          >
            {busy === "thumb" ? "Saving…" : "Use current view"}
          </button>
          <label className="text-xs bg-panelSoft border border-border rounded py-1.5 text-center cursor-pointer">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) =>
                e.target.files?.[0] && uploadCustomThumb(e.target.files[0])
              }
            />
            Upload custom
          </label>
        </div>
        {scene.thumbnail_path && (
          <button
            onClick={() => onSceneChange({ ...scene, thumbnail_path: null })}
            className="text-[10px] text-red-400 hover:text-red-300 mt-1"
          >
            Remove thumbnail
          </button>
        )}
      </div>

      {/* Download / Replace */}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={downloadRaw}
          disabled={busy === "dl"}
          className="text-xs bg-panelSoft border border-border rounded py-1.5"
          title="Download the raw uploaded panorama"
        >
          {busy === "dl" ? "…" : "Download raw"}
        </button>
        <label className="text-xs bg-panelSoft border border-border rounded py-1.5 text-center cursor-pointer">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && replaceImage(e.target.files[0])}
          />
          {busy === "replace" ? "Replacing…" : "Replace image"}
        </label>
      </div>
      <div className="text-[10px] text-neutral-500 -mt-2">
        Replacing the image keeps all hotspots + settings intact.
      </div>

      {/* Copy / Move */}
      {otherTours.length > 0 && (
        <div>
          <div className="text-[11px] uppercase text-neutral-400 mb-1">
            Move / copy to another tour
          </div>
          <MoveCopyRow
            tours={otherTours}
            busy={busy}
            onGo={(tid, mode) => copyOrMove(tid, mode)}
          />
        </div>
      )}
    </div>
  );
}

function MoveCopyRow({
  tours,
  busy,
  onGo,
}: {
  tours: { id: string; title: string }[];
  busy: string | null;
  onGo: (tid: string, mode: "copy" | "move") => void;
}) {
  const [target, setTarget] = useState("");
  return (
    <div className="space-y-1.5">
      <select
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className="w-full bg-panelSoft border border-border rounded px-2 py-1.5 text-sm"
      >
        <option value="">— pick a tour —</option>
        {tours.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title || "Untitled tour"}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={() => onGo(target, "copy")}
          disabled={!target || busy === "copy"}
          className="text-xs bg-panelSoft border border-border rounded py-1.5 disabled:opacity-40"
        >
          {busy === "copy" ? "Copying…" : "Copy"}
        </button>
        <button
          onClick={() => {
            if (
              confirm(
                "Move this scene to the target tour? It will be removed from the current tour."
              )
            )
              onGo(target, "move");
          }}
          disabled={!target || busy === "move"}
          className="text-xs bg-red-500/10 border border-red-500/30 text-red-300 rounded py-1.5 disabled:opacity-40"
        >
          {busy === "move" ? "Moving…" : "Move"}
        </button>
      </div>
    </div>
  );
}

function AmbientAudioSettings({
  scene,
  onSceneChange,
  tour,
  onPatchTour,
}: {
  scene: Scene;
  onSceneChange: (s: Scene) => void;
  tour: Tour;
  onPatchTour: (fields: Partial<Tour>) => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  // "Apply to all" is on whenever the tour has ambient audio set.
  const applyToAll = !!tour.ambient_audio_url;
  const audioUrl = applyToAll
    ? tour.ambient_audio_url
    : scene.ambient_audio_url;
  const audioVolume = applyToAll
    ? tour.ambient_audio_volume ?? 0.5
    : scene.ambient_audio_volume ?? 0.5;

  async function upload(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "mp3";
      const path = `sounds/ambient-${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("panoramas")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) return alert(error.message);
      const { data } = supabase.storage.from("panoramas").getPublicUrl(path);
      if (applyToAll) {
        await onPatchTour({ ambient_audio_url: data.publicUrl });
      } else {
        onSceneChange({ ...scene, ambient_audio_url: data.publicUrl });
      }
    } finally {
      setUploading(false);
    }
  }

  function setVolume(v: number) {
    if (applyToAll) {
      onPatchTour({ ambient_audio_volume: v });
    } else {
      onSceneChange({ ...scene, ambient_audio_volume: v });
    }
  }

  function remove() {
    if (applyToAll) {
      onPatchTour({ ambient_audio_url: null });
    } else {
      onSceneChange({ ...scene, ambient_audio_url: null });
    }
  }

  async function toggleApplyToAll(checked: boolean) {
    if (checked) {
      // Promote the current scene's audio (if any) to tour-level so it keeps
      // playing continuously across scene switches. Clear the scene copy so
      // we don't have both fighting.
      if (scene.ambient_audio_url) {
        await onPatchTour({
          ambient_audio_url: scene.ambient_audio_url,
          ambient_audio_volume: scene.ambient_audio_volume ?? 0.5,
        });
        onSceneChange({ ...scene, ambient_audio_url: null });
      } else {
        // No current audio — just flip the mode; user will upload next.
        await onPatchTour({ ambient_audio_url: null });
      }
    } else {
      // Demote tour-level audio back to this scene only.
      if (tour.ambient_audio_url) {
        onSceneChange({
          ...scene,
          ambient_audio_url: tour.ambient_audio_url,
          ambient_audio_volume: tour.ambient_audio_volume ?? 0.5,
        });
        await onPatchTour({ ambient_audio_url: null });
      }
    }
  }

  return (
    <div className="pt-4 border-t border-border space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase text-neutral-400">Ambient audio</div>
        <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
          <input
            type="checkbox"
            checked={applyToAll}
            onChange={(e) => toggleApplyToAll(e.target.checked)}
          />
          Apply to all scenes
        </label>
      </div>

      {audioUrl ? (
        <>
          <audio controls src={audioUrl} className="w-full h-8" />
          <div className="flex items-center gap-3">
            <div className="text-xs text-neutral-400 w-14">Volume</div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(audioVolume * 100)}
              onChange={(e) => setVolume(parseInt(e.target.value) / 100)}
              className="flex-1"
            />
            <div className="text-xs text-cyan-400 w-10 text-right">
              {Math.round(audioVolume * 100)}%
            </div>
          </div>
          <button
            onClick={remove}
            className="text-[11px] text-red-400 hover:text-red-300"
          >
            Remove
          </button>
          <div className="text-[10px] text-neutral-500">
            {applyToAll
              ? "Playing continuously across every scene — won't reset on scene changes."
              : "Playing only while this scene is active."}
          </div>
        </>
      ) : (
        <label className="block border border-dashed border-border rounded p-3 text-center text-xs cursor-pointer hover:border-accent">
          <input
            type="file"
            accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
          {uploading
            ? "Uploading…"
            : applyToAll
            ? "Upload MP3 (plays continuously across every scene)"
            : "Upload MP3 (loops while this scene is active)"}
        </label>
      )}
    </div>
  );
}

/* -------- Nadir patch (tour-level) ---------- */
function NadirSettings({
  tour,
  onPatch,
}: {
  tour: Tour;
  onPatch: (fields: Partial<Tour>) => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const patch = onPatch;
  async function upload(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `nadirs/${tour.id}-${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("panoramas")
        .upload(path, file);
      if (error) return alert(error.message);
      await patch({ nadir_image_path: path });
    } finally {
      setUploading(false);
    }
  }
  return (
    <div className="pt-4 border-t border-border space-y-2">
      <div className="text-xs uppercase text-neutral-400">Nadir patch / logo</div>
      {tour.nadir_image_path ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={supabase.storage
              .from("panoramas")
              .getPublicUrl(tour.nadir_image_path).data.publicUrl}
            alt=""
            className="w-16 h-16 object-contain bg-black/40 rounded"
          />
          <div className="flex items-center gap-3">
            <div className="text-xs text-neutral-400 w-14">Size</div>
            <input
              type="range"
              min={5}
              max={60}
              value={tour.nadir_size ?? 25}
              onChange={(e) =>
                patch({ nadir_size: parseInt(e.target.value) })
              }
              className="flex-1"
            />
            <div className="text-xs text-cyan-400 w-10 text-right">
              {tour.nadir_size ?? 25}%
            </div>
          </div>
          <button
            onClick={() => patch({ nadir_image_path: null })}
            className="text-[11px] text-red-400 hover:text-red-300"
          >
            Remove
          </button>
        </>
      ) : (
        <label className="block border border-dashed border-border rounded p-3 text-center text-xs cursor-pointer hover:border-accent">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
          {uploading
            ? "Uploading…"
            : "Upload logo (covers the tripod at the bottom)"}
        </label>
      )}
    </div>
  );
}

/* -------- Auto-tour ---------- */
function AutoTourSettings({
  tour,
  onPatch,
}: {
  tour: Tour;
  onPatch: (fields: Partial<Tour>) => Promise<void>;
}) {
  const patch = onPatch;
  const enabled = tour.auto_tour_enabled ?? false;
  const interval = tour.auto_tour_interval ?? 6;
  return (
    <div className="pt-4 border-t border-border space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase text-neutral-400">Auto-tour</div>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => patch({ auto_tour_enabled: e.target.checked })}
          />
          Enable
        </label>
      </div>
      {enabled && (
        <div className="flex items-center gap-3">
          <div className="text-xs text-neutral-400 w-14">Interval</div>
          <input
            type="range"
            min={3}
            max={30}
            value={interval}
            onChange={(e) =>
              patch({ auto_tour_interval: parseInt(e.target.value) })
            }
            className="flex-1"
          />
          <div className="text-xs text-cyan-400 w-10 text-right">
            {interval}s
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ MENU SETTINGS ---------------------------- */
function MenuSettings({
  tour,
  onPatch,
}: {
  tour: Tour;
  onPatch: (fields: Partial<Tour>) => Promise<void>;
}) {
  const enabled = tour.menu_enabled ?? false;
  const position = tour.menu_position ?? "top-left";
  const size = tour.menu_size ?? 44;
  const opacity = tour.menu_opacity ?? 0.75;
  const patch = onPatch;

  return (
    <div className="pt-4 border-t border-border space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase text-neutral-400">
          Scene index menu
        </div>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => patch({ menu_enabled: e.target.checked })}
          />
          Enable
        </label>
      </div>

      {enabled && (
        <>
          <div>
            <div className="text-[11px] uppercase text-neutral-400 mb-1">
              Position
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  ["top-left", "Top left"],
                  ["top-right", "Top right"],
                  ["bottom-left", "Bottom left"],
                  ["bottom-right", "Bottom right"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => patch({ menu_position: key })}
                  className={`text-xs px-2 py-1.5 rounded border ${
                    position === key
                      ? "bg-accent text-black border-accent"
                      : "bg-panelSoft border-border text-neutral-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs text-neutral-400 w-14">Size</div>
            <input
              type="range"
              min={28}
              max={100}
              step={1}
              value={size}
              onChange={(e) => patch({ menu_size: parseInt(e.target.value) })}
              className="flex-1"
            />
            <div className="text-xs text-cyan-400 w-10 text-right">
              {size}px
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs text-neutral-400 w-14">Opacity</div>
            <input
              type="range"
              min={15}
              max={100}
              step={1}
              value={Math.round(opacity * 100)}
              onChange={(e) =>
                patch({ menu_opacity: parseInt(e.target.value) / 100 })
              }
              className="flex-1"
            />
            <div className="text-xs text-cyan-400 w-10 text-right">
              {Math.round(opacity * 100)}%
            </div>
          </div>

          <div className="text-[11px] text-neutral-500">
            Menu shows an icon in the chosen corner on every scene. Click to
            expand a smooth-animated list of scene names — click a name to
            jump.
          </div>
        </>
      )}
    </div>
  );
}

function AddonBtn({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1.5 bg-panelSoft border border-border rounded-md py-2.5 hover:border-accent hover:bg-panelHover transition-colors group"
    >
      <span className="text-neutral-300 group-hover:text-accent transition-colors">
        {icon}
      </span>
      <span className="text-3xs uppercase tracking-wider text-neutral-400 group-hover:text-white transition-colors">
        {label}
      </span>
    </button>
  );
}

/* ------------------------------- ADDON TAB ------------------------------- */
function AddonTab({
  hotspot,
  scenes,
  onChange,
  onDelete,
  onDuplicate,
  onReposition,
  onTest,
}: {
  hotspot: Hotspot;
  scenes: Scene[];
  onChange: (h: Hotspot) => void;
  onDelete: (id: string) => void;
  onDuplicate?: () => void;
  onReposition: () => void;
  onTest: () => void;
}) {
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  function setW(w: number) {
    if (hotspot.link_wh) {
      const ratio = hotspot.height_pct / (hotspot.width_pct || 1);
      onChange({ ...hotspot, width_pct: w, height_pct: w * ratio });
    } else {
      onChange({ ...hotspot, width_pct: w });
    }
  }
  function setH(h: number) {
    if (hotspot.link_wh) {
      const ratio = hotspot.width_pct / (hotspot.height_pct || 1);
      onChange({ ...hotspot, height_pct: h, width_pct: h * ratio });
    } else {
      onChange({ ...hotspot, height_pct: h });
    }
  }

  const iconEntry = findIcon(hotspot.icon_key);
  const previewSrc =
    hotspot.icon_url ?? (hotspot.type === "image" ? hotspot.image_url : null);

  return (
    <div className="space-y-5 text-sm">
      {/* NAME — the primary identifier for this hotspot. Shows up in
          Analytics rankings, the scene-index menu, and (if enabled) as
          the visible label on the panorama itself. */}
      <div>
        <div className="text-xs uppercase text-neutral-400 mb-1">Name</div>
        <input
          type="text"
          value={hotspot.label ?? ""}
          onChange={(e) =>
            onChange({ ...hotspot, label: e.target.value || null })
          }
          placeholder="e.g. Main entrance, Compressor #3, Safety notice…"
          className="w-full bg-panelSoft border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
        <div className="text-[11px] text-neutral-500 mt-1">
          Used in Analytics, menu index and hover tooltips.
        </div>
      </div>

      {/* ICON — hidden for text / image / person hotspots. Text has no
          icon, image has a dedicated Image section, person uses a built-in
          figure whose colour is set via the bubble Color picker instead. */}
      {hotspot.type !== "text" && hotspot.type !== "image" && hotspot.type !== "person" && (
      <Section title="Icon" trailing={<button className="text-neutral-500 hover:text-white text-lg leading-none">···</button>}>
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded bg-[repeating-conic-gradient(#2a2a2a_0%_25%,#1e1e1e_0%_50%)] bg-[length:12px_12px] grid place-items-center border border-border"
          >
            {previewSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewSrc}
                alt=""
                className="max-w-full max-h-full object-contain"
              />
            ) : iconEntry ? (
              <iconEntry.Icon size={32} color={hotspot.icon_tint} />
            ) : (
              <div
                className="w-8 h-8 rounded-full"
                style={{ background: hotspot.color }}
              />
            )}
          </div>
          <div className="flex flex-col gap-1">
            <button
              onClick={() => setIconPickerOpen(true)}
              className="text-xs text-cyan-400 hover:text-cyan-300 text-left"
            >
              Change image
            </button>
            <label className="flex items-center gap-2 text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer">
              Set tint
              <input
                type="color"
                value={hotspot.icon_tint}
                onChange={(e) =>
                  onChange({ ...hotspot, icon_tint: e.target.value })
                }
                className="w-5 h-5 rounded cursor-pointer bg-transparent border-0"
              />
            </label>
          </div>
        </div>
      </Section>
      )}

      {/* APPEARANCE — info & image hotspots have their own simplified size
          controls; other types keep the generic width/height/rotation set. */}
      {hotspot.type === "info" ? (
        <Section title="Pill size">
          <SliderRow
            label="Size"
            value={hotspot.width_pct ?? 80}
            valueLabel={`${Math.round(hotspot.width_pct ?? 80)}%`}
            min={40}
            max={200}
            onChange={(v) =>
              onChange({ ...hotspot, width_pct: v, height_pct: v })
            }
          />
          <div className="text-[10px] text-neutral-500 mt-1">
            Scales the whole pill (icon and text). 80% is the default.
          </div>
          <div className="mt-3">
            <SliderRow
              label="Opacity"
              value={hotspot.opacity * 100}
              valueLabel={`${Math.round(hotspot.opacity * 100)}%`}
              min={0}
              max={100}
              onChange={(v) => onChange({ ...hotspot, opacity: v / 100 })}
            />
          </div>
        </Section>
      ) : hotspot.type === "image" ? (
        <>
          <Section title="Image">
            <ImageSourceField hotspot={hotspot} onChange={onChange} />
            <Field label="Caption / heading (optional)">
              <textarea
                value={hotspot.info_body ?? ""}
                onChange={(e) =>
                  onChange({ ...hotspot, info_body: e.target.value })
                }
                placeholder="Shown below the image. Leave blank to let the image fill more space."
                rows={2}
                className="w-full bg-panelSoft border border-border rounded px-2 py-1.5 text-sm resize-none"
              />
            </Field>
          </Section>
          <Section title="Sizing">
            <SliderRow
              label="Icon size"
              value={hotspot.width_pct ?? 80}
              valueLabel={`${Math.round(hotspot.width_pct ?? 80)}%`}
              min={40}
              max={200}
              onChange={(v) => onChange({ ...hotspot, width_pct: v })}
            />
            <div className="mt-3">
              <SliderRow
                label="Card size"
                value={hotspot.card_size_pct ?? 80}
                valueLabel={`${Math.round(hotspot.card_size_pct ?? 80)}%`}
                min={40}
                max={200}
                onChange={(v) =>
                  onChange({ ...hotspot, card_size_pct: v })
                }
              />
            </div>
            <div className="mt-3">
              <SliderRow
                label="Opacity"
                value={hotspot.opacity * 100}
                valueLabel={`${Math.round(hotspot.opacity * 100)}%`}
                min={0}
                max={100}
                onChange={(v) =>
                  onChange({ ...hotspot, opacity: v / 100 })
                }
              />
            </div>
            <div className="text-[10px] text-neutral-500 mt-2">
              Icon size = the blue circle at rest. Card size = the opened
              card on hover. Card is also drag-resizable in the viewer.
            </div>
          </Section>
        </>
      ) : hotspot.type === "person" ? (
        <>
          <Section title="Bubble">
            <Field label="Details (shown inside the balloon)">
              <textarea
                value={hotspot.info_body ?? ""}
                onChange={(e) =>
                  onChange({ ...hotspot, info_body: e.target.value })
                }
                placeholder="Role, short bio, or any details you want to appear under the figure."
                rows={3}
                className="w-full bg-panelSoft border border-border rounded px-2 py-1.5 text-sm resize-none"
              />
            </Field>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Bubble color">
                <ColorSwatch
                  value={hotspot.color}
                  onChange={(c) => onChange({ ...hotspot, color: c })}
                />
              </Field>
              <Field label="Text / icon color">
                <ColorSwatch
                  value={hotspot.label_color}
                  onChange={(c) => onChange({ ...hotspot, label_color: c })}
                />
              </Field>
            </div>
          </Section>
          <Section title="Sizing">
            <SliderRow
              label="Bubble size"
              value={hotspot.width_pct ?? 80}
              valueLabel={`${Math.round(hotspot.width_pct ?? 80)}%`}
              min={40}
              max={200}
              onChange={(v) =>
                onChange({ ...hotspot, width_pct: v, height_pct: v })
              }
            />
            <div className="mt-3">
              <SliderRow
                label="Balloon size"
                value={hotspot.card_size_pct ?? 80}
                valueLabel={`${Math.round(hotspot.card_size_pct ?? 80)}%`}
                min={40}
                max={200}
                onChange={(v) =>
                  onChange({ ...hotspot, card_size_pct: v })
                }
              />
            </div>
            <div className="mt-3">
              <SliderRow
                label="Opacity"
                value={hotspot.opacity * 100}
                valueLabel={`${Math.round(hotspot.opacity * 100)}%`}
                min={0}
                max={100}
                onChange={(v) =>
                  onChange({ ...hotspot, opacity: v / 100 })
                }
              />
            </div>
            <div className="text-[10px] text-neutral-500 mt-2">
              Bubble size = the small speech pill at rest. Balloon size =
              the expanded circle on hover.
            </div>
          </Section>
        </>
      ) : (
        <>
          <Section title="Appearance">
            <div className="space-y-2">
              <NumberStepper
                label="Width"
                value={hotspot.width_pct}
                min={4}
                max={500}
                step={1}
                suffix="%"
                onChange={setW}
              />
              <div className="flex items-center gap-2 -my-1 pl-1">
                <button
                  onClick={() =>
                    onChange({ ...hotspot, link_wh: !hotspot.link_wh })
                  }
                  className={`text-xs ${
                    hotspot.link_wh ? "text-cyan-400" : "text-neutral-500"
                  }`}
                  title="Link width & height"
                >
                  <Link size={12} />
                </button>
                <span className="text-[10px] text-neutral-500">
                  {hotspot.link_wh ? "linked" : "independent"}
                </span>
              </div>
              <NumberStepper
                label="Height"
                value={hotspot.height_pct}
                min={4}
                max={500}
                step={1}
                suffix="%"
                onChange={setH}
                disabled={hotspot.link_wh}
              />
              <SliderRow
                label="Opacity"
                value={hotspot.opacity * 100}
                valueLabel={`${Math.round(hotspot.opacity * 100)}%`}
                min={0}
                max={100}
                onChange={(v) => onChange({ ...hotspot, opacity: v / 100 })}
              />
            </div>
          </Section>

          {/* ROTATION */}
          <Section
            title="Rotation"
            trailing={
              <button
                onClick={() => onChange({ ...hotspot, rotation_deg: 0 })}
                className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 text-xs"
              >
                <RotateCcw size={11} /> Reset
              </button>
            }
          >
            <NumberStepper
              label="Degrees"
              value={hotspot.rotation_deg}
              min={-180}
              max={180}
              step={1}
              suffix="°"
              onChange={(v) => onChange({ ...hotspot, rotation_deg: v })}
            />
          </Section>
        </>
      )}

      {/* LABEL — hidden for person hotspots. Person uses its own Details
          field inside the Bubble section instead. */}
      {hotspot.type !== "person" && (
      <Section title="Label">
        <div className="border border-border rounded bg-panelSoft">
          <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border text-xs">
            <ToolbarIcon title="Text">
              <span className="text-neutral-400">T</span>
            </ToolbarIcon>
            <ColorSwatch
              value={hotspot.label_color}
              onChange={(c) => onChange({ ...hotspot, label_color: c })}
            />
            <button
              onClick={() =>
                onChange({ ...hotspot, label_bold: !hotspot.label_bold })
              }
              className={`px-1 rounded ${
                hotspot.label_bold ? "bg-neutral-700" : "hover:bg-neutral-800"
              }`}
              title="Bold"
            >
              <Bold size={12} />
            </button>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={6}
                max={72}
                value={hotspot.label_size}
                onChange={(e) =>
                  onChange({
                    ...hotspot,
                    label_size: parseInt(e.target.value) || 12,
                  })
                }
                className="w-10 bg-transparent border border-border rounded text-center text-xs py-0.5"
              />
              <span className="text-[10px] text-neutral-500">px</span>
            </div>
            <div className="flex ml-auto text-neutral-400">
              <ToolbarIcon title="Left">
                <AlignLeft size={12} />
              </ToolbarIcon>
              <ToolbarIcon title="Center">
                <AlignCenter size={12} />
              </ToolbarIcon>
              <ToolbarIcon title="Right">
                <AlignRight size={12} />
              </ToolbarIcon>
            </div>
          </div>
          <textarea
            placeholder="Enter text here"
            value={hotspot.label ?? ""}
            onChange={(e) => onChange({ ...hotspot, label: e.target.value })}
            rows={3}
            className="w-full p-2 text-sm outline-none resize-none"
            style={{
              // Cap the display font-size in the editor so a large label doesn't
              // blow out the panel. The stored value (used in the panorama) is
              // whatever the user typed into the size input above.
              color: hotspot.label_color,
              fontWeight: hotspot.label_bold ? 700 : 400,
              fontSize: Math.min(hotspot.label_size ?? 12, 14),
              fontFamily: fontFor(hotspot.label_font),
              background: hotspot.label_bg || "transparent",
              borderRadius: 3,
              lineHeight: 1.35,
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 mt-2">
          <FieldMini label="Font">
            <select
              value={hotspot.label_font ?? "sans"}
              onChange={(e) =>
                onChange({ ...hotspot, label_font: e.target.value as LabelFont })
              }
              className="w-full bg-panelSoft border border-border rounded px-2 py-1 text-xs"
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </FieldMini>
          <FieldMini label="Label bg">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={hotspot.label_bg ?? "#000000"}
                onChange={(e) =>
                  onChange({ ...hotspot, label_bg: e.target.value })
                }
                className="w-8 h-7 rounded bg-panelSoft border border-border cursor-pointer"
              />
              <button
                onClick={() => onChange({ ...hotspot, label_bg: null })}
                className="text-[10px] text-neutral-400 hover:text-white"
                title="Remove background"
              >
                clear
              </button>
            </div>
          </FieldMini>
        </div>

        <div className="flex gap-4 mt-2">
          <Checkbox
            checked={hotspot.shadow}
            onChange={(v) => onChange({ ...hotspot, shadow: v })}
            label="Shadow"
          />
          <Checkbox
            checked={hotspot.only_hover}
            onChange={(v) => onChange({ ...hotspot, only_hover: v })}
            label="Only hover"
          />
        </div>
      </Section>
      )}

      {/* ANIMATION — hidden for info & person hotspots; both ship with a
          fixed hover choreography that overrides these generic
          per-hotspot animations. */}
      {hotspot.type !== "info" && hotspot.type !== "person" && (
      <Section
        title="Animation"
        trailing={<Sparkles size={12} className="text-cyan-400" />}
      >
        <select
          value={hotspot.animation ?? "none"}
          onChange={(e) =>
            onChange({
              ...hotspot,
              animation: e.target.value as HotspotAnimation,
            })
          }
          className="w-full bg-panelSoft border border-border rounded px-2 py-1.5 text-sm"
        >
          <option value="none">None</option>
          <option value="bounce">Bounce</option>
          <option value="pulse">Pulse</option>
          <option value="wave">Wave</option>
          <option value="spin">Spin</option>
          <option value="shake">Shake</option>
        </select>
        <div className="text-[11px] text-neutral-500 mt-1">
          Plays continuously while the user hovers the hotspot.
        </div>
      </Section>
      )}

      {/* MASTER LAYER */}
      <Section
        title="Master layer"
        trailing={<Layers size={12} className="text-cyan-400" />}
      >
        <label className="flex items-start gap-2 cursor-pointer text-sm">
          <input
            type="checkbox"
            checked={hotspot.is_master ?? false}
            onChange={(e) =>
              onChange({ ...hotspot, is_master: e.target.checked })
            }
            className="mt-0.5"
          />
          <div>
            <div>Show on every scene</div>
            <div className="text-[11px] text-neutral-500">
              This hotspot appears in every scene of the tour at the same
              yaw/pitch. Great for logos, wayfinding, or a global "Info" button.
            </div>
          </div>
        </label>

        {/* When master is on, let the user restrict which scenes it appears in */}
        {hotspot.is_master && (
          <MasterScenePicker
            hotspot={hotspot}
            scenes={scenes}
            onChange={onChange}
          />
        )}
      </Section>

      {/* ACTION — hidden for person hotspots (they're pure info bubbles,
          no click action needed). */}
      {hotspot.type !== "person" && (
      <Section title="Action">
        <select
          value={hotspot.action}
          onChange={(e) =>
            onChange({ ...hotspot, action: e.target.value as HotspotAction })
          }
          className="w-full bg-panelSoft border border-border rounded px-2 py-1.5 text-sm"
        >
          <option value="none">No action</option>
          <option value="nav">Navigate to another scene</option>
          <option value="info_popup">Open info popup</option>
          <option value="video_popup">Open video (YouTube / upload)</option>
          <option value="audio_popup">Play audio / voice note</option>
          <option value="pdf_popup">Open document (PDF)</option>
          <option value="url">Open URL</option>
        </select>
        <div className="text-[11px] text-neutral-500 mt-1">
          Select what happens when the user clicks or taps on the hotspot.
        </div>

        {hotspot.action === "nav" && (
          <Field label="Target scene">
            <select
              value={hotspot.target_scene_id ?? ""}
              onChange={(e) =>
                onChange({
                  ...hotspot,
                  target_scene_id: e.target.value || null,
                })
              }
              className="w-full bg-panelSoft border border-border rounded px-2 py-1.5 text-sm"
            >
              <option value="">— pick scene —</option>
              {scenes
                .filter((s) => s.id !== hotspot.scene_id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </Field>
        )}

        {hotspot.action === "info_popup" && (
          <>
            <Field label="Popup title">
              <input
                value={hotspot.info_title ?? ""}
                onChange={(e) =>
                  onChange({ ...hotspot, info_title: e.target.value })
                }
                className="w-full bg-panelSoft border border-border rounded px-2 py-1.5 text-sm"
              />
            </Field>
            <Field label="Popup body">
              <textarea
                value={hotspot.info_body ?? ""}
                onChange={(e) =>
                  onChange({ ...hotspot, info_body: e.target.value })
                }
                rows={3}
                className="w-full bg-panelSoft border border-border rounded px-2 py-1.5 text-sm"
              />
            </Field>
          </>
        )}

        {hotspot.action === "image_popup" && (
          <>
            <Field label="Popup image URL">
              <input
                value={hotspot.image_url ?? ""}
                onChange={(e) =>
                  onChange({ ...hotspot, image_url: e.target.value })
                }
                placeholder="https://…"
                className="w-full bg-panelSoft border border-border rounded px-2 py-1.5 text-sm"
              />
            </Field>
            <CardSizeField hotspot={hotspot} onChange={onChange} />
          </>
        )}

        {hotspot.action === "url" && (
          <Field label="URL">
            <input
              value={hotspot.url ?? ""}
              onChange={(e) => onChange({ ...hotspot, url: e.target.value })}
              placeholder="https://…"
              className="w-full bg-panelSoft border border-border rounded px-2 py-1.5 text-sm"
            />
          </Field>
        )}

        {hotspot.action === "video_popup" && (
          <VideoConfig hotspot={hotspot} onChange={onChange} />
        )}

        {hotspot.action === "pdf_popup" && (
          <PdfConfig hotspot={hotspot} onChange={onChange} />
        )}

        {(hotspot.action === "audio_popup" || hotspot.type === "audio") && (
          <AudioConfig hotspot={hotspot} onChange={onChange} />
        )}
      </Section>
      )}

      {/* SOUND EFFECT — hidden for person hotspots (no click action). */}
      {hotspot.type !== "person" && (
      <Section title="Click sound">
        <SoundEffectPicker hotspot={hotspot} onChange={onChange} />
      </Section>
      )}

      {/* Overlay mode picker — offered for every hotspot type EXCEPT text.
          Text hotspots always render as HTML billboards (their label is the
          payload — nothing to paint on a 3D plane). */}
      {hotspot.type !== "text" && hotspot.type !== "person" && (
        <Section title="Overlay mode">
          <div className="grid grid-cols-2 gap-2">
            <ModeBtn
              active={
                !hotspot.overlay_mode || hotspot.overlay_mode === "billboard"
              }
              onClick={() =>
                onChange({ ...hotspot, overlay_mode: "billboard" })
              }
            >
              Billboard
              <div className="text-[10px] text-neutral-400">
                Always faces camera
              </div>
            </ModeBtn>
            <ModeBtn
              active={hotspot.overlay_mode === "surface"}
              onClick={() => onChange({ ...hotspot, overlay_mode: "surface" })}
            >
              2D
              <div className="text-[10px] text-neutral-400">
                Generic surface stick
              </div>
            </ModeBtn>
            <ModeBtn
              active={hotspot.overlay_mode === "floor"}
              onClick={() => onChange({ ...hotspot, overlay_mode: "floor" })}
            >
              Floor
              <div className="text-[10px] text-neutral-400">
                Engraved into ground
              </div>
            </ModeBtn>
            <ModeBtn
              active={hotspot.overlay_mode === "wall"}
              onClick={() => onChange({ ...hotspot, overlay_mode: "wall" })}
            >
              Wall
              <div className="text-[10px] text-neutral-400">
                Perspective-matched
              </div>
            </ModeBtn>
          </div>

          {/* Wall fine-tune: only shown for Wall mode. Small angular offsets
              let the user nudge the plane to line up with the actual wall. */}
          {hotspot.overlay_mode === "wall" && (
            <div className="mt-3 space-y-2 border-t border-border/50 pt-3">
              <div className="text-[10px] uppercase tracking-wide text-neutral-500">
                Wall alignment
              </div>
              <TiltSlider
                label="Tilt left / right"
                value={hotspot.wall_tilt_yaw ?? 0}
                onChange={(v) =>
                  onChange({ ...hotspot, wall_tilt_yaw: v })
                }
              />
              <TiltSlider
                label="Tilt up / down"
                value={hotspot.wall_tilt_pitch ?? 0}
                onChange={(v) =>
                  onChange({ ...hotspot, wall_tilt_pitch: v })
                }
              />
              <TiltSlider
                label="Roll"
                value={hotspot.wall_tilt_roll ?? 0}
                onChange={(v) =>
                  onChange({ ...hotspot, wall_tilt_roll: v })
                }
              />
              <button
                onClick={() =>
                  onChange({
                    ...hotspot,
                    wall_tilt_yaw: 0,
                    wall_tilt_pitch: 0,
                    wall_tilt_roll: 0,
                  })
                }
                className="text-[10px] text-neutral-400 hover:text-white underline"
              >
                Reset alignment
              </button>
            </div>
          )}
        </Section>
      )}

      {/* Scale-on-zoom toggle — meaningful for every render mode. */}
      <Section title="Zoom behavior">
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={hotspot.scale_on_zoom ?? true}
            onChange={(e) =>
              onChange({ ...hotspot, scale_on_zoom: e.target.checked })
            }
          />
          <span>
            Scale with zoom
            <div className="text-[10px] text-neutral-400">
              On: hotspot grows when you zoom in (feels part of the scene).
              Off: stays the same on-screen size (like a fixed UI marker).
            </div>
          </span>
        </label>
      </Section>

      <div className="pt-3 border-t border-border space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onTest}
            className="bg-accent/20 border border-accent/50 text-accent text-xs font-medium py-2 rounded flex items-center justify-center gap-2 hover:bg-accent/30"
            title="Fire the hotspot's action right now"
          >
            <Play size={12} /> Test action
          </button>
          <button
            onClick={onReposition}
            className="bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-xs font-medium py-2 rounded flex items-center justify-center gap-2 hover:bg-cyan-500/25"
          >
            <Move size={12} /> Reposition
          </button>
        </div>
        <div className="text-[10px] text-neutral-500 text-center">
          Tip: double-click a hotspot on the panorama to fire its action.
        </div>
        <div className="flex items-center justify-between">
          <div className="text-[10px] text-neutral-500">
            yaw {hotspot.yaw.toFixed(2)} · pitch {hotspot.pitch.toFixed(2)}
          </div>
          <div className="flex items-center gap-3">
            {onDuplicate && (
              <button
                onClick={onDuplicate}
                className="text-xs text-cyan-300 hover:text-cyan-200 flex items-center gap-1"
                title="Duplicate (Ctrl+D)"
              >
                <ImageIcon size={12} /> Duplicate
              </button>
            )}
            <button
              onClick={() => onDelete(hotspot.id)}
              className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </div>
      </div>

      {iconPickerOpen && (
        <IconPicker
          tint={hotspot.icon_tint}
          onClose={() => setIconPickerOpen(false)}
          onPick={(v) => onChange({ ...hotspot, ...v })}
        />
      )}
    </div>
  );
}

/* --- small primitives --- */

function Section({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wide text-neutral-400">
          {title}
        </div>
        {trailing}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block mt-2">
      <div className="text-[11px] uppercase text-neutral-400 mb-1">{label}</div>
      {children}
    </label>
  );
}

/* -------- Video / PDF / SoundEffect config subcomponents ---------- */

function VideoConfig({
  hotspot,
  onChange,
}: {
  hotspot: Hotspot;
  onChange: (h: Hotspot) => void;
}) {
  const [uploading, setUploading] = useState(false);
  async function upload(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "mp4";
      const path = `videos/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("panoramas")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) return alert(error.message);
      const { data } = supabase.storage.from("panoramas").getPublicUrl(path);
      onChange({
        ...hotspot,
        video_url: data.publicUrl,
        video_source: "upload",
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <Field label="YouTube URL or paste video URL">
        <input
          value={hotspot.video_url ?? ""}
          onChange={(e) => {
            const url = e.target.value;
            const isYouTube = /youtube\.com|youtu\.be/i.test(url);
            onChange({
              ...hotspot,
              video_url: url,
              video_source: isYouTube ? "youtube" : "upload",
              // Auto-enable the inline video card when a YouTube URL is
              // pasted — this is the "virtual player on the panorama"
              // experience users almost always want for embedded videos.
              // Skip if the user has explicitly turned it off before.
              video_show_thumbnail:
                isYouTube && url.length > 10
                  ? hotspot.video_show_thumbnail !== false
                  : hotspot.video_show_thumbnail,
            });
          }}
          placeholder="https://youtube.com/watch?v=… or https://…mp4"
          className="w-full bg-panelSoft border border-border rounded px-2 py-1.5 text-sm"
        />
      </Field>
      <label className="mt-2 block border border-dashed border-border rounded p-3 text-center text-xs cursor-pointer hover:border-accent">
        <input
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        {uploading ? "Uploading…" : "or upload a video file"}
      </label>

      {/* Inline video card — renders as a playable thumbnail card on the
          panorama instead of a small icon. */}
      <label className="mt-3 flex items-center gap-2 text-xs cursor-pointer">
        <input
          type="checkbox"
          checked={hotspot.video_show_thumbnail ?? false}
          onChange={(e) =>
            onChange({ ...hotspot, video_show_thumbnail: e.target.checked })
          }
        />
        <span>Virtual card</span>
      </label>

      {hotspot.video_show_thumbnail && (
        <Field label="Thumbnail URL (optional — leave blank to auto-detect)">
          <input
            value={hotspot.video_thumbnail_url ?? ""}
            onChange={(e) =>
              onChange({ ...hotspot, video_thumbnail_url: e.target.value })
            }
            placeholder="https://…jpg"
            className="w-full bg-panelSoft border border-border rounded px-2 py-1.5 text-sm"
          />
        </Field>
      )}

      {/* Thumbnail (hover / inline card) size — 50-300% of default */}
      <ThumbnailSizeField hotspot={hotspot} onChange={onChange} />
      {/* Player size — 20-150% of viewer, applied to the floating video window */}
      <PlayerSizeField hotspot={hotspot} onChange={onChange} />
    </>
  );
}

/** Slider for the popup player window size (20-150% of viewer). Applies
 *  to the floating video window and image popup. */
function PlayerSizeField({
  hotspot,
  onChange,
}: {
  hotspot: Hotspot;
  onChange: (h: Hotspot) => void;
}) {
  const val = hotspot.card_size_pct ?? 80;
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs uppercase text-neutral-400">Player size</div>
        <div className="text-[11px] text-neutral-400">{val}% of viewer</div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={20}
          max={150}
          step={5}
          value={val}
          onChange={(e) =>
            onChange({ ...hotspot, card_size_pct: Number(e.target.value) })
          }
          className="flex-1 accent-accent"
        />
        <input
          type="number"
          min={20}
          max={150}
          step={5}
          value={val}
          onChange={(e) =>
            onChange({
              ...hotspot,
              card_size_pct: Math.max(20, Math.min(150, Number(e.target.value) || 80)),
            })
          }
          className="w-16 bg-panelSoft border border-border rounded px-2 py-1 text-xs"
        />
      </div>
    </div>
  );
}

/** Slider for the inline / hover thumbnail card size (50-300% of default). */
function ThumbnailSizeField({
  hotspot,
  onChange,
}: {
  hotspot: Hotspot;
  onChange: (h: Hotspot) => void;
}) {
  const val = hotspot.thumbnail_size_pct ?? 100;
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs uppercase text-neutral-400">
          Thumbnail size
        </div>
        <div className="text-[11px] text-neutral-400">{val}%</div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={50}
          max={300}
          step={10}
          value={val}
          onChange={(e) =>
            onChange({
              ...hotspot,
              thumbnail_size_pct: Number(e.target.value),
            })
          }
          className="flex-1 accent-accent"
        />
        <input
          type="number"
          min={50}
          max={300}
          step={10}
          value={val}
          onChange={(e) =>
            onChange({
              ...hotspot,
              thumbnail_size_pct: Math.max(
                50,
                Math.min(300, Number(e.target.value) || 100)
              ),
            })
          }
          className="w-16 bg-panelSoft border border-border rounded px-2 py-1 text-xs"
        />
      </div>
      <div className="text-[10px] text-neutral-500 mt-1">
        Controls the inline video card and the hover preview thumbnail.
      </div>
    </div>
  );
}

/** Back-compat alias — image config still calls this. Same as PlayerSize. */
function CardSizeField(props: {
  hotspot: Hotspot;
  onChange: (h: Hotspot) => void;
}) {
  return <PlayerSizeField {...props} />;
}

/** Scoped scene picker for master hotspots.
 *  - Empty list = "all scenes" (default master behavior).
 *  - Any picked = allowlist; the master only shows in ticked scenes.
 *  Renders as a compact draggable-list of scene thumbs with checkboxes,
 *  plus quick "Select all / Clear" buttons. */
function MasterScenePicker({
  hotspot,
  scenes,
  onChange,
}: {
  hotspot: Hotspot;
  scenes: Scene[];
  onChange: (h: Hotspot) => void;
}) {
  const ids = new Set<string>(hotspot.master_scene_ids ?? []);
  const allSelected = ids.size === 0; // empty = every scene
  function toggle(sceneId: string) {
    const next = new Set(ids);
    if (next.has(sceneId)) next.delete(sceneId);
    else next.add(sceneId);
    onChange({
      ...hotspot,
      master_scene_ids: next.size === 0 ? null : Array.from(next),
    });
  }
  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[11px] uppercase tracking-wider text-neutral-400">
          Show in these scenes
        </div>
        <div className="flex gap-2 text-[11px]">
          <button
            onClick={() =>
              onChange({ ...hotspot, master_scene_ids: null })
            }
            className={`hover:text-white ${
              allSelected ? "text-accent" : "text-neutral-500"
            }`}
          >
            All
          </button>
          <button
            onClick={() =>
              onChange({
                ...hotspot,
                master_scene_ids: scenes.map((s) => s.id),
              })
            }
            className="text-neutral-500 hover:text-white"
          >
            Every
          </button>
        </div>
      </div>
      <div className="max-h-56 overflow-y-auto panel-scroll rounded border border-border bg-panelSoft p-1.5 space-y-1">
        {scenes.length === 0 ? (
          <div className="text-[11px] text-neutral-500 text-center py-2">
            No scenes in this tour yet.
          </div>
        ) : (
          scenes.map((s) => {
            const checked = allSelected || ids.has(s.id);
            return (
              <label
                key={s.id}
                className="flex items-center gap-2 text-[12px] hover:bg-white/5 rounded px-1.5 py-1 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(s.id)}
                  className="shrink-0"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={publicUrl(s.thumbnail_path ?? s.image_path) ?? ""}
                  alt=""
                  className="w-8 h-6 object-cover rounded bg-black shrink-0"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
                <span className="truncate flex-1">{s.name}</span>
              </label>
            );
          })
        )}
      </div>
      <div className="text-[10px] text-neutral-500 mt-1">
        {allSelected
          ? "Master appears in every scene."
          : `Master appears in ${ids.size} scene${
              ids.size === 1 ? "" : "s"
            }.`}
      </div>
    </div>
  );
}

/* ------------------------------ AudioConfig ---------------------------------
 * Voice-note / audio hotspot editor. Two ways to attach audio:
 *   1) Paste a URL (mp3 / wav / m4a / ogg).
 *   2) Upload a local audio file.
 *   3) Record in-browser using MediaRecorder — output uploaded as .webm.
 * The recorder shows a live timer and a stop button while recording.
 * ------------------------------------------------------------------------- */
function AudioConfig({
  hotspot,
  onChange,
}: {
  hotspot: Hotspot;
  onChange: (h: Hotspot) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  async function uploadBlob(blob: Blob, ext: string) {
    setUploading(true);
    try {
      const path = `audio/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("panoramas")
        .upload(path, blob, {
          cacheControl: "3600",
          upsert: false,
          contentType: blob.type || `audio/${ext}`,
        });
      if (error) {
        alert(error.message);
        return;
      }
      const { data } = supabase.storage.from("panoramas").getPublicUrl(path);
      onChange({ ...hotspot, audio_url: data.publicUrl });
    } finally {
      setUploading(false);
    }
  }

  async function uploadFile(file: File) {
    const ext = (file.name.split(".").pop() ?? "mp3").toLowerCase();
    await uploadBlob(file, ext);
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime =
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mime });
        await uploadBlob(blob, "webm");
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setElapsed(0);
      const t0 = Date.now();
      timerRef.current = window.setInterval(() => {
        setElapsed(Math.floor((Date.now() - t0) / 1000));
      }, 250);
    } catch (err: any) {
      alert(
        "Microphone access denied. Enable it in your browser to record voice notes."
      );
    }
  }

  function stopRecording() {
    try {
      recorderRef.current?.stop();
    } catch {}
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecording(false);
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <>
      <Field label="Audio URL (mp3, wav, m4a, ogg)">
        <input
          value={hotspot.audio_url ?? ""}
          onChange={(e) =>
            onChange({ ...hotspot, audio_url: e.target.value })
          }
          placeholder="https://…/voice-note.mp3"
          className="w-full bg-panelSoft border border-border rounded px-2 py-1.5 text-sm"
        />
      </Field>

      {hotspot.audio_url ? (
        <div className="mt-2 rounded border border-border bg-panelSoft p-2">
          <audio src={hotspot.audio_url} controls className="w-full" />
          <button
            onClick={() => onChange({ ...hotspot, audio_url: null })}
            className="mt-2 text-[11px] text-neutral-400 hover:text-red-400"
          >
            Remove audio
          </button>
        </div>
      ) : null}

      <label className="mt-2 block border border-dashed border-border rounded p-3 text-center text-xs cursor-pointer hover:border-accent">
        <input
          type="file"
          accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/webm,audio/mp4,audio/x-m4a,audio/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
        />
        {uploading ? "Uploading…" : "or upload an audio file"}
      </label>

      <div className="mt-3">
        {!recording ? (
          <button
            type="button"
            onClick={startRecording}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-2 rounded bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm py-1.5"
          >
            <span className="inline-block w-2 h-2 rounded-full bg-white" />
            Record voice note
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRecording}
            className="w-full flex items-center justify-center gap-2 rounded bg-neutral-700 hover:bg-neutral-600 text-white text-sm py-1.5"
          >
            <span className="inline-block w-2 h-2 rounded-sm bg-red-500 animate-pulse" />
            Recording {mm}:{ss} — click to stop
          </button>
        )}
        <div className="mt-1 text-[10px] text-neutral-500 text-center">
          Recording uses your browser's microphone and uploads instantly.
        </div>
      </div>
    </>
  );
}

/** Unified image source picker for image hotspots. One URL field + one
 *  upload button, both writing to the same `image_url` field. Preview
 *  + Remove button shown when a URL is set so the user can start over. */
function ImageSourceField({
  hotspot,
  onChange,
}: {
  hotspot: Hotspot;
  onChange: (h: Hotspot) => void;
}) {
  const [uploading, setUploading] = useState(false);
  async function upload(file: File) {
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
      const path = `images/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("panoramas")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) {
        alert(error.message);
        return;
      }
      const { data } = supabase.storage.from("panoramas").getPublicUrl(path);
      onChange({ ...hotspot, image_url: data.publicUrl });
    } finally {
      setUploading(false);
    }
  }

  const has = !!hotspot.image_url;

  return (
    <>
      <Field label="Image URL">
        <input
          value={hotspot.image_url ?? ""}
          onChange={(e) =>
            onChange({ ...hotspot, image_url: e.target.value })
          }
          placeholder="https://…jpg"
          className="w-full bg-panelSoft border border-border rounded px-2 py-1.5 text-sm"
        />
      </Field>

      {has && (
        <div className="mt-2 rounded border border-border bg-panelSoft p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hotspot.image_url ?? ""}
            alt=""
            className="w-full max-h-40 object-contain rounded"
          />
          <button
            onClick={() => onChange({ ...hotspot, image_url: null })}
            className="mt-2 text-[11px] text-neutral-400 hover:text-red-400"
          >
            Remove image
          </button>
        </div>
      )}

      <label className="mt-2 block border border-dashed border-border rounded p-3 text-center text-xs cursor-pointer hover:border-accent">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        {uploading
          ? "Uploading…"
          : has
          ? "or upload a different image"
          : "or upload an image file"}
      </label>
    </>
  );
}

function PdfConfig({
  hotspot,
  onChange,
}: {
  hotspot: Hotspot;
  onChange: (h: Hotspot) => void;
}) {
  const [uploading, setUploading] = useState(false);
  async function upload(file: File) {
    setUploading(true);
    try {
      const path = `docs/${crypto.randomUUID()}.pdf`;
      const { error } = await supabase.storage
        .from("panoramas")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) return alert(error.message);
      const { data } = supabase.storage.from("panoramas").getPublicUrl(path);
      onChange({
        ...hotspot,
        pdf_url: data.publicUrl,
        pdf_name: file.name,
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <Field label="PDF URL">
        <input
          value={hotspot.pdf_url ?? ""}
          onChange={(e) => onChange({ ...hotspot, pdf_url: e.target.value })}
          placeholder="https://…/document.pdf"
          className="w-full bg-panelSoft border border-border rounded px-2 py-1.5 text-sm"
        />
      </Field>
      <Field label="Document label (optional)">
        <input
          value={hotspot.pdf_name ?? ""}
          onChange={(e) => onChange({ ...hotspot, pdf_name: e.target.value })}
          placeholder="MSDS – Reactor 1"
          className="w-full bg-panelSoft border border-border rounded px-2 py-1.5 text-sm"
        />
      </Field>
      <label className="mt-2 block border border-dashed border-border rounded p-3 text-center text-xs cursor-pointer hover:border-accent">
        <input
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        {uploading ? "Uploading…" : "or upload a PDF"}
      </label>
    </>
  );
}

function SoundEffectPicker({
  hotspot,
  onChange,
}: {
  hotspot: Hotspot;
  onChange: (h: Hotspot) => void;
}) {
  const [uploading, setUploading] = useState(false);
  async function upload(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "mp3";
      const path = `sounds/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("panoramas")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) return alert(error.message);
      const { data } = supabase.storage.from("panoramas").getPublicUrl(path);
      onChange({
        ...hotspot,
        sound_effect: "custom",
        sound_effect_url: data.publicUrl,
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <select
        value={hotspot.sound_effect ?? "none"}
        onChange={(e) =>
          onChange({
            ...hotspot,
            sound_effect: e.target.value as Hotspot["sound_effect"],
          })
        }
        className="w-full bg-panelSoft border border-border rounded px-2 py-1.5 text-sm"
      >
        {PRESET_SOUNDS.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
      <div className="flex gap-2 mt-2">
        <button
          onClick={() =>
            playHotspotSound(hotspot.sound_effect, hotspot.sound_effect_url)
          }
          className="text-xs bg-panelSoft border border-border rounded px-2 py-1"
        >
          ▶ Test
        </button>
        {hotspot.sound_effect === "custom" && (
          <label className="flex-1 text-xs bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 rounded px-2 py-1 text-center cursor-pointer">
            <input
              type="file"
              accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
            {uploading
              ? "Uploading…"
              : hotspot.sound_effect_url
              ? "Replace file"
              : "Upload MP3"}
          </label>
        )}
      </div>
    </>
  );
}

function FieldMini({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase text-neutral-400 mb-1">{label}</div>
      {children}
    </div>
  );
}

function SliderRow({
  label,
  value,
  valueLabel,
  min,
  max,
  onChange,
  disabled,
  allowTyping,
}: {
  label: string;
  value: number;
  valueLabel: string;
  min: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  allowTyping?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 ${disabled ? "opacity-50" : ""}`}
    >
      <div className="text-xs text-neutral-400 w-14">{label}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={Math.min(value, max)}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        className="flex-1"
      />
      {allowTyping ? (
        <input
          type="number"
          min={min}
          value={Math.round(value)}
          onChange={(e) => onChange(parseFloat(e.target.value) || min)}
          disabled={disabled}
          className="w-14 bg-panelSoft border border-border text-cyan-400 rounded text-xs text-right py-0.5 px-1"
        />
      ) : (
        <div className="text-xs text-cyan-400 w-10 text-right">
          {valueLabel}
        </div>
      )}
    </div>
  );
}

function ColorSwatch({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="cursor-pointer relative">
      <div
        className="w-4 h-4 rounded border border-neutral-600"
        style={{ background: value }}
      />
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer w-4 h-4"
      />
    </label>
  );
}

/** Compact number input with ▲/▼ stepper buttons. Replacement for
 *  slider-based numeric inputs where precise values matter more than
 *  scrubbing (Width, Height, Rotation). */
function NumberStepper({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div
      className={`flex items-center gap-3 ${disabled ? "opacity-50" : ""}`}
    >
      <div className="text-xs text-neutral-400 w-14">{label}</div>
      <div className="flex-1" />
      <div className="flex items-stretch border border-border rounded overflow-hidden bg-panelSoft">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={Math.round(value)}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            if (!isFinite(n)) return;
            onChange(clamp(n));
          }}
          disabled={disabled}
          className="w-14 bg-transparent text-cyan-400 text-xs text-right py-0.5 px-1 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        {suffix && (
          <span className="text-[10px] text-neutral-500 self-center pr-1">
            {suffix}
          </span>
        )}
        <div className="flex flex-col border-l border-border">
          <button
            type="button"
            onClick={() => onChange(clamp(value + step))}
            disabled={disabled || value >= max}
            className="px-1.5 flex-1 hover:bg-neutral-700 text-neutral-300 disabled:opacity-40 disabled:hover:bg-transparent leading-none"
            title="Increase"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => onChange(clamp(value - step))}
            disabled={disabled || value <= min}
            className="px-1.5 flex-1 hover:bg-neutral-700 text-neutral-300 disabled:opacity-40 disabled:hover:bg-transparent border-t border-border leading-none"
            title="Decrease"
          >
            ▼
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolbarIcon({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      title={title}
      className="w-6 h-6 grid place-items-center rounded hover:bg-neutral-800 text-neutral-300"
    >
      {children}
    </button>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap items-center gap-1.5 text-xs cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-cyan-400" />
      {label}
    </label>
  );
}

function ModeBtn({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex-1 text-left rounded px-2 py-2 text-xs ${active ? "bg-accent text-black" : "bg-panelSoft border border-border text-neutral-200"}`}>
      {children}
    </button>
  );
}

function TiltSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const deg = (value * 180) / Math.PI;
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] text-neutral-400 mb-0.5">
        <span>{label}</span><span>{deg.toFixed(1)}°</span>
      </div>
      <input type="range" min={-45} max={45} step={0.5} value={deg} onChange={(e) => onChange((parseFloat(e.target.value) * Math.PI) / 180)} className="w-full accent-cyan-400" />
    </div>
  );
}
