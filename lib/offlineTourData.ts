"use client";

/**
 * Offline tour-data snapshot store.
 *
 * When a presenter hits "Download" on a tour, we snapshot the full row
 * set — tour, scenes, hotspots — into localStorage under a per-tour
 * key. When the tour player later boots offline (or hits a network
 * error on Supabase reads), it falls back to this snapshot instead of
 * seeing an empty tour.
 *
 * Why not rely purely on the service-worker HTTP cache?
 *   • SW registration is asynchronous — during first-install the SW
 *     may not be controlling the tab when prep runs, so Supabase
 *     fetches slip past uncached.
 *   • Supabase's URL structure is sensitive to param ordering / URL
 *     encoding; a slightly-different URL from the viewer misses the
 *     cache silently.
 *   • Local snapshots are explicit and predictable — same query in the
 *     app, same result offline.
 *
 * localStorage is fine here: a full tour snapshot is ~5–200 KB of JSON.
 * At 10 tours × 200 KB = 2 MB, well inside the 5–10 MB limit.
 */

import type { Hotspot, Scene, Tour } from "@/lib/types";

const KEY_PREFIX = "factour:offline:tourdata:";

export type OfflineTourSnapshot = {
  tour: Tour;
  scenes: Scene[];
  hotspots: Hotspot[];
  savedAt: string;
};

function keyFor(tourId: string): string {
  return `${KEY_PREFIX}${tourId}`;
}

export function saveOfflineTour(snapshot: OfflineTourSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      keyFor(snapshot.tour.id),
      JSON.stringify(snapshot)
    );
  } catch (e) {
    console.warn("[offline-data] save failed:", e);
  }
}

export function loadOfflineTour(tourId: string): OfflineTourSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyFor(tourId));
    if (!raw) return null;
    return JSON.parse(raw) as OfflineTourSnapshot;
  } catch {
    return null;
  }
}

export function removeOfflineTour(tourId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(keyFor(tourId));
  } catch {}
}

export function clearAllOfflineTours(): void {
  if (typeof window === "undefined") return;
  try {
    const drop: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(KEY_PREFIX)) drop.push(k);
    }
    for (const k of drop) window.localStorage.removeItem(k);
  } catch {}
}
