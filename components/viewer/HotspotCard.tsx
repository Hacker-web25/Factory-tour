"use client";

/**
 * HotspotCard — the one premium card every hotspot opens.
 *
 * Layout follows the VPV hotspot-style reference sheet: a glass panel with
 * a thumbnail + title header, an optional spec table or description, a list
 * of icon action rows, and a glowing circular arrow button in the corner.
 *
 * Two variants share the exact same markup so hover and click feel like one
 * continuous object:
 *   • "hover"  — floats above the marker, non-interactive, tighter padding
 *   • "popup"  — anchored panel with clickable rows and a close button
 *
 * Every animation lives in globals.css under the `vpv-hc` namespace.
 */

import { memo } from "react";
import {
  BarChart3,
  Box,
  Camera,
  ChevronRight,
  FileText,
  Headphones,
  Image as ImageIcon,
  Info,
  Link2,
  ListChecks,
  MapPin,
  MessageSquare,
  Navigation,
  Play,
  Settings,
  ShieldCheck,
  User,
  ZoomIn,
  type LucideIcon,
} from "lucide-react";
import type {
  CardGlyphKey,
  HotspotCardModel,
  HotspotCardAction,
} from "@/lib/hotspotCard";
import type { HotspotAction } from "@/lib/types";

const GLYPHS: Record<CardGlyphKey, LucideIcon> = {
  details: FileText,
  video: Play,
  image: ImageIcon,
  gallery: ImageIcon,
  pdf: FileText,
  audio: Headphones,
  link: Link2,
  nav: Navigation,
  person: User,
  specs: ListChecks,
  shield: ShieldCheck,
  gear: Settings,
  info: Info,
  pin: MapPin,
  chart: BarChart3,
  cube: Box,
  chat: MessageSquare,
  zoom: ZoomIn,
  camera: Camera,
};

export type HotspotCardVariant = "hover" | "popup";

export default memo(function HotspotCard({
  model,
  variant = "hover",
  width = 320,
  /** Multiplies every dimension — wired to the tour's hover-card scale. */
  scale = 1,
  /** "row" puts the thumbnail beside the title (the reference default);
   *  "hero" runs it full-width above, for image-first popups. */
  layout = "row",
  /** Whether rows and the arrow respond to clicks. Popups always are;
   *  a hover card becomes interactive once it's given an action handler. */
  interactive: interactiveProp,
  onAction,
  onPrimary,
  onClose,
  className = "",
  style,
}: {
  model: HotspotCardModel;
  variant?: HotspotCardVariant;
  width?: number;
  scale?: number;
  layout?: "row" | "hero";
  interactive?: boolean;
  onAction?: (intent: HotspotAction, action: HotspotCardAction) => void;
  onPrimary?: () => void;
  onClose?: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const interactive = interactiveProp ?? variant === "popup";
  const { accent, title, subtitle, body, thumbnail, badge, specs, actions } =
    model;

  // Content reveals in sequence behind the card's own spring — the header
  // first, then the table, then each row. Kept in one place so the rhythm
  // stays even no matter which blocks a hotspot happens to have.
  let step = 0;
  const nextDelay = () => `${70 + step++ * 45}ms`;

  return (
    <div
      className={[
        "vpv-hc",
        `vpv-hc--${variant}`,
        `vpv-hc--${layout}`,
        interactive ? "is-interactive" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        {
          "--hc-accent": accent,
          "--hc-scale": scale,
          width: Math.round(width * scale),
          ...style,
        } as React.CSSProperties
      }
      onClick={variant === "popup" ? (e) => e.stopPropagation() : undefined}
    >
      {/* Specular sweep — a single pass of light across the glass as the
          card settles, then it's gone. */}
      <span className="vpv-hc__sweep" aria-hidden />

      {/* Neon hairline along the top edge. */}
      <span className="vpv-hc__rim" aria-hidden />

      <div className="vpv-hc__inner">
        {/* ---------------- Hero image (image-first popups) ------------- */}
        {layout === "hero" && thumbnail && (
          <div className="vpv-hc__hero" style={{ animationDelay: nextDelay() }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbnail} alt="" draggable={false} />
            <span className="vpv-hc__thumb-sheen" aria-hidden />
            {badge && <span className="vpv-hc__badge">{badge}</span>}
          </div>
        )}

        {/* ---------------- Header ---------------- */}
        <div className="vpv-hc__head" style={{ animationDelay: nextDelay() }}>
          {layout === "row" && thumbnail && (
            <div className="vpv-hc__thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbnail} alt="" draggable={false} />
              <span className="vpv-hc__thumb-sheen" aria-hidden />
              {badge && <span className="vpv-hc__badge">{badge}</span>}
            </div>
          )}
          <div className="vpv-hc__headtext">
            <h3 className="vpv-hc__title">{title}</h3>
            {subtitle && <p className="vpv-hc__sub">{subtitle}</p>}
            {!thumbnail && badge && (
              <span className="vpv-hc__badge vpv-hc__badge--inline">
                {badge}
              </span>
            )}
          </div>
        </div>

        {/* ---------------- Spec table ---------------- */}
        {specs.length > 0 && (
          <div className="vpv-hc__specs">
            {specs.map((s) => (
              <div
                key={s.label}
                className="vpv-hc__spec"
                style={{ animationDelay: nextDelay() }}
              >
                <span className="vpv-hc__spec-k">{s.label}</span>
                <span className="vpv-hc__spec-sep" aria-hidden>
                  :
                </span>
                <span className="vpv-hc__spec-v">{s.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* ---------------- Description ---------------- */}
        {body && specs.length === 0 && (
          <p className="vpv-hc__body" style={{ animationDelay: nextDelay() }}>
            {body}
          </p>
        )}

        {/* ---------------- Action rows ---------------- */}
        {actions.length > 0 && (
          <div className="vpv-hc__rows">
            {actions.map((a) => {
              const Glyph = GLYPHS[a.glyph] ?? FileText;
              return (
                <button
                  key={a.key}
                  type="button"
                  tabIndex={interactive ? 0 : -1}
                  className="vpv-hc__row"
                  style={{ animationDelay: nextDelay() }}
                  onClick={
                    interactive
                      ? (e) => {
                          e.stopPropagation();
                          onAction?.(a.intent, a);
                        }
                      : undefined
                  }
                >
                  <span className="vpv-hc__row-ico" aria-hidden>
                    <Glyph size={15} strokeWidth={1.75} />
                  </span>
                  <span className="vpv-hc__row-label">{a.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ---------------- Circular arrow ---------------- */}
      <button
        type="button"
        tabIndex={interactive ? 0 : -1}
        aria-label={model.cta?.label ?? "Open"}
        title={model.cta?.label ?? undefined}
        className="vpv-hc__arrow"
        onClick={
          interactive
            ? (e) => {
                e.stopPropagation();
                onPrimary?.();
              }
            : undefined
        }
      >
        {/* Slow halo that breathes outward, so the arrow reads as the
            card's live affordance rather than a static dot. */}
        <span className="vpv-hc__arrow-halo" aria-hidden />
        <ChevronRight size={16} strokeWidth={2.75} />
      </button>

      {/* ---------------- Close ---------------- */}
      {interactive && onClose && (
        <button
          type="button"
          aria-label="Close"
          className="vpv-hc__close"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
          >
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
});
