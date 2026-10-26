/**
 * stopPhrases — did anyone in this meeting ask for the recording to stop?
 *
 * Pure TypeScript, no network, no AI, no browser APIs, so the server can
 * run it on a transcript and the tests can pin every rule.
 *
 * WHAT THIS CAN AND CANNOT DO — read before changing the thresholds.
 *
 * It answers "were the words of a stop request spoken?" It does NOT
 * answer "who said them". The transcript comes from the presenter's
 * microphone via the browser's Web Speech API, which has no speaker
 * labels at all. A client sitting across the table is often picked up by
 * that same mic, so their words can appear — unlabelled and mixed in
 * with the rep's. Attribution is a separate, weaker guess made by the AI
 * layer in /api/recording-stops/verify, and it is treated as a hint.
 *
 * Because a miss here can cost someone their job, the matcher is built
 * to under-claim:
 *
 *   STRONG  a stop verb AND a recording noun inside one short span
 *           ("stop recording", "recording band kar do", "रिकॉर्डिंग बंद").
 *           This is the only tier that can support a 'verified_valid'.
 *
 *   WEAK    a bare stop verb ("band kar do", "rok dijiye", "stop it")
 *           with a recording noun somewhere nearby but outside the tight
 *           span. Never clears anyone on its own — it exists so the MD
 *           gets pointed at the right few seconds of audio.
 *
 * A bare "band karo" with no recording word anywhere is NOT a match: in
 * a factory it far more often means a door, a machine or a fan.
 */

/* ───────────────────────── normalisation ───────────────────────── */

/**
 * Lower-case, strip Latin diacritics, drop punctuation, collapse runs of
 * whitespace. Devanagari is left intact — it has no case and its matras
 * are meaning-bearing.
 *
 * Returns the cleaned text AND a map from each cleaned-string index back
 * to the original index, so a match can be quoted with the speaker's own
 * punctuation and casing.
 */
export function normalise(input: string): { text: string; map: number[] } {
  const out: string[] = [];
  const map: number[] = [];
  let lastWasSpace = true; // collapses leading space too

  // NFD splits "é" into "e" + combining accent so the accent can be dropped.
  // We walk the ORIGINAL string, not the decomposed one, to keep indices honest.
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const lower = ch.toLowerCase();
    const stripped = lower
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, ""); // Latin combining marks only

    if (stripped === "") continue; // the char WAS a combining mark

    // Keep letters (any script), digits AND combining marks, then spaces.
    // The marks matter: Devanagari vowel signs (ि ा ो ्) are category Mn,
    // so testing for \p{L}\p{N} alone shreds "रिकॉर्डिंग" into "र क र ड ग".
    // Latin accents never reach here — NFD + the U+0300-036F strip above
    // has already folded them into their base letter.
    if (/[\p{L}\p{N}\p{M}]/u.test(stripped)) {
      out.push(stripped);
      map.push(i);
      lastWasSpace = false;
    } else if (!lastWasSpace) {
      out.push(" ");
      map.push(i);
      lastWasSpace = true;
    }
  }
  // Trim a trailing space
  while (out.length && out[out.length - 1] === " ") {
    out.pop();
    map.pop();
  }
  return { text: out.join(""), map };
}

/* ───────────────────────── the phrase bank ─────────────────────── */

/**
 * Words meaning "the recording" / "to record". If none of these appears
 * anywhere in the window, nothing matches at any tier.
 */
const RECORDING_NOUNS = [
  "recording",
  "record",
  "recorded",
  "records",
  "रिकॉर्डिंग",
  "रिकॉर्ड",
  "रेकॉर्डिंग",
  "रेकॉर्ड",
];
// Deliberately NOT in the list: "rec". It hides inside "direct",
// "correct", "recent", "recipe" and "recommend", and a plant tour is
// full of all five. The abbreviation is rare enough in speech that
// losing it costs nothing next to those false positives.

/**
 * Words meaning "stop / turn off / don't". Romanised Hindi is listed in
 * the spellings people actually type and say, not a single canonical one.
 */
