/**
 * Gemini-backed transcript → dialogue splitter.
 *
 * Takes a plain, single-mic transcript and asks Gemini to split it
 * into Customer / Sales Person turns. Returns the same shape as the
 * heuristic splitter so the caller can swap between them freely.
 */

import { MAX_TRANSCRIPT_CHARS, geminiJson } from "@/lib/ai/gemini";
import type { DialogueTurn } from "@/lib/ai/presentationAiTypes";

const SCHEMA = {
  type: "object",
  required: ["turns"],
  properties: {
    turns: {
      type: "array",
      items: {
        type: "object",
        required: ["role", "text"],
        properties: {
          role: { type: "string", enum: ["salesperson", "customer"] },
          text: { type: "string" },
        },
      },
    },
  },
};

type GeminiSplit = {
  turns: { role: "salesperson" | "customer"; text: string }[];
};

export async function geminiSplit(transcript: string): Promise<DialogueTurn[]> {
  const clipped = transcript.slice(0, MAX_TRANSCRIPT_CHARS);
  const out = await geminiJson<GeminiSplit>({
    system:
      "You split a raw speech-to-text transcript of a sales meeting into speaker turns. " +
      "The transcript has no speaker labels. Infer who is speaking from the content: the SALESPERSON " +
      "presents the factory, offers products, answers questions, and uses 'we/our/here you can see'. " +
      "The CUSTOMER asks about price, capacity, quality, delivery, timelines. The meeting may be in " +
      "Hindi, English or Hinglish — keep the ORIGINAL words (do not translate). Light punctuation is " +
      "fine. Do not summarise or drop content. Return every turn in order.",
    user: clipped,
    schema: SCHEMA,
    maxOutputTokens: 8000,
    temperature: 0.1,
  });
  return (out.turns ?? [])
    .filter((t) => t.text?.trim())
    .map((t) => ({
      speaker: t.role === "salesperson" ? "S" : "C",
      start_ms: 0,
      end_ms: 0,
      text: t.text.trim(),
    }));
}
