"use client";

/**
 * One row per presentation (meeting) for the MIS "All presentations"
 * list and the AI-analysis drawer.
 *
 * Merges two sources, keyed by session_id:
 *   • tour_events            → exact duration, scenes viewed, clicks
 *   • presentation_sessions  → start time, GPS place, recording, client,
 *                              outcome, AI status/score
 */

import { supabase, publicUrl } from "@/lib/supabase";
import {
  preciseSessionsForMember,
  type PreciseSession,
  type TeamOverview,
} from "@/lib/salesAnalytics";

export type PresentationRow = {
  sessionId: string;
  tourId: string | null;
  tourTitle: string;
  presenterId: string;
  presenterName: string;
  startMs: number;
  durationSec: number;
  place: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  clientId: string | null;
  outcome: string | null;
  scenesViewed: number;
  clicks: number;
  hovers: number;
  sceneSeconds: Record<string, number>;
  hotspotClicks: Record<string, number>;
  audioPath: string | null;
  hasTranscript: boolean;
  hasDialogue: boolean;
  aiStatus: string | null;
  aiScore: number | null;
};

export type RowExtras = {
  thumbnails: Map<string, string | null>; // tour_id → image url
  clients: Map<string, string>; // client_id → "Name · Company"
};

export function buildPresentationRows(ov: TeamOverview, windowDays: number): PresentationRow[] {
  const since = Date.now() - windowDays * 24 * 3600 * 1000;
  const nameOf = new Map(
    ov.members.map((m) => [m.id, m.full_name || m.email.split("@")[0]])
  );

  const precise = new Map<string, PreciseSession & { presenterId: string }>();
  for (const m of ov.members) {
    for (const s of preciseSessionsForMember(m.id, ov.allEvents)) {
      precise.set(s.sessionId, { ...s, presenterId: m.id });
    }
  }

  const rows = new Map<string, PresentationRow>();

  for (const [sid, ps] of ov.presentationSessions) {
    if (!ps.presenter_user_id || !nameOf.has(ps.presenter_user_id)) continue;
    const startMs = +new Date(ps.started_at);
    if (!(startMs >= since)) continue;
    const p = precise.get(sid);
    // Skip tours that were opened and closed with nothing recorded.
    if (!p && !ps.audio_path && !ps.transcript) continue;
    rows.set(sid, {
      sessionId: sid,
      tourId: ps.tour_id ?? p?.tourId ?? null,
      tourTitle: titleOf(ov, ps.tour_id ?? p?.tourId ?? null),
      presenterId: ps.presenter_user_id,
      presenterName: nameOf.get(ps.presenter_user_id) ?? "—",
      startMs: p?.startMs ?? startMs,
      durationSec: p?.durationSec || ps.duration_sec || 0,
      place: ps.place,
      country: p?.country ?? null,
      lat: ps.lat,
      lng: ps.lng,
      clientId: ps.client_id ?? null,
      outcome: ps.outcome ?? null,
      scenesViewed: p?.scenesViewed ?? 0,
      clicks: p?.totalClicks ?? 0,
      hovers: p?.totalHovers ?? 0,
      sceneSeconds: p?.sceneSeconds ?? {},
      hotspotClicks: p?.hotspotClicks ?? {},
      audioPath: ps.audio_path,
      hasTranscript: !!ps.transcript,
      hasDialogue: !!ps.ai_dialogue,
      aiStatus: ps.ai_transcript_status ?? null,
      aiScore: ps.ai_score ?? null,
    });
  }

  // Sessions seen in events but with no presentation_sessions row
  // (older data, or GPS insert blocked) still count as presentations.
  for (const [sid, p] of precise) {
    if (rows.has(sid) || p.startMs < since) continue;
    rows.set(sid, {
      sessionId: sid,
      tourId: p.tourId,
      tourTitle: titleOf(ov, p.tourId),
      presenterId: p.presenterId,
      presenterName: nameOf.get(p.presenterId) ?? "—",
      startMs: p.startMs,
      durationSec: p.durationSec,
      place: null,
      country: p.country,
      lat: null,
      lng: null,
      clientId: null,
      outcome: null,
      scenesViewed: p.scenesViewed,
      clicks: p.totalClicks,
      hovers: p.totalHovers,
      sceneSeconds: p.sceneSeconds,
      hotspotClicks: p.hotspotClicks,
      audioPath: null,
      hasTranscript: false,
      hasDialogue: false,
      aiStatus: null,
      aiScore: null,
    });
  }

  return Array.from(rows.values()).sort((a, b) => b.startMs - a.startMs);
}

function titleOf(ov: TeamOverview, tourId: string | null): string {
  if (!tourId) return "Untitled tour";
  return ov.toursById.get(tourId) || "Untitled tour";
}

/** Thumbnails (tour cover → first scene) and client names, batched. */
export async function loadRowExtras(rows: PresentationRow[]): Promise<RowExtras> {
  const tourIds = Array.from(new Set(rows.map((r) => r.tourId).filter(Boolean) as string[]));
  const clientIds = Array.from(new Set(rows.map((r) => r.clientId).filter(Boolean) as string[]));

  const thumbnails = new Map<string, string | null>();
  const clients = new Map<string, string>();

  const [toursRes, scenesRes, clientsRes] = await Promise.all([
    tourIds.length
      ? supabase.from("tours").select("id, thumbnail_path, cover_scene_id").in("id", tourIds)
      : Promise.resolve({ data: [] }),
    tourIds.length
      ? supabase
          .from("scenes")
          .select("id, tour_id, image_path, thumbnail_path, order_index")
          .in("tour_id", tourIds)
          .order("order_index")
      : Promise.resolve({ data: [] }),
    clientIds.length
      ? supabase.from("clients").select("id, name, company").in("id", clientIds)
      : Promise.resolve({ data: [] }),
  ]);

  type SceneLite = { id: string; tour_id: string; image_path: string | null; thumbnail_path: string | null };
  const scenes = (scenesRes.data ?? []) as SceneLite[];
  const firstScene = new Map<string, SceneLite>();
  const sceneById = new Map<string, SceneLite>();
  for (const s of scenes) {
    sceneById.set(s.id, s);
    if (!firstScene.has(s.tour_id)) firstScene.set(s.tour_id, s);
  }

  for (const t of (toursRes.data ?? []) as { id: string; thumbnail_path: string | null; cover_scene_id: string | null }[]) {
    const cover = t.cover_scene_id ? sceneById.get(t.cover_scene_id) : undefined;
    const scene = cover ?? firstScene.get(t.id);
    const path = t.thumbnail_path ?? scene?.thumbnail_path ?? scene?.image_path ?? null;
    thumbnails.set(t.id, path ? publicUrl(path) : null);
  }

  for (const c of (clientsRes.data ?? []) as { id: string; name: string; company: string | null }[]) {
    clients.set(c.id, c.company ? `${c.name} · ${c.company}` : c.name);
  }

  return { thumbnails, clients };
}
