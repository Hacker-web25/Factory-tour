/**
 * NVIDIA NIM sales-coaching report.
 *
 * Same output shape as `geminiReport` so the route treats them
 * interchangeably. The system prompt describes the required JSON
 * because NIM's `response_format: json_object` only guarantees
 * well-formed JSON, not any particular schema.
 */

import { MAX_TRANSCRIPT_CHARS, nvidiaJson } from "@/lib/ai/nvidia";
import type { AnalysisContext } from "@/lib/ai/claude";
import {
  RUBRIC,
  type DialogueTurn,
  type SpeakerMap,
} from "@/lib/ai/presentationAiTypes";
import type { ModelReport } from "@/lib/ai/geminiReport";

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

/** The exact schema the system prompt tells the model to produce. We
 *  render it as a code block in the prompt so the model has no doubt
 *  about key names and types. */
const SCHEMA_HINT = `{
  "speaker_roles": { "salesperson": "A|B|S|C", "customers": ["..."] },
  "summary": "3-5 sentence plain-English summary",
  "criteria": [
    { "key": "${RUBRIC.map((r) => r.key).join('|')}", "score": 0-10, "comment": "one-sentence reason" }
  ],
  "deal_temperature": "hot|warm|cold",
  "deal_reason": "one sentence",
  "customer_wants": ["..."],
  "customer_interests": [{ "interest": "...", "evidence": "quote", "strength": "high|medium|low" }],
  "customer_issues": [{ "issue": "...", "evidence": "quote", "severity": "high|medium|low", "how_to_address": "..." }],
  "went_well": [{ "point": "...", "evidence": "quote" }],
  "went_wrong": [{ "point": "...", "evidence": "quote" }],
  "missed_points": [{ "topic": "...", "why_it_matters": "...", "suggested_line": "first-person line the salesperson could have said" }],
  "next_actions": [{ "action": "...", "owner": "salesperson|manager" }],
  "coaching_tips": ["..."]
}`;

export async function nvidiaAnalyze(
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
    "- Output EXACTLY one entry per rubric key, in the rubric's order.",
    "- First decide which speaker label is the salesperson (they present the factory, answer product questions).",
    "",
    "Reply with STRICT JSON ONLY, no markdown fences, no commentary. The JSON MUST match this shape:",
    SCHEMA_HINT,
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

  const raw = await nvidiaJson<ModelReport & Record<string, unknown>>({
    system,
    user,
    maxOutputTokens: 6000,
    temperature: 0.3,
  });

  // Defensive — the model may omit optional arrays. Fill them in so
  // normaliseReport() in the route handler never sees `undefined`.
  return {
    speaker_roles: raw.speaker_roles ?? { salesperson: guessedSales ?? "S", customers: [] },
    summary: typeof raw.summary === "string" ? raw.summary : "",
    criteria: Array.isArray(raw.criteria) ? raw.criteria : [],
    deal_temperature:
      raw.deal_temperature === "hot" || raw.deal_temperature === "warm"
        ? raw.deal_temperature
        : "cold",
    deal_reason: typeof raw.deal_reason === "string" ? raw.deal_reason : "",
    customer_wants: Array.isArray(raw.customer_wants) ? raw.customer_wants : [],
    customer_interests: Array.isArray(raw.customer_interests) ? raw.customer_interests : [],
    customer_issues: Array.isArray(raw.customer_issues) ? raw.customer_issues : [],
    went_well: Array.isArray(raw.went_well) ? raw.went_well : [],
    went_wrong: Array.isArray(raw.went_wrong) ? raw.went_wrong : [],
    missed_points: Array.isArray(raw.missed_points) ? raw.missed_points : [],
    next_actions: Array.isArray(raw.next_actions) ? raw.next_actions : [],
    coaching_tips: Array.isArray(raw.coaching_tips) ? raw.coaching_tips : [],
  };
}
