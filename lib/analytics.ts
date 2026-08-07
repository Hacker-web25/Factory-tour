/**
 * Fire-and-forget analytics for the public tour viewer.
 *
 * Every scene view, hotspot click, and session boundary writes a row
 * to public.tour_events (see migration 019). The tour owner's
 * /analytics/[id] dashboard aggregates those rows into KPIs.
 *
 * Guarantees:
 *   • Never blocks the viewer. Writes go via `void` promises.
 *   • Never surfaces errors — analytics is best-effort. If the DB is
 *     down, migration hasn't been run, or the viewer is offline, the
 *     viewer keeps working normally.
 *   • Session id is stable for the lifetime of one browser tab
 *     (sessionStorage). A new tab = a new session.
 *   • Scene-view events are lightly debounced so rapid nav (auto-tour
 *     firing through multiple scenes in a second) doesn't flood the
 *     table with useless rows.
 */

import { supabase } from "./supabase";

export type TourEventType =
  | "scene_view"
  | "hotspot_click"
  | "session_start"
  | "session_end";

const SESSION_KEY = "ft-session-id";

/**
 * Attribution context — set once by /present/[token] or /v/[token] on
 * mount. Every subsequent trackEvent() call within the same tab picks up
 * these values so events attribute back to the right share link + user
 * (presenter) or fingerprint (public viewer). Stored on window rather
 * than in React context to avoid threading props through every child.
 */
export type AttributionContext = {
  share_link_id?: string | null;
  presenter_user_id?: string | null;
  viewer_fingerprint?: string | null;
  viewer_email?: string | null;
};

const ATTR_KEY = "__factour_attr__";
export function setAttribution(ctx: AttributionContext) {
  if (typeof window === "undefined") return;
  (window as unknown as Record<string, unknown>)[ATTR_KEY] = ctx;
}
function getAttribution(): AttributionContext {
  if (typeof window === "undefined") return {};
  return (
    ((window as unknown as Record<string, unknown>)[ATTR_KEY] as
      | AttributionContext
      | undefined) ?? {}
  );
}

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    // sessionStorage can throw in privacy modes — fall back to a
    // per-page-load id.
    return crypto.randomUUID();
  }
}

/** Small debounce so back-to-back scene_view events (e.g. user
 *  rapid-clicks the strip) collapse to the latest one. Keyed by
 *  event_type + scene_id so unrelated events aren't affected. */
const pendingTimers = new Map<string, number>();

/** Fire an analytics event. Never awaits — safe to call anywhere. */
export function trackEvent(
  tour_id: string,
  event_type: TourEventType,
  extras: {
    scene_id?: string | null;
    hotspot_id?: string | null;
  } = {},
  debounceMs = 0
): void {
  if (typeof window === "undefined" || !tour_id) return;
  const session_id = getOrCreateSessionId();
  const viewport_w = window.innerWidth || null;
  const viewport_h = window.innerHeight || null;
  const key = `${event_type}:${extras.scene_id ?? ""}:${extras.hotspot_id ?? ""}`;

  const fire = () => {
    const attr = getAttribution();
    supabase
      .from("tour_events")
      .insert({
        tour_id,
        scene_id: extras.scene_id ?? null,
        hotspot_id: extras.hotspot_id ?? null,
        event_type,
        session_id,
        viewport_w,
        viewport_h,
        // Attribution — attached to every event so per-presenter and
        // per-viewer analytics segments can be computed later.
        share_link_id: attr.share_link_id ?? null,
        presenter_user_id: attr.presenter_user_id ?? null,
        viewer_fingerprint: attr.viewer_fingerprint ?? null,
        viewer_email: attr.viewer_email ?? null,
      })
      .then(({ error }) => {
        if (error) console.warn("[analytics]", error.message);
      });
  };

  if (debounceMs > 0) {
    const prev = pendingTimers.get(key);
    if (prev) window.clearTimeout(prev);
    const t = window.setTimeout(fire, debounceMs);
    pendingTimers.set(key, t);
  } else {
    fire();
  }
}

/* --------------------------- Dashboard queries --------------------------- */

