"use client";

/**
 * HotspotSkin — the premium overlay wrapper drawn around a hotspot's icon.
 *
 * Cosmetic only: it renders a glowing frame / crosshair / hexagon / orbit /
 * scanner brackets behind/around a child (the raw icon), and applies an
 * optional shape mask (circle / square / diamond / hexagon / octagon) so
 * every preset icon still shows correctly inside the chosen frame.
 *
 * All animations are pure CSS keyframes (see globals.css → hs-skin-*),
 * GPU-composited and cheap. Nothing here changes click / drag / label
 * behaviour — the caller keeps that.
 */

import type { HotspotIconShape, HotspotSkin } from "@/lib/types";

type Props = {
  skin: HotspotSkin | undefined;
  shape: HotspotIconShape | undefined;
  /** Total pixel size of the icon area (largest dimension of width/height). */
  size: number;
  /** Neon glow colour (typically the hotspot's own `color`). */
  glow: string;
  /** The rendered icon / image element the caller already builds. */
  children: React.ReactNode;
};

export default function HotspotSkinFrame({
  skin,
  shape,
  size,
  glow,
  children,
}: Props) {
  const effectiveSkin: HotspotSkin = skin ?? "none";
  const effectiveShape: HotspotIconShape = shape ?? "circle";

  // The frame is always sized generously around the icon so glows don't
  // clip. Each skin uses this box; the icon sits centred inside.
  const frameSize = Math.round(size * 1.6);

  return (
    <div
      className="relative grid place-items-center"
      style={{
        width: frameSize,
        height: frameSize,
        // Expose colour as a CSS variable so the skin CSS animations pick
        // it up — cheaper than re-generating keyframes per hotspot.
        ["--hs-glow" as any]: glow,
      }}
    >
      {/* Skin overlay layer — sits behind the icon. */}
      {effectiveSkin !== "none" && <SkinLayer skin={effectiveSkin} />}

      {/* Icon holder with the chosen shape mask. */}
      <div
        className="relative grid place-items-center"
        style={{
          width: size,
          height: size,
          clipPath: clipFor(effectiveShape),
          // Solid dark backing so line-icons read cleanly on any panorama.
          background:
            effectiveShape === "circle"
              ? undefined
              : "rgba(15, 25, 45, 0.55)",
          borderRadius: effectiveShape === "circle" ? "50%" : undefined,
          backdropFilter:
            effectiveShape === "circle" ? undefined : "blur(8px)",
          WebkitBackdropFilter:
            effectiveShape === "circle" ? undefined : "blur(8px)",
          boxShadow:
            effectiveSkin === "none" && effectiveShape === "circle"
              ? undefined
              : `0 0 14px 2px color-mix(in oklab, ${glow} 55%, transparent), inset 0 0 0 1px rgba(255,255,255,0.12)`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* --------------------------- Shape masks -------------------------------- */

function clipFor(s: HotspotIconShape): string | undefined {
  switch (s) {
    case "square":
      // Rounded square via a super-elliptic squircle-ish clip.
      return "inset(0 round 22%)";
    case "diamond":
      return "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)";
    case "hexagon":
      return "polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0% 50%)";
    case "octagon":
      return "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)";
    case "circle":
    default:
      return undefined;
  }
}

/* --------------------------- Skin renderers ---------------------------- */

function SkinLayer({ skin }: { skin: HotspotSkin }) {
  switch (skin) {
    case "ring":
      return (
        <>
          <span className="absolute inset-0 rounded-full hs-skin-ring-outer" />
          <span className="absolute inset-[8%] rounded-full hs-skin-ring-mid" />
          <span className="absolute inset-[18%] rounded-full hs-skin-ring-inner" />
        </>
      );
    case "core":
      return (
        <>
          <span className="absolute inset-0 rounded-full hs-skin-core-halo" />
          <span className="absolute inset-[12%] rounded-full hs-skin-core-ring" />
        </>
      );
    case "crosshair":
      return (
        <>
          <span className="absolute inset-0 hs-skin-crosshair" aria-hidden />
          <span className="absolute inset-0 rounded-full hs-skin-crosshair-halo" />
        </>
      );
    case "hexagon":
      return (
        <>
          <span className="absolute inset-0 hs-skin-hexagon" aria-hidden />
          <span className="absolute inset-[10%] hs-skin-hexagon-inner" aria-hidden />
        </>
      );
    case "orbit":
      return (
        <>
          <span className="absolute inset-[10%] rounded-full hs-skin-orbit-ring" />
          <span className="absolute inset-0 hs-skin-orbit" aria-hidden>
            <span className="hs-orbit-dot" />
            <span className="hs-orbit-dot" />
            <span className="hs-orbit-dot" />
          </span>
        </>
      );
    case "scanner":
      return (
        <>
          <span className="absolute inset-0 hs-skin-scanner" aria-hidden />
          <span className="absolute inset-[10%] rounded-md hs-skin-scanner-halo" />
        </>
      );
    default:
      return null;
  }
}
