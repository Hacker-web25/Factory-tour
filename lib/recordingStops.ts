"use client";

/**
 * recording_stops — the record of a sales rep stopping a recording in
 * the middle of a meeting, and the MD's review of that stop.
 *
 * See supabase/recording_stops.sql for the table, its RLS and the
 * column-level guard triggers. In short: a rep can log their own stop
 * and flip the trailing-window flag on it; only an org_admin/owner can
 * write a verdict or a review, and the server stamps who reviewed and
 * when.
 *
 * Policy anchors: /terms#recording-ai, /privacy#recordings-ai.
 */

import { supabase } from "@/lib/supabase";

/** How long VPV keeps recording after the rep presses Stop. Must match
 *  the default on recording_stops.trailing_seconds and the number in
 *  the popup copy and the policy pages. */
export const TRAILING_SECONDS = 15;

export type StopVerdict = "verified_valid" | "unverified" | "flagged";
export type MdReview = "ok" | "not_ok";

export type RecordingStop = {
  id: string;
  org_id: string;
  session_id: string;
  tour_id: string | null;
  presenter_user_id: string | null;
  client_id: string | null;
  stopped_at: string;
  stop_offset_sec: number | null;
  trailing_seconds: number;
  trailing_captured: boolean;
  verdict: StopVerdict;
  verdict_detail: string | null;
  md_review: MdReview | null;
  md_reviewed_at: string | null;
  md_reviewed_by: string | null;
  md_note: string | null;
  created_at: string;
};

/**
 * Log a stop the moment the rep confirms it — BEFORE the trailing window
 * runs — so a closed tab still leaves the MD a record. Returns the new
 * row's id, or null when it could not be written (the caller treats that
 * as "carry on, the recording still stops").
 */
