/**
 * POST /api/ai/analyze   { sessionId, force? }
 *
 * Produces the sales-coaching report over a presentation's dialogue.
 * Requires /api/ai/transcribe to have completed.
 *
 * Three-layer pipeline (same as transcribe), none of which costs
 * money by default:
 *   1. Return the cached report, if one is saved.
 *   2. Call Google Gemini (free tier) with a strict JSON schema.
 *   3. Fall back to the rule-based `heuristicReport` so the admin
 *      ALWAYS gets a usable report, even with no AI key / no network.
 *
 * The overall score is a weighted average of the 8 rubric criteria,
 * so it's explainable whichever provider produced the per-criterion
 * scores.
 */

import { NextResponse } from "next/server";
import { guardPresentationRequest, jsonError } from "@/lib/server/presentationAccess";
import { enforceRateLimit } from "@/lib/rateLimit";
import { nvidiaConfigured, nvidiaModel } from "@/lib/ai/nvidia";
import { nvidiaAnalyze } from "@/lib/ai/nvidiaReport";
import { geminiConfigured, geminiModel } from "@/lib/ai/gemini";
import { geminiAnalyze, type ModelReport } from "@/lib/ai/geminiReport";
import { heuristicReport } from "@/lib/ai/heuristicReport";
import type { AnalysisContext } from "@/lib/ai/claude";
import {
  RUBRIC,
  computeMetrics,
  guessSpeakerMap,
  type Dialogue,
  type PresentationAiReport,
  type SpeakerMap,
} from "@/lib/ai/presentationAiTypes";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Analysis providers tried in order. First configured one that
 *  doesn't error wins; `heuristicReport` is the never-fails floor. */
