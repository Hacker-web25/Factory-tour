"use client";

import { useEffect, useState } from "react";
import type {
  Hotspot,
  HotspotAction,
  HotspotAnimation,
  LabelFont,
  Scene,
  Tour,
} from "@/lib/types";
import { supabase } from "@/lib/supabase";
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
} from "lucide-react";

type Tab = "photo" | "addon" | "autotour";

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
  onStartAddHotspot: (draft: Partial<Hotspot>) => void;
  onStartReposition: (id: string) => void;
  onTestAction: (h: Hotspot) => void;
  onHotspotChange: (h: Hotspot) => void;
  onHotspotDelete: (id: string) => void;
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
  onStartAddHotspot,
  onStartReposition,
  onTestAction,
  onHotspotChange,
  onHotspotDelete,
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
    if (selectedHotspot) setTab("addon");
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
        hidden={hidden}
      />
    );
  }

  return (
    <aside
      style={hidden ? { display: "none" } : undefined}
      className="w-[340px] shrink-0 bg-panel border-l border-border flex flex-col"
    >
      <div className="flex items-center border-b border-border">
        <TabBtn active={tab === "photo"} onClick={() => setTab("photo")}>
          PHOTO
        </TabBtn>
        <TabBtn active={tab === "addon"} onClick={() => setTab("addon")}>
          ADDON
        </TabBtn>
        {tour.auto_tour_enabled && (
          <TabBtn
            active={tab === "autotour"}
            onClick={() => setTab("autotour")}
          >
            AUTO-TOUR
          </TabBtn>
        )}
        <div className="flex-1" />
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-accent text-black text-sm font-medium px-3 py-2 mr-2 my-1 rounded disabled:opacity-50"
        >
          {saving ? "Saving…" : "SAVE"}
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
          />
        )}
        {tab === "addon" && selectedHotspot && (
          <AddonTab
            hotspot={selectedHotspot}
            scenes={scenes}
            onChange={onHotspotChange}
            onDelete={onHotspotDelete}
            onReposition={() => onStartReposition(selectedHotspot.id)}
            onTest={() => onTestAction(selectedHotspot)}
          />
        )}
        {tab === "addon" && !selectedHotspot && (
          <div className="text-xs text-neutral-500">
            Select a hotspot to edit it, or add one from the Photo tab.
          </div>
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
      className={`px-4 py-3 text-xs tracking-wide ${
        active
          ? "bg-panelSoft text-white border-b-2 border-accent"
          : "text-neutral-400 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

/* ------------------------------ PREVIEW PANEL ---------------------------- */
function PreviewPanel({
  tour,
  onEnterEditMode,
  onPublishToggle,
  hidden,
}: {
  tour: Tour;
  onEnterEditMode: () => void;
  onPublishToggle: () => Promise<void>;
  onEnterFullscreen?: () => void; // kept optional for back-compat; unused now
  hidden?: boolean;
}) {
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
            window.open(`/tour/${tour.id}?fullscreen=1`, "_blank");
          }}
          className="w-full bg-panelSoft border border-border text-neutral-100 font-medium py-2 rounded flex items-center justify-center gap-2 hover:bg-neutral-700"
        >
          <Maximize2 size={14} /> Fullscreen
        </button>

        {/* Public/Private status pill */}
        <button
          onClick={onPublishToggle}
          className={`w-full flex items-center justify-center gap-2 text-sm font-medium py-2 rounded border ${
            tour.published
              ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/25"
              : "bg-neutral-800/60 border-border text-neutral-300 hover:bg-neutral-700"
          }`}
          title="Click to toggle between Public and Private"
        >
          {tour.published ? (
            <>
              <Globe size={14} /> Public
            </>
          ) : (
            <>
              <Lock size={14} /> Private
            </>
          )}
        </button>

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

/* ------------------------------- PHOTO TAB ------------------------------- */
function PhotoTab({
  tour,
  scene,
  onStartAddHotspot,
  onSceneChange,
  onPublishToggle,
  onPatchTour,
}: {
  tour: Tour;
  scene: Scene;
  onStartAddHotspot: (d: Partial<Hotspot>) => void;
  onSceneChange: (s: Scene) => void;
  onPublishToggle: () => Promise<void>;
  onPatchTour: (fields: Partial<Tour>) => Promise<void>;
}) {
  const [imagePickerOpen, setImagePickerOpen] = useState(false);

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

      <div>
        <div className="text-xs uppercase text-neutral-400 mb-2">Add-ons</div>
        <div className="grid grid-cols-3 gap-2">
          <AddonBtn
            icon={<ImageIcon size={14} />}
            label="Image"
            onClick={() => setImagePickerOpen(true)}
          />
          <AddonBtn
            icon={<Type size={14} />}
            label="Text"
            onClick={() =>
              onStartAddHotspot({ type: "text", label: "Text" })
            }
          />
          <AddonBtn
            icon={<Info size={14} />}
            label="Hotspot"
            onClick={() => onStartAddHotspot({ type: "icon" })}
          />
        </div>
        <div className="text-[11px] text-neutral-500 mt-2">
          Click an add-on. A crosshair will appear — rotate the panorama to
          aim, then click <span className="text-accent">Place here</span>.
        </div>
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

      <AmbientAudioSettings
        scene={scene}
        onSceneChange={onSceneChange}
        tour={tour}
        onPatchTour={onPatchTour}
      />
      <NadirSettings tour={tour} onPatch={onPatchTour} />
      <AutoTourSettings tour={tour} onPatch={onPatchTour} />
      <MenuSettings tour={tour} onPatch={onPatchTour} />
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
              hotspotsInScene={allHotspots.filter(
                (h) => h.scene_id === s.id || h.is_master
              )}
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
      className="flex flex-col items-center gap-1 bg-panelSoft border border-border rounded py-2 hover:border-accent"
    >
      <span className="text-neutral-300">{icon}</span>
      <span className="text-[10px] text-neutral-400">{label}</span>
    </button>
  );
}

/* ------------------------------- ADDON TAB ------------------------------- */
function AddonTab({
  hotspot,
  scenes,
  onChange,
  onDelete,
  onReposition,
  onTest,
}: {
  hotspot: Hotspot;
  scenes: Scene[];
  onChange: (h: Hotspot) => void;
  onDelete: (id: string) => void;
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
      {/* ICON */}
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

      {/* APPEARANCE */}
      <Section title="Appearance">
        <div className="space-y-2">
          <SliderRow
            label="Width"
            value={hotspot.width_pct}
            valueLabel={`${Math.round(hotspot.width_pct)}%`}
            min={4}
            max={500}
            onChange={setW}
            allowTyping
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
          <SliderRow
            label="Height"
            value={hotspot.height_pct}
            valueLabel={`${Math.round(hotspot.height_pct)}%`}
            min={4}
            max={500}
            onChange={setH}
            disabled={hotspot.link_wh}
            allowTyping
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
          <div className="flex gap-3 text-xs">
            <button className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
              <Sliders size={11} /> Advanced
            </button>
            <button
              onClick={() => onChange({ ...hotspot, rotation_deg: 0 })}
              className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
            >
              <RotateCcw size={11} /> Reset
            </button>
          </div>
        }
      >
        <SliderRow
          label="Degrees"
          value={hotspot.rotation_deg}
          valueLabel={`${Math.round(hotspot.rotation_deg)}°`}
          min={-180}
          max={180}
          onChange={(v) => onChange({ ...hotspot, rotation_deg: v })}
        />
      </Section>

      {/* LABEL */}
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

      {/* ANIMATION */}
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
      </Section>

      {/* ACTION */}
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
          <option value="image_popup">Open image popup</option>
          <option value="video_popup">Open video (YouTube / upload)</option>
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
      </Section>

      {/* SOUND EFFECT */}
      <Section title="Click sound">
        <SoundEffectPicker hotspot={hotspot} onChange={onChange} />
      </Section>

      {hotspot.type === "image" && (
        <Section title="Image overlay">
          <div className="flex gap-2">
            <ModeBtn
              active={hotspot.overlay_mode !== "surface"}
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
              Surface (2D)
              <div className="text-[10px] text-neutral-400">
                Sticks to walls
              </div>
            </ModeBtn>
          </div>
        </Section>
      )}

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
          <button
            onClick={() => onDelete(hotspot.id)}
            className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
          >
            <Trash2 size={12} /> Delete
          </button>
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
          onChange={(e) =>
            onChange({
              ...hotspot,
              video_url: e.target.value,
              video_source: /youtube\.com|youtu\.be/i.test(e.target.value)
                ? "youtube"
                : "upload",
            })
          }
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
    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-3.5 h-3.5"
      />
      {label}
    </label>
  );
}

function ModeBtn({
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
      className={`flex-1 text-left rounded px-2 py-2 text-xs ${
        active
          ? "bg-accent text-black"
          : "bg-panelSoft border border-border text-neutral-200"
      }`}
    >
      {children}
    </button>
  );
}
