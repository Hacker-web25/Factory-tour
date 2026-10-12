/**
 * Claude (Anthropic Messages API) helpers for presentation analysis.
 *
 * Two jobs:
 *   1. analyzePresentation()  — the sales-coaching report.
 *   2. segmentPlainTranscript() — fallback that splits an old, plain-text
 *      (single-mic, no speaker labels) transcript into a dialogue.
 *
 * Both force a tool call so the output is always valid, schema-shaped
 * JSON — no regex-parsing of prose.
 *
 * SERVER ONLY. Env: ANTHROPIC_API_KEY, optional ANTHROPIC_MODEL.
 */

import {
  RUBRIC,
  type DialogueTurn,
  type SpeakerMap,
} from "@/lib/ai/presentationAiTypes";

const API = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-5-5";

/** Rough cap so a 3-hour recording can't blow the context or the bill. */
const MAX_TRANSCRIPT_CHARS = 120_000;

export function claudeConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export function claudeModel(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

async function callTool<T>(args: {
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  schema: Record<string, unknown>;
  maxTokens: number;
}): Promise<T> {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY as string,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: claudeModel(),
      max_tokens: args.maxTokens,
      system: args.system,
      tools: [
        {
          name: args.toolName,
          description: args.toolDescription,
          input_schema: args.schema,
        },
      ],
      tool_choice: { type: "tool", name: args.toolName },
      messages: [{ role: "user", content: args.user }],
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    content?: { type: string; name?: string; input?: unknown }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(body.error?.message || `AI service returned ${res.status}`);
  }
  const block = body.content?.find((c) => c.type === "tool_use" && c.name === args.toolName);
  if (!block?.input) throw new Error("AI returned no structured result");
  return block.input as T;
}

/* ---------- 1. Coaching report ---------------------------------------- */

export type AnalysisContext = {
  orgName: string | null;
  tourTitle: string | null;
  presenterName: string | null;
  clientLabel: string | null;
  startedAt: string | null;
  durationSec: number | null;
  place: string | null;
  scenesShown: { name: string; seconds: number }[];
  hotspotsOpened: string[];
};

/** Raw model output — overall score + metrics are added by the route. */
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

const REPORT_SCHEMA = {
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
        salesperson: { type: "string", description: "Speaker label of the salesperson, e.g. \"A\"" },
        customers: { type: "array", items: str, description: "Speaker labels of the customer side" },
      },
    },
    summary: { type: "string", description: "3-5 sentence plain-English summary of the meeting for a sales manager." },
    criteria: {
      type: "array",
      minItems: RUBRIC.length,
      maxItems: RUBRIC.length,
      items: {
        type: "object",
        required: ["key", "score", "comment"],
        properties: {
          key: { type: "string", enum: RUBRIC.map((r) => r.key) },
          score: { type: "integer", minimum: 0, maximum: 10 },
          comment: { type: "string", description: "One or two sentences justifying the score, citing the meeting." },
        },
      },
    },
    deal_temperature: { type: "string", enum: ["hot", "warm", "cold"] },
    deal_reason: { type: "string" },
    customer_wants: { type: "array", maxItems: 8, items: str, description: "Concrete requirements the customer stated or implied (specs, volumes, price range, timelines, certifications)." },
    customer_interests: {
      type: "array", maxItems: 8,
      items: { type: "object", required: ["interest", "evidence", "strength"],
        properties: { interest: str, evidence: str, strength: level } },
    },
    customer_issues: {
      type: "array", maxItems: 8,
      items: { type: "object", required: ["issue", "evidence", "severity", "how_to_address"],
        properties: { issue: str, evidence: str, severity: level, how_to_address: str } },
    },
    went_well: {
      type: "array", maxItems: 6,
      items: { type: "object", required: ["point", "evidence"], properties: { point: str, evidence: str } },
    },
    went_wrong: {
      type: "array", maxItems: 6,
      items: { type: "object", required: ["point", "evidence"], properties: { point: str, evidence: str } },
    },
    missed_points: {
      type: "array", maxItems: 6,
      items: { type: "object", required: ["topic", "why_it_matters", "suggested_line"],
        properties: { topic: str, why_it_matters: str,
          suggested_line: { type: "string", description: "What the salesperson could have said, in first person." } } },
    },
    next_actions: {
      type: "array", maxItems: 6,
      items: { type: "object", required: ["action", "owner"],
        properties: { action: str, owner: { type: "string", enum: ["salesperson", "manager"] } } },
    },
    coaching_tips: { type: "array", maxItems: 5, items: str },
  },
};

function fmtTs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function renderDialogue(turns: DialogueTurn[]): string {
  let text = turns
    .map((t) => `[${fmtTs(t.start_ms)}] Speaker ${t.speaker}: ${t.text}`)
    .join("\n");
  if (text.length > MAX_TRANSCRIPT_CHARS) {
    const half = Math.floor(MAX_TRANSCRIPT_CHARS / 2);
    text = `${text.slice(0, half)}\n\n[… middle of the meeting omitted for length …]\n\n${text.slice(-half)}`;
  }
  return text;
}

export async function analyzePresentation(
  turns: DialogueTurn[],
  guessedMap: SpeakerMap,
  ctx: AnalysisContext
): Promise<ModelReport> {
  const rubric = RUBRIC.map((r) => `- ${r.key} (${r.name}, weight ${r.weight}): ${r.hint}`).join("\n");
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

  return callTool<ModelReport>({
    system,
    user,
    toolName: "submit_presentation_report",
    toolDescription: "Submit the structured coaching report for this sales presentation.",
    schema: REPORT_SCHEMA,
    maxTokens: 6000,
  });
}

/* ---------- 2. Plain transcript → dialogue (fallback) ----------------- */

export async function segmentPlainTranscript(transcript: string): Promise<DialogueTurn[]> {
  const clipped = transcript.slice(0, MAX_TRANSCRIPT_CHARS);
  const out = await callTool<{ turns: { role: "salesperson" | "customer"; text: string }[] }>({
    system:
      "You split a raw, unpunctuated speech-to-text transcript of a sales meeting into speaker turns. " +
      "The transcript has no speaker labels. Infer who is speaking from content: the salesperson presents " +
      "the factory and answers; the customer asks about price, capacity, quality, delivery. Keep the original " +
      "words (light punctuation is fine). Do not summarise or drop content.",
    user: clipped,
    toolName: "submit_dialogue",
    toolDescription: "Submit the transcript split into ordered speaker turns.",
    schema: {
      type: "object",
      required: ["turns"],
      properties: {
        turns: {
          type: "array",
          items: {
            type: "object",
            required: ["role", "text"],
            properties: {
              role: { type: "string", enum: ["salesperson", "customer"] },
              text: { type: "string" },
            },
          },
        },
      },
    },
    maxTokens: 8000,
  });
  return (out.turns ?? [])
    .filter((t) => t.text?.trim())
    .map((t) => ({
      speaker: t.role === "salesperson" ? "S" : "C",
      start_ms: 0,
      end_ms: 0,
      text: t.text.trim(),
    }));
}
