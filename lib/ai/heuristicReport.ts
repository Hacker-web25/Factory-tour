/**
 * Fallback coaching report — rule-based, no AI service.
 *
 * Builds a PresentationAiReport from the dialogue and the plant-tour
 * context, using the existing `analyzeTranscript` keyword scanner for
 * fillers, pace, topics, buying signals and objections.
 *
 * The report is marked `is_fallback` so the UI can tell the admin
 * these are approximate — the paid model gives much deeper insight,
 * but the free version is good enough to be useful.
 */

import { analyzeTranscript } from "@/lib/presentationInsights";
import type { AnalysisContext } from "@/lib/ai/claude";
import {
  RUBRIC,
  computeMetrics,
  type DialogueTurn,
  type PresentationAiReport,
  type SpeakerMap,
} from "@/lib/ai/presentationAiTypes";

export function heuristicReport(
  turns: DialogueTurn[],
  speakerMap: SpeakerMap,
  ctx: AnalysisContext
): PresentationAiReport {
  const salesText = turns
    .filter((t) => speakerMap[t.speaker] === "salesperson")
    .map((t) => t.text)
    .join(" ");
  const customerText = turns
    .filter((t) => speakerMap[t.speaker] !== "salesperson")
    .map((t) => t.text)
    .join(" ");
  const allText = turns.map((t) => t.text).join(" ");

  const insights = analyzeTranscript(allText, ctx.durationSec ?? 60);
  const salesInsights = salesText
    ? analyzeTranscript(salesText, Math.max(10, Math.floor((ctx.durationSec ?? 60) * 0.6)))
    : null;
  const metrics = computeMetrics(turns, speakerMap);

  /* ---------- Score each rubric criterion -------------------------- */

  const customerQs = metrics.customer_questions;
  const salesQs = metrics.sales_questions;

  const scoreMap: Record<string, { score: number; comment: string }> = {
    discovery: band(
      salesQs,
      [0, 2, 5, 8],
      {
        high: `Asked ${salesQs} questions — strong discovery.`,
        mid: `Asked ${salesQs} question(s) — probe deeper into volumes, timelines and decision makers.`,
        low: `Hardly any discovery questions — the salesperson talked, didn't ask.`,
      }
    ),
    product: band(
      insights.topics.filter((t) => ["product", "capacity", "compliance"].includes(t.key)).length,
      [0, 1, 2, 3],
      {
        high: "Covered product, capacity and compliance clearly.",
        mid: "Some product detail — add missing specs or certifications next time.",
        low: "Little product or process detail was discussed.",
      }
    ),
    value: band(
      salesInsights?.positiveHits ?? 0,
      [0, 1, 3, 5],
      {
        high: "Strong, confident value framing (quality, trusted, premium).",
        mid: "Some value language — tie it harder to the customer's specific need.",
        low: "Value and differentiation were under-sold.",
      }
    ),
    objections: band(
      insights.objections.length === 0 ? 10 : insights.objections.length * 2 - (salesInsights?.positiveHits ?? 0),
      [10, 6, 3, 0],
      {
        high: "No objections raised, or they were handled with evidence.",
        mid: `${insights.objections.length} objection cue(s) raised — not all appear well addressed.`,
        low: `${insights.objections.length} objection(s) raised and largely left hanging.`,
      }
    ),
    listening: band(
      balance(metrics.sales_talk_pct),
      [0, 40, 60, 80],
      {
        high: "Balanced talk time — gave the customer room to lead.",
        mid: `Sales did ${metrics.sales_talk_pct}% of the talking — a bit heavy.`,
        low: `Sales did ${metrics.sales_talk_pct}% of the talking — monologue, not meeting.`,
      }
    ),
    structure: band(
      Math.max(0, 10 - Math.round(insights.fillerRate * 2)),
      [0, 3, 6, 8],
      {
        high: "Clean, structured delivery.",
        mid: `${insights.fillerCount} filler word(s) and some rambling.`,
        low: "Rambling delivery, lots of fillers.",
      }
    ),
    tour_use: band(
      ctx.scenesShown.length,
      [0, 1, 3, 5],
      {
        high: `Walked the customer through ${ctx.scenesShown.length} plant areas.`,
        mid: `Showed ${ctx.scenesShown.length} area(s) — the tour could carry more of the pitch.`,
        low: "Barely used the tour — not much to show for a plant visit.",
      }
    ),
    closing: band(
      insights.buyingSignals.length * 2 + (salesText.toLowerCase().includes("next ") ? 3 : 0),
      [0, 2, 5, 8],
      {
        high: "Explicit next steps and buying signals captured.",
        mid: "Some signals of progress — pin down a concrete next step.",
        low: "No clear next step was agreed.",
      }
    ),
  };

  const criteria = RUBRIC.map((r) => ({
    key: r.key,
    name: r.name,
    score: Math.max(0, Math.min(10, scoreMap[r.key]?.score ?? 5)),
    comment: scoreMap[r.key]?.comment ?? "",
  }));

  const overall = Math.round(
    RUBRIC.reduce((sum, r, i) => sum + (criteria[i].score / 10) * r.weight, 0)
  );
  const deal_temperature: "hot" | "warm" | "cold" =
    insights.buyingSignals.length >= 2
      ? "hot"
      : insights.buyingSignals.length === 1
        ? "warm"
        : "cold";

  /* ---------- Lists --------------------------------------------- */

  const customer_wants = pickCustomerWants(customerText, insights.quotations);

  const customer_interests = insights.topics.slice(0, 4).map((t) => ({
    interest: t.label,
    evidence: t.detail || "",
    strength: (t.mentions >= 4 ? "high" : t.mentions >= 2 ? "medium" : "low") as "high" | "medium" | "low",
  }));

  const customer_issues = insights.objections.slice(0, 5).map((o) => ({
    issue: shortLabel(o),
    evidence: o,
    severity: /price|cost|expensive|budget/i.test(o)
      ? ("high" as const)
      : ("medium" as const),
    how_to_address: suggestResolution(o),
  }));

  const went_well: { point: string; evidence: string }[] = [];
  if (salesQs >= 3) went_well.push({ point: `Asked ${salesQs} discovery questions`, evidence: "" });
  if (metrics.sales_talk_pct <= 60 && metrics.sales_talk_pct >= 35)
    went_well.push({ point: "Balanced talk time", evidence: `${metrics.sales_talk_pct}% sales / ${metrics.customer_talk_pct}% customer` });
  if (insights.quotations.length > 0)
    went_well.push({ point: `Named concrete numbers (${insights.quotations.length})`, evidence: insights.quotations.slice(0, 3).join(", ") });
  if (insights.topics.some((t) => t.key === "compliance"))
    went_well.push({ point: "Mentioned quality / certifications", evidence: insights.topics.find((t) => t.key === "compliance")?.detail || "" });
  if (ctx.scenesShown.length >= 4)
    went_well.push({ point: `Walked through ${ctx.scenesShown.length} plant areas`, evidence: ctx.scenesShown.slice(0, 3).map((s) => s.name).join(" → ") });
  if (went_well.length === 0 && overall >= 50)
    went_well.push({ point: "Meeting went through without major issues", evidence: "" });

  const went_wrong: { point: string; evidence: string }[] = [];
  if (salesQs === 0) went_wrong.push({ point: "No discovery questions asked", evidence: "" });
  if (metrics.sales_talk_pct > 70)
    went_wrong.push({ point: "Sales dominated the conversation", evidence: `${metrics.sales_talk_pct}% talk time` });
  if (insights.fillerRate > 3)
    went_wrong.push({ point: "High filler-word rate", evidence: `${insights.fillerRate}/100 words` });
  if (insights.objections.length > 0 && (salesInsights?.positiveHits ?? 0) < insights.objections.length)
    went_wrong.push({ point: "Objections not clearly addressed", evidence: insights.objections[0] });
  if (insights.buyingSignals.length === 0)
    went_wrong.push({ point: "No clear next-step commitment", evidence: "" });

  const missed_points = RUBRIC.map(() => null)
    .map(() => null)
    .filter(Boolean) as never[];
  const miss: { topic: string; why_it_matters: string; suggested_line: string }[] = [];
  for (const c of insights.coverage) {
    if (c.covered) continue;
    miss.push({
      topic: c.label,
      why_it_matters: whyMissMatters(c.key),
      suggested_line: suggestedLineFor(c.key, ctx),
    });
    if (miss.length >= 4) break;
  }

  const next_actions: { action: string; owner: "salesperson" | "manager" }[] = [];
  if (insights.quotations.length > 0 && !/quot|propos|offer/i.test(salesText))
    next_actions.push({ action: "Send a written quotation referencing the figures discussed", owner: "salesperson" });
  if (insights.buyingSignals.length > 0)
    next_actions.push({ action: "Book a follow-up call within 48 hours while interest is warm", owner: "salesperson" });
  if (insights.objections.some((o) => /price|cost|expensive/i.test(o)))
    next_actions.push({ action: "Approve a volume discount band or landed-cost comparison", owner: "manager" });
  if (next_actions.length === 0)
    next_actions.push({ action: "Share a short recap email with proposed next step and dates", owner: "salesperson" });

  const coaching_tips: string[] = [];
  if (salesQs < 3) coaching_tips.push("Open with 2–3 discovery questions before pitching anything.");
  if (metrics.sales_talk_pct > 65) coaching_tips.push("Aim for roughly 50/50 talk time — ask more, pitch less.");
  if (insights.objections.length > 0)
    coaching_tips.push("When price comes up, ask what the comparison includes before defending your number.");
  if (insights.fillerRate > 3) coaching_tips.push("Pause instead of using fillers — it reads as confidence.");
  if (coaching_tips.length === 0) coaching_tips.push("Keep notes on buying signals and reference them in the follow-up.");

  const summary = buildSummary({
    ctx,
    metrics,
    insights,
    overall,
    customerQs,
    salesQs,
    objectionCount: insights.objections.length,
    buyingCount: insights.buyingSignals.length,
  });

  const report: PresentationAiReport = {
    version: 1,
    summary,
    overall_score: overall,
    criteria,
    deal_temperature,
    deal_reason: dealReason(insights, metrics),
    customer_wants,
    customer_interests,
    customer_issues,
    went_well: went_well.slice(0, 5),
    went_wrong: went_wrong.slice(0, 5),
    missed_points: miss,
    next_actions: next_actions.slice(0, 4),
    coaching_tips: coaching_tips.slice(0, 4),
    metrics,
  };
  // Mark as fallback so the UI can show the "generated without AI" banner.
  (report as PresentationAiReport & { is_fallback?: boolean }).is_fallback = true;
  return report;
}

