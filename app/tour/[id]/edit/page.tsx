"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase, publicUrl } from "@/lib/supabase";
import type { Hotspot, Scene, Tour } from "@/lib/types";
import PanoramaViewer from "@/components/panorama/PanoramaViewer";
import RightPanel from "@/components/builder/RightPanel";
import SceneStrip from "@/components/builder/SceneStrip";
import ShareModal from "@/components/builder/ShareModal";
import {
  X,
  Share2,
  Eye,
  Crosshair,
  Check,
  Play,
  Pause,
  Pencil,
  Download,
} from "lucide-react";
import { exportTourToBlob, downloadBlob } from "@/lib/backup";
import MenuOverlay from "@/components/viewer/MenuOverlay";
import { useAutoTour } from "@/lib/useAutoTour";

const HOTSPOT_DEFAULTS = {
  color: "#22c55e",
  size: 1,
  icon_key: "circle-dot" as string | null,
  icon_url: null as string | null,
  icon_tint: "#ffffff",
  width_pct: 80,
  height_pct: 80,
  link_wh: true,
  opacity: 1,
  rotation_deg: 0,
  label_color: "#ffffff",
  label_size: 14,
  label_bold: false,
  only_hover: false,
  shadow: false,
  // default to info_popup so a fresh hotspot does SOMETHING when clicked
  action: "info_popup" as const,
  is_master: false,
  animation: "none" as const,
  label_font: "sans" as const,
  label_bg: null as string | null,
  video_url: null as string | null,
  video_source: null as "youtube" | "upload" | null,
  pdf_url: null as string | null,
  pdf_name: null as string | null,
  sound_effect: "none" as const,
  sound_effect_url: null as string | null,
};

/** Merge draft into defaults with draft winning for keys it defines (including nulls). */
function buildInsert(
  sceneId: string,
  yaw: number,
  pitch: number,
  draft: Partial<Hotspot>
) {
  // draft overrides defaults for any key it explicitly sets
  const merged: Record<string, any> = {
    ...HOTSPOT_DEFAULTS,
    scene_id: sceneId,
    yaw,
    pitch,
    type: draft.type ?? "icon",
    label: draft.label ?? null,
    info_title: draft.info_title ?? null,
    info_body: draft.info_body ?? null,
    overlay_mode: draft.overlay_mode ?? null,
    image_url: draft.image_url ?? null,
    url: draft.url ?? null,
  };
  // Overlay draft values that were explicitly set (undefined = don't touch)
  for (const key of [
    "icon_key",
    "icon_url",
    "icon_tint",
    "width_pct",
    "height_pct",
    "opacity",
    "rotation_deg",
    "action",
    "target_scene_id",
  ] as const) {
    if (draft[key] !== undefined) merged[key] = draft[key];
  }
  // Image type without an explicit icon_key: don't force the default marker key
  if (draft.type === "image" && draft.icon_key === undefined) {
    merged.icon_key = null;
  }
  return merged;
}

