"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase, publicUrl } from "@/lib/supabase";
import type { Hotspot, Scene, Tour } from "@/lib/types";
import { resolveHotspotFx } from "@/lib/types";
import PanoramaViewer from "@/components/panorama/PanoramaViewer";
import FlatViewer from "@/components/panorama/FlatViewer";
import MenuOverlay from "@/components/viewer/MenuOverlay";
import { playHotspotSound } from "@/lib/soundEffects";
import { useAutoTour } from "@/lib/useAutoTour";
import { Ruler } from "lucide-react";
import { loadOfflineTour } from "@/lib/offlineTourData";
import MeasureTool from "@/components/viewer/MeasureTool";
import { trackEvent, getSessionId } from "@/lib/analytics";
import {
  startPresentationSession,
  savePresentationRecording,
} from "@/lib/presentationSession";
import {
  startRecording,
  isRecordingSupported,
  type ActiveRecorder,
} from "@/lib/presentationRecorder";
import { TranslationProvider, useT } from "@/lib/TranslationContext";
import SubtitleOverlay from "@/components/viewer/SubtitleOverlay";
import ViewerPill from "@/components/viewer/ViewerPill";
import TitleChip from "@/components/viewer/TitleChip";

type Props = {
  tour: Tour;
  scenes: Scene[];
  hideControls?: boolean;
  autoplay?: boolean;
};

/** Map a stored language code to a BCP-47 tag for the speech engine.
 *  Indian locales bias toward -IN which the Web Speech API supports well. */
function bcpForLang(code: string): string {
  const map: Record<string, string> = {
    en: "en-IN",
    hi: "hi-IN",
    mr: "mr-IN",
    gu: "gu-IN",
    ta: "ta-IN",
    te: "te-IN",
    bn: "bn-IN",
    pa: "pa-IN",
  };
  return map[code] ?? "en-IN";
}

/**
 * Public entry — hosts the TranslationProvider so every child can
 * synchronously translate strings via useT(). We fetch hotspots for
 * the whole tour just once (for translation coverage), then hand the
 * inner player its own hotspot state as usual.
 */
export default function TourPlayer(props: Props) {
  const [tourHotspots, setTourHotspots] = useState<Hotspot[]>([]);
  useEffect(() => {
    (async () => {
      const sceneIds = props.scenes.map((s) => s.id);
      if (sceneIds.length === 0) return;
      let rows: Hotspot[] = [];
      try {
        const { data } = await supabase
          .from("hotspots")
          .select("label, info_title, info_body, pdf_name")
          .in("scene_id", sceneIds);
        rows = (data ?? []) as unknown as Hotspot[];
      } catch {
        // network error — fall through to snapshot
      }
      if (rows.length === 0) {
        const snap = loadOfflineTour(props.tour.id);
        if (snap) {
          rows = snap.hotspots.filter((h) =>
            sceneIds.includes(h.scene_id)
          ) as unknown as Hotspot[];
        }
      }
      setTourHotspots(rows);
    })();
  }, [props.scenes, props.tour.id]);

  return (
    <TranslationProvider
      tour={props.tour}
      scenes={props.scenes}
      hotspots={tourHotspots}
    >
      <TourPlayerInner {...props} />
    </TranslationProvider>
  );
}

