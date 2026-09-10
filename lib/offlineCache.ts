"use client";

/**
 * Client-side offline runtime.
 *
 * Three surfaces:
 *   1. registerServiceWorker()      — one-time boot from RootLayout.
 *   2. prepareTourForOffline(tourId, onProgress)
 *      → collects every URL the tour needs (panorama, hotspot media,
 *        icons, ambient audio) and asks the SW to cache them all.
 *   3. isOffline() / onOfflineChange(cb) — reactive online/offline
 *      status the UI subscribes to.
 *
 * The SW does the actual caching; this module is just the glue that
 * (a) knows the Supabase schema so it can enumerate URLs, and (b)
 * marshals messages between the page and the SW.
 */

import { supabase, publicUrl } from "@/lib/supabase";
import type { Hotspot, Scene, Tour } from "@/lib/types";
import {
  saveOfflineTour,
  removeOfflineTour,
  clearAllOfflineTours,
} from "@/lib/offlineTourData";

/* ---------------------------- SW registration ---------------------------- */

export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  // Localhost + HTTPS only — SW is disabled otherwise (browser rejects).
  const isSecure =
    window.location.protocol === "https:" ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  if (!isSecure) return;

  const doRegister = () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        // Log so we can see success in DevTools console.
        console.info("[sw] registered — scope:", reg.scope);
      })
      .catch((e) => console.warn("[sw] register failed:", e));
  };

  // The previous version waited for the `load` event — but by the time
  // React mounts <OfflineBootstrap /> that event has usually already
  // fired, so the listener never ran and the SW never registered.
  // Register immediately if the document is already loaded.
  if (document.readyState === "complete") {
    doRegister();
  } else {
    window.addEventListener("load", doRegister, { once: true });
  }
}

/* --------------------------- online/offline state ------------------------ */

export function isOffline(): boolean {
  if (typeof navigator === "undefined") return false;
  return !navigator.onLine;
}

