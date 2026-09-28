"use client";

/**
 * PremiumInfoCard — the glass HUD panel that opens from a hotspot,
 * connected to it by a glowing arm exactly like the reference marker art.
 *
 * It anchors beside the click point, draws an animated connector from the
 * hotspot node to the card's near edge, and animates in with an Apple-grade
 * spring (scale + lift + defocus, staggered content). Closing plays the
 * same motion in reverse before it unmounts, so the card never just
 * disappears.
 *
 * The body itself is the shared <HotspotCard>, so this popup and the hover
 * preview are visibly the same object at two sizes.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Hotspot, HotspotAction } from "@/lib/types";
import HotspotCard from "./HotspotCard";
import { buildHotspotCard } from "@/lib/hotspotCard";

type Anchor = { x: number; y: number };

/** Matches the exit animation duration in globals.css. */
const EXIT_MS = 220;

export default function PremiumInfoCard({
  hotspot,
  anchor,
  containerW,
  containerH,
  glow,
  t,
  onClose,
  scenesLookup,
  onIntent,
}: {
  hotspot: Hotspot;
  anchor: Anchor;
  containerW: number;
  containerH: number;
  glow: string;
  /** translate fn for multilingual strings */
  t: (s?: string | null) => string;
  onClose: () => void;
  /** Scene lookup so nav rows can name their destination. */
  scenesLookup?: Map<string, { name: string; thumbnailUrl: string | null }>;
  /** Lets a row inside the card trigger another hotspot action. */
  onIntent?: (intent: HotspotAction, hotspot: Hotspot) => void;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [closing, setClosing] = useState(false);
  const [placed, setPlaced] = useState<{
    left: number;
    top: number;
    side: "right" | "left";
  } | null>(null);

  const hasImage =
    (hotspot.action === "image_popup" || hotspot.type === "image") &&
    !!hotspot.image_url;

  // Run the exit motion, then actually unmount.
  const requestClose = useCallback(() => {
    setClosing(true);
    window.setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  // Escape always closes, with the same graceful exit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);

  // Card width scales with the author's card_size_pct but stays sane.
  const scale = (hotspot.card_size_pct ?? 80) / 80;
  const cardW = Math.min(
    Math.max(300, 330 * scale),
    Math.min(480, Math.max(300, containerW * 0.42))
  );

  const model = buildHotspotCard(hotspot, {
    t,
    scenesLookup,
    videoThumb: hotspot.video_thumbnail_url ?? null,
  });
  // The popup's own accent should follow whatever the caller resolved.
  model.accent = glow || model.accent;
  if (hasImage) model.thumbnail = hotspot.image_url ?? model.thumbnail;

  // Measure the rendered card, then place it beside the anchor with an
  // upper-diagonal offset (matching the reference arm), flipping sides /
  // clamping so it never leaves the viewport.
  useLayoutEffect(() => {
    const el = cardRef.current;
    const cardH = el ? el.offsetHeight : 240;
    const armX = 86;
    const armY = 64;
    const margin = 16;

    let side: "right" | "left" = "right";
    let left = anchor.x + armX;
    if (left + cardW > containerW - margin) {
      side = "left";
      left = anchor.x - armX - cardW;
    }
    left = Math.max(margin, Math.min(left, containerW - cardW - margin));

    let top = anchor.y - armY - cardH / 2;
    top = Math.max(margin, Math.min(top, containerH - cardH - margin));

    setPlaced({ left, top, side });
  }, [anchor.x, anchor.y, containerW, containerH, cardW]);

  // Connector endpoints: from the hotspot node (anchor) to the card's near edge.
  const cardH = cardRef.current?.offsetHeight ?? 240;
  const target = placed
    ? {
        x: placed.side === "right" ? placed.left : placed.left + cardW,
        y: Math.max(
          placed.top + 26,
          Math.min(anchor.y, placed.top + cardH - 26)
        ),
      }
    : null;

  const style = { ["--hs-glow" as string]: glow } as React.CSSProperties;

  return (
    <div
      className={`absolute inset-0 z-20 ${closing ? "vpv-hc-exit" : ""}`}
      style={style}
    >
      {/* Dim + click-away layer. */}
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px] hs-scrim-in"
        onClick={requestClose}
      />

      {/* Glowing connector arm (drawn above the scrim, below the card). */}
      {target && (
        <svg
          className="absolute inset-0 pointer-events-none"
          width={containerW}
          height={containerH}
          style={{ overflow: "visible" }}
        >
          <defs>
            <filter id="hs-arm-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3.2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* soft under-glow line */}
          <line
            x1={anchor.x}
            y1={anchor.y}
            x2={target.x}
            y2={target.y}
            stroke={glow}
            strokeWidth={6}
            strokeLinecap="round"
            opacity={0.35}
            filter="url(#hs-arm-glow)"
            className="hs-arm-line"
          />
          {/* crisp white core line */}
          <line
            x1={anchor.x}
            y1={anchor.y}
            x2={target.x}
            y2={target.y}
            stroke="#ffffff"
            strokeWidth={2}
            strokeLinecap="round"
            className="hs-arm-line"
          />
          {/* node at the hotspot */}
          <circle
            cx={anchor.x}
            cy={anchor.y}
            r={6}
            fill="#ffffff"
            filter="url(#hs-arm-glow)"
            className="hs-arm-node"
          />
          <circle
            cx={anchor.x}
            cy={anchor.y}
            r={11}
            fill="none"
            stroke={glow}
            strokeWidth={1.5}
            opacity={0.8}
            className="hs-arm-pulse"
          />
          {/* node at the card */}
          <circle
            cx={target.x}
            cy={target.y}
            r={4}
            fill="#ffffff"
            filter="url(#hs-arm-glow)"
            className="hs-arm-node"
          />
        </svg>
      )}

      {/* The card itself. */}
      <div
        ref={cardRef}
        className="absolute"
        style={{
          left: placed?.left ?? -9999,
          top: placed?.top ?? -9999,
          transformOrigin:
            placed?.side === "left" ? "right center" : "left center",
        }}
      >
        <HotspotCard
          model={model}
          variant="popup"
          layout={hasImage ? "hero" : "row"}
          width={cardW}
          onClose={requestClose}
          onPrimary={() => {
            const intent = model.cta?.intent;
            if (intent && intent !== "info_popup" && onIntent) {
              onIntent(intent, hotspot);
              requestClose();
            } else {
              requestClose();
            }
          }}
          onAction={(intent) => {
            if (intent === "info_popup" || !onIntent) return;
            onIntent(intent, hotspot);
            requestClose();
          }}
        />
      </div>
    </div>
  );
}
