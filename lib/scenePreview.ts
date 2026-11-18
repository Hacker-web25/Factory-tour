"use client";

/**
 * Small preview images for scene thumbnails.
 *
 * Almost no scene has a thumbnail of its own (1,040 of 1,041 on 18 Nov
 * 2026), so every scene strip drew each tile from the FULL panorama:
 * ~1.5 MB to 6 MB per tile, decoded at up to 6144 × 3072 px. Opening a
 * 114-scene tour in the editor downloaded ~170 MB and decoded gigabytes of
 * pixels to paint 150-px tiles, which is most of the lag.
 *
 * A preview is a 480-px-wide JPEG (~25 KB) of the panorama, stored at an
 * address worked out from the panorama's own path, so no database column
 * is needed and replacing a scene's picture gives it a new preview:
 *
 *     <dir>/<name>.jpg  →  previews/<dir>/<name>-w480.jpg
 *
 * Tiles try the preview first and fall back to the full picture while it
 * does not exist yet. In the editor (where the user may upload) a missing
 * preview is made in the background, one at a time, and every tile showing
 * that scene switches to it as soon as it is uploaded.
 */

import { mediaStorage } from "@/lib/media";
import { PANORAMA_BUCKET, publicUrl } from "@/lib/supabase";

const WIDTH = 480;
const QUALITY = 0.8;

/** Where a panorama's preview lives, or null for paths that have none
 *  (full URLs, files the site serves itself, previews themselves). */
export function previewPath(imagePath: string | null | undefined): string | null {
  if (!imagePath || /^(https?:)?\/\//i.test(imagePath) || imagePath.startsWith("/")) return null;
  if (imagePath.startsWith("previews/")) return null;
  return `previews/${imagePath.replace(/\.[a-z0-9]+$/i, "")}-w${WIDTH}.jpg`;
}

export function previewUrl(imagePath: string | null | undefined): string | null {
  const p = previewPath(imagePath);
  return p ? publicUrl(p) : null;
}

/* ---------------- making missing previews (editor only) ---------------- */

const ready = new Set<string>(); // image paths whose preview now exists
const failed = new Set<string>(); // gave up this session
const queued = new Set<string>();
const queue: string[] = [];
// The picture itself when we already have it: the file just uploaded, or
// the full picture a tile has just loaded. Then nothing is downloaded twice.
const localFiles = new Map<string, Blob | HTMLImageElement>();
const listeners = new Set<(imagePath: string) => void>();
let running = false;

export function previewIsReady(imagePath: string): boolean {
  return ready.has(imagePath);
}

/** Called when a preview has just been uploaded. Returns an unsubscribe. */
export function onPreviewReady(fn: (imagePath: string) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Make the preview for this panorama if it is missing. Safe to call many
 *  times; work happens one picture at a time, when the browser is idle. */
export function ensurePreview(imagePath: string, file?: Blob | HTMLImageElement): void {
  if (file && previewPath(imagePath)) localFiles.set(imagePath, file);
  if (!previewPath(imagePath) || ready.has(imagePath) || failed.has(imagePath) || queued.has(imagePath)) return;
  queued.add(imagePath);
  queue.push(imagePath);
  if (!running) void drain();
}

const idle = () =>
  new Promise<void>((resolve) => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void };
    if (w.requestIdleCallback) w.requestIdleCallback(() => resolve(), { timeout: 2000 });
    else setTimeout(resolve, 200);
  });

async function drain() {
  running = true;
  try {
    while (queue.length) {
      const imagePath = queue.shift()!;
      await idle();
      try {
        await makePreview(imagePath);
        ready.add(imagePath);
        listeners.forEach((fn) => fn(imagePath));
      } catch (e) {
        failed.add(imagePath);
        console.warn("[preview] could not make a preview for", imagePath, e);
      } finally {
        queued.delete(imagePath);
      }
    }
  } finally {
    running = false;
  }
}

async function makePreview(imagePath: string) {
  const path = previewPath(imagePath)!;
  let src: Blob | HTMLImageElement | undefined = localFiles.get(imagePath);
  localFiles.delete(imagePath);
  if (!src) {
    const res = await fetch(publicUrl(imagePath), { cache: "force-cache" });
    if (!res.ok) throw new Error(`panorama ${res.status}`);
    src = await res.blob();
  }
  // Decode straight to the small size where the browser can (no full-size
  // bitmap on the main thread); otherwise decode, then scale on a canvas.
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(src, { resizeWidth: WIDTH, resizeQuality: "medium" });
  } catch {
    bmp = await createImageBitmap(src);
  }
  const h = Math.max(1, Math.round((bmp.height / bmp.width) * WIDTH));
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bmp, 0, 0, WIDTH, h);
  bmp.close();
  const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", QUALITY));
  if (!out) throw new Error("encode failed");
  const { error } = await mediaStorage(PANORAMA_BUCKET).upload(path, out, {
    cacheControl: "31536000",
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
}
