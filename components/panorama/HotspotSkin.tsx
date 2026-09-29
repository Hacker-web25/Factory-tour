"use client";

/**
 * HotspotSkin — the premium overlay wrapper drawn around a hotspot's icon.
 *
 * Two families:
 *
 *   Classic  (ring/core/crosshair/hexagon/orbit/scanner) — a glass tile
 *   with layered CSS glow + a skin overlay behind the icon.
 *
 *   Premium Neon  (neon-hex / neon-radar / neon-crosshair / neon-pulse) —
 *   the reference sci-fi HUD art: crisp SVG rim shapes rendered with
 *   feGaussianBlur bloom, a bright whitish-blue neon treatment forced on
 *   the icon, and a signature top-right satellite arm ending in an
 *   orbiting node. Meant to feel like premium neon signage — no glass
 *   tile behind it, just the glowing artwork on the panorama.
 *
 * Everything is driven by CSS custom properties so a single set of
 * keyframes handles every colour + intensity:
 *
 *   --hs-glow    neon colour (auto-clamped to whitish-blue for neon-* skins)
 *   --hs-blur    glow blur radius in px (from glow_intensity)
 *   --hs-spread  glow spread radius in px
 *   --hs-fill    shape backing colour (rgba)
 *   --hs-boost   1 at rest, >1 while hovered (brightens the whole marker)
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

/** Identify the premium-neon family. */
function isNeonSkin(s: HotspotSkin): boolean {
  return (
    s === "neon-hex" ||
    s === "neon-radar" ||
    s === "neon-crosshair" ||
    s === "neon-pulse"
  );
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
  const neonFamily = isNeonSkin(effectiveSkin);

  // Map 0–200 intensity onto real glow radii. 100 → 16px blur / 3px spread.
  // The neon family runs hot by design, so intensity boosts a bigger base.
  const k = Math.max(0, Math.min(200, intensity ?? 100)) / 100;
  const blur = Math.round((neonFamily ? 26 : 16) * k);
  const spread = Math.round((neonFamily ? 5 : 3) * k);

  const hasFrame = effectiveSkin !== "none" || effectiveShape !== "circle";
  // Neon variants extend outward for the satellite arm — bigger canvas.
  const frameMul = neonFamily ? 2.35 : hasFrame ? 1.85 : 1;
  const frameSize = Math.round(size * frameMul);

  // Shape backing: glassy tint of the chosen fill (or the deep navy glass
  // from the reference tiles).
  const backing = fill ? hexToRgba(fill, 0.55) : "rgba(9,15,32,0.55)";

  // Neon skins lock the glow to the reference whitish-blue so the effect
  // stays consistent with the artwork. Authors can still tint the icon
  // itself; only the aura is clamped.
  const effectiveGlow = neonFamily ? "#7cd7ff" : glow;

  const cssVars = {
    ["--hs-glow" as string]: effectiveGlow,
    ["--hs-blur" as string]: `${blur}px`,
    ["--hs-spread" as string]: `${spread}px`,
    ["--hs-fill" as string]: backing,
    ["--hs-boost" as string]: hovered ? "1.5" : "1",
  } as React.CSSProperties;

  // ---------------- NEON FAMILY — crisp SVG render path ----------------
  if (neonFamily) {
    return (
      <div
        className={`relative grid place-items-center hs-marker hs-neon-frame${
          hovered ? " is-hovered" : ""
        }`}
        style={{ width: frameSize, height: frameSize, ...cssVars }}
      >
        {/* Ambient outer bloom — the soft blue "atmosphere" around the sign. */}
        <span className="absolute inset-0 pointer-events-none hs-neon-aura" />

        {/* The neon artwork itself, rendered as SVG for crisp glow. */}
        <NeonSkinSvg skin={effectiveSkin} />

        {/* Signature satellite arm going up-right, with the pulsing node. */}
        <NeonSatelliteArm frameSize={frameSize} />

        {/* Icon sits centered inside the shape's interior, boosted
            white-blue for the neon look. No fixed-size holder — the icon
            keeps its natural size and we scale it up so it visually fills
            the shape rather than looking lost inside a 2.35× frame. */}
        <span
          className="relative grid place-items-center hs-neon-icon"
          style={{
            width: size,
            height: size,
            transform: "scale(1.15)",
          }}
        >
          <span className={`grid place-items-center${neon ? " hs-neon" : ""}`}>
            {children}
          </span>
        </span>
      </div>
    );
  }

  // ---------------- CLASSIC family — glass tile + CSS skin ----------------
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

      {/* Icon holder with the chosen shape + glass backing. */}
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
                `0 0 calc(var(--hs-blur) * var(--hs-boost)) var(--hs-spread) color-mix(in srgb, var(--hs-glow) 65%, transparent)`,
                `0 0 6px 1px color-mix(in srgb, var(--hs-glow) 90%, transparent)`,
                `inset 0 0 0 1.5px rgba(255,255,255,0.88)`,
                `inset 0 0 14px 1px color-mix(in srgb, var(--hs-glow) 70%, transparent)`,
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
        {/* Neon bloom on the icon itself is only applied when there is
            an actual skin or shape frame. A truly "classic" hotspot
            (no skin, plain circle) renders as its raw icon with no
            drop-shadow at all — matching the original pre-skin look. */}
        <span
          className={`relative grid place-items-center${
            neon && hasFrame ? " hs-neon" : ""
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

/* --------------------------- Neon SVG renderers ------------------------ */

/**
 * The premium-neon shapes render as SVG at a fixed 200×200 viewBox and
 * are stretched to fill the marker's frame. Every stroke uses a stack of
 * three shared filters:
 *
 *   #vpv-neon-bloom-wide   — soft ambient bloom (stdDev 6)
 *   #vpv-neon-bloom        — mid neon halo    (stdDev 2.5)
 *   #vpv-neon-core         — crisp white core (stdDev 0.6)
 *
 * The filters live under a single <defs> in every SvgShell so referencing
 * them by id is safe even with multiple hotspots on screen.
 */
function SvgShell({ children }: { children: React.ReactNode }) {
  return (
    <svg
      className="absolute inset-0 pointer-events-none hs-neon-svg"
      viewBox="0 0 200 200"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <defs>
        <filter id="vpv-neon-bloom-wide" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id="vpv-neon-bloom" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
        <filter id="vpv-neon-core" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.6" />
        </filter>
        <radialGradient id="vpv-neon-center" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style={{ stopColor: "#ffffff", stopOpacity: 1 }} />
          <stop offset="55%" style={{ stopColor: "var(--hs-glow)", stopOpacity: 0.85 }} />
          <stop offset="100%" style={{ stopColor: "var(--hs-glow)", stopOpacity: 0 }} />
        </radialGradient>
      </defs>
      {children}
    </svg>
  );
}

function NeonSkinSvg({ skin }: { skin: HotspotSkin }) {
  switch (skin) {
    case "neon-hex":
      return <NeonHex />;
    case "neon-radar":
      return <NeonRadar />;
    case "neon-crosshair":
      return <NeonCrosshair />;
    case "neon-pulse":
      return <NeonPulse />;
    default:
      return null;
  }
}

/** Reusable neon stroke stack — wide bloom under, coloured halo, crisp core. */
function NeonStroke({
  d,
  strokeWidth = 4,
}: {
  d: string;
  strokeWidth?: number;
}) {
  return (
    <>
      <path
        d={d}
        fill="none"
        stroke="var(--hs-glow)"
        strokeWidth={strokeWidth + 6}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.55"
        filter="url(#vpv-neon-bloom-wide)"
      />
      <path
        d={d}
        fill="none"
        stroke="var(--hs-glow)"
        strokeWidth={strokeWidth + 2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
        filter="url(#vpv-neon-bloom)"
      />
      <path
        d={d}
        fill="none"
        stroke="#ffffff"
        strokeWidth={strokeWidth * 0.55}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#vpv-neon-core)"
      />
    </>
  );
}

/** 1 — Hexagon rim. The reference image is a bold hex sign. */
function NeonHex() {
  // Points of a flat-top hex centered on 100,100 at radius 66.
  const R = 66;
  const cx = 100;
  const cy = 100;
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${cx + Math.cos(a) * R},${cy + Math.sin(a) * R}`;
  });
  const outer = `M ${pts.join(" L ")} Z`;
  const inner = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${cx + Math.cos(a) * (R - 12)},${cy + Math.sin(a) * (R - 12)}`;
  });
  return (
    <SvgShell>
      <g className="hs-neon-breathe">
        <NeonStroke d={outer} strokeWidth={4.5} />
        <path
          d={`M ${inner.join(" L ")} Z`}
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.55"
          strokeWidth="1"
        />
        {/* Vertex sparkles at each hex point. */}
        {pts.map((p, i) => {
          const [x, y] = p.split(",").map(Number);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="2.2"
              fill="#ffffff"
              filter="url(#vpv-neon-bloom)"
              className="hs-neon-spark"
              style={{ animationDelay: `${i * 0.18}s` }}
            />
          );
        })}
      </g>
    </SvgShell>
  );
}

/** 2 — Radar rings with 4 satellite dots on the outer orbit. */
function NeonRadar() {
  const cx = 100;
  const cy = 100;
  const outerR = 60;
  const midR = 44;
  const innerR = 28;
  const dots = [
    { a: -Math.PI / 2 },
    { a: 0 },
    { a: Math.PI / 2 },
    { a: Math.PI },
  ];
  return (
    <SvgShell>
      <NeonStroke d={ringPath(cx, cy, outerR)} strokeWidth={3.5} />
      <NeonStroke d={ringPath(cx, cy, midR)} strokeWidth={2.5} />
      <NeonStroke d={ringPath(cx, cy, innerR)} strokeWidth={2} />
      {/* Crosshair inside the innermost ring. */}
      <g opacity="0.85">
        <NeonStroke
          d={`M ${cx - innerR + 4} ${cy} L ${cx + innerR - 4} ${cy}`}
          strokeWidth={1.6}
        />
        <NeonStroke
          d={`M ${cx} ${cy - innerR + 4} L ${cx} ${cy + innerR - 4}`}
          strokeWidth={1.6}
        />
      </g>
      {/* Satellite dots on the outer orbit. */}
      {dots.map((d, i) => {
        const x = cx + Math.cos(d.a) * outerR;
        const y = cy + Math.sin(d.a) * outerR;
        return (
          <g key={i} className="hs-neon-spark" style={{ animationDelay: `${i * 0.22}s` }}>
            <circle cx={x} cy={y} r="8" fill="var(--hs-glow)" opacity="0.55" filter="url(#vpv-neon-bloom)" />
            <circle cx={x} cy={y} r="3" fill="#ffffff" />
          </g>
        );
      })}
      {/* Sweeping radar arm. */}
      <g className="hs-neon-radar-sweep" style={{ transformOrigin: "100px 100px" }}>
        <path
          d={`M ${cx} ${cy} L ${cx + outerR - 4} ${cy}`}
          stroke="#ffffff"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.9"
        />
      </g>
    </SvgShell>
  );
}

/** 3 — Precision crosshair with tick marks and a bright core. */
function NeonCrosshair() {
  const cx = 100;
  const cy = 100;
  const R = 54;
  const inner = 20;
  return (
    <SvgShell>
      {/* Broken outer ring — 4 arcs separated by ticks. */}
      {[0, 1, 2, 3].map((i) => {
        const start = i * 90 + 12;
        const end = i * 90 + 78;
        return (
          <g key={i}>
            <NeonStroke d={arcPath(cx, cy, R, start, end)} strokeWidth={3} />
          </g>
        );
      })}
      {/* Tick marks at the cardinal points. */}
      {[0, 90, 180, 270].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = cx + Math.cos(rad) * (R + 4);
        const y1 = cy + Math.sin(rad) * (R + 4);
        const x2 = cx + Math.cos(rad) * (R + 14);
        const y2 = cy + Math.sin(rad) * (R + 14);
        return (
          <NeonStroke
            key={deg}
            d={`M ${x1} ${y1} L ${x2} ${y2}`}
            strokeWidth={2.2}
          />
        );
      })}
      {/* Inner faint ring. */}
      <NeonStroke d={ringPath(cx, cy, inner)} strokeWidth={1.6} />
      {/* Crosshair cross. */}
      <NeonStroke
        d={`M ${cx - R + 8} ${cy} L ${cx - inner - 2} ${cy}`}
        strokeWidth={1.8}
      />
      <NeonStroke
        d={`M ${cx + inner + 2} ${cy} L ${cx + R - 8} ${cy}`}
        strokeWidth={1.8}
      />
      <NeonStroke
        d={`M ${cx} ${cy - R + 8} L ${cx} ${cy - inner - 2}`}
        strokeWidth={1.8}
      />
      <NeonStroke
        d={`M ${cx} ${cy + inner + 2} L ${cx} ${cy + R - 8}`}
        strokeWidth={1.8}
      />
      {/* Bright centre dot. */}
      <circle cx={cx} cy={cy} r="14" fill="url(#vpv-neon-center)" className="hs-neon-breathe" />
      <circle cx={cx} cy={cy} r="4.5" fill="#ffffff" filter="url(#vpv-neon-core)" />
    </SvgShell>
  );
}

/** 4 — Radial pulse — concentric rings emanating from a bright core. */
function NeonPulse() {
  const cx = 100;
  const cy = 100;
  return (
    <SvgShell>
      {/* Static base rings. */}
      <NeonStroke d={ringPath(cx, cy, 30)} strokeWidth={2} />
      <NeonStroke d={ringPath(cx, cy, 46)} strokeWidth={1.8} />
      <NeonStroke d={ringPath(cx, cy, 62)} strokeWidth={1.5} />
      {/* Ripple rings expanding outward. */}
      <circle
        cx={cx}
        cy={cy}
        r="20"
        fill="none"
        stroke="#ffffff"
        strokeWidth="1.2"
        opacity="0.9"
        filter="url(#vpv-neon-bloom)"
        className="hs-neon-ripple"
      />
      <circle
        cx={cx}
        cy={cy}
        r="20"
        fill="none"
        stroke="#ffffff"
        strokeWidth="1"
        opacity="0.7"
        filter="url(#vpv-neon-bloom)"
        className="hs-neon-ripple"
        style={{ animationDelay: "0.9s" }}
      />
      {/* Cardinal streaks — the 4-point star sparkle from the reference. */}
      {[0, 90, 180, 270].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = cx + Math.cos(rad) * 4;
        const y1 = cy + Math.sin(rad) * 4;
        const x2 = cx + Math.cos(rad) * 72;
        const y2 = cy + Math.sin(rad) * 72;
        return (
          <line
            key={deg}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#ffffff"
            strokeWidth="1"
            opacity="0.55"
            filter="url(#vpv-neon-bloom)"
          />
        );
      })}
      {/* Bright core. */}
      <circle cx={cx} cy={cy} r="22" fill="url(#vpv-neon-center)" className="hs-neon-breathe" />
      <circle cx={cx} cy={cy} r="7" fill="#ffffff" filter="url(#vpv-neon-core)" />
    </SvgShell>
  );
}

/* -------- helpers -------- */

/** A full circle as an SVG path so it flows through the same stroke stack. */
function ringPath(cx: number, cy: number, r: number): string {
  return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy}`;
}

