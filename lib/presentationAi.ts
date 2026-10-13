"use client";

/**
 * Browser-side calls for AI presentation analysis.
 *
 * Talks to /api/ai/transcribe and /api/ai/analyze with the signed-in
 * user's access token; the routes re-check role, org and plan.
 */

import { supabase } from "@/lib/supabase";
import type {
  Dialogue,
  PresentationAiReport,
  SpeakerMap,
} from "@/lib/ai/presentationAiTypes";

export class AiRequestError extends Error {
  code: string;
  /** When the server knows what the user should do next, this holds a
   *  short machine-readable hint (e.g. "transcript_missing") so the UI
   *  can show a tailored call-to-action instead of raw error text. */
  hint?: string;
  constructor(code: string, message: string, hint?: string) {
    super(message);
    this.code = code;
    this.hint = hint;
  }
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AiRequestError("unauthorized", "Please sign in again.");
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    message?: string;
    hint?: string;
  } & T;
  if (!res.ok || json.ok === false) {
    throw new AiRequestError(
      json.error || `http_${res.status}`,
      json.message || "Request failed. Please try again.",
      json.hint
    );
  }
  return json;
}

export type TranscribeResponse = {
  status: "completed";
  dialogue: Dialogue;
  speakerMap: SpeakerMap;
  notice?: string;
};

/** Split the stored transcript into Customer / Sales turns. Optionally
 *  pass a freshly-captured transcript (local Whisper, etc.) and we use
 *  it in place of whatever's on the server. */
export function requestTranscript(sessionId: string, force = false, transcript?: string) {
  const body: Record<string, unknown> = { sessionId, force };
  if (transcript && transcript.trim().length > 20) body.transcript = transcript;
  return post<TranscribeResponse>("/api/ai/transcribe", body);
}

export function requestAnalysis(sessionId: string, force = false) {
  return post<{ report: PresentationAiReport; speakerMap: SpeakerMap; notice?: string }>(
    "/api/ai/analyze",
    { sessionId, force }
  );
}

/** Persist a corrected speaker → role mapping (and refreshed metrics). */
export async function saveSpeakerMap(
  sessionId: string,
  speakerMap: SpeakerMap,
  report: PresentationAiReport | null
): Promise<void> {
  const patch: Record<string, unknown> = { ai_speaker_map: speakerMap };
  if (report) patch.ai_analysis = report;
  const { error } = await supabase.rpc("save_presentation_ai", {
    p_session_id: sessionId,
    p_patch: patch,
  });
  if (error) throw new AiRequestError("save_failed", error.message);
}

/** Org plan — 'pro' until the ULTRA migration + upgrade are applied. */
export async function loadOrgPlan(orgId: string): Promise<"pro" | "ultra"> {
  const { data, error } = await supabase
    .from("organizations")
    .select("plan")
    .eq("id", orgId)
    .maybeSingle();
  if (error || !data) return "pro";
  return (data as { plan?: string }).plan === "ultra" ? "ultra" : "pro";
}
