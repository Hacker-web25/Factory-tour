/**
 * The homepage's live hero: a real 360° factory tour inside a
 * presentation frame, so a visitor's first moment on myvpv.com is using
 * the product, not reading about it.
 *
 * Framed by the marketing site's hero (see lib/site/bundleData.ts), so
 * every link out of it targets the top window.
 *
 *   top bar     VPV, "Live factory tour", a full-screen button that works
 *   the stage   the tour itself — drag, swipe, pinch, tap the hotspots
 *   coach mark  "drag to look around"; the tour opens straight inside the
 *               factory (no index page), and the mark goes the moment
 *               they touch the tour
 *   bottom bar  what they just did, and "Get this for your factory"
 *
 * The coach mark cannot see a touch inside the tour (the tour is its own
 * frame), but the page loses focus the instant the visitor presses into
 * it — that is the signal used to dismiss it.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Hand, Maximize2, Minimize2 } from "lucide-react";
import { experienceSource } from "@/lib/site/experience";
import { VPV_LOGO_URL } from "@/components/dashboard/VpvLogo";

const TIPS = ["Drag to look around", "Tap the glowing dots", "Use the arrows to walk through", "Pinch or scroll to zoom"];

/** The tour opens inside the factory, so the one mark is "drag". */
const COACH = [{ icon: Hand, anim: "xp-drag", text: "Drag to look around this factory" }] as const;
/** How long the drag mark stays if they don't touch the tour. */
const DRAG_MARK_MS = 9000;

export default function HeroExperience() {
  const stage = useRef<HTMLDivElement>(null);
  const [src] = useState(experienceSource);
  const [loaded, setLoaded] = useState(false);
  const [touched, setTouched] = useState(false);
  const [full, setFull] = useState(false);
  const [tip, setTip] = useState(0);

  // One effect per mark, keyed on `step`, so moving to the next mark always
  // tears down the previous mark's own listener and timer first. (An earlier
  // version ran one mount-long timer alongside the blur listener; the timer
  // kept ticking after blur had already advanced the step, so it could fire
  // a SECOND advance later and cut the drag mark's 7s short, or skip it
  // Keying the effect on `step` and cleaning up on every change removes
  // that leftover timer instead of letting it fire late.
  useEffect(() => {
    if (touched) return;
    // Drag mark: gone the moment they press into the tour, or after a while.
    const onBlur = () => setTouched(true);
    window.addEventListener("blur", onBlur);
    const t = setTimeout(() => setTouched(true), DRAG_MARK_MS);
    return () => {
      window.removeEventListener("blur", onBlur);
      clearTimeout(t);
    };
  }, [touched]);

  // The ticker of tips along the bottom.
  useEffect(() => {
    const id = setInterval(() => setTip((i) => (i + 1) % TIPS.length), 2600);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onChange = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggleFull() {
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void stage.current?.requestFullscreen();
    } catch {
      /* intentional — some phones (iOS Safari) do not allow it in a frame */
    }
  }

  return (
    <div ref={stage} className="relative h-screen w-screen overflow-hidden bg-[#0B1220] font-sans text-white select-none">
      <style>{`
        @keyframes xp-pulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
        @keyframes xp-drag { 0%,100% { transform: translateX(-22px) rotate(-8deg) } 50% { transform: translateX(22px) rotate(8deg) } }
        @keyframes xp-nudge { 0%,100% { transform: translateX(-6px) } 50% { transform: translateX(10px) } }
        @keyframes xp-fade { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }
        .xp-pulse { animation: xp-pulse 1.6s ease-in-out infinite }
        .xp-drag { animation: xp-drag 2.2s ease-in-out infinite }
        .xp-nudge { animation: xp-nudge 1.1s ease-in-out infinite }
        .xp-fade { animation: xp-fade .45s ease-out both }
        @media (prefers-reduced-motion: reduce) { .xp-pulse, .xp-drag, .xp-nudge, .xp-fade { animation: none } }
      `}</style>

      {/* The tour itself. */}
      <iframe
        src={src.src}
        title="Live VPV: walk through a real factory in 360°"
        className="absolute inset-0 h-full w-full border-0"
        allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer; autoplay"
        allowFullScreen
        onLoad={() => setLoaded(true)}
      />

      {!loaded && (
        <div className="absolute inset-0 grid place-items-center bg-[#0B1220]">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      )}

      {/* Top bar. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent px-3 pb-8 pt-3 sm:px-5 sm:pt-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 items-center rounded-lg bg-white px-2 shadow">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={VPV_LOGO_URL} alt="VPV" className="h-4 w-auto" />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[13px] font-semibold">Live factory tour</p>
            <p className="truncate text-[11px] text-white/70">A real plant, in 360°</p>
          </div>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-semibold backdrop-blur">
            <span className="xp-pulse h-2 w-2 rounded-full bg-[#2BD67B]" /> LIVE
          </span>
          <button
            type="button"
            onClick={toggleFull}
            aria-label={full ? "Exit full screen" : "Full screen"}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 backdrop-blur transition-colors hover:bg-black/60"
          >
            {full ? <Minimize2 className="h-4 w-4" aria-hidden /> : <Maximize2 className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </div>

      {/* Coach marks: a caption low on the stage, clear of the tour's own
          scene and its own navigation arrows, which sit mid-screen. */}
      {loaded && !touched && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[84px] flex justify-center px-4 sm:bottom-[96px]">
          <div
            className="xp-fade flex items-center gap-2.5 rounded-full bg-black/60 py-2.5 pl-3 pr-4 shadow-lg backdrop-blur-sm"
          >
            {(() => {
              const { icon: Icon, anim } = COACH[0];
              return <Icon className={`${anim} h-5 w-5 shrink-0`} aria-hidden />;
            })()}
            <p className="text-[13.5px] font-semibold leading-tight sm:text-[14.5px]">{COACH[0].text}</p>
          </div>
        </div>
      )}

      {/* Bottom bar. */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/75 to-transparent px-3 pb-3 pt-10 sm:px-5 sm:pb-4">
        <p key={tip} className="xp-fade pointer-events-none hidden text-[13px] text-white/85 sm:block">
          {TIPS[tip]}
        </p>
        <a
          href="/assessment"
          target="_top"
          className="ml-auto inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-[13.5px] font-semibold text-[#0B3D91] shadow-lg transition-transform hover:scale-[1.03]"
        >
          Get this for your factory <ArrowRight className="h-4 w-4" aria-hidden />
        </a>
      </div>
    </div>
  );
}
