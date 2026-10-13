/**
 * POST /api/ai/transcribe   { sessionId, force?, transcript? }
 *
 * Splits the presentation's single-mic transcript into a Customer /
 * Sales Person dialogue. Idempotent: once a dialogue is saved, later
 * calls return it without re-splitting.
 *
 * Three layers of fallback — none of them cost money:
 *   1. Browser-captured transcript (Web Speech API, Chrome/Edge) is
 *      already in presentation_sessions.transcript on recording.
 *      The caller MAY pass a fresher transcript in the body if the
 *      admin just re-ran local Whisper in their browser.
 *   2. Split with Google Gemini (free tier) when GEMINI_API_KEY is set
 *      — accurate roles, works in Hindi / English / Hinglish.
 *   3. Fall back to a rule-based splitter (`heuristicDialogue.ts`)
 *      when the key is missing or Gemini is unreachable. Marked
 *      `source: "heuristic"` so the UI tells the admin.
 *
 * The route never leaves the admin with a bare "error" — it always
 * either returns usable turns, or a specific explanation of what to
 * do next (turn on recording, open the meeting in Chrome, etc.).
 */

import { NextResponse } from "next/server";
import { guardPresentationRequest, jsonError, type SessionRow } from "@/lib/server/presentationAccess";
import { enforceRateLimit } from "@/lib/rateLimit";
import { nvidiaConfigured } from "@/lib/ai/nvidia";
import { nvidiaSplit } from "@/lib/ai/nvidiaDialogue";
import { geminiConfigured } from "@/lib/ai/gemini";
import { geminiSplit } from "@/lib/ai/geminiDialogue";
import { heuristicSplit } from "@/lib/ai/heuristicDialogue";
import {
  guessSpeakerMap,
  type Dialogue,
  type SpeakerMap,
} from "@/lib/ai/presentationAiTypes";
import type { SupabaseClient } from "@supabase/supabase-js";

/** AI providers tried in order. First with a key that doesn't error
 *  wins; the heuristic in `heuristicDialogue.ts` catches everything
 *  that falls through. New providers slot in by prepending here. */
const PROVIDERS: { name: Dialogue["source"]; isConfigured: () => boolean; split: (t: string) => Promise<Dialogue["turns"]> }[] = [
  { name: "nvidia", isConfigured: nvidiaConfigured, split: nvidiaSplit },
  { name: "gemini", isConfigured: geminiConfigured, split: geminiSplit },
];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function save(sb: SupabaseClient, sessionId: string, patch: Record<string, unknown>) {
  const { error } = await sb.rpc("save_presentation_ai", { p_session_id: sessionId, p_patch: patch });
  if (error) throw new Error(error.message);
}

function respond(dialogue: Dialogue, speakerMap: SpeakerMap, notice?: string) {
  return NextResponse.json(
    { ok: true, status: "completed", dialogue, speakerMap, notice },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request) {
  const g = await guardPresentationRequest(req);
  if (!g.ok) return g.res;
  const { auth, row, force, body } = g;
  const sb = auth.sb;

  // Already split — return cached unless force.
  if (row.ai_dialogue && !force) {
    const d = row.ai_dialogue as Dialogue;
    return respond(d, (row.ai_speaker_map as SpeakerMap) ?? guessSpeakerMap(d.turns));
  }

  // Prefer a fresh transcript the admin just computed in-browser
  // (local Whisper) over whatever's in the DB.
  const incoming = typeof body.transcript === "string" ? body.transcript.trim() : "";
  const sourceText = incoming.length > 20 ? incoming : (row.transcript ?? "").trim();

  if (sourceText.length < 20) {
    return jsonError(
      422,
      "no_transcript",
      transcriptMissingMessage(row),
      { hint: "transcript_missing" }
    );
  }

  // Save the fresh transcript if the admin passed one, so the next
  // call doesn't need to be re-sent.
  if (incoming && incoming !== row.transcript) {
    try {
      await sb
        .from("presentation_sessions")
        .update({ transcript: incoming, updated_at: new Date().toISOString() })
        .eq("session_id", row.session_id);
    } catch {
      /* intentional — a failed cache-write never blocks the split */
    }
  }

  // Rate limit the split per-org per-day. Generous because this is free.
  const rl = await enforceRateLimit(`ai-split:org:${row.org_id}`, 200, 86400);
  if (!rl.allowed) {
    return jsonError(429, "rate_limited", "Daily analysis quota reached for your organisation.", {
      retryAfter: rl.retryAfter,
    });
  }

  let turns: Dialogue["turns"] = [];
  let notice: string | undefined;
  let source: Dialogue["source"] = "heuristic";

  const available = PROVIDERS.filter((p) => p.isConfigured());
  if (available.length > 0) {
    await save(sb, row.session_id, { ai_transcript_status: "processing", ai_transcript_error: null }).catch(() => {});
    const failures: string[] = [];
    for (const p of available) {
      try {
        turns = await p.split(sourceText);
        if (turns.length > 0) {
          source = p.name;
          break;
        }
        failures.push(`${p.name} returned no turns`);
      } catch (e) {
        failures.push(`${p.name}: ${(e as Error).message}`);
        // eslint-disable-next-line no-console
        console.warn(`[ai/transcribe] ${p.name} split failed:`, (e as Error).message);
      }
    }
    if (turns.length === 0) {
      notice = "AI split was unavailable — used a rule-based splitter instead. Try again later for the AI version.";
    }
  } else {
    notice = "AI split is not enabled yet — showing a rule-based estimate. The split improves once an admin adds an NVIDIA or Gemini API key.";
  }

  if (turns.length === 0) {
    const h = heuristicSplit(sourceText);
    turns = h.turns;
    source = "heuristic";
    if (h.confidence === "low")
      notice = (notice ? notice + " " : "") +
        "Speaker labels are a best guess on this one — correct any that look wrong using the dropdowns.";
  }

  if (turns.length === 0) {
    return jsonError(422, "no_speech", "The transcript was too short to split into a conversation.");
  }

  const dialogue: Dialogue = { source, language: null, turns };
  const speakerMap = guessSpeakerMap(turns);
  try {
    await save(sb, row.session_id, {
      ai_transcript_status: "completed",
      ai_transcript_error: null,
      ai_dialogue: dialogue,
      ai_speaker_map: speakerMap,
      ...(force ? { ai_analysis: null, ai_score: null } : {}),
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[ai/transcribe] save failed:", (e as Error).message);
    // Still return the dialogue so the admin sees something useful.
    notice = (notice ? notice + " " : "") + "We couldn't save this to the server — results are shown but won't persist.";
  }

  return respond(dialogue, speakerMap, notice);
}

function transcriptMissingMessage(row: SessionRow): string {
  if (row.audio_path) {
    return "We have the recording but no text transcript yet. Open this meeting in Chrome or Edge with Auto-record on so the browser can transcribe live, then come back.";
  }
  return "This meeting wasn't recorded. Turn on Auto-record in Team settings; every presentation after that is transcribed on the salesperson's device (Chrome/Edge).";
}
