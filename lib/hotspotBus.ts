"use client";

/**
 * Global "which hotspot is currently open" bus.
 *
 * Any premium hotspot renderer (info, person, media, nav-preview) subscribes.
 * When one opens, it announces its ID; every other subscriber whose ID
 * doesn't match closes itself. Guarantees only one expanded card at a time
 * — matching the premium UX principle "at any moment the visitor has a
 * single focused conversation, not a wall of open panels".
 *
 * Also broadcasts `null` when everything should close (e.g. click-outside,
 * scene change, Escape).
 */

type Listener = (openId: string | null) => void;

const listeners = new Set<Listener>();
let currentOpen: string | null = null;

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Announce that the hotspot with `id` is now open. All other hotspots
 *  receive the notification and close themselves. */
export function announceOpen(id: string) {
  currentOpen = id;
  listeners.forEach((l) => l(id));
}

/** Close everything — click-outside, Escape, scene change. */
export function closeAll() {
  currentOpen = null;
  listeners.forEach((l) => l(null));
}

export function getCurrentOpen() {
  return currentOpen;
}
