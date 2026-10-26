/**
 * Gemini-backed sales coaching report.
 *
 * Mirrors the shape produced by the heuristic report so the caller
 * can treat them interchangeably — if Gemini fails or is missing a
 * key, we fall back to the rule-based report without changing the UI.
 */

import { MAX_TRANSCRIPT_CHARS, geminiJson } from "@/lib/ai/gemini";
import type { AnalysisContext } from "@/lib/ai/claude";
import {
  RUBRIC,
  type DialogueTurn,
  type SpeakerMap,
} from "@/lib/ai/presentationAiTypes";

export type ModelReport = {
  speaker_roles: { salesperson: string; customers: string[] };
  summary: string;
  criteria: { key: string; score: number; comment: string }[];
  deal_temperature: "hot" | "warm" | "cold";
  deal_reason: string;
  customer_wants: string[];
  customer_interests: { interest: string; evidence: string; strength: "high" | "medium" | "low" }[];
  customer_issues: { issue: string; evidence: string; severity: "high" | "medium" | "low"; how_to_address: string }[];
  went_well: { point: string; evidence: string }[];
  went_wrong: { point: string; evidence: string }[];
  missed_points: { topic: string; why_it_matters: string; suggested_line: string }[];
  next_actions: { action: string; owner: "salesperson" | "manager" }[];
  coaching_tips: string[];
};

const str = { type: "string" };
const level = { type: "string", enum: ["high", "medium", "low"] };

const SCHEMA = {
  type: "object",
  required: [
    "speaker_roles", "summary", "criteria", "deal_temperature", "deal_reason",
    "customer_wants", "customer_interests", "customer_issues", "went_well",
    "went_wrong", "missed_points", "next_actions", "coaching_tips",
  ],
  properties: {
    speaker_roles: {
      type: "object",
      required: ["salesperson", "customers"],
      properties: {
        salesperson: { type: "string" },
        customers: { type: "array", items: str },
      },
    },
    summary: { type: "string" },
    criteria: {
      type: "array",
      items: {
        type: "object",
        required: ["key", "score", "comment"],
        properties: {
          key: { type: "string", enum: RUBRIC.map((r) => r.key) as string[] },
          score: { type: "integer", minimum: 0, maximum: 10 },
          comment: { type: "string" },
        },
      },
    },
    deal_temperature: { type: "string", enum: ["hot", "warm", "cold"] },
    deal_reason: { type: "string" },
    customer_wants: { type: "array", items: str },
    customer_interests: {
      type: "array",
      items: { type: "object", required: ["interest", "evidence", "strength"],
        properties: { interest: str, evidence: str, strength: level } },
    },
    customer_issues: {
      type: "array",
      items: { type: "object", required: ["issue", "evidence", "severity", "how_to_address"],
        properties: { issue: str, evidence: str, severity: level, how_to_address: str } },
    },
    went_well: {
      type: "array",
      items: { type: "object", required: ["point", "evidence"], properties: { point: str, evidence: str } },
    },
    went_wrong: {
      type: "array",
      items: { type: "object", required: ["point", "evidence"], properties: { point: str, evidence: str } },
    },
    missed_points: {
      type: "array",
      items: { type: "object", required: ["topic", "why_it_matters", "suggested_line"],
        properties: { topic: str, why_it_matters: str, suggested_line: str } },
    },
    next_actions: {
      type: "array",
      items: { type: "object", required: ["action", "owner"],
        properties: { action: str, owner: { type: "string", enum: ["salesperson", "manager"] } } },
    },
    coaching_tips: { type: "array", items: str },
  },
};

function fmtTs(ms: number): string {
  if (!ms) return "";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function renderDialogue(turns: DialogueTurn[]): string {
  let text = turns
    .map((t) => `${fmtTs(t.start_ms)} Speaker ${t.speaker}: ${t.text}`.trim())
    .join("\n");
  if (text.length > MAX_TRANSCRIPT_CHARS) {
    const half = Math.floor(MAX_TRANSCRIPT_CHARS / 2);
    text = `${text.slice(0, half)}\n\n[… middle of meeting omitted for length …]\n\n${text.slice(-half)}`;
  }
  return text;
}

export async function geminiAnalyze(
  turns: DialogueTurn[],
  guessedMap: SpeakerMap,
  ctx: AnalysisContext
): Promise<ModelReport> {
  const rubric = RUBRIC.map(
    (r) => `- ${r.key} (${r.name}, weight ${r.weight}): ${r.hint}`
  ).join("\n");
  const guessedSales = Object.entries(guessedMap).find(([, v]) => v === "salesperson")?.[0];

  const system = [
    "You are a senior B2B sales coach for Indian manufacturing companies.",
    "A salesperson used VPV (a 360° virtual plant tour) to present their factory to a prospective buyer.",
    "You receive the recorded conversation (speaker-separated) and what was shown in the tour.",
    "Your job: tell the sales manager, specifically and honestly, what happened, what the customer wants,",
    "what went well, what went wrong, what was missed, and how the salesperson should improve.",
    "",
    "Rules:",
    "- Base every point on the transcript. Evidence must quote or closely paraphrase what was actually said.",
    "- The meeting may be in Hindi, English or Hinglish. Always answer in clear English; translate quotes.",
    "- Be concrete and practical. No generic advice like 'build rapport' without saying how, in this meeting.",
    "- If the recording is short or one-sided, say so in the summary and score conservatively.",
    "- Scores are 0-10 per criterion: 0-3 poor, 4-6 average, 7-8 good, 9-10 exceptional.",
    "- Output EXACTLY one entry per rubric key in the same order as the rubric.",
    "- First decide which speaker label is the salesperson (they present the factory, answer product questions).",
  ].join("\n");

  const scenes = ctx.scenesShown.length
    ? ctx.scenesShown.map((s) => `- ${s.name}: ${s.seconds}s`).join("\n")
    : "(no scene data)";
  const hotspots = ctx.hotspotsOpened.length ? ctx.hotspotsOpened.join(", ") : "(none)";

  const user = [
    "MEETING CONTEXT",
    `Company presenting: ${ctx.orgName ?? "unknown"}`,
    `Tour: ${ctx.tourTitle ?? "unknown"}`,
    `Salesperson: ${ctx.presenterName ?? "unknown"}`,
    `Customer (from CRM, may be blank): ${ctx.clientLabel ?? "not linked"}`,
    `When: ${ctx.startedAt ?? "unknown"} · Duration: ${ctx.durationSec ? Math.round(ctx.durationSec / 60) + " min" : "unknown"}`,
    `Where: ${ctx.place ?? "unknown"}`,
    "",
    "PLANT AREAS SHOWN IN THE TOUR (in order, with time spent):",
    scenes,
    `Info points opened: ${hotspots}`,
    "",
    "SCORING RUBRIC:",
    rubric,
    "",
    guessedSales ? `Hint: speaker ${guessedSales} talked the most and is probably the salesperson — verify.` : "",
    "",
    "CONVERSATION:",
    renderDialogue(turns),
  ].join("\n");

  return geminiJson<ModelReport>({
    system,
    user,
    schema: SCHEMA,
    maxOutputTokens: 6000,
    temperature: 0.3,
  });
}
