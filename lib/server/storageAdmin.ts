/**
 * Shared set-up for the /api/admin/storage routes: who may call them, and the
 * two connections they need. SERVER ONLY.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fail } from "@/lib/server/billingGuard";
import { authenticateRequest } from "@/lib/server/requestAuth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import type { WorkerConfig } from "@/lib/server/mediaMigration";

/** The buckets that live on Cloudflare once it is switched on. The private ones stay in Supabase. */
export const MOVED_BUCKETS = ["panoramas", "tours"] as const;
/** Every bucket, for the "what Supabase still holds" summary. */
export const ALL_BUCKETS = ["panoramas", "tours", "recordings", "voice-samples"] as const;

export type StorageContext = { sb: SupabaseClient; cfg: WorkerConfig };

/** Platform owner only, with Supabase and Cloudflare both configured. Otherwise a ready-made refusal. */
export async function storageGuard(req: Request): Promise<{ ok: true; ctx: StorageContext } | { ok: false; res: Response }> {
  const auth = await authenticateRequest(req);
  if (!auth) return { ok: false, res: fail(401, "unauthorized") };
  if (auth.profile.role !== "owner") return { ok: false, res: fail(403, "forbidden", "Platform owner only.") };

  const sb = supabaseAdmin();
  if (!sb) return { ok: false, res: fail(503, "not_configured", "SUPABASE_SERVICE_ROLE_KEY is not set.") };

  const base = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? "").trim().replace(/\/+$/, "");
  const secret = process.env.MEDIA_UPLOAD_SECRET ?? "";
  if (!base || !secret) {
    return { ok: false, res: fail(503, "not_configured", "Cloudflare media is not switched on (NEXT_PUBLIC_MEDIA_BASE_URL and MEDIA_UPLOAD_SECRET).") };
  }
  return { ok: true, ctx: { sb, cfg: { base, secret } } };
}

/** Test seam: the routes call the network through this, and tests replace it. */
let fetchImpl: typeof fetch = (...a) => fetch(...a);
export function storageFetch(): typeof fetch {
  return fetchImpl;
}
export function __setStorageFetchForTests(f: typeof fetch | null): void {
  if (process.env.NODE_ENV !== "test") throw new Error("test_only");
  fetchImpl = f ?? ((...a) => fetch(...a));
}
