/**
 * Languages and the list of texts a tour needs translated.
 *
 * Where things live now
 * ---------------------
 * - Translations, subtitles and each tour's language settings are stored in
 *   Cloudflare D1 (see cloudflare/language-worker.js), NOT in Supabase.
 * - The browser talks to our own /api/language/* routes (lib/language/client.ts);
 *   the routes check who may read or change the tour and then call the Worker.
 * - Every string is found by lib/language/hash.ts (SHA-1 of the text), so a
 *   viewer looks a string up without sending it anywhere.
 * - Translation itself happens on the server (lib/language/engine.ts), which
 *   checks every answer before it is saved.
 *
 * This file is import-safe on the server and in tests: it touches no database.
 */

import type { Hotspot, Scene, Tour } from "@/lib/types";

// -----------------------------------------------------------------------------
//  Supported languages (ISO 639-1 primary tag + display name).
// -----------------------------------------------------------------------------
export type LangCode = string;
export type LangMeta = { code: LangCode; name: string; nativeName: string };

// To add one, add a row here (English name + native name for the picker).
// Order roughly reflects global speaker count so the most common ones
// bubble up in the "Add language" list.
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
//  Collect every translatable string in a tour.
// -----------------------------------------------------------------------------

/** Words the viewer itself shows for a hotspot with no label of its own. */
export const VIEWER_STRINGS = ["Video", "Voice note", "Person"] as const;

export function collectTourTexts(
  tour: Pick<Tour, "title" | "description"> | null,
  scenes: Pick<Scene, "name" | "description">[] | null,
  hotspots:
    | Pick<Hotspot, "label" | "info_title" | "info_body" | "pdf_name">[]
    | null
): string[] {
  const set = new Set<string>();
  const add = (s: string | null | undefined) => {
    if (typeof s === "string" && s.trim().length > 0) set.add(s);
  };
  add(tour?.title);
  add(tour?.description);
  for (const s of scenes ?? []) {
    add(s.name);
    // The scene rail shows the description after trimming (MenuOverlay).
    add(s.description?.trim());
  }
  for (const h of hotspots ?? []) {
    add(h.label);
    add(h.info_title);
    add(h.info_body);
    add(h.pdf_name);
  }
  for (const w of VIEWER_STRINGS) add(w);
  return Array.from(set);
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
  const byLower = new Map(availableLangs.map((l) => [l.toLowerCase(), l]));
  for (const raw of prefs) {
    const full = (raw || "").toLowerCase();
    // "zh-TW" matches a tour offering zh-TW; "es-MX" falls back to es.
    const hit = byLower.get(full) ?? byLower.get(full.split("-")[0]);
    if (hit) return hit;
  }
  return "en";
}
