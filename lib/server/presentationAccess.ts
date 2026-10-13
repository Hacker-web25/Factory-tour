/**
 * Shared guard for the /api/ai/* routes: authenticate, check the caller
 * is an org admin of the session's org, check the org is on ULTRA, and
 * return the session row.
 *
 * SERVER ONLY.
 */

import { NextResponse } from "next/server";
import { authenticateRequest, isOrgAdmin, type AuthedRequest } from "@/lib/server/requestAuth";

export type SessionRow = {
  session_id: string;
  org_id: string | null;
  tour_id: string | null;
  presenter_user_id: string | null;
  client_id: string | null;
  started_at: string | null;
  place: string | null;
  audio_path: string | null;
  duration_sec: number | null;
  transcript: string | null;
  ai_transcript_status: string | null;
  ai_transcript_job: string | null;
  ai_transcript_error: string | null;
  ai_dialogue: unknown;
  ai_speaker_map: unknown;
  ai_analysis: unknown;
  ai_score: number | null;
};

export function jsonError(status: number, error: string, message?: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, message, ...extra }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** 2 KB covers {sessionId, force}; bumped to 256 KB for the transcribe
 *  route, which may receive a freshly-captured in-browser transcript. */
const MAX_BODY_BYTES = 256 * 1024;

export type RequestBody = {
  sessionId?: unknown;
  force?: unknown;
  /** Optional transcript the client just produced (e.g. local Whisper) —
   *  used by /api/ai/transcribe only. */
  transcript?: unknown;
};

export async function guardPresentationRequest(
  req: Request
): Promise<
  | { ok: true; auth: AuthedRequest; row: SessionRow; orgName: string | null; force: boolean; body: RequestBody }
  | { ok: false; res: NextResponse }
> {
  if (Number(req.headers.get("content-length") || "0") > MAX_BODY_BYTES) {
    return { ok: false, res: jsonError(413, "payload_too_large") };
  }

  const auth = await authenticateRequest(req);
  if (!auth) return { ok: false, res: jsonError(401, "unauthorized", "Please sign in again.") };
  if (!isOrgAdmin(auth.profile)) {
    return { ok: false, res: jsonError(403, "forbidden", "Only organisation admins can run AI analysis.") };
  }

  let body: RequestBody = {};
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return { ok: false, res: jsonError(400, "bad_payload") };
  }
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  if (!sessionId || sessionId.length > 100 || !/^[\w-]+$/.test(sessionId)) {
    return { ok: false, res: jsonError(400, "invalid_session") };
  }

  // RLS applies — an admin can only ever see their own org's sessions.
  const { data: row } = await auth.sb
    .from("presentation_sessions")
    .select(
      "session_id, org_id, tour_id, presenter_user_id, client_id, started_at, place, audio_path, duration_sec, transcript, ai_transcript_status, ai_transcript_job, ai_transcript_error, ai_dialogue, ai_speaker_map, ai_analysis, ai_score"
    )
    .eq("session_id", sessionId)
    .maybeSingle();
  if (!row) return { ok: false, res: jsonError(404, "not_found", "Presentation not found.") };
  const r = row as SessionRow;

  if (auth.profile.role !== "owner" && r.org_id !== auth.profile.org_id) {
    return { ok: false, res: jsonError(404, "not_found", "Presentation not found.") };
  }

  // Plan gate — enforced on the server so the cost can't be bypassed
  // from the browser. The platform owner can always run it.
  let orgName: string | null = null;
  if (r.org_id) {
    const { data: org } = await auth.sb
      .from("organizations")
      .select("name, plan")
      .eq("id", r.org_id)
      .maybeSingle();
    orgName = (org as { name?: string } | null)?.name ?? null;
    const plan = (org as { plan?: string } | null)?.plan ?? "pro";
    if (plan !== "ultra" && auth.profile.role !== "owner") {
      return {
        ok: false,
        res: jsonError(402, "upgrade_required", "AI meeting analysis is part of the ULTRA plan."),
      };
    }
  }

  return { ok: true, auth, row: r, orgName, force: body.force === true, body };
}
