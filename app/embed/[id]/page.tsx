"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Scene, Tour } from "@/lib/types";
import TourPlayer from "@/components/viewer/TourPlayer";
import { clearViewContext, setViewContext } from "@/lib/viewContext";

export default function EmbedPageWrapper() {
  return (
    <Suspense fallback={<div className="h-screen bg-black" />}>
      <EmbedPage />
    </Suspense>
  );
}

function EmbedPage() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const [tour, setTour] = useState<Tour | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    (async () => {
      // Name the tour being embedded so the database will show it if it is unlisted (a password-protected
      // unlisted tour stays hidden: an embed has no password prompt).
      clearViewContext();
      setViewContext({ tourId: id });
      const { data: t } = await supabase
        .from("tours")
        .select("*")
        .eq("id", id)
        .single();
      setTour(t as Tour);
      // Through the server-side gate: Basic scene cap + support-lapse lock.
      const [{ data: s }, { data: isLocked }] = await Promise.all([
        supabase.rpc("public_tour_scenes", { p_tour_id: id }),
        supabase.rpc("tour_is_locked", { p_tour_id: id }),
      ]);
      setLocked(isLocked === true);
      setScenes((s ?? []) as Scene[]);
    })();
  }, [id]);

  if (!tour) return <div className="h-screen bg-black" />;

  if (locked) {
    return (
      <div className="grid h-screen w-screen place-items-center bg-black p-6 text-center text-white">
        <div className="max-w-sm">
          <div className="mb-2 text-lg font-semibold">This tour is temporarily unavailable</div>
          <div className="text-sm text-neutral-400">
            Its owner&apos;s VPV workspace needs to be renewed. Please contact them.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen">
      <TourPlayer
        tour={tour}
        scenes={scenes}
        autoplay={params.get("autoplay") === "1"}
        hideControls={params.get("hideControls") === "1"}
      />
    </div>
  );
}
