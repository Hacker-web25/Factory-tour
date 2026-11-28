/**
 * GET /api/capture-times?tour=<id> — when each photo of a tour was taken, read
 * from the pictures already stored.
 *
 * For tours uploaded before the Units tool existed. The editor asks once, shows
 * nothing, and uses the answer to work out which photos belong together. Only
 * the first 128 KB of each picture is read (where EXIF lives). A picture that
 * was saved again by Beautify has lost its EXIF and comes back as null.
 *
 * Response { times: { [sceneId]: { at, source } | null } }
 */

import { authenticateRequest } from "@/lib/server/requestAuth";
import { MEDIA_BASE, encodeObjectPath, mediaPublicUrl } from "@/lib/mediaUrl";
import { CAPTURE_READ_BYTES, captureTimeFromBytes, readFirstBytes, type CaptureTime } from "@/lib/captureTime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "panoramas";
const CONCURRENCY = 8;
const TIMEOUT_MS = 8_000;
const MAX_SCENES = 600;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "private, no-store" } });
}

const isStored = (p: unknown): p is string => typeof p === "string" && p.length > 0 && !/^https?:/i.test(p) && !p.startsWith("/");

function urlOf(path: string): string {
  if (MEDIA_BASE) return mediaPublicUrl(BUCKET, path);
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${BUCKET}/${encodeObjectPath(path)}`;
}

export async function GET(req: Request) {
  const auth = await authenticateRequest(req);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const tour = new URL(req.url).searchParams.get("tour") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(tour)) return json({ error: "bad_tour" }, 400);

  // Through the caller's own row-level security: a tour they cannot see is not found.
  const { data: t, error: tErr } = await auth.sb.from("tours").select("id").eq("id", tour).maybeSingle();
  if (tErr) return json({ error: "temporarily_unavailable" }, 503);
  if (!t) return json({ error: "not_found" }, 404);

  const { data, error } = await auth.sb
    .from("scenes")
    .select("id, name, image_path, is_flat")
    .eq("tour_id", tour)
    .order("order_index")
    .limit(MAX_SCENES);
  if (error) return json({ error: "temporarily_unavailable" }, 503);
  const scenes = (data ?? []) as Array<{ id: string; name: string; image_path: string | null; is_flat: boolean | null }>;

  const times: Record<string, CaptureTime | null> = {};
  const todo = scenes.filter((s) => !s.is_flat && isStored(s.image_path));
  for (const s of scenes) times[s.id] = null;

  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const s = todo[next++];
      try {
        const res = await fetch(urlOf(s.image_path as string), {
          headers: { Range: `bytes=0-${CAPTURE_READ_BYTES - 1}` },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) continue;
        const bytes = await readFirstBytes(res, CAPTURE_READ_BYTES);
        // A name the person typed says nothing about the photo: use the picture only.
        times[s.id] = captureTimeFromBytes(bytes, "", undefined);
      } catch {
        /* unknown time */
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
  return json({ times });
}