function TourPlayerInner({
  tour,
  scenes,
  hideControls = false,
  autoplay = false,
}: Props) {
  const { t } = useT();
  const [activeSceneId, setActiveSceneId] = useState<string | null>(
    scenes[0]?.id ?? null
  );

  // Scenes are fetched asynchronously in the parent page, so on first mount
  // this component often receives scenes=[]. When the real list arrives, pick
  // the first scene automatically.
  useEffect(() => {
    if (!activeSceneId && scenes.length > 0) {
      setActiveSceneId(scenes[0].id);
    }
  }, [scenes, activeSceneId]);
  const [allHotspots, setAllHotspots] = useState<Hotspot[]>([]);
  const [infoModal, setInfoModal] = useState<Hotspot | null>(null);
  const [videoModal, setVideoModal] = useState<Hotspot | null>(null);
  const [pdfModal, setPdfModal] = useState<Hotspot | null>(null);
  const [audioPopup, setAudioPopup] = useState<Hotspot | null>(null);
  // Ref for the panorama viewer's zoom-reset function.
  const zoomResetRef = useRef<null | (() => void)>(null);
  // Measure tool state + click-capture promise handoff
  const [measureOn, setMeasureOn] = useState(false);
  // Calibrate can update a scene's camera_height at runtime. `scenes` is a
  // prop so we can't mutate it — store an override keyed by scene id.
  const [heightOverride, setHeightOverride] = useState<Record<string, number>>(
    {}
  );
  const measurePendingRef = useRef<null | ((p: {
    yaw: number;
    pitch: number;
    x: number;
    y: number;
  } | null) => void)>(null);
  const screenToYawPitchRef = useRef<null | ((
    x: number,
    y: number
  ) => { yaw: number; pitch: number } | null)>(null);
  function requestMeasurePoint() {
    return new Promise<{ yaw: number; pitch: number; x: number; y: number } | null>(
      (resolve) => {
        measurePendingRef.current = resolve;
      }
    );
  }

  // Detect the ?fullscreen=1 query flag — set when the editor opens this
  // route in a new tab. If true, we show a close button that ends the tab.
  const isFullscreenTab =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("fullscreen") === "1";
  // Don't count editor previews as real analytics events — otherwise
  // the owner's own testing inflates the numbers.
  const isEditorPreview =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("preview") === "1";
  const analyticsOn = !isEditorPreview;

  // Session boundaries — fires once per tab lifetime.
  useEffect(() => {
    if (!analyticsOn) return;
    trackEvent(tour.id, "session_start");
    const onLeave = () => trackEvent(tour.id, "session_end");
    window.addEventListener("beforeunload", onLeave);
    return () => {
      onLeave();
      window.removeEventListener("beforeunload", onLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.id, analyticsOn]);

  // Presenter capture — GPS location on start, and (if the org enabled
  // auto-record) voice recording + live transcript for the whole session.
  // Only runs for presenter-led sessions (opened with ?presenter=<uid>).
  const [recording, setRecording] = useState(false);
  useEffect(() => {
    if (!analyticsOn || typeof window === "undefined") return;
    const presenterId = new URLSearchParams(window.location.search).get(
      "presenter"
    );
    if (!presenterId) return; // only sales-led sessions are tracked here
    const sessionId = getSessionId();
    const orgId = (tour as unknown as { org_id?: string | null }).org_id ?? null;

    let recorder: ActiveRecorder | null = null;
    let cancelled = false;
    let saved = false;
    let autosaveTimer: number | undefined;

    (async () => {
      // 1) GPS — always, even if recording is off.
      startPresentationSession({
        sessionId,
        tourId: tour.id,
        orgId,
        presenterId,
      }).catch(() => {});

      // 2) Voice — only if the org turned auto-record on.
      if (!orgId || !isRecordingSupported()) return;
      const { data: org } = await supabase
        .from("organizations")
        .select("auto_record")
        .eq("id", orgId)
        .maybeSingle();
      if (cancelled || !(org as { auto_record?: boolean } | null)?.auto_record)
        return;
      try {
        recorder = await startRecording(
          bcpForLang(
            (tour as unknown as { default_language?: string | null })
              .default_language ?? "en"
          )
        );
        if (cancelled) {
          recorder.cancel();
          recorder = null;
          return;
        }
        setRecording(true);
        // Periodic autosave — a presentation tab is usually CLOSED when the
        // presenter is done, which cancels an on-close upload. So we flush
        // the audio + transcript every 20s; whatever was captured up to the
        // last flush survives even an abrupt close.
        autosaveTimer = window.setInterval(() => {
          if (!recorder) return;
          const snap = recorder.snapshot();
          if (snap.durationSec < 3) return;
          savePresentationRecording({
            sessionId,
            blob: snap.blob,
            transcript: snap.transcript,
            durationSec: snap.durationSec,
          }).catch(() => {});
        }, 20000);
      } catch {
        /* mic permission denied — silently continue without recording */
      }
    })();

    async function finalize() {
      if (!recorder || saved) return;
      saved = true;
      if (autosaveTimer) window.clearInterval(autosaveTimer);
      const r = recorder;
      recorder = null;
      setRecording(false);
      try {
        const out = await r.stop();
        await savePresentationRecording({
          sessionId,
          blob: out.blob,
          transcript: out.transcript,
          durationSec: out.durationSec,
        });
      } catch {
        /* best-effort */
      }
    }

    // Save on tab close / navigation away.
    const onHide = () => {
      finalize();
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
      finalize();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.id, analyticsOn]);

  // scene_view — debounced 300ms so auto-tour rapid-fire scene switches
  // collapse into a single event per scene.
  useEffect(() => {
    if (!analyticsOn || !activeSceneId) return;
    trackEvent(
      tour.id,
      "scene_view",
      { scene_id: activeSceneId },
      300
    );
  }, [tour.id, activeSceneId, analyticsOn]);
  const [autoPlaying, setAutoPlaying] = useState(
    autoplay || (tour.auto_tour_enabled ?? false)
  );

  const active = useMemo(
    () => scenes.find((s) => s.id === activeSceneId) ?? null,
    [scenes, activeSceneId]
  );

  // Resolve tour-wide hotspot micro-interaction flags once (default all ON).
  const hotspotFx = useMemo(() => resolveHotspotFx(tour), [tour]);

  useEffect(() => {
    if (!scenes.length) return;
    const sceneIds = scenes.map((s) => s.id);
    (async () => {
      // Try Supabase first. On any failure OR empty result, fall back
      // to the offline snapshot saved by "Download for offline". This
      // is what makes info popups, video hotspots, audio hotspots and
      // every interactive marker keep working end-to-end offline.
      let rows: Hotspot[] = [];
      try {
        const { data } = await supabase
          .from("hotspots")
          .select("*")
          .in("scene_id", sceneIds);
        rows = (data ?? []) as Hotspot[];
      } catch {
        // network error — fall through to snapshot
      }
      if (rows.length === 0) {
        const snap = loadOfflineTour(tour.id);
        if (snap) {
          rows = snap.hotspots.filter((h) => sceneIds.includes(h.scene_id));
          if (rows.length > 0) {
            console.info(
              "[offline] serving hotspots from local snapshot:",
              rows.length
            );
          }
        }
      }
      setAllHotspots(rows);
    })();
  }, [scenes, tour.id]);

  const hotspots = useMemo(
    () =>
      allHotspots.filter((h) => {
        if (h.scene_id === activeSceneId) return true;
        if (!h.is_master) return false;
        const allow = h.master_scene_ids;
        if (allow && allow.length > 0)
          return activeSceneId ? allow.includes(activeSceneId) : false;
        return true;
      }),
    [allHotspots, activeSceneId]
  );

  // Auto-tour is paused whenever any modal is showing (info/video/pdf), so a
  // showcased hotspot's popup blocks the scene from advancing until the user
  // closes it.
  const autoTourPaused =
    !!infoModal || !!videoModal || !!pdfModal;

  useAutoTour({
    playing: autoPlaying && scenes.length > 1,
    paused: autoTourPaused,
    tour,
    scenes,
    activeScene: active,
    hotspots,
    // Auto-tour advances = cinematic fly-through.
    onAdvance: (nextId) =>
      navigateTo(nextId, { cinematic: true, effectOverride: "warp" }),
    onFireHotspot: (h) => {
      onHotspotClick(h);
      const dur = Math.max(1, h.auto_tour_showcase_duration ?? 5) * 1000;
      window.setTimeout(() => {
        setInfoModal(null);
        setVideoModal(null);
        setPdfModal(null);
        setAudioPopup(null);
      }, dur);
    },
  });

  // Ambient audio — tour-level overrides scene-level, so it plays continuously
  // across scene switches.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ambientUrl =
    tour.ambient_audio_url ?? active?.ambient_audio_url ?? null;
  const ambientVolume = tour.ambient_audio_url
    ? tour.ambient_audio_volume ?? 0.5
    : active?.ambient_audio_volume ?? 0.5;
  // Global mute — pauses ambient audio AND hides subtitles. Presenter
  // clicks the speaker icon to silence everything (e.g. during a live
  // walkthrough where they want to talk over the tour instead).
  const [audioMuted, setAudioMuted] = useState(false);
  // Whether the bottom scene-thumbnail strip is hidden (toggled from the
  // pill). Kept per-tab; a fresh tab starts with the strip visible.
  const [stripHidden, setStripHidden] = useState(false);

  // Effect 1: create/destroy the audio element only when URL changes.
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (!ambientUrl) return;
    const a = new Audio(ambientUrl);
    a.loop = true;
    a.volume = Math.max(0, Math.min(1, ambientVolume));
    audioRef.current = a;
    // Broadcast time updates so the SubtitleOverlay (mounted below)
    // can pick the current segment. Fires ~4×/sec while playing.
    const onTime = () => {
      window.dispatchEvent(
        new CustomEvent("factour:audio-time", {
          detail: { currentTime: a.currentTime, url: ambientUrl },
        })
      );
    };
    a.addEventListener("timeupdate", onTime);
    a.play().catch(() => {
      /* browsers may block autoplay until user interaction — silently ignore */
    });
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ambientUrl]);

  // Effect 2: adjust volume in place without restarting playback.
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.max(0, Math.min(1, ambientVolume));
    }
  }, [ambientVolume]);

  // Effect 3: react to the mute toggle. Pause on mute, resume on unmute.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (audioMuted) {
      a.pause();
    } else {
      a.play().catch(() => {});
    }
  }, [audioMuted]);

  // Preload immediate neighbors — any scene reachable via a nav hotspot
  // (per-scene or master) from the active scene. Cached in a Set so we
  // don't refetch. Kills the "black frame" stutter during transition.
  const preloadedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!activeSceneId) return;
    const outgoing = allHotspots.filter(
      (h) =>
        (h.scene_id === activeSceneId || h.is_master) &&
        (h.action === "nav" || h.type === "nav") &&
        h.target_scene_id
    );
    const targetIds = new Set(
      outgoing.map((h) => h.target_scene_id as string).filter(Boolean)
    );
    // Array.from() so the loop compiles under the project's TypeScript
    // target — iterating a Set directly needs ES2015+ / downlevelIteration.
    for (const id of Array.from(targetIds)) {
      if (preloadedRef.current.has(id)) continue;
      const target = scenes.find((s) => s.id === id);
      if (!target) continue;
      const img = new window.Image();
      img.src = publicUrl(target.image_path);
      preloadedRef.current.add(id);
    }
  }, [activeSceneId, allHotspots, scenes]);

  // ---- Scene transition (CSS snapshot overlay) ----
  //
  // Simple, no-wobble, no-WebGL-camera-fighting approach:
  //   1. On nav, grab a snapshot of the current WebGL view (returns a
  //      data-URL PNG via preserveDrawingBuffer).
  //   2. Render the snapshot as an absolute overlay above the canvas.
  //   3. Swap activeSceneId immediately — PanoramaViewer's manual
  //      texture loader keeps the old panorama visible on the main
  //      sphere until the new one loads, and the initial-view useEffect
  //      snaps the camera to the target scene's saved initial view.
  //      Everything under the overlay is invisible to the user.
  //   4. Overlay animates via CSS keyframe — scale grows past the
  //      viewport (stretch), blur ramps up (sides smear), opacity fades
  //      to 0. When it hits 0 the user sees the new scene beneath.
  //   5. onAnimationEnd → overlay unmounts.
  //
  // Cinematic mode = 850ms full stretch-and-blur for nav hotspots.
  // Quick mode    = 280ms subtle crossfade for scene strip / menu.
  //
  // The neighbor-preload effect above warms the browser HTTP cache so
  // the underlying texture swap almost always finishes before the
  // overlay reveals it. If it doesn't, the user sees old scene for a
  // beat under the fading overlay — still smoother than a hard swap.

  const aimGetterRef = useRef<null | (() => {
    yaw: number;
    pitch: number;
  } | null)>(null);
  const snapshotFnRef = useRef<null | (() => string | null)>(null);

  // In-engine WebGL transition. When set, PanoramaViewer keeps rendering
  // the CURRENT scene's sphere and mounts <SceneTransition> which loads
  // the target panorama, runs the real 3D fly-through (camera dolly +
  // FOV whip + alpha crossfade + SLERP to the target scene's initial
  // view), then fires onComplete. We swap activeSceneId only AFTER the
  // fly-through finishes, so the swap is invisible under the opaque
  // target sphere. This is the "billion-dollar" path — a genuine camera
  // move in 3D, not a flat CSS photo scale.
  const [pendingTransition, setPendingTransition] = useState<null | {
    targetSceneId: string;
    targetUrl: string;
    /** true → cinematic dolly + FOV whip (nav hotspots, auto-tour).
     *  false → quick crossfade only (menu / scene strip). */
    cinematic: boolean;
    /** true → cinematic soft-dissolve (independent of warp). Mutually
     *  exclusive with `cinematic`. */
    dissolve: boolean;
    /** true → warp fly-through PLUS animated motion blur (warp_blur mode).
     *  Only meaningful when `cinematic` is true. */
    blur: boolean;
    /** Dolly direction in radians (nav hotspot yaw/pitch). Null = no
     *  directional dolly (dollies along current forward). */
    direction: { yaw: number; pitch: number } | null;
    /** The target scene's saved initial view — the camera SLERPs here so
     *  the landing faces the new scene's "front", never a wrong
     *  intermediate angle. */
    targetAim: { yaw: number; pitch: number } | null;
    durationMs: number;
  }>(null);

  // Colour grading follows whichever scene is BECOMING visible. During an
  // in-engine transition (nav hotspot / auto-tour fly-through) the target
  // panorama is rendered inside the same canvas before activeSceneId swaps,
  // so we grade with the TARGET scene's adjustments for the duration of the
  // fly-through — otherwise a graded scene would look ungraded until the
  // swap lands (the "grading not visible in auto tour" bug). When idle it's
  // just the active scene's grade.
  const activeAdjustments = useMemo(() => {
    const target = pendingTransition
      ? scenes.find((s) => s.id === pendingTransition.targetSceneId)
      : null;
    const src = target || active;
    return (src as any)?.image_adjustments ?? null;
  }, [active, scenes, pendingTransition]);

  const inFlightRef = useRef(false);

  /** Wait for the browser to actually paint the just-committed DOM. Two
   *  rAFs = "paint has happened + one full frame elapsed". Reliable across
   *  browsers for "please show the overlay before I touch WebGL". */
  function nextPaint(): Promise<void> {
    return new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  }

  async function navigateTo(
    sceneId: string,
    opts: {
      /** True → cinematic fly-through (dolly + FOV whip + late SLERP).
       *  Nav-hotspot clicks + auto-tour pass this. Menu / scene-strip
       *  clicks leave it false → a quick crossfade. */
      cinematic?: boolean;
      /** Legacy — the old CSS system distinguished effects by name.
       *  Now the only meaningful split is cinematic vs quick, plus
       *  "instant" to skip animation entirely. We map the old names:
       *  "instant" → no animation; everything else → the in-engine
       *  transition, cinematic when opts.cinematic is set. */
      effectOverride?:
        | "street_view"
        | "fade"
        | "zoom"
        | "slide"
        | "instant"
        | "warp"
        | "dissolve";
      /** Dolly direction (nav hotspot yaw/pitch) so the camera flies
       *  TOWARD the hotspot the user clicked, not just straight ahead. */
      direction?: { yaw: number; pitch: number } | null;
    } = {}
  ) {
    if (sceneId === activeSceneId) return;
    if (inFlightRef.current) return;
    const target = scenes.find((s) => s.id === sceneId);
    if (!target) return;

    // Resolve effect. Explicit override wins, else the tour default.
    const effect =
      opts.effectOverride ?? tour.transition_effect ?? "warp";

    inFlightRef.current = true;

    // FLAT-SCENE PATH — the in-engine WebGL SceneTransition lives inside
    // PanoramaViewer, which is NOT mounted while a flat photo scene is on
    // screen (FlatViewer renders instead). If we kicked off a pending
    // transition here, SceneTransition would never mount, its
    // onComplete would never fire, and inFlightRef would stay stuck —
    // freezing navigation AND auto-tour. So whenever the current or the
    // target scene is flat, do a direct swap (preload first to avoid a
    // blank flash) instead of the 3D fly-through.
    const currentIsFlat = !!active?.is_flat;
    if (effect === "instant" || currentIsFlat || target.is_flat) {
      try {
        const img = new window.Image();
        img.src = publicUrl(target.image_path);
        await img.decode();
      } catch {
        /* proceed */
      }
      setActiveSceneId(sceneId);
      inFlightRef.current = false;
      return;
    }

    // Dissolve is its own cinematic mode (soft cross-dissolve, no dolly).
    // It takes priority over the warp/cinematic path when selected.
    const dissolve = effect === "dissolve";

    // Cinematic (warp/tunnel) when the caller asked for it OR when the
    // effect name is one of the "big" fly-through modes. Quick crossfade
    // otherwise. Dissolve is handled separately and disables cinematic.
    const cinematic =
      !dissolve &&
      (!!opts.cinematic ||
        effect === "warp" ||
        effect === "warp_blur" ||
        effect === "street_view" ||
        effect === "zoom");

    // warp_blur = the exact warp fly-through + an animated motion blur.
    const blur = effect === "warp_blur";

    // Kick off the in-engine transition. PanoramaViewer keeps rendering
    // the CURRENT scene while SceneTransition flies the camera into the
    // target and crossfades. We swap activeSceneId only on completion.
    setPendingTransition({
      targetSceneId: sceneId,
      targetUrl: publicUrl(target.image_path),
      cinematic,
      dissolve,
      blur,
      direction: opts.direction ?? null,
      targetAim: {
        yaw: target.initial_yaw ?? 0,
        pitch: target.initial_pitch ?? 0,
      },
      // Longer, more graceful timings. The old 1150ms cinematic felt
      // rushed once the dolly became visible; ~1.8s lets the fly-through
      // breathe like a real drone move. Dissolve is a touch quicker (~1s)
      // since there's no spatial move to sell.
      durationMs: dissolve ? 1000 : cinematic ? 1800 : 550,
    });
  }

  /** Fired by SceneTransition when the fly-through finishes. At this
   *  moment the target sphere is fully opaque with the target texture
   *  AND the camera is already at the target's initial view, so we can
   *  swap the underlying scene invisibly. We keep the transition sphere
   *  mounted for a couple hundred ms so the main sphere has time to load
   *  its own copy of the texture before we unmount the cover. */
  function handleTransitionComplete() {
    setPendingTransition((pt) => {
      if (!pt) return null;
      setActiveSceneId(pt.targetSceneId);
      // Unmount the transition cover shortly after the swap — long
      // enough for the main sphere's TextureLoader to finish (the image
      // is already in the browser HTTP cache, so this decodes fast). The
      // opaque cover hides the swap + any camera-reset snap underneath.
      window.setTimeout(() => {
        setPendingTransition(null);
        inFlightRef.current = false;
      }, 420);
      // Return the same object so the sphere stays opaque during the gap.
      return pt;
    });
  }

  function onHotspotHover(h: Hotspot) {
    // Analytics — record a meaningful hover (dwell-gated in the viewer).
    // Debounced per hotspot so re-entering the same marker repeatedly in a
    // few seconds doesn't inflate the count.
    if (analyticsOn) {
      trackEvent(
        tour.id,
        "hotspot_hover",
        { scene_id: h.scene_id, hotspot_id: h.id },
        1500
      );
    }
  }

  function onHotspotClick(h: Hotspot) {
    // Analytics — record every hotspot click regardless of action type.
    if (analyticsOn) {
      trackEvent(tour.id, "hotspot_click", {
        scene_id: h.scene_id,
        hotspot_id: h.id,
      });
    }
    // Play sound effect regardless of action
    playHotspotSound(h.sound_effect, h.sound_effect_url);

    // Polygon short-circuit — polygons project video/image ONTO the
    // traced quad. Their MediaQuad has its own click handling (unmute
    // video, fullscreen image). Never open the generic video/image
    // modal for a polygon — that opens a separate window and defeats
    // the "embedded in the scene" effect.
    if (h.type === "polygon") return;

    const action = h.action && h.action !== "none" ? h.action : legacyAction(h);
    if (action === "nav" && h.target_scene_id) {
      // Nav hotspot → cinematic fly-through. The camera dollies TOWARD
      // the hotspot's own yaw/pitch, so it feels like walking through
      // the exact marker you clicked, then SLERPs to face the new
      // scene's front on landing.
      navigateTo(h.target_scene_id, {
        cinematic: true,
        direction: { yaw: h.yaw, pitch: h.pitch },
      });
    } else if (action === "url" && h.url) {
      window.open(h.url, "_blank");
    } else if (action === "info_popup" || action === "image_popup") {
      setInfoModal(h);
    } else if (action === "video_popup") {
      // Virtual card checkbox controls the destination:
      //   checked  → play as a floating window inside the tour (non-blocking)
      //   unchecked → open the source URL in a new browser tab (e.g. YouTube)
      if (h.video_show_thumbnail && h.video_url) {
        setVideoModal(h);
      } else if (h.video_url) {
        window.open(h.video_url, "_blank");
      } else {
        // No URL configured — fall back to the in-tour player so the
        // author sees "no video" rather than nothing happening.
        setVideoModal(h);
      }
    } else if (action === "pdf_popup") {
      setPdfModal(h);
    } else if (action === "audio_popup") {
      setAudioPopup(h);
    }
  }

  if (!active) {
    return (
      <div className="h-full grid place-items-center text-neutral-500">
        This tour has no scenes yet.
      </div>
    );
  }

  // Lookup used by hover-preview cards on nav hotspots so they can show
  // the target scene's name + thumbnail.
  const scenesLookup = useMemo(() => {
    const m = new Map<string, { name: string; thumbnailUrl: string | null }>();
    for (const s of scenes) {
      m.set(s.id, {
        name: s.name,
        thumbnailUrl: publicUrl(s.thumbnail_path ?? s.image_path) ?? null,
      });
    }
    return m;
  }, [scenes]);

  return (
    <div className="h-full w-full flex flex-col bg-black">
      {/* Live-translated subtitles — attaches to whichever source
          (ambient audio, audio hotspot, video hotspot) is currently
          firing time-update events. Hidden when the presenter mutes
          audio via the speaker button below. */}
      {!audioMuted && (
        <SubtitleOverlay
          settings={
            (tour as unknown as { subtitle_settings?: any }).subtitle_settings
          }
          tourId={tour.id}
        />
      )}
      <div className="flex-1 relative">
        {/* Scene container — stays mounted across ALL scene changes.
            PanoramaViewer's manual texture loader keeps the old panorama
            visible until the new one finishes loading, so scene swaps
            don't Suspense-flash a black frame. Removing the key was the
            fix for the "random-angle blink" the user saw at transition
            end: previously, key={activeSceneId} destroyed the WebGL
            Canvas on scene swap and re-created it at the default pose
            for one frame before the initial-view effect settled the
            camera. Now the Canvas persists, initialYaw/initialPitch prop
            changes drive the camera reset silently. */}
        <div className="absolute inset-0">
        {active.is_flat ? (
          <FlatViewer
            imageUrl={publicUrl(active.image_path)}
            adjustments={activeAdjustments}
            hotspots={hotspots}
            onHotspotClick={onHotspotClick}
          />
        ) : (
        <PanoramaViewer
          imageUrl={publicUrl(active.image_path)}
          adjustments={activeAdjustments}
          hotspotFx={hotspotFx}
          idleSpin={tour.fx_idle_spin !== false}
          hotspots={hotspots}
          onHotspotHover={onHotspotHover}
          mirrored={tour.mirrored ?? false}
          hideStitching={active.hide_stitching ?? false}
          hideTripod={active.hide_tripod ?? false}
          tripodSize={active.tripod_size ?? 30}
          scenesLookup={scenesLookup}
          nadirImageUrl={
            tour.nadir_image_path ? publicUrl(tour.nadir_image_path) : null
          }
          nadirSize={tour.nadir_size ?? 25}
          autoRotate={
            autoPlaying &&
            !autoTourPaused &&
            !pendingTransition && // never auto-rotate mid-transition —
            // it fights SceneTransition's camera writes and causes the
            // "glitch/flicker" the user reported during auto-tour swaps.
            (tour.auto_tour_rotate ?? true)
          }
          autoRotateSpeed={tour.auto_tour_rotate_speed ?? 1.5}
          pitchMin={active.pitch_min}
          pitchMax={active.pitch_max}
          yawMin={active.yaw_min}
          yawMax={active.yaw_max}
          levelCorrection={active.level_correction ?? 0}
          zoomMinFov={active.zoom_min_fov ?? 30}
          zoomMaxFov={active.zoom_max_fov ?? 90}
          zoomInitialFov={active.zoom_initial_fov ?? 75}
          zoomSensitivity={active.zoom_sensitivity ?? 1}
          onProvideZoomReset={(fn) => (zoomResetRef.current = fn)}
          onProvideScreenToYawPitch={(fn) => (screenToYawPitchRef.current = fn)}
          onProvideSnapshot={(fn) => (snapshotFnRef.current = fn)}
          onRequestAim={(g) => (aimGetterRef.current = g)}
          onHotspotClick={onHotspotClick}
          initialYaw={active.initial_yaw}
          initialPitch={active.initial_pitch}
          // Real in-engine 3D transition — a genuine camera fly-through
          // (dolly + FOV whip + crossfade + SLERP to the target scene's
          // initial view) rendered inside the WebGL scene. Only mounts
          // while a navigation is in flight.
          transitionTargetUrl={pendingTransition?.targetUrl ?? null}
          transitionCinematic={pendingTransition?.cinematic ?? false}
          transitionDissolve={pendingTransition?.dissolve ?? false}
          transitionBlur={pendingTransition?.blur ?? false}
          transitionDirection={pendingTransition?.direction ?? null}
          transitionTargetAim={pendingTransition?.targetAim ?? null}
          transitionDurationMs={pendingTransition?.durationMs ?? 1150}
          onTransitionComplete={handleTransitionComplete}
        />
        )}

        {/* Transitions are now rendered IN the WebGL scene by
            <SceneTransition> (mounted inside PanoramaViewer via the
            transition* props above) — a real 3D camera fly-through, not
            a flat CSS overlay. The old snapshot-overlay was removed. */}
        </div>

        {/* Measure tool overlay + click intercept */}
        {measureOn && !active.is_flat && (
          <div
            className="absolute inset-0 z-10"
            style={{ cursor: "crosshair" }}
            onClick={(e) => {
              const resolve = measurePendingRef.current;
              if (!resolve || !screenToYawPitchRef.current) return;
              const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
              const yp = screenToYawPitchRef.current(e.clientX, e.clientY);
              if (!yp) {
                resolve(null);
                measurePendingRef.current = null;
                return;
              }
              resolve({
                yaw: yp.yaw,
                pitch: yp.pitch,
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
              });
              measurePendingRef.current = null;
            }}
          />
        )}
        <MeasureTool
          active={measureOn && !active.is_flat}
          onClose={() => setMeasureOn(false)}
          cameraHeight={
            heightOverride[active.id] ?? active.camera_height ?? 1.6
          }
          sceneId={active.id}
          onCameraHeightChange={(h) =>
            setHeightOverride((prev) => ({ ...prev, [active.id]: h }))
          }
          requestPoint={requestMeasurePoint}
        />

        {/* Glass title chip — top-left, collapses on idle, expands on hover. */}
        <TitleChip tourTitle={tour.title} sceneName={active.name} />

        {/* Recording indicator — top-right, collapsed to a small red dot;
            expands to "Recording" on hover. Transparency without clutter. */}
        {recording && (
          <div
            className="group absolute top-4 right-4 z-30 flex items-center gap-1.5 rounded-full bg-white/85 backdrop-blur-xl border border-white/70 text-[11px] font-medium text-rose-600 shadow-[0_8px_22px_-10px_rgba(11,61,145,0.35)] overflow-hidden transition-all duration-300"
            style={{ height: 28 }}
            title="This session is being recorded"
          >
            <span className="w-7 h-7 grid place-items-center shrink-0">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
            </span>
            <span className="max-w-0 group-hover:max-w-[120px] group-hover:pr-3 whitespace-nowrap transition-all duration-300 -ml-1">
              Recording
            </span>
          </div>
        )}

        {/* Consolidated glass control pill — bottom-right. Fans out on
            hover with reset-zoom, auto-tour, language, sound, strip
            visibility, and fullscreen. */}
        <ViewerPill
          onResetZoom={() => zoomResetRef.current?.()}
          autoTour={
            scenes.length > 1
              ? {
                  playing: autoPlaying,
                  onToggle: () => setAutoPlaying((v) => !v),
                }
              : null
          }
          audio={
            ambientUrl ||
            (tour as unknown as { subtitle_settings?: any })
              .subtitle_settings
              ? {
                  muted: audioMuted,
                  onToggle: () => setAudioMuted((v) => !v),
                }
              : null
          }
          stripVisibility={
            !hideControls && scenes.length > 1
              ? {
                  hidden: stripHidden,
                  onToggle: () => setStripHidden((v) => !v),
                }
              : null
          }
        />

        {/* Measure tool toggle — hidden for now (will be reintroduced
            when the calibration UX is finished). The MeasureTool
            component + state are intentionally left in place so we can
            unhide with a single line change. */}
        {false && !active?.is_flat && (
          <button
            onClick={() => setMeasureOn((v) => !v)}
            className={`absolute bottom-3 right-32 border text-xs px-3 py-2 rounded-full flex items-center gap-1.5 backdrop-blur-sm ${
              measureOn
                ? "bg-cyan-500 text-black border-cyan-400"
                : "bg-black/60 hover:bg-black/80 text-white border-white/20"
            }`}
            title="Measure distance on the floor"
          >
            <Ruler size={12} /> {measureOn ? "Ruler on" : "Measure"}
          </button>
        )}

        <MenuOverlay
          tour={tour}
          scenes={scenes}
          activeSceneId={activeSceneId}
          onSelectScene={(id: string) =>
            navigateTo(id, { cinematic: false })
          }
        />
      </div>

      {!hideControls && scenes.length > 1 && (
        /* Grid-rows trick — animates the strip's HEIGHT from 0 → auto with
           a real cubic-bezier ease. Combined with translate+opacity on the
           inner rail gives a proper "slide down + settle" premium feel
           instead of a jarring cut. */
        <div
          aria-hidden={stripHidden}
          className="grid overflow-hidden"
          style={{
            gridTemplateRows: stripHidden ? "0fr" : "1fr",
            transition: "grid-template-rows 380ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          <div className="min-h-0 overflow-hidden">
            <div
              style={{
                transform: stripHidden ? "translateY(8px)" : "translateY(0)",
                opacity: stripHidden ? 0 : 1,
                transition:
                  "transform 380ms cubic-bezier(0.22, 1, 0.36, 1), opacity 240ms ease",
              }}
              className="h-20 bg-white/80 backdrop-blur-xl border-t border-white/60 flex items-center gap-2 px-3 overflow-x-auto panel-scroll"
            >
              {scenes.map((s) => (
                <button
                  key={s.id}
                  onClick={() => navigateTo(s.id, { cinematic: false })}
                  className={`shrink-0 w-24 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                    activeSceneId === s.id
                      ? "border-vpv-blue shadow-[0_6px_18px_-8px_rgba(20,104,216,0.6)]"
                      : "border-vpv-line hover:border-vpv-blue/40"
                  }`}
                  title={s.name}
                  tabIndex={stripHidden ? -1 : 0}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={publicUrl(s.image_path)}
                    alt={s.name}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Info / image popup */}
      {infoModal && (
        <div
          className="absolute inset-0 grid place-items-center bg-black/70 z-10"
          onClick={() => setInfoModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-panel border border-border rounded-lg p-5"
            style={{
              width: `${infoModal.card_size_pct ?? 80}%`,
              maxWidth: "1200px",
            }}
          >
            <h3 className="font-semibold mb-2">
              {t(infoModal.info_title || infoModal.label) || t("Info")}
            </h3>
            {(infoModal.action === "image_popup" ||
              infoModal.type === "image") &&
              infoModal.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={infoModal.image_url}
                  alt=""
                  className="mb-2 mx-auto rounded object-contain"
                  style={{ maxHeight: "70vh", width: "100%" }}
                />
              )}
            {infoModal.info_body && (
              <p className="text-sm text-neutral-300 whitespace-pre-wrap">
                {t(infoModal.info_body)}
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

      {/* Video popup */}
      {videoModal && (
        <VideoModal hotspot={videoModal} onClose={() => setVideoModal(null)} />
      )}

      {/* PDF popup */}
      {pdfModal && (
        <PdfModal hotspot={pdfModal} onClose={() => setPdfModal(null)} />
      )}

      {/* Audio / voice-note mini-player — non-modal, floats bottom-center */}
      {audioPopup && (
        <AudioPlayerPopup
          hotspot={audioPopup}
          onClose={() => setAudioPopup(null)}
        />
      )}

      {/* Polygon fullscreen viewer is now mounted at the root layout
          (components/PolygonFullscreenViewer) so it works everywhere,
          including the editor's Preview mode which doesn't use
          TourPlayer. Nothing needed here. */}
    </div>
  );
}

/* --------------------------- Media popups -------------------------------- */

/** Floating in-tour video player.
 *
 *  Design change (Nov 2026): the video used to be a full-screen modal with
 *  a dark backdrop that blocked all interaction with the tour underneath.
 *  Now it's a compact, draggable, non-blocking window positioned in the
 *  lower-right by default — the panorama stays fully clickable and the
 *  visitor can keep panning / clicking other hotspots while the video plays.
 *
 *  - `card_size_pct` controls the window width as % of viewport (20-150).
 *  - Drag the header to move it around.
 *  - Header × closes; header ⛶ jumps back to the default corner. */
function VideoModal({
  hotspot,
  onClose,
}: {
  hotspot: Hotspot;
  onClose: () => void;
}) {
  const { t } = useT();
  const url = hotspot.video_url ?? "";
  const isYouTube = /youtube\.com|youtu\.be/i.test(url);
  const ytId = isYouTube ? extractYouTubeId(url) : null;
  const sizePct = Math.max(20, Math.min(150, hotspot.card_size_pct ?? 60));

  // Position — offset from bottom-right corner. Persisted per instance only.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  function beginDrag(e: React.PointerEvent) {
    const start = pos ?? { x: 24, y: 24 };
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: start.x,
      origY: start.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onDrag(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    // Note: origin is bottom-right → invert deltas so dragging feels natural.
    setPos({
      x: Math.max(0, d.origX - (e.clientX - d.startX)),
      y: Math.max(0, d.origY - (e.clientY - d.startY)),
    });
  }
  function endDrag(e: React.PointerEvent) {
    dragRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  }

  const currentPos = pos ?? { x: 24, y: 24 };

  return (
    <div
      // Container is a size-0 anchor so it doesn't intercept clicks on the
      // rest of the tour. Only the video card itself accepts pointer events.
      className="fixed inset-0 z-30 pointer-events-none"
    >
      <div
        className="absolute pointer-events-auto bg-black rounded-lg overflow-hidden shadow-2xl border border-white/10"
        style={{
          right: currentPos.x,
          bottom: currentPos.y,
          width: `${sizePct}vw`,
          maxWidth: "min(1600px, 95vw)",
        }}
      >
        {/* Draggable header */}
        <div
          onPointerDown={beginDrag}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="flex items-center justify-between bg-black/85 border-b border-white/10 px-3 py-1.5 cursor-move select-none"
        >
          <div className="text-[12px] text-white/85 truncate flex-1">
            {t(hotspot.label || hotspot.info_title) || t("Video")}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPos(null);
              }}
              className="text-white/70 hover:text-white p-1 rounded hover:bg-white/10"
              title="Reset position"
            >
              ⛶
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="text-white/70 hover:text-white p-1 rounded hover:bg-white/10"
              title="Close video"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="aspect-video bg-black">
          {ytId ? (
            <iframe
              src={`https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`}
              className="w-full h-full"
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
            />
          ) : (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              src={url}
              controls
              autoPlay
              controlsList="download"
              className="w-full h-full bg-black"
              onTimeUpdate={(e) => {
                const el = e.currentTarget;
                window.dispatchEvent(
                  new CustomEvent("factour:audio-time", {
                    detail: { url, currentTime: el.currentTime },
                  })
                );
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname.startsWith("/watch")) return u.searchParams.get("v");
      const parts = u.pathname.split("/");
      const embedIdx = parts.indexOf("embed");
      if (embedIdx >= 0 && parts[embedIdx + 1]) return parts[embedIdx + 1];
    }
  } catch {
    return null;
  }
  return null;
}

/** Floating audio player. Doesn't block the panorama — visitors can still
 *  pan and click other hotspots while a voice note plays. Sits pinned to
 *  the bottom center with a slim glass card and a small close X. */
function AudioPlayerPopup({
  hotspot,
  onClose,
}: {
  hotspot: Hotspot;
  onClose: () => void;
}) {
  const { t } = useT();
  const url = hotspot.audio_url ?? "";
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 bg-black/80 backdrop-blur-md border border-white/10 rounded-full pl-4 pr-2 py-2 shadow-2xl">
        <div className="text-sm text-white/90 max-w-[240px] truncate">
          {t(hotspot.label || hotspot.info_title) || t("Voice note")}
        </div>
        {url ? (
          <audio
            src={url}
            autoPlay
            controls
            className="h-8"
            onTimeUpdate={(e) => {
              const el = e.currentTarget;
              window.dispatchEvent(
                new CustomEvent("factour:audio-time", {
                  detail: { url, currentTime: el.currentTime },
                })
              );
            }}
            style={{ minWidth: 260 }}
          />
        ) : (
          <div className="text-xs text-red-300 px-2">No audio attached</div>
        )}
        <button
          onClick={onClose}
          className="ml-1 w-7 h-7 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white text-sm"
          aria-label="Close audio player"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function legacyAction(h: Hotspot): "none" | "nav" | "info_popup" | "url" | "image_popup" | "video_popup" | "pdf_popup" | "audio_popup" {
  switch (h.type) {
    case "nav": return "nav";
    case "url": return "url";
    case "info": return "info_popup";
    case "image": return "image_popup";
    case "video": return "video_popup";
    case "pdf": return "pdf_popup";
    case "audio": return "audio_popup";
    default: return "none";
  }
}

function PdfModal({ hotspot, onClose }: { hotspot: Hotspot; onClose: () => void }) {
  return (
    <div onClick={onClose} className="fixed inset-0 z-30 bg-black/85 grid place-items-center p-6">
      <div onClick={(e) => e.stopPropagation()} className="bg-panel rounded-lg overflow-hidden shadow-2xl w-[min(1000px,90vw)] h-[85vh] relative flex flex-col">
        <div className="flex items-center justify-between bg-panel border-b border-border px-3 py-2">
          <div className="text-sm truncate">{hotspot.pdf_name || hotspot.label || "Document"}</div>
          <div className="flex items-center gap-2">
            {hotspot.pdf_url && (
              <a href={hotspot.pdf_url} download className="text-xs text-neutral-300 hover:text-white">Download</a>
            )}
            <button onClick={onClose} className="text-xs text-neutral-300 hover:text-white">✕</button>
          </div>
        </div>
        {hotspot.pdf_url ? (
          <iframe src={hotspot.pdf_url} className="flex-1 w-full bg-white" />
        ) : (
          <div className="flex-1 grid place-items-center text-neutral-400 text-sm">No document URL set.</div>
        )}
      </div>
    </div>
  );
}
