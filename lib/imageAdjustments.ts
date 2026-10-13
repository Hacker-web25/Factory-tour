"use client";

/**
 * Scene image adjustments — Photoshop/Lightroom-style colour grading
 * applied live to the panorama in both the editor and the public viewer.
 *
 * Implementation: GPU-composited CSS `filter` on the WebGL canvas plus
 * three blended overlay layers (temperature, vignette, gradient). This
 * gives real-time, 60fps preview with zero shader plumbing, and the
 * values persist per-scene in the `image_adjustments` jsonb column.
 *
 * Everything is expressed as plain numbers so the value can be stored,
 * copied between scenes, and interpolated later if we ever animate it.
 */

export type ImageAdjustments = {
  /** 0.3–1.8, 1 = neutral. CSS brightness(). */
  exposure: number;
  /** 0.5–1.6, 1 = neutral. CSS contrast(). */
  contrast: number;
  /** 0–2, 1 = neutral. CSS saturate(). */
  saturation: number;
  /** -100..100, 0 = neutral. Warm (orange) ↔ cool (blue) overlay. */
  warmth: number;
  /** -100..100, 0 = neutral. Hue rotate (green ↔ magenta shift). */
  tint: number;
  /** 0–8 px. CSS blur() — for artistic softening. */
  blur: number;
  /** 0–100. Darkened edges via radial gradient overlay. */
  vignette: number;
  /** Optional graduated colour wash (e.g. warm the sky, cool the floor). */
  gradientEnabled: boolean;
  gradientColor: string; // hex
  gradientOpacity: number; // 0–1
  gradientAngle: number; // deg, 180 = top→bottom
};

export const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  exposure: 1,
  contrast: 1,
  saturation: 1,
  warmth: 0,
  tint: 0,
  blur: 0,
  vignette: 0,
  gradientEnabled: false,
  gradientColor: "#000000",
  gradientOpacity: 0.3,
  gradientAngle: 180,
};

/** Merge stored (possibly partial / null) adjustments over the defaults
 *  so old scenes and new fields never break. */
export function normalizeAdjustments(
  raw: Partial<ImageAdjustments> | null | undefined
): ImageAdjustments {
  if (!raw) return { ...DEFAULT_ADJUSTMENTS };
  return { ...DEFAULT_ADJUSTMENTS, ...raw };
}

/** True when the scene has any non-neutral adjustment — lets callers
 *  skip rendering overlay layers entirely when nothing is set. */
export function hasAdjustments(a: ImageAdjustments): boolean {
  return (
    a.exposure !== 1 ||
    a.contrast !== 1 ||
    a.saturation !== 1 ||
    a.warmth !== 0 ||
    a.tint !== 0 ||
    a.blur !== 0 ||
    a.vignette !== 0 ||
    a.gradientEnabled
  );
}

/** Build the CSS `filter` string for the WebGL canvas. Covers the
 *  operations CSS does natively + accurately: brightness, contrast,
 *  saturation, hue (tint), blur. Warmth + vignette + gradient are
 *  handled by overlay layers below. */
export function buildFilterCSS(a: ImageAdjustments): string {
  const parts: string[] = [];
  if (a.exposure !== 1) parts.push(`brightness(${a.exposure})`);
  if (a.contrast !== 1) parts.push(`contrast(${a.contrast})`);
  if (a.saturation !== 1) parts.push(`saturate(${a.saturation})`);
  if (a.tint !== 0) parts.push(`hue-rotate(${(a.tint * 0.6).toFixed(1)}deg)`);
  if (a.blur !== 0) parts.push(`blur(${a.blur}px)`);
  return parts.length ? parts.join(" ") : "none";
}

/** Style for the temperature overlay. Warm = orange soft-light wash,
 *  cool = blue. Returns null when neutral. */
export function warmthOverlayStyle(
  a: ImageAdjustments
): React.CSSProperties | null {
  if (a.warmth === 0) return null;
  const strength = Math.min(1, Math.abs(a.warmth) / 100) * 0.4;
  const color =
    a.warmth > 0
      ? `rgba(255,150,40,${strength})` // warm
      : `rgba(40,130,255,${strength})`; // cool
  return {
    position: "absolute",
    inset: 0,
    background: color,
    mixBlendMode: "soft-light",
    pointerEvents: "none",
  };
}

/** Style for the vignette overlay (darkened edges). Null when 0. */
export function vignetteOverlayStyle(
  a: ImageAdjustments
): React.CSSProperties | null {
  if (a.vignette === 0) return null;
  const strength = (a.vignette / 100) * 0.85;
  return {
    position: "absolute",
    inset: 0,
    background: `radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,${strength}) 100%)`,
    pointerEvents: "none",
  };
}

/** Style for the graduated colour overlay. Null when disabled. */
export function gradientOverlayStyle(
  a: ImageAdjustments
): React.CSSProperties | null {
  if (!a.gradientEnabled) return null;
  const c = hexToRgba(a.gradientColor, a.gradientOpacity);
  return {
    position: "absolute",
    inset: 0,
    background: `linear-gradient(${a.gradientAngle}deg, ${c} 0%, transparent 60%)`,
    mixBlendMode: "multiply",
    pointerEvents: "none",
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h.split("").map((x) => x + x).join("")
      : h.padEnd(6, "0");
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

/* --------------------------- Presets ---------------------------------- */

export type AdjustmentPreset = {
  key: string;
  label: string;
  values: Partial<ImageAdjustments>;
};

/** One-click "looks". Each merges over the current defaults. */
export const PRESETS: AdjustmentPreset[] = [
  { key: "none", label: "Original", values: { ...DEFAULT_ADJUSTMENTS } },
  {
    key: "vivid",
    label: "Vivid",
    values: { exposure: 1.05, contrast: 1.15, saturation: 1.4 },
  },
  {
    key: "warm",
    label: "Warm",
    values: { warmth: 45, saturation: 1.1, exposure: 1.03 },
  },
  {
    key: "cool",
    label: "Cool",
    values: { warmth: -40, exposure: 1.05, saturation: 1.05 },
  },
  {
    key: "cinematic",
    label: "Cinematic",
    values: {
      contrast: 1.3,
      saturation: 0.85,
      warmth: 15,
      vignette: 45,
    },
  },
  {
    key: "hdr",
    label: "HDR Pop",
    values: { exposure: 1.05, contrast: 1.22, saturation: 1.3 },
  },
  {
    key: "bw",
    label: "B&W",
    values: { saturation: 0, contrast: 1.2 },
  },
  {
    key: "soft",
    label: "Soft",
    values: { exposure: 1.1, contrast: 0.9, saturation: 0.95 },
  },
  {
    key: "clean",
    label: "Bright & Clean",
    values: { exposure: 1.12, contrast: 1.08, saturation: 1.1, warmth: -8 },
  },
];
