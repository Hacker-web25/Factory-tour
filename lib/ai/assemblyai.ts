/**
 * AssemblyAI client — speech-to-text WITH speaker separation.
 *
 * Asynchronous by design, which suits serverless: we submit the audio URL
 * (AssemblyAI downloads it directly from Supabase Storage, so the audio
 * never passes through our function), then poll the job id.
 *
 * SERVER ONLY. Env: ASSEMBLYAI_API_KEY
 */

import type { DialogueTurn } from "@/lib/ai/presentationAiTypes";

const BASE = "https://api.assemblyai.com/v2";

export function assemblyConfigured(): boolean {
  return !!process.env.ASSEMBLYAI_API_KEY;
}

function headers() {
  return {
    authorization: process.env.ASSEMBLYAI_API_KEY as string,
    "content-type": "application/json",
  };
}

/** Submit a recording for diarized transcription. Returns the job id. */
export async function submitTranscription(audioUrl: string): Promise<string> {
  const res = await fetch(`${BASE}/transcript`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      audio_url: audioUrl,
      speaker_labels: true,
      // Indian sales meetings are often Hindi, English or a mix —
      // let the engine detect rather than forcing English.
      language_detection: true,
      punctuate: true,
      format_text: true,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!res.ok || !body.id) {
    throw new Error(body.error || `Transcription service returned ${res.status}`);
  }
  return body.id;
}

export type PollResult =
  | { status: "queued" | "processing" }
  | { status: "error"; error: string }
  | { status: "completed"; language: string | null; turns: DialogueTurn[] };

export async function pollTranscription(jobId: string): Promise<PollResult> {
  const res = await fetch(`${BASE}/transcript/${encodeURIComponent(jobId)}`, {
    headers: headers(),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as {
    status?: string;
    error?: string;
    language_code?: string;
    utterances?: { speaker: string; text: string; start: number; end: number }[] | null;
    text?: string;
  };
  if (!res.ok) return { status: "error", error: body.error || `HTTP ${res.status}` };

  if (body.status === "queued" || body.status === "processing") {
    return { status: body.status };
  }
  if (body.status === "error") {
    return { status: "error", error: body.error || "Transcription failed" };
  }
  if (body.status === "completed") {
    let turns: DialogueTurn[] = (body.utterances ?? []).map((u) => ({
      speaker: String(u.speaker || "A"),
      start_ms: Math.max(0, Math.round(u.start)),
      end_ms: Math.max(0, Math.round(u.end)),
      text: (u.text || "").trim(),
    }));
    // No utterances (silence / single speaker edge cases) — keep the text.
    if (turns.length === 0 && body.text?.trim()) {
      turns = [{ speaker: "A", start_ms: 0, end_ms: 0, text: body.text.trim() }];
    }
    return {
      status: "completed",
      language: body.language_code ?? null,
      turns: turns.filter((t) => t.text.length > 0),
    };
  }
  return { status: "processing" };
}
