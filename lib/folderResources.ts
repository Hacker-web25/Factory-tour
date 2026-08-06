"use client";

import { supabase } from "@/lib/supabase";

/** A single resource found by scanning every tour inside a folder.
 *  Grouped by kind so the UI can show tabs / sections. */
export type FolderResource = {
  kind: "image" | "video" | "audio" | "pdf" | "icon";
  url: string;
  name?: string | null;
  tourTitle?: string;
  sceneName?: string;
  hotspotLabel?: string | null;
};

/** Aggregate every media URL referenced by any hotspot in any tour that
 *  lives inside `folderId`. Used by the "Folder resources" quick-access
 *  panel — factory owners can browse everything they've uploaded for a
 *  single client without opening each tour one by one. */
export async function loadFolderResources(
  folderId: string
): Promise<FolderResource[]> {
  const { data: tours, error: tErr } = await supabase
    .from("tours")
    .select("id, title")
    .eq("folder_id", folderId);
  if (tErr || !tours || tours.length === 0) return [];

  const tourIds = tours.map((t) => t.id);
  const tourById = new Map(tours.map((t) => [t.id, t.title as string]));

  const { data: scenes, error: sErr } = await supabase
    .from("scenes")
    .select("id, tour_id, name")
    .in("tour_id", tourIds);
  if (sErr || !scenes) return [];

  const sceneById = new Map(
    scenes.map((s) => [
      s.id as string,
      { name: s.name as string, tourId: s.tour_id as string },
    ])
  );
  const sceneIds = scenes.map((s) => s.id);
  if (sceneIds.length === 0) return [];

  const { data: hs, error: hErr } = await supabase
    .from("hotspots")
    .select(
      "scene_id,label,icon_url,image_url,video_url,audio_url,pdf_url,pdf_name"
    )
    .in("scene_id", sceneIds);
  if (hErr || !hs) return [];

  const out: FolderResource[] = [];
  const seen = new Set<string>(); // dedupe by "kind:url"

  function push(
    kind: FolderResource["kind"],
    url: string | null | undefined,
    ctx: { sceneId: string; label: string | null; name?: string | null }
  ) {
    if (!url) return;
    const key = kind + ":" + url;
    if (seen.has(key)) return;
    seen.add(key);
    const sc = sceneById.get(ctx.sceneId);
    out.push({
      kind,
      url,
      name: ctx.name,
      tourTitle: sc ? tourById.get(sc.tourId) : undefined,
      sceneName: sc?.name,
      hotspotLabel: ctx.label,
    });
  }

  for (const h of hs as any[]) {
    const ctx = { sceneId: h.scene_id, label: h.label ?? null };
    push("icon", h.icon_url, ctx);
    push("image", h.image_url, ctx);
    push("video", h.video_url, ctx);
    push("audio", h.audio_url, ctx);
    push("pdf", h.pdf_url, { ...ctx, name: h.pdf_name });
  }

  return out;
}
