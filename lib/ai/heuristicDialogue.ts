/**
 * Rule-based transcript → dialogue splitter.
 *
 * The ZERO-cost fallback for when Gemini isn't configured, isn't
 * reachable or has fallen over. Dumb but useful: splits a plain
 * single-mic transcript into Customer / Sales Person turns using
 * sentence-level cues that work surprisingly well on Indian B2B
 * manufacturing meetings.
 *
 * Confidence is reported on the result so the UI can label the output
 * as approximate.
 */

import type { DialogueTurn } from "@/lib/ai/presentationAiTypes";

/** Phrases a BUYER tends to use (asking about commercial terms, specs,
 *  timelines, logistics). */
const BUYER_HINTS = [
  "price", "cost", "quote", "quotation", "discount", "cheaper",
  "budget", "payment", "credit", "advance",
  "delivery", "lead time", "when can", "how soon", "how fast",
  "sample", "trial", "pilot", "warranty", "guarantee",
  "minimum order", "moq", "per unit", "per kg", "per ton",
  "our requirement", "we need", "we want", "we are looking",
  "can you", "do you", "will you", "are you able",
  "what is your", "what's your", "how much", "how many", "how long",
  "competitor", "ahmedabad", "cheaper than", "alternate", "other supplier",
  "term", "contract", "not sure", "let me think", "will discuss",
];

/** Phrases a SELLER tends to use (presenting, demonstrating, offering). */
const SELLER_HINTS = [
  "let me show", "let me take", "as you can see", "here you can see",
  "this is our", "this is the", "we have", "we offer", "we do",
  "we produce", "we manufacture", "we are capable", "our capacity",
  "our plant", "our factory", "our team", "our product",
  "iso", "certified", "quality", "standard", "guarantee",
  "i will send", "i'll send", "i will share", "i'll share",
  "we can deliver", "we can supply", "we can arrange",
  "welcome to", "thank you for", "good morning sir",
  "sir,", "madam,",
];

type Score = { seller: number; buyer: number };

function score(sentence: string): Score {
  const s = sentence.toLowerCase();
  let seller = 0;
  let buyer = 0;
  for (const h of SELLER_HINTS) if (s.includes(h)) seller += 1;
  for (const h of BUYER_HINTS) if (s.includes(h)) buyer += 1;
  // Question marks lean buyer — they're asking.
  const qs = (s.match(/\?/g) ?? []).length;
  buyer += qs;
  // First-person-plural declaratives lean seller.
  if (/\b(we|our)\b/.test(s) && qs === 0) seller += 1;
  return { seller, buyer };
}

/** Split a monolithic transcript into speaker turns. The first-pass
 *  classifier is per-sentence; a second pass smooths runs so a lone
 *  neutral sentence inherits its neighbours' label (people rarely
 *  interrupt mid-paragraph). */
export function heuristicSplit(transcript: string): { turns: DialogueTurn[]; confidence: "low" | "medium" } {
  const clean = (transcript || "").trim();
  if (!clean) return { turns: [], confidence: "low" };

  const sentences = clean
    .split(/(?<=[.!?।])\s+|\n+/u)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length === 0) return { turns: [], confidence: "low" };

  type Classified = { text: string; role: "seller" | "buyer" | "unknown" };
  const first: Classified[] = sentences.map((text) => {
    const { seller, buyer } = score(text);
    if (seller === 0 && buyer === 0) return { text, role: "unknown" };
    if (seller > buyer) return { text, role: "seller" };
    if (buyer > seller) return { text, role: "buyer" };
    return { text, role: "unknown" };
  });

  // Smooth: an "unknown" takes its last known neighbour's role.
  let last: "seller" | "buyer" = "seller";
  for (const c of first) {
    if (c.role === "unknown") c.role = last;
    else last = c.role;
  }

  // Merge adjacent same-role sentences into one turn.
  const turns: DialogueTurn[] = [];
  for (const c of first) {
    const label = c.role === "seller" ? "S" : "C";
    const prev = turns[turns.length - 1];
    if (prev && prev.speaker === label) prev.text = `${prev.text} ${c.text}`;
    else turns.push({ speaker: label, start_ms: 0, end_ms: 0, text: c.text });
  }

  // Confidence — if the whole thing collapsed to one speaker, it's low.
  const hasBoth = turns.some((t) => t.speaker === "S") && turns.some((t) => t.speaker === "C");
  const strongHits = first.filter((c) => c.role === "seller" || c.role === "buyer").length;
  const confidence: "low" | "medium" =
    hasBoth && strongHits > sentences.length / 3 ? "medium" : "low";

  return { turns, confidence };
}
