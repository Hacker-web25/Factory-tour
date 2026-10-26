/**
 * NVIDIA NIM client — the free-tier primary provider.
 *
 * build.nvidia.com hosts hundreds of open-weight models (Llama, Qwen,
 * Mixtral, DeepSeek, Nemotron, …) behind an OpenAI-compatible API,
 * with a generous free credit tier that outlasts Gemini's daily cap
 * for ordinary sales-team use.
 *
 * The default model, `nvidia/nemotron-3-super-120b-a12b`, is on
 * NVIDIA's Free Endpoint tier (meta/llama-3.3-70b-instruct was
 * deprecated by NVIDIA), handles JSON mode, and the Hindi / English /
 * Hinglish mix that most Indian B2B meetings use. Switch models by
 * setting `NVIDIA_MODEL`.
 *
 * SERVER ONLY. Env: NVIDIA_API_KEY, optional NVIDIA_MODEL.
 */

const BASE = "https://integrate.api.nvidia.com/v1";
const DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b";

/** Rough cap so a 3-hour recording can't blow the request limit. */
export const MAX_TRANSCRIPT_CHARS = 100_000;

export function nvidiaConfigured(): boolean {
  return !!process.env.NVIDIA_API_KEY;
}

export function nvidiaModel(): string {
  return process.env.NVIDIA_MODEL || DEFAULT_MODEL;
}

/** Call NVIDIA NIM in JSON mode. The schema is enforced on OUR side
 *  because `response_format: json_object` guarantees valid JSON but
 *  not any particular shape — the system prompt describes the shape
 *  and the caller validates after parse.
 *
 *  Retries once on 429 / 5xx, same as the Gemini client. */
export async function nvidiaJson<T>(args: {
  system: string;
  user: string;
  maxOutputTokens?: number;
  temperature?: number;
}): Promise<T> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("NVIDIA_API_KEY not set");

  const body = {
    model: nvidiaModel(),
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
    temperature: args.temperature ?? 0.2,
    max_tokens: args.maxOutputTokens ?? 4096,
    response_format: { type: "json_object" },
    stream: false,
  };

  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(1500);
    let res: Response;
    try {
      res = await fetch(`${BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      lastErr = (e as Error).message || "network_error";
      continue;
    }
    if (res.status === 429 || res.status === 503 || res.status === 502) {
      lastErr = `nvidia ${res.status}`;
      continue;
    }
    const json = (await res.json().catch(() => ({}))) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new Error(json.error?.message || `NVIDIA returned ${res.status}`);
    }
    const text = json.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) {
      lastErr = `empty_response (${json.choices?.[0]?.finish_reason ?? "unknown"})`;
      continue;
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      // Some models wrap JSON in ```json fences; strip and retry parse.
      const stripped = text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
      try {
        return JSON.parse(stripped) as T;
      } catch {
        lastErr = "unparseable_json";
        continue;
      }
    }
  }
  throw new Error(lastErr || "NVIDIA call failed");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
