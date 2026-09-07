"use client";

/**
 * Sticky hotspot style — "last-used style becomes the default".
 *
 * When a user tweaks a hotspot's colour / size / icon tint / animation
 * / etc, those visual properties are remembered per-tour in
 * localStorage. Any hotspot placed AFTER that will start out with the
 * same style — no toolbar, no clipboard, no clicks.
 *
 * We deliberately only remember VISUAL properties. Position, target
 * scene, text content, media URLs, master flags and behavioural fields
 * (auto-tour, wall tilt, polygon points) stay unique per hotspot.
 */

import type { Hotspot } from "@/lib/types";

/** The exact fields we consider "style" — every field a user might want
 *  matched across sibling hotspots WITHOUT it feeling weird. */
export const STICKY_STYLE_KEYS = [
  "color",
  "size",
  "icon_tint",
  "width_pct",
  "height_pct",
  "link_wh",
  "opacity",
  "rotation_deg",
  "label_color",
  "label_size",
  "label_bold",
  "label_font",
  "label_bg",
  "only_hover",
  "shadow",
  "animation",
  "overlay_mode",
  "sound_effect",
  "scale_on_zoom",
  "polygon_fill_color",
  "polygon_stroke_color",
  "polygon_fill_opacity",
  "polygon_stroke_width",
  "card_size_pct",
  "thumbnail_size_pct",
  "ripple_color",
  "ripple_size_pct",
] as const satisfies readonly (keyof Hotspot)[];

export type StickyStyle = Partial<Pick<Hotspot, (typeof STICKY_STYLE_KEYS)[number]>>;

/** localStorage key. Scoped per tour so different tours can have
 *  different sticky styles (a "showroom" tour vs a "factory floor"
 *  tour naturally want different palettes). */
function keyFor(tourId: string): string {
  return `factour:hotspotStyle:${tourId}`;
}

/** Extract only the sticky-style-relevant fields from a full Hotspot. */
export function extractStyle(h: Partial<Hotspot>): StickyStyle {
  const out: StickyStyle = {};
  for (const k of STICKY_STYLE_KEYS) {
    if (h[k] !== undefined) {
      (out as any)[k] = h[k];
    }
  }
  return out;
}

/** Persist the given hotspot's style as the sticky default for this tour. */
export function saveStickyStyle(tourId: string, h: Partial<Hotspot>): void {
  if (typeof window === "undefined") return;
  try {
    const style = extractStyle(h);
    window.localStorage.setItem(keyFor(tourId), JSON.stringify(style));
  } catch {
    // localStorage disabled / quota — silently skip. Sticky style is
    // a UX nicety, not correctness-critical.
  }
}

/** Load the sticky style for this tour. Returns {} on first use, on
 *  storage failure, or when the stored JSON is corrupted. */
export function loadStickyStyle(tourId: string): StickyStyle {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(keyFor(tourId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    // Whitelist known keys — protects against a stale localStorage
    // blob from an older build carrying keys we no longer use.
    const clean: StickyStyle = {};
    for (const k of STICKY_STYLE_KEYS) {
      if (parsed[k] !== undefined) (clean as any)[k] = parsed[k];
    }
    return clean;
  } catch {
    return {};
  }
}

/** Clear sticky style (used when the user wants factory defaults back). */
export function clearStickyStyle(tourId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(keyFor(tourId));
  } catch {}
}
