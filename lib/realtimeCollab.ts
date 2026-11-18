"use client";

/**
 * Real-time collaboration on a tour.
 *
 * Wires Supabase Realtime → local React state so every editor sees the
 * same tour data live. One channel per tour, listening to:
 *
 *   • tours    — this tour's row only        (filter id=eq.<tour>)
 *   • scenes   — this tour's scenes only      (filter tour_id=eq.<tour>)
 *   • hotspots — this tour's scenes' hotspots (filter scene_id=in.(…),
 *                in batches of 100 ids, the most Realtime takes per filter)
 *
 * Until Nov 2026 the channel listened to EVERY change to these tables on
 * the whole platform and threw most of them away in the browser. Each
 * editor tab paid for everyone else's edits, and Realtime had to check
 * every change against every subscriber's row-level security.
 *
 * Catching up
 * -----------
 * Realtime only delivers changes while the socket is joined. A laptop lid
 * closed for a minute, a train tunnel, a tab parked in the background, or
 * the re-join when the scene list changes would otherwise lose whatever
 * the other editors did meanwhile, and the screens would quietly drift
 * apart. So `onResync` is called every time the channel (re)joins, when
 * the tab comes back after being hidden, and when the network comes back.
 * The caller re-fetches and merges (see the edit page).
 *
 * Echo prevention is the caller's job: it knows which rows and fields it
 * is still writing (see shouldSkipHotspot and the scene/tour field guards
 * in app/tour/[id]/edit/page.tsx).
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
  /** Re-fetch everything and merge: the channel (re)joined, or the tab /
   *  network came back, so changes may have been missed. */
  onResync?: () => void;
};

/** Realtime accepts at most 100 values in an `in` filter. */
const IN_FILTER_MAX = 100;
/** A tab hidden for longer than this re-fetches when it comes back. */
const RESYNC_AFTER_HIDDEN_MS = 15_000;

/** Subscribe to every change on the given tour. Returns a teardown
 *  function. Re-subscribe (new call) when the SET of scene ids changes,
 *  not on every scene edit: the join itself triggers a resync, which
 *  covers anything that changed in between. */
export function subscribeToTour<H = any, S = any, T = any>(
  tourId: string,
  sceneIds: string[],
  handlers: CollabHandlers<H, S, T>
): () => void {
  if (!tourId) return () => {};

  const sceneSet = new Set(sceneIds);
  // A fresh name per subscription: removeChannel is async, and re-using
  // the name while the old channel is still leaving can drop the new join.
  const channel = supabase.channel(`tour-${tourId}-${Math.random().toString(36).slice(2, 8)}`);

  // --- HOTSPOTS -------------------------------------------------------
  for (let i = 0; i < sceneIds.length; i += IN_FILTER_MAX) {
    const filter = `scene_id=in.(${sceneIds.slice(i, i + IN_FILTER_MAX).join(",")})`;
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "hotspots", filter }, (payload) => {
      const row = payload.new as any;
      if (handlers.shouldSkipHotspot?.(row)) return;
      handlers.onHotspotInsert?.(row);
    });
    channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "hotspots", filter }, (payload) => {
      const row = payload.new as any;
      if (handlers.shouldSkipHotspot?.(row)) return;
      handlers.onHotspotUpdate?.(row);
    });
  }
  // Deletes cannot be filtered server-side (the old row carries only its
  // id), so they arrive unfiltered; an id we do not have is a no-op.
  channel.on("postgres_changes", { event: "DELETE", schema: "public", table: "hotspots" }, (payload) => {
    const row = payload.old as any;
    if (!row?.id) return;
    handlers.onHotspotDelete?.(row.id);
  });

  // --- SCENES ---------------------------------------------------------
  const sceneFilter = `tour_id=eq.${tourId}`;
  channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "scenes", filter: sceneFilter }, (payload) => {
    const row = payload.new as any;
    if (handlers.shouldSkipScene?.(row)) return;
    handlers.onSceneInsert?.(row);
  });
  channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "scenes", filter: sceneFilter }, (payload) => {
    const row = payload.new as any;
    if (handlers.shouldSkipScene?.(row)) return;
    handlers.onSceneUpdate?.(row);
  });
  channel.on("postgres_changes", { event: "DELETE", schema: "public", table: "scenes" }, (payload) => {
    const row = payload.old as any;
    if (!row?.id || !sceneSet.has(row.id)) return;
    handlers.onSceneDelete?.(row.id);
  });

  // --- TOUR ROOT ------------------------------------------------------
  channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "tours", filter: `id=eq.${tourId}` }, (payload) => {
    handlers.onTourUpdate?.(payload.new as any);
  });

  // --- (RE)JOIN, AND CATCHING UP --------------------------------------
  let closed = false;
  let retryTimer: number | null = null;
  let retryDelay = 1_000;
  const resync = () => {
    if (!closed) handlers.onResync?.();
  };
  channel.subscribe((status) => {
    if (closed) return;
    if (status === "SUBSCRIBED") {
      retryDelay = 1_000;
      resync();
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      // The client re-joins on its own when the socket reconnects; this
      // nudges it if it gave up, with a growing pause between tries.
      if (retryTimer != null) return;
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        if (closed) return;
        channel.subscribe();
      }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30_000);
    }
  });

  let hiddenAt = 0;
  const onVisibility = () => {
    if (document.visibilityState === "hidden") hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > RESYNC_AFTER_HIDDEN_MS) {
      hiddenAt = 0;
      resync();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("online", resync);

  return () => {
    closed = true;
    if (retryTimer != null) window.clearTimeout(retryTimer);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("online", resync);
    void supabase.removeChannel(channel);
  };
}
