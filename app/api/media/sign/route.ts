/**
 * POST /api/media/sign — a permission slip to upload ONE file to Cloudflare.
 *
 * Body: { bucket, path, size, upsert? }          to upload
 *       { bucket, path, action: "delete" }      to delete (platform owner only)
 * Returns: { ok, uploadUrl, token, publicUrl, expiresIn }
 *
 * Who may upload is decided here, the same way Supabase decided it before:
 * a signed-in workspace admin or the platform owner (vpv_is_staff). The
 * browser then PUTs the file straight to the Worker with the token, so the
 * file never passes through Vercel and no Cloudflare key is in the browser.
 *
 * Off by default: with NEXT_PUBLIC_MEDIA_BASE_URL or MEDIA_UPLOAD_SECRET unset
 * this answers 503 and the app keeps uploading to Supabase.
 */

import { fail, json, readJson } from "@/lib/server/billingGuard";
import { authenticateRequest, isOrgAdmin } from "@/lib/server/requestAuth";
import { signMediaToken } from "@/lib/mediaToken";
import { MEDIA_MAX_BYTES, isMediaBucket, isSafeObjectPath, mediaPublicUrl } from "@/lib/mediaUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4 * 1024;
const TTL_SECONDS = 600;

export async function POST(req: Request) {
  const auth = await authenticateRequest(req);
  if (!auth) return fail(401, "unauthorized");
  if (!isOrgAdmin(auth.profile)) return fail(403, "forbidden", "Only workspace admins can upload.");

  const base = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? "").trim().replace(/\/+$/, "");
  const secret = process.env.MEDIA_UPLOAD_SECRET ?? "";
  if (!base || !secret) return fail(503, "not_configured", "Cloudflare media is not switched on.");

  const read = await readJson(req, MAX_BODY_BYTES);
  if (!read.ok) return fail(read.status, read.error);
  const { bucket, path, size, upsert, action } = read.body;

  if (typeof bucket !== "string" || !isMediaBucket(bucket)) return fail(400, "bad_bucket");
  if (!isSafeObjectPath(path)) return fail(400, "bad_path");

  if (action === "delete") {
    // Same rule Supabase had: only the platform owner may delete public files.
    if (auth.profile.role !== "owner") return fail(403, "forbidden", "Only the platform owner can delete files.");
    const slip = await signMediaToken(secret, { bucket, path, maxBytes: 0, upsert: false, action: "del", ttlSeconds: TTL_SECONDS });
    return json({ ok: true, uploadUrl: mediaPublicUrl(bucket, path, base), token: slip, expiresIn: TTL_SECONDS });
  }

  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes <= 0) return fail(400, "bad_size");
  if (bytes > MEDIA_MAX_BYTES) return fail(413, "too_large", "That file is over 100 MB.");

  const token = await signMediaToken(secret, {
    bucket,
    path,
    maxBytes: bytes,
    upsert: upsert === true,
    ttlSeconds: TTL_SECONDS,
  });

  return json({
    ok: true,
    uploadUrl: mediaPublicUrl(bucket, path, base),
    token,
    publicUrl: mediaPublicUrl(bucket, path, base),
    expiresIn: TTL_SECONDS,
  });
}