/** Arc between two angles in degrees, measured clockwise from +x. */
function arcPath(cx: number, cy: number, r: number, a1: number, a2: number): string {
  const r1 = (a1 * Math.PI) / 180;
  const r2 = (a2 * Math.PI) / 180;
  const x1 = cx + Math.cos(r1) * r;
  const y1 = cy + Math.sin(r1) * r;
  const x2 = cx + Math.cos(r2) * r;
  const y2 = cy + Math.sin(r2) * r;
  const large = a2 - a1 > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

/* -------- Signature satellite arm (top-right of every neon skin) -------- */

/**
 * The reference art always has a small offshoot: a thin line running up and
 * to the right into a ringed node. We draw it as an SVG overlay sized to
 * the frame so it stays crisp at any hotspot scale.
 */
function NeonSatelliteArm({ frameSize }: { frameSize: number }) {
  // Anchor point on the OUTSIDE of the shape (roughly the top-right vertex
  // of a hex at radius ~66) and the far node. Coordinates in the same
  // 200×200 space as the SkinSvg for consistency. Starting outside every
  // shape means the line reads as an offshoot rather than crossing the rim.
  const cx = 100;
  const cy = 100;
  const start = { x: cx + 54, y: cy - 54 };
  const end = { x: cx + 92, y: cy - 92 };
  return (
    <svg
      className="absolute inset-0 pointer-events-none hs-neon-arm"
      viewBox="0 0 200 200"
      preserveAspectRatio="xMidYMid meet"
      style={{ width: frameSize, height: frameSize }}
      aria-hidden
    >
      {/* soft bloom under the line */}
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke="var(--hs-glow)"
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.55"
        filter="url(#vpv-neon-bloom-wide)"
      />
      {/* crisp white core */}
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke="#ffffff"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* inner anchor node */}
      <circle
        cx={start.x}
        cy={start.y}
        r="3"
        fill="#ffffff"
        className="hs-neon-arm-node"
      />
      {/* outer ringed node */}
      <g>
        <circle
          cx={end.x}
          cy={end.y}
          r="10"
          fill="var(--hs-glow)"
          opacity="0.35"
          filter="url(#vpv-neon-bloom-wide)"
        />
        <circle
          cx={end.x}
          cy={end.y}
          r="7"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.4"
          className="hs-neon-arm-orbit"
        />
        <circle
          cx={end.x}
          cy={end.y}
          r="3.4"
          fill="#ffffff"
        />
      </g>
    </svg>
  );
}
