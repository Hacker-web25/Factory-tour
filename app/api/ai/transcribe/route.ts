/**
 * POST /api/ai/transcribe   { sessionId, force? }
 *
 * Turns a presentation recording into a speaker-separated dialogue
 * (Customer / Sales Person). Idempotent and poll-friendly — the client
 * calls it repeatedly until `status === "completed"`:
 *
 *   1st call   → submits the audio to AssemblyAI, returns "processing"
 *   next calls → polls the job, returns "processing" until done
 *   done       → saves the dialogue, returns it (and every later call
 *                returns the saved copy without touching AssemblyAI)
 *
 * Sessions recorded before audio upload existed but with a browser
 * transcript fall back to an LLM split (marked "text-inferred").
 *
 * Auth: org_admin of the session's org, org on ULTRA.  Env: ASSEMBLYAI_API_KEY
 * (and ANTHROPIC_API_KEY for the text fallback).
 */

import { NextResponse } from "next/server";
import { guardPresentationRequest, jsonError, type SessionRow } from "@/lib/server/presentationAccess";
import { assemblyConfigured, pollTranscription, submitTranscription } from "@/lib/ai/assemblyai";
import { claudeConfigured, segmentPlainTranscript } from "@/lib/ai/claude";
import { enforceRateLimit } from "@/lib/rateLimit";
import {
  guessSpeakerMap,
  type Dialogue,
  type SpeakerMap,
} from "@/lib/ai/presentationAiTypes";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function save(sb: SupabaseClient, sessionId: string, patch: Record<string, unknown>) {
  const { error } = await sb.rpc("save_presentation_ai", { p_session_id: sessionId, p_patch: patch });
  if (error) throw new Error(error.message);
}

function done(dialogue: Dialogue, speakerMap: SpeakerMap) {
  return NextResponse.json(
    { ok: true, status: "completed", dialogue, speakerMap },
    { headers: { "Cache-Control": "no-store" } }
  );
}

function pending(status: string) {
  return NextResponse.json({ ok: true, status }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const g = await guardPresentationRequest(req);
  if (!g.ok) return g.res;
  const { auth, row, force } = g;
  const sb = auth.sb;

  try {
    // ── Already done ────────────────────────────────────────────────
    if (row.ai_dialogue && !force) {
      const d = row.ai_dialogue as Dialogue;
      return done(d, (row.ai_speaker_map as SpeakerMap) ?? guessSpeakerMap(d.turns));
    }

    // ── A job is running — poll it (cheap, not rate-limited beyond a cap) ─
    if (
      !force &&
      row.ai_transcript_job &&
      (row.ai_transcript_status === "queued" || row.ai_transcript_status === "processing")
    ) {
      const rl = await enforceRateLimit(`ai-transcribe-poll:user:${auth.user.id}`, 900, 3600);
      if (!rl.allowed) return jsonError(429, "rate_limited", "Too many checks — wait a minute.", { retryAfter: rl.retryAfter });
      if (!assemblyConfigured()) return notConfigured("ASSEMBLYAI_API_KEY");

      const r = await pollTranscription(row.ai_transcript_job);
      if (r.status === "completed") {
        if (r.turns.length === 0) {
          await save(sb, row.session_id, { ai_transcript_status: "error", ai_transcript_error: "No speech detected in the recording." });
          return jsonError(422, "no_speech", "No speech was detected in this recording.");
        }
        const dialogue: Dialogue = { source: "assemblyai", language: r.language, turns: r.turns };
        const speakerMap = guessSpeakerMap(r.turns);
        await save(sb, row.session_id, {
          ai_transcript_status: "completed",
          ai_transcript_error: null,
          ai_dialogue: dialogue,
          ai_speaker_map: speakerMap,
        });
        return done(dialogue, speakerMap);
      }
      if (r.status === "error") {
        await save(sb, row.session_id, { ai_transcript_status: "error", ai_transcript_error: r.error.slice(0, 500) });
        return jsonError(502, "transcription_failed", `Transcription failed: ${r.error}`);
      }
      if (r.status !== row.ai_transcript_status) {
        await save(sb, row.session_id, { ai_transcript_status: r.status });
      }
      return pending(r.status);
    }

    // ── Start a new job ─────────────────────────────────────────────
    const rl = await enforceRateLimit(`ai-transcribe:org:${row.org_id}`, 60, 86400);
    if (!rl.allowed) {
      return jsonError(429, "rate_limited", "Daily transcription limit reached for your organisation.", { retryAfter: rl.retryAfter });
    }

    if (row.audio_path) {
      if (!assemblyConfigured()) return notConfigured("ASSEMBLYAI_API_KEY");
      const audioUrl = await audioUrlFor(sb, row);
      if (!audioUrl) return jsonError(422, "no_audio", "The recording file could not be found.");
      const jobId = await submitTranscription(audioUrl);
      await save(sb, row.session_id, {
        ai_transcript_job: jobId,
        ai_transcript_status: "queued",
        ai_transcript_error: null,
        // A fresh transcript invalidates the old dialogue AND its report.
        ...(force ? { ai_dialogue: null, ai_speaker_map: null, ai_analysis: null, ai_score: null } : {}),
      });
      return pending("queued");
    }

    if (row.transcript && row.transcript.trim().length > 20) {
      if (!claudeConfigured()) return notConfigured("ANTHROPIC_API_KEY");
      const turns = await segmentPlainTranscript(row.transcript);
      if (turns.length === 0) return jsonError(422, "no_speech", "The transcript was empty.");
      const dialogue: Dialogue = { source: "text-inferred", language: null, turns };
      const speakerMap: SpeakerMap = { S: "salesperson", C: "customer" };
      await save(sb, row.session_id, {
        ai_transcript_status: "completed",
        ai_transcript_error: null,
        ai_dialogue: dialogue,
        ai_speaker_map: speakerMap,
        ...(force ? { ai_analysis: null, ai_score: null } : {}),
      });
      return done(dialogue, speakerMap);
    }

    return jsonError(422, "no_recording", "This presentation has no recording. Turn on Auto-record in Team settings to capture future meetings.");
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[ai/transcribe]", e);
    return jsonError(500, "server_error", "Something went wrong while transcribing. Please try again.");
  }
}

function notConfigured(envName: string) {
  // eslint-disable-next-line no-console
  console.warn(`[ai/transcribe] ${envName} is not set`);
  return jsonError(503, "not_configured", "AI transcription isn't switched on yet. Ask your VPV administrator to add the API key.");
}

/** Prefer a short-lived signed URL (works whether or not the bucket is
 *  public); fall back to the public URL. */
async function audioUrlFor(sb: SupabaseClient, row: SessionRow): Promise<string | null> {
  if (!row.audio_path) return null;
  const signed = await sb.storage.from("recordings").createSignedUrl(row.audio_path, 6 * 3600);
  if (signed.data?.signedUrl) return signed.data.signedUrl;
  return sb.storage.from("recordings").getPublicUrl(row.audio_path).data.publicUrl ?? null;
}
