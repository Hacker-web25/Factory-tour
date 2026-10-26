"use client";

/**
 * Notifications feed for the org_admin dashboard bell.
 *
 * We surface only the HIGH-SIGNAL events an owner actually wants pushed:
 *   1. A sales member started presenting a tour  (tour_events.session_start)
 *   2. A meeting is about to start / just started (calendar_events)
 *
 * Everything is derived from data that already exists — no new tables.
 * Unread state is tracked client-side via a "last seen" timestamp in
 * localStorage, so the badge count is per-browser and needs no schema.
 */

import { supabase } from "@/lib/supabase";
import { loadCalendarEvents } from "@/lib/calendarEvents";

export type AppNotification = {
  id: string;
  kind: "presenting" | "meeting_soon" | "meeting_started";
  title: string;
  body: string;
  at: string; // ISO timestamp used for ordering + unread
  href?: string;
};

const SEEN_KEY = "vpv:notif:lastSeen";

export function getLastSeen(): number {
  if (typeof window === "undefined") return 0;
  const v = window.localStorage.getItem(SEEN_KEY);
  return v ? Number(v) : 0;
}
export function markAllSeen(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SEEN_KEY, String(Date.now()));
}

function firstName(p: { full_name: string | null; email: string }): string {
  return (p.full_name || p.email || "Someone").split(/[\s@]/)[0];
}

/** Build the notification list for an org (newest first). */
export async function loadNotifications(
  orgId: string
): Promise<AppNotification[]> {
  const out: AppNotification[] = [];

  // Team profiles — for names + to scope presentation events.
  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("org_id", orgId);
  const profiles = (profileRows ?? []) as {
    id: string;
    email: string;
    full_name: string | null;
    role: string;
  }[];
  const nameById = new Map(profiles.map((p) => [p.id, firstName(p)]));
  const presenterIds = profiles.map((p) => p.id);

  /* 1. "Started presenting" — session_start events in the last 24h. */
  if (presenterIds.length > 0) {
    const sinceIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: evRows } = await supabase
      .from("tour_events")
      .select("id, tour_id, presenter_user_id, created_at, event_type")
      .eq("event_type", "session_start")
      .in("presenter_user_id", presenterIds)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(40);
    const events = (evRows ?? []) as {
      id: string;
      tour_id: string | null;
      presenter_user_id: string | null;
      created_at: string;
    }[];

    // Tour titles.
    const tourIds = Array.from(
      new Set(events.map((e) => e.tour_id).filter(Boolean) as string[])
    );
    const titleById = new Map<string, string>();
    if (tourIds.length) {
      const { data: tours } = await supabase
        .from("tours")
        .select("id, title")
        .in("id", tourIds);
      for (const t of (tours ?? []) as { id: string; title: string }[]) {
        titleById.set(t.id, t.title);
      }
    }

    for (const e of events) {
      const who = e.presenter_user_id
        ? nameById.get(e.presenter_user_id) ?? "A presenter"
        : "A presenter";
      const tourTitle = e.tour_id
        ? titleById.get(e.tour_id) ?? "a tour"
        : "a tour";
      out.push({
        id: `pres-${e.id}`,
        kind: "presenting",
        title: `${who} started presenting`,
        body: tourTitle,
        at: e.created_at,
        href: e.tour_id ? `/tour/${e.tour_id}?preview=1` : undefined,
      });
    }
  }

  /* 2. Meetings — starting within 30 min, or started in the last 2h. */
  const now = Date.now();
  const meetings = await loadCalendarEvents(orgId, {
    fromIso: new Date(now - 2 * 3600 * 1000).toISOString(),
    toIso: new Date(now + 30 * 60 * 1000).toISOString(),
  });
  for (const m of meetings) {
    if (m.status !== "planned") continue;
    const start = +new Date(m.starts_at);
    const diffMin = Math.round((start - now) / 60000);
    if (diffMin > 0 && diffMin <= 30) {
      out.push({
        id: `meet-soon-${m.id}`,
        kind: "meeting_soon",
        title: `Meeting in ${diffMin} min`,
        body: m.title + (m.location ? ` · ${m.location}` : ""),
        at: m.starts_at,
      });
    } else if (diffMin <= 0 && diffMin > -120) {
      out.push({
        id: `meet-started-${m.id}`,
        kind: "meeting_started",
        title: `Meeting started`,
        body: m.title + (m.location ? ` · ${m.location}` : ""),
        at: m.starts_at,
      });
    }
  }

  // Newest first.
  out.sort((a, b) => +new Date(b.at) - +new Date(a.at));
  return out.slice(0, 30);
}
