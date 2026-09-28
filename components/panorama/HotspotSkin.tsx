"use client";

/**
 * HotspotSkin — the premium overlay wrapper drawn around a hotspot's icon.
 *
 * Renders the neon-glass marker from the VPV reference art: a bright
 * white-cored icon wrapped in layered coloured glow, optionally seated on a
 * glass tile (circle / square / diamond / hexagon / octagon) and framed by a
 * skin (precision ring, glowing core, crosshair, hexagon, orbit, scanner).
 *
 * Everything is driven by CSS custom properties so a single set of keyframes
 * handles every colour + intensity:
 *
 *   --hs-glow        neon colour
 *   --hs-blur        glow blur radius in px (from glow_intensity)
 *   --hs-spread      glow spread radius in px (from glow_intensity)
 *   --hs-fill        shape backing colour (rgba)
 *   --hs-boost       1 at rest, >1 while hovered (brightens the whole marker)
 *
 * Cosmetic only — click / drag / label behaviour is unchanged.
 */

import type { HotspotIconShape, HotspotSkin } from "@/lib/types";

type Props = {
  skin: HotspotSkin | undefined;
  shape: HotspotIconShape | undefined;
  /** Largest dimension of the icon area in px. */
  size: number;
  /** Neon glow colour. */
  glow: string;
  /** 0–200 (%). Scales blur + spread. Default 100. */
  intensity?: number | null;
  /** Shape backing fill (hex). null → neutral dark glass. */
  fill?: string | null;
  /** True while the pointer is over the marker — lifts the glow. */
  hovered?: boolean;
  /** Neon treatment on the icon itself. On by default; the editor can turn
   *  it down so authors see the raw artwork while placing markers. */
  neon?: boolean;
  children: React.ReactNode;
};

