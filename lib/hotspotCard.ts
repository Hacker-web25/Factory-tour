/**
 * hotspotCard — the single source of truth for what a hotspot's premium
 * card shows.
 *
 * Every hotspot kind (icon, image, text, nav, info, url, video, pdf,
 * audio, person, polygon) is reduced to one consistent `HotspotCardModel`
 * so the viewer can render ONE card component everywhere. Hover previews
 * and click popups therefore always look and feel identical.
 *
 * Nothing in here touches the DOM — it's pure data derivation, which keeps
 * it trivially testable and usable from both the 3D layer and the flat
 * viewer.
 */

import type { Hotspot, HotspotAction } from "@/lib/types";

/** Icon vocabulary used by the card's action rows. Mapped to real icon
 *  components inside HotspotCard so this file stays JSX-free. */
export type CardGlyphKey =
  | "details"
  | "video"
  | "image"
  | "gallery"
  | "pdf"
  | "audio"
  | "link"
  | "nav"
  | "person"
  | "specs"
  | "shield"
  | "gear"
  | "info"
  | "pin"
  | "chart"
  | "cube"
  | "chat"
  | "zoom"
  | "camera";

export type HotspotCardAction = {
  /** Stable key for React. */
  key: string;
  glyph: CardGlyphKey;
  label: string;
  /** Which hotspot action this row triggers when the card is interactive. */
  intent: HotspotAction;
};

export type HotspotCardSpec = { label: string; value: string };

export type HotspotCardModel = {
  /** Neon accent — drives glow, row icons and the arrow button. */
  accent: string;
  title: string;
  subtitle: string | null;
  /** Free-text body, shown when there are no spec rows. */
  body: string | null;
  thumbnail: string | null;
  /** Small uppercase chip over the thumbnail ("VIDEO", "PDF", "360°"). */
  badge: string | null;
  specs: HotspotCardSpec[];
  actions: HotspotCardAction[];
  /** Primary call-to-action behind the circular arrow button. */
  cta: { glyph: CardGlyphKey; label: string; intent: HotspotAction } | null;
};

export type BuildCardCtx = {
  /** Translator from TranslationContext. */
  t: (s?: string | null) => string;
  /** Scene id → name + thumbnail, for nav hotspots. */
  scenesLookup?: Map<string, { name: string; thumbnailUrl: string | null }>;
  /** Resolved oEmbed metadata for video hotspots, when available. */
  videoMeta?: { title: string; author?: string } | null;
  /** Pre-resolved video thumbnail (YouTube hqdefault or custom upload). */
  videoThumb?: string | null;
};

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

/** The default premium blue, used when a hotspot has no colour of its own. */
export const VPV_ACCENT = "#3b9dff";

/** Module-level cache for YouTube oEmbed lookups, shared by every card. */
export const videoMetaCache = new Map<
  string,
  { title: string; author?: string }
>();

export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** Readable host for a URL, e.g. "docs.example.com". Never throws. */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** The effective action for a hotspot, falling back to its legacy type. */
export function effectiveAction(h: Hotspot): HotspotAction {
  if (h.action && h.action !== "none") return h.action;
  if (h.type === "nav") return "nav";
  if (h.type === "url") return "url";
  if (h.type === "info") return "info_popup";
  if (h.type === "image") return "image_popup";
  if (h.type === "video") return "video_popup";
  if (h.type === "pdf") return "pdf_popup";
  if (h.type === "audio") return "audio_popup";
  return "none";
}

/**
 * Turn a body written as "Key : Value" lines into spec rows — the
 * data-sheet layout from the Scanner card in the reference art.
 *
 * Only kicks in when the body is clearly a spec list (2+ lines and most of
 * them match), so ordinary prose is never mangled into a table.
 */
export function parseSpecs(body: string | null): HotspotCardSpec[] {
  if (!body) return [];
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2 || lines.length > 8) return [];

  const rows: HotspotCardSpec[] = [];
  for (const line of lines) {
    // Split on the first colon that has content either side. Guard against
    // URLs ("https://…") by requiring the key to be short and colon-free.
    const idx = line.indexOf(":");
    if (idx <= 0 || idx > 28) return [];
    const label = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!label || !value) return [];
    rows.push({ label, value });
  }
  return rows.length >= 2 ? rows : [];
}

/* ------------------------------------------------------------------ *
 * The builder
 * ------------------------------------------------------------------ */

/**
 * Derive the card model for any hotspot.
 *
 * The shape follows the reference art: a header (thumbnail + title +
 * subtitle), an optional spec table or body paragraph, then a list of
 * action rows for every payload the hotspot actually carries — so one
 * hotspot with a video, a PDF and a gallery shows all three rows, exactly
 * like "Machine Details / Process Video / Product Samples".
 */
