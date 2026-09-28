"use client";

/**
 * PremiumInfoCard — the glass HUD card that opens from a hotspot, connected
 * to it by a glowing SVG "arm" exactly like the reference marker art.
 *
 * It anchors itself near the click point (offset up-and-to-the-side), draws
 * an animated connector line from the hotspot node to the card, and animates
 * in with an Apple-grade spring (scale + lift + fade, staggered content).
 *
 * Works for every card-style action: info_popup, image_popup, and any
 * hotspot that carries info_title / info_body / image_url.
 */

import { useLayoutEffect, useRef, useState } from "react";
import type { Hotspot } from "@/lib/types";

type Anchor = { x: number; y: number };

export default function PremiumInfoCard({
  hotspot,
  anchor,
  containerW,
  containerH,
  glow,
  t,
  onClose,
}: {
  hotspot: Hotspot;
  anchor: Anchor;
  containerW: number;
  containerH: number;
  glow: string;
  /** translate fn for multilingual strings */
  t: (s?: string | null) => string;
  onClose: () => void;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [placed, setPlaced] = useState<{
    left: number;
    top: number;
    side: "right" | "left";
  } | null>(null);

  const hasImage =
    (hotspot.action === "image_popup" || hotspot.type === "image") &&
    !!hotspot.image_url;

  // Card width scales with the author's card_size_pct but stays sane.
  const scale = (hotspot.card_size_pct ?? 80) / 80;
  const cardW = Math.min(
    Math.max(300, 320 * scale),
    Math.min(460, containerW * 0.42)
  );

  // Measure the rendered card, then place it beside the anchor with an
  // upper-diagonal offset (matching the reference arm), flipping sides /
  // clamping so it never leaves the viewport.
  useLayoutEffect(() => {
    const el = cardRef.current;
    const cardH = el ? el.offsetHeight : 220;
    const armX = 84;
    const armY = 70;
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
    // Re-run if the anchor or size changes.
  }, [anchor.x, anchor.y, containerW, containerH, cardW]);

  // Connector endpoints: from the hotspot node (anchor) to the card's near edge.
  const cardH = cardRef.current?.offsetHeight ?? 220;
  const target = placed
    ? {
        x: placed.side === "right" ? placed.left : placed.left + cardW,
        y: Math.max(
          placed.top + 22,
          Math.min(anchor.y, placed.top + cardH - 22)
        ),
      }
    : null;

  const style = { ["--hs-glow" as any]: glow } as React.CSSProperties;

  return (
    <div className="absolute inset-0 z-20" style={style}>
      {/* Dim + click-away layer. */}
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px] hs-scrim-in"
        onClick={onClose}
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
        onClick={(e) => e.stopPropagation()}
        className="absolute hs-premium-card hs-card-spring p-0 overflow-hidden"
        style={{
          width: cardW,
          left: placed?.left ?? -9999,
          top: placed?.top ?? -9999,
          transformOrigin:
            placed?.side === "left" ? "right center" : "left center",
        }}
      >
        {/* Top neon accent bar. */}
        <div
          className="h-[3px] w-full"
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--hs-glow), transparent)",
            boxShadow: "0 0 12px 1px color-mix(in srgb, var(--hs-glow) 70%, transparent)",
          }}
        />

        <div className="p-5">
          {/* Header: glowing icon chip + title. */}
          <div className="flex items-center gap-3 mb-3 hs-stagger" style={{ animationDelay: "60ms" }}>
            <div
              className="shrink-0 w-9 h-9 rounded-full grid place-items-center"
              style={{
                background: "color-mix(in srgb, var(--hs-glow) 22%, transparent)",
                border: "1.5px solid color-mix(in srgb, var(--hs-glow) 70%, transparent)",
                boxShadow:
                  "0 0 16px color-mix(in srgb, var(--hs-glow) 55%, transparent), inset 0 0 10px color-mix(in srgb, var(--hs-glow) 30%, transparent)",
              }}
            >
              <InfoGlyph color={glow} />
            </div>
            <h3 className="text-white font-semibold text-[16px] tracking-tight leading-snug">
              {t(hotspot.info_title || hotspot.label) || "Info"}
            </h3>
          </div>

          {hasImage && (
            <img
              // eslint-disable-next-line @next/next/no-img-element
              src={hotspot.image_url!}
              alt=""
              className="w-full rounded-xl mb-3 object-contain hs-stagger"
              style={{
                maxHeight: "56vh",
                animationDelay: "120ms",
                boxShadow:
                  "0 14px 34px -14px rgba(0,0,0,0.7), 0 0 22px -8px color-mix(in srgb, var(--hs-glow) 55%, transparent)",
              }}
            />
          )}

          {hotspot.info_body && (
            <p
              className="text-[13.5px] text-white/85 whitespace-pre-wrap leading-relaxed hs-stagger"
              style={{ animationDelay: "160ms" }}
            >
              {t(hotspot.info_body)}
            </p>
          )}

          <button
            onClick={onClose}
            className="mt-4 text-[12.5px] font-semibold px-4 py-1.5 rounded-full text-black hs-stagger"
            style={{
              background: "var(--hs-glow)",
              animationDelay: "200ms",
              boxShadow:
                "0 8px 22px -8px color-mix(in srgb, var(--hs-glow) 70%, transparent)",
            }}
          >
            Close
          </button>
        </div>

        {/* Corner close (X) for quick dismiss. */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full grid place-items-center text-white/70 hover:text-white bg-white/10 hover:bg-white/20 transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function InfoGlyph({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <circle cx="12" cy="7.5" r="0.6" fill={color} stroke={color} />
    </svg>
  );
}