export default function TourEditPage() {
  const params = useParams<{ id: string }>();
  const tourId = params.id;

  const [tour, setTour] = useState<Tour | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  // All hotspots for the tour (across scenes). Filtered per active scene below.
  const [allHotspots, setAllHotspots] = useState<Hotspot[]>([]);
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(
    null
  );
  const [pendingHotspot, setPendingHotspot] = useState<Partial<Hotspot> | null>(
    null
  );
  const [repositioningId, setRepositioningId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  // Open every tour in Preview by default — users spend most of their time
  // viewing, and hit Edit when they want to change something.
  const [previewMode, setPreviewMode] = useState(true);
  // Auto-tour is playing when the user clicks Play in preview / it's default-on
  const [autoPlaying, setAutoPlaying] = useState(false);
  const [infoModal, setInfoModal] = useState<Hotspot | null>(null);
  const [videoModal, setVideoModal] = useState<Hotspot | null>(null);
  const [pdfModal, setPdfModal] = useState<Hotspot | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  // Fullscreen is now handled by opening the public viewer in a new tab
  // (?fullscreen=1). No in-page state = no chrome-hiding bugs.

  // Ambient audio ref declared here; the effect that uses it lives below the
  // activeScene useMemo so it can reference it without TDZ errors.
  const ambientAudioRef = useRef<HTMLAudioElement | null>(null);

  const aimGetterRef = useRef<null | (() => { yaw: number; pitch: number })>(
    null
  );
  const screenToYawPitchRef = useRef<
    null | ((x: number, y: number) => { yaw: number; pitch: number } | null)
  >(null);
  const [dragOverPanorama, setDragOverPanorama] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: t }, { data: s }] = await Promise.all([
        supabase.from("tours").select("*").eq("id", tourId).single(),
        supabase
          .from("scenes")
          .select("*")
          .eq("tour_id", tourId)
          .order("order_index"),
      ]);
      setTour(t as Tour);
      setScenes((s ?? []) as Scene[]);
      if (s && s.length) setActiveSceneId(s[0].id);
    })();
  }, [tourId]);

  // Load ALL hotspots for the tour at once so masters (which live on one scene
  // but render on every scene) are available across scene switches.
  useEffect(() => {
    if (!scenes.length) return;
    const sceneIds = scenes.map((s) => s.id);
    supabase
      .from("hotspots")
      .select("*")
      .in("scene_id", sceneIds)
      .then(({ data }) =>
        setAllHotspots((data ?? []) as Hotspot[])
      );
  }, [scenes]);

  useEffect(() => {
    setSelectedHotspotId(null);
    setPendingHotspot(null);
    setRepositioningId(null);
  }, [activeSceneId]);

  // Hotspots visible in the currently active scene: its own + any masters.
  const hotspots = useMemo(
    () =>
      allHotspots.filter(
        (h) => h.scene_id === activeSceneId || h.is_master
      ),
    [allHotspots, activeSceneId]
  );

  const activeScene = useMemo(
    () => scenes.find((s) => s.id === activeSceneId) ?? null,
    [scenes, activeSceneId]
  );

  const selectedHotspot = useMemo(
    () => hotspots.find((h) => h.id === selectedHotspotId) ?? null,
    [hotspots, selectedHotspotId]
  );

  // Ambient audio — tour-level overrides scene-level so the tour audio can
  // play continuously across scene switches.
  const ambientUrl =
    tour?.ambient_audio_url ?? activeScene?.ambient_audio_url ?? null;
  const ambientVolume = tour?.ambient_audio_url
    ? tour.ambient_audio_volume ?? 0.5
    : activeScene?.ambient_audio_volume ?? 0.5;

  // Effect 1: URL / previewMode change → create or destroy the Audio element.
  // Does NOT depend on volume, so scene switches while tour audio is set don't
  // restart the track.
  useEffect(() => {
    if (ambientAudioRef.current) {
      ambientAudioRef.current.pause();
      ambientAudioRef.current = null;
    }
    if (!previewMode || !ambientUrl) return;
    const a = new Audio(ambientUrl);
    a.loop = true;
    a.volume = Math.max(0, Math.min(1, ambientVolume));
    ambientAudioRef.current = a;
    a.play().catch(() => {});
    return () => {
      a.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewMode, ambientUrl]);

  // Effect 2: volume changes → adjust in place without restarting playback.
  useEffect(() => {
    if (ambientAudioRef.current) {
      ambientAudioRef.current.volume = Math.max(0, Math.min(1, ambientVolume));
    }
  }, [ambientVolume]);

  // Auto-tour engine — only runs in Preview mode. Pauses when any modal opens.
  const autoTourPaused =
    !!infoModal || !!videoModal || !!pdfModal;
  useAutoTour({
    playing: previewMode && autoPlaying && scenes.length > 1,
    paused: autoTourPaused,
    tour: tour ?? ({} as Tour),
    scenes,
    activeScene,
    hotspots,
    onAdvance: (nextId) => setActiveSceneId(nextId),
    onFireHotspot: (h) => {
      fireHotspotAction(h);
      // Auto-close the popup after the configured showcase duration so the
      // walkthrough can resume without needing the user to click Close.
      const dur = Math.max(1, h.auto_tour_showcase_duration ?? 5) * 1000;
      window.setTimeout(() => {
        setInfoModal(null);
        setVideoModal(null);
        setPdfModal(null);
      }, dur);
    },
  });

  // Called by both "Place here" (new) and reposition confirm
  async function confirmPlacement() {
    if (!aimGetterRef.current) return;
    const { yaw, pitch } = aimGetterRef.current();

    if (repositioningId) {
      // reposition existing
      setAllHotspots((list) =>
        list.map((h) => (h.id === repositioningId ? { ...h, yaw, pitch } : h))
      );
      await supabase
        .from("hotspots")
        .update({ yaw, pitch })
        .eq("id", repositioningId);
      setRepositioningId(null);
      return;
    }

    if (pendingHotspot && activeSceneId) {
      const insert = buildInsert(activeSceneId, yaw, pitch, pendingHotspot);
      const { data, error } = await supabase
        .from("hotspots")
        .insert(insert)
        .select()
        .single();
      if (error) return alert(error.message);
      setAllHotspots((h) => [...h, data as Hotspot]);
      setSelectedHotspotId((data as Hotspot).id);
      setPendingHotspot(null);
    }
  }

  async function onHotspotChange(h: Hotspot) {
    setAllHotspots((list) => list.map((x) => (x.id === h.id ? h : x)));
    await supabase
      .from("hotspots")
      .update({
        label: h.label,
        color: h.color,
        size: h.size,
        target_scene_id: h.target_scene_id ?? null,
        info_title: h.info_title,
        info_body: h.info_body,
        image_url: h.image_url,
        overlay_mode: h.overlay_mode,
        url: h.url,
        icon_key: h.icon_key,
        icon_url: h.icon_url,
        icon_tint: h.icon_tint,
        width_pct: h.width_pct,
        height_pct: h.height_pct,
        link_wh: h.link_wh,
        opacity: h.opacity,
        rotation_deg: h.rotation_deg,
        label_color: h.label_color,
        label_size: h.label_size,
        label_bold: h.label_bold,
        only_hover: h.only_hover,
        shadow: h.shadow,
        action: h.action,
        is_master: h.is_master,
        animation: h.animation,
        label_font: h.label_font,
        label_bg: h.label_bg,
        video_url: h.video_url ?? null,
        video_source: h.video_source ?? null,
        pdf_url: h.pdf_url ?? null,
        pdf_name: h.pdf_name ?? null,
        sound_effect: h.sound_effect,
        sound_effect_url: h.sound_effect_url,
        auto_tour_showcase: h.auto_tour_showcase ?? false,
        auto_tour_showcase_at: h.auto_tour_showcase_at ?? 3,
        auto_tour_showcase_duration: h.auto_tour_showcase_duration ?? 5,
      })
      .eq("id", h.id);
  }

  const dragThrottleRef = useRef<number>(0);
  function onHotspotDrag(id: string, yaw: number, pitch: number) {
    setAllHotspots((list) =>
      list.map((h) => (h.id === id ? { ...h, yaw, pitch } : h))
    );
    const now = performance.now();
    if (now - dragThrottleRef.current < 200) return;
    dragThrottleRef.current = now;
    supabase.from("hotspots").update({ yaw, pitch }).eq("id", id);
  }
  useEffect(() => {
    function flush() {
      const sel = hotspots.find((h) => h.id === selectedHotspotId);
      if (!sel) return;
      supabase
        .from("hotspots")
        .update({ yaw: sel.yaw, pitch: sel.pitch })
        .eq("id", sel.id);
    }
    window.addEventListener("pointerup", flush);
    return () => window.removeEventListener("pointerup", flush);
  }, [hotspots, selectedHotspotId]);

  async function onHotspotDelete(id: string) {
    await supabase.from("hotspots").delete().eq("id", id);
    setAllHotspots((h) => h.filter((x) => x.id !== id));
    setSelectedHotspotId(null);
  }

  async function onSceneChange(s: Scene) {
    setScenes((list) => list.map((x) => (x.id === s.id ? s : x)));
    await supabase
      .from("scenes")
      .update({
        name: s.name,
        initial_yaw: s.initial_yaw,
        initial_pitch: s.initial_pitch,
        ambient_audio_url: s.ambient_audio_url ?? null,
        ambient_audio_volume: s.ambient_audio_volume ?? 0.5,
        auto_tour_duration: s.auto_tour_duration ?? null,
      })
      .eq("id", s.id);
  }

  async function onSceneDelete(id: string) {
    if (!confirm("Delete scene?")) return;
    await supabase.from("scenes").delete().eq("id", id);
    setScenes((list) => list.filter((s) => s.id !== id));
    if (activeSceneId === id) {
      const next = scenes.find((s) => s.id !== id);
      setActiveSceneId(next?.id ?? null);
    }
  }

  async function onReorder(from: number, to: number) {
    if (from === to) return;
    const next = [...scenes];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setScenes(next);
    await Promise.all(
      next.map((s, i) =>
        supabase.from("scenes").update({ order_index: i }).eq("id", s.id)
      )
    );
  }

  async function handleSave() {
    if (!tour) return;
    await supabase
      .from("tours")
      .update({ title: tour.title, updated_at: new Date().toISOString() })
      .eq("id", tour.id);
  }

  async function createNavHotspotAt(
    targetSceneId: string,
    clientX: number,
    clientY: number
  ) {
    if (!activeSceneId || !screenToYawPitchRef.current) return;
    if (targetSceneId === activeSceneId) {
      alert("That's the current scene — can't nav to itself.");
      return;
    }
    const yp = screenToYawPitchRef.current(clientX, clientY);
    if (!yp) return;
    const target = scenes.find((s) => s.id === targetSceneId);
    const insert = buildInsert(activeSceneId, yp.yaw, yp.pitch, {
      type: "icon",
      action: "nav",
      target_scene_id: targetSceneId,
      icon_key: "chevron-right",
      label: target ? `Go to ${target.name}` : "Go",
    });
    const { data, error } = await supabase
      .from("hotspots")
      .insert(insert)
      .select()
      .single();
    if (error) return alert(error.message);
    setAllHotspots((h) => [...h, data as Hotspot]);
    setSelectedHotspotId((data as Hotspot).id);
  }

  function fireHotspotAction(h: Hotspot) {
    // Fire sound effect from Web Audio / custom URL
    import("@/lib/soundEffects").then(({ playHotspotSound }) =>
      playHotspotSound(h.sound_effect, h.sound_effect_url)
    );
    const action =
      h.action && h.action !== "none" ? h.action : legacyAction(h.type);
    if (action === "nav" && h.target_scene_id) {
      setActiveSceneId(h.target_scene_id);
    } else if (action === "url" && h.url) {
      window.open(h.url, "_blank");
    } else if (action === "info_popup" || action === "image_popup") {
      setInfoModal(h);
    } else if (action === "video_popup") {
      setVideoModal(h);
    } else if (action === "pdf_popup") {
      setPdfModal(h);
    }
  }

  // Update tour fields in state + DB without reloading the page.
  async function patchTour(fields: Partial<Tour>) {
    setTour((t) => (t ? { ...t, ...fields } : t));
    await supabase.from("tours").update(fields).eq("id", tourId);
  }

  async function handleBackup() {
    setBackingUp(true);
    try {
      const { blob, filename } = await exportTourToBlob(tourId);
      downloadBlob(blob, filename);
    } catch (e) {
      alert(`Backup failed: ${(e as Error).message}`);
    } finally {
      setBackingUp(false);
    }
  }

  async function togglePublish() {
    if (!tour) return;
    const next = !tour.published;
    setTour({ ...tour, published: next });
    await supabase
      .from("tours")
      .update({ published: next })
      .eq("id", tour.id);
  }

  if (!tour) {
    return (
      <div className="min-h-screen grid place-items-center text-neutral-500">
        Loading…
      </div>
    );
  }

  const inPlacementMode = pendingHotspot != null || repositioningId != null;

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <header className="h-12 bg-panel border-b border-border flex items-center px-3 gap-3">
        <Link href="/" className="text-neutral-400 hover:text-white">
          <X size={16} />
        </Link>
        <div className="text-sm font-medium truncate">{tour.title}</div>
        <div className="text-xs text-neutral-500">
          {scenes.length} scene{scenes.length === 1 ? "" : "s"}
        </div>
        <div className="flex-1" />
        <button
          onClick={() => {
            setPreviewMode((v) => !v);
            setPendingHotspot(null);
            setRepositioningId(null);
            setSelectedHotspotId(null);
          }}
          className={`text-xs rounded px-3 py-1.5 flex items-center gap-1 border ${
            previewMode
              ? "bg-cyan-500 text-black border-cyan-500"
              : "bg-panelSoft border-border"
          }`}
          title={previewMode ? "Back to editing" : "Test hotspot actions"}
        >
          {previewMode ? (
            <>
              <Pencil size={12} /> Edit
            </>
          ) : (
            <>
              <Play size={12} /> Preview
            </>
          )}
        </button>
        <Link
          href={`/tour/${tour.id}`}
          target="_blank"
          className="text-xs bg-panelSoft border border-border rounded px-3 py-1.5 flex items-center gap-1"
        >
          <Eye size={12} /> Open
        </Link>
        <button
          onClick={handleBackup}
          disabled={backingUp}
          className="text-xs bg-panelSoft border border-border rounded px-3 py-1.5 flex items-center gap-1 disabled:opacity-50"
          title="Download the entire tour as a .factour backup file"
        >
          <Download size={12} />
          {backingUp ? "Packaging…" : "Backup"}
        </button>
        <button
          onClick={() => setShareOpen(true)}
          className="text-xs bg-panelSoft border border-border rounded px-3 py-1.5 flex items-center gap-1"
        >
          <Share2 size={12} /> Share
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div
          className="flex-1 relative bg-black"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("application/x-scene-id")) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              if (!dragOverPanorama) setDragOverPanorama(true);
            }
          }}
          onDragLeave={(e) => {
            // Only clear when leaving the container itself, not on child transitions
            if (e.currentTarget === e.target) setDragOverPanorama(false);
          }}
          onDrop={(e) => {
            const sceneId = e.dataTransfer.getData("application/x-scene-id");
            setDragOverPanorama(false);
            if (!sceneId) return;
            e.preventDefault();
            createNavHotspotAt(sceneId, e.clientX, e.clientY);
          }}
        >
          {activeScene ? (
            <PanoramaViewer
              imageUrl={publicUrl(activeScene.image_path)}
              hotspots={hotspots}
              editable={!previewMode}
              selectedHotspotId={previewMode ? null : selectedHotspotId}
              mirrored={tour.mirrored ?? false}
              nadirImageUrl={
                tour.nadir_image_path
                  ? publicUrl(tour.nadir_image_path)
                  : null
              }
              nadirSize={tour.nadir_size ?? 25}
              autoRotate={
                previewMode &&
                autoPlaying &&
                !autoTourPaused &&
                (tour.auto_tour_rotate ?? true)
              }
              autoRotateSpeed={tour.auto_tour_rotate_speed ?? 1.5}
              onRequestAim={(g) => (aimGetterRef.current = g)}
              onProvideScreenToYawPitch={(fn) =>
                (screenToYawPitchRef.current = fn)
              }
              onHotspotClick={(h) => {
                if (previewMode) {
                  fireHotspotAction(h);
                } else {
                  setSelectedHotspotId(h.id);
                }
              }}
              onHotspotDoubleClick={(h) => {
                // Double-click in edit mode fires the action for testing
                fireHotspotAction(h);
              }}
              onHotspotDrag={onHotspotDrag}
              initialYaw={activeScene.initial_yaw}
              initialPitch={activeScene.initial_pitch}
            />
          ) : (
            <div className="h-full grid place-items-center text-neutral-500 text-sm">
              No scenes yet.{" "}
              <Link
                href={`/upload?tour=${tour.id}`}
                className="text-accent ml-1"
              >
                Upload one →
              </Link>
            </div>
          )}

          {/* Scene index menu — always visible in the editor so users see
              their settings live while configuring it. */}
          {activeScene && (
            <MenuOverlay
              tour={tour}
              scenes={scenes}
              activeSceneId={activeSceneId}
              onSelectScene={setActiveSceneId}
            />
          )}

          {/* Auto-tour Play/Pause pill — only in Preview + when auto-tour on. */}
          {previewMode && tour.auto_tour_enabled && scenes.length > 1 && (
            <button
              onClick={() => setAutoPlaying((v) => !v)}
              className="absolute top-3 right-3 bg-black/60 hover:bg-black/80 border border-white/20 text-white text-xs px-3 py-2 rounded-full flex items-center gap-1.5 backdrop-blur-sm z-20"
              title={autoPlaying ? "Pause walkthrough" : "Start walkthrough"}
            >
              {autoPlaying ? (
                <>
                  <Pause size={12} /> Pause
                </>
              ) : (
                <>
                  <Play size={12} /> Auto-tour
                </>
              )}
            </button>
          )}

          {dragOverPanorama && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-cyan-500/10 border-2 border-dashed border-cyan-400/70">
              <div className="bg-black/70 text-cyan-200 text-sm px-4 py-2 rounded-full">
                Drop here to create a navigation hotspot
              </div>
            </div>
          )}

          {inPlacementMode && (
            <>
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <Crosshair
                  size={44}
                  className="text-cyan-400 drop-shadow-[0_0_6px_rgba(0,0,0,0.9)]"
                />
              </div>

              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/85 border border-accent text-xs px-3 py-2 rounded flex items-center gap-3">
                <span>
                  {repositioningId
                    ? "Rotate to aim, then click "
                    : "Rotate the panorama to aim, then click "}
                  <span className="text-accent font-medium">
                    {repositioningId ? "Move here" : "Place here"}
                  </span>
                  .
                </span>
                <button
                  onClick={() => {
                    setPendingHotspot(null);
                    setRepositioningId(null);
                  }}
                  className="text-neutral-400 hover:text-white"
                >
                  cancel
                </button>
              </div>

              <button
                onClick={confirmPlacement}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-accent text-black font-medium text-sm px-4 py-2 rounded-full shadow-lg flex items-center gap-2"
              >
                <Check size={16} />
                {repositioningId ? "Move here" : "Place here"}
              </button>
            </>
          )}
        </div>

        <RightPanel
          tour={tour}
          scene={activeScene}
          scenes={scenes}
          selectedHotspot={selectedHotspot}
          allHotspots={allHotspots}
          previewMode={previewMode}
          onEnterEditMode={() => setPreviewMode(false)}
          onPatchTour={patchTour}
          onStartAddHotspot={(d) => {
            setRepositioningId(null);
            setPendingHotspot(d);
          }}
          onStartReposition={(id) => {
            setPendingHotspot(null);
            setRepositioningId(id);
          }}
          onTestAction={fireHotspotAction}
          onHotspotChange={onHotspotChange}
          onHotspotDelete={onHotspotDelete}
          onSceneChange={onSceneChange}
          onSave={handleSave}
          onPublishToggle={togglePublish}
        />
      </div>

      <SceneStrip
        scenes={scenes}
        activeId={activeSceneId}
        onSelect={setActiveSceneId}
        onDelete={onSceneDelete}
        onReorder={onReorder}
        tourId={tour.id}
      />

      {shareOpen && (
        <ShareModal tour={tour} onClose={() => setShareOpen(false)} />
      )}

      {infoModal && (
        <div
          className="fixed inset-0 grid place-items-center bg-black/70 z-40"
          onClick={() => setInfoModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-panel border border-border rounded-lg p-5 max-w-md w-[90%]"
          >
            <h3 className="font-semibold mb-2">
              {infoModal.info_title || infoModal.label || "Info"}
            </h3>
            {(infoModal.action === "image_popup" ||
              infoModal.type === "image") &&
              infoModal.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={infoModal.image_url}
                  alt=""
                  className="mb-2 max-h-64 mx-auto rounded"
                />
              )}
            {infoModal.info_body && (
              <p className="text-sm text-neutral-300 whitespace-pre-wrap">
                {infoModal.info_body}
              </p>
            )}
            <button
              onClick={() => setInfoModal(null)}
              className="mt-4 text-sm bg-accent text-black px-3 py-1.5 rounded"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {videoModal && (
        <MediaVideoModal
          hotspot={videoModal}
          onClose={() => setVideoModal(null)}
        />
      )}

      {pdfModal && (
        <MediaPdfModal
          hotspot={pdfModal}
          onClose={() => setPdfModal(null)}
        />
      )}

    </div>
  );
}

