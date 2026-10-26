/**
 * Google Gemini client — free-tier friendly, structured JSON output.
 *
 * Why Gemini: the free tier on `gemini-2.0-flash` and
 * `gemini-2.5-flash` is generous enough for small-team usage (currently
 * ~15 req/min, ~1500 req/day on the AI Studio key), it supports
 * native JSON mode with a schema, and the long context easily holds
 * a full meeting transcript.
 *
 * SERVER ONLY. Env: GEMINI_API_KEY, optional GEMINI_MODEL.
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.0-flash";

/** Rough cap so a 3-hour recording can't blow the request limit. */
export const MAX_TRANSCRIPT_CHARS = 120_000;

export function geminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

/** Minimal JSON Schema subset Gemini accepts. We stay inside it on
 *  purpose — nested $ref / anyOf trips the validator. */
export type GeminiSchema = Record<string, unknown>;

/** Call Gemini and force a JSON reply that matches `schema`. The
 *  caller gets a typed object or an Error. Retries once on 429 /
 *  transient 5xx because the free tier briefly throttles. */
export async function geminiJson<T>(args: {
  system: string;
  user: string;
  schema: GeminiSchema;
  maxOutputTokens?: number;
  temperature?: number;
}): Promise<T> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const body = {
    systemInstruction: { role: "system", parts: [{ text: args.system }] },
    contents: [{ role: "user", parts: [{ text: args.user }] }],
    generationConfig: {
      temperature: args.temperature ?? 0.2,
      maxOutputTokens: args.maxOutputTokens ?? 4096,
      responseMimeType: "application/json",
      responseSchema: args.schema,
    },
    // Loosen defaults — a sales meeting can mention competitive price pressure
    // or workplace frustration that trips the safety filters otherwise.
    safetySettings: [
      "HARM_CATEGORY_HARASSMENT",
      "HARM_CATEGORY_HATE_SPEECH",
      "HARM_CATEGORY_SEXUALLY_EXPLICIT",
      "HARM_CATEGORY_DANGEROUS_CONTENT",
    ].map((category) => ({ category, threshold: "BLOCK_ONLY_HIGH" })),
  };

  const url = `${BASE}/${encodeURIComponent(geminiModel())}:generateContent?key=${encodeURIComponent(key)}`;

  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(1500);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      lastErr = (e as Error).message || "network_error";
      continue;
    }
    if (res.status === 429 || res.status === 503) {
      lastErr = `gemini ${res.status}`;
      continue;
    }
    const json = (await res.json().catch(() => ({}))) as {
      candidates?: {
        content?: { parts?: { text?: string }[] };
        finishReason?: string;
      }[];
      error?: { message?: string; status?: string };
      promptFeedback?: { blockReason?: string };
    };
    if (!res.ok) {
      // Permanent-looking failures aren't retried — surface them cleanly.
      throw new Error(json.error?.message || `Gemini returned ${res.status}`);
    }
    if (json.promptFeedback?.blockReason) {
      throw new Error(`Blocked by Gemini safety filter: ${json.promptFeedback.blockReason}`);
    }
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text.trim()) {
      // "MAX_TOKENS" or an empty candidate — treat as transient.
      lastErr = `empty_response (${json.candidates?.[0]?.finishReason ?? "unknown"})`;
      continue;
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      // Models very occasionally wrap JSON in code fences despite
      // responseMimeType — strip them and try once more.
      const stripped = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      return JSON.parse(stripped) as T;
    }
  }
  throw new Error(lastErr || "Gemini call failed");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
