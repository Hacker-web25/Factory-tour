"use client";

/**
 * Sales-team analytics — the data layer for the org_admin dashboard.
 *
 * All aggregation happens client-side over rows from `tour_events`
 * plus profiles in the org. Server-side rollups would be faster on
 * huge datasets but for MSME-scale (10–20 presenters, a few thousand
 * events/month) this is more than fast enough and keeps the code in
 * one place.
 *
 * Every metric this file exports is derived from what's already in
 * `tour_events` today — no new schema needed. Future accuracy
 * improvements (session_start/end, dwell pings) plug in without
 * changing the consumer API.
 */

import { supabase } from "@/lib/supabase";
import { loadPresence, statusFromLastSeen } from "@/lib/presence";
import {
  loadPresentationSessions,
  type PresentationSession,
} from "@/lib/presentationSession";

/* ------------------------------- Types ---------------------------------- */

export type TeamMember = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
};

export type MemberStats = {
  memberId: string;
  presentations: number;
  totalSeconds: number;
  avgSeconds: number;
  uniqueProspects: number;
  countries: string[];
  toursPresented: string[];
  lastActive: string | null; // ISO — most recent event OR presence heartbeat
  presenceLastSeen: string | null; // ISO — pure presence heartbeat
  status: "online" | "idle" | "offline";
  daysActiveInLast7: number;
  weeklySeries: number[]; // 7 numbers, oldest → newest, "presentations per day"
  sparkline: number[]; // last 14 days of presentation counts
};

export type TourEvent = {
  id: string;
  tour_id: string | null;
  scene_id: string | null;
  hotspot_id: string | null;
  session_id: string | null;
  event_type: string;
  meta: Record<string, any> | null;
  share_link_id: string | null;
  presenter_user_id: string | null;
  viewer_fingerprint: string | null;
  viewer_email: string | null;
  country: string | null;
  device_type: string | null;
  created_at: string;
};

export type TeamOverview = {
  members: TeamMember[];
  perMember: Map<string, MemberStats>;
  totals: {
    presentations: number;
    hours: number;
    uniqueProspects: number;
    activeMembers: number;
  };
  deltas: {
    presentations: number; // %
    hours: number;
    uniqueProspects: number;
    activeMembers: number;
  };
  recentEvents: TourEvent[];
  /** ALL events in the window (not just the recent 50) — used for the
   *  precise per-session drilldown so nothing is dropped. */
  allEvents: TourEvent[];
  toursById: Map<string, string>; // tour_id → title
  scenesById: Map<string, { name: string; tour_id: string }>;
  hotspotsById: Map<string, string>; // hotspot_id → human label
  /** session_id → GPS + recording + AI-topic data for that presentation. */
  presentationSessions: Map<string, PresentationSession>;
};

/* ----------------------------- Fetching --------------------------------- */

/** Load every artifact needed for the analytics dashboard in one shot.
 *  Two SQL round-trips (profiles + events); everything else is derived
 *  client-side. */