/* ---------- helpers ---------------------------------------------- */

type Bands = [low: number, lower: number, mid: number, high: number];
function band(
  value: number,
  bands: Bands,
  copy: { high: string; mid: string; low: string }
): { score: number; comment: string } {
  if (value >= bands[3]) return { score: 9, comment: copy.high };
  if (value >= bands[2]) return { score: 7, comment: copy.high };
  if (value >= bands[1]) return { score: 5, comment: copy.mid };
  return { score: 3, comment: copy.low };
}

function balance(salesPct: number): number {
  // 50 = perfect, 100 or 0 = terrible — convert to a 0–10-ish scale
  // reused by the band() helper above.
  const dev = Math.abs(50 - salesPct);
  return Math.max(0, 100 - dev * 2);
}

function pickCustomerWants(customerText: string, numbers: string[]): string[] {
  if (!customerText.trim()) return [];
  const out: string[] = [];
  const sentences = customerText
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const s of sentences) {
    const low = s.toLowerCase();
    if (/\b(we need|we want|we are looking|we require|our requirement|looking for)\b/.test(low)) {
      out.push(s.length > 160 ? s.slice(0, 157) + "…" : s);
    }
    if (out.length >= 6) break;
  }
  for (const n of numbers.slice(0, 2)) {
    if (!out.some((x) => x.includes(n))) out.push(`Volume / price point: ${n}`);
  }
  return out.slice(0, 6);
}

