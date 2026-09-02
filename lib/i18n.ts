/**
 * Translation infrastructure (Phase 1: static text).
 *
 * Strategy
 * --------
 * - Every translatable string is identified by SHA-1 of its source text.
 * - Translations are cached forever in Supabase (`translations` table),
 *   keyed by (source_hash, target_lang). We never re-translate the same
 *   text twice.
 * - Owner clicks "Translate to Spanish, French, Hindi" once in the
 *   editor; we walk the tour, find every unique string, POST any that
 *   are missing to MyMemory (free public API), and insert the results.
 * - Viewer with ?lang=xx fetches all rows for their language on load
 *   and looks up rendered strings by hash. Missing rows → fall back
 *   to the source string.
 *
 * Why MyMemory? Free, no signup, no card, ~50k words/day per IP with an
 * email hint. Quality is fine for tour text (short strings, common
 * vocabulary). If you outgrow it, `translateOne` is the single call site
 * to swap for DeepL / Azure / Google.
 */

import { supabase } from "@/lib/supabase";
import type { Hotspot, Scene, Tour } from "@/lib/types";

// -----------------------------------------------------------------------------
//  Supported target languages (ISO 639-1 primary tag + display name).
//  Add any language MyMemory supports — full list at translated.net.
// -----------------------------------------------------------------------------
export type LangCode = string;
export type LangMeta = { code: LangCode; name: string; nativeName: string };

// If you want to add more, MyMemory supports every ISO 639-1 code — just
// add the row here (native name + English name for the picker). Order
// roughly reflects global speaker count so the most common ones bubble
// up in the "Add language" list.
export const SUPPORTED_LANGUAGES: LangMeta[] = [
  { code: "en",    name: "English",              nativeName: "English" },
  { code: "zh",    name: "Chinese (Simplified)", nativeName: "简体中文" },
  { code: "zh-TW", name: "Chinese (Traditional)",nativeName: "繁體中文" },
  { code: "es",    name: "Spanish",              nativeName: "Español" },
  { code: "hi",    name: "Hindi",                nativeName: "हिन्दी" },
  { code: "ar",    name: "Arabic",               nativeName: "العربية" },
  { code: "bn",    name: "Bengali",              nativeName: "বাংলা" },
  { code: "pt",    name: "Portuguese",           nativeName: "Português" },
  { code: "ru",    name: "Russian",              nativeName: "Русский" },
  { code: "ja",    name: "Japanese",             nativeName: "日本語" },
  { code: "pa",    name: "Punjabi",              nativeName: "ਪੰਜਾਬੀ" },
  { code: "de",    name: "German",               nativeName: "Deutsch" },
  { code: "jv",    name: "Javanese",             nativeName: "Basa Jawa" },
  { code: "ko",    name: "Korean",               nativeName: "한국어" },
  { code: "fr",    name: "French",               nativeName: "Français" },
  { code: "te",    name: "Telugu",               nativeName: "తెలుగు" },
  { code: "mr",    name: "Marathi",              nativeName: "मराठी" },
  { code: "tr",    name: "Turkish",              nativeName: "Türkçe" },
  { code: "ta",    name: "Tamil",                nativeName: "தமிழ்" },
  { code: "vi",    name: "Vietnamese",           nativeName: "Tiếng Việt" },
  { code: "ur",    name: "Urdu",                 nativeName: "اردو" },
  { code: "it",    name: "Italian",              nativeName: "Italiano" },
  { code: "gu",    name: "Gujarati",             nativeName: "ગુજરાતી" },
  { code: "pl",    name: "Polish",               nativeName: "Polski" },
  { code: "uk",    name: "Ukrainian",            nativeName: "Українська" },
  { code: "fa",    name: "Persian (Farsi)",      nativeName: "فارسی" },
  { code: "id",    name: "Indonesian",           nativeName: "Bahasa Indonesia" },
  { code: "ms",    name: "Malay",                nativeName: "Bahasa Melayu" },
  { code: "kn",    name: "Kannada",              nativeName: "ಕನ್ನಡ" },
  { code: "ml",    name: "Malayalam",            nativeName: "മലയാളം" },
  { code: "or",    name: "Odia",                 nativeName: "ଓଡ଼ିଆ" },
  { code: "th",    name: "Thai",                 nativeName: "ไทย" },
  { code: "my",    name: "Burmese",              nativeName: "မြန်မာဘာသာ" },
  { code: "he",    name: "Hebrew",               nativeName: "עברית" },
  { code: "nl",    name: "Dutch",                nativeName: "Nederlands" },
  { code: "el",    name: "Greek",                nativeName: "Ελληνικά" },
  { code: "sv",    name: "Swedish",              nativeName: "Svenska" },
  { code: "hu",    name: "Hungarian",            nativeName: "Magyar" },
  { code: "cs",    name: "Czech",                nativeName: "Čeština" },
  { code: "ro",    name: "Romanian",             nativeName: "Română" },
  { code: "fi",    name: "Finnish",              nativeName: "Suomi" },
  { code: "no",    name: "Norwegian",            nativeName: "Norsk" },
  { code: "da",    name: "Danish",               nativeName: "Dansk" },
  { code: "sw",    name: "Swahili",              nativeName: "Kiswahili" },
  { code: "tl",    name: "Filipino (Tagalog)",   nativeName: "Filipino" },
  { code: "am",    name: "Amharic",              nativeName: "አማርኛ" },
  { code: "km",    name: "Khmer",                nativeName: "ខ្មែរ" },
  { code: "si",    name: "Sinhala",              nativeName: "සිංහල" },
  { code: "ne",    name: "Nepali",               nativeName: "नेपाली" },
  { code: "az",    name: "Azerbaijani",          nativeName: "Azərbaycan" },
  { code: "ka",    name: "Georgian",             nativeName: "ქართული" },
  { code: "hy",    name: "Armenian",             nativeName: "Հայերեն" },
  { code: "sr",    name: "Serbian",              nativeName: "Српски" },
  { code: "hr",    name: "Croatian",             nativeName: "Hrvatski" },
  { code: "bg",    name: "Bulgarian",            nativeName: "Български" },
  { code: "sk",    name: "Slovak",               nativeName: "Slovenčina" },
  { code: "sl",    name: "Slovenian",            nativeName: "Slovenščina" },
  { code: "et",    name: "Estonian",             nativeName: "Eesti" },
  { code: "lv",    name: "Latvian",              nativeName: "Latviešu" },
  { code: "lt",    name: "Lithuanian",           nativeName: "Lietuvių" },
  { code: "af",    name: "Afrikaans",            nativeName: "Afrikaans" },
  { code: "zu",    name: "Zulu",                 nativeName: "isiZulu" },
];

