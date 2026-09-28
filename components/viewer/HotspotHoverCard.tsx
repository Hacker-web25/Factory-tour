"use client";

/**
 * HotspotHoverCard — the floating preview that appears when a visitor
 * hovers a marker.
 *
 * It owns the two things a hover preview needs beyond the shared card:
 * lazily resolving YouTube metadata (so a video hotspot shows the real
 * title and channel), and the little glowing stem that ties the card back
 * down to the marker, like the connector arms in the reference art.
 *
 * Pure presentation — it never handles clicks. The marker underneath keeps
 * every pointer event, so hovering can't block a click.
 */

import { useEffect, useMemo, useState } from "react";
import type { Hotspot } from "@/lib/types";
import { useT } from "@/lib/TranslationContext";
import HotspotCard from "./HotspotCard";
import {
  buildHotspotCard,
  cardIsWorthShowing,
  extractYouTubeId,
  videoMetaCache,
} from "@/lib/hotspotCard";

export default function HotspotHoverCard({
  hotspot: h,
  scenesLookup,
  scale = 1,
  /** Where the card sits relative to the marker. */
  placement = "top",
}: {
  hotspot: Hotspot;
  scenesLookup?: Map<string, { name: string; thumbnailUrl: string | null }>;
  scale?: number;
  placement?: "top" | "bottom";
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

  if (!cardIsWorthShowing(model)) return null;

  return (
    <div
      className={`vpv-hc-float vpv-hc-float--${placement}`}
      style={{ ["--hc-accent" as string]: model.accent } as React.CSSProperties}
    >
      <HotspotCard model={model} variant="hover" width={300} scale={scale} />
      {/* Connector stem + node back down to the marker. */}
      <span className="vpv-hc-stem" aria-hidden>
        <span className="vpv-hc-stem__line" />
        <span className="vpv-hc-stem__node" />
      </span>
    </div>
  );
}