export function onOfflineChange(cb: (offline: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const on = () => cb(false);
  const off = () => cb(true);
  window.addEventListener("online", on);
  window.addEventListener("offline", off);
  return () => {
    window.removeEventListener("online", on);
    window.removeEventListener("offline", off);
  };
}

/* --------------------- localStorage: prepared-tour list ------------------ */

const PREPARED_KEY = "factour:offline:prepared";

export type PreparedTour = {
  tourId: string;
  title: string;
  preparedAt: string; // ISO
  urlCount: number;
};

export function listPreparedTours(): PreparedTour[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PREPARED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isTourPrepared(tourId: string): boolean {
  return listPreparedTours().some((t) => t.tourId === tourId);
}

function saveTourPrepared(entry: PreparedTour): void {
  const list = listPreparedTours().filter((t) => t.tourId !== entry.tourId);
  list.push(entry);
  window.localStorage.setItem(PREPARED_KEY, JSON.stringify(list));
}

export function removeTourPrepared(tourId: string): void {
  const list = listPreparedTours().filter((t) => t.tourId !== tourId);
  window.localStorage.setItem(PREPARED_KEY, JSON.stringify(list));
  // Drop the data snapshot too — otherwise localStorage keeps filling
  // up with orphaned tour blobs every time the user re-prepares.
  removeOfflineTour(tourId);
}

/* ------------------------- prepare tour for offline ---------------------- */

export type PrepareProgress = {
  phase: "collecting" | "downloading" | "done" | "error";
  done: number;
  total: number;
  ok: number;
  failed: number;
  message?: string;
};

/**
 * Enumerate every asset URL the tour needs to run offline, then hand
 * them to the SW to cache. Progress is streamed via onProgress.
 *
 * Included:
 *   • Scene panoramas (image_path)
 *   • Scene thumbnails
 *   • Scene ambient audio
 *   • Hotspot media: image_url, icon_url, video_url (uploaded only),
 *     audio_url, pdf_url, video_thumbnail_url
 *   • Nadir images on the tour
 *
 * Excluded:
 *   • YouTube video hotspots (streaming, external, un-cacheable)
 *   • External URL hotspots (arbitrary web pages)
 *   • Built-in Lucide icons (already in the JS bundle)
 */
export async function prepareTourForOffline(
  tourId: string,
  onProgress?: (p: PrepareProgress) => void
): Promise<{ ok: boolean; total: number; ok_count: number; failed: number }> {
  const emit = (p: PrepareProgress) => onProgress?.(p);
  emit({ phase: "collecting", done: 0, total: 0, ok: 0, failed: 0 });

  // Give the service worker a chance to finish activating so it can
  // actually intercept media requests when the user later goes offline.
  // Without this, first-time users hit "Download" before the SW claims
  // this tab and media fetches slip past uncached.
  if (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator
  ) {
    try {
      await navigator.serviceWorker.ready;
    } catch {
      // ignore — the fallback path handles no-SW state
    }
  }

  // Fetch tour + scenes + hotspots.
  const [{ data: tourRow }, { data: sceneRows }] = await Promise.all([
    supabase.from("tours").select("*").eq("id", tourId).single(),
    supabase
      .from("scenes")
      .select("*")
      .eq("tour_id", tourId)
      .order("order_index"),
  ]);
  if (!tourRow) {
    emit({
      phase: "error",
      done: 0,
      total: 0,
      ok: 0,
      failed: 0,
      message: "Tour not found",
    });
    return { ok: false, total: 0, ok_count: 0, failed: 0 };
  }
  const tour = tourRow as Tour;
  const scenes = (sceneRows ?? []) as Scene[];
  const sceneIds = scenes.map((s) => s.id);
  const { data: hotspotRows } = sceneIds.length
    ? await supabase.from("hotspots").select("*").in("scene_id", sceneIds)
    : { data: [] as any[] };
  const hotspots = (hotspotRows ?? []) as Hotspot[];

  // Save a complete data snapshot BEFORE the media download starts.
  // This makes hotspots, scene metadata and tour settings work offline
  // even if the service-worker HTTP cache misses (which it can — SW
  // registration is async so it may not intercept the prep queries).
  saveOfflineTour({
    tour,
    scenes,
    hotspots,
    savedAt: new Date().toISOString(),
  });

  // Collect URLs.
  const urls = new Set<string>();
  const add = (u?: string | null) => {
    if (!u) return;
    // storage_path → public URL, http(s) URL passes through
    const abs = /^https?:\/\//.test(u) ? u : publicUrl(u);
    if (abs) urls.add(abs);
  };
  // Tour-level nadir image + thumbnail + ambient audio
  add((tour as any).nadir_image_path);
  add((tour as any).thumbnail_path);
  add((tour as any).ambient_audio_url);
  add((tour as any).ambient_audio_path);
  // Scenes: panorama + thumbnail + ambient audio (both possible field names)
  for (const s of scenes) {
    add(s.image_path);
    add((s as any).thumbnail_path);
    add((s as any).ambient_audio_path);
    add((s as any).ambient_audio_url);
  }
  // Hotspots: every URL-ish field except youtube + external navigation URLs.
  for (const h of hotspots) {
    add(h.icon_url);
    add(h.image_url);
    if (h.video_source !== "youtube") add(h.video_url);
    add(h.audio_url);
    add(h.pdf_url);
    add((h as any).video_thumbnail_url);
    add((h as any).sound_effect_url);
  }

  const urlList = Array.from(urls);
  emit({
    phase: "downloading",
    done: 0,
    total: urlList.length,
    ok: 0,
    failed: 0,
  });

  if (urlList.length === 0) {
    saveTourPrepared({
      tourId,
      title: tour.title ?? "Untitled tour",
      preparedAt: new Date().toISOString(),
      urlCount: 0,
    });
    emit({ phase: "done", done: 0, total: 0, ok: 0, failed: 0 });
    return { ok: true, total: 0, ok_count: 0, failed: 0 };
  }

  // Hand off to the SW and stream progress back.
  return new Promise((resolve) => {
    const reg = navigator.serviceWorker?.controller;
    if (!reg) {
      // No SW active yet — fall back to fetching from the page context.
      fallbackFetchAll(urlList, emit).then((r) => {
        if (r.ok) {
          saveTourPrepared({
            tourId,
            title: tour.title ?? "Untitled tour",
            preparedAt: new Date().toISOString(),
            urlCount: urlList.length,
          });
        }
        resolve(r);
      });
      return;
    }
    const onMsg = (event: MessageEvent) => {
      const d = event.data;
      if (!d) return;
      if (d.type === "PREPARE_PROGRESS") {
        emit({
          phase: "downloading",
          done: d.done,
          total: d.total,
          ok: d.ok,
          failed: d.failed,
        });
      } else if (d.type === "PREPARE_COMPLETE") {
        navigator.serviceWorker.removeEventListener("message", onMsg);
        const ok = d.failed === 0;
        if (ok) {
          saveTourPrepared({
            tourId,
            title: tour.title ?? "Untitled tour",
            preparedAt: new Date().toISOString(),
            urlCount: d.total,
          });
        }
        emit({
          phase: ok ? "done" : "error",
          done: d.total,
          total: d.total,
          ok: d.ok,
          failed: d.failed,
          message: ok
            ? undefined
            : `${d.failed} file${d.failed === 1 ? "" : "s"} failed to download`,
        });
        resolve({
          ok,
          total: d.total,
          ok_count: d.ok,
          failed: d.failed,
        });
      }
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    reg.postMessage({ type: "PREPARE_URLS", urls: urlList });
  });
}

async function fallbackFetchAll(
  urls: string[],
  emit: (p: PrepareProgress) => void
) {
  // No SW installed yet — populate a plain in-memory Cache via the
  // window's own caches API. Same effect at the storage layer.
  const cache = await caches.open("factour-media-v1");
  let ok = 0;
  let failed = 0;
  for (let i = 0; i < urls.length; i++) {
    try {
      const res = await fetch(urls[i], { cache: "reload" });
      if (res.ok) {
        await cache.put(urls[i], res.clone());
        ok++;
      } else failed++;
    } catch {
      failed++;
    }
    emit({
      phase: "downloading",
      done: i + 1,
      total: urls.length,
      ok,
      failed,
    });
  }
  emit({
    phase: failed === 0 ? "done" : "error",
    done: urls.length,
    total: urls.length,
    ok,
    failed,
  });
  return { ok: failed === 0, total: urls.length, ok_count: ok, failed };
}

/* ------------------------------ cache size ------------------------------- */

export async function getStorageEstimate(): Promise<{
  usage: number;
  quota: number;
}> {
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
    }
  } catch {}
  return { usage: 0, quota: 0 };
}

export async function clearOfflineCache(): Promise<void> {
  // Wipe our media cache, the prepared-tour list, and every per-tour
  // data snapshot in one shot.
  try {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith("factour-media-"))
        .map((k) => caches.delete(k))
    );
  } catch {}
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(PREPARED_KEY);
  }
  clearAllOfflineTours();
}

/* ------------------------ formatBytes helper ------------------------------ */

export function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
