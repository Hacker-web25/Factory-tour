"use client";

/**
 * Asset folder helpers — organize uploaded icons/images into per-org
 * folders that persist across every tour. Wraps the DB layer so the
 * IconPicker doesn't need to know about Supabase queries.
 */

import { supabase } from "@/lib/supabase";

export type AssetFolder = {
  id: string;
  org_id: string | null;
  name: string;
  parent_id: string | null;
  created_at: string;
};

export async function listAssetFolders(
  orgId: string | null
): Promise<AssetFolder[]> {
  let q = supabase.from("asset_folders").select("*").order("name");
  if (orgId) q = q.eq("org_id", orgId);
  else q = q.is("org_id", null);
  const { data } = await q;
  return (data ?? []) as AssetFolder[];
}

export async function createAssetFolder(
  orgId: string | null,
  name: string,
  parentId: string | null = null
): Promise<{ folder?: AssetFolder; error?: string }> {
  const { data, error } = await supabase
    .from("asset_folders")
    .insert({ org_id: orgId, name: name.trim() || "New folder", parent_id: parentId })
    .select()
    .single();
  if (error) return { error: error.message };
  return { folder: data as AssetFolder };
}

export async function renameAssetFolder(id: string, name: string): Promise<void> {
  await supabase.from("asset_folders").update({ name: name.trim() }).eq("id", id);
}

export async function deleteAssetFolder(id: string): Promise<void> {
  // Detach any assets first so they fall back to "root" instead of
  // vanishing with the folder.
  await supabase
    .from("recent_uploads")
    .update({ folder_id: null })
    .eq("folder_id", id);
  await supabase.from("asset_folders").delete().eq("id", id);
}

export async function moveUploadToFolder(
  uploadId: string,
  folderId: string | null
): Promise<void> {
  await supabase
    .from("recent_uploads")
    .update({ folder_id: folderId })
    .eq("id", uploadId);
}
