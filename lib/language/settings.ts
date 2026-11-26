/**
 * How subtitles look in the viewer (size, place, colours) and the rules for what
 * may be saved. Shared by the editor (merge with defaults) and the server
 * (refuse anything that is not one of these settings with a sensible value).
 */

export type SubtitleSettings = {
  enabled: boolean;
  position: "bottom-center" | "top-center" | "bottom-left" | "bottom-right";
  fontSize: number;
  opacity: number;
  bgColor: string;
  textColor: string;
  maxWidthPct: number;
};

export const DEFAULT_SUBTITLE_SETTINGS: SubtitleSettings = {
  enabled: true,
  position: "bottom-center",
  fontSize: 20,
  opacity: 0.75,
  bgColor: "#000000",
  textColor: "#ffffff",
  maxWidthPct: 80,
};

export const POSITIONS = ["bottom-center", "top-center", "bottom-left", "bottom-right"] as const;

const COLOR = /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*[0-9.\s,%]+\))$/;

type Rule = (v: unknown) => unknown | undefined;
const num = (min: number, max: number): Rule => (v) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : undefined);

const RULES: Record<keyof SubtitleSettings, Rule> = {
  enabled: (v) => (typeof v === "boolean" ? v : undefined),
  position: (v) => ((POSITIONS as readonly unknown[]).includes(v) ? v : undefined),
  fontSize: num(10, 48),
  opacity: num(0, 1),
  bgColor: (v) => (typeof v === "string" && v.length <= 60 && COLOR.test(v) ? v : undefined),
  textColor: (v) => (typeof v === "string" && v.length <= 60 && COLOR.test(v) ? v : undefined),
  maxWidthPct: num(20, 100),
};

/** A change to save: only known keys, each with a valid value (null removes a key). Anything else → refused. */
export function sanitizePatch(input: unknown): { ok: true; patch: Record<string, unknown> } | { ok: false } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false };
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const rule = RULES[k as keyof SubtitleSettings];
    if (!rule) return { ok: false };
    if (v === null) {
      patch[k] = null;
      continue;
    }
    const clean = rule(v);
    if (clean === undefined) return { ok: false };
    patch[k] = clean;
  }
  return Object.keys(patch).length > 0 ? { ok: true, patch } : { ok: false };
}

/** What the viewer uses: the stored settings over the defaults, ignoring anything invalid. */
export function resolveSettings(stored: Record<string, unknown> | null | undefined): SubtitleSettings {
  const out: Record<string, unknown> = { ...DEFAULT_SUBTITLE_SETTINGS };
  for (const [k, rule] of Object.entries(RULES)) {
    const v = stored?.[k];
    if (v !== undefined && v !== null) {
      const clean = rule(v);
      if (clean !== undefined) out[k] = clean;
    }
  }
  return out as SubtitleSettings;
}

/* ───────────────────────────── colours ───────────────────────────── */

type Rgba = { r: number; g: number; b: number; a: number };

/** "#rgb", "#rrggbb", "#rgba", "#rrggbbaa", "rgb(...)" and "rgba(...)" → numbers, or null when it is anything else. */
export function parseColor(input: string): Rgba | null {
  const c = String(input ?? "").trim();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(c);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = h.split("").map((x) => x + x).join("");
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? Math.round((n(6) / 255) * 100) / 100 : 1 };
  }
  const fn = /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*(?:,\s*([0-9.]+)\s*)?\)$/i.exec(c);
  if (fn) {
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    const a = fn[4] === undefined ? 1 : Number(fn[4]);
    return { r: clamp(Number(fn[1])), g: clamp(Number(fn[2])), b: clamp(Number(fn[3])), a: Number.isFinite(a) ? Math.max(0, Math.min(1, a)) : 1 };
  }
  return null;
}

/** The value a colour picker needs: "#rrggbb" (black if the colour is not understood). */
export function colorToHex(color: string): string {
  const p = parseColor(color) ?? { r: 0, g: 0, b: 0, a: 1 };
  return "#" + [p.r, p.g, p.b].map((n) => n.toString(16).padStart(2, "0")).join("");
}

/** The subtitle box's background: its colour at the chosen opacity. */
export function backgroundCss(s: Pick<SubtitleSettings, "bgColor" | "opacity">): string {
  const p = parseColor(s.bgColor) ?? { r: 0, g: 0, b: 0, a: 1 };
  const a = Math.max(0, Math.min(1, Number.isFinite(s.opacity) ? s.opacity : 1));
  return `rgba(${p.r},${p.g},${p.b},${a})`;
}
