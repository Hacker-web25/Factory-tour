/**
 * The two long jobs of the editor, written so they can be tested without a browser:
 *
 *   transcribeSamples()  cut a recording into pieces at quiet moments, send each to
 *                        speech-to-text, and put the lines back together
 *   translateInChunks()  translate many strings, 25 at a time, and total up the result
 *
 * The network is passed in (`api`), so tests use a pretend one.
 */

import type { LanguageApi } from "@/lib/language/client";
import { assemble, type Segment } from "@/lib/language/segments";
import { SAMPLE_RATE, encodeWav, isSilent, planPieces } from "@/lib/language/wav";

type ApiLike = { status?: number; code?: string; name?: string; message?: string };

/** A problem worth trying again: the network blipped or the service had a hiccup. */
export function isRetryable(e: unknown): boolean {
  const x = e as ApiLike;
  if (x?.name === "AbortError") return false;
  if (x?.code === "network" || x?.status === 0) return true;
  return x?.status === 502 || x?.status === 504 || x?.status === 500;
}

/** A problem that makes every further piece pointless (out of allowance, signed out, locked). */
export function isFatalApi(e: unknown): boolean {
  const x = e as ApiLike;
  return x?.code === "quota" || x?.status === 401 || x?.status === 403 || x?.code === "not_configured" || x?.code === "rate_limited";
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function abortIf(signal?: AbortSignal) {
  if (signal?.aborted) throw Object.assign(new Error("Cancelled"), { name: "AbortError" });
}

async function withRetry<T>(fn: () => Promise<T>, retries: number, sleep: (ms: number) => Promise<void>, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    abortIf(signal);
    try {
      return await fn();
    } catch (e) {
      if (attempt >= retries || !isRetryable(e)) throw e;
      await sleep(1000 * (attempt + 1) * (attempt + 1));
    }
  }
}

/* ───────────────────────────── subtitles ───────────────────────────── */

export type TranscribeProgress = { done: number; total: number };

export type TranscribeResult = {
  segments: Segment[];
  /** The language spoken, as Whisper heard it (or the one the person pinned). */
  language: string | null;
  duration: number;
  silentPieces: number;
};

