"use client";

/**
 * Real-time collaboration on a tour.
 *
 * Wires Supabase Realtime → local React state so every editor sees the
 * same tour data in real time. Three subscriptions per tour:
 *
 *   • hotspots — INSERT / UPDATE / DELETE across every scene in the tour
 *   • scenes   — same, plus scene reorder events
 *   • tours    — top-level settings changes
 *
 * Echo prevention
 * ---------------
 * Every write from THIS client passes through the parent's own
 * "pending changes" ref. When a realtime event arrives, if the row is
 * currently in that ref (unsaved local edit) we skip it — the ref is
 * canonical, and applying the DB echo would undo the presenter's
 * in-flight change.
 *
 * All hot-path work is done in the callback; the caller owns the state
 * setters. This module has no React dependency other than passing
 * strings around, keeping it easy to unit-test later.
 */

import { supabase } from "@/lib/supabase";

export type CollabHandlers<H, S, T> = {
  onHotspotInsert?: (row: H) => void;
  onHotspotUpdate?: (row: H) => void;
  onHotspotDelete?: (id: string) => void;
  onSceneInsert?: (row: S) => void;
  onSceneUpdate?: (row: S) => void;
  onSceneDelete?: (id: string) => void;
  onTourUpdate?: (row: T) => void;
  /** Return true to SKIP applying a hotspot event (echo prevention). */
  shouldSkipHotspot?: (row: any) => boolean;
  /** Return true to SKIP applying a scene event. */
  shouldSkipScene?: (row: any) => boolean;
};

/** Subscribe to every change on the given tour. Returns a teardown
 *  function that removes every channel. Safe to call from useEffect
 *  with `tourId` as the dep — the returned fn detaches cleanly. */
export function subscribeToTour<H = any, S = any, T = any>(
  tourId: string,
  sceneIds: string[],
  handlers: CollabHandlers<H, S, T>
): () => void {
  if (!tourId) return () => {};

  const channel = supabase.channel(`tour-${tourId}`);

  // --- HOTSPOTS -------------------------------------------------------
  // We can't filter on "scene_id in (…)" server-side, but we get every
  // hotspot change and filter locally against sceneIds. sceneIds may
  // grow if a scene is added; caller re-subscribes when scenes change.
  channel.on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "hotspots" },
    (payload) => {
      const row = payload.new as any;
      if (!sceneIds.includes(row.scene_id)) return;
      if (handlers.shouldSkipHotspot?.(row)) return;
      handlers.onHotspotInsert?.(row);
    }
  );
  channel.on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "hotspots" },
    (payload) => {
      const row = payload.new as any;
      if (!sceneIds.includes(row.scene_id)) return;
      if (handlers.shouldSkipHotspot?.(row)) return;
      handlers.onHotspotUpdate?.(row);
    }
  );
  channel.on(
    "postgres_changes",
    { event: "DELETE", schema: "public", table: "hotspots" },
    (payload) => {
      const row = payload.old as any;
      if (!row?.id) return;
      handlers.onHotspotDelete?.(row.id);
    }
  );

  // --- SCENES ---------------------------------------------------------
  channel.on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "scenes" },
    (payload) => {
      const row = payload.new as any;
      if (row.tour_id !== tourId) return;
      if (handlers.shouldSkipScene?.(row)) return;
      handlers.onSceneInsert?.(row);
    }
  );
  channel.on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "scenes" },
    (payload) => {
      const row = payload.new as any;
      if (row.tour_id !== tourId) return;
      if (handlers.shouldSkipScene?.(row)) return;
      handlers.onSceneUpdate?.(row);
    }
  );
  channel.on(
    "postgres_changes",
    { event: "DELETE", schema: "public", table: "scenes" },
    (payload) => {
      const row = payload.old as any;
      if (!row?.id) return;
      handlers.onSceneDelete?.(row.id);
    }
  );

  // --- TOUR ROOT ------------------------------------------------------
  channel.on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "tours" },
    (payload) => {
      const row = payload.new as any;
      if (row.id !== tourId) return;
      handlers.onTourUpdate?.(row);
    }
  );

  channel.subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
