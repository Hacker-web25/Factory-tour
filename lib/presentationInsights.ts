"use client";

/**
 * Deep AI-style analysis over a presentation transcript.
 *
 * Runs entirely client-side against the transcript we already store — free,
 * deterministic, and swap-in-a-real-LLM-later friendly. Produces the kind of
 * insights a sales coach would give:
 *
 *   • Talk metrics (words / minute, filler words, longest monologue)
 *   • Topic coverage with evidence sentences
 *   • Detected quotation numbers (₹ / lakh / crore / rupee)
 *   • Location & logistics mentions
 *   • Buying-signal + objection cues
 *   • Sentiment score (positive vs negative language)
 *   • Question / answer cadence
 *   • Coaching score (0-100) with a short rationale
 */

import { detectTopics, type TopicHit } from "@/lib/presentationSession";

export type PresentationAnalysis = {
  wordCount: number;
  wordsPerMinute: number;
  fillerCount: number;
  fillerRate: number; // per 100 words
  longestMonologueSec: number;
  questionCount: number;
  positiveHits: number;
  negativeHits: number;
  sentiment: "positive" | "neutral" | "concerned";
  quotations: string[];
  buyingSignals: string[];
  objections: string[];
  topics: TopicHit[];
  coverage: { key: string; label: string; covered: boolean; mentions: number }[];
  score: number; // 0-100
  scoreBand: "Excellent" | "Strong" | "Fair" | "Needs work";
  strengths: string[];
  improvements: string[];
};

const FILLERS = [
  "um", "uh", "like", "you know", "basically", "actually", "literally",
  "so yeah", "i mean", "sort of", "kind of",
];

const POSITIVE_WORDS = [
  "great", "excellent", "perfect", "best", "trusted", "quality", "premium",
  "reliable", "certified", "leading", "advanced", "proven", "innovative",
  "world-class", "top",
];

const NEGATIVE_WORDS = [
  "problem", "issue", "delay", "expensive", "risk", "difficult", "cannot",
  "unfortunately", "sorry", "worried", "concern",
];

const BUYING_CUES = [
  "when can we start", "how do we", "next step", "next steps", "send me",
  "share the", "share a", "quote", "quotation", "proposal", "purchase order",
  "po", "sample", "trial", "pilot", "demo", "site visit", "reference",
];

const OBJECTION_CUES = [
  "too expensive", "budget", "not sure", "let me think", "compare",
  "competitor", "cheaper", "not now", "later", "delay", "risk", "problem",
];

const NUMBER_RE =
  /\b(?:rs\.?|₹|inr|usd|\$)?\s?\d[\d,]*(?:\.\d+)?\s?(?:lakh|lakhs|crore|crores|thousand|k|lac|per\s+unit|per\s+kg|per\s+ton|per\s+tonne|rupees?|dollars?)\b/gi;

/** Fixed coverage checklist so we can show "covered / missed" per pitch. */
const COVERAGE_CHECKLIST: { key: string; label: string }[] = [
  { key: "sales", label: "Sales pitch / value" },
  { key: "quotation", label: "Quotation / pricing" },
  { key: "location", label: "Location / logistics" },
  { key: "product", label: "Product / process" },
  { key: "capacity", label: "Capacity / scale" },
  { key: "compliance", label: "Quality / certifications" },
];

