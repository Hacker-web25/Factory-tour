/**
 * Translating a whole tour into one language, in the order that matters:
 *
 *   1. the tour's own words (titles, hotspot text, …)
 *   2. the subtitle lines of every audio file that has subtitles
 *
 * and counting what is still missing, so the editor can say "12 texts still
 * need a translation" instead of guessing. The network is passed in (`api`) so
 * tests can use a pretend one.
 */

import type { LanguageApi } from "@/lib/language/client";
import { hashText } from "@/lib/language/hash";
import { translateInChunks, type TranslateTotals } from "@/lib/language/pipeline";

export type TranscriptLike = { key: string; language: string };

export function emptyTotals(): TranslateTotals {
  return { translated: 0, skipped: 0, skippedReviewed: 0, failed: [], quotaHit: false };
}

export function addTotals(a: TranslateTotals, b: TranslateTotals): TranslateTotals {
  return {
    translated: a.translated + b.translated,
    skipped: a.skipped + b.skipped,
    skippedReviewed: a.skippedReviewed + b.skippedReviewed,
    failed: [...a.failed, ...b.failed],
    quotaHit: a.quotaHit || b.quotaHit,
  };
}

/** The distinct, non-blank lines of some transcripts, grouped by the language they were spoken in. */
export function linesBySpokenLanguage(items: { language: string; segments: { text: string }[] }[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const seen = new Map<string, Set<string>>();
  for (const it of items) {
    let set = seen.get(it.language);
    if (!set) {
      set = new Set();
      seen.set(it.language, set);
      out.set(it.language, []);
    }
    for (const s of it.segments) {
      const text = s.text.trim();
      if (!text || set.has(text)) continue;
      set.add(text);
      out.get(it.language)!.push(s.text);
    }
  }
  return out;
}

/**
 * Subtitle lines that are not yet translated (or not yet confirmed), per language spoken.
 * `have` is the set of text keys that already have a translation.
 */
export function missingTexts(texts: string[], have: Set<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of texts) {
    if (!t.trim()) continue;
    const h = hashText(t);
    if (seen.has(h)) continue;
    seen.add(h);
    if (!have.has(h)) out.push(t);
  }
  return out;
}

export type EverythingResult = {
  labels: TranslateTotals;
  subtitles: TranslateTotals;
  /** How many subtitle lines were considered (0 when no audio has subtitles or all are in this language). */
  subtitleLines: number;
};

/** Load the lines of each transcript spoken in a language other than `lang` (those are the ones that need translating). */
export async function loadLinesToTranslate(
  tourId: string,
  lang: string,
  transcripts: TranscriptLike[],
  api: Pick<LanguageApi, "transcript">,
  signal?: AbortSignal
): Promise<Map<string, string[]>> {
  const loaded: { language: string; segments: { text: string }[] }[] = [];
  for (const tr of transcripts) {
    if (tr.language === lang) continue;
    if (signal?.aborted) throw Object.assign(new Error("Cancelled"), { name: "AbortError" });
    const full = await api.transcript(tourId, tr.key, signal);
    if (full && full.segments.length > 0) loaded.push({ language: full.language, segments: full.segments });
  }
  return linesBySpokenLanguage(loaded);
}

export async function translateEverything(o: {
  tourId: string;
  lang: string;
  labels: string[];
  sourceLang: string;
  transcripts: TranscriptLike[];
  tourTitle?: string;
  mode?: "missing" | "all";
  api: Pick<LanguageApi, "translate" | "transcript">;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
}): Promise<EverythingResult> {
  const lines = await loadLinesToTranslate(o.tourId, o.lang, o.transcripts, o.api, o.signal);
  const lineCount = Array.from(lines.values()).reduce((n, l) => n + l.length, 0);
  const total = o.labels.length + lineCount;
  let base = 0;
  o.onProgress?.(0, total);

  let labels = emptyTotals();
  if (o.labels.length > 0 && o.lang !== o.sourceLang) {
    labels = await translateInChunks({
      tourId: o.tourId,
      lang: o.lang,
      texts: o.labels,
      sourceLang: o.sourceLang,
      kind: "label",
      mode: o.mode,
      tourTitle: o.tourTitle,
      api: o.api,
      onProgress: (d) => o.onProgress?.(Math.min(d, o.labels.length), total),
      signal: o.signal,
      sleep: o.sleep,
    });
  }
  base = o.labels.length;

  let subtitles = emptyTotals();
  // If every engine is already out of allowance there is no point asking again for the lines.
  if (!labels.quotaHit || labels.translated > 0) {
    for (const [spoken, texts] of lines) {
      const part = await translateInChunks({
        tourId: o.tourId,
        lang: o.lang,
        texts,
        sourceLang: spoken,
        kind: "subtitle",
        mode: o.mode,
        tourTitle: o.tourTitle,
        api: o.api,
        onProgress: (d) => o.onProgress?.(Math.min(base + d, total), total),
        signal: o.signal,
        sleep: o.sleep,
      });
      subtitles = addTotals(subtitles, part);
      base += texts.length;
      if (part.quotaHit && part.translated === 0) break;
    }
  } else if (lineCount > 0) {
    for (const texts of lines.values()) for (const t of texts) subtitles.failed.push({ text: t, reason: "not tried: allowance used up" });
    subtitles.quotaHit = true;
  }
  o.onProgress?.(total, total);
  return { labels, subtitles, subtitleLines: lineCount };
}

/** One sentence a person can read about how a run went. */
export function describeRun(name: string, r: EverythingResult): string {
  const done = r.labels.translated + r.subtitles.translated;
  const failed = r.labels.failed.length + r.subtitles.failed.length;
  const kept = r.labels.skippedReviewed + r.subtitles.skippedReviewed;
  const parts: string[] = [];
  if (done > 0) parts.push(`Translated ${done} text${done === 1 ? "" : "s"} into ${name}.`);
  else if (failed === 0) parts.push(`${name} is already up to date.`);
  if (kept > 0) parts.push(`${kept} text${kept === 1 ? "" : "s"} you corrected ${kept === 1 ? "was" : "were"} kept as you wrote ${kept === 1 ? "it" : "them"}.`);
  if (r.labels.quotaHit || r.subtitles.quotaHit) {
    parts.push("The free daily allowance for translation is used up — try again tomorrow, or add a Gemini key to continue now.");
  } else if (failed > 0) {
    parts.push(`${failed} text${failed === 1 ? "" : "s"} could not be translated and will show in the original language. Press “Translate missing” to try again.`);
  }
  return parts.join(" ");
}
