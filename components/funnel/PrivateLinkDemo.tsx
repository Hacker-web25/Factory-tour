/**
 * PrivateLinkDemo — an animated demonstration of VPV Control's sharing
 * controls: your laptop sends a tour link to your buyer, the buyer opens it,
 * and when the link is passed on to a competitor it is stopped.
 *
 * It plays the four controls the page promises, one after another:
 *   one-time links · links that expire · device limits · password protection
 *
 * Drawn in SVG with CSS keyframes (no video, no library), so it is crisp on
 * any screen, weighs a few kilobytes and never shows a broken player. Each
 * scene remounts its SVG, which restarts the keyframes. Visitors who ask for
 * reduced motion see each scene's final frame and step through with the dots.
 */

"use client";

import { useEffect, useRef, useState } from "react";

type Scene = {
  id: string;
  title: string;
  caption: string;
  /** What the buyer's phone says once the link opens for them. */
  buyerNote: string;
  /** Badge shown on the link pill while it travels. */
  pill: string;
  /** Why the competitor is stopped. */
  blocked: string;
};

const SCENES: Scene[] = [
  {
    id: "one-time",
    title: "One-time links",
    caption: "The link opens once, for your buyer. Forwarded, it is already dead.",
    buyerNote: "Opened",
    pill: "1 use",
    blocked: "Link already used",
  },
  {
    id: "expiry",
    title: "Links that expire",
    caption: "Give a link 24 hours or a week. After that it stops working for everyone.",
    buyerNote: "Opened in time",
    pill: "24 h",
    blocked: "Link expired",
  },
  {
    id: "devices",
    title: "Device limits",
    caption: "Choose how many devices a link works on. The next device is refused.",
    buyerNote: "2 of 2 devices",
    pill: "2 devices",
    blocked: "Device limit reached",
  },
  {
    id: "password",
    title: "Password protection",
    caption: "Only the buyer you gave the password to gets in.",
    buyerNote: "Password correct",
    pill: "Password",
    blocked: "Wrong password",
  },
];

const SCENE_MS = 5200;

