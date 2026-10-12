/**
 * POST /api/ai/analyze   { sessionId, force? }
 *
 * Runs the sales-coaching analysis over a presentation's dialogue and
 * saves the report. Requires /api/ai/transcribe to have completed.
 *
 * The overall score is NOT taken from the model: it is the weighted
 * average of the eight rubric criteria (see RUBRIC), so it's explainable.
 *
 * Auth: org_admin of the session's org, org on ULTRA.  Env: ANTHROPIC_API_KEY.
 */

import { NextResponse } from "next/server";
import { guardPresentationRequest, jsonError } from "@/lib/server/presentationAccess";
import { analyzePresentation, claudeConfigured, claudeModel, type AnalysisContext } from "@/lib/ai/claude";
import { enforceRateLimit } from "@/lib/rateLimit";
import {
  RUBRIC,
  computeMetrics,
  guessSpeakerMap,
  type Dialogue,
  type PresentationAiReport,
  type SpeakerMap,
} from "@/lib/ai/presentationAiTypes";
import type { SupabaseClient } from "@supabase/supabase-js";

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
  if (!claudeConfigured()) {
    // eslint-disable-next-line no-console
    console.warn("[ai/analyze] ANTHROPIC_API_KEY is not set");
    return jsonError(503, "not_configured", "AI analysis isn't switched on yet. Ask your VPV administrator to add the API key.");
  }

  const rl = await enforceRateLimit(`ai-analyze:org:${row.org_id}`, 60, 86400);
  if (!rl.allowed) {
    return jsonError(429, "rate_limited", "Daily analysis limit reached for your organisation.", { retryAfter: rl.retryAfter });
  }

  try {
    const ctx = await buildContext(sb, row, orgName);
    const guessed = (row.ai_speaker_map as SpeakerMap) ?? guessSpeakerMap(dialogue.turns);
    const model = await analyzePresentation(dialogue.turns, guessed, ctx);

    // Speaker roles: trust the model's identification when it names a
    // label that actually exists in the dialogue.
    const labels = new Set(dialogue.turns.map((t) => t.speaker));
    let speakerMap: SpeakerMap = guessed;
    if (dialogue.source === "assemblyai" && labels.has(model.speaker_roles?.salesperson)) {
      speakerMap = {};
      for (const l of labels) speakerMap[l] = l === model.speaker_roles.salesperson ? "salesperson" : "customer";
    }

    // Normalise criteria to the rubric order; compute the weighted score.
    const byKey = new Map(model.criteria.map((c) => [c.key, c]));
    const criteria = RUBRIC.map((r) => {
      const c = byKey.get(r.key);
      const score = Math.max(0, Math.min(10, Math.round(Number(c?.score ?? 0))));
      return { key: r.key, name: r.name, score, comment: c?.comment ?? "" };
    });
    const overall = Math.round(
      RUBRIC.reduce((sum, r, i) => sum + (criteria[i].score / 10) * r.weight, 0)
    );

    const report: PresentationAiReport = {
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

    const { error } = await sb.rpc("save_presentation_ai", {
      p_session_id: row.session_id,
      p_patch: {
        ai_analysis: report,
        ai_score: overall,
        ai_speaker_map: speakerMap,
        ai_model: claudeModel(),
        ai_analyzed_at: new Date().toISOString(),
      },
    });
    if (error) throw new Error(error.message);

    return NextResponse.json(
      { ok: true, report, speakerMap },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[ai/analyze]", e);
    return jsonError(500, "server_error", "The AI analysis failed. Please try again in a minute.");
  }
}

/** What the salesperson SHOWED — scene order + dwell, info points opened —
 *  so the coach can judge whether the tour matched the customer's interest. */
async function buildContext(
  sb: SupabaseClient,
  row: { session_id: string; tour_id: string | null; presenter_user_id: string | null; client_id: string | null; started_at: string | null; duration_sec: number | null; place: string | null },
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

  const events = (eventsRes.data ?? []) as { event_type: string; scene_id: string | null; hotspot_id: string | null; created_at: string }[];
  const sceneIds = Array.from(new Set(events.map((e) => e.scene_id).filter(Boolean) as string[]));
  const hotspotIds = Array.from(new Set(events.filter((e) => e.event_type === "hotspot_click").map((e) => e.hotspot_id).filter(Boolean) as string[]));

  const [scenesRes, hotspotsRes] = await Promise.all([
    sceneIds.length ? sb.from("scenes").select("id, name").in("id", sceneIds) : Promise.resolve({ data: [] }),
    hotspotIds.length ? sb.from("hotspots").select("id, label, info_title").in("id", hotspotIds) : Promise.resolve({ data: [] }),
  ]);
  const sceneName = new Map(((scenesRes.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));

  // Dwell per scene visit, in visit order (consecutive repeats merged).
  const scenesShown: { name: string; seconds: number }[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.event_type !== "scene_view" || !e.scene_id) continue;
    const next = events[i + 1];
    const secs = next ? Math.max(0, Math.round((+new Date(next.created_at) - +new Date(e.created_at)) / 1000)) : 0;
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
