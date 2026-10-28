/* VPV offline media worker.
 *
 * Offline mode lets a sales presenter download a tour at the office and run it later in a factory
 * with no signal.  The page side (lib/offlineCache.ts) collects every media URL a tour needs and
 * posts them here; this worker stores them and hands them back when the network is gone.
 *
 * Deliberately tiny and conservative:
 *   - It only ever looks at GET requests for Supabase *public storage* files
 *     (".../storage/v1/object/public/...").  Pages, API calls, auth, payments and everything else
 *     are never touched: this worker does not call respondWith() for them, so the browser handles
 *     them exactly as if no worker existed.
 *   - It is NETWORK-FIRST.  Online, you always get the live file; the cached copy is used only when
 *     the network request fails.  A replaced panorama can therefore never be shadowed by a stale copy.
 *   - It caches nothing on its own.  Files go into the cache only when the presenter taps
 *     "Download for offline" (PREPARE_URLS), and are removed by the page's "clear" actions, which
 *     delete every cache starting with "factour-media-".
 */

const CACHE = "factour-media-v1";
const STORAGE_PATH = "/storage/v1/object/public/";
const MAX_URLS = 2000; // one tour never needs more; guards against a runaway message
const PARALLEL = 4;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try {
    url = new URL(req.url);
  } catch (_) {
    return;
  }
  if (!url.pathname.includes(STORAGE_PATH)) return; // not tour media: leave it alone
  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  try {
    return await fetch(req);
  } catch (err) {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req.url, { ignoreVary: true });
    if (!hit) throw err; // not downloaded for offline: behave exactly like a normal failed request
    return answerRange(req, hit);
  }
}

// <video>/<audio> ask for byte ranges; a stored file has to answer them or seeking breaks.
async function answerRange(req, res) {
  const range = req.headers.get("range");
  if (!range || res.status !== 200) return res;
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m || (m[1] === "" && m[2] === "")) return res;
  const blob = await res.blob();
  const size = blob.size;
  let start;
  let end;
  if (m[1] === "") {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (!(start <= end) || start >= size) {
    return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + size } });
  }
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": res.headers.get("Content-Type") || blob.type || "application/octet-stream",
      "Content-Range": "bytes " + start + "-" + end + "/" + size,
      "Content-Length": String(end - start + 1),
    },
  });
}

self.addEventListener("message", (event) => {
  const d = event.data;
  if (!d || d.type !== "PREPARE_URLS" || !Array.isArray(d.urls)) return;
  event.waitUntil(prepare(d.urls, event.source));
});

async function prepare(urls, client) {
  const list = Array.from(
    new Set(urls.filter((u) => typeof u === "string" && /^https?:\/\//i.test(u)))
  ).slice(0, MAX_URLS);
  const total = list.length;
  const cache = await caches.open(CACHE);
  let done = 0;
  let ok = 0;
  let failed = 0;
  let next = 0;

  const post = (msg) => {
    try {
      if (client) client.postMessage(msg);
    } catch (_) {
      /* the tab went away; keep caching anyway */
    }
  };

  async function lane() {
    while (next < list.length) {
      const u = list[next++];
      try {
        const res = await fetch(u, { cache: "reload" });
        if (res.ok) {
          await cache.put(u, res);
          ok++;
        } else {
          failed++;
        }
      } catch (_) {
        failed++;
      }
      done++;
      post({ type: "PREPARE_PROGRESS", done, total, ok, failed });
    }
  }

  await Promise.all(Array.from({ length: PARALLEL }, lane));
  post({ type: "PREPARE_COMPLETE", done, total, ok, failed });
}