// Runtime lookup — display metadata for a given code.
export function langMeta(code: LangCode): LangMeta {
  return (
    SUPPORTED_LANGUAGES.find((l) => l.code === code) ?? {
      code,
      name: code,
      nativeName: code,
    }
  );
}

// -----------------------------------------------------------------------------
//  Hashing — SHA-1 is short (40 hex), fast, and effectively collision-free
//  for our string-count scale. Cached per session so we don't rehash the
//  same string N times per render.
// -----------------------------------------------------------------------------
const hashCache = new Map<string, string>();

export async function sha1(text: string): Promise<string> {
  const cached = hashCache.get(text);
  if (cached) return cached;
  if (typeof crypto === "undefined" || !crypto.subtle) {
    // SSR / very old browser — return the text itself, which is fine
    // because the Postgres unique constraint is on (source_hash, lang).
    return text;
  }
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-1", buf);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  hashCache.set(text, hex);
  return hex;
}

/** Sync accessor — returns the previously-computed hash or empty string. */
export function hashOfSync(text: string): string {
  return hashCache.get(text) ?? "";
}

/** Batch-compute hashes for a bunch of strings up front so subsequent
 *  `hashOfSync` calls in render functions are free. */
export async function precomputeHashes(texts: string[]): Promise<void> {
  await Promise.all(texts.map((t) => sha1(t)));
}

