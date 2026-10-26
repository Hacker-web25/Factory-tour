"use client";

import { supabase } from "@/lib/supabase";
import type { Folder } from "@/lib/types";

/** Client-only SHA-256 hex hash. Used for folder password comparison.
 *  This is a lightweight obscuration — the hash lives in the DB and is
 *  readable via the public API, so folders here are "keep casual visitors
 *  out" not "cryptographically secured against a determined attacker". */
export async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function listFolders(): Promise<Folder[]> {
  const { data, error } = await supabase
    .from("folders")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("[folders] list failed:", error.message);
    return [];
  }
  return (data ?? []) as Folder[];
}

export async function createFolder(name: string, password?: string) {
  const password_hash = password ? await sha256Hex(password) : null;
  const { data, error } = await supabase
    .from("folders")
    .insert({ name: name.trim() || "New folder", password_hash })
    .select()
    .single();
  if (error) throw error;
  return data as Folder;
}

export async function renameFolder(id: string, name: string) {
  const { error } = await supabase
    .from("folders")
    .update({ name: name.trim() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteFolder(id: string) {
  const { error } = await supabase.from("folders").delete().eq("id", id);
  if (error) throw error;
}

export async function setFolderPassword(id: string, password: string | null) {
  const password_hash = password ? await sha256Hex(password) : null;
  const { error } = await supabase
    .from("folders")
    .update({ password_hash })
    .eq("id", id);
  if (error) throw error;
}

export async function moveTourToFolder(
  tourId: string,
  folderId: string | null
) {
  const { error } = await supabase
    .from("tours")
    .update({ folder_id: folderId })
    .eq("id", tourId);
  if (error) throw error;
}

/* -------------------- Session unlock (in-memory) ----------------------- *
 *  Kept in a module-level Set so it clears on hard refresh (or when the
 *  page component fully remounts). This matches user expectation: after a
 *  refresh, a password-protected folder should ask for the password again.
 *  Using sessionStorage was too sticky — it survives refreshes and made
 *  it look like the password gate wasn't working.
 * -------------------------------------------------------------------- */

const _unlocks: Set<string> = new Set();

export function isFolderUnlocked(folder: Folder | null): boolean {
  if (!folder) return true;
  if (!folder.password_hash) return true;
  return _unlocks.has(folder.id);
}

export async function unlockFolder(
  folder: Folder,
  password: string
): Promise<boolean> {
  if (!folder.password_hash) return true;
  const hash = await sha256Hex(password);
  if (hash !== folder.password_hash) return false;
  _unlocks.add(folder.id);
  return true;
}

export function relockFolder(folder: Folder) {
  _unlocks.delete(folder.id);
}

export function relockAllFolders() {
  _unlocks.clear();
}