export async function loadTeamOverview(
  orgId: string,
  windowDays = 30
): Promise<TeamOverview> {
  // 1. Members of this org (excluding org_admin themselves so the
  //    dashboard is about their team, not them).
  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .eq("org_id", orgId);
  const members = ((profileRows ?? []) as TeamMember[]).filter(
    (p) => p.role === "presenter"
  );
  const memberIds = new Set(members.map((m) => m.id));

  // 2. Events in the window, filtered to this team's presenters.
  const sinceIso = new Date(
    Date.now() - windowDays * 24 * 3600 * 1000
  ).toISOString();
  let events: TourEvent[] = [];
  if (memberIds.size > 0) {
    const { data: evRows } = await supabase
      .from("tour_events")
      .select("*")
      .gte("created_at", sinceIso)
      .in("presenter_user_id", Array.from(memberIds))
      .order("created_at", { ascending: false })
      .limit(20_000);
    events = (evRows ?? []) as TourEvent[];
  }

  // 3. Lookups for tour + scene names (batched).
  const tourIds = Array.from(
    new Set(events.map((e) => e.tour_id).filter(Boolean) as string[])
  );
  const sceneIds = Array.from(
    new Set(events.map((e) => e.scene_id).filter(Boolean) as string[])
  );
  const hotspotIds = Array.from(
    new Set(events.map((e) => e.hotspot_id).filter(Boolean) as string[])
  );
  const [toursById, scenesById, hotspotsById] = await Promise.all([
    fetchTours(tourIds),
    fetchScenes(sceneIds),
    fetchHotspots(hotspotIds),
  ]);

  // 4. Presence heartbeats for live status dots + per-presentation
  //    GPS/recording enrichment.
  const [presenceRows, presentationSessions] = await Promise.all([
    loadPresence(Array.from(memberIds)),
    loadPresentationSessions(orgId),
  ]);

  // 5. Aggregate per-member stats (blending events + presence).
  const perMember = new Map<string, MemberStats>();
  for (const m of members) {
    perMember.set(
      m.id,
      aggregateMember(m.id, events, presenceRows.get(m.id)?.last_seen ?? null)
    );
  }

  // 5. Totals + deltas (window vs previous window).
  const prevWindowIso = new Date(
    Date.now() - 2 * windowDays * 24 * 3600 * 1000
  ).toISOString();
  const prevEvents: TourEvent[] = [];
  if (memberIds.size > 0) {
    const { data: prev } = await supabase
      .from("tour_events")
      .select("presenter_user_id, viewer_fingerprint, tour_id, created_at")
      .gte("created_at", prevWindowIso)
      .lt("created_at", sinceIso)
      .in("presenter_user_id", Array.from(memberIds))
      .limit(20_000);
    if (prev) prevEvents.push(...(prev as TourEvent[]));
  }

  const totals = summarize(perMember, events, members);
  const prevTotals = summarizeFromRaw(prevEvents, members);
  const deltas = {
    presentations: pctDelta(totals.presentations, prevTotals.presentations),
    hours: pctDelta(totals.hours, prevTotals.hours),
    uniqueProspects: pctDelta(
      totals.uniqueProspects,
      prevTotals.uniqueProspects
    ),
    activeMembers: pctDelta(totals.activeMembers, prevTotals.activeMembers),
  };

  return {
    members,
    perMember,
    totals,
    deltas,
    recentEvents: events.slice(0, 50),
    allEvents: events,
    toursById,
    scenesById,
    hotspotsById,
    presentationSessions,
  };
}

/** hotspot_id → a MEANINGFUL label so the admin knows which hotspot was
 *  clicked/hovered. Priority:
 *    1. the author's typed label ("Change Rooms")
 *    2. what it does — a nav hotspot → "→ Destination scene"
 *    3. its info title
 *    4. where it lives — "Info spot · Ground floor"
 *  Only falls back to a generic name when the hotspot has truly nothing. */
async function fetchHotspots(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const { data } = await supabase
    .from("hotspots")
    .select(
      "id, label, type, action, target_scene_id, scene_id, info_title, icon_key"
    )
    .in("id", ids);
  const rows = (data ?? []) as {
    id: string;
    label: string | null;
    type: string | null;
    action: string | null;
    target_scene_id: string | null;
    scene_id: string | null;
    info_title: string | null;
    icon_key: string | null;
  }[];

  // Resolve scene names for both the hotspot's own scene and any nav target.
  const sceneIds = Array.from(
    new Set(
      rows
        .flatMap((r) => [r.target_scene_id, r.scene_id])
        .filter(Boolean) as string[]
    )
  );
  const sceneName = new Map<string, string>();
  if (sceneIds.length) {
    const { data: sc } = await supabase
      .from("scenes")
      .select("id, name")
      .in("id", sceneIds);
    for (const s of (sc ?? []) as { id: string; name: string }[]) {
      sceneName.set(s.id, s.name);
    }
  }

  const prettyType: Record<string, string> = {
    nav: "Navigation",
    info: "Info spot",
    image: "Image",
    video: "Video",
    audio: "Audio",
    text: "Label",
    person: "Person tag",
    polygon: "Area",
    icon: "Marker",
  };

  for (const r of rows) {
    const isNav =
      r.type === "nav" || r.action === "nav" ? true : false;
    const targetName = r.target_scene_id
      ? sceneName.get(r.target_scene_id)
      : null;
    const ownScene = r.scene_id ? sceneName.get(r.scene_id) : null;

    let label =
      (r.label && r.label.trim()) ||
      (isNav && targetName ? `→ ${targetName}` : "") ||
      (r.info_title && r.info_title.trim()) ||
      (targetName ? `→ ${targetName}` : "");

    if (!label) {
      const typeName =
        (r.type && prettyType[r.type]) ||
        (r.type && titleCase(r.type)) ||
        "Hotspot";
      label = ownScene ? `${typeName} · ${ownScene}` : typeName;
    }

    out.set(r.id, label);
  }
  return out;
}

