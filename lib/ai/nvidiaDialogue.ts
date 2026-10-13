/**
 * NVIDIA NIM transcript → dialogue splitter.
 *
 * Returns the same shape as the Gemini and heuristic splitters so the
 * route can swap between them freely.
 */

import { MAX_TRANSCRIPT_CHARS, nvidiaJson } from "@/lib/ai/nvidia";
import type { DialogueTurn } from "@/lib/ai/presentationAiTypes";

type NvidiaSplit = {
  turns: { role: "salesperson" | "customer"; text: string }[];
};

export async function nvidiaSplit(transcript: string): Promise<DialogueTurn[]> {
  const clipped = transcript.slice(0, MAX_TRANSCRIPT_CHARS);
  const system =
    "You split a raw speech-to-text transcript of a sales meeting into speaker turns. " +
    "The transcript has NO speaker labels. Infer who is speaking from the content: the SALESPERSON " +
    "presents the factory, offers products, answers questions, and uses 'we/our/here you can see'. " +
    "The CUSTOMER asks about price, capacity, quality, delivery, timelines. The meeting may be in " +
    "Hindi, English or Hinglish — keep the ORIGINAL words (do not translate). Light punctuation is " +
    "fine. Do not summarise or drop content. Return every turn in order.\n\n" +
    'Reply with STRICT JSON matching exactly this shape:\n' +
    '{"turns":[{"role":"salesperson"|"customer","text":"..."}, ...]}\n' +
    "No markdown, no commentary, no extra keys.";

  const out = await nvidiaJson<NvidiaSplit>({
    system,
    user: clipped,
    maxOutputTokens: 8000,
    temperature: 0.1,
  });

  const turns = Array.isArray(out?.turns) ? out.turns : [];
  return turns
    .filter((t) => t && typeof t.text === "string" && t.text.trim())
    .map((t) => ({
      speaker: t.role === "salesperson" ? "S" : "C",
      start_ms: 0,
      end_ms: 0,
      text: t.text.trim(),
    }));
}
