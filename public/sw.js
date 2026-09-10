/* eslint-disable */
/**
 * Factory Tour service worker — offline runtime for presenters.
 *
 * Strategy
 * --------
 * • App shell (HTML / JS / CSS bundles / built-in icons): cache-first.
 *   These change per deploy — the CACHE_VERSION bump on the next
 *   activate() clears the previous version so we don't leak MBs.
 *
 * • Panorama / hotspot media (Supabase Storage): cache-first, with a
 *   background revalidate. Once a tour is "prepared for offline", every
 *   scene image / video / PDF / icon that was downloaded lives in this
 *   cache until the user explicitly clears it or the browser evicts.
 *
 * • Supabase REST/RPC calls: network-first. On failure we fall back to
 *   whatever the client-side IndexedDB snapshot has. We intentionally do
 *   NOT cache POST/PATCH responses — write-side data goes through the
 *   offlineQueue in lib/offlineQueue.ts instead so nothing is lost.
 *
 * • Google Fonts / third-party CDNs: stale-while-revalidate.
 *
 * We deliberately keep the SW small and boring — the heavy lifting
 * (choosing which media to pre-download for a tour) happens in the
 * page bundle so the SW doesn't need to know the Supabase schema.
 */

const CACHE_VERSION = "v1";
const APP_SHELL_CACHE = `factour-shell-${CACHE_VERSION}`;
const MEDIA_CACHE = `factour-media-${CACHE_VERSION}`;
const API_CACHE = `factour-api-${CACHE_VERSION}`;

// Install: pre-cache the bare minimum so a cold offline load still
// boots the login / offline landing page. We rely on runtime caching
// for everything else so this list stays small.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) =>
      cache.addAll([
        "/",
        "/favicon.ico",
      ]).catch(() => {
        // First-boot may 404 on some routes if the page hasn't been
        // visited yet — that's fine, runtime caching picks them up.
      })
    )
  );
  self.skipWaiting();
});

// Activate: drop old versioned caches so upgrades don't pile up MBs.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.endsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch strategy dispatcher.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Never intercept POST/PATCH/DELETE — those go through offlineQueue.
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Supabase Storage → media cache (cache-first, background revalidate)
  const isMedia =
    url.host.endsWith(".supabase.co") &&
    (url.pathname.includes("/storage/v1/object/public/") ||
      url.pathname.includes("/storage/v1/object/sign/"));
  if (isMedia) {
    event.respondWith(cacheFirst(req, MEDIA_CACHE));
    return;
  }

  // Supabase REST / RPC → network-first with cache fallback
  const isApi =
    url.host.endsWith(".supabase.co") && url.pathname.startsWith("/rest/v1/");
  if (isApi) {
    event.respondWith(networkFirst(req, API_CACHE));
    return;
  }

  // Next.js build assets (_next/static/*) → cache-first (immutable)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(req, APP_SHELL_CACHE));
    return;
  }

  // Same-origin navigation / HTML → network-first, fallback to shell
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith(navigationHandler(req));
    return;
  }

  // Everything else same-origin → stale-while-revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req, APP_SHELL_CACHE));
  }
});

/* ------------------------------ strategies ------------------------------ */

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) {
    // Background revalidate — best-effort, ignore errors.
    fetch(req)
      .then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
      })
      .catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    // Media isn't cached AND we're offline — return an opaque 504 so
    // the client can render a "not downloaded" placeholder.
    return new Response("Resource not available offline", {
      status: 504,
      statusText: "Offline",
    });
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response(JSON.stringify({ offline: true }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}

async function navigationHandler(req) {
  try {
    const res = await fetch(req);
    const cache = await caches.open(APP_SHELL_CACHE);
    cache.put(req, res.clone());
    return res;
  } catch {
    const cache = await caches.open(APP_SHELL_CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    // Last resort: return the offline shell
    return (
      (await cache.match("/")) ||
      new Response("<h1>Offline</h1><p>App not yet cached.</p>", {
        headers: { "Content-Type": "text/html" },
      })
    );
  }
}

/* ------------------- messaging: prepare tour for offline ---------------- */

// The client can post {type: "PREPARE_URLS", urls: [...]} to warm the
// media cache with the panorama images, icons, videos, PDFs and audio
// for a specific tour. Progress is posted back so the UI can show a
// progress bar. This runs inside the SW so it survives page navigations.
self.addEventListener("message", async (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "PREPARE_URLS" && Array.isArray(data.urls)) {
    const urls = data.urls.filter((u) => typeof u === "string");
    const client = event.source;
    const cache = await caches.open(MEDIA_CACHE);
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < urls.length; i++) {
      const u = urls[i];
      try {
        const res = await fetch(u, { cache: "reload" });
        if (res && res.ok) {
          await cache.put(u, res.clone());
          ok++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
      if (client) {
        client.postMessage({
          type: "PREPARE_PROGRESS",
          done: i + 1,
          total: urls.length,
          ok,
          failed,
        });
      }
    }
    if (client) {
      client.postMessage({
        type: "PREPARE_COMPLETE",
        total: urls.length,
        ok,
        failed,
      });
    }
    return;
  }

  if (data.type === "CLEAR_MEDIA_CACHE") {
    await caches.delete(MEDIA_CACHE);
    if (event.source) {
      event.source.postMessage({ type: "MEDIA_CACHE_CLEARED" });
    }
    return;
  }

  if (data.type === "GET_CACHE_SIZE") {
    // Rough estimate using Cache Storage keys × Response size headers.
    try {
      const est = await navigator.storage.estimate();
      if (event.source) {
        event.source.postMessage({
          type: "CACHE_SIZE",
          usage: est.usage ?? 0,
          quota: est.quota ?? 0,
        });
      }
    } catch {
      // ignore
    }
    return;
  }
});