/* ------------------------ Media modals (edit page) ---------------------- */

function MediaVideoModal({
  hotspot,
  onClose,
}: {
  hotspot: Hotspot;
  onClose: () => void;
}) {
  const url = hotspot.video_url ?? "";
  const isYouTube = /youtube\.com|youtu\.be/i.test(url);
  const ytPatterns = [
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
  ];
  let ytId: string | null = null;
  if (isYouTube) {
    for (const re of ytPatterns) {
      const m = url.match(re);
      if (m) {
        ytId = m[1];
        break;
      }
    }
  }
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 grid place-items-center p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-black rounded-lg overflow-hidden shadow-2xl w-[min(880px,80vw)] aspect-video relative"
      >
        <button
          onClick={onClose}
          className="absolute top-2 right-2 z-10 bg-black/60 text-white text-xs rounded-full w-8 h-8 grid place-items-center hover:bg-black/80"
        >
          ✕
        </button>
        {ytId ? (
          <iframe
            src={`https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`}
            className="w-full h-full"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
          />
        ) : url ? (
          <video
            src={url}
            controls
            autoPlay
            controlsList="download"
            className="w-full h-full bg-black"
          />
        ) : (
          <div className="grid place-items-center w-full h-full text-neutral-400 text-sm">
            No video URL set.
          </div>
        )}
      </div>
    </div>
  );
}

function MediaPdfModal({
  hotspot,
  onClose,
}: {
  hotspot: Hotspot;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 grid place-items-center p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-panel rounded-lg overflow-hidden shadow-2xl w-[min(1000px,90vw)] h-[85vh] relative flex flex-col"
      >
        <div className="flex items-center justify-between bg-panel border-b border-border px-3 py-2">
          <div className="text-sm truncate">
            {hotspot.pdf_name || hotspot.label || "Document"}
          </div>
          <button
            onClick={onClose}
            className="text-xs text-neutral-300 hover:text-white"
          >
            ✕
          </button>
        </div>
        {hotspot.pdf_url ? (
          <iframe
            src={hotspot.pdf_url}
            className="flex-1 w-full bg-white"
          />
        ) : (
          <div className="flex-1 grid place-items-center text-neutral-400 text-sm">
            No document URL set on this hotspot.
          </div>
        )}
      </div>
    </div>
  );
}

function legacyAction(t: Hotspot["type"]) {
  switch (t) {
    case "nav":
      return "nav";
    case "url":
      return "url";
    case "info":
      return "info_popup";
    case "image":
      return "image_popup";
    case "video":
      return "video_popup";
    case "pdf":
      return "pdf_popup";
    default:
      return "none";
  }
}
