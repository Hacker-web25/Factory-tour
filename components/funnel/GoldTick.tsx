"use client";

/**
 * GoldTick — the VPV mark that turns into a gold tick when a payment is
 * confirmed.
 *
 *   waiting   The VPV wordmark sits in a white disc while a thin gold arc
 *             circles it ("we are confirming with your bank").
 *   done      The wordmark gives way to the V of VPV, and that V bends into
 *             a tick: its left arm shortens and drops, its right arm
 *             lengthens, and its colour runs from VPV blue to gold. A gold
 *             ring draws itself around the disc and a ring of gold sparks
 *             bursts outwards. Then a slow glow keeps breathing.
 *
 * Built for a steady 60 fps: the morph writes the path's `d` attribute from
 * requestAnimationFrame (no React re-render per frame), and everything else
 * animates opacity, transform or stroke-dashoffset only. Nothing animates a
 * `transform` attribute, so CSS never fights SVG for an element.
 *
 * With "reduce motion" switched on, it shows the finished state straight away.
 */

import { useEffect, useRef, useState } from "react";

type Pt = [number, number];
/** The V of the VPV mark: two equal arms meeting at the bottom. */
const V: [Pt, Pt, Pt] = [
  [63, 74],
  [100, 128],
  [137, 74],
];
/** The tick: a short left arm and a long right arm. */
const TICK: [Pt, Pt, Pt] = [
  [64, 103],
  [89, 128],
  [140, 76],
];

const RING_R = 92;
const RING_C = 2 * Math.PI * RING_R;