export function buildHotspotCard(
  h: Hotspot,
  ctx: BuildCardCtx
): HotspotCardModel {
  const { t } = ctx;
  const accent = h.glow_color || h.color || VPV_ACCENT;

  const label = t(h.label) || "";
  const infoTitle = t(h.info_title) || "";
  const bodyText = t(h.info_body) || "";

  const action = effectiveAction(h);
  const navTarget = h.target_scene_id
    ? ctx.scenesLookup?.get(h.target_scene_id) ?? null
    : null;

  let title = infoTitle || label;
  let subtitle: string | null = null;
  let thumbnail: string | null = null;
  let badge: string | null = null;
  let cta: HotspotCardModel["cta"] = null;

  const actions: HotspotCardAction[] = [];
  const seen = new Set<string>();
  const push = (a: HotspotCardAction) => {
    if (seen.has(a.key)) return;
    seen.add(a.key);
    actions.push(a);
  };

  /* --- Primary identity, driven by the hotspot's own kind ------------ */

  switch (h.type === "nav" || action === "nav" ? "nav" : h.type) {
    case "nav": {
      title = title || navTarget?.name || "Next scene";
      subtitle = bodyText || (navTarget ? `Move to ${navTarget.name}` : null);
      thumbnail = navTarget?.thumbnailUrl ?? null;
      badge = "360°";
      cta = { glyph: "nav", label: "Enter Scene", intent: "nav" };
      push({
        key: "nav",
        glyph: "nav",
        label: navTarget ? `Go to ${navTarget.name}` : "Go to scene",
        intent: "nav",
      });
      break;
    }

    case "video": {
      title = title || ctx.videoMeta?.title || "Video";
      subtitle =
        ctx.videoMeta?.author ||
        bodyText ||
        (extractYouTubeId(h.video_url ?? "") ? "YouTube" : null);
      thumbnail = ctx.videoThumb ?? h.video_thumbnail_url ?? null;
      badge = "VIDEO";
      cta = { glyph: "video", label: "Watch Video", intent: "video_popup" };
      push({
        key: "video",
        glyph: "video",
        label: "Process Video",
        intent: "video_popup",
      });
      break;
    }

    case "image": {
      title = title || "Image";
      subtitle = bodyText || null;
      thumbnail = h.image_url ?? null;
      badge = "IMAGE";
      cta = { glyph: "zoom", label: "View Image", intent: "image_popup" };
      push({
        key: "image",
        glyph: "gallery",
        label: "View full image",
        intent: "image_popup",
      });
      break;
    }

    case "pdf": {
      title = title || h.pdf_name || "Document";
      subtitle = bodyText || h.pdf_name || "PDF document";
      badge = "PDF";
      cta = { glyph: "pdf", label: "Open Document", intent: "pdf_popup" };
      push({
        key: "pdf",
        glyph: "pdf",
        label: h.pdf_name || "Open document",
        intent: "pdf_popup",
      });
      break;
    }

    case "audio": {
      title = title || "Voice note";
      subtitle = bodyText || "Audio narration";
      badge = "AUDIO";
      cta = { glyph: "audio", label: "Play Audio", intent: "audio_popup" };
      push({
        key: "audio",
        glyph: "audio",
        label: "Play narration",
        intent: "audio_popup",
      });
      break;
    }

    case "url": {
      const host = hostOf(h.url);
      title = title || host || "Link";
      subtitle = bodyText || host;
      badge = "LINK";
      cta = { glyph: "link", label: "Open Link", intent: "url" };
      push({
        key: "url",
        glyph: "link",
        label: host ? `Open ${host}` : "Open link",
        intent: "url",
      });
      break;
    }

    case "person": {
      title = title || "Team member";
      subtitle = bodyText || null;
      thumbnail = h.icon_url ?? null;
      badge = null;
      cta = null;
      break;
    }

    case "polygon": {
      title = title || "Area";
      subtitle = bodyText || null;
      thumbnail = h.image_url ?? null;
      badge = h.video_url ? "VIDEO" : h.image_url ? "IMAGE" : null;
      break;
    }

    case "text": {
      title = title || label || "Note";
      subtitle = null;
      break;
    }

    case "info":
    case "icon":
    default: {
      title = title || "Details";
      badge = badge ?? (h.type === "info" ? "INFO" : null);
      cta = { glyph: "details", label: "View Details", intent: "info_popup" };
      break;
    }
  }

  /* --- Secondary payload rows ---------------------------------------
   * Anything else attached to this hotspot earns its own row, so a rich
   * hotspot reads like the reference cards with three or four choices.  */

  if (h.video_url) {
    push({
      key: "video",
      glyph: "video",
      label: "Process Video",
      intent: "video_popup",
    });
  }
  if (h.image_url && h.type !== "image") {
    push({
      key: "image",
      glyph: "gallery",
      label: "Product Samples",
      intent: "image_popup",
    });
  }
  if (h.pdf_url && h.type !== "pdf") {
    push({
      key: "pdf",
      glyph: "pdf",
      label: h.pdf_name || "Documents",
      intent: "pdf_popup",
    });
  }
  if (h.audio_url && h.type !== "audio") {
    push({
      key: "audio",
      glyph: "audio",
      label: "Voice note",
      intent: "audio_popup",
    });
  }
  if (h.url && h.type !== "url") {
    const host = hostOf(h.url);
    push({
      key: "url",
      glyph: "link",
      label: host ? `Visit ${host}` : "Learn more",
      intent: "url",
    });
  }

  // A written description always deserves a "details" row — it's the row
  // the reference art labels "Machine Details" / "Machine Information".
  const specs = parseSpecs(bodyText);
  if (bodyText && specs.length === 0 && h.type !== "text") {
    push({
      key: "details",
      glyph: "details",
      label: "Machine Details",
      intent: "info_popup",
    });
  }

  // Never let the subtitle duplicate the body we're about to render, and
  // never show raw spec text as a subtitle.
  const body = specs.length > 0 ? null : bodyText || null;
  if (subtitle && body && subtitle.trim() === body.trim()) subtitle = null;

  return {
    accent,
    title: title || "Details",
    subtitle: subtitle || null,
    body,
    thumbnail,
    badge,
    specs,
    actions,
    cta,
  };
}

/**
 * Is there enough substance to justify floating a card on hover?
 * A bare marker with no title, payload or description shouldn't pop one.
 */
export function cardIsWorthShowing(model: HotspotCardModel): boolean {
  return (
    !!model.thumbnail ||
    !!model.body ||
    model.specs.length > 0 ||
    model.actions.length > 0
  );
}
