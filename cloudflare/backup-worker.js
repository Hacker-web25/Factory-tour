/**
 * VPV backup Worker — a private box for nightly database backups on Cloudflare R2.
 *
 * Paste this whole file into its OWN Cloudflare Worker, separate from the media one
 * (cloudflare/media-worker.js). See cloudflare/BACKUPS.md for the one-time setup.
 *
 * Bindings and settings it expects:
 *   BUCKET          R2 bucket binding (a bucket used for nothing else, e.g. "vpv-backups")
 *   UPLOAD_SECRET   secret text. The SAME value as BACKUP_UPLOAD_SECRET on Vercel
 *
 * Unlike the media Worker, NOTHING here is public. A backup holds every customer's
 * data, so every request — including a GET — must carry the secret. There is no
 * FALLBACK_BASE and nothing is ever cached: this Worker only ever talks to our own
 * nightly cron job and, by hand, to whoever restores a backup.
 *
 *   PUT    /<name>   store a backup (the cron job)
 *   GET    /         list what is stored, as JSON (the cron job's cleanup, and a human)
 *   GET    /<name>   download one backup (a human restoring it)
 *   DELETE /<name>   remove one (the cron job's cleanup of old backups)
 */

const MAX_BYTES = 200 * 1024 * 1024; // comfortably above what this project's data gzips to
const NAME_RE = /^backups\/[A-Za-z0-9_-]{1,120}\.json\.gz$/;

function authorised(request, env) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return Boolean(env.UPLOAD_SECRET) && token.length > 0 && token === env.UPLOAD_SECRET;
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function text(status, body) {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export default {
  async fetch(request, env) {
    // No CORS headers anywhere: this address is never called from a browser, only
    // server-to-server, so a browser could not read a response from it either way.
    if (!authorised(request, env)) return text(401, "Not allowed");

    const url = new URL(request.url);
    const name = decodeURIComponent(url.pathname.replace(/^\/+/, ""));

    if (request.method === "GET" && !name) {
      const listed = await env.BUCKET.list({ prefix: "backups/", limit: 1000 });
      const files = listed.objects.map((o) => ({ key: o.key, size: o.size, uploaded: o.uploaded.toISOString() }));
      return json(200, { files });
    }

    if (!NAME_RE.test(name)) return text(404, "Not found");

    if (request.method === "GET") {
      const obj = await env.BUCKET.get(name);
      if (!obj) return text(404, "Not found");
      const h = new Headers();
      obj.writeHttpMetadata(h);
      h.set("content-disposition", `attachment; filename="${name.split("/").pop()}"`);
      return new Response(obj.body, { status: 200, headers: h });
    }

    if (request.method === "PUT") {
      const length = Number(request.headers.get("content-length"));
      if (!Number.isFinite(length) || length <= 0) return text(411, "Content-Length is required");
      if (length > MAX_BYTES) return text(413, "That backup is bigger than this Worker accepts");
      await env.BUCKET.put(name, request.body, { httpMetadata: { contentType: "application/gzip" } });
      return text(200, "Saved");
    }

    if (request.method === "DELETE") {
      await env.BUCKET.delete(name);
      return text(200, "Deleted");
    }

    return text(405, "Method not allowed");
  },
};
