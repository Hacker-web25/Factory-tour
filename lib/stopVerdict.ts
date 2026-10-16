/**
 * stopVerdict — turning "what the matcher found" into the verdict the MD
 * sees on a recording stop.
 *
 * Pure, so the decision table is pinned by tests rather than discovered
 * in production on a real person's record.
 *
 * THE BIAS IS DELIBERATE. Three rules govern every branch below:
 *
 *   1. 'unverified' is the default. Every uncertainty lands there.
 *   2. 'verified_valid' needs a STRONG phrase match. A weak hit points
 *      the MD at the audio; it never clears anyone by itself.
 *   3. 'flagged' is the narrowest branch in the file. It needs plenty of
 *      speech captured, no stop phrase anywhere, AND the AI agreeing
 *      nothing resembling a request was made. Any gap — no transcript,
 *      a short window, no AI, an AI that is unsure — returns
 *      'unverified' instead.
 *
 * Rule 3 exists because silence is not evidence. A bad mic, a quiet
 * room, a browser that never granted speech recognition, or a client who
 * asked by gesture all produce exactly the same empty transcript as a
 * rep switching the recording off for no reason.
 */

import {
  findStopRequest,
  windowTranscriptTail,
  wordCount,
  MIN_WORDS_FOR_ABSENCE,
  type StopPhraseResult,
} from "./stopPhrases";

export type StopVerdict = "verified_valid" | "unverified" | "flagged";

/** What the AI attribution pass concluded, when it ran at all. */
export type Attribution = {
  /** Who the model thinks asked for the stop. */
  by: "presenter" | "other" | "unclear";
  /** The model's own one-line reason, shown to the MD verbatim. */
  reason?: string | null;
};

export type VerdictInput = {
  /** The whole session transcript, or null when none was captured. */
  transcript: string | null;
  /** Result of the AI pass, or null when it did not run (no key, error,
   *  nothing worth asking about). */
  attribution: Attribution | null;
  /** False when the tab closed before the trailing window finished. */
  trailingCaptured: boolean;
};

export type VerdictOutput = {
  verdict: StopVerdict;
  /** One sentence for the MD, stored on recording_stops.verdict_detail. */
  detail: string;
  /** The words that fired the match, when there was one. */
  quote: string | null;
  /** Exposed for tests and for the detail line. */
  phrases: StopPhraseResult;
  windowWords: number;
};

/** How many words of the tail we examine. See windowTranscriptTail. */
export const WINDOW_WORDS = 80;

export function decideVerdict(input: VerdictInput): VerdictOutput {
  const windowText = windowTranscriptTail(input.transcript, WINDOW_WORDS);
  const words = wordCount(windowText);
  const phrases = findStopRequest(windowText);
  const base = { phrases, windowWords: words };

  // ── No transcript at all ────────────────────────────────────────
  // Speech recognition is Chrome/Edge-only and permission-gated. Its
  // absence says nothing about the rep.
  if (words === 0) {
    return {
      ...base,
      verdict: "unverified",
      quote: null,
      detail:
        "No speech was transcribed for this meeting, so there is nothing to check the stop against. This is common — live transcription only works in some browsers. Listen to the audio and decide.",
    };
  }

  const strong = phrases.all.find((m) => m.tier === "strong") ?? null;
  const weak = phrases.all.find((m) => m.tier === "weak") ?? null;

  // ── A clear stop request was spoken ─────────────────────────────
  if (strong) {
    const by = input.attribution?.by;
    if (by === "other") {
      return {
        ...base,
        verdict: "verified_valid",
        quote: strong.quote,
        detail: `A request to stop recording was heard, and it reads as coming from someone other than the rep.${
          input.attribution?.reason ? ` ${input.attribution.reason}` : ""
        }`,
      };
    }
    if (by === "presenter") {
      // NOT flagged. A rep saying "sure, I'll stop the recording" out
      // loud is the normal response to a client asking — often by
      // gesture, which leaves no words at all.
      return {
        ...base,
        verdict: "unverified",
        quote: strong.quote,
        detail:
          "A request to stop recording was heard, but it reads as the rep's own words. That is often the rep agreeing out loud to a client who asked — sometimes without speaking. Listen before you decide.",
      };
    }
    return {
      ...base,
      verdict: "unverified",
      quote: strong.quote,
      detail:
        "A request to stop recording was heard, but we could not tell who said it. The transcript comes from one microphone with no speaker labels, so this is expected rather than suspicious.",
    };
  }

  // ── Something stop-shaped, but not clear ────────────────────────
  if (weak) {
    return {
      ...base,
      verdict: "unverified",
      quote: weak.quote,
      detail:
        "Something close to a stop request was said near a mention of the recording, but not clearly enough to call it one. The quote below is where to start listening.",
    };
  }

  // ── Nothing found. Is the silence meaningful? ───────────────────
  if (!input.trailingCaptured) {
    return {
      ...base,
      verdict: "unverified",
      quote: null,
      detail:
        "The tab closed before the trailing window finished, so the seconds after the stop may be missing. A laptop lid closing does exactly this.",
    };
  }

  if (words < MIN_WORDS_FOR_ABSENCE) {
    return {
      ...base,
      verdict: "unverified",
      quote: null,
      detail: `Only ${words} word${
        words === 1 ? "" : "s"
      } were transcribed around the stop — too little to conclude anything from the absence of a request. A quiet room or a poor microphone looks the same as silence.`,
    };
  }

  if (!input.attribution) {
    return {
      ...base,
      verdict: "unverified",
      quote: null,
      detail:
        "No request to stop recording was found in the transcript, but the second check could not run, so this has not been confirmed. Listen before you decide.",
    };
  }

  if (input.attribution.by !== "unclear") {
    // The model thinks it DID find a request even though our phrase bank
    // did not. Trust the cautious reading and leave it open.
    return {
      ...base,
      verdict: "unverified",
      quote: null,
      detail: `Our phrase check found no request to stop, but the second check read one in the conversation.${
        input.attribution.reason ? ` ${input.attribution.reason}` : ""
      } Treat this as unresolved and listen.`,
    };
  }

  // ── The narrow branch ───────────────────────────────────────────
  // Enough speech, trailing window intact, no phrase match, and the AI
  // agrees nothing resembling a request was made.
  return {
    ...base,
    verdict: "flagged",
    quote: null,
    detail: `${words} words were transcribed around the stop and none of them is a request to stop recording. That is worth a conversation, not a conclusion — the client may have asked by gesture, or stood up, or the microphone may have missed them.`,
  };
}
