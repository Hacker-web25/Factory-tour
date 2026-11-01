/**
 * VPV media Worker — serves and stores tour pictures and sounds on Cloudflare R2.
 *
 * Paste this whole file into a Cloudflare Worker (see cloudflare/README.md).
 *
 * Bindings and settings it expects:
 *   BUCKET         R2 bucket binding (the "vpv-media" bucket)
 *   UPLOAD_SECRET  secret text. The SAME value as MEDIA_UPLOAD_SECRET on Vercel
 *   FALLBACK_BASE  optional text, e.g. https://<project>.supabase.co/storage/v1/object/public
 *                  A file not in R2 yet is fetched from there and copied into R2
 *                  the first time anyone opens it. This is what lets us switch
 *                  over without a big copy job.
 *
 * What it does
 *   GET / HEAD   public. Pictures and sounds are public by design, as they were in Supabase.
 *   PUT          needs a short-lived token from the website (/api/media/sign) for that exact file.
 *   DELETE       needs such a token too (the website only issues them to the platform owner).
 *
 * The token is checked with the same HMAC the website signs with (lib/mediaToken.ts).
 * tests/billing/34-cloudflare-media.test.ts runs both against each other.
 */

const BUCKETS = new Set(["panoramas", "tours"]);
const MAX_BYTES = 100 * 1024 * 1024; // the Workers request limit on the free plan
const DEFAULT_CACHE = "public, max-age=3600";
const NEVER_HOSTED = /^(text\/html|application\/xhtml\+xml|text\/javascript|application\/javascript)/i;

const enc = new TextEncoder();

/* ───────────────────────────── the token ───────────────────────────── */

