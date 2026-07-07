"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase, publicUrl } from "@/lib/supabase";
import type { Hotspot, Scene, Tour } from "@/lib/types";
import PanoramaViewer from "@/components/panorama/PanoramaViewer";
import MenuOverlay from "@/components/viewer/MenuOverlay";
import { playHotspotSound } from "@/lib/soundEffects";
import { useAutoTour } from "@/lib/useAutoTour";
import { Play, Pause, Minimize2 } from "lucide-react";

type Props = {
  tour: Tour;
  scenes: Scene[];
  hideControls?: boolean;
  autoplay?: boolean;
};

export default function TourPlayer({
  tour,
  scenes,
  hideControls = false,
  autoplay = false,
}: Props) {
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
  // Detect the ?fullscreen=1 query flag — set when the editor opens this
  // route in a new tab. If true, we show a close button that ends the tab.
  const isFullscreenTab =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("fullscreen") === "1";
  const [autoPlaying, setAutoPlaying] = useState(
    autoplay || (tour.auto_tour_enabled ?? false)
  );

  const active = useMemo(
    () => scenes.find((s) => s.id === activeSceneId) ?? null,
    [scenes, activeSceneId]
  );

  useEffect(() => {
    if (!scenes.length) return;
    const sceneIds = scenes.map((s) => s.id);
    supabase
      .from("hotspots")
      .select("*")
      .in("scene_id", sceneIds)
      .then(({ data }) => setAllHotspots((data ?? []) as Hotspot[]));
  }, [scenes]);

  const hotspots = useMemo(
    () =>
      allHotspots.filter(
        (h) => h.scene_id === activeSceneId || h.is_master
      ),
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
    onAdvance: (nextId) => setActiveSceneId(nextId),
    onFireHotspot: (h) => {
      onHotspotClick(h);
      const dur = Math.max(1, h.auto_tour_showcase_duration ?? 5) * 1000;
      window.setTimeout(() => {
        setInfoModal(null);
        setVideoModal(null);
        setPdfModal(null);
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
    a.play().catch(() => {
      /* browsers may block autoplay until user interaction — silently ignore */
    });
    return () => {
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

  function onHotspotClick(h: Hotspot) {
    // Play sound effect regardless of action
    playHotspotSound(h.sound_effect, h.sound_effect_url);

    const action = h.action && h.action !== "none" ? h.action : legacyAction(h);
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

  if (!active) {
    return (
      <div className="h-full grid place-items-center text-neutral-500">
        This tour has no scenes yet.
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-black">
      <div className="flex-1 relative">
        <PanoramaViewer
          imageUrl={publicUrl(active.image_path)}
          hotspots={hotspots}
          mirrored={tour.mirrored ?? false}
          nadirImageUrl={
            tour.nadir_image_path ? publicUrl(tour.nadir_image_path) : null
          }
          nadirSize={tour.nadir_size ?? 25}
          autoRotate={
            autoPlaying &&
            !autoTourPaused &&
            (tour.auto_tour_rotate ?? true)
          }
          autoRotateSpeed={tour.auto_tour_rotate_speed ?? 1.5}
          onHotspotClick={onHotspotClick}
          initialYaw={active.initial_yaw}
          initialPitch={active.initial_pitch}
        />

        <div className="absolute top-3 left-3 text-white text-sm font-medium bg-black/50 px-3 py-1 rounded">
          {tour.title} · {active.name}
        </div>

        {/* Auto-tour play/pause */}
        {scenes.length > 1 && (
          <button
            onClick={() => setAutoPlaying((v) => !v)}
            className={`absolute right-3 bg-black/60 hover:bg-black/80 border border-white/20 text-white text-xs px-3 py-2 rounded-full flex items-center gap-1.5 backdrop-blur-sm ${
              isFullscreenTab ? "top-16" : "top-3"
            }`}
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

        {/* Exit fullscreen — closes this tab, returns user to the editor. */}
        {isFullscreenTab && (
          <button
            onClick={() => window.close()}
            className="absolute top-3 right-3 bg-black/70 hover:bg-black/85 border border-white/25 text-white text-xs px-3 py-2 rounded-full flex items-center gap-1.5 backdrop-blur-sm"
            title="Exit fullscreen (close this tab)"
          >
            <Minimize2 size={12} /> Exit fullscreen
          </button>
        )}

        <MenuOverlay
          tour={tour}
          scenes={scenes}
          activeSceneId={activeSceneId}
          onSelectScene={setActiveSceneId}
        />
      </div>

      {!hideControls && scenes.length > 1 && (
        <div className="h-20 bg-black/80 border-t border-neutral-800 flex items-center gap-2 px-3 overflow-x-auto panel-scroll">
          {scenes.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSceneId(s.id)}
              className={`shrink-0 w-24 h-14 rounded overflow-hidden border-2 ${
                activeSceneId === s.id
                  ? "border-accent"
                  : "border-transparent"
              }`}
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
      )}

      {/* Info / image popup */}
      {infoModal && (
        <div
          className="absolute inset-0 grid place-items-center bg-black/70 z-10"
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

      {/* Video popup */}
      {videoModal && (
        <VideoModal hotspot={videoModal} onClose={() => setVideoModal(null)} />
      )}

      {/* PDF popup */}
      {pdfModal && (
        <PdfModal hotspot={pdfModal} onClose={() => setPdfModal(null)} />
      )}
    </div>
  );
}

/* --------------------------- Media popups -------------------------------- */

function VideoModal({
  hotspot,
  onClose,
}: {
  hotspot: Hotspot;
  onClose: () => void;
}) {
  const url = hotspot.video_url ?? "";
  const isYouTube = /youtube\.com|youtu\.be/i.test(url);
  const ytId = isYouTube ? extractYouTubeId(url) : null;
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-30 bg-black/85 grid place-items-center p-6"
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
        ) : (
          <video
            src={url}
            controls
            autoPlay
            controlsList="download"
            className="w-full h-full bg-black"
          />
        )}
      </div>
      {hotspot.label && (
        <div className="mt-3 text-white text-sm">{hotspot.label}</div>
      )}
    </div>
  );
}

function PdfModal({
  hotspot,
  onClose,
}: {
  hotspot: Hotspot;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-30 bg-black/85 grid place-items-center p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-panel rounded-lg overflow-hidden shadow-2xl w-[min(1000px,90vw)] h-[85vh] relative flex flex-col"
      >
        <div className="flex items-center justify-between bg-panel border-b border-border px-3 py-2">
          <div className="text-sm truncate">
            {hotspot.pdf_name || hotspot.label || "Document"}
          </div>
          <div className="flex items-center gap-2">
            {hotspot.pdf_url && (
              <a
                href={hotspot.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs bg-accent text-black px-2 py-1 rounded"
              >
                Open in tab
              </a>
            )}
            <button
              onClick={onClose}
              className="text-xs text-neutral-300 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>
        {hotspot.pdf_url ? (
          <iframe src={hotspot.pdf_url} className="flex-1 w-full bg-white" />
        ) : (
          <div className="flex-1 grid place-items-center text-neutral-400 text-sm">
            No document URL set on this hotspot.
          </div>
        )}
      </div>
    </div>
  );
}

/** Extract 11-char YouTube video ID from various URL forms. */
function extractYouTubeId(url: string): string | null {
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

/** map legacy type to an action for backwards compat */
function legacyAction(h: Hotspot) {
  switch (h.type) {
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
