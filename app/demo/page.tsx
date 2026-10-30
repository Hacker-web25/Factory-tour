/**
 * /demo — the whole VPV experience, live.
 *
 * A real, public factory tour (lib/site/demo.ts) in TourPlayer — the same
 * viewer a salesperson presents with at /present — under the site header.
 * A short, light cut: twelve named scenes (no index pages), pre-shrunk
 * images served by this site — see lib/site/demo.ts.
 * Presenter chrome is kept to what a visitor needs: a full-screen button
 * and one way to get a VPV of their own.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Maximize2, Minimize2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Scene, Tour } from "@/lib/types";
import TourPlayer from "@/components/viewer/TourPlayer";
import SiteHeader from "@/components/site/SiteHeader";
import { clearViewContext, setViewContext } from "@/lib/viewContext";
import { DEMO_PAGE_TOUR_ID, DEMO_SCENES, demoPanoramaPath, demoThumbPath } from "@/lib/site/demo";

type State =
  | { kind: "loading" }
  | { kind: "ok"; tour: Tour; scenes: Scene[] }
  | { kind: "unavailable" };

export default function DemoPage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const stageRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        clearViewContext();
        setViewContext({ tourId: DEMO_PAGE_TOUR_ID });
        const [{ data: t }, { data: s }, { data: locked }] = await Promise.all([
          supabase.from("tours").select("*").eq("id", DEMO_PAGE_TOUR_ID).maybeSingle(),
          // Through the server-side gate, exactly like a public link.
          supabase.rpc("public_tour_scenes", { p_tour_id: DEMO_PAGE_TOUR_ID }),
          supabase.rpc("tour_is_locked", { p_tour_id: DEMO_PAGE_TOUR_ID }),
        ]);
        if (cancelled) return;
        // A short, light cut of the tour: the hand-picked scenes only, in
        // walking order, named, with the site's own pre-shrunk images (see
        // lib/site/demo.ts). Hotspots stay live; navigation hotspots to a
        // scene outside the cut are hidden by the player.
        const byId = new Map(((s ?? []) as Scene[]).map((x) => [x.id, x]));
        const small = window.matchMedia("(max-width: 1023px)").matches;
        const scenes: Scene[] = [];
        DEMO_SCENES.forEach((d, i) => {
          const live = byId.get(d.id);
          if (!live) return;
          scenes.push({
            ...live,
            name: d.name,
            order_index: i,
            image_path: demoPanoramaPath(d.file, small),
            thumbnail_path: demoThumbPath(d.file),
          });
        });
        if (!t || locked === true || scenes.length === 0) setState({ kind: "unavailable" });
        else setState({ kind: "ok", tour: t as Tour, scenes });
      } catch {
        if (!cancelled) setState({ kind: "unavailable" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Warm the next two scenes once the first is up, so the first steps
  // through the factory are instant. Only two: a visitor who leaves early
  // should not have paid for the whole tour.
  useEffect(() => {
    if (state.kind !== "ok") return;
    const t = setTimeout(() => {
      for (const sc of state.scenes.slice(1, 3)) {
        const img = new window.Image();
        img.decoding = "async";
        img.src = sc.image_path;
      }
    }, 4000);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => {
    const onChange = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function toggleFull() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
    } catch {
      /* some phones (iOS Safari) do not allow it */
    }
  }

  const startScene = state.kind === "ok" ? state.scenes[0]?.id ?? null : null;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-black">
      <SiteHeader />
      <div ref={stageRef} className="relative min-h-0 flex-1 bg-black" data-testid="demo-stage">
        {state.kind === "loading" && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          </div>
        )}

        {state.kind === "unavailable" && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-white">
            <div className="max-w-sm">
              <p className="text-lg font-semibold">The live demo is being updated</p>
              <p className="mt-2 text-sm text-white/70">Please check back in a few minutes, or see a VPV made for your factory.</p>
              <a href="/assessment" className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#0B3D91]">
                Find the right VPV for your factory <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
            </div>
          </div>
        )}

        {state.kind === "ok" && (
          <>
            <TourPlayer tour={state.tour} scenes={state.scenes} initialSceneId={startScene} />

            {/* Presenter-style chrome on the right, just below the player's
                own tour chip (top-right) and clear of its scene strip. */}
            <div className="absolute right-3 top-16 z-30 flex items-center gap-2">
              {!full && (
                <a
                  href="/assessment"
                  className="hidden items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[13px] font-semibold text-[#0B3D91] shadow-lg transition-transform hover:scale-[1.03] sm:inline-flex"
                  data-testid="demo-cta"
                >
                  Get this for your factory <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
              )}
              <button
                type="button"
                onClick={() => void toggleFull()}
                className="grid h-9 w-9 place-items-center rounded-md border border-white/15 bg-black/55 text-white/90 backdrop-blur-sm hover:bg-black/75"
                title={full ? "Exit full screen" : "Full screen"}
                aria-label={full ? "Exit full screen" : "Full screen"}
              >
                {full ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