/** Convert a hex colour to an rgba() string at the given alpha. */
function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  if (Number.isNaN(n) || h.length !== 6) return `rgba(15,23,42,${alpha})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function HotspotSkinFrame({
  skin,
  shape,
  size,
  glow,
  intensity,
  fill,
  hovered = false,
  neon = true,
  children,
}: Props) {
  const effectiveSkin: HotspotSkin = skin ?? "none";
  const effectiveShape: HotspotIconShape = shape ?? "circle";

  // Map 0–200 intensity onto real glow radii. 100 → 16px blur / 3px spread.
  const k = Math.max(0, Math.min(200, intensity ?? 100)) / 100;
  const blur = Math.round(16 * k);
  const spread = Math.round(3 * k);

  const hasFrame = effectiveSkin !== "none" || effectiveShape !== "circle";
  const frameSize = hasFrame ? Math.round(size * 1.85) : size;

  // Shape backing: glassy tint of the chosen fill (or the deep navy glass
  // from the reference tiles).
  const backing = fill ? hexToRgba(fill, 0.55) : "rgba(9,15,32,0.55)";

  const cssVars = {
    ["--hs-glow" as string]: glow,
    ["--hs-blur" as string]: `${blur}px`,
    ["--hs-spread" as string]: `${spread}px`,
    ["--hs-fill" as string]: backing,
    ["--hs-boost" as string]: hovered ? "1.45" : "1",
  } as React.CSSProperties;

  return (
    <div
      className={`relative grid place-items-center hs-marker${
        hovered ? " is-hovered" : ""
      }`}
      style={{ width: frameSize, height: frameSize, ...cssVars }}
    >
      {/* Wide atmospheric outer glow — the soft blue "cloud" from the
          reference art. Sits furthest back and breathes on hover. */}
      {hasFrame && (
        <span
          className="absolute rounded-full pointer-events-none hs-marker__aura"
          style={{
            width: "88%",
            height: "88%",
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--hs-glow) 55%, transparent) 0%, transparent 70%)",
            filter: "blur(6px)",
          }}
        />
      )}

      {/* Lens-flare cross — the 4-point sparkle seen on core/crosshair/hex. */}
      {(effectiveSkin === "core" ||
        effectiveSkin === "crosshair" ||
        effectiveSkin === "hexagon" ||
        effectiveSkin === "scanner") && (
        <span className="absolute inset-0 hs-lensflare" aria-hidden />
      )}

      {/* Skin overlay — behind the icon. */}
      {effectiveSkin !== "none" && <SkinLayer skin={effectiveSkin} />}

      {/* Icon holder with the chosen shape + glass backing. Only draws a
          backing/glow when the author actually picked a shape or skin, so a
          plain circle hotspot keeps its clean silhouette. The multi-layer
          boxShadow gives the reference tile: a bright inner edge, a coloured
          inner glow, and a wide coloured outer halo. */}
      <div
        className={`relative grid place-items-center overflow-hidden hs-marker__tile${
          hasFrame ? " has-frame" : ""
        }`}
        style={{
          width: size,
          height: size,
          clipPath: clipFor(effectiveShape),
          background: hasFrame
            ? `linear-gradient(158deg,
                 color-mix(in srgb, var(--hs-glow) 34%, var(--hs-fill)) 0%,
                 color-mix(in srgb, var(--hs-glow) 12%, var(--hs-fill)) 46%,
                 var(--hs-fill) 100%)`
            : undefined,
          borderRadius:
            effectiveShape === "circle"
              ? "50%"
              : effectiveShape === "square"
              ? "24%"
              : undefined,
          backdropFilter: hasFrame ? "blur(8px) saturate(140%)" : undefined,
          WebkitBackdropFilter: hasFrame
            ? "blur(8px) saturate(140%)"
            : undefined,
          boxShadow: hasFrame
            ? [
                // wide coloured outer halo (scales with intensity + hover)
                `0 0 calc(var(--hs-blur) * var(--hs-boost)) var(--hs-spread) color-mix(in srgb, var(--hs-glow) 65%, transparent)`,
                // tight bright outer ring
                `0 0 6px 1px color-mix(in srgb, var(--hs-glow) 90%, transparent)`,
                // bright inner edge (the crisp neon tube)
                `inset 0 0 0 1.5px rgba(255,255,255,0.88)`,
                // coloured inner glow just inside the edge
                `inset 0 0 14px 1px color-mix(in srgb, var(--hs-glow) 70%, transparent)`,
                // deep base so the tile reads as glass, not a flat chip
                `inset 0 -8px 18px -10px rgba(0,0,0,0.9)`,
              ].join(", ")
            : undefined,
        }}
      >
        {/* Top glass highlight — the glossy sheen across the upper half. */}
        {hasFrame && (
          <span
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.06) 40%, transparent 62%)",
            }}
          />
        )}
        <span
          className={`relative grid place-items-center${
            neon ? " hs-neon" : ""
          }`}
        >
          {children}
        </span>
      </div>
    </div>
  );
}

/* --------------------------- Shape masks -------------------------------- */

function clipFor(s: HotspotIconShape): string | undefined {
  switch (s) {
    case "square":
      return "inset(0 round 24%)";
    case "diamond":
      return "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)";
    case "hexagon":
      return "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)";
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
          <span className="absolute inset-[14%] rounded-full hs-skin-ring-mid" />
          <span className="absolute inset-[26%] rounded-full hs-skin-ring-inner" />
        </>
      );
    case "core":
      return (
        <>
          <span className="absolute inset-0 rounded-full hs-skin-core-halo" />
          <span className="absolute inset-[16%] rounded-full hs-skin-core-ring" />
        </>
      );
    case "crosshair":
      return (
        <>
          <span className="absolute inset-0 hs-skin-crosshair" aria-hidden />
          <span className="absolute inset-[18%] rounded-full hs-skin-crosshair-halo" />
        </>
      );
    case "hexagon":
      return <span className="absolute inset-0 hs-skin-hexagon" aria-hidden />;
    case "orbit":
      return (
        <>
          <span className="absolute inset-[14%] rounded-full hs-skin-orbit-ring" />
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
          <span className="absolute inset-[14%] rounded-md hs-skin-scanner-halo" />
        </>
      );
    default:
      return null;
  }
}