export async function recordStop(args: {
  orgId: string;
  sessionId: string;
  tourId: string | null;
  presenterId: string;
  clientId?: string | null;
  /** Seconds into the session audio at which Stop was pressed. */
  stopOffsetSec: number | null;
}): Promise<string | null> {
  const { data, error } = await supabase
    .from("recording_stops")
    .insert({
      org_id: args.orgId,
      session_id: args.sessionId,
      tour_id: args.tourId,
      presenter_user_id: args.presenterId,
      client_id: args.clientId ?? null,
      stop_offset_sec:
        typeof args.stopOffsetSec === "number"
          ? Math.max(0, Math.round(args.stopOffsetSec))
          : null,
      trailing_seconds: TRAILING_SECONDS,
      trailing_captured: false,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

/**
 * Ask the server to decide this stop's verdict. Fire-and-forget: the row
 * already exists and stays 'unverified' if this never lands, which is the
 * safe state. Never awaited by the viewer.
 */
export function requestVerdict(stopId: string): void {
  try {
    void fetch("/api/recording-stops/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stopId }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* the MD still sees the stop, just without an automated verdict */
  }
}

/** Mark that the trailing window completed (the rep did not close the tab
 *  early). Best-effort; a failure just leaves the flag false. */
export async function markTrailingCaptured(
  stopId: string,
  stopOffsetSec?: number | null
): Promise<void> {
  const patch: Record<string, unknown> = { trailing_captured: true };
  if (typeof stopOffsetSec === "number") {
    patch.stop_offset_sec = Math.max(0, Math.round(stopOffsetSec));
  }
  await supabase
    .from("recording_stops")
    .update(patch)
    .eq("id", stopId)
    .then(() => {});
}

export type RecordingStopRow = RecordingStop & {
  presenter_name: string | null;
  presenter_email: string | null;
  tour_title: string | null;
  /** From presentation_sessions — null when nothing was recorded. */
  audio_path: string | null;
  duration_sec: number | null;
};

/**
 * Every stop in the org, newest first, joined with the names the MD
 * needs to read the list and the audio path to play it back.
 */
export async function listRecordingStops(
  orgId: string,
  limit = 100
): Promise<RecordingStopRow[]> {
  const { data, error } = await supabase
    .from("recording_stops")
    .select("*")
    .eq("org_id", orgId)
    .order("stopped_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  const stops = data as RecordingStop[];
  if (stops.length === 0) return [];

  const presenterIds = Array.from(
    new Set(stops.map((s) => s.presenter_user_id).filter(Boolean) as string[])
  );
  const tourIds = Array.from(
    new Set(stops.map((s) => s.tour_id).filter(Boolean) as string[])
  );
  const sessionIds = Array.from(new Set(stops.map((s) => s.session_id)));

  const [profilesRes, toursRes, sessionsRes] = await Promise.all([
    presenterIds.length
      ? supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", presenterIds)
      : Promise.resolve({ data: [] as unknown[] }),
    tourIds.length
      ? supabase.from("tours").select("id, title").in("id", tourIds)
      : Promise.resolve({ data: [] as unknown[] }),
    sessionIds.length
      ? supabase
          .from("presentation_sessions")
          .select("session_id, audio_path, duration_sec")
          .in("session_id", sessionIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const nameById = new Map<string, { name: string | null; email: string | null }>();
  for (const p of (profilesRes.data ?? []) as {
    id: string;
    full_name: string | null;
    email: string | null;
  }[]) {
    nameById.set(p.id, { name: p.full_name, email: p.email });
  }
  const titleById = new Map<string, string>();
  for (const t of (toursRes.data ?? []) as { id: string; title: string }[]) {
    titleById.set(t.id, t.title);
  }
  const audioBySession = new Map<
    string,
    { audio_path: string | null; duration_sec: number | null }
  >();
  for (const s of (sessionsRes.data ?? []) as {
    session_id: string;
    audio_path: string | null;
    duration_sec: number | null;
  }[]) {
    audioBySession.set(s.session_id, {
      audio_path: s.audio_path,
      duration_sec: s.duration_sec,
    });
  }

  return stops.map((s) => {
    const who = s.presenter_user_id ? nameById.get(s.presenter_user_id) : null;
    const audio = audioBySession.get(s.session_id);
    return {
      ...s,
      presenter_name: who?.name ?? null,
      presenter_email: who?.email ?? null,
      tour_title: s.tour_id ? titleById.get(s.tour_id) ?? null : null,
      audio_path: audio?.audio_path ?? null,
      duration_sec: audio?.duration_sec ?? null,
    };
  });
}

/**
 * The MD's decision on a stop. The server stamps md_reviewed_at and
 * md_reviewed_by itself (see the guard trigger), so we never send them.
 */
export async function setMdReview(
  stopId: string,
  review: MdReview | null,
  note?: string | null
): Promise<boolean> {
  const patch: Record<string, unknown> = { md_review: review };
  if (note !== undefined) patch.md_note = note?.trim() || null;
  const { error } = await supabase
    .from("recording_stops")
    .update(patch)
    .eq("id", stopId);
  return !error;
}

/** How many stops in this org still have no MD decision. Drives the
 *  badge on the dashboard nav. */
export async function countPendingStops(orgId: string): Promise<number> {
  const { count, error } = await supabase
    .from("recording_stops")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .is("md_review", null);
  if (error) return 0;
  return count ?? 0;
}

/* ───────────────────────── display helpers ───────────────────────── */

export function verdictLabel(v: StopVerdict): string {
  return v === "verified_valid"
    ? "Client asked to stop"
    : v === "flagged"
      ? "No client request heard"
      : "Could not verify";
}

export function verdictHelp(v: StopVerdict): string {
  return v === "verified_valid"
    ? "A voice other than the rep's was heard asking to stop recording."
    : v === "flagged"
      ? "Nothing in the window after Stop supports a client request. Listen before you decide."
      : "We could not tell from the audio — poor sound, no voice sample on file, or mixed languages. This is not a mark against the rep.";
}