function shortLabel(sentence: string): string {
  const s = sentence.toLowerCase();
  if (/price|cost|expensive|cheaper/.test(s)) return "Price concern";
  if (/delay|delivery|lead time/.test(s)) return "Delivery / lead time";
  if (/budget/.test(s)) return "Budget constraint";
  if (/compare|competitor|alternate/.test(s)) return "Comparing competitors";
  if (/not sure|let me think|later/.test(s)) return "Hesitation / wants time";
  return "Customer concern";
}

function suggestResolution(sentence: string): string {
  const s = sentence.toLowerCase();
  if (/price|cost|expensive|cheaper/.test(s))
    return "Show landed cost including rejection rate and lead time, not just per-unit price.";
  if (/delay|delivery|lead time/.test(s))
    return "Share your typical lead time with a reference customer, and offer a staged delivery.";
  if (/budget/.test(s))
    return "Offer a smaller pilot batch to fit this quarter, then scale next quarter.";
  if (/compare|competitor/.test(s))
    return "Ask what the competitor's quote covers before matching — differences in finish, QC, warranty usually explain the gap.";
  if (/not sure|let me think|later/.test(s))
    return "Agree a specific date to speak again rather than leaving it open.";
  return "Acknowledge the concern explicitly and respond with specifics.";
}

