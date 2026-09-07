"use client";

/**
 * Sticky hotspot style + manual copy/paste clipboard.
 *
 * Two features live here:
 *   1. Sticky style — the last-used visual props on a hotspot become
 *      the default for the next hotspot placed in the same tour.
 *      Persisted in localStorage per tour. Zero UI.
 *   2. Manual clipboard — user copies a hotspot's style, picks which
 *      groups (colour / size / label / effects / polygon / sound) to
 *      paste onto another hotspot. Two clicks + a checklist.
 *
 * Both are governed by a single global toggle
 * (`factour:hotspotStyle:enabled`), remembered across every project
 * and every refresh.
 */

import type { Hotspot } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Style field whitelist                                              */
/* ------------------------------------------------------------------ */

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

/** Human-readable groups shown in the Paste-style picker. Keeping
 *  these in one place means the modal never needs updating when the
 *  Hotspot shape gains a new visual property. */
export const STYLE_GROUPS: {
  key: string;
  label: string;
  hint: string;
  keys: readonly (typeof STICKY_STYLE_KEYS)[number][];
}[] = [
  {
    key: "color",
    label: "Colour & tint",
    hint: "Marker colour, icon tint, opacity, ripple colour",
    keys: ["color", "icon_tint", "opacity", "ripple_color"],
  },
  {
    key: "size",
    label: "Size & dimensions",
    hint: "Width, height, aspect lock, rotation, base size, ripple radius",
    keys: [
      "size",
      "width_pct",
      "height_pct",
      "link_wh",
      "rotation_deg",
      "ripple_size_pct",
    ],
  },
  {
    key: "label",
    label: "Label styling",
    hint: "Text colour, size, weight, font, background",
    keys: ["label_color", "label_size", "label_bold", "label_font", "label_bg"],
  },
  {
    key: "effects",
    label: "Effects & behavior",
    hint: "Shadow, animation, hover-only, world-scaling, overlay mode",
    keys: ["shadow", "animation", "only_hover", "scale_on_zoom", "overlay_mode"],
  },
  {
    key: "polygon",
    label: "Polygon fill & stroke",
    hint: "Fill colour, stroke colour, opacity, stroke width",
    keys: [
      "polygon_fill_color",
      "polygon_stroke_color",
      "polygon_fill_opacity",
      "polygon_stroke_width",
    ],
  },
  {
    key: "sound_media",
    label: "Sound & media size",
    hint: "Click sound preset, popup card size, thumbnail size",
    keys: ["sound_effect", "card_size_pct", "thumbnail_size_pct"],
  },
];

/* ------------------------------------------------------------------ */
/* localStorage keys                                                  */
/* ------------------------------------------------------------------ */

const ENABLED_KEY = "factour:hotspotStyle:enabled";
const CLIPBOARD_KEY = "factour:hotspotStyle:clipboard";

function stickyKeyFor(tourId: string): string {
  return `factour:hotspotStyle:${tourId}`;
}

/* ------------------------------------------------------------------ */
/* Global toggle — remembered across every project                    */
/* ------------------------------------------------------------------ */

/** Default ON. Only becomes false when the user explicitly disables. */
export function isStickyStyleEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(ENABLED_KEY);
    return raw !== "false";
  } catch {
    return true;
  }
}

export function setStickyStyleEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ENABLED_KEY, on ? "true" : "false");
  } catch {}
}

/* ------------------------------------------------------------------ */
/* Sticky style (per-tour, auto)                                      */
/* ------------------------------------------------------------------ */

export function extractStyle(h: Partial<Hotspot>): StickyStyle {
  const out: StickyStyle = {};
  for (const k of STICKY_STYLE_KEYS) {
    if (h[k] !== undefined) (out as any)[k] = h[k];
  }
  return out;
}

export function saveStickyStyle(tourId: string, h: Partial<Hotspot>): void {
  if (typeof window === "undefined") return;
  if (!isStickyStyleEnabled()) return; // respect global opt-out
  try {
    const style = extractStyle(h);
    window.localStorage.setItem(stickyKeyFor(tourId), JSON.stringify(style));
  } catch {}
}

export function loadStickyStyle(tourId: string): StickyStyle {
  if (typeof window === "undefined") return {};
  if (!isStickyStyleEnabled()) return {}; // opt-out kills auto-inherit
  try {
    const raw = window.localStorage.getItem(stickyKeyFor(tourId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const clean: StickyStyle = {};
    for (const k of STICKY_STYLE_KEYS) {
      if (parsed[k] !== undefined) (clean as any)[k] = parsed[k];
    }
    return clean;
  } catch {
    return {};
  }
}

export function clearStickyStyle(tourId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(stickyKeyFor(tourId));
  } catch {}
}

/* ------------------------------------------------------------------ */
/* Manual clipboard (per user, cross-tour, cross-refresh)             */
/* ------------------------------------------------------------------ */

/** Snapshot every whitelisted style field on this hotspot into the
 *  clipboard. Cross-tour and cross-refresh — a user can copy in
 *  tour A and paste in tour B on the same browser. */
export function writeClipboardStyle(h: Partial<Hotspot>): void {
  if (typeof window === "undefined") return;
  try {
    const style = extractStyle(h);
    window.localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(style));
  } catch {}
}

export function readClipboardStyle(): StickyStyle | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CLIPBOARD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const clean: StickyStyle = {};
    for (const k of STICKY_STYLE_KEYS) {
      if (parsed[k] !== undefined) (clean as any)[k] = parsed[k];
    }
    return Object.keys(clean).length ? clean : null;
  } catch {
    return null;
  }
}

export function clearClipboardStyle(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CLIPBOARD_KEY);
  } catch {}
}

/** Apply the selected style groups from `clip` onto `target`, returning
 *  a new Hotspot object. Fields outside the picked groups are
 *  untouched — position, media URLs, label text, and everything else
 *  the user did NOT ask to overwrite. */
export function applyClipboardToHotspot(
  target: Hotspot,
  clip: StickyStyle,
  pickedGroupKeys: Set<string>
): Hotspot {
  const patch: StickyStyle = {};
  for (const g of STYLE_GROUPS) {
    if (!pickedGroupKeys.has(g.key)) continue;
    for (const k of g.keys) {
      if (clip[k] !== undefined) (patch as any)[k] = clip[k];
    }
  }
  return { ...target, ...patch };
}
