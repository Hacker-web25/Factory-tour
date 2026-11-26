/**
 * The website's connection to the language Worker (cloudflare/language-worker.js).
 *
 * SERVER ONLY. The Worker address and secret are Vercel settings
 * (LANGUAGE_API_URL, LANGUAGE_API_SECRET); they never reach the browser. Every
 * function here only moves data: WHO may read or change a tour is decided by the
 * routes in app/api/language before they call anything in this file.
 */

export class LanguageWorkerError extends Error {
  constructor(
    public status: number,
    public code: string,
    public detail?: string
  ) {
    super(code);
  }
}

export type TourLanguageConfig = {
  default_language: string;
  available_languages: string[];
  subtitle_settings: Record<string, unknown>;
  updated_at: number;
};

export type TranslationRow = {
  h: string;
  source: string;
  text: string;
  engine: string;
  reviewed: boolean;
  updated_at: number;
};

export type PutRow = { h: string; source: string; text: string; engine: string; reviewed?: boolean };

export type TranscriptMeta = {
  key: string;
  ref: string;
  language: string;
  duration: number | null;
  engine: string;
  reviewed: boolean;
  updated_at: number;
  lines: number;
};

export type StoredTranscript = {
  key: string;
  ref: string;
  language: string;
  duration: number | null;
  segments: { start: number; end: number; text: string }[];
  engine: string;
  reviewed: boolean;
  updated_at: number;
};

export type WhisperPiece = {
  language: string | null;
  duration: number | null;
  text: string;
  vtt: string;
  segments: {
    start: number;
    end: number;
    text: string;
    words?: { w: string; s: number; e: number }[];
    nsp?: number;
    lp?: number;
    cr?: number;
  }[];
};

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;
let fetchImpl: FetchFn | null = null;

/** Test seam — only honoured when NODE_ENV === "test". */
export function __setWorkerFetchForTests(fn: FetchFn | null): void {
  if (process.env.NODE_ENV !== "test") throw new Error("test_only");
  fetchImpl = fn;
}

function settings(): { base: string; secret: string } | null {
  const base = (process.env.LANGUAGE_API_URL ?? "").trim().replace(/\/+$/, "");
  const secret = process.env.LANGUAGE_API_SECRET ?? "";
  return base && secret ? { base, secret } : null;
}

/** Are both Vercel settings present? */
export function languageConfigured(): boolean {
  return settings() !== null;
}

async function call<T>(
  method: "GET" | "POST",
  path: string,
  opts: { query?: Record<string, string>; json?: unknown; text?: string; timeoutMs?: number } = {}
): Promise<T> {
  const s = settings();
  if (!s) throw new LanguageWorkerError(503, "not_configured", "LANGUAGE_API_URL / LANGUAGE_API_SECRET are not set.");
  const qs = opts.query ? `?${new URLSearchParams(opts.query).toString()}` : "";
  const headers: Record<string, string> = { authorization: `Bearer ${s.secret}` };
  let body: string | undefined;
  if (opts.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.json);
  } else if (opts.text !== undefined) {
    headers["content-type"] = "text/plain";
    body = opts.text;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20_000);
  let res: Response;
  try {
    res = await (fetchImpl ?? ((u, i) => fetch(u, i)))(`${s.base}${path}${qs}`, { method, headers, body, signal: ctrl.signal, cache: "no-store" } as RequestInit);
  } catch (e) {
    throw new LanguageWorkerError(504, "worker_unreachable", (e as Error)?.name === "AbortError" ? "timeout" : (e as Error)?.message);
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => null)) as ({ ok?: boolean; error?: string; detail?: string } & Record<string, unknown>) | null;
  if (!res.ok || !data || data.ok !== true) {
    throw new LanguageWorkerError(res.ok ? 502 : res.status, data?.error ?? "worker_error", data?.detail);
  }
  return data as T;
}

export const store = {
  health: () => call<{ version: string; d1: boolean; tables: string[]; ai: boolean; llm_model: string; whisper_model: string }>("GET", "/health"),
  stats: () =>
    call<{ tours: number; translations: number; translations_bytes: number; transcripts: number; transcripts_bytes: number }>("GET", "/stats"),

  async getConfig(tour: string): Promise<TourLanguageConfig> {
    return (await call<{ config: TourLanguageConfig }>("GET", "/config", { query: { tour } })).config;
  },
  async setConfig(
    tour: string,
    change: {
      default_language?: string;
      add_languages?: string[];
      remove_languages?: string[];
      subtitle_settings_patch?: Record<string, unknown>;
    }
  ): Promise<TourLanguageConfig> {
    return (await call<{ config: TourLanguageConfig }>("POST", "/config", { json: { tour, ...change } })).config;
  },

  async getTranslationMap(tour: string, lang: string): Promise<Record<string, string>> {
    return (await call<{ map: Record<string, string> }>("GET", "/translations", { query: { tour, lang } })).map;
  },
  async getTranslationRows(tour: string, lang: string): Promise<TranslationRow[]> {
    return (await call<{ rows: TranslationRow[] }>("GET", "/translations", { query: { tour, lang, full: "1" } })).rows;
  },
  putTranslations: (tour: string, lang: string, rows: PutRow[], overwrite: "none" | "unreviewed" | "all" = "unreviewed") =>
    call<{ written: number; total: number }>("POST", "/translations/put", { json: { tour, lang, rows, overwrite } }),
  deleteTranslations: (tour: string, lang?: string) =>
    call<{ deleted: number }>("POST", "/translations/delete", { json: lang ? { tour, lang } : { tour } }),

  async listTranscripts(tour: string): Promise<TranscriptMeta[]> {
    return (await call<{ items: TranscriptMeta[] }>("GET", "/transcripts", { query: { tour } })).items;
  },
  async getTranscript(tour: string, key: string): Promise<StoredTranscript | null> {
    return (await call<{ transcript: StoredTranscript | null }>("GET", "/transcript", { query: { tour, key } })).transcript;
  },
  putTranscript: (
    tour: string,
    t: { key: string; ref: string; language: string; duration: number | null; segments: { start: number; end: number; text: string }[]; engine: string; reviewed?: boolean; force?: boolean }
  ) => call<{ written: boolean; reason?: string }>("POST", "/transcript/put", { json: { tour, ...t } }),
  deleteTranscript: (tour: string, key: string) => call<{ deleted: number }>("POST", "/transcript/delete", { json: { tour, key } }),

  purge: (tour: string) => call<{ deleted: number }>("POST", "/purge", { json: { tour } }),

  /** WAV bytes → Whisper. The audio travels as base64 text so the Worker spends no CPU on it. */
  transcribe: (wav: Uint8Array, o: { language?: string; prompt?: string }) =>
    call<WhisperPiece>("POST", "/transcribe", {
      query: { ...(o.language ? { language: o.language } : {}), ...(o.prompt ? { prompt: o.prompt } : {}) },
      text: Buffer.from(wav.buffer, wav.byteOffset, wav.byteLength).toString("base64"),
      timeoutMs: 55_000,
    }),

  llm: (a: { system: string; user: string; maxTokens?: number }) =>
    call<{ text: string; model: string }>("POST", "/llm", {
      json: { system: a.system, user: a.user, max_tokens: a.maxTokens },
      timeoutMs: 55_000,
    }),
};