// -----------------------------------------------------------------------------
//  Collect every translatable string in a tour.
// -----------------------------------------------------------------------------
export function collectTourTexts(
  tour: Pick<Tour, "title" | "description"> | null,
  scenes: Pick<Scene, "name">[] | null,
  hotspots: Pick<
    Hotspot,
    "label" | "info_title" | "info_body" | "pdf_name"
  >[] | null
): string[] {
  const set = new Set<string>();
  if (tour?.title) set.add(tour.title);
  if (tour?.description) set.add(tour.description);
  for (const s of scenes ?? []) if (s.name) set.add(s.name);
  for (const h of hotspots ?? []) {
    if (h.label) set.add(h.label);
    if (h.info_title) set.add(h.info_title);
    if (h.info_body) set.add(h.info_body);
    if (h.pdf_name) set.add(h.pdf_name);
  }
  return Array.from(set).filter((s) => s.trim().length > 0);
}

// -----------------------------------------------------------------------------
//  MyMemory — free translation API.
//  https://mymemory.translated.net/doc/spec.php
//  GET /get?q=<text>&langpair=en|es&de=<email>
// -----------------------------------------------------------------------------
export type TranslateFn = (
  text: string,
  targetLang: LangCode,
  sourceLang?: LangCode
) => Promise<string>;

// Read at call time so a .env change takes effect without a rebuild.
const MYMEMORY_EMAIL =
  (typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_MYMEMORY_EMAIL) ||
  "";

/** Normalize a language code so MyMemory won't reject it. Accepts
 *  'en', 'zh-CN', etc. Rejects garbage like 'auto', empty, or 3+ letter
 *  codes that MyMemory doesn't support — falls back to 'en'. */
function sanitizeLangCode(code: string | null | undefined): string {
  if (!code) return "en";
  const s = String(code).trim();
  if (/^[a-z]{2}(-[A-Z]{2})?$/i.test(s)) return s;
  return "en";
}

export const translateOne: TranslateFn = async (text, targetLang, sourceLang = "en") => {
  const src = sanitizeLangCode(sourceLang);
  const tgt = sanitizeLangCode(targetLang);
  const params = new URLSearchParams({
    q: text,
    langpair: `${src}|${tgt}`,
  });
  if (MYMEMORY_EMAIL) params.set("de", MYMEMORY_EMAIL);
  const res = await fetch(
    `https://api.mymemory.translated.net/get?${params.toString()}`
  );
  if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
  const data = (await res.json()) as {
    responseData?: { translatedText?: string };
    responseStatus?: number | string;
    responseDetails?: string;
  };
  const raw = data.responseData?.translatedText;
  if (!raw) throw new Error("MyMemory returned no translation");
  const cleaned = raw.replace(/^MYMEMORY WARNING[^:]*:\s*/i, "").trim();
  // Detect MyMemory error strings that would otherwise get cached as
  // the "translation" and appear verbatim on screen.
  const looksLikeError =
    /INVALID (SOURCE|TARGET) LANGUAGE/i.test(cleaned) ||
    /IS AN INVALID/i.test(cleaned) ||
    (data.responseStatus && String(data.responseStatus) !== "200");
  if (looksLikeError) {
    throw new Error(
      `MyMemory rejected the request (${data.responseDetails ?? cleaned.slice(0, 80)})`
    );
  }
  return cleaned;
};

// -----------------------------------------------------------------------------
//  Fetch existing translations for a set of source strings.
// -----------------------------------------------------------------------------
export async function loadTranslations(
  sourceTexts: string[],
  targetLang: LangCode
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (targetLang === "en" || sourceTexts.length === 0) return map;

  await precomputeHashes(sourceTexts);
  const hashes = sourceTexts.map((t) => hashOfSync(t)).filter(Boolean);
  if (hashes.length === 0) return map;

  // Fetch in chunks — Supabase `in` list has a URL-length cap.
  const CHUNK = 200;
  for (let i = 0; i < hashes.length; i += CHUNK) {
    const slice = hashes.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("translations")
      .select("source_hash, translated_text")
      .in("source_hash", slice)
      .eq("target_lang", targetLang);
    if (error) {
      console.warn("[i18n] loadTranslations chunk error:", error.message);
      continue;
    }
    for (const row of data ?? []) {
      map.set(
        (row as any).source_hash as string,
        (row as any).translated_text as string
      );
    }
  }
  return map;
}

