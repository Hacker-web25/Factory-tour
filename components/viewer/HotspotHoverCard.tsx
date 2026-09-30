"use client";

/**
 * HotspotHoverCard — the floating card that appears when a visitor hovers
 * a marker.
 *
 * Beyond rendering the shared card it owns three things:
 *
 *   • video metadata — lazily resolves a YouTube title/channel so a video
 *     hotspot previews with its real name, cached module-wide
 *   • the connector — a glowing stem back down to the marker, whose length
 *     the author controls per hotspot, plus an invisible bridge across that
 *     gap so travelling from marker to card never breaks the hover
 *   • reachability — the card takes pointer events and reports enter/leave
 *     so it stays put while the visitor is actually using it
 *
 * Rows are live: clicking one fires the hotspot's action directly from the
 * hover card, without a round trip through the anchored popup.
 */

import { useEffect, useMemo, useState } from "react";
import type { Hotspot, HotspotAction } from "@/lib/types";
import { useT } from "@/lib/TranslationContext";
import HotspotCard from "./HotspotCard";
import {
  buildHotspotCard,
  cardIsWorthShowing,
  extractYouTubeId,
  resolveConnectorLength,
  videoMetaCache,
} from "@/lib/hotspotCard";

export default function HotspotHoverCard({
  hotspot: h,
  scenesLookup,
  scale = 1,
  /** False while the exit animation plays. */
  open = true,
  /** Where the card sits relative to the marker. */
  placement = "top",
  onPointerEnter,
  onPointerLeave,
  onIntent,
}: {
  hotspot: Hotspot;
  scenesLookup?: Map<string, { name: string; thumbnailUrl: string | null }>;
  scale?: number;
  open?: boolean;
  placement?: "top" | "bottom";
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  /** Fires when a row or the arrow is clicked. Omit for a passive card. */
  onIntent?: (intent: HotspotAction) => void;
}) {
  const { t } = useT();

  const ytId = useMemo(
    () => extractYouTubeId(h.video_url ?? ""),
    [h.video_url]
  );

  const [meta, setMeta] = useState<{ title: string; author?: string } | null>(
    () => (h.video_url ? videoMetaCache.get(h.video_url) ?? null : null)
  );

  // Resolve the video's real title/channel once, then cache it module-wide
  // so re-hovering the same marker is instant and offline-safe.
  useEffect(() => {
    if (meta || !ytId || !h.video_url) return;
    const url = h.video_url;
    let cancelled = false;
    fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        url
      )}&format=json`
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        const entry = { title: d.title as string, author: d.author_name };
        videoMetaCache.set(url, entry);
        setMeta(entry);
      })
      .catch(() => {
        /* silent — the card falls back to the author's own title */
      });
    return () => {
      cancelled = true;
    };
  }, [meta, ytId, h.video_url]);

  const videoThumb =
    h.video_thumbnail_url ||
    (ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null);

  const model = useMemo(
    () =>
      buildHotspotCard(h, {
        t,
        scenesLookup,
        videoMeta: meta,
        videoThumb,
      }),
    [h, t, scenesLookup, meta, videoThumb]
  );

  const stem = resolveConnectorLength(h);
  const showStem = h.card_connector !== false;
  const live = !!onIntent;

  /* "No action" hotspots are purely decorative — a marker on the wall
     with nothing behind it. Suppress the hover card entirely so the
     visitor doesn't get a preview that goes nowhere on click. This
     check is on the AUTHOR-SET action only, not on the type fallback,
     so a legacy typed hotspot (nav / info / video / etc.) still
     previews as before. */
  if (h.action === "none") return null;

  /* Image-only preview — when the action is "show image", the hover card
     drops every ornament (title, subtitle, badge, CTA row) and just
     shows the image at the author-controlled size. Clicking anywhere on
     the image fires the popup. */
  const imageOnly =
    h.action === "image_popup" && !!(h.image_url && h.image_url.trim());

  if (!imageOnly && !cardIsWorthShowing(model)) return null;

  const imgPct = Math.max(20, Math.min(150, h.card_size_pct ?? 80));
  const imgBase = 300; // matches HotspotCard's default hover width
  const imgWidth = Math.round(imgBase * (imgPct / 100) * scale);

  return (
    <div
      className={[
        "vpv-hc-float",
        `vpv-hc-float--${placement}`,
        open ? "is-open" : "is-closing",
        live ? "is-live" : "",
        imageOnly ? "is-image-only" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        {
          "--hc-accent": model.accent,
          "--hc-stem": `${stem}px`,
        } as React.CSSProperties
      }
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
    >
      {imageOnly ? (
        <div
          className="vpv-hc-image-only"
          style={{
            width: imgWidth,
            borderRadius: 14,
            overflow: "hidden",
            boxShadow:
              "0 20px 40px -14px rgba(15,23,42,0.55), 0 0 0 1px rgba(255,255,255,0.08)",
            background: "#0b1220",
            cursor: live ? "zoom-in" : "default",
          }}
          onClick={() => live && onIntent?.("image_popup")}
        >
          <img
            src={h.image_url ?? ""}
            alt=""
            draggable={false}
            style={{
              display: "block",
              width: "100%",
              height: "auto",
              userSelect: "none",
            }}
          />
        </div>
      ) : (
        <HotspotCard
          model={model}
          variant="hover"
          interactive={live}
          width={300}
          scale={scale}
          onAction={(intent) => onIntent?.(intent)}
          onPrimary={() => {
            const intent = model.cta?.intent;
            if (intent) onIntent?.(intent);
          }}
        />
      )}

      {/* Connector stem + node back down to the marker, and the invisible
          bridge that keeps the hover alive while crossing the gap. */}
      {showStem && (
        <span className="vpv-hc-stem" aria-hidden>
          <span className="vpv-hc-stem__line" />
          <span className="vpv-hc-stem__pulse" />
          <span className="vpv-hc-stem__node" />
        </span>
      )}
      <span className="vpv-hc-bridge" aria-hidden />
    </div>
  );
}