export class TranscribeError extends Error {
  constructor(
    message: string,
    public fromSeconds?: number,
    public cause?: unknown
  ) {
    super(message);
  }
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export async function transcribeSamples(o: {
  tourId: string;
  samples: Float32Array;
  /** Pin the spoken language, or leave out for automatic. */
  language?: string;
  /** Words likely to be spoken (the tour's own names) — helps Whisper spell them. */
  prompt?: string;
  api: Pick<LanguageApi, "transcribe">;
  onProgress?: (p: TranscribeProgress) => void;
  signal?: AbortSignal;
  concurrency?: number;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<TranscribeResult> {
  const { samples, api, signal } = o;
  const sleep = o.sleep ?? defaultSleep;
  const pieces = planPieces(samples);
  const duration = samples.length / SAMPLE_RATE;
  const chunks: { offset: number; segments: Segment[] }[] = [];
  const heard = new Map<string, number>(); // language → seconds of speech
  let language = o.language && o.language !== "auto" ? o.language : undefined;
  let silent = 0;
  let done = 0;
  o.onProgress?.({ done: 0, total: pieces.length });

  async function doPiece(i: number) {
    const p = pieces[i];
    abortIf(signal);
    if (isSilent(samples, p.start, p.end)) {
      silent++;
    } else {
      const wav = encodeWav(samples.subarray(p.start, p.end));
      try {
        // The tour's own words only help once the language is known: before that, English names
        // in the hint could tip the language detection away from what is really being spoken.
        const res = await withRetry(() => api.transcribe(o.tourId, wav, { language, prompt: language ? o.prompt : undefined }, signal), o.retries ?? 2, sleep, signal);
        chunks.push({ offset: p.start / SAMPLE_RATE, segments: res.segments });
        if (res.language) heard.set(res.language, (heard.get(res.language) ?? 0) + (p.end - p.start) / SAMPLE_RATE);
        // Once the language is known, use it for the rest: a short quiet piece is then not mis-heard as another language.
        if (!language && res.language) language = res.language;
      } catch (e) {
        if ((e as ApiLike)?.name === "AbortError" || isFatalApi(e)) throw e;
        throw new TranscribeError(`Speech-to-text failed at ${mmss(p.start / SAMPLE_RATE)}: ${(e as Error)?.message ?? "unknown error"}`, p.start / SAMPLE_RATE, e);
      }
    }
    done++;
    o.onProgress?.({ done, total: pieces.length });
  }

  // First the opening piece (it fixes the language), then the rest a few at a time.
  let next = 0;
  if (pieces.length > 0) {
    await doPiece(0);
    next = 1;
  }
  const workers = Array.from({ length: Math.max(1, o.concurrency ?? 2) }, async () => {
    while (next < pieces.length) {
      const i = next++;
      await doPiece(i);
    }
  });
  try {
    await Promise.all(workers);
  } catch (e) {
    next = pieces.length; // stop the other workers taking more
    throw e;
  }

  const segments = assemble(chunks);
  const top = [...heard.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? language ?? null;
  return { segments, language: top, duration, silentPieces: silent };
}

/** A few of the tour's own words, to help the speech engine spell names right. Under ~220 characters. */
export function vocabularyPrompt(texts: string[], max = 220): string {
  const picked: string[] = [];
  let len = 0;
  const seen = new Set<string>();
  for (const raw of texts) {
    const t = raw.replace(/\s+/g, " ").trim();
    if (t.length < 2 || t.length > 40 || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    if (len + t.length + 2 > max) break;
    picked.push(t);
    len += t.length + 2;
  }
  return picked.join(", ");
}

/* ───────────────────────────── translating ─────────────────────────── */

export type TranslateTotals = {
  translated: number;
  skipped: number;
  skippedReviewed: number;
  failed: { text: string; reason: string }[];
  quotaHit: boolean;
};

const CHUNK_ITEMS = 25;
const CHUNK_CHARS = 12_000;

export function chunkTexts(texts: string[]): string[][] {
  const out: string[][] = [];
  let cur: string[] = [];
  let chars = 0;
  for (const t of texts) {
    if (cur.length > 0 && (cur.length >= CHUNK_ITEMS || chars + t.length > CHUNK_CHARS)) {
      out.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(t);
    chars += t.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

export async function translateInChunks(o: {
  tourId: string;
  lang: string;
  texts: string[];
  sourceLang?: string;
  kind?: "label" | "subtitle";
  mode?: "missing" | "all";
  tourTitle?: string;
  api: Pick<LanguageApi, "translate">;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
}): Promise<TranslateTotals> {
  const sleep = o.sleep ?? defaultSleep;
  const chunks = chunkTexts(o.texts.filter((t) => t.trim().length > 0));
  const total = o.texts.length;
  const totals: TranslateTotals = { translated: 0, skipped: 0, skippedReviewed: 0, failed: [], quotaHit: false };
  let done = 0;
  o.onProgress?.(0, total);

  for (let i = 0; i < chunks.length; i++) {
    abortIf(o.signal);
    const chunk = chunks[i];
    try {
      const res = await withRetry(
        () => o.api.translate(o.tourId, { lang: o.lang, texts: chunk, source_lang: o.sourceLang, mode: o.mode, kind: o.kind, tour_title: o.tourTitle }, o.signal),
        1,
        sleep,
        o.signal
      );
      totals.translated += res.translated;
      totals.skipped += res.skipped;
      totals.skippedReviewed += res.skipped_reviewed;
      totals.failed.push(...res.failed);
      if (res.quota_hit) {
        totals.quotaHit = true;
        if (res.translated === 0) {
          // Every engine is out of allowance: asking again for the rest only wastes calls.
          for (const rest of chunks.slice(i + 1)) for (const t of rest) totals.failed.push({ text: t, reason: "not tried: allowance used up" });
          done = total;
          o.onProgress?.(done, total);
          break;
        }
      }
    } catch (e) {
      if ((e as ApiLike)?.name === "AbortError" || isFatalApi(e)) throw e;
      for (const t of chunk) totals.failed.push({ text: t, reason: (e as Error)?.message ?? "request failed" });
    }
    done += chunk.length;
    o.onProgress?.(Math.min(done, total), total);
  }
  return totals;
}