export function analyzeTranscript(
  transcript: string,
  durationSec: number
): PresentationAnalysis {
  const clean = (transcript || "").trim();
  const words = clean.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const minutes = Math.max(0.1, durationSec / 60);
  const wordsPerMinute = Math.round(wordCount / minutes);

  const lower = clean.toLowerCase();

  const fillerCount = FILLERS.reduce(
    (a, f) =>
      a + (lower.match(new RegExp(`\\b${escapeRe(f)}\\b`, "g"))?.length ?? 0),
    0
  );
  const fillerRate =
    wordCount > 0 ? +((fillerCount / wordCount) * 100).toFixed(1) : 0;

  // Rough monologue length — longest run between question-marks / long pauses
  // (we don't have real pauses, so approximate with sentence-length caps).
  const sentences = clean.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
  let longestSentenceWords = 0;
  for (const s of sentences) {
    const w = s.split(/\s+/).filter(Boolean).length;
    if (w > longestSentenceWords) longestSentenceWords = w;
  }
  // If the presenter speaks ~120 wpm, N words takes N/2 seconds.
  const longestMonologueSec = Math.round((longestSentenceWords / 2) * 1);

  const questionCount = (clean.match(/\?/g) ?? []).length;
  const positiveHits = countAny(lower, POSITIVE_WORDS);
  const negativeHits = countAny(lower, NEGATIVE_WORDS);
  const sentiment: PresentationAnalysis["sentiment"] =
    positiveHits - negativeHits >= 3
      ? "positive"
      : negativeHits - positiveHits >= 2
        ? "concerned"
        : "neutral";

  const quotations = Array.from(
    new Set(clean.match(NUMBER_RE)?.map((s) => s.trim()) ?? [])
  ).slice(0, 12);

  const buyingSignals = findEvidence(sentences, BUYING_CUES, 5);
  const objections = findEvidence(sentences, OBJECTION_CUES, 5);

  const topics = detectTopics(clean);
  const coverage = COVERAGE_CHECKLIST.map((c) => {
    const t = topics.find((x) => x.key === c.key);
    return {
      key: c.key,
      label: c.label,
      covered: !!t,
      mentions: t?.mentions ?? 0,
    };
  });

  // Score — a simple, transparent formula.
  const wpmScore =
    wordsPerMinute === 0
      ? 0
      : wordsPerMinute >= 100 && wordsPerMinute <= 170
        ? 25
        : wordsPerMinute >= 80 && wordsPerMinute <= 190
          ? 18
          : 10;
  const coverageScore = Math.min(
    35,
    Math.round((coverage.filter((c) => c.covered).length / coverage.length) * 35)
  );
  const questionScore = Math.min(
    15,
    questionCount * 3
  );
  const fillerPenalty = Math.min(15, Math.round(fillerRate * 1.5));
  const sentimentBonus =
    sentiment === "positive" ? 10 : sentiment === "concerned" ? -5 : 4;
  const buyingBonus = Math.min(10, buyingSignals.length * 3);

  let score =
    wpmScore + coverageScore + questionScore - fillerPenalty + sentimentBonus + buyingBonus;
  score = Math.max(0, Math.min(100, score));
  const scoreBand: PresentationAnalysis["scoreBand"] =
    score >= 80 ? "Excellent" : score >= 60 ? "Strong" : score >= 40 ? "Fair" : "Needs work";

  const strengths: string[] = [];
  const improvements: string[] = [];
  if (coverageScore >= 25) strengths.push("Broad topic coverage");
  if (sentiment === "positive")
    strengths.push("Confident, positive framing");
  if (buyingSignals.length > 0)
    strengths.push(`Elicited ${buyingSignals.length} buying signal(s)`);
  if (questionCount >= 3) strengths.push("Good back-and-forth engagement");
  if (quotations.length > 0)
    strengths.push(`Named concrete numbers (${quotations.length})`);

  if (wordsPerMinute > 190) improvements.push("Slow down — over 190 wpm reads as rushed");
  if (wordsPerMinute > 0 && wordsPerMinute < 90)
    improvements.push("Pick up the pace — under 90 wpm can feel flat");
  if (fillerRate > 3)
    improvements.push(`Reduce filler words (${fillerRate}/100 words)`);
  if (coverage.filter((c) => !c.covered).length > 0) {
    const missing = coverage.filter((c) => !c.covered).map((c) => c.label);
    improvements.push(`Cover the missing topics next time: ${missing.join(", ")}`);
  }
  if (objections.length > 0)
    improvements.push(`${objections.length} objection cue(s) detected — prep responses`);
  if (questionCount === 0)
    improvements.push("Ask the buyer questions — none were detected");

  return {
    wordCount,
    wordsPerMinute,
    fillerCount,
    fillerRate,
    longestMonologueSec,
    questionCount,
    positiveHits,
    negativeHits,
    sentiment,
    quotations,
    buyingSignals,
    objections,
    topics,
    coverage,
    score,
    scoreBand,
    strengths,
    improvements,
  };
}

function countAny(text: string, terms: string[]): number {
  let n = 0;
  for (const t of terms) {
    const m = text.match(new RegExp(`\\b${escapeRe(t)}\\b`, "g"));
    if (m) n += m.length;
  }
  return n;
}

function findEvidence(
  sentences: string[],
  cues: string[],
  max: number
): string[] {
  const out: string[] = [];
  for (const s of sentences) {
    const low = s.toLowerCase();
    if (cues.some((c) => low.includes(c))) {
      out.push(s.length > 200 ? s.slice(0, 197) + "…" : s);
      if (out.length >= max) break;
    }
  }
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