type Provider = {
  name: string;
  tag: () => string;
  isConfigured: () => boolean;
  analyze: (turns: Dialogue["turns"], map: SpeakerMap, ctx: AnalysisContext) => Promise<ModelReport>;
};
const PROVIDERS: Provider[] = [
  { name: "nvidia", tag: () => `nvidia:${nvidiaModel()}`, isConfigured: nvidiaConfigured, analyze: nvidiaAnalyze },
  { name: "gemini", tag: () => `gemini:${geminiModel()}`, isConfigured: geminiConfigured, analyze: geminiAnalyze },
];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const g = await guardPresentationRequest(req);
  if (!g.ok) return g.res;
  const { auth, row, force, orgName } = g;
  const sb = auth.sb;

  if (row.ai_analysis && !force) {
    return NextResponse.json(
      { ok: true, report: row.ai_analysis, speakerMap: row.ai_speaker_map },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const dialogue = row.ai_dialogue as Dialogue | null;
  if (!dialogue?.turns?.length) {
    return jsonError(409, "needs_transcript", "Transcribe the conversation first.");
  }

  const rl = await enforceRateLimit(`ai-analyze:org:${row.org_id}`, 200, 86400);
  if (!rl.allowed) {
    return jsonError(429, "rate_limited", "Daily analysis quota reached for your organisation.", {
      retryAfter: rl.retryAfter,
    });
  }

  const ctx = await buildContext(sb, row, orgName);
  const guessed = (row.ai_speaker_map as SpeakerMap) ?? guessSpeakerMap(dialogue.turns);

  let report: PresentationAiReport | null = null;
  let modelUsed = "";
  let notice: string | undefined;
  let speakerMap: SpeakerMap = guessed;

  const available = PROVIDERS.filter((p) => p.isConfigured());
  if (available.length === 0) {
    notice = "AI analysis is not enabled yet — showing a free rule-based review. Add an NVIDIA or Gemini API key for a deeper AI-generated report.";
  }

  for (const p of available) {
    try {
      const model: ModelReport = await p.analyze(dialogue.turns, guessed, ctx);
      report = normaliseReport(model, dialogue, guessed);
      modelUsed = p.tag();
      // If the model identified a specific speaker label as the sales
      // person, trust it over the "whoever talked most" guess — but
      // only when we had true voice-based speaker separation.
      const labels = new Set(dialogue.turns.map((t) => t.speaker));
      if (dialogue.source === "assemblyai" && labels.has(model.speaker_roles?.salesperson)) {
        speakerMap = {};
        for (const l of labels)
          speakerMap[l] = l === model.speaker_roles.salesperson ? "salesperson" : "customer";
        report.metrics = computeMetrics(dialogue.turns, speakerMap);
      }
      break;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[ai/analyze] ${p.name} failed:`, (e as Error).message);
      notice = "The AI service is temporarily unavailable — showing a rule-based review instead. Try again in a few minutes for the AI version.";
    }
  }

  if (!report) {
    report = heuristicReport(dialogue.turns, speakerMap, ctx);
    modelUsed = "heuristic:v1";
  }

  try {
    await sb.rpc("save_presentation_ai", {
      p_session_id: row.session_id,
      p_patch: {
        ai_analysis: report,
        ai_score: report.overall_score,
        ai_speaker_map: speakerMap,
        ai_model: modelUsed,
        ai_analyzed_at: new Date().toISOString(),
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[ai/analyze] save failed:", (e as Error).message);
    notice = (notice ? notice + " " : "") + "We couldn't save this report — the results are shown but won't persist.";
  }

  return NextResponse.json(
    { ok: true, report, speakerMap, notice },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** Turn the model's raw criteria list into the normalised rubric
 *  ordering, clamp scores, and compute the weighted overall. */
function normaliseReport(
  model: ModelReport,
  dialogue: Dialogue,
  speakerMap: SpeakerMap
): PresentationAiReport {
  const byKey = new Map(model.criteria.map((c) => [c.key, c]));
  const criteria = RUBRIC.map((r) => {
    const c = byKey.get(r.key);
    const score = Math.max(0, Math.min(10, Math.round(Number(c?.score ?? 0))));
    return { key: r.key, name: r.name, score, comment: c?.comment ?? "" };
  });
  const overall = Math.round(
    RUBRIC.reduce((sum, r, i) => sum + (criteria[i].score / 10) * r.weight, 0)
  );
  return {
    version: 1,
    summary: model.summary,
    overall_score: overall,
    criteria,
    deal_temperature: model.deal_temperature,
    deal_reason: model.deal_reason,
    customer_wants: model.customer_wants ?? [],
    customer_interests: model.customer_interests ?? [],
    customer_issues: model.customer_issues ?? [],
    went_well: model.went_well ?? [],
    went_wrong: model.went_wrong ?? [],
    missed_points: model.missed_points ?? [],
    next_actions: model.next_actions ?? [],
    coaching_tips: model.coaching_tips ?? [],
    metrics: computeMetrics(dialogue.turns, speakerMap),
  };
}

/** The plant-tour context passed to the analyser: scenes shown, info
 *  points opened, who was speaking to whom. */
async function buildContext(
  sb: SupabaseClient,
  row: {
    session_id: string;
    tour_id: string | null;
    presenter_user_id: string | null;
    client_id: string | null;
    started_at: string | null;
    duration_sec: number | null;
    place: string | null;
  },
  orgName: string | null
): Promise<AnalysisContext> {
  const [tourRes, presenterRes, clientRes, eventsRes] = await Promise.all([
    row.tour_id ? sb.from("tours").select("title").eq("id", row.tour_id).maybeSingle() : Promise.resolve({ data: null }),
    row.presenter_user_id ? sb.from("profiles").select("full_name, email").eq("id", row.presenter_user_id).maybeSingle() : Promise.resolve({ data: null }),
    row.client_id ? sb.from("clients").select("name, company").eq("id", row.client_id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("tour_events")
      .select("event_type, scene_id, hotspot_id, created_at")
      .eq("session_id", row.session_id)
      .order("created_at", { ascending: true })
      .limit(2000),
  ]);

  const events = (eventsRes.data ?? []) as {
    event_type: string;
    scene_id: string | null;
    hotspot_id: string | null;
    created_at: string;
  }[];
  const sceneIds = Array.from(new Set(events.map((e) => e.scene_id).filter(Boolean) as string[]));
  const hotspotIds = Array.from(new Set(events.filter((e) => e.event_type === "hotspot_click").map((e) => e.hotspot_id).filter(Boolean) as string[]));

  const [scenesRes, hotspotsRes] = await Promise.all([
    sceneIds.length ? sb.from("scenes").select("id, name").in("id", sceneIds) : Promise.resolve({ data: [] }),
    hotspotIds.length ? sb.from("hotspots").select("id, label, info_title").in("id", hotspotIds) : Promise.resolve({ data: [] }),
  ]);
  const sceneName = new Map(((scenesRes.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));

  const scenesShown: { name: string; seconds: number }[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.event_type !== "scene_view" || !e.scene_id) continue;
    const next = events[i + 1];
    const secs = next
      ? Math.max(0, Math.round((+new Date(next.created_at) - +new Date(e.created_at)) / 1000))
      : 0;
    const name = sceneName.get(e.scene_id) || "Untitled area";
    const last = scenesShown[scenesShown.length - 1];
    if (last && last.name === name) last.seconds += secs;
    else scenesShown.push({ name, seconds: secs });
  }

  const hotspotsOpened = ((hotspotsRes.data ?? []) as { label: string | null; info_title: string | null }[])
    .map((h) => h.label?.trim() || h.info_title?.trim() || "")
    .filter(Boolean)
    .slice(0, 30);

  const presenter = presenterRes.data as { full_name?: string | null; email?: string } | null;
  const client = clientRes.data as { name?: string; company?: string | null } | null;

  return {
    orgName,
    tourTitle: (tourRes.data as { title?: string } | null)?.title ?? null,
    presenterName: presenter?.full_name || presenter?.email?.split("@")[0] || null,
    clientLabel: client ? [client.name, client.company].filter(Boolean).join(", ") : null,
    startedAt: row.started_at,
    durationSec: row.duration_sec,
    place: row.place,
    scenesShown: scenesShown.slice(0, 60),
    hotspotsOpened,
  };
}