export default function PrivateLinkDemo() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReduced(mq.matches);
      const on = () => setReduced(mq.matches);
      mq.addEventListener?.("change", on);
      return () => mq.removeEventListener?.("change", on);
    } catch {
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (paused || reduced) return;
    timer.current = setTimeout(() => setI((n) => (n + 1) % SCENES.length), SCENE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [i, paused, reduced]);

  const s = SCENES[i];

  return (
    <div
      className="vpl relative overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      data-testid="private-link-demo"
    >
      <style>{CSS}</style>
      <div className="relative aspect-video w-full">
        <svg
          key={`${s.id}-${i}`}
          viewBox="0 0 640 360"
          className={`absolute inset-0 h-full w-full ${reduced ? "vpl-still" : ""}`}
          role="img"
          aria-label={`${s.title}: ${s.caption}`}
        >
          <defs>
            <linearGradient id="vpl-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#0A1A33" />
              <stop offset="1" stopColor="#0C1017" />
            </linearGradient>
            <linearGradient id="vpl-brand" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#0B3D91" />
              <stop offset=".52" stopColor="#1468D8" />
              <stop offset="1" stopColor="#19B8F2" />
            </linearGradient>
            <radialGradient id="vpl-glow" cx=".5" cy=".5" r=".5">
              <stop offset="0" stopColor="#19B8F2" stopOpacity=".35" />
              <stop offset="1" stopColor="#19B8F2" stopOpacity="0" />
            </radialGradient>
            <filter id="vpl-soft" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>

          <rect width="640" height="360" fill="url(#vpl-bg)" />
          {/* faint grid */}
          <g opacity=".07" stroke="#9CC3FF" strokeWidth="1">
            {Array.from({ length: 16 }, (_, k) => (
              <line key={`v${k}`} x1={k * 40} y1="0" x2={k * 40} y2="360" />
            ))}
            {Array.from({ length: 9 }, (_, k) => (
              <line key={`h${k}`} x1="0" y1={k * 40} x2="640" y2={k * 40} />
            ))}
          </g>

          {/* routes */}
          <path d="M248 150 C 330 110, 370 92, 436 96" className="vpl-route" />
          <path d="M500 150 C 512 196, 512 216, 500 250" className="vpl-route vpl-route-red" />

          {/* ── the laptop, guarding the link ── */}
          <g transform="translate(60 92)">
            <circle cx="96" cy="64" r="96" fill="url(#vpl-glow)" className="vpl-pulse" />
            <rect x="8" y="0" width="176" height="112" rx="10" fill="#132341" stroke="#2C4A7A" strokeWidth="2" />
            <rect x="18" y="10" width="156" height="92" rx="5" fill="#0E1A30" />
            <rect x="18" y="10" width="156" height="16" rx="5" fill="#16294A" />
            <circle cx="28" cy="18" r="2.5" fill="#FF6B6B" />
            <circle cx="37" cy="18" r="2.5" fill="#FFC857" />
            <circle cx="46" cy="18" r="2.5" fill="#3DDC97" />
            <text x="96" y="46" textAnchor="middle" className="vpl-t vpl-t-dim">Your factory tour</text>
            <rect x="34" y="56" width="124" height="22" rx="11" fill="url(#vpl-brand)" />
            <text x="96" y="71" textAnchor="middle" className="vpl-t vpl-t-w">myvpv.com/t/••••</text>
            <path d="M0 116 h192 l-14 12 h-164 z" fill="#1B2F55" />
            {/* shield */}
            {/* CSS transforms replace an SVG transform attribute, so the
                animated element always sits inside a positioned group. */}
            <g transform="translate(150 -14)">
              <g className="vpl-shield">
                <path d="M20 0 L40 7 V22 C40 34 31 42 20 46 C9 42 0 34 0 22 V7 Z" fill="url(#vpl-brand)" stroke="#BFE3FF" strokeWidth="1.5" />
                <path d="M12 23 l6 6 l11 -12" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            </g>
            <text x="96" y="150" textAnchor="middle" className="vpl-t vpl-t-lbl">You</text>
          </g>

          {/* ── the buyer ── */}
          <g transform="translate(436 54)">
            <rect x="0" y="0" width="128" height="92" rx="14" fill="#122B1F" stroke="#2F8F5B" strokeWidth="2" className="vpl-buyer-card" />
            <circle cx="30" cy="30" r="13" fill="#2F8F5B" />
            <circle cx="30" cy="26" r="5" fill="#D9FBE8" />
            <path d="M20 39 c3 -7 17 -7 20 0" fill="#D9FBE8" />
            <text x="50" y="27" className="vpl-t vpl-t-w">Buyer</text>
            <text x="50" y="40" className="vpl-t vpl-t-dim">you chose</text>
            <g className="vpl-ok">
              <circle cx="64" cy="66" r="11" fill="#3DDC97" />
              <path d="M58 66 l4 4 l8 -8" fill="none" stroke="#0C1017" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          </g>
          <text x="500" y="164" textAnchor="middle" className="vpl-t vpl-t-ok vpl-ok">{s.buyerNote}</text>

          {/* ── the competitor ── */}
          <g transform="translate(436 252)">
            <rect x="0" y="0" width="128" height="78" rx="14" fill="#2A1418" stroke="#7A2B36" strokeWidth="2" className="vpl-comp-card" />
            <circle cx="30" cy="28" r="13" fill="#7A2B36" />
            <circle cx="30" cy="24" r="5" fill="#FFD9DE" />
            <path d="M20 37 c3 -7 17 -7 20 0" fill="#FFD9DE" />
            <text x="50" y="25" className="vpl-t vpl-t-w">Competitor</text>
            <text x="50" y="38" className="vpl-t vpl-t-dim">forwarded to</text>
            <g className="vpl-no">
              <circle cx="64" cy="60" r="10" fill="#FF5A6A" />
              <path d="M59 55 l10 10 M69 55 l-10 10" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
            </g>
          </g>

          {/* the barrier the forwarded link hits */}
          <g transform="translate(474 200)">
            <g className="vpl-wall">
              <rect x="-6" y="-6" width="64" height="12" rx="6" fill="#FF5A6A" opacity=".25" filter="url(#vpl-soft)" />
              <rect x="0" y="-3" width="52" height="6" rx="3" fill="#FF5A6A" />
            </g>
          </g>
          <g className="vpl-blocked">
            <rect x="318" y="190" width="132" height="24" rx="12" fill="#3A161C" stroke="#FF5A6A" strokeWidth="1.2" />
            <text x="384" y="206" textAnchor="middle" className="vpl-t vpl-t-bad">{s.blocked}</text>
          </g>

          {/* ── the link pill, travelling ── */}
          <g className="vpl-pill1">
            <rect x="-34" y="-12" width="68" height="24" rx="12" fill="url(#vpl-brand)" stroke="#BFE3FF" strokeWidth="1" />
            <text x="0" y="4" textAnchor="middle" className="vpl-t vpl-t-w">{s.pill}</text>
          </g>
          <g className="vpl-pill2">
            <rect x="-34" y="-12" width="68" height="24" rx="12" fill="#3B2A55" stroke="#C9A7FF" strokeWidth="1" />
            <text x="0" y="4" textAnchor="middle" className="vpl-t vpl-t-w">{s.pill}</text>
          </g>

          {/* scene-specific touches */}
          {s.id === "expiry" && (
            <g transform="translate(320 52)" className="vpl-clock">
              <circle r="16" fill="#132341" stroke="#19B8F2" strokeWidth="2" />
              <line x1="0" y1="0" x2="0" y2="-10" stroke="#fff" strokeWidth="2" strokeLinecap="round" className="vpl-hand" />
              <circle r="2" fill="#fff" />
            </g>
          )}
          {s.id === "password" && (
            <g transform="translate(396 48)" className="vpl-dots">
              <rect x="-28" y="-11" width="56" height="22" rx="6" fill="#132341" stroke="#2C4A7A" />
              {[0, 1, 2, 3].map((d) => (
                <circle key={d} cx={-15 + d * 10} cy="0" r="3" fill="#fff" className={`vpl-dot vpl-dot${d}`} />
              ))}
            </g>
          )}
          {s.id === "devices" && (
            <g transform="translate(576 74)" className="vpl-dev">
              <rect x="0" y="0" width="22" height="34" rx="4" fill="#132341" stroke="#3DDC97" strokeWidth="1.5" />
              <rect x="6" y="40" width="28" height="18" rx="3" fill="#132341" stroke="#3DDC97" strokeWidth="1.5" />
            </g>
          )}

          {/* headline */}
          <text x="24" y="34" className="vpl-t vpl-head">Your link stays with your buyer.</text>
          <text x="24" y="54" className="vpl-t vpl-sub">Not with your competitors.</text>
        </svg>
      </div>

      {/* caption + scene picker */}
      <div className="flex flex-col gap-3 border-t border-white/10 bg-[#0C1017] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0" aria-live="polite">
          <p className="text-[14.5px] font-semibold text-white">{s.title}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-white/70">{s.caption}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5" role="tablist" aria-label="Sharing controls">
          {SCENES.map((x, k) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={k === i}
              aria-label={x.title}
              onClick={() => setI(k)}
              className="group relative h-2 overflow-hidden rounded-full bg-white/15 transition-all"
              style={{ width: k === i ? 34 : 10 }}
            >
              {k === i && (
                <span
                  key={`${x.id}-${i}`}
                  className={`absolute inset-y-0 left-0 rounded-full bg-[#19B8F2] ${paused || reduced ? "w-full" : "vpl-bar"}`}
                  style={{ animationDuration: `${SCENE_MS}ms` }}
                />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Timeline of one scene (5.2 s):
 *   0.3–1.4 s  the link travels from your laptop to the buyer
 *   1.4 s      the buyer's tick appears
 *   2.1–3.0 s  the buyer forwards it toward the competitor…
 *   3.0 s      …it hits the barrier, the competitor's cross and the reason appear */
const CSS = `
.vpl .vpl-t{font-family:Inter,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
.vpl .vpl-t-w{fill:#fff;font-size:11px;font-weight:600}
.vpl .vpl-t-dim{fill:#9FB3D1;font-size:9.5px}
.vpl .vpl-t-lbl{fill:#CFE0FF;font-size:12px;font-weight:600}
.vpl .vpl-t-ok{fill:#3DDC97;font-size:11px;font-weight:600}
.vpl .vpl-t-bad{fill:#FF8A96;font-size:10.5px;font-weight:700}
.vpl .vpl-head{fill:#fff;font-size:17px;font-weight:700;letter-spacing:-.01em}
.vpl .vpl-sub{fill:#19B8F2;font-size:13px;font-weight:600}
.vpl .vpl-route{fill:none;stroke:#2C4A7A;stroke-width:2;stroke-dasharray:4 6}
.vpl .vpl-route-red{stroke:#5A2630}
.vpl .vpl-pill1,.vpl .vpl-pill2,.vpl .vpl-ok,.vpl .vpl-no,.vpl .vpl-wall,.vpl .vpl-blocked{animation-fill-mode:both;animation-timing-function:cubic-bezier(.4,0,.2,1)}
.vpl .vpl-pill1{animation:vpl-p1 5.2s both}
.vpl .vpl-pill2{animation:vpl-p2 5.2s both}
.vpl .vpl-ok{animation:vpl-pop 5.2s both;animation-name:vpl-ok;transform-box:fill-box;transform-origin:center}
.vpl .vpl-no{animation:vpl-no 5.2s both;transform-box:fill-box;transform-origin:center}
.vpl .vpl-wall{animation:vpl-wall 5.2s both;transform-box:fill-box;transform-origin:center}
.vpl .vpl-blocked{animation:vpl-blk 5.2s both}
.vpl .vpl-comp-card{animation:vpl-red 5.2s both}
.vpl .vpl-shield{animation:vpl-shield 2.6s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
.vpl .vpl-pulse{animation:vpl-pulse 2.6s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
.vpl .vpl-hand{animation:vpl-spin 3s linear both;transform-origin:0 0}
.vpl .vpl-dot{opacity:0;animation:vpl-dot 5.2s both}
.vpl .vpl-dot1{animation-delay:.15s}.vpl .vpl-dot2{animation-delay:.3s}.vpl .vpl-dot3{animation-delay:.45s}
.vpl .vpl-bar{width:0;animation:vpl-bar linear forwards}
@keyframes vpl-p1{0%,5%{transform:translate(250px,150px);opacity:0}8%{opacity:1}17%{transform:translate(340px,112px)}27%{transform:translate(436px,96px);opacity:1}31%,100%{transform:translate(452px,96px);opacity:0}}
@keyframes vpl-p2{0%,38%{transform:translate(500px,150px);opacity:0}42%{opacity:1}57%{transform:translate(504px,186px);opacity:1}60%{transform:translate(504px,186px) scale(1.15);opacity:1}66%,100%{transform:translate(504px,186px) scale(.6);opacity:0}}
@keyframes vpl-ok{0%,26%{opacity:0;transform:scale(.4)}31%{opacity:1;transform:scale(1.15)}35%,100%{opacity:1;transform:scale(1)}}
@keyframes vpl-no{0%,58%{opacity:0;transform:scale(.4)}63%{opacity:1;transform:scale(1.2)}67%,100%{opacity:1;transform:scale(1)}}
@keyframes vpl-wall{0%,55%{opacity:0;transform:scaleX(.2)}59%{opacity:1;transform:scaleX(1.15)}63%,100%{opacity:1;transform:scaleX(1)}}
@keyframes vpl-blk{0%,60%{opacity:0;transform:translateY(6px)}66%,100%{opacity:1;transform:translateY(0)}}
@keyframes vpl-red{0%,58%{stroke:#7A2B36}63%{stroke:#FF5A6A}100%{stroke:#B23A4A}}
@keyframes vpl-shield{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes vpl-pulse{0%,100%{opacity:.55;transform:scale(.96)}50%{opacity:1;transform:scale(1.04)}}
@keyframes vpl-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
@keyframes vpl-dot{0%,6%{opacity:0}10%,100%{opacity:1}}
@keyframes vpl-bar{from{width:0}to{width:100%}}
.vpl .vpl-still *{animation-duration:1ms!important;animation-delay:0s!important;animation-iteration-count:1!important}
@media (prefers-reduced-motion: reduce){.vpl svg *{animation-duration:1ms!important;animation-delay:0s!important;animation-iteration-count:1!important}}
`;
