/**
 * Recently-used uploaded images.
 *
 * The IconPicker's Upload tab writes to Supabase Storage under
 * `panoramas/icons/*`. This module keeps a small registry of those uploads
 * so the user gets a "Recent" tab that lets them reuse a logo / signage /
 * machine photo without re-uploading.
 *
 * Eviction policy — every time we insert a new upload, we make sure the
 * table stays capped at MAX_RECENT rows. The victims are chosen by
 * (use_count ASC, last_used_at ASC), i.e. "least used and oldest goes first"
 * — so any image that keeps getting picked stays in the list indefinitely,
 * while an upload that was placed once and never touched again gradually
 * ages out.
 *
 * IMPORTANT: this module ONLY touches the `recent_uploads` tracking table.
 * It never deletes storage objects, because those files may still be
 * referenced by hotspots in a tour. A future admin sweep can garbage-collect
 * truly-orphaned storage files.
 */

import { supabase } from "./supabase";

/** Hard cap on how many recent uploads we remember. */
export const MAX_RECENT = 40;

export type RecentUpload = {
  id: string;
  storage_path: string;
  public_url: string;
  filename: string | null;
  mime: string | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  first_used_at: string;
  last_used_at: string;
  use_count: number;
};

/** Return the most-valuable recent uploads first: highest use_count then
 *  most recently touched. */
export async function listRecent(limit = MAX_RECENT): Promise<RecentUpload[]> {
  const { data, error } = await supabase
    .from("recent_uploads")
    .select("*")
    .order("use_count", { ascending: false })
    .order("last_used_at", { ascending: false })
    .limit(limit);
  if (error) {
    // Table may not exist yet if the migration hasn't been run. Fail
    // gracefully — the picker will just show an empty Recent tab.
    console.warn("listRecent:", error.message);
    return [];
  }
  return (data ?? []) as RecentUpload[];
}

/** Record a brand-new upload — or, if the same storage_path is already
 *  tracked, bump its use count. Called from IconPicker after a successful
 *  upload. */
export async function recordUpload(opts: {
  storage_path: string;
  public_url: string;
  filename?: string;
  mime?: string;
  file_size?: number;
  width?: number;
  height?: number;
}): Promise<void> {
  const { data: existing } = await supabase
    .from("recent_uploads")
    .select("id, use_count")
    .eq("storage_path", opts.storage_path)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("recent_uploads")
      .update({
        use_count: ((existing as { use_count: number }).use_count ?? 0) + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", (existing as { id: string }).id);
    return;
  }

  const { error } = await supabase.from("recent_uploads").insert({
    storage_path: opts.storage_path,
    public_url: opts.public_url,
    filename: opts.filename ?? null,
    mime: opts.mime ?? null,
    file_size: opts.file_size ?? null,
    width: opts.width ?? null,
    height: opts.height ?? null,
  });
  if (error) {
    console.warn("recordUpload:", error.message);
    return;
  }
  await evictIfOverCap();
}

/** Called when a user re-picks a Recent thumbnail (not a fresh upload).
 *  Keeps the image "fresh" in the eviction ranking. */
export async function bumpUse(storage_path: string): Promise<void> {
  const { data: existing } = await supabase
    .from("recent_uploads")
    .select("id, use_count")
    .eq("storage_path", storage_path)
    .maybeSingle();
  if (!existing) return;
  await supabase
    .from("recent_uploads")
    .update({
      use_count: ((existing as { use_count: number }).use_count ?? 0) + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq("id", (existing as { id: string }).id);
}

/** Manually remove an entry from the Recent list. Does NOT delete the
 *  storage file — see the module header for why. */
export async function removeTracking(id: string): Promise<void> {
  await supabase.from("recent_uploads").delete().eq("id", id);
}

/** After every new insert, prune down to MAX_RECENT by evicting the
 *  lowest-scored rows. Score is (use_count ASC, last_used_at ASC). */
export async function evictIfOverCap(): Promise<void> {
  const { count } = await supabase
    .from("recent_uploads")
    .select("id", { count: "exact", head: true });
  if (count == null || count <= MAX_RECENT) return;

  const overflow = count - MAX_RECENT;
  const { data: victims } = await supabase
    .from("recent_uploads")
    .select("id")
    .order("use_count", { ascending: true })
    .order("last_used_at", { ascending: true })
    .limit(overflow);
  const ids = (victims ?? []).map((v) => (v as { id: string }).id);
  if (ids.length) {
    await supabase.from("recent_uploads").delete().in("id", ids);
  }
}
