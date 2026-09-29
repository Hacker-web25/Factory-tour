/**
 * lib/orgTheme — per-org dashboard theming.
 *
 * The theme lives in `orgs.theme` (jsonb). It is applied at the top of
 * the dashboard wrapper as inline CSS variables, so only signed-in
 * members of that org see it. Public tour pages and other orgs' shells
 * are untouched.
 *
 * Consumers:
 *   - <OrgThemeProvider> reads the theme by org_id and renders the
 *     wrapping <div className="vpv-themed" style={...}> around the
 *     dashboard tree.
 *   - <DashboardThemeSettings> writes to the same row, and reads back
 *     the current theme so its controls show real state.
 *
 * Rendering:
 *   The dashboard uses Tailwind classes like `bg-vpv-canvas`,
 *   `text-vpv-ink`, `border-vpv-line`, etc. In globals.css, matching
 *   overrides scoped to `.vpv-themed` swap those to the CSS vars set
 *   here (see the "org dashboard theme" block).
 */

export type ThemeGradientStop = { color: string; pos: number }; // pos 0..100
export type ThemeGradientDirection = "vertical" | "horizontal" | "diagonal";

export type OrgTheme = {
  /** When false, none of the overrides apply — dashboard renders in
   *  its stock look. Authors can flip the whole customisation off
   *  without losing their tuned values. */
  enabled?: boolean;
  canvas?: string;
  ink?: string;
  muted?: string;
  line?: string;
  tint?: string;
  accent?: string;
  button_bg?: string;
  button_text?: string;
  font?: string;
  /** Resolved Google Fonts stylesheet URL for `font`. */
  font_url?: string;
  translucent_bg?: boolean;
  translucent_button?: boolean;
  /** Backdrop-blur strength when translucent flags are on. */
  blur_px?: number;
  gradient?: {
    enabled?: boolean;
    direction?: ThemeGradientDirection;
    stops?: ThemeGradientStop[];
  };
};

/** The stock look — every unset field falls back to this. Matches the
 *  original hard-coded Tailwind colours so a brand-new org sees no
 *  change until they start customising. */
export const THEME_DEFAULTS: Required<Omit<OrgTheme, "font_url" | "gradient">> & {
  gradient: NonNullable<OrgTheme["gradient"]>;
  font_url: string;
} = {
  enabled: false,
  canvas: "#fafafa",
  ink: "#0a0a0a",
  muted: "#525252",
  line: "#e5e5e5",
  tint: "#f5f5f5",
  accent: "#19b8f2",
  button_bg: "#0f172a",
  button_text: "#ffffff",
  font: "Inter",
  font_url: "",
  translucent_bg: false,
  translucent_button: false,
  blur_px: 14,
  gradient: {
    enabled: false,
    direction: "vertical",
    stops: [
      { color: "#19b8f2", pos: 0 },
      { color: "#1e40af", pos: 100 },
    ],
  },
};

/** A handful of Google Fonts we consider "dashboard-appropriate" —
 *  short list keeps the picker manageable and every one has a matching
 *  API URL below. Authors can pass any custom font, but the picker
 *  offers these first. */
export const DASHBOARD_FONTS: { family: string; url: string }[] = [
  { family: "Inter",           url: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" },
  { family: "Poppins",         url: "https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap" },
  { family: "Manrope",         url: "https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&display=swap" },
  { family: "DM Sans",         url: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" },
  { family: "Space Grotesk",   url: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap" },
  { family: "Plus Jakarta Sans", url: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" },
  { family: "Sora",            url: "https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&display=swap" },
  { family: "Outfit",          url: "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" },
  { family: "Instrument Sans", url: "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap" },
  { family: "Playfair Display", url: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700;800&display=swap" },
];

/** A gradient object with every field guaranteed present. */
export type ResolvedGradient = {
  enabled: boolean;
  direction: ThemeGradientDirection;
  stops: ThemeGradientStop[];
};

/** A theme with every field guaranteed present — nothing is optional
 *  after `resolveTheme`, so consumers never have to null-check. */
export type ResolvedTheme = Required<Omit<OrgTheme, "gradient">> & {
  gradient: ResolvedGradient;
};

/** Merge stored theme onto defaults so consumers always see a full
 *  object. */
export function resolveTheme(raw: OrgTheme | null | undefined): ResolvedTheme {
  const r = raw ?? {};
  return {
    ...THEME_DEFAULTS,
    ...r,
    enabled: r.enabled === true,
    gradient: {
      enabled: r.gradient?.enabled === true,
      direction: (r.gradient?.direction ?? THEME_DEFAULTS.gradient.direction) as ThemeGradientDirection,
      stops:
        r.gradient?.stops && r.gradient.stops.length >= 2
          ? r.gradient.stops
          : THEME_DEFAULTS.gradient.stops!,
    },
  };
}

/** Turn a resolved theme into inline CSS variables + background-image
 *  for the dashboard wrapper. Returns an empty object when the theme
 *  is disabled so the dashboard reverts to its stock look. */
export function themeToStyle(t: OrgTheme | null | undefined): React.CSSProperties {
  const r = resolveTheme(t);
  if (!r.enabled) return {};

  const style: Record<string, string | undefined> = {
    "--vpv-canvas": r.canvas,
    "--vpv-ink": r.ink,
    "--vpv-muted": r.muted,
    "--vpv-line": r.line,
    "--vpv-tint": r.tint,
    "--vpv-accent": r.accent,
    "--vpv-button-bg": r.button_bg,
    "--vpv-button-text": r.button_text,
    "--vpv-blur": `${r.blur_px}px`,
    // A page-wide font override is applied via the wrapper's
    // font-family declaration, not a var, because Tailwind's
    // `font-sans` is set globally on <body>.
    fontFamily: r.font ? `"${r.font}", ui-sans-serif, system-ui, sans-serif` : undefined,
  };

  if (r.gradient.enabled && r.gradient.stops.length >= 2) {
    const angle =
      r.gradient.direction === "horizontal"
        ? 90
        : r.gradient.direction === "diagonal"
          ? 135
          : 180;
    const stopList = r.gradient.stops
      .slice()
      .sort((a, b) => a.pos - b.pos)
      .map((s) => `${s.color} ${s.pos}%`)
      .join(", ");
    style.backgroundImage = `linear-gradient(${angle}deg, ${stopList})`;
    style.backgroundAttachment = "fixed";
  }

  return style as React.CSSProperties;
}

/** Class hooks the CSS in globals.css matches on. */
export function themeClassNames(t: OrgTheme | null | undefined): string {
  const r = resolveTheme(t);
  if (!r.enabled) return "";
  const cls = ["vpv-themed"];
  if (r.translucent_bg) cls.push("is-translucent-bg");
  if (r.translucent_button) cls.push("is-translucent-btn");
  if (r.gradient.enabled) cls.push("has-gradient");
  return cls.join(" ");
}