export type KpiSummary = {
  totalViews: number; // scene_view count
  uniqueSessions: number;
  avgSessionSec: number;
  hotspotClicks: number;
};

export type ViewsPerDay = { day: string; count: number };
export type SceneRank = { scene_id: string; count: number };
export type HotspotRank = { hotspot_id: string; count: number };

/** Roll up the last N days of events into the shape the dashboard renders.
 *  Optional `presenterId` filters to a single presenter's sessions. */
export async function loadDashboardData(
  tour_id: string,
  days = 30,
  opts: { presenterId?: string | null } = {}
): Promise<{
  kpis: KpiSummary;
  viewsPerDay: ViewsPerDay[];
  topScenes: SceneRank[];
  topHotspots: HotspotRank[];
}> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  let query = supabase
    .from("tour_events")
    .select("event_type, scene_id, hotspot_id, session_id, created_at")
    .eq("tour_id", tour_id)
    .gte("created_at", since);
  if (opts.presenterId) {
    query = query.eq("presenter_user_id", opts.presenterId);
  }
  const { data: events, error } = await query
    .order("created_at", { ascending: true })
    .limit(50000);

  if (error) {
    console.warn("[analytics] loadDashboardData", error.message);
    return {
      kpis: {
        totalViews: 0,
        uniqueSessions: 0,
        avgSessionSec: 0,
        hotspotClicks: 0,
      },
      viewsPerDay: [],
      topScenes: [],
      topHotspots: [],
    };
  }

  const rows = events ?? [];
  const sessions = new Set<string>();
  let sceneViews = 0;
  let hotspotClicks = 0;
  const sceneCount = new Map<string, number>();
  const hotspotCount = new Map<string, number>();
  const perDay = new Map<string, number>();
  // session_id → { first: ISO, last: ISO } for average session duration
  const sessionBounds = new Map<string, { first: string; last: string }>();

  for (const r of rows) {
    const row = r as {
      event_type: string;
      scene_id: string | null;
      hotspot_id: string | null;
      session_id: string;
      created_at: string;
    };
    sessions.add(row.session_id);
    const bounds = sessionBounds.get(row.session_id);
    if (!bounds) {
      sessionBounds.set(row.session_id, {
        first: row.created_at,
        last: row.created_at,
      });
    } else {
      bounds.last = row.created_at;
    }

    if (row.event_type === "scene_view") {
      sceneViews++;
      if (row.scene_id) {
        sceneCount.set(row.scene_id, (sceneCount.get(row.scene_id) ?? 0) + 1);
      }
      const day = row.created_at.slice(0, 10);
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    } else if (row.event_type === "hotspot_click") {
      hotspotClicks++;
      if (row.hotspot_id) {
        hotspotCount.set(
          row.hotspot_id,
          (hotspotCount.get(row.hotspot_id) ?? 0) + 1
        );
      }
    }
  }

  // Avg session duration in seconds — first-to-last-event span per session.
  let totalDurationSec = 0;
  let counted = 0;
  Array.from(sessionBounds.values()).forEach((b) => {
    const start = new Date(b.first).getTime();
    const end = new Date(b.last).getTime();
    const s = Math.max(0, (end - start) / 1000);
    if (s > 0) {
      totalDurationSec += s;
      counted++;
    }
  });
  const avgSessionSec = counted > 0 ? totalDurationSec / counted : 0;

  // Densify per-day series so the chart has a bar for every day even
  // when views were zero.
  const viewsPerDay: ViewsPerDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    viewsPerDay.push({ day: d, count: perDay.get(d) ?? 0 });
  }

  const topScenes = Array.from(sceneCount.entries())
    .map(([scene_id, count]) => ({ scene_id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const topHotspots = Array.from(hotspotCount.entries())
    .map(([hotspot_id, count]) => ({ hotspot_id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    kpis: {
      totalViews: sceneViews,
      uniqueSessions: sessions.size,
      avgSessionSec: Math.round(avgSessionSec),
      hotspotClicks,
    },
    viewsPerDay,
    topScenes,
    topHotspots,
  };
}