// -----------------------------------------------------------------------------
//  Translate a set of strings into a target language, writing the results
//  to the cache table. Progressive: reports done/total after each string
//  so the editor can show a progress bar.
// -----------------------------------------------------------------------------
export async function translateAndCache(opts: {
  tourId: string;
  sourceTexts: string[];
  targetLang: LangCode;
  sourceLang?: LangCode;
  onProgress?: (done: number, total: number, currentText?: string) => void;
  concurrency?: number;
}): Promise<{ translated: number; failed: number }> {
  const {
    tourId,
    sourceTexts,
    targetLang,
    sourceLang = "en",
    onProgress,
    concurrency = 3,
  } = opts;

  if (targetLang === sourceLang) return { translated: 0, failed: 0 };

  // Skip strings that already have a translation cached.
  const already = await loadTranslations(sourceTexts, targetLang);
  const missing = sourceTexts.filter((t) => {
    const h = hashOfSync(t);
    return !!h && !already.has(h);
  });
  if (missing.length === 0) return { translated: 0, failed: 0 };

  let done = 0;
  let failed = 0;
  const rowsToInsert: Array<{
    source_hash: string;
    source_text: string;
    target_lang: string;
    translated_text: string;
    tour_id: string;
  }> = [];

  // Simple concurrency limiter — MyMemory tolerates a few parallel
  // requests fine. `concurrency=3` is a safe default.
  const queue = missing.slice();
  async function worker() {
    while (queue.length) {
      const text = queue.shift()!;
      try {
        const translated = await translateOne(text, targetLang, sourceLang);
        const h = await sha1(text);
        rowsToInsert.push({
          source_hash: h,
          source_text: text,
          target_lang: targetLang,
          translated_text: translated,
          tour_id: tourId,
        });
      } catch (err) {
        console.warn("[i18n] translate failed for:", text, err);
        failed++;
      } finally {
        done++;
        onProgress?.(done, missing.length, text);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  // Write all new translations in one round-trip.
  if (rowsToInsert.length > 0) {
    // Chunk inserts to keep individual queries small.
    const CHUNK = 200;
    for (let i = 0; i < rowsToInsert.length; i += CHUNK) {
      const slice = rowsToInsert.slice(i, i + CHUNK);
      const { error } = await supabase
        .from("translations")
        .upsert(slice, { onConflict: "source_hash,target_lang" });
      if (error) console.warn("[i18n] upsert error:", error.message);
    }
  }

  return { translated: rowsToInsert.length, failed };
}

// -----------------------------------------------------------------------------
//  Register a language as "available" on a tour so viewers see it in the
//  language picker.
// -----------------------------------------------------------------------------
export async function markLanguageAvailable(
  tourId: string,
  lang: LangCode
): Promise<void> {
  const { data: existing } = await supabase
    .from("tours")
    .select("available_languages")
    .eq("id", tourId)
    .single();
  const current = ((existing as any)?.available_languages as string[]) ?? [];
  if (current.includes(lang)) return;
  await supabase
    .from("tours")
    .update({ available_languages: [...current, lang] })
    .eq("id", tourId);
}

export async function unmarkLanguageAvailable(
  tourId: string,
  lang: LangCode
): Promise<void> {
  const { data: existing } = await supabase
    .from("tours")
    .select("available_languages")
    .eq("id", tourId)
    .single();
  const current = ((existing as any)?.available_languages as string[]) ?? [];
  const next = current.filter((l) => l !== lang);
  await supabase
    .from("tours")
    .update({ available_languages: next })
    .eq("id", tourId);
}

// -----------------------------------------------------------------------------
//  Auto-detect visitor language: browser preferences intersected with
//  tour's available languages. Falls back to source (English).
// -----------------------------------------------------------------------------
export function detectVisitorLanguage(availableLangs: LangCode[]): LangCode {
  if (typeof navigator === "undefined") return "en";
  const prefs =
    (navigator.languages && Array.from(navigator.languages)) ||
    (navigator.language ? [navigator.language] : []);
  for (const raw of prefs) {
    const primary = (raw || "").toLowerCase().split("-")[0];
    if (availableLangs.includes(primary)) return primary;
  }
  return "en";
}
