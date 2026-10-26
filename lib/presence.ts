"use client";

/**
 * Presence — heartbeat that lets the org_admin see a live green/idle/
 * offline dot next to every sales-team member.
 *
 * How
 * ---
 * Each authenticated client posts a `presence` row upsert every 60s
 * while the tab is open (or focus-visible). Server just stores
 * (user_id, last_seen). The analytics dashboard reads this table and
 * classifies:
 *   • last_seen < 90s ago → online
 *   • last_seen < 30min   → idle
 *   • otherwise           → offline
 *
 * No websockets, no realtime channel required — a polite REST heartbeat
 * that costs one small write/user/minute. Cheap and rock-solid.
 */

import { supabase } from "@/lib/supabase";

const HEARTBEAT_MS = 60_000;

let timer: number | null = null;
let stopped = false;

async function tick() {
  if (stopped) return;
  try {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user?.id;
    if (!uid) return;
    await supabase.from("presence").upsert(
      {
        user_id: uid,
        last_seen: new Date().toISOString(),
        last_route:
          typeof window !== "undefined" ? window.location.pathname : null,
      },
      { onConflict: "user_id" }
    );
  } catch {
    // presence writes are best-effort — ignore errors
  }
}

export function startPresence(): () => void {
  if (typeof window === "undefined") return () => {};
  stopped = false;
  // Fire once immediately so the dot turns green as soon as they open.
  tick();
  timer = window.setInterval(tick, HEARTBEAT_MS);
  const onVis = () => {
    if (document.visibilityState === "visible") tick();
  };
  document.addEventListener("visibilitychange", onVis);
  return () => {
    stopped = true;
    if (timer != null) window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVis);
  };
}

export type PresenceRow = {
  user_id: string;
  last_seen: string;
  last_route: string | null;
};

export async function loadPresence(userIds: string[]): Promise<Map<string, PresenceRow>> {
  const out = new Map<string, PresenceRow>();
  if (userIds.length === 0) return out;
  const { data } = await supabase
    .from("presence")
    .select("*")
    .in("user_id", userIds);
  for (const r of (data ?? []) as PresenceRow[]) {
    out.set(r.user_id, r);
  }
  return out;
}

export function statusFromLastSeen(
  iso: string | null
): "online" | "idle" | "offline" {
  if (!iso) return "offline";
  const ms = Date.now() - +new Date(iso);
  if (ms < 90_000) return "online";
  if (ms < 30 * 60_000) return "idle";
  return "offline";
}
