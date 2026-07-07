"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Scene, Tour } from "@/lib/types";
import TourPlayer from "@/components/viewer/TourPlayer";

export default function EmbedPage() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const [tour, setTour] = useState<Tour | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);

  useEffect(() => {
    (async () => {
      const { data: t } = await supabase
        .from("tours")
        .select("*")
        .eq("id", id)
        .single();
      setTour(t as Tour);
      const { data: s } = await supabase
        .from("scenes")
        .select("*")
        .eq("tour_id", id)
        .order("order_index");
      setScenes((s ?? []) as Scene[]);
    })();
  }, [id]);

  if (!tour) return <div className="h-screen bg-black" />;

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
