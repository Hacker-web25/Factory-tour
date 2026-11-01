/**
 * lib/media.ts — upload and address pictures and sounds, wherever they live.
 *
 * `mediaStorage("panoramas")` is a drop-in for `supabase.storage.from("panoramas")`
 * for what the app does with public files: upload(), getPublicUrl() and remove().
 *
 *   • Cloudflare OFF (NEXT_PUBLIC_MEDIA_BASE_URL empty), or a private bucket:
 *     it returns the real Supabase object. Nothing changes.
 *   • Cloudflare ON, public bucket: upload() asks /api/media/sign for a
 *     permission slip and sends the file to the Cloudflare Worker;
 *     getPublicUrl() returns the Worker's address.
 *
 * The return type is deliberately only those three methods, so TypeScript
 * stops anyone from calling something here that exists only on Supabase.
 */

import { supabase } from "@/lib/supabase";
import { mediaEnabled, mediaPublicUrl } from "@/lib/mediaUrl";

type SupabaseFiles = ReturnType<typeof supabase.storage.from>;
export type MediaStorage = Pick<SupabaseFiles, "upload" | "getPublicUrl" | "remove">;

type UploadOptions = { cacheControl?: string; contentType?: string; upsert?: boolean };
type UploadBody = Blob | File | ArrayBuffer | ArrayBufferView;

function storageError(message: string, status: number) {
  return { message, name: "StorageError", statusCode: String(status), error: message };
}

async function uploadToWorker(bucket: string, path: string, body: UploadBody, opts: UploadOptions = {}) {
  try {
    const size = body instanceof Blob ? body.size : body.byteLength;
    const { data: sess } = await supabase.auth.getSession();
    const signRes = await fetch("/api/media/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess.session?.access_token ?? ""}` },
      body: JSON.stringify({ bucket, path, size, upsert: opts.upsert === true }),
    });
    const slip = (await signRes.json().catch(() => ({}))) as {
      ok?: boolean;
      uploadUrl?: string;
      token?: string;
      message?: string;
    };
    if (!signRes.ok || !slip.ok || !slip.uploadUrl || !slip.token) {
      return { data: null, error: storageError(slip.message ?? "Could not start the upload.", signRes.status) };
    }

    const contentType = opts.contentType || (body instanceof Blob && body.type) || "application/octet-stream";
    const put = await fetch(slip.uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${slip.token}`,
        "Content-Type": contentType,
        "Cache-Control": `public, max-age=${opts.cacheControl ?? "3600"}`,
      },
      body: body as BodyInit,
    });
    if (!put.ok) {
      const text = await put.text().catch(() => "");
      return { data: null, error: storageError(put.status === 409 ? "The resource already exists" : text || "Upload failed.", put.status) };
    }
    return { data: { id: path, path, fullPath: `${bucket}/${path}` }, error: null };
  } catch (e) {
    return { data: null, error: storageError(e instanceof Error ? e.message : "Upload failed.", 0) };
  }
}

/** Delete from Cloudflare too. Best effort: a non-owner is refused, exactly as Supabase refused them. */
async function removeFromWorker(bucket: string, paths: string[]) {
  const { data: sess } = await supabase.auth.getSession();
  for (const path of paths) {
    try {
      const signRes = await fetch("/api/media/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess.session?.access_token ?? ""}` },
        body: JSON.stringify({ bucket, path, action: "delete" }),
      });
      const slip = (await signRes.json().catch(() => ({}))) as { ok?: boolean; uploadUrl?: string; token?: string };
      if (!signRes.ok || !slip.ok || !slip.uploadUrl || !slip.token) continue;
      await fetch(slip.uploadUrl, { method: "DELETE", headers: { Authorization: `Bearer ${slip.token}` } });
    } catch {
      /* the file simply stays; nothing else depends on it */
    }
  }
}

export function mediaStorage(bucket: string): MediaStorage {
  const sb = supabase.storage.from(bucket);
  if (!mediaEnabled(bucket)) return sb;
  const shim = {
    upload: (path: string, body: UploadBody, opts?: UploadOptions) => uploadToWorker(bucket, path, body, opts),
    getPublicUrl: (path: string) => ({ data: { publicUrl: mediaPublicUrl(bucket, path) } }),
    // Files not yet copied still sit in Supabase and the Worker would fetch them from there,
    // so a delete has to go to both places.
    remove: async (paths: string[]) => {
      const [supabaseResult] = await Promise.all([sb.remove(paths), removeFromWorker(bucket, paths)]);
      return supabaseResult;
    },
  };
  return shim as unknown as MediaStorage;
}