/** Timings, in ms from the moment "done" begins. */
const T = {
  vIn: [0, 380],
  morph: [320, 1080],
  ring: [120, 1100],
  burst: 980,
  complete: 1350,
} as const;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
/** A soft overshoot for the final settle of the tick. */
const easeOutBack = (x: number) => {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

function pathFor(t: number): string {
  const p = V.map((v, i) => {
    const k = TICK[i];
    return [v[0] + (k[0] - v[0]) * t, v[1] + (k[1] - v[1]) * t] as Pt;
  });
  return `M${p[0][0].toFixed(2)} ${p[0][1].toFixed(2)} L${p[1][0].toFixed(2)} ${p[1][1].toFixed(2)} L${p[2][0].toFixed(2)} ${p[2][1].toFixed(2)}`;
}

const SPARKS = Array.from({ length: 16 }, (_, i) => {
  const angle = (i / 16) * Math.PI * 2 + (i % 2 ? 0.09 : 0);
  return { angle, dist: i % 2 ? 0.66 : 0.74, size: i % 3 === 0 ? 7 : 5, delay: (i % 4) * 24 };
});

export default function GoldTick({
  state,
  size = 220,
  onComplete,
}: {
  state: "waiting" | "done";
  size?: number;
  /** Called once when the tick has settled, to reveal the words around it. */
  onComplete?: () => void;
}) {
  const blueRef = useRef<SVGPathElement>(null);
  const goldRef = useRef<SVGPathElement>(null);
  const [stage, setStage] = useState<"waiting" | "morphing" | "settled">("waiting");
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  useEffect(() => {
    if (state !== "done") return;
    const reduce =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const paint = (morphT: number, vInT: number) => {
      const d = pathFor(morphT);
      const blue = blueRef.current;
      const gold = goldRef.current;
      if (blue && gold) {
        blue.setAttribute("d", d);
        gold.setAttribute("d", d);
        // Colour runs from blue to gold across the morph.
        const g = clamp01((morphT - 0.15) / 0.7);
        blue.style.opacity = String(vInT * (1 - g));
        gold.style.opacity = String(vInT * g);
        const s = 0.72 + 0.28 * vInT;
        blue.style.transform = gold.style.transform = `scale(${s})`;
      }
    };

    if (reduce) {
      paint(1, 1);
      setStage("settled");
      completeRef.current?.();
      return;
    }

    setStage("morphing");
    let raf = 0;
    let done = false;
    const t0 = performance.now();
    const frame = (now: number) => {
      const e = now - t0;
      const vIn = easeInOut(clamp01((e - T.vIn[0]) / (T.vIn[1] - T.vIn[0])));
      const m = clamp01((e - T.morph[0]) / (T.morph[1] - T.morph[0]));
      // Ease in-out for most of the bend, with a gentle overshoot at the end.
      const mt = m < 1 ? easeOutBack(easeInOut(m)) : 1;
      paint(mt, vIn);
      if (e >= T.complete && !done) {
        done = true;
        setStage("settled");
        completeRef.current?.();
      }
      if (e < T.complete + 50) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [state]);

  const active = stage !== "waiting";

  return (
    <div
      className="vpv-gt relative"
      style={{ width: size, height: size }}
      role="img"
      aria-label={state === "done" ? "Payment confirmed" : "Confirming your payment"}
      data-testid="gold-tick"
      data-state={stage}
    >
      {/* Breathing halo behind the disc. */}
      <div className={`vpv-gt-halo ${stage === "settled" ? "is-on" : ""}`} aria-hidden />

      {/* Sparks burst outward once the tick lands. */}
      <div className="absolute inset-0" aria-hidden>
        {SPARKS.map((s, i) => (
          <span
            key={i}
            className={`vpv-gt-spark ${active ? "is-on" : ""}`}
            style={
              {
                width: s.size,
                height: s.size,
                marginLeft: -s.size / 2,
                marginTop: -s.size / 2,
                "--dx": `${Math.cos(s.angle) * size * s.dist}px`,
                "--dy": `${Math.sin(s.angle) * size * s.dist}px`,
                animationDelay: `${T.burst + s.delay}ms`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <svg viewBox="0 0 200 200" width={size} height={size} className="relative block" aria-hidden>
        <defs>
          <linearGradient id="vpv-gt-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FCE7A2" />
            <stop offset="0.45" stopColor="#E9B949" />
            <stop offset="1" stopColor="#B7791F" />
          </linearGradient>
          <linearGradient id="vpv-gt-gold-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFF1C1" />
            <stop offset="0.5" stopColor="#E9B949" />
            <stop offset="1" stopColor="#C68A1E" />
          </linearGradient>
          <linearGradient id="vpv-gt-blue" x1="0" y1="0" x2="1" y2="0.6">
            <stop offset="0" stopColor="#0A3FC2" />
            <stop offset="0.6" stopColor="#0B6CF0" />
            <stop offset="1" stopColor="#11D2F5" />
          </linearGradient>
          <radialGradient id="vpv-gt-disc" cx="0.5" cy="0.38" r="0.7">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#F4F1E8" />
          </radialGradient>
        </defs>

        {/* The disc and its faint track. */}
        <circle cx="100" cy="100" r={RING_R} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="3" />
        <circle cx="100" cy="100" r="84" fill="url(#vpv-gt-disc)" />

        {/* Waiting: a gold arc circling. */}
        <g className={`vpv-gt-spin ${active ? "is-off" : ""}`}>
          <circle
            cx="100"
            cy="100"
            r={RING_R}
            fill="none"
            stroke="url(#vpv-gt-gold-ring)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${RING_C * 0.18} ${RING_C}`}
          />
        </g>

        {/* Done: the full gold ring draws itself from the top. */}
        <g transform="rotate(-90 100 100)">
          <circle
            className={`vpv-gt-ring ${active ? "is-on" : ""}`}
            cx="100"
            cy="100"
            r={RING_R}
            fill="none"
            stroke="url(#vpv-gt-gold-ring)"
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C}
          />
        </g>

        {/* The VPV wordmark, which gives way to its own V. */}
        <g className={`vpv-gt-word ${active ? "is-off" : ""}`}>
          <image href="/vpv-logo-transparent.png" x="38" y="83" width="124" height="34.7" preserveAspectRatio="xMidYMid meet" />
        </g>

        {/* The V → tick. Two copies so the colour can cross-fade. */}
        <path
          ref={blueRef}
          className="vpv-gt-stroke"
          d={pathFor(0)}
          fill="none"
          stroke="url(#vpv-gt-blue)"
          strokeWidth="15"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: 0 }}
        />
        <path
          ref={goldRef}
          className="vpv-gt-stroke"
          d={pathFor(0)}
          fill="none"
          stroke="url(#vpv-gt-gold)"
          strokeWidth="15"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: 0 }}
        />
      </svg>

      <style>{`
        .vpv-gt-stroke { transform-box: view-box; transform-origin: 100px 100px; will-change: transform, opacity; }
        .vpv-gt-spin { transform-box: view-box; transform-origin: 100px 100px; animation: vpv-gt-spin 1.15s linear infinite; transition: opacity .3s ease; }
        .vpv-gt-spin.is-off { opacity: 0; }
        .vpv-gt-word { transform-box: view-box; transform-origin: 100px 100px; transition: opacity .34s ease, transform .42s cubic-bezier(.4,0,.2,1), filter .34s ease; }
        .vpv-gt-word.is-off { opacity: 0; transform: scale(.62); filter: blur(3px); }
        .vpv-gt-ring { transition: stroke-dashoffset .98s cubic-bezier(.65,0,.35,1) .12s; }
        .vpv-gt-ring.is-on { stroke-dashoffset: 0; }
        .vpv-gt-halo {
          position: absolute; inset: -18%; border-radius: 9999px; pointer-events: none;
          background: radial-gradient(closest-side, rgba(233,185,73,.42), rgba(233,185,73,.12) 55%, rgba(233,185,73,0) 72%);
          opacity: 0; transform: scale(.85); transition: opacity .8s ease, transform .9s cubic-bezier(.2,.8,.2,1);
        }
        .vpv-gt-halo.is-on { opacity: 1; transform: scale(1); animation: vpv-gt-breathe 3.6s ease-in-out 1s infinite; }
        .vpv-gt-spark {
          position: absolute; left: 50%; top: 50%; border-radius: 9999px; opacity: 0;
          background: radial-gradient(circle, #FFF4CC 0%, #E9B949 60%, rgba(233,185,73,0) 100%);
          will-change: transform, opacity;
        }
        .vpv-gt-spark.is-on { animation: vpv-gt-burst 900ms cubic-bezier(.15,.75,.3,1) both; }
        @keyframes vpv-gt-spin { to { transform: rotate(360deg); } }
        @keyframes vpv-gt-breathe { 0%,100% { opacity: .75; transform: scale(.97); } 50% { opacity: 1; transform: scale(1.04); } }
        @keyframes vpv-gt-burst {
          0% { opacity: 0; transform: translate(0,0) scale(.4); }
          15% { opacity: 1; }
          100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .vpv-gt-spin { animation-duration: 3s; }
          .vpv-gt-word, .vpv-gt-ring, .vpv-gt-halo { transition: none; }
          .vpv-gt-halo.is-on { animation: none; }
          .vpv-gt-spark.is-on { animation: none; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
