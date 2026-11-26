/**
 * Who may read or change a tour's language data, and how problems are reported.
 * SERVER ONLY. Used by every route under app/api/language.
 *
 *   READ   whoever can see the tour. This is decided by the SAME database rule that
 *          decides whether the tour page itself opens (a private tour, a password,
 *          a share link, an e-mail gate…): the viewer's headers are forwarded and the
 *          tour row is asked for. If the database hands it over, the language data
 *          may be read; if not, it may not. No second set of rules to keep in step.
 *   WRITE  a signed-in workspace admin who may edit THIS tour (the database's own
 *          vpv_can_edit_tour), whose workspace is not locked for non-payment, and —
 *          while the feature is hidden from customers — the platform owner only.
 */

import { createClient } from "@supabase/supabase-js";
import { ROLLOUT } from "@/lib/entitlements";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n";
import { LanguageWorkerError, languageConfigured } from "@/lib/language/store";
import { UUID_RE, billingRateLimit, fail } from "@/lib/server/billingGuard";
import { authenticateRequest, isOrgAdmin, type AuthedRequest } from "@/lib/server/requestAuth";

/** The headers the viewer sends so the database can show it an unlisted or link-only tour (lib/viewContext.ts). */
const FORWARDED = ["x-view-tour", "x-tour-grant", "x-share-token", "x-share-grant", "x-viewer-fp", "x-viewer-email"];

type Reader = (req: Request, tourId: string) => Promise<boolean>;
let testReader: Reader | null = null;

/** Test seam — only honoured when NODE_ENV === "test". */
export function __setTourReaderForTests(fn: Reader | null): void {
  if (process.env.NODE_ENV !== "test") throw new Error("test_only");
  testReader = fn;
}

export function validTour(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

const LANG_CODES = new Set(SUPPORTED_LANGUAGES.map((l) => l.code));
export function validLang(v: unknown): v is string {
  return typeof v === "string" && LANG_CODES.has(v);
}

/** Can the person who sent this request see this tour? */
export async function canReadTour(req: Request, tourId: string): Promise<boolean> {
  if (process.env.NODE_ENV === "test" && testReader) return testReader(req, tourId);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return false;
  const headers: Record<string, string> = {};
  for (const name of FORWARDED) {
    const v = req.headers.get(name);
    if (v) headers[name] = v.replace(/[^\x20-\x7E]/g, "").slice(0, 300);
  }
  const auth = req.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ") && auth.length < 4096) headers.Authorization = auth;
  const sb = createClient(url, anon, {
    global: { headers },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await sb.from("tours").select("id").eq("id", tourId).maybeSingle();
  return !error && !!data;
}

/** Common checks for a read: configured, a real tour id, and the tour is visible to this caller. */
export async function guardRead(req: Request, tourId: unknown): Promise<{ ok: true; tour: string } | { ok: false; res: Response }> {
  if (!languageConfigured()) return { ok: false, res: notConfigured() };
  if (!validTour(tourId)) return { ok: false, res: fail(400, "bad_tour") };
  if (!(await canReadTour(req, tourId))) return { ok: false, res: fail(404, "not_found") };
  return { ok: true, tour: tourId };
}

export type RateRule = { key: string; max: number; windowSeconds: number };

/** Common checks for a change. */
export async function guardWrite(
  req: Request,
  tourId: unknown,
  rate?: RateRule
): Promise<{ ok: true; tour: string; auth: AuthedRequest } | { ok: false; res: Response }> {
  const auth = await authenticateRequest(req);
  if (!auth) return { ok: false, res: fail(401, "unauthorized") };
  if (!languageConfigured()) return { ok: false, res: notConfigured() };
  if (!validTour(tourId)) return { ok: false, res: fail(400, "bad_tour") };
  if (!isOrgAdmin(auth.profile)) return { ok: false, res: fail(403, "forbidden", "Only workspace admins can change languages.") };
  if (ROLLOUT.subtitles_translations.tier === "hidden" && auth.profile.role !== "owner") {
    return { ok: false, res: fail(403, "not_available", "Subtitles and translations are not open to customers yet.") };
  }
  const can = await auth.sb.rpc("vpv_can_edit_tour", { p_tour: tourId });
  if (can.error || can.data !== true) return { ok: false, res: fail(403, "forbidden", "You cannot edit this tour.") };
  const open = await auth.sb.rpc("tour_workspace_open", { p_tour: tourId });
  if (!open.error && open.data === false) {
    return { ok: false, res: fail(403, "workspace_locked", "This workspace is locked until the subscription is renewed.") };
  }
  if (rate) {
    const r = await billingRateLimit(auth.sb, `${rate.key}:${auth.user.id}`, rate.max, rate.windowSeconds);
    if (!r.allowed) {
      return { ok: false, res: fail(429, "rate_limited", "Too many requests. Try again in a moment.", { "Retry-After": String(r.retryAfter) }) };
    }
  }
  return { ok: true, tour: tourId, auth };
}

export function notConfigured(): Response {
  return fail(503, "not_configured", "Language storage is not switched on yet (LANGUAGE_API_URL and LANGUAGE_API_SECRET).");
}

/** A Worker failure as an honest, safe answer. The Worker's own detail is only used for the known cases. */
export function workerFail(e: unknown): Response {
  if (e instanceof LanguageWorkerError) {
    switch (e.code) {
      case "not_configured":
        return fail(503, "not_configured", "Language storage is not switched on yet.");
      case "unauthorized":
        return fail(502, "worker_secret_mismatch", "The website and the language Worker do not share the same secret. Check LANGUAGE_API_SECRET.");
      case "quota":
        return fail(429, "quota", "The free daily speech and translation allowance on Cloudflare is used up. It resets daily, or switch Workers to the Paid plan.");
      case "worker_unreachable":
        return fail(504, "worker_unreachable", "Could not reach the language Worker. Check LANGUAGE_API_URL.");
      case "ai_not_bound":
        return fail(503, "ai_not_bound", "The language Worker has no Workers AI binding named AI.");
      case "ai_failed":
      case "empty_answer":
        return fail(502, "ai_failed", "The speech engine could not process that audio. Try again.");
      case "payload_too_large":
      case "audio_too_large":
        return fail(413, "payload_too_large");
      default:
        return fail(e.status >= 400 && e.status < 500 ? 400 : 502, "language_error", e.code);
    }
  }
  console.error("[language] unexpected", e);
  return fail(500, "internal");
}

/** Read at most `maxBytes` of a binary body; refuse (without buffering the rest) if it is larger. */
export async function readBytes(req: Request, maxBytes: number): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; status: 400 | 413; error: string }> {
  const declared = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, status: 413, error: "payload_too_large" };
  if (!req.body) return { ok: true, bytes: new Uint8Array(0) };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          /* abandoned */
        }
        return { ok: false, status: 413, error: "payload_too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: "bad_payload" };
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  return { ok: true, bytes };
}