function b64urlToBytes(s) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** The token's payload when its signature is good and it has not expired; otherwise null. */
export async function verifyToken(secret, token, nowSeconds = Math.floor(Date.now() / 1000)) {
  const dot = token.indexOf(".");
  if (!secret || dot <= 0 || token.length > 2048) return null;
  const body = token.slice(0, dot);
  try {
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("HMAC", key, b64urlToBytes(token.slice(dot + 1)), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(b64urlToBytes(body)));
    if (
      typeof p.b !== "string" ||
      typeof p.p !== "string" ||
      typeof p.e !== "number" ||
      typeof p.m !== "number" ||
      (p.a !== "put" && p.a !== "del") ||
      p.e <= nowSeconds
    ) {
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

/* ───────────────────────────── helpers ───────────────────────────── */

function corsHeaders(request) {
  const h = new Headers();
  const origin = request.headers.get("origin");
  if (request.method === "GET" || request.method === "HEAD") {
    // Public files: any page may load them, including WebGL textures (the 360 viewer).
    h.set("access-control-allow-origin", "*");
  } else if (origin) {
    // Uploads and deletes are authorised by the token, not by who is asking.
    h.set("access-control-allow-origin", origin);
    h.set("vary", "Origin");
  }
  h.set("access-control-expose-headers", "etag, content-length, content-range, accept-ranges");
  return h;
}

function reply(request, status, body, extra = {}) {
  const h = corsHeaders(request);
  for (const [k, v] of Object.entries(extra)) h.set(k, v);
  if (typeof body === "string") h.set("content-type", "text/plain; charset=utf-8");
  return new Response(request.method === "HEAD" ? null : body, { status, headers: h });
}

function safeHeaders(h) {
  h.set("x-content-type-options", "nosniff");
  // A file opened directly can never run script on this address.
  h.set("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  h.set("cross-origin-resource-policy", "cross-origin");
  h.set("accept-ranges", "bytes");
  return h;
}

/** "panoramas/abc/def.jpg" from the URL path, or null when it is not a path we serve. */
function objectKey(url) {
  let key;
  try {
    key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  } catch {
    return null;
  }
  const parts = key.split("/");
  if (parts.length < 2 || key.length > 400 || key.endsWith("/")) return null;
  if (!BUCKETS.has(parts[0])) return null;
  if (parts.some((p) => p === "" || p === "." || p === "..")) return null;
  return key;
}

const encodeKey = (key) => key.split("/").map(encodeURIComponent).join("/");

/* ───────────────────────────── reading ───────────────────────────── */

async function read(request, env, ctx, url, key) {
  const wantsRange = request.headers.has("range");
  const cache = caches.default;
  const cacheKey = new Request(url.origin + url.pathname, { method: "GET" });

  if (!wantsRange) {
    const hit = await cache.match(cacheKey);
    if (hit) return request.method === "HEAD" ? new Response(null, { status: 200, headers: hit.headers }) : hit;
  }

  const obj = await env.BUCKET.get(key, wantsRange ? { range: request.headers } : undefined);
  if (obj) {
    const h = corsHeaders(request);
    obj.writeHttpMetadata(h);
    h.set("etag", obj.httpEtag);
    if (!h.get("cache-control")) h.set("cache-control", DEFAULT_CACHE);
    safeHeaders(h);
    const partial = wantsRange && obj.range && obj.range.offset !== undefined;
    if (partial) {
      const start = obj.range.offset;
      const length = obj.range.length ?? obj.size - start;
      h.set("content-range", `bytes ${start}-${start + length - 1}/${obj.size}`);
      h.set("content-length", String(length));
    } else {
      h.set("content-length", String(obj.size));
    }
    const res = new Response(request.method === "HEAD" ? null : obj.body, { status: partial ? 206 : 200, headers: h });
    if (!partial && request.method === "GET") ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  }

  // Not in R2 yet: fetch it from the old place and keep a copy.
  if (env.FALLBACK_BASE) {
    const upstream = await fetch(`${env.FALLBACK_BASE.replace(/\/+$/, "")}/${encodeKey(key)}`, {
      headers: wantsRange ? { range: request.headers.get("range") } : {},
    });
    if (upstream.ok || upstream.status === 206) {
      const h = corsHeaders(request);
      for (const name of ["content-type", "content-length", "content-range", "etag", "last-modified"]) {
        const v = upstream.headers.get(name);
        if (v) h.set(name, v);
      }
      h.set("cache-control", DEFAULT_CACHE);
      safeHeaders(h);

      const length = Number(upstream.headers.get("content-length"));
      const canCopy =
        upstream.status === 200 &&
        request.method === "GET" &&
        upstream.body &&
        length > 0 &&
        length <= MAX_BYTES &&
        typeof FixedLengthStream !== "undefined";
      if (canCopy) {
        const [toClient, toBucket] = upstream.body.tee();
        const { readable, writable } = new FixedLengthStream(length);
        ctx.waitUntil(
          Promise.all([
            toBucket.pipeTo(writable),
            env.BUCKET.put(key, readable, {
              httpMetadata: { contentType: upstream.headers.get("content-type") || "application/octet-stream", cacheControl: DEFAULT_CACHE },
              // never overwrite a newer upload that arrived in the meantime
              onlyIf: { etagDoesNotMatch: "*" },
            }),
          ]).catch(() => {})
        );
        return new Response(toClient, { status: 200, headers: h });
      }
      return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.status, headers: h });
    }
  }
  return reply(request, 404, "Not found");
}

/* ───────────────────────────── writing ───────────────────────────── */

async function write(request, env, ctx, url, key) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const slip = await verifyToken(env.UPLOAD_SECRET || "", token);
  const cacheKey = new Request(url.origin + url.pathname, { method: "GET" });

  if (request.method === "DELETE") {
    if (!slip || slip.a !== "del") return reply(request, 401, "Not allowed");
    if (`${slip.b}/${slip.p}` !== key) return reply(request, 403, "That slip is for a different file");
    await env.BUCKET.delete(key);
    ctx.waitUntil(caches.default.delete(cacheKey));
    return reply(request, 200, "Deleted");
  }

  if (!slip || slip.a !== "put") return reply(request, 401, "Not allowed");
  if (`${slip.b}/${slip.p}` !== key) return reply(request, 403, "That slip is for a different file");

  const length = Number(request.headers.get("content-length"));
  if (!Number.isFinite(length) || length <= 0) return reply(request, 411, "Content-Length is required");
  if (length > slip.m || length > MAX_BYTES) return reply(request, 413, "File is bigger than this upload was allowed");

  const contentType = request.headers.get("content-type") || "application/octet-stream";
  if (NEVER_HOSTED.test(contentType)) return reply(request, 415, "This kind of file cannot be stored here");

  const saved = await env.BUCKET.put(key, request.body, {
    httpMetadata: { contentType, cacheControl: request.headers.get("cache-control") || DEFAULT_CACHE },
    // Without "upsert" an existing name is refused, as Supabase did.
    ...(slip.u === 1 ? {} : { onlyIf: { etagDoesNotMatch: "*" } }),
  });
  if (saved === null) return reply(request, 409, "The resource already exists");

  ctx.waitUntil(caches.default.delete(cacheKey));
  return reply(request, 200, "Saved");
}

/* ───────────────────────────── entry ───────────────────────────── */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      const h = corsHeaders(request);
      h.set("access-control-allow-origin", request.headers.get("origin") || "*");
      h.set("access-control-allow-methods", "GET, HEAD, PUT, DELETE, OPTIONS");
      h.set("access-control-allow-headers", request.headers.get("access-control-request-headers") || "authorization, content-type, cache-control");
      h.set("access-control-max-age", "86400");
      h.set("vary", "Origin");
      return new Response(null, { status: 204, headers: h });
    }

    if (url.pathname === "/" || url.pathname === "") return reply(request, 200, "VPV media");

    const key = objectKey(url);
    if (!key) return reply(request, 404, "Not found");

    if (request.method === "GET" || request.method === "HEAD") return read(request, env, ctx, url, key);
    if (request.method === "PUT" || request.method === "DELETE") return write(request, env, ctx, url, key);
    return reply(request, 405, "Method not allowed", { allow: "GET, HEAD, PUT, DELETE, OPTIONS" });
  },
};