function whyMissMatters(key: string): string {
  switch (key) {
    case "quotation": return "A buyer without a price picture can't move internally.";
    case "location": return "Logistics and distance affect landed cost and lead time.";
    case "product": return "Specifications and process steps build credibility.";
    case "capacity": return "Buyers need to know you can handle their volume reliably.";
    case "compliance": return "ISO / certifications settle quality worries early.";
    default: return "This typically comes up later — pre-empting it builds trust.";
  }
}

function suggestedLineFor(key: string, ctx: AnalysisContext): string {
  const plant = ctx.orgName || "our plant";
  switch (key) {
    case "quotation": return `For your 40 t/month volume, we work on roughly X per kg landed — I'll share a formal quote by tomorrow.`;
    case "location": return `${plant} is X km from the nearest port, so sea shipments typically take Y days door to door.`;
    case "product": return `Here's the exact grade, finish and tolerances we hold on this line.`;
    case "capacity": return `We run two shifts, so your 40 t/month sits inside roughly a third of our capacity — comfortable.`;
    case "compliance": return `We hold ISO 9001 and the client-specific audits we've cleared in the last year.`;
    case "sales": return `The reason customers like you choose us is X — happy to introduce you to one of them.`;
    default: return "";
  }
}

function dealReason(
  insights: ReturnType<typeof analyzeTranscript>,
  metrics: { customer_questions: number; sales_talk_pct: number }
): string {
  if (insights.buyingSignals.length >= 2)
    return `Strong buying signals (${insights.buyingSignals.length}) and clear next-step language.`;
  if (insights.buyingSignals.length === 1)
    return "A single buying signal — follow-up matters.";
  if (metrics.customer_questions >= 3)
    return "Customer engaged but no commitment yet.";
  if (insights.objections.length > 0)
    return "Objections raised and not clearly resolved — likely needs a second round.";
  return "Low engagement — may need a different approach to re-open the conversation.";
}

function buildSummary(args: {
  ctx: AnalysisContext;
  metrics: { sales_talk_pct: number; customer_talk_pct: number };
  insights: ReturnType<typeof analyzeTranscript>;
  overall: number;
  customerQs: number;
  salesQs: number;
  objectionCount: number;
  buyingCount: number;
}): string {
  const presenter = args.ctx.presenterName || "The salesperson";
  const tour = args.ctx.tourTitle ? ` on the ${args.ctx.tourTitle} tour` : "";
  const client = args.ctx.clientLabel ? ` with ${args.ctx.clientLabel}` : "";
  const bits = [
    `${presenter} led a presentation${tour}${client}.`,
    `Talk-time split ${args.metrics.sales_talk_pct}% sales / ${args.metrics.customer_talk_pct}% customer.`,
    `${args.salesQs} question(s) asked by sales, ${args.customerQs} by the customer.`,
    args.objectionCount > 0
      ? `${args.objectionCount} concern(s) raised${args.buyingCount > 0 ? `, alongside ${args.buyingCount} buying signal(s)` : ""}.`
      : args.buyingCount > 0
        ? `${args.buyingCount} buying signal(s) captured and no major objection.`
        : "No major objections or strong buying signals detected.",
    `This free rule-based review gives it ${args.overall}/100 — turn on the paid AI model for a deeper read.`,
  ];
  return bits.join(" ");
}