const STOP_VERBS = [
  // English
  "stop",
  "stopped",
  "pause",
  "paused",
  "halt",
  "end",
  "cut",
  "kill",
  "turn off",
  "switch off",
  "shut off",
  "shut down",
  "dont",
  "do not",
  "no need to",
  "delete",
  "erase",
  // Hinglish — romanised
  "band",
  "bandh",
  "bund",
  "rok",
  "roko",
  "rokiye",
  "mat",
  "nahi",
  "nahin",
  "hatao",
  "hata",
  // Devanagari
  "बंद",
  "बन्द",
  "रोक",
  "रोको",
  "रोकिए",
  "मत",
  "नहीं",
  "नही",
  "हटाओ",
];

/**
 * Whole phrases that are unambiguous on their own — a stop verb and a
 * recording noun already sit inside them. Matching one of these is the
 * STRONG tier.
 *
 * Kept as normalised strings (lower-case, no punctuation) so they can be
 * compared against `normalise()` output directly.
 */
const STRONG_PHRASES = [
  // English
  "stop recording",
  "stop the recording",
  "stop recording please",
  "please stop recording",
  "please stop the recording",
  "can you stop the recording",
  "can you stop recording",
  "could you stop the recording",
  "stop the record",
  "pause the recording",
  "pause recording",
  "turn off the recording",
  "turn off recording",
  "switch off the recording",
  "switch off recording",
  "shut off the recording",
  "end the recording",
  "end recording",
  "cut the recording",
  "stop recording this",
  "dont record this",
  "dont record",
  "do not record",
  "do not record this",
  "dont record that",
  "no recording",
  "no recording please",
  "without recording",
  "off the record",
  "delete the recording",
  "erase the recording",
  // Hinglish — romanised. Hindi word order puts the noun first, so most
  // of these read "recording <verb>".
  "recording band",
  "recording bandh",
  "recording band karo",
  "recording band kar do",
  "recording band kar dijiye",
  "recording band kar dijiyega",
  "recording bandh karo",
  "recording bandh kar do",
  "recording rok do",
  "recording rok dijiye",
  "recording roko",
  "recording hatao",
  "recording mat karo",
  "recording mat kijiye",
  "record mat karo",
  "record mat kijiye",
  "mat record karo",
  "record nahi karna",
  "record nahin karna",
  "recording nahi chahiye",
  "recording nahin chahiye",
  "band karo recording",
  "band kar do recording",
  "rok do recording",
  // Devanagari
  "रिकॉर्डिंग बंद",
  "रिकॉर्डिंग बन्द",
  "रिकॉर्डिंग बंद करो",
  "रिकॉर्डिंग बंद कर दो",
  "रिकॉर्डिंग बंद कीजिए",
  "रिकॉर्डिंग रोको",
  "रिकॉर्डिंग रोक दो",
  "रिकॉर्डिंग मत करो",
  "रिकॉर्ड मत करो",
  "रिकॉर्ड मत कीजिए",
  "रिकॉर्डिंग नहीं चाहिए",
  "बंद करो रिकॉर्डिंग",
];

/** How close a bare stop verb must sit to a recording noun to count as
 *  a WEAK match, in normalised characters. ~60 chars is roughly a
 *  sentence either side. */
const WEAK_PROXIMITY_CHARS = 60;

/* ───────────────────────────── matching ────────────────────────── */

export type StopMatchTier = "strong" | "weak";

export type StopPhraseMatch = {
  tier: StopMatchTier;
  /** The phrase pattern that fired, as listed above. */
  pattern: string;
  /** The speaker's own words around the hit, quoted from the ORIGINAL
   *  text so casing and punctuation survive for the MD to read. */
  quote: string;
};

/**
 * Is the span at [from, from+len) a whole word in `norm`?
 *
 * Combining marks count as INSIDE a word, so "रिकॉर्ड" found at the start
 * of "रिकॉर्डिंग" is correctly read as part of the longer word rather than
 * a bounded hit of its own.
 */
function isWordBounded(norm: string, from: number, len: number): boolean {
  const inWord = /[\p{L}\p{N}\p{M}]/u;
  const before = from === 0 ? " " : norm[from - 1];
  const afterIdx = from + len;
  const after = afterIdx >= norm.length ? " " : norm[afterIdx];
  return !inWord.test(before) && !inWord.test(after);
}

export type StopPhraseResult = {
  /** Best match found, or null. Strong beats weak; earlier beats later. */
  match: StopPhraseMatch | null;
  /** Every match, best first — useful for the verdict detail line. */
  all: StopPhraseMatch[];
  /** True when a recording noun appears at all. When false, nothing can
   *  match and the caller knows it was not merely a phrasing miss. */
  mentionsRecording: boolean;
};

