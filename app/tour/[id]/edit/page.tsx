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
  ZoomIn,
  Cloud,
  CloudOff,
  Loader2,
  AlertTriangle,
  Undo2,
  Redo2,
  Copy,
  Trash2,
} from "lucide-react";
import { exportTourToBlob, downloadBlob } from "@/lib/backup";
import MenuOverlay from "@/components/viewer/MenuOverlay";
import FlatViewer from "@/components/panorama/FlatViewer";
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
  // Multi-select set — populated by Shift/Ctrl-click. `selectedHotspotId`
  // is always the "primary" (last-clicked) selection; the Set holds the
  // full multi-selection for bulk actions.
  const [selectedHotspotIds, setSelectedHotspotIds] = useState<Set<string>>(
    () => new Set()
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

  // ESC clears any pending selection / placement / reposition so the user has
  // one universal "get me out of this" key.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Don't hijack ESC if a text input has focus
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      ) {
        return;
      }
      setSelectedHotspotId(null);
      setPendingHotspot(null);
      setRepositioningId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
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
  const zoomResetRef = useRef<null | (() => void)>(null);
  const snapshotFnRef = useRef<null | (() => string | null)>(null);
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

  // Lookup for hover-preview cards on nav hotspots in the editor viewer.
  const editScenesLookup = useMemo(() => {
    const m = new Map<string, { name: string; thumbnailUrl: string | null }>();
    for (const s of scenes) {
      m.set(s.id, {
        name: s.name,
        thumbnailUrl: publicUrl(s.thumbnail_path ?? s.image_path) ?? null,
      });
    }
    return m;
  }, [scenes]);

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

  // Polygon draw mode — accumulate points, finish to insert.
  const isDrawingPolygon =
    pendingHotspot?.type === "polygon" && !repositioningId;

  function addPolygonPoint() {
    if (!aimGetterRef.current || !pendingHotspot) return;
    const { yaw, pitch } = aimGetterRef.current();
    const points = [...(pendingHotspot.polygon_points ?? []), { yaw, pitch }];
    setPendingHotspot({ ...pendingHotspot, polygon_points: points });
  }

  async function finishPolygon() {
    if (!pendingHotspot?.polygon_points || !activeSceneId) return;
    const pts = pendingHotspot.polygon_points;
    if (pts.length < 3) {
      alert("A polygon needs at least 3 points.");
      return;
    }
    // Anchor yaw/pitch = centroid of the polygon.
    const cy =
      pts.reduce((s, p) => s + p.yaw, 0) / pts.length;
    const cp =
      pts.reduce((s, p) => s + p.pitch, 0) / pts.length;
    const insert = buildInsert(activeSceneId, cy, cp, pendingHotspot);
    (insert as any).polygon_points = pts;
    (insert as any).polygon_fill_color = pendingHotspot.polygon_fill_color ?? "#22d3ee";
    (insert as any).polygon_stroke_color = pendingHotspot.polygon_stroke_color ?? "#22d3ee";
    (insert as any).polygon_fill_opacity = pendingHotspot.polygon_fill_opacity ?? 0.15;
    (insert as any).polygon_stroke_width = pendingHotspot.polygon_stroke_width ?? 2;
    const { data } = await supabase
      .from("hotspots")
      .insert(insert)
      .select()
      .single();
    if (data) {
      setAllHotspots((list) => [...list, data as Hotspot]);
      setSelectedHotspotId((data as Hotspot).id);
    }
    setPendingHotspot(null);
  }

  // Called by both "Place here" (new) and reposition confirm
  async function confirmPlacement() {
    if (!aimGetterRef.current) return;
    // Polygon path — treat "Place here" as "Add point".
    if (isDrawingPolygon) {
      addPolygonPoint();
      return;
    }
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

  // ---- Save orchestration ----
  //
  // Every edit path (slider drag, dropdown change, button toggle) funnels
  // through onHotspotChange, which:
  //   1) updates local React state synchronously (UI stays 60fps),
  //   2) queues the hotspot in pendingHotspotChangesRef (keyed by id, so
  //      rapid edits collapse to one write per hotspot),
  //   3) resets the 200ms debounce timer that fires flushPendingHotspots().
  //
  // flushPendingHotspots writes every dirty hotspot to Supabase in parallel
  // AND checks each result's .error field — any silent PostgREST failure
  // (missing column, RLS block, type mismatch) is logged and surfaced via
  // the saveState indicator in the top bar. Save / Open / Preview / tab-
  // close all call flushPendingHotspots() so the DB matches the visible
  // state before anyone reads it.
  const pendingHotspotChangesRef = useRef<Map<string, Hotspot>>(new Map());
  const hotspotFlushTimerRef = useRef<number | null>(null);
  const savedIndicatorTimerRef = useRef<number | null>(null);

  /** UI-facing save state — powers the pill in the top bar. */
  type SaveState = "clean" | "dirty" | "saving" | "saved" | "error";
  const [saveState, setSaveState] = useState<SaveState>("clean");
  const [lastSaveError, setLastSaveError] = useState<string | null>(null);

  // ---- Undo / redo (hotspot operations) ----
  //
  // Every mutation records an Op onto the undo stack. Ctrl+Z reverses
  // it (writes to DB + reverts local state); Ctrl+Shift+Z re-applies.
  // Property-change ops are coalesced when they touch the same hotspot
  // in quick succession so a slider drag = one undo unit.
  type HotspotOp =
    | { type: "update"; id: string; before: Hotspot; after: Hotspot }
    | { type: "insert"; after: Hotspot }
    | { type: "delete"; before: Hotspot };
  const undoStackRef = useRef<HotspotOp[]>([]);
  const redoStackRef = useRef<HotspotOp[]>([]);
  const lastOpTimeRef = useRef<number>(0);
  const [historyVersion, setHistoryVersion] = useState(0);
  const canUndo = undoStackRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;

  function pushOp(op: HotspotOp) {
    const now = performance.now();
    const last = undoStackRef.current[undoStackRef.current.length - 1];
    // Coalesce consecutive updates on the same hotspot within 800ms —
    // slider drags and typing shouldn't produce 60 undo entries.
    if (
      last &&
      last.type === "update" &&
      op.type === "update" &&
      last.id === op.id &&
      now - lastOpTimeRef.current < 800
    ) {
      last.after = op.after;
    } else {
      undoStackRef.current.push(op);
      if (undoStackRef.current.length > 50) undoStackRef.current.shift();
    }
    lastOpTimeRef.current = now;
    redoStackRef.current = [];
    setHistoryVersion((v) => v + 1);
  }

  /** Insert a hotspot with the missing-column retry loop so undo of a
   *  delete doesn't blow up if the DB is behind on migrations. Silent
   *  on failure — undo is best-effort by design. */
  async function safeInsertHotspot(h: Hotspot) {
    const working: Record<string, unknown> = { ...h };
    for (let attempt = 0; attempt < 20; attempt++) {
      const { error } = await supabase.from("hotspots").insert(working);
      if (!error) return;
      const match = /Could not find the '([^']+)' column/i.exec(
        error.message
      );
      const missing = match?.[1];
      if (missing && missing in working) {
        console.warn(
          `[undo insert] skipping unknown column "${missing}"`
        );
        delete working[missing];
        continue;
      }
      console.warn("[undo insert] failed:", error.message);
      return;
    }
  }

  async function undo() {
    const op = undoStackRef.current.pop();
    if (!op) return;
    redoStackRef.current.push(op);
    try {
      if (op.type === "update") {
        setAllHotspots((list) =>
          list.map((x) => (x.id === op.id ? op.before : x))
        );
        await saveWithColumnFallback(
          "hotspots",
          hotspotUpdatePayload(op.before),
          op.id,
          "[undo]",
          { silent: true }
        );
      } else if (op.type === "insert") {
        setAllHotspots((list) => list.filter((x) => x.id !== op.after.id));
        if (selectedHotspotId === op.after.id) setSelectedHotspotId(null);
        await supabase.from("hotspots").delete().eq("id", op.after.id);
      } else if (op.type === "delete") {
        setAllHotspots((list) => [...list, op.before]);
        await safeInsertHotspot(op.before);
      }
    } catch (e) {
      // Undo is best-effort — never let a DB hiccup show a "Save failed"
      // banner. Local state was already updated, that's the important bit.
      console.warn("[undo] db write failed:", e);
    }
    setHistoryVersion((v) => v + 1);
  }

  async function redo() {
    const op = redoStackRef.current.pop();
    if (!op) return;
    undoStackRef.current.push(op);
    try {
      if (op.type === "update") {
        setAllHotspots((list) =>
          list.map((x) => (x.id === op.id ? op.after : x))
        );
        await saveWithColumnFallback(
          "hotspots",
          hotspotUpdatePayload(op.after),
          op.id,
          "[redo]",
          { silent: true }
        );
      } else if (op.type === "insert") {
        setAllHotspots((list) => [...list, op.after]);
        await safeInsertHotspot(op.after);
      } else if (op.type === "delete") {
        setAllHotspots((list) => list.filter((x) => x.id !== op.before.id));
        if (selectedHotspotId === op.before.id) setSelectedHotspotId(null);
        await supabase.from("hotspots").delete().eq("id", op.before.id);
      }
    } catch (e) {
      console.warn("[redo] db write failed:", e);
    }
    setHistoryVersion((v) => v + 1);
  }

  // Global keyboard shortcuts: Ctrl+Z / Ctrl+Shift+Z / Ctrl+D / Delete.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (inField) return;
      const cmd = e.ctrlKey || e.metaKey;
      if (cmd && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      } else if (
        (cmd && e.shiftKey && e.key.toLowerCase() === "z") ||
        (cmd && e.key.toLowerCase() === "y")
      ) {
        e.preventDefault();
        redo();
      } else if (cmd && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (selectedHotspotId) duplicateHotspot(selectedHotspotId);
      } else if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedHotspotIds.size > 0
      ) {
        e.preventDefault();
        bulkDeleteSelected();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHotspotId, selectedHotspotIds, historyVersion]);

  /** Build the update payload sent to Supabase for one hotspot. Kept as a
   *  helper so debounced writes and manual flushes stay in lockstep — if a
   *  column is missing from here, saving via either path will silently drop
   *  that field. */
  function hotspotUpdatePayload(h: Hotspot) {
    return {
      // Position + owning scene — MUST be included, otherwise a debounced
      // flush overwrites everything except the position and the user's
      // drag can silently revert if it hasn't reached the DB yet.
      yaw: h.yaw,
      pitch: h.pitch,
      scene_id: h.scene_id,
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
      audio_url: h.audio_url ?? null,
      pdf_url: h.pdf_url ?? null,
      pdf_name: h.pdf_name ?? null,
      sound_effect: h.sound_effect,
      sound_effect_url: h.sound_effect_url,
      auto_tour_showcase: h.auto_tour_showcase ?? false,
      auto_tour_showcase_at: h.auto_tour_showcase_at ?? 3,
      auto_tour_showcase_duration: h.auto_tour_showcase_duration ?? 5,
      flat_x: h.flat_x ?? 0.5,
      flat_y: h.flat_y ?? 0.5,
      scale_on_zoom: h.scale_on_zoom ?? true,
      wall_tilt_yaw: h.wall_tilt_yaw ?? 0,
      wall_tilt_pitch: h.wall_tilt_pitch ?? 0,
      wall_tilt_roll: h.wall_tilt_roll ?? 0,
      video_show_thumbnail: h.video_show_thumbnail ?? false,
      video_thumbnail_url: h.video_thumbnail_url ?? null,
      polygon_points: h.polygon_points ?? null,
      polygon_fill_color: h.polygon_fill_color ?? "#22d3ee",
      polygon_stroke_color: h.polygon_stroke_color ?? "#22d3ee",
      polygon_fill_opacity: h.polygon_fill_opacity ?? 0.15,
      polygon_stroke_width: h.polygon_stroke_width ?? 2,
    };
  }

  /** Cancel the pending debounce, drain the pending map, and write every
   *  dirty hotspot to Supabase in parallel. Awaitable — callers use it to
   *  guarantee the DB is current before they navigate / open / reload.
   *
   *  Every response is checked for `.error`. A single failed row does not
   *  swallow the batch: it's re-queued for the next flush, logged to
   *  console with the exact hotspot id + Supabase message, and surfaced to
   *  the UI via setSaveState("error") + setLastSaveError(...).
   *
   *  Returns a summary so callers (Save / Open) can decide whether to
   *  proceed or block on failure. */
  async function flushPendingHotspots(): Promise<{
    ok: boolean;
    savedCount: number;
    error: string | null;
  }> {
    if (hotspotFlushTimerRef.current != null) {
      window.clearTimeout(hotspotFlushTimerRef.current);
      hotspotFlushTimerRef.current = null;
    }
    const pending = Array.from(pendingHotspotChangesRef.current.values());
    // Optimistically clear — failed rows are re-queued below so a stuck
    // row doesn't block later edits.
    pendingHotspotChangesRef.current.clear();
    if (pending.length === 0) {
      return { ok: true, savedCount: 0, error: null };
    }

    setSaveState("saving");
    setLastSaveError(null);

    // Run all writes in parallel, capture per-row outcome. Each write
    // uses the same column-fallback retry loop as scene saves, so
    // missing-migration columns are silently dropped instead of
    // failing the whole batch.
    const results = await Promise.all(
      pending.map(async (h) => {
        const basePayload = hotspotUpdatePayload(h) as Record<string, unknown>;
        const working = { ...basePayload };
        let lastError: { message: string } | null = null;
        for (let attempt = 0; attempt < 20; attempt++) {
          const { data, error } = await supabase
            .from("hotspots")
            .update(working)
            .eq("id", h.id)
            .select()
            .single();
          if (!error) return { hotspot: h, data, error: null };
          lastError = error;
          const match = /Could not find the '([^']+)' column/i.exec(
            error.message
          );
          const missing = match?.[1];
          if (missing && missing in working) {
            console.warn(
              `[hotspot save] skipping unknown column "${missing}" — ` +
                `DB is behind on migrations.`
            );
            delete working[missing];
            continue;
          }
          break;
        }
        return { hotspot: h, data: null, error: lastError };
      })
    );

    const failed = results.filter((r) => r.error);
    const okCount = results.length - failed.length;

    if (failed.length > 0) {
      // Re-queue failed rows so the next flush retries them, and log
      // exactly what broke — column mismatch, RLS, type issues all show
      // up here with the Postgres message intact.
      for (const f of failed) {
        pendingHotspotChangesRef.current.set(f.hotspot.id, f.hotspot);
        console.error(
          `[save] hotspot ${f.hotspot.id} failed:`,
          f.error?.message,
          "| full error:",
          f.error
        );
      }
      const firstErr = failed[0].error?.message ?? "unknown error";
      const msg =
        failed.length === 1
          ? `Save failed: ${firstErr}`
          : `${failed.length} hotspot(s) failed to save. First: ${firstErr}`;
      setSaveState("error");
      setLastSaveError(msg);
      return { ok: false, savedCount: okCount, error: msg };
    }

    // Success — flash "Saved" for a couple seconds, then settle to "clean"
    // (but only if no new edits landed in the interim).
    console.log(`[save] flushed ${okCount} hotspot(s)`);
    setSaveState("saved");
    if (savedIndicatorTimerRef.current != null) {
      window.clearTimeout(savedIndicatorTimerRef.current);
    }
    savedIndicatorTimerRef.current = window.setTimeout(() => {
      setSaveState((s) => (s === "saved" ? "clean" : s));
    }, 1800);
    return { ok: true, savedCount: okCount, error: null };
  }

  /** Keys we NEVER broadcast in a multi-select edit — position and
   *  ownership. Moving one hotspot shouldn't move every other selected
   *  hotspot to the same coordinates. */
  const NO_BROADCAST_KEYS = new Set<keyof Hotspot>([
    "id",
    "scene_id",
    "yaw",
    "pitch",
    "created_at",
    "flat_x",
    "flat_y",
    "polygon_points",
  ]);

  function onHotspotChange(h: Hotspot) {
    // 0. Record undo op — capture the previous state of this hotspot
    //    so Ctrl+Z can revert. Coalescing is handled in pushOp so
    //    slider drags don't produce 60 undo entries.
    const before = allHotspots.find((x) => x.id === h.id);
    if (before && before !== h) {
      pushOp({ type: "update", id: h.id, before, after: h });
    }

    // Compute the diff patch — which visual props changed on the
    // primary. Used below for multi-select broadcast.
    const patch: Partial<Hotspot> = {};
    if (before) {
      for (const k of Object.keys(h) as (keyof Hotspot)[]) {
        if (NO_BROADCAST_KEYS.has(k)) continue;
        if ((h as any)[k] !== (before as any)[k]) {
          (patch as any)[k] = (h as any)[k];
        }
      }
    }
    const broadcast =
      selectedHotspotIds.size > 1 &&
      selectedHotspotIds.has(h.id) &&
      Object.keys(patch).length > 0;

    // 1. UI update. Broadcast the patch to every other selected hotspot
    //    when multi-select is active — one edit updates all of them.
    setAllHotspots((list) =>
      list.map((x) => {
        if (x.id === h.id) return h;
        if (broadcast && selectedHotspotIds.has(x.id)) {
          const updated = { ...x, ...patch };
          // Record undo op for the sibling change so a single Ctrl+Z
          // reverses the entire bulk edit (loops over all siblings).
          pushOp({ type: "update", id: x.id, before: x, after: updated });
          pendingHotspotChangesRef.current.set(x.id, updated);
          return updated;
        }
        return x;
      })
    );

    // 2. Queue the latest version of the primary for the next flush.
    //    Sibling queues were pushed inside the map above.
    pendingHotspotChangesRef.current.set(h.id, h);
    setSaveState("dirty");

    // 3. Debounce: reset the single global flush timer.
    if (hotspotFlushTimerRef.current != null) {
      window.clearTimeout(hotspotFlushTimerRef.current);
    }
    hotspotFlushTimerRef.current = window.setTimeout(() => {
      // Fire-and-forget auto-save. Errors still surface via saveState.
      flushPendingHotspots();
    }, 200);
  }

  /** Central helper for hotspot selection. Pass modKey=true for
   *  Shift/Ctrl clicks — toggles the id in the multi-select Set.
   *  Plain clicks clear the Set and set a single primary selection. */
  function selectHotspot(id: string | null, modKey = false) {
    if (id == null) {
      setSelectedHotspotId(null);
      setSelectedHotspotIds(new Set());
      return;
    }
    if (modKey) {
      setSelectedHotspotIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        // Include the current primary so Shift-click extends selection.
        if (selectedHotspotId && !next.has(selectedHotspotId)) {
          next.add(selectedHotspotId);
        }
        return next;
      });
      setSelectedHotspotId(id);
    } else {
      setSelectedHotspotId(id);
      setSelectedHotspotIds(new Set());
    }
  }

  // Track modifier keys so hotspot onClick (which is called without an
  // event object) can detect Shift/Ctrl for multi-select.
  const modKeyRef = useRef({ shift: false, ctrl: false });
  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (e.key === "Shift") modKeyRef.current.shift = true;
      if (e.key === "Control" || e.key === "Meta")
        modKeyRef.current.ctrl = true;
    }
    function up(e: KeyboardEvent) {
      if (e.key === "Shift") modKeyRef.current.shift = false;
      if (e.key === "Control" || e.key === "Meta")
        modKeyRef.current.ctrl = false;
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Safety net: if the user closes the tab mid-edit, at least try to fire
  // the pending writes. beforeunload can't await async work reliably, but
  // Supabase's PostgREST calls are effectively fire-and-forget over the
  // wire so the request usually makes it.
  useEffect(() => {
    const handler = () => {
      if (pendingHotspotChangesRef.current.size > 0) {
        flushPendingHotspots();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Position drag — routes through onHotspotChange so it goes through
   *  the same queue + debounced flush path as every other edit.
   *  Previously this fired throttled direct DB writes that could lose
   *  the drop position if the user clicked Save + Open before the write
   *  completed. Now the drop position is guaranteed to be part of the
   *  next flush, and handleSave awaits that flush before opening. */
  function onHotspotDrag(id: string, yaw: number, pitch: number) {
    const current = allHotspots.find((h) => h.id === id);
    if (!current) return;
    onHotspotChange({ ...current, yaw, pitch });
  }
  // Force-flush on pointerup so the final drop position hits the DB
  // within a single frame — no waiting for the 200ms debounce to expire.
  useEffect(() => {
    function onUp() {
      if (pendingHotspotChangesRef.current.size > 0) {
        flushPendingHotspots();
      }
    }
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onHotspotDelete(id: string) {
    const before = allHotspots.find((h) => h.id === id);
    await supabase.from("hotspots").delete().eq("id", id);
    setAllHotspots((h) => h.filter((x) => x.id !== id));
    setSelectedHotspotId(null);
    // Record the delete so it can be undone.
    if (before) pushOp({ type: "delete", before });
  }

  /** Delete every hotspot currently in the multi-selection Set (plus
   *  the primary single selection if it's not already in the Set).
   *  Confirms once when more than one is affected. */
  async function bulkDeleteSelected() {
    const ids = new Set(selectedHotspotIds);
    if (selectedHotspotId) ids.add(selectedHotspotId);
    if (ids.size === 0) return;
    if (
      ids.size > 1 &&
      !confirm(`Delete ${ids.size} hotspots? Undo works after.`)
    ) {
      return;
    }
    const toDelete = allHotspots.filter((h) => ids.has(h.id));
    // Record ops so bulk delete is undoable (one op per hotspot).
    for (const h of toDelete) pushOp({ type: "delete", before: h });
    setAllHotspots((list) => list.filter((h) => !ids.has(h.id)));
    setSelectedHotspotId(null);
    setSelectedHotspotIds(new Set());
    // Fire the DB deletes in parallel.
    await supabase
      .from("hotspots")
      .delete()
      .in("id", Array.from(ids));
  }

  /** Duplicate one hotspot — inserts a copy with a small yaw offset so
   *  it doesn't sit directly on top of the source. New hotspot is
   *  auto-selected. Op is recorded so Ctrl+Z removes it. */
  async function duplicateHotspot(id: string) {
    const src = allHotspots.find((h) => h.id === id);
    if (!src) return;
    // Strip id + created_at + apply small yaw offset (0.1 rad ≈ 5.7°)
    // so the copy is visible next to the original.
    const {
      id: _id,
      created_at: _c,
      ...rest
    } = src as Hotspot & { id: string; created_at: string };
    void _id;
    void _c;
    const insert = { ...rest, yaw: (src.yaw ?? 0) + 0.1 };
    const { data, error } = await supabase
      .from("hotspots")
      .insert(insert)
      .select()
      .single();
    if (error) {
      console.error("[duplicate hotspot]", error);
      alert(`Duplicate failed: ${error.message}`);
      return;
    }
    const copy = data as Hotspot;
    setAllHotspots((list) => [...list, copy]);
    setSelectedHotspotId(copy.id);
    pushOp({ type: "insert", after: copy });
  }

  async function onSceneChange(s: Scene) {
    setScenes((list) => list.map((x) => (x.id === s.id ? s : x)));
    const fullPayload: Record<string, unknown> = {
      name: s.name,
      initial_yaw: s.initial_yaw,
      initial_pitch: s.initial_pitch,
      ambient_audio_url: s.ambient_audio_url ?? null,
      ambient_audio_volume: s.ambient_audio_volume ?? 0.5,
      auto_tour_duration: s.auto_tour_duration ?? null,
      pitch_min: s.pitch_min,
      pitch_max: s.pitch_max,
      yaw_min: s.yaw_min,
      yaw_max: s.yaw_max,
      level_correction: s.level_correction ?? 0,
      zoom_min_fov: s.zoom_min_fov ?? 30,
      zoom_max_fov: s.zoom_max_fov ?? 90,
      zoom_initial_fov: s.zoom_initial_fov ?? 75,
      zoom_sensitivity: s.zoom_sensitivity ?? 1,
      image_path: s.image_path,
      thumbnail_path: s.thumbnail_path ?? null,
      is_flat: s.is_flat ?? false,
      hide_stitching: s.hide_stitching ?? false,
      hide_tripod: s.hide_tripod ?? false,
      tripod_size: s.tripod_size ?? 30,
      camera_height: s.camera_height ?? 1.6,
      folder: s.folder ?? null,
    };
    await saveWithColumnFallback("scenes", fullPayload, s.id, "[scene save]");
  }

  /** Self-healing update helper: sends the whole payload, and if
   *  Supabase returns a "could not find the 'X' column in the schema
   *  cache" error, drops that column and retries. Loops until success
   *  or an unrecoverable error. Fixes the "user hasn't run migration
   *  N" class of bugs without blocking every save behind an alert. */
  async function saveWithColumnFallback(
    table: "scenes" | "tours" | "hotspots",
    payload: Record<string, unknown>,
    id: string,
    tag: string,
    opts: { silent?: boolean } = {}
  ) {
    const working = { ...payload };
    for (let attempt = 0; attempt < 20; attempt++) {
      const { error } = await supabase
        .from(table)
        .update(working)
        .eq("id", id);
      if (!error) {
        if (attempt > 0 && !opts.silent) setSaveState("saved");
        return;
      }
      // Parse missing column from the Postgres / PostgREST message.
      const match = /Could not find the '([^']+)' column/i.exec(
        error.message
      );
      const missing = match?.[1];
      if (missing && missing in working) {
        console.warn(
          `${tag} skipping unknown column "${missing}" — DB is behind ` +
            `on migrations. Re-run supabase/schema.sql to restore it.`
        );
        delete working[missing];
        continue;
      }
      // Not a missing-column error — surface it unless caller asked us
      // to stay quiet (undo/redo is best-effort and shouldn't set the
      // top-bar Save Failed banner).
      console.error(tag, id, error);
      if (!opts.silent) {
        setSaveState("error");
        setLastSaveError(`Save failed: ${error.message}`);
      }
      return;
    }
    // Ran out of retry attempts.
    console.error(tag, id, "gave up after 20 column-fallback retries");
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
    // Drain any pending debounced hotspot edits FIRST so the DB matches
    // what the user is looking at before we bump updated_at.
    const result = await flushPendingHotspots();
    if (!result.ok) {
      alert(
        `Save failed.\n\n${result.error}\n\n` +
          `Open the browser console (F12) for details. ` +
          `If the error mentions a missing column, the DB is behind — ` +
          `run the latest supabase/schema.sql in the Supabase SQL Editor.`
      );
      return;
    }
    const { error } = await supabase
      .from("tours")
      .update({ title: tour.title, updated_at: new Date().toISOString() })
      .eq("id", tour.id);
    if (error) {
      console.error("[save] tour update failed:", error);
      setSaveState("error");
      setLastSaveError(`Tour save failed: ${error.message}`);
      alert(`Tour save failed: ${error.message}`);
    }
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
      // No auto-label — user adds their own if they want one. Auto-labels
      // went stale when the scene was renamed (still showed old filename).
      label: null,
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
    <div className="h-screen flex flex-col overflow-hidden bg-chrome">
      <header className="h-12 bg-chrome border-b border-border flex items-center px-3 gap-2 text-[13px] relative">
        {/* Left: nav */}
        <Link
          href="/"
          className="p-1.5 text-neutral-400 hover:text-white rounded"
          title="Back to dashboard"
        >
          <X size={16} />
        </Link>
        <div className="min-w-0 flex items-baseline gap-2">
          <div className="text-[13px] font-medium truncate">{tour.title}</div>
          <div className="text-3xs text-neutral-500 uppercase tracking-wider">
            {scenes.length} scene{scenes.length === 1 ? "" : "s"}
          </div>
        </div>

        {/* Center: brand mark */}
        <Link
          href="/"
          className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 font-semibold text-[15px] tracking-tight text-white hover:opacity-90"
        >
          <Pencil size={14} className="text-accent" />
          Factory Tour
        </Link>

        <div className="flex-1" />

        {/* Right: actions */}
        <button
          onClick={async () => {
            // Flush before toggling — Preview reads from local state so
            // this isn't strictly required, but doing it here means the
            // user can trust "Preview" as a definitive checkpoint.
            await flushPendingHotspots();
            setPreviewMode((v) => !v);
            setPendingHotspot(null);
            setRepositioningId(null);
            setSelectedHotspotId(null);
          }}
          className={`chip ${previewMode ? "active" : ""}`}
          title={previewMode ? "Back to editing" : "Test hotspot actions"}
        >
          {previewMode ? (
            <>
              <Pencil size={11} /> Edit
            </>
          ) : (
            <>
              <Play size={11} /> Preview
            </>
          )}
        </button>
        <button
          onClick={async () => {
            // Flush pending edits BEFORE opening the new tab. The viewer
            // fetches fresh from the DB, so if the debounce hasn't fired
            // yet the new tab would show a stale hotspot state.
            const result = await flushPendingHotspots();
            if (!result.ok) {
              const proceed = confirm(
                `Some changes couldn't be saved:\n\n${result.error}\n\n` +
                  `Open anyway? (New tab will show the older DB state.)`
              );
              if (!proceed) return;
            }
            window.open(`/tour/${tour.id}?preview=1`, "_blank");
          }}
          className="chip"
          title="Open the viewer (editor preview — bypasses privacy gate)"
        >
          <Eye size={11} /> Open
        </button>
        <button
          onClick={handleBackup}
          disabled={backingUp}
          className="chip disabled:opacity-50"
          title="Download the entire tour as a .factour backup file"
        >
          <Download size={11} />
          {backingUp ? "Packaging…" : "Backup"}
        </button>
        {/* Undo / redo / duplicate — history for hotspot edits.
            Ctrl+Z, Ctrl+Shift+Z (or Ctrl+Y), Ctrl+D keyboard shortcuts
            also work. Buttons show enabled/disabled state from the
            stacks. */}
        <button
          onClick={() => undo()}
          disabled={!canUndo}
          className="chip disabled:opacity-30"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 size={11} />
        </button>
        <button
          onClick={() => redo()}
          disabled={!canRedo}
          className="chip disabled:opacity-30"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 size={11} />
        </button>
        <button
          onClick={() =>
            selectedHotspotId && duplicateHotspot(selectedHotspotId)
          }
          disabled={!selectedHotspotId}
          className="chip disabled:opacity-30"
          title="Duplicate selected hotspot (Ctrl+D)"
        >
          <Copy size={11} />
        </button>
        {/* Multi-select bulk-delete. Compact icon-plus-count chip so it
            doesn't push against the centered "Factory Tour" brand. */}
        {selectedHotspotIds.size > 1 && (
          <button
            onClick={() => bulkDeleteSelected()}
            className="shrink-0 flex items-center gap-1 px-1.5 py-1 rounded border border-red-500/50 bg-red-500/15 text-red-300 text-[11px] font-medium hover:bg-red-500/25 transition-colors"
            title={`Delete ${selectedHotspotIds.size} selected hotspots (Delete key)`}
          >
            <Trash2 size={11} />
            {selectedHotspotIds.size}
          </button>
        )}
        {/* Live save status — the single source of truth for "did my edits
            persist". Clicking forces a flush so the user always has a way
            to trigger + verify a save without hunting for the SAVE button
            in the right panel. */}
        <SaveStatePill
          state={saveState}
          error={lastSaveError}
          onForceSave={handleSave}
        />
        <button
          onClick={() => setShareOpen(true)}
          className="flex items-center gap-1.5 bg-accent hover:bg-accentHover text-black font-medium px-3 py-1.5 rounded text-[11px] transition-colors"
        >
          <Share2 size={11} /> Share
        </button>
        <Link
          href="/"
          className="ml-1 text-neutral-500 hover:text-white p-1.5 rounded"
          title="Close editor"
        >
          <X size={16} />
        </Link>
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
          {activeScene && activeScene.is_flat ? (
            <FlatViewer
              imageUrl={publicUrl(activeScene.image_path)}
              hotspots={hotspots}
              editable={!previewMode}
              selectedHotspotId={previewMode ? null : selectedHotspotId}
              selectedHotspotIds={
                previewMode ? null : selectedHotspotIds
              }
              pendingHotspot={pendingHotspot}
              onPlace={(x, y) => {
                if (!pendingHotspot || !activeSceneId) return;
                const insert = buildInsert(
                  activeSceneId,
                  0,
                  0,
                  pendingHotspot
                );
                (insert as Record<string, unknown>).flat_x = x;
                (insert as Record<string, unknown>).flat_y = y;
                supabase
                  .from("hotspots")
                  .insert(insert)
                  .select()
                  .single()
                  .then(({ data, error }) => {
                    if (error) return alert(error.message);
                    setAllHotspots((h) => [...h, data as Hotspot]);
                    setSelectedHotspotId((data as Hotspot).id);
                    setPendingHotspot(null);
                  });
              }}
              onHotspotClick={(h) => {
                if (previewMode) {
                  fireHotspotAction(h);
                } else {
                  selectHotspot(
                    h.id,
                    modKeyRef.current.shift || modKeyRef.current.ctrl
                  );
                }
              }}
              onHotspotDoubleClick={(h) => fireHotspotAction(h)}
              onHotspotDrag={(id, x, y) => {
                // Live UI update — no DB write here.
                setAllHotspots((list) =>
                  list.map((h) =>
                    h.id === id ? { ...h, flat_x: x, flat_y: y } : h
                  )
                );
              }}
              onHotspotDragEnd={(id, x, y) => {
                // Force-persist the FINAL position on release so nothing is
                // lost to a throttle window.
                setAllHotspots((list) =>
                  list.map((h) =>
                    h.id === id ? { ...h, flat_x: x, flat_y: y } : h
                  )
                );
                supabase
                  .from("hotspots")
                  .update({ flat_x: x, flat_y: y })
                  .eq("id", id);
              }}
            />
          ) : activeScene ? (
            <PanoramaViewer
              imageUrl={publicUrl(activeScene.image_path)}
              hotspots={hotspots}
              editable={!previewMode}
              selectedHotspotId={previewMode ? null : selectedHotspotId}
              selectedHotspotIds={
                previewMode ? null : selectedHotspotIds
              }
              mirrored={tour.mirrored ?? false}
              hideStitching={activeScene.hide_stitching ?? false}
              hideTripod={activeScene.hide_tripod ?? false}
              tripodSize={activeScene.tripod_size ?? 30}
              scenesLookup={editScenesLookup}
              onProvideSnapshot={(fn) => (snapshotFnRef.current = fn)}
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
              pitchMin={activeScene.pitch_min}
              pitchMax={activeScene.pitch_max}
              yawMin={activeScene.yaw_min}
              yawMax={activeScene.yaw_max}
              levelCorrection={activeScene.level_correction ?? 0}
              zoomMinFov={activeScene.zoom_min_fov ?? 30}
              zoomMaxFov={activeScene.zoom_max_fov ?? 90}
              zoomInitialFov={activeScene.zoom_initial_fov ?? 75}
              zoomSensitivity={activeScene.zoom_sensitivity ?? 1}
              onProvideZoomReset={(fn) => (zoomResetRef.current = fn)}
              onRequestAim={(g) => (aimGetterRef.current = g)}
              onProvideScreenToYawPitch={(fn) =>
                (screenToYawPitchRef.current = fn)
              }
              onHotspotClick={(h) => {
                if (previewMode) {
                  fireHotspotAction(h);
                } else {
                  selectHotspot(
                    h.id,
                    modKeyRef.current.shift || modKeyRef.current.ctrl
                  );
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

          {/* Reset zoom — bottom-right, always available */}
          <button
            onClick={() => zoomResetRef.current?.()}
            className="absolute bottom-3 right-3 z-20 bg-black/60 hover:bg-black/80 border border-white/20 text-white text-xs px-3 py-2 rounded-full flex items-center gap-1.5 backdrop-blur-sm"
            title="Reset zoom to default"
          >
            <ZoomIn size={12} /> Reset zoom
          </button>

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

              {isDrawingPolygon ? (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
                  <button
                    onClick={addPolygonPoint}
                    className="bg-cyan-500 text-black font-medium text-sm px-4 py-2 rounded-full shadow-lg flex items-center gap-2"
                  >
                    <Check size={16} />
                    Add point ({pendingHotspot?.polygon_points?.length ?? 0})
                  </button>
                  <button
                    onClick={finishPolygon}
                    disabled={
                      (pendingHotspot?.polygon_points?.length ?? 0) < 3
                    }
                    className="bg-accent text-black font-medium text-sm px-4 py-2 rounded-full shadow-lg flex items-center gap-2 disabled:opacity-40"
                  >
                    Finish polygon
                  </button>
                </div>
              ) : (
                <button
                  onClick={confirmPlacement}
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-accent text-black font-medium text-sm px-4 py-2 rounded-full shadow-lg flex items-center gap-2"
                >
                  <Check size={16} />
                  {repositioningId ? "Move here" : "Place here"}
                </button>
              )}
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
          getCurrentAim={() => aimGetterRef.current?.() ?? null}
          getSnapshot={() => snapshotFnRef.current?.() ?? null}
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
          onHotspotDuplicate={duplicateHotspot}
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

/* ------------------------ Save state pill (top bar) --------------------- */

/** Single visual source of truth for "did my edits persist". Colour + icon
 *  reflect the live save state driven by the edit page's flushPendingHotspots
 *  results. Clicking always triggers a manual save so the user has a way to
 *  force + verify a write without hunting for the SAVE button. */
function SaveStatePill({
  state,
  error,
  onForceSave,
}: {
  state: "clean" | "dirty" | "saving" | "saved" | "error";
  error: string | null;
  onForceSave: () => void;
}) {
  const config = (() => {
    switch (state) {
      case "clean":
        return {
          icon: <Cloud size={11} />,
          text: "Saved",
          cls: "border-border text-neutral-400",
          title: "All changes saved",
        };
      case "dirty":
        return {
          icon: <CloudOff size={11} />,
          text: "Unsaved",
          cls: "border-amber-500/60 text-amber-300 bg-amber-500/10",
          title: "You have unsaved edits — click to save now",
        };
      case "saving":
        return {
          icon: <Loader2 size={11} className="animate-spin" />,
          text: "Saving…",
          cls: "border-cyan-500/60 text-cyan-300 bg-cyan-500/10",
          title: "Writing to database",
        };
      case "saved":
        return {
          icon: <Check size={11} />,
          text: "Saved",
          cls: "border-emerald-500/60 text-emerald-300 bg-emerald-500/10",
          title: "Save successful",
        };
      case "error":
        return {
          icon: <AlertTriangle size={11} />,
          text: "Save failed",
          cls: "border-red-500/60 text-red-300 bg-red-500/10",
          title: error ?? "Save failed — click to retry",
        };
    }
  })();

  return (
    <button
      onClick={onForceSave}
      className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] transition-colors ${config.cls}`}
      title={config.title}
    >
      {config.icon}
      <span>{config.text}</span>
    </button>
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
    for (const re  of [/youtu\.be\/([^?&#]+)/, /[?&]v=([^&#]+)/, /\/embed\/([^?&#]+)/]) {
      const m = url.match(re);
      if (m) { ytId = m[1]; break; }
    }
  }
  const modalPos = "fixed inset-0 z-50 bg-black/85 grid place-items-center p-6";
  return (
    <div onClick={onClose} className={modalPos}>
      <div onClick={(e) => e.stopPropagation()} className="bg-panel rounded-lg overflow-hidden shadow-2xl w-[min(1000px,90vw)] aspect-video relative">
        <button onClick={onClose} className="absolute top-2 right-2 z-10 bg-black/60 hover:bg-black/80 text-white text-xs px-2 py-1 rounded">✕</button>
        {ytId ? (
          <iframe src={`https://www.youtube.com/embed/${ytId}?autoplay=1`} className="w-full h-full" allow="autoplay; encrypted-media" allowFullScreen />
        ) : url ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={url} controls autoPlay className="w-full h-full bg-black" />
        ) : (
          <div className="grid place-items-center w-full h-full text-neutral-400 text-sm">No video URL set.</div>
        )}
      </div>
    </div>
  );
}

function MediaPdfModal({ hotspot, onClose }: { hotspot: Hotspot; onClose: () => void }) {
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/85 grid place-items-center p-6">
      <div onClick={(e) => e.stopPropagation()} className="bg-panel rounded-lg overflow-hidden shadow-2xl w-[min(1000px,90vw)] h-[85vh] relative flex flex-col">
        <div className="flex items-center justify-between bg-panel border-b border-border px-3 py-2">
          <div className="text-sm truncate">{hotspot.pdf_name || hotspot.label || "Document"}</div>
          <button onClick={onClose} className="text-xs text-neutral-300 hover:text-white">✕</button>
        </div>
        {hotspot.pdf_url ? (
          <iframe src={hotspot.pdf_url} className="flex-1 w-full bg-white" />
        ) : (
          <div className="flex-1 grid place-items-center text-neutral-400 text-sm">No document URL set on this hotspot.</div>
        )}
      </div>
    </div>
  );
}

function legacyAction(t: Hotspot["type"]) {
  switch (t) {
    case "nav": return "nav";
    case "url": return "url";
    case "info": return "info_popup";
    case "image": return "image_popup";
    case "video": return "video_popup";
    case "pdf": return "pdf_popup";
    default: return "none";
  }
}
