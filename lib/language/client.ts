/**
 * The browser's side of the language feature: one small wrapper per
 * /api/language route. It adds the signed-in person's token (so the database
 * recognises an editor) and the viewer headers (so it recognises a link holder),
 * and turns every failure into an error with a message a person can act on.
 */

import { supabase } from "@/lib/supabase";
import { viewHeaders } from "@/lib/viewContext";
import type { Segment } from "@/lib/language/segments";

export type StoredConfig = {
  default_language: string;
  available_languages: string[];
  subtitle_settings: Record<string, unknown>;
};
export type TranscriptRef = { key: string; language: string; lines: number; duration: number | null };
export type ConfigResponse = { config: StoredConfig; transcripts: TranscriptRef[] };
export type TranslationRowView = { h: string; source: string; text: string; engine: string; reviewed: boolean; updated_at: number };
export type TranscriptMetaView = { key: string; ref: string; language: string; duration: number | null; engine: string; reviewed: boolean; updated_at: number; lines: number };
export type StoredTranscriptView = { key: string; ref: string; language: string; duration: number | null; segments: Segment[]; engine: string; reviewed: boolean; updated_at: number };
export type TranslateResponse = {
  translated: number;
  skipped: number;
  skipped_reviewed: number;
  failed: { text: string; reason: string }[];
  engines: Record<string, number>;
  quota_hit: boolean;
};
export type PieceResponse = { language: string | null; duration: number; segments: Segment[] };

export class LanguageApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

const FRIENDLY: Record<string, string> = {
  unauthorized: "Please sign in again.",
  forbidden: "You do not have permission to change this tour.",
  not_available: "Subtitles and translations are not open to your account yet.",
  workspace_locked: "This workspace is locked until the subscription is renewed.",
  not_found: "This tour could not be found.",
  not_configured: "Language storage is not switched on yet.",
  quota: "The free daily allowance for speech and translation is used up. Try again tomorrow, or move the Cloudflare Worker to the Paid plan.",
  rate_limited: "Too many requests. Wait a minute and try again.",
  worker_unreachable: "Could not reach the language service. Try again in a moment.",
  payload_too_large: "That is too large to send.",
};

async function request<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  opts: { query?: Record<string, string>; json?: unknown; body?: Uint8Array; signal?: AbortSignal } = {}
): Promise<T> {
  const headers: Record<string, string> = { ...viewHeaders() };
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
  } catch {
    /* anonymous visitor */
  }
  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.json);
  } else if (opts.body) {
    headers["content-type"] = "audio/wav";
    body = opts.body as unknown as BodyInit;
  }
  const qs = opts.query ? `?${new URLSearchParams(opts.query).toString()}` : "";
  let res: Response;
  try {
    res = await fetch(`/api/language${path}${qs}`, { method, headers, body, cache: "no-store", signal: opts.signal });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new LanguageApiError(0, "network", "No connection. Check your internet and try again.");
  }
  const data = (await res.json().catch(() => null)) as ({ ok?: boolean; error?: string; message?: string } & Record<string, unknown>) | null;
  if (!res.ok || !data || data.ok !== true) {
    const code = data?.error ?? "error";
    throw new LanguageApiError(res.status, code, data?.message ?? FRIENDLY[code] ?? `Something went wrong (${code}).`);
  }
  return data as T;
}

export const languageApi = {
  config: (tour: string, signal?: AbortSignal) => request<ConfigResponse>("GET", "/config", { query: { tour }, signal }),
  saveConfig: (
    tour: string,
    change: { default_language?: string; add_languages?: string[]; remove_languages?: string[]; subtitle_settings_patch?: Record<string, unknown> }
  ) => request<{ config: StoredConfig }>("PUT", "/config", { json: { tour, ...change } }),

  translations: async (tour: string, lang: string, signal?: AbortSignal) =>
    (await request<{ map: Record<string, string> }>("GET", "/translations", { query: { tour, lang }, signal })).map,
  translationRows: async (tour: string, lang: string) =>
    (await request<{ rows: TranslationRowView[] }>("GET", "/translations", { query: { tour, lang, full: "1" } })).rows,
  saveTranslations: (tour: string, lang: string, rows: { source: string; text: string }[]) =>
    request<{ written: number }>("PUT", "/translations", { json: { tour, lang, rows } }),
  removeLanguage: (tour: string, lang: string) => request<{ deleted: number }>("DELETE", "/translations", { query: { tour, lang } }),
  translate: (
    tour: string,
    a: { lang: string; texts: string[]; source_lang?: string; mode?: "missing" | "all"; kind?: "label" | "subtitle"; tour_title?: string },
    signal?: AbortSignal
  ) => request<TranslateResponse>("POST", "/translate", { json: { tour, ...a }, signal }),

  transcript: async (tour: string, key: string, signal?: AbortSignal) =>
    (await request<{ transcript: StoredTranscriptView | null }>("GET", "/transcript", { query: { tour, key }, signal })).transcript,
  transcripts: async (tour: string) => (await request<{ items: TranscriptMetaView[] }>("GET", "/transcript", { query: { tour } })).items,
  saveTranscript: (
    tour: string,
    t: { key: string; ref: string; language: string; duration: number | null; segments: Segment[]; reviewed?: boolean; force?: boolean }
  ) => request<{ written: boolean; reason?: string }>("PUT", "/transcript", { json: { tour, ...t } }),
  deleteTranscript: (tour: string, key: string) => request<{ deleted: number }>("DELETE", "/transcript", { query: { tour, key } }),
  transcribe: (tour: string, wav: Uint8Array, o: { language?: string; prompt?: string }, signal?: AbortSignal) =>
    request<PieceResponse>("POST", "/transcribe", {
      query: { tour, ...(o.language ? { language: o.language } : {}), ...(o.prompt ? { prompt: o.prompt } : {}) },
      body: wav,
      signal,
    }),
  purge: (tour: string) => request<{ deleted: number }>("POST", "/purge", { json: { tour } }),
};

export type LanguageApi = typeof languageApi;
