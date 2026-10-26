/**
 * Shared auto-tour playback engine.
 *
 * - Advances scenes on a per-scene timer (with a global default fallback).
 * - Schedules "showcase" hotspots at their configured offsets within a scene.
 * - Camera auto-rotate speed / on-off is derived from tour settings.
 * - Anything that opens a modal (info popup, video, PDF) can flip `paused` on;
 *   the engine freezes remaining time and resumes cleanly on close.
 * - Loop or stop at last scene, based on tour.auto_tour_loop.
 */

import { useEffect, useRef } from "react";
import type { Hotspot, Scene, Tour } from "./types";

export function sceneDuration(scene: Scene | null, tour: Tour): number {
  if (!scene) return tour.auto_tour_interval ?? 6;
  const per = scene.auto_tour_duration;
  return per && per > 0 ? per : tour.auto_tour_interval ?? 6;
}

export function useAutoTour({
  playing,
  paused,
  tour,
  scenes,
  activeScene,
  hotspots,
  onAdvance,
  onFireHotspot,
}: {
  playing: boolean;
  paused: boolean;
  tour: Tour;
  scenes: Scene[];
  activeScene: Scene | null;
  hotspots: Hotspot[]; // hotspots visible in the ACTIVE scene
  onAdvance: (nextSceneId: string) => void;
  onFireHotspot: (h: Hotspot) => void;
}) {
  // Remaining ms on the scene end timer (used across pause/resume)
  const remainingRef = useRef<number>(0);
  // Track which showcase hotspots we've already fired so we don't refire on resume
  const firedIdsRef = useRef<Set<string>>(new Set());

  // Reset counters whenever the scene changes
  useEffect(() => {
    remainingRef.current = 0;
    firedIdsRef.current = new Set();
  }, [activeScene?.id]);

  // Main timer effect — runs when we're actively playing (not paused)
  useEffect(() => {
    if (!playing || paused || !activeScene) return;

    const duration = sceneDuration(activeScene, tour) * 1000;
    if (!remainingRef.current) remainingRef.current = duration;

    const start = Date.now();

    // Schedule the "advance to next scene" timer
    const endTimer = setTimeout(() => {
      // pick next
      const idx = scenes.findIndex((s) => s.id === activeScene.id);
      if (idx < 0) return;
      const isLast = idx === scenes.length - 1;
      if (isLast && !tour.auto_tour_loop) return; // stop at last scene
      const next = scenes[(idx + 1) % scenes.length];
      onAdvance(next.id);
    }, remainingRef.current);

    // Schedule each unfired showcase hotspot
    const consumed = duration - remainingRef.current; // ms already elapsed in this scene
    const showcaseTimers = hotspots
      .filter(
        (h) =>
          h.auto_tour_showcase &&
          !firedIdsRef.current.has(h.id)
      )
      .map((h) => {
        const at = (h.auto_tour_showcase_at ?? 3) * 1000; // absolute ms from scene start
        const delay = Math.max(0, at - consumed);
        return setTimeout(() => {
          firedIdsRef.current.add(h.id);
          onFireHotspot(h);
        }, delay);
      });

    return () => {
      clearTimeout(endTimer);
      showcaseTimers.forEach(clearTimeout);
      // Persist how much of the scene is left when we tear down (pause)
      remainingRef.current = Math.max(
        0,
        remainingRef.current - (Date.now() - start)
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, paused, activeScene?.id]);
}