function titleCase(s: string): string {
  return s
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function fetchTours(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const { data } = await supabase
    .from("tours")
    .select("id, title")
    .in("id", ids);
  for (const r of (data ?? []) as { id: string; title: string }[]) {
    out.set(r.id, r.title);
  }
  return out;
}
async function fetchScenes(
  ids: string[]
): Promise<Map<string, { name: string; tour_id: string }>> {
  const out = new Map<string, { name: string; tour_id: string }>();
  if (ids.length === 0) return out;
  const { data } = await supabase
    .from("scenes")
    .select("id, name, tour_id")
    .in("id", ids);
  for (const r of (data ?? []) as {
    id: string;
    name: string;
    tour_id: string;
  }[]) {
    out.set(r.id, { name: r.name, tour_id: r.tour_id });
  }
  return out;
}

/* ---------------------------- Aggregation ------------------------------- */

/** Sessions we group events into. A session = same (presenter, viewer_fp)
 *  with < 30-min gap between consecutive events. */
export type Session = {
  presenter: string;
  viewer: string;
  tourId: string | null;
  country: string | null;
  first: number; // ms
  last: number; // ms
  /** Per-scene time-on-scene, in seconds, computed from the timestamps
   *  of scene_view events. Keyed by scene_id. */
  sceneSeconds?: Record<string, number>;
  /** Hotspot IDs interacted with during this session, in order. */
  hotspots?: string[];
};

/** All (filtered) sessions attributed to a specific presenter, with
 *  the extra fields the detail modal needs (per-scene time, hotspot
 *  ids). Exported so the modal can render them without another query. */
export function sessionsForMember(
  memberId: string,
  events: TourEvent[]
): Session[] {
  const mine = events.filter((e) => e.presenter_user_id === memberId);
  const sessions = sessionsFor(mine).filter(
    (s) => s.last - s.first >= 30_000
  );
  // Attach per-scene time + hotspot list by walking events per session.
  return sessions.map((s) => {
    const inWindow = mine.filter((e) => {
      if (e.viewer_fingerprint !== s.viewer) return false;
      const t = +new Date(e.created_at);
      return t >= s.first && t <= s.last;
    });
    inWindow.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    const sceneSeconds: Record<string, number> = {};
    const hotspots: string[] = [];
    for (let i = 0; i < inWindow.length; i++) {
      const e = inWindow[i];
      if (e.event_type === "scene_view" && e.scene_id) {
        const next = inWindow[i + 1];
        const start = +new Date(e.created_at);
        const end = next ? +new Date(next.created_at) : s.last;
        sceneSeconds[e.scene_id] =
          (sceneSeconds[e.scene_id] ?? 0) +
          Math.round(Math.max(0, end - start) / 1000);
      } else if (e.event_type === "hotspot_click") {
        const hid = (e as any).hotspot_id ?? (e.meta as any)?.hotspot_id;
        if (hid) hotspots.push(hid);
      }
    }
    return { ...s, sceneSeconds, hotspots };
  });
}

/* --------------------- Precise session analytics ------------------------ *
 * The functions above cluster events by a 30-min time gap — good enough for
 * headline counts, but fuzzy. For the per-member drilldown we use the exact
 * `session_id` stamped on every event (one browser tab = one meeting). This
 * gives precise: start time, duration, per-scene dwell, hotspot clicks,
 * hovers, and total interactions — all real, all measured. */

export type PreciseSession = {
  sessionId: string;
  tourId: string | null;
  country: string | null;
  startMs: number;
  endMs: number;
  durationSec: number;
  /** seconds spent on each scene (keyed by scene_id) */
  sceneSeconds: Record<string, number>;
  scenesViewed: number;
  /** hotspot_id → click count */
  hotspotClicks: Record<string, number>;
  totalClicks: number;
  /** hotspot_id → hover count */
  hotspotHovers: Record<string, number>;
  totalHovers: number;
};

/** Build precise sessions for one member from the FULL event list, grouped
 *  by session_id. Sessions with < 15s of activity are dropped as accidental
 *  opens. Newest first. */
export function preciseSessionsForMember(
  memberId: string,
  events: TourEvent[]
): PreciseSession[] {
  const mine = events.filter((e) => e.presenter_user_id === memberId);
  const byId = new Map<string, TourEvent[]>();
  for (const e of mine) {
    const sid = e.session_id ?? `nosess-${e.id}`;
    let arr = byId.get(sid);
    if (!arr) {
      arr = [];
      byId.set(sid, arr);
    }
    arr.push(e);
  }

  const out: PreciseSession[] = [];
  for (const [sessionId, rawArr] of byId) {
    const arr = rawArr
      .slice()
      .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    const startMs = +new Date(arr[0].created_at);
    const endMs = +new Date(arr[arr.length - 1].created_at);
    const durationSec = Math.round((endMs - startMs) / 1000);

    const sceneSeconds: Record<string, number> = {};
    const hotspotClicks: Record<string, number> = {};
    const hotspotHovers: Record<string, number> = {};
    let tourId: string | null = null;
    let country: string | null = null;

    for (let i = 0; i < arr.length; i++) {
      const e = arr[i];
      if (!tourId && e.tour_id) tourId = e.tour_id;
      if (!country && e.country) country = e.country;

      if (e.event_type === "scene_view" && e.scene_id) {
        // Time on this scene = gap until the next event in the session.
        const next = arr[i + 1];
        const start = +new Date(e.created_at);
        const stop = next ? +new Date(next.created_at) : endMs;
        sceneSeconds[e.scene_id] =
          (sceneSeconds[e.scene_id] ?? 0) +
          Math.round(Math.max(0, stop - start) / 1000);
      } else if (e.event_type === "hotspot_click" && e.hotspot_id) {
        hotspotClicks[e.hotspot_id] = (hotspotClicks[e.hotspot_id] ?? 0) + 1;
      } else if (e.event_type === "hotspot_hover" && e.hotspot_id) {
        hotspotHovers[e.hotspot_id] = (hotspotHovers[e.hotspot_id] ?? 0) + 1;
      }
    }

    const totalClicks = Object.values(hotspotClicks).reduce((a, b) => a + b, 0);
    const totalHovers = Object.values(hotspotHovers).reduce((a, b) => a + b, 0);

    // Drop trivial opens (< 15s and no interaction).
    if (durationSec < 15 && totalClicks === 0 && totalHovers === 0) continue;

    out.push({
      sessionId,
      tourId,
      country,
      startMs,
      endMs,
      durationSec,
      sceneSeconds,
      scenesViewed: Object.keys(sceneSeconds).length,
      hotspotClicks,
      totalClicks,
      hotspotHovers,
      totalHovers,
    });
  }

  out.sort((a, b) => b.startMs - a.startMs);
  return out;
}

/** Group precise sessions into day buckets (local time), newest day first.
 *  Each bucket carries the day's total presentations + time + interactions. */
export type DayBucket = {
  dayKey: string; // YYYY-MM-DD (local)
  label: string; // e.g. "Mon, 12 May"
  weekday: string; // "Monday"
  sessions: PreciseSession[];
  presentations: number;
  totalSec: number;
  clicks: number;
  hovers: number;
};

export function bucketSessionsByDay(sessions: PreciseSession[]): DayBucket[] {
  const map = new Map<string, PreciseSession[]>();
  for (const s of sessions) {
    const d = new Date(s.startMs);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(d.getDate()).padStart(2, "0")}`;
    let arr = map.get(key);
    if (!arr) {
      arr = [];
      map.set(key, arr);
    }
    arr.push(s);
  }
  const buckets: DayBucket[] = [];
  for (const [dayKey, arr] of map) {
    const d = new Date(arr[0].startMs);
    buckets.push({
      dayKey,
      label: d.toLocaleDateString([], {
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
      weekday: d.toLocaleDateString([], { weekday: "long" }),
      sessions: arr.sort((a, b) => b.startMs - a.startMs),
      presentations: arr.length,
      totalSec: arr.reduce((a, s) => a + s.durationSec, 0),
      clicks: arr.reduce((a, s) => a + s.totalClicks, 0),
      hovers: arr.reduce((a, s) => a + s.totalHovers, 0),
    });
  }
  buckets.sort((a, b) => (a.dayKey < b.dayKey ? 1 : -1));
  return buckets;
}

/** Distinct meetings (sessions) for a member — the honest "how many
 *  presentations" number, one per real session regardless of click count. */
export function meetingCountForMember(
  memberId: string,
  events: TourEvent[]
): number {
  return preciseSessionsForMember(memberId, events).length;
}

function sessionsFor(events: TourEvent[]): Session[] {
  // Group by (presenter, viewer)
  const byPair = new Map<string, TourEvent[]>();
  for (const e of events) {
    const k = `${e.presenter_user_id ?? "?"}::${e.viewer_fingerprint ?? "?"}`;
    let arr = byPair.get(k);
    if (!arr) {
      arr = [];
      byPair.set(k, arr);
    }
    arr.push(e);
  }
  const sessions: Session[] = [];
  for (const arr of byPair.values()) {
    arr.sort(
      (a, b) => +new Date(a.created_at) - +new Date(b.created_at)
    );
    let cur: Session | null = null;
    for (const e of arr) {
      const t = +new Date(e.created_at);
      if (!cur || t - cur.last > 30 * 60 * 1000) {
        if (cur) sessions.push(cur);
        cur = {
          presenter: e.presenter_user_id ?? "",
          viewer: e.viewer_fingerprint ?? "",
          tourId: e.tour_id ?? null,
          country: e.country ?? null,
          first: t,
          last: t,
        };
      } else {
        cur.last = t;
        if (!cur.tourId && e.tour_id) cur.tourId = e.tour_id;
        if (!cur.country && e.country) cur.country = e.country;
      }
    }
    if (cur) sessions.push(cur);
  }
  return sessions;
}

function aggregateMember(
  memberId: string,
  events: TourEvent[],
  presenceLastSeen: string | null = null
): MemberStats {
  const mine = events.filter((e) => e.presenter_user_id === memberId);
  const sessions = sessionsFor(mine).filter(
    // A "presentation" = session >= 30s. Filters out one-tap open-and-close.
    (s) => s.last - s.first >= 30_000
  );

  const totalMs = sessions.reduce((a, s) => a + (s.last - s.first), 0);
  const uniqueProspects = new Set(sessions.map((s) => s.viewer).filter(Boolean))
    .size;
  const countries = Array.from(
    new Set(sessions.map((s) => s.country).filter(Boolean) as string[])
  );
  const toursPresented = Array.from(
    new Set(sessions.map((s) => s.tourId).filter(Boolean) as string[])
  );

  // lastActive = max of (latest event, presence heartbeat). Presence
  // captures "dashboard open but not presenting yet" so the dot goes
  // green immediately when a presenter signs in, before they open a
  // tour.
  const eventTs = mine[0]?.created_at ?? null;
  const lastActive = pickLater(eventTs, presenceLastSeen);

  // Weekly series — last 7 days of presentation counts.
  const weeklySeries = perDayCounts(sessions, 7);
  const sparkline = perDayCounts(sessions, 14);
  const daysActiveInLast7 = weeklySeries.filter((n) => n > 0).length;

  return {
    memberId,
    presentations: sessions.length,
    totalSeconds: Math.round(totalMs / 1000),
    avgSeconds:
      sessions.length > 0 ? Math.round(totalMs / 1000 / sessions.length) : 0,
    uniqueProspects,
    countries,
    toursPresented,
    lastActive,
    presenceLastSeen,
    status: statusFromLastSeen(presenceLastSeen),
    daysActiveInLast7,
    weeklySeries,
    sparkline,
  };
}

function pickLater(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return +new Date(a) > +new Date(b) ? a : b;
}

function perDayCounts(sessions: Session[], days: number): number[] {
  const out = new Array(days).fill(0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const zero = +now;
  for (const s of sessions) {
    const dayStart = new Date(s.first);
    dayStart.setHours(0, 0, 0, 0);
    const dayIdx =
      days - 1 - Math.floor((zero - +dayStart) / (24 * 3600 * 1000));
    if (dayIdx >= 0 && dayIdx < days) out[dayIdx] += 1;
  }
  return out;
}

function summarize(
  perMember: Map<string, MemberStats>,
  events: TourEvent[],
  members: TeamMember[]
) {
  let presentations = 0;
  let totalSec = 0;
  const prospects = new Set<string>();
  for (const [, s] of perMember) {
    presentations += s.presentations;
    totalSec += s.totalSeconds;
  }
  for (const e of events) {
    if (e.viewer_fingerprint) prospects.add(e.viewer_fingerprint);
  }
  const activeMembers = members.filter(
    (m) => (perMember.get(m.id)?.presentations ?? 0) > 0
  ).length;
  return {
    presentations,
    hours: Math.round((totalSec / 3600) * 10) / 10,
    uniqueProspects: prospects.size,
    activeMembers,
  };
}

function summarizeFromRaw(events: TourEvent[], members: TeamMember[]) {
  const perMember = new Map<string, MemberStats>();
  for (const m of members) {
    perMember.set(m.id, aggregateMember(m.id, events));
  }
  return summarize(perMember, events, members);
}

function pctDelta(now: number, prev: number): number {
  if (prev === 0) return now > 0 ? 100 : 0;
  return Math.round(((now - prev) / prev) * 100);
}

/* ---------------------------- Insights ---------------------------------- */

/** Rules-based insight generator. Produces 2–4 high-signal sentences
 *  the org_admin can act on. LLM upgrades slot in without breaking
 *  callers — the return shape stays `{title, body, tone}[]`. */
export type Insight = {
  title: string;
  body: string;
  tone: "positive" | "warning" | "neutral";
};

export function generateInsights(overview: TeamOverview): Insight[] {
  const insights: Insight[] = [];
  const members = overview.members;
  if (members.length === 0) return insights;

  // Top performer
  let top: { m: TeamMember; s: MemberStats } | null = null;
  for (const m of members) {
    const s = overview.perMember.get(m.id);
    if (!s) continue;
    if (!top || s.presentations > top.s.presentations) top = { m, s };
  }
  if (top && top.s.presentations > 0) {
    insights.push({
      title: `${firstName(top.m)} is your top presenter`,
      body: `${top.s.presentations} presentation${
        top.s.presentations === 1 ? "" : "s"
      } this month, reaching ${top.s.uniqueProspects} unique prospect${
        top.s.uniqueProspects === 1 ? "" : "s"
      }.`,
      tone: "positive",
    });
  }

  // Idle members
  const now = Date.now();
  const idle: TeamMember[] = [];
  for (const m of members) {
    const s = overview.perMember.get(m.id);
    if (!s) continue;
    if (!s.lastActive) {
      idle.push(m);
      continue;
    }
    const daysSince = (now - +new Date(s.lastActive)) / (24 * 3600 * 1000);
    if (daysSince > 7) idle.push(m);
  }
  if (idle.length > 0) {
    insights.push({
      title: `${idle.length} team member${
        idle.length === 1 ? "" : "s"
      } inactive for 7+ days`,
      body: `${idle
        .slice(0, 3)
        .map((m) => firstName(m))
        .join(", ")}${idle.length > 3 ? ` + ${idle.length - 3} more` : ""}. Consider a nudge.`,
      tone: "warning",
    });
  }

  // Overall momentum
  if (overview.deltas.presentations !== 0) {
    const up = overview.deltas.presentations > 0;
    insights.push({
      title: `Team ${up ? "up" : "down"} ${Math.abs(
        overview.deltas.presentations
      )}% this month`,
      body: `${overview.totals.presentations} presentations vs previous window. ${
        up ? "Keep the momentum going." : "Investigate what changed."
      }`,
      tone: up ? "positive" : "warning",
    });
  }

  // International reach
  const allCountries = new Set<string>();
  for (const [, s] of overview.perMember) {
    for (const c of s.countries) allCountries.add(c);
  }
  if (allCountries.size > 1) {
    insights.push({
      title: `Prospects across ${allCountries.size} countries`,
      body: `Team is reaching buyers in ${Array.from(allCountries)
        .slice(0, 5)
        .join(", ")}${allCountries.size > 5 ? ` + more` : ""}.`,
      tone: "neutral",
    });
  }

  return insights;
}

function firstName(m: TeamMember): string {
  if (m.full_name) return m.full_name.split(" ")[0];
  return m.email.split("@")[0];
}

/* ---------------------------- Formatters -------------------------------- */

export function formatHours(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin === 0 ? `${hr}h` : `${hr}h ${remMin}m`;
}

export function formatRelative(iso: string | null): string {
  if (!iso) return "Never";
  const then = +new Date(iso);
  const now = Date.now();
  const s = Math.floor((now - then) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export function statusFor(iso: string | null): "online" | "idle" | "offline" {
  if (!iso) return "offline";
  const mins = (Date.now() - +new Date(iso)) / 60000;
  if (mins < 5) return "online";
  if (mins < 30) return "idle";
  return "offline";
}
