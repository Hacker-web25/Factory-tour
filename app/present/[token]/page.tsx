"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Scene, Tour } from "@/lib/types";
import TourPlayer from "@/components/viewer/TourPlayer";
import { getMyProfile, type Profile } from "@/lib/auth";
import {
  bumpViewCount,
  loadByToken,
  type ShareLink,
} from "@/lib/shareLinks";
import { setAttribution } from "@/lib/analytics";
import { X, Maximize2, Minimize2 } from "lucide-react";

/**
 * Presenter route. Requires the presenter to be signed in AND to be the
 * link's owner (or org_admin / owner of the same org — for supervisor
 * access). Every analytics event fired from this page attributes back
 * to `presenter_user_id` so per-salesperson dashboards work.
 */
export default function PresenterViewPage() {
  const params = useParams();
  const router = useRouter();
  const token = String(params?.token ?? "");
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "denied"; message: string }
    | { status: "ready"; tour: Tour; scenes: Scene[]; link: ShareLink }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1) Load the link.
      const res = await loadByToken(token);
      if (!res) {
        if (!cancelled) setState({ status: "denied", message: "Link not found." });
        return;
      }
      if (res.blocked) {
        if (!cancelled) setState({ status: "denied", message: res.blocked });
        return;
      }
      const link = res.link;
      if (link.kind !== "presenter") {
        if (!cancelled)
          setState({
            status: "denied",
            message: "This link is not a presenter link.",
          });
        return;
      }

      // 2) Require sign-in. If logged out, kick to /login with a
      //    ?next= so the user comes back here after login.
      const profile = await getMyProfile();
      if (!profile) {
        router.push(`/login?next=/present/${token}`);
        return;
      }

      // 3) Access check — the presenter must own the link, OR be an
      //    org_admin of the tour's org, OR be the site owner.
      const canAccess = await checkAccess(profile, link);
      if (!canAccess) {
        if (!cancelled)
          setState({
            status: "denied",
            message: "You don't have access to this link.",
          });
        return;
      }

      // 4) Load the tour + scenes.
      const [{ data: tour }, { data: scenes }] = await Promise.all([
        supabase.from("tours").select("*").eq("id", link.tour_id).single(),
        supabase
          .from("scenes")
          .select("*")
          .eq("tour_id", link.tour_id)
          .order("order_index"),
      ]);
      if (!tour) {
        if (!cancelled)
          setState({ status: "denied", message: "Tour not found." });
        return;
      }

      // 5) Set attribution so every event this session records the
      //    presenter and link ids.
      setAttribution({
        share_link_id: link.id,
        presenter_user_id: profile.id,
      });
      bumpViewCount(link.id);

      if (!cancelled)
        setState({
          status: "ready",
          tour: tour as Tour,
          scenes: (scenes ?? []) as Scene[],
          link,
        });
    })();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  if (state.status === "loading") {
    return (
      <div className="min-h-screen grid place-items-center bg-black text-neutral-500 text-sm">
        Loading…
      </div>
    );
  }
  if (state.status === "denied") {
    return (
      <div className="min-h-screen grid place-items-center bg-black text-white p-6">
        <div className="max-w-sm text-center">
          <div className="text-lg font-semibold mb-2">Access blocked</div>
          <div className="text-sm text-neutral-400">{state.message}</div>
        </div>
      </div>
    );
  }
  return <PresenterViewer tour={state.tour} scenes={state.scenes} />;
}

/** Presenter viewer shell — hosts the tour plus its chrome:
 *   • Green "recording" dot in the top-right corner (small, non-intrusive)
 *   • Back button that returns the presenter to /presenter
 *   • Fullscreen toggle that requests real browser fullscreen AND hides
 *     the shell chrome so the panorama fills the frame; only the tour's
 *     own controls (index, auto-tour, reset zoom) remain visible.
 *
 * Everything sits top-right so it never fights with the tour's scene
 * name overlay in the top-left. */
function PresenterViewer({ tour, scenes }: { tour: Tour; scenes: Scene[] }) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Track OS fullscreen state so the toggle icon flips even when the
  // user presses Escape (the browser's native way to exit fullscreen).
  useEffect(() => {
    const onChange = () =>
      setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    } else if (rootRef.current?.requestFullscreen) {
      await rootRef.current.requestFullscreen().catch(() => {});
    }
  }

  return (
    <div
      ref={rootRef}
      className="h-screen w-screen bg-black relative"
    >
      {/* Chrome cluster — top-right so it never collides with the
          top-left scene-name overlay or the scene-index button. When
          fullscreen is on we keep only the exit-fullscreen affordance
          so the visitor's eye stays on the panorama. */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
        {!isFullscreen && (
          <>
            {/* Tiny green "recording" dot — signals that this session is
                being attributed to the presenter. No text label. */}
            <div
              className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.18)]"
              title="Session is being recorded for analytics"
            />
            <button
              onClick={() => router.push("/presenter")}
              className="w-8 h-8 grid place-items-center bg-black/55 border border-white/15 hover:bg-black/75 text-white/85 rounded-md backdrop-blur-sm"
              title="Back to your tours"
              aria-label="Back to dashboard"
            >
              <X size={14} />
            </button>
          </>
        )}
        <button
          onClick={toggleFullscreen}
          className="w-8 h-8 grid place-items-center bg-black/55 border border-white/15 hover:bg-black/75 text-white/85 rounded-md backdrop-blur-sm"
          title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          aria-label="Toggle fullscreen"
        >
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>

      <TourPlayer tour={tour} scenes={scenes} />
    </div>
  );
}

async function checkAccess(profile: Profile, link: ShareLink): Promise<boolean> {
  if (profile.role === "owner") return true;
  if (profile.id === link.owner_user_id) return true;
  // Org admins can watch any of their team's presenter sessions.
  if (profile.role === "org_admin" && profile.org_id) {
    const { data: tour } = await supabase
      .from("tours")
      .select("org_id")
      .eq("id", link.tour_id)
      .maybeSingle();
    if (tour && (tour as { org_id: string | null }).org_id === profile.org_id) {
      return true;
    }
  }
  return false;
}