/**
 * Pull a readable quote out of the ORIGINAL text around a normalised
 * index range, padded to word boundaries.
 */
function quoteAround(
  original: string,
  map: number[],
  from: number,
  to: number,
  pad = 40
): string {
  if (map.length === 0) return "";
  const lo = Math.max(0, from - pad);
  const hi = Math.min(map.length - 1, to + pad);
  const start = map[lo] ?? 0;
  const end = (map[hi] ?? original.length - 1) + 1;
  let slice = original.slice(start, end).trim();
  if (start > 0) slice = `…${slice}`;
  if (end < original.length) slice = `${slice}…`;
  return slice.replace(/\s+/g, " ");
}

/**
 * Scan a transcript window for a request to stop recording.
 *
 * `text` should already be narrowed to the part of the meeting around
 * the stop — see windowTranscriptTail().
 */
export function findStopRequest(text: string): StopPhraseResult {
  const empty: StopPhraseResult = {
    match: null,
    all: [],
    mentionsRecording: false,
  };
  if (!text || !text.trim()) return empty;

  const { text: norm, map } = normalise(text);
  if (!norm) return empty;

  // Gate: no recording word anywhere → no match at any tier. This is the
  // single most important false-positive guard. "band karo" in a plant
  // almost always means a machine.
  const nounHits: number[] = [];
  for (const noun of RECORDING_NOUNS) {
    let i = norm.indexOf(noun);
    while (i !== -1) {
      if (isWordBounded(norm, i, noun.length)) nounHits.push(i);
      i = norm.indexOf(noun, i + 1);
    }
  }
  if (nounHits.length === 0) return empty;

  const all: StopPhraseMatch[] = [];

  // STRONG — a complete phrase.
  for (const phrase of STRONG_PHRASES) {
    const at = norm.indexOf(phrase);
    if (at !== -1) {
      all.push({
        tier: "strong",
        pattern: phrase,
        quote: quoteAround(text, map, at, at + phrase.length - 1),
      });
    }
  }

  // WEAK — a bare stop verb with a recording noun nearby.
  if (all.length === 0) {
    for (const verb of STOP_VERBS) {
      let at = norm.indexOf(verb);
      while (at !== -1) {
        const afterIdx = at + verb.length;
        if (isWordBounded(norm, at, verb.length)) {
          const near = nounHits.some(
            (n) => Math.abs(n - at) <= WEAK_PROXIMITY_CHARS
          );
          if (near) {
            all.push({
              tier: "weak",
              pattern: verb,
              quote: quoteAround(text, map, at, afterIdx - 1),
            });
            break; // one weak hit per verb is plenty
          }
        }
        at = norm.indexOf(verb, at + 1);
      }
    }
  }

  const strong = all.filter((m) => m.tier === "strong");
  const ordered = [...strong, ...all.filter((m) => m.tier === "weak")];
  return {
    match: ordered[0] ?? null,
    all: ordered,
    mentionsRecording: true,
  };
}

/* ─────────────────────── transcript windowing ──────────────────── */

/**
 * The transcript has no timestamps — the Web Speech API appends final
 * results as they arrive, so it is chronological text and nothing more.
 * The stop therefore lives near the END of it, because we kept recording
 * for the trailing window and then saved.
 *
 * Take the last `words` words. At ordinary speech (~150 wpm ≈ 2.5 words
 * a second) a 15-second window is ~37 words; we take more so the request
 * and the exchange leading to it both land inside.
 *
 * This is an approximation and the code that uses it says so to the MD.
 */
export function windowTranscriptTail(
  transcript: string | null | undefined,
  words = 80
): string {
  if (!transcript) return "";
  const parts = transcript.trim().split(/\s+/);
  if (parts.length <= words) return transcript.trim();
  return parts.slice(-words).join(" ");
}

/** Enough speech in the window to draw any conclusion from its absence.
 *  Below this, silence proves nothing — bad mic, quiet room, a browser
 *  that never granted speech recognition. */
export const MIN_WORDS_FOR_ABSENCE = 25;

export function wordCount(text: string): number {
  const t = (text ?? "").trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}
