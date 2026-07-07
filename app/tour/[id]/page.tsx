"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Scene, Tour } from "@/lib/types";
import TourPlayer from "@/components/viewer/TourPlayer";

type Status = "loading" | "ok" | "not_found" | "private" | "used";

export default function PublicTourPage() {
  const { id } = useParams<{ id: string }>();
  const [tour, setTour] = useState<Tour | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");

      // 1) Load the tour
      const { data: t } = await supabase
        .from("tours")
        .select("*")
        .eq("id", id)
        .single();
      if (!t) {
        setStatus("not_found");
        return;
      }

      // 2) Access control
      //    - Public tour + no token → allow (permanent link)
      //    - Public tour + token → consume the token (one-time link view)
      //    - Private tour → deny (share links only work on public tours)
      if (!t.published) {
        setStatus("private");
        return;
      }

      if (token) {
        const { data: link } = await supabase
          .from("share_links")
          .select("*")
          .eq("tour_id", id)
          .eq("token", token)
          .maybeSingle();
        if (!link) {
          setStatus("used"); // treat unknown token as expired
          return;
        }
        if (link.used) {
          setStatus("used");
          return;
        }
        // Mark used
        await supabase
          .from("share_links")
          .update({ used: true })
          .eq("id", link.id);
      }

      setTour(t as Tour);

      const { data: s } = await supabase
        .from("scenes")
        .select("*")
        .eq("tour_id", id)
        .order("order_index");
      setScenes((s ?? []) as Scene[]);
      setStatus("ok");
    })();
  }, [id]);

  if (status === "loading") {
    return (
      <div className="min-h-screen grid place-items-center text-neutral-500">
        Loading…
      </div>
    );
  }
  if (status === "not_found") {
    return (
      <Message
        title="Tour not found"
        body="Double-check the link — this tour doesn't exist."
      />
    );
  }
  if (status === "private") {
    return (
      <Message
        title="This tour is private"
        body="The owner hasn't published it yet. Ask them for a share link."
      />
    );
  }
  if (status === "used") {
    return (
      <Message
        title="Link expired"
        body="This one-time link has already been used. Ask the tour owner to generate a fresh one."
      />
    );
  }

  return (
    <div className="h-screen">
      {tour && <TourPlayer tour={tour} scenes={scenes} />}
    </div>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="max-w-sm text-center">
        <div className="text-lg font-semibold mb-2">{title}</div>
        <div className="text-sm text-neutral-400">{body}</div>
      </div>
    </div>
  );
}
