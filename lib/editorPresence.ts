"use client";

/**
 * Editor presence — extends the existing `presence` table with two
 * optional columns (editing_tour_id, editing_scene_id) so we can render
 * per-scene avatars in the tour editor: "Aryan is on Scene 3."
 *
 * This is layered ON TOP of the base `presence` heartbeat (see
 * lib/presence.ts) — that keeps last_seen fresh; this module just
 * updates the "what am I looking at right now" columns whenever the
 * user opens a tour or switches scenes.
 */

import { supabase } from "@/lib/supabase";

/** Call once whenever the current tour/scene focus changes. Fires a
 *  single upsert; no interval — the base presence heartbeat handles
 *  the last_seen refresh. */
export async function setEditingContext(
  tourId: string | null,
  sceneId: string | null
): Promise<void> {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user?.id;
    if (!uid) return;
    await supabase.from("presence").upsert(
      {
        user_id: uid,
        last_seen: new Date().toISOString(),
        editing_tour_id: tourId,
        editing_scene_id: sceneId,
      },
      { onConflict: "user_id" }
    );
  } catch {
    // presence writes are best-effort
  }
}

export type EditorPeer = {
  user_id: string;
  full_name: string | null;
  email: string;
  last_seen: string;
  editing_scene_id: string | null;
};

/** Load every other editor currently focused on this tour (updated in
 *  the last 90 seconds → they're actively here). */
export async function loadEditorPeers(
  tourId: string,
  excludeUserId: string
): Promise<EditorPeer[]> {
  const cutoffIso = new Date(Date.now() - 90_000).toISOString();
  const { data: presenceRows } = await supabase
    .from("presence")
    .select("user_id, last_seen, editing_scene_id, editing_tour_id")
    .eq("editing_tour_id", tourId)
    .gte("last_seen", cutoffIso);
  const rows = (presenceRows ?? []).filter(
    (r: any) => r.user_id !== excludeUserId
  );
  if (rows.length === 0) return [];
  const ids = rows.map((r: any) => r.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", ids);
  const profMap = new Map<string, { email: string; full_name: string | null }>();
  for (const p of (profiles ?? []) as any[]) {
    profMap.set(p.id, { email: p.email, full_name: p.full_name });
  }
  return rows.map((r: any) => {
    const p = profMap.get(r.user_id);
    return {
      user_id: r.user_id,
      full_name: p?.full_name ?? null,
      email: p?.email ?? "",
      last_seen: r.last_seen,
      editing_scene_id: r.editing_scene_id ?? null,
    };
  });
}

/** Subscribe to changes on the presence table (any row). Fires the
 *  callback so the caller can re-render peers. Returns teardown. */
export function subscribeToPresence(cb: () => void): () => void {
  const channel = supabase
    .channel("editor-presence")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "presence" },
      () => cb()
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
