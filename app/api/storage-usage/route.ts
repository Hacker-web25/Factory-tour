/**
 * GET /api/storage-usage — how much the caller's tours take up, for the
 * "Storage used" card on the dashboard.
 *
 * Counts every panorama and thumbnail of every tour the caller can see
 * (their own workspace; our own team sees the whole platform, as on the
 * dashboard itself). A file can live in two places:
 *   • Supabase Storage (everything uploaded before 1 Nov 2026), whose
 *     listing carries each file's size;
 *   • Cloudflare R2 behind the media Worker (everything since), asked with
 *     a HEAD request, which returns the size without the file.
 *
 * Until Nov 2026 the dashboard listed only the TOP level of the Supabase
 * bucket in the browser, where there are folders and no files, so the card
 * showed almost nothing; and it could never see R2.
 *
 * Response { bytes, files, unknown, tours: {tourId: bytes} }, and with
 * ?tour=<id> also scenes: {sceneId: bytes} (unknown = files whose size could not
 * be read). Cached for each caller for a few minutes.
 */

import { authenticateRequest } from "@/lib/server/requestAuth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { MEDIA_BASE, mediaPublicUrl } from "@/lib/mediaUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "panoramas";
const CACHE_MS = 5 * 60_000;
const HEAD_CONCURRENCY = 16;
const HEAD_TIMEOUT_MS = 8_000;
const MAX_HEADS = 3_000;

type Usage = {
  bytes: number;
  files: number;
  unknown: number;
  /** Bytes per tour (whole workspace) */
  tours: Record<string, number>;
  /** Bytes per scene's panorama (only with ?tour=) */
  scenes?: Record<string, number | null>;
};
const cache = new Map<string, { at: number; usage: Usage }>();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "private, max-age=120" },
  });
}

type SceneRow = { id: string; tour_id: string; image_path: string | null; thumbnail_path: string | null };
const isStored = (p: unknown): p is string => typeof p === "string" && p.length > 0 && !/^https?:/i.test(p) && !p.startsWith("/");

/** Size of each path: Supabase folder listings first, then HEAD through
 *  the media Worker (R2) for the rest. */
async function sizesOf(paths: Set<string>): Promise<{ sizes: Map<string, number>; unknown: number }> {
  const sizes = new Map<string, number>();
  const admin = supabaseAdmin();
  if (admin) {
    const folders = new Set<string>();
    for (const p of paths) folders.add(p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
    await Promise.all(
      Array.from(folders).map(async (folder) => {
        for (let offset = 0; offset < 50_000; offset += 1000) {
          const { data } = await admin.storage.from(BUCKET).list(folder, { limit: 1000, offset });
          for (const f of data ?? []) {
            const size = Number((f.metadata as { size?: number } | null)?.size);
            if (Number.isFinite(size) && size > 0) sizes.set(folder ? `${folder}/${f.name}` : f.name, size);
          }
          if (!data || data.length < 1000) break;
        }
      })
    );
  }
  const missing = Array.from(paths).filter((p) => !sizes.has(p));
  let unknown = 0;
  if (MEDIA_BASE) {
    const queue = missing.slice(0, MAX_HEADS);
    unknown += missing.length - queue.length;
    let next = 0;
    const worker = async () => {
      while (next < queue.length) {
        const p = queue[next++];
        try {
          const res = await fetch(mediaPublicUrl(BUCKET, p), { method: "HEAD", signal: AbortSignal.timeout(HEAD_TIMEOUT_MS) });
          const len = Number(res.headers.get("content-length"));
          if (res.ok && Number.isFinite(len) && len > 0) sizes.set(p, len);
          else unknown++;
        } catch {
          unknown++;
        }
      }
    };
    await Promise.all(Array.from({ length: HEAD_CONCURRENCY }, worker));
  } else {
    unknown += missing.length;
  }
  return { sizes, unknown };
}

export async function GET(req: Request) {
  const auth = await authenticateRequest(req);
  if (!auth) return json({ error: "unauthorized" }, 401);

  // ?tour=<id>: one tour, with each scene's picture size (the editor).
  const tourParam = new URL(req.url).searchParams.get("tour");
  if (tourParam && !/^[0-9a-f-]{36}$/i.test(tourParam)) return json({ error: "bad_tour" }, 400);
  // n = how many scenes the caller sees: adding or removing one asks afresh.
  const n = new URL(req.url).searchParams.get("n") ?? "";
  const key = `${auth.user.id}:${tourParam ?? "*"}:${n}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return json(hit.usage);

  // Every tour the caller can see, through their own row-level security.
  let tourIds: string[];
  if (tourParam) {
    const { data, error } = await auth.sb.from("tours").select("id").eq("id", tourParam).maybeSingle();
    if (error) return json({ error: "temporarily_unavailable" }, 503);
    if (!data) return json({ error: "not_found" }, 404);
    tourIds = [tourParam];
  } else {
    const { data: tours, error: tErr } = await auth.sb.from("tours").select("id");
    if (tErr) return json({ error: "temporarily_unavailable" }, 503);
    tourIds = (tours ?? []).map((t: { id: string }) => t.id);
  }

  const scenes: SceneRow[] = [];
  for (let i = 0; i < tourIds.length; i += 100) {
    const { data, error } = await auth.sb
      .from("scenes")
      .select("id, tour_id, image_path, thumbnail_path")
      .in("tour_id", tourIds.slice(i, i + 100));
    if (error) return json({ error: "temporarily_unavailable" }, 503);
    scenes.push(...((data ?? []) as SceneRow[]));
  }

  const paths = new Set<string>();
  for (const s of scenes) for (const p of [s.image_path, s.thumbnail_path]) if (isStored(p)) paths.add(p);
  const { sizes, unknown } = await sizesOf(paths);

  const tours: Record<string, number> = {};
  const perScene: Record<string, number | null> = {};
  const counted = new Set<string>();
  let bytes = 0;
  for (const s of scenes) {
    let sceneBytes = 0;
    for (const p of [s.image_path, s.thumbnail_path]) {
      if (!isStored(p)) continue;
      const n = sizes.get(p) ?? 0;
      sceneBytes += n;
      if (!counted.has(p)) {
        counted.add(p);
        bytes += n;
      }
    }
    tours[s.tour_id] = (tours[s.tour_id] ?? 0) + sceneBytes;
    perScene[s.id] = isStored(s.image_path) ? sizes.get(s.image_path) ?? null : null;
  }
  const usage: Usage = { bytes, files: paths.size, unknown, tours };
  if (tourParam) usage.scenes = perScene;
  cache.set(key, { at: Date.now(), usage });
  return json(usage);
}
