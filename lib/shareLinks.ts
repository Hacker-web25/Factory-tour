"use client";

import { supabase } from "@/lib/supabase";
import { sha256Hex } from "@/lib/folders";

/**
 * Share link CRUD + helpers.
 *
 * Two flavours:
 *   presenter — one link per salesperson. Requires them to sign in (so
 *               events attribute to their user id). URL: /present/[token]
 *   viewer    — public link. Optional password / email gate / expiry /
 *               view-limit. URL: /v/[token]
 *
 * The DB rows sit in the existing public.share_links table, extended by
 * the auth migration.
 */

export type ShareLinkKind = "presenter" | "viewer";

export type ShareLink = {
  id: string;
  tour_id: string;
  token: string;
  kind: ShareLinkKind;
  owner_user_id: string | null;
  label: string | null;
  password_hash: string | null;
  require_email: boolean;
  expires_at: string | null;
  view_limit: number | null;
  view_count: number;
  revoked_at: string | null;
  used: boolean;
  created_at: string;
  /** Max distinct viewer devices allowed. Null = unlimited. */
  device_limit: number | null;
  /** Most recent successful open, in ISO. Null = never opened. */
  last_opened_at: string | null;
  /** Optional email address the sender says they gave this link to.
   *  Used in analytics ("sent to rajesh@acme.com"). */
  shared_to_email: string | null;
  /** Optional phone number (typically for WhatsApp shares). */
  shared_to_phone: string | null;
};

function randomToken(len = 22): string {
  // URL-safe token — base36 concatenation.
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  ).slice(0, len);
}

export async function listShareLinks(tourId: string): Promise<ShareLink[]> {
  const { data, error } = await supabase
    .from("share_links")
    .select("*")
    .eq("tour_id", tourId)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[shareLinks] list failed:", error.message);
    return [];
  }
  return (data ?? []) as ShareLink[];
}

export async function createPresenterLink(opts: {
  tourId: string;
  userId: string;
  label?: string;
}): Promise<ShareLink | null> {
  const { data, error } = await supabase
    .from("share_links")
    .insert({
      tour_id: opts.tourId,
      token: randomToken(),
      kind: "presenter",
      owner_user_id: opts.userId,
      label: opts.label ?? null,
    })
    .select()
    .single();
  if (error) {
    alert("Create presenter link failed: " + error.message);
    return null;
  }
  return data as ShareLink;
}

export async function createViewerLink(opts: {
  tourId: string;
  label?: string;
  password?: string;
  requireEmail?: boolean;
  expiresAt?: Date | null;
  viewLimit?: number | null;
  deviceLimit?: number | null;
  sharedToEmail?: string | null;
  sharedToPhone?: string | null;
}): Promise<ShareLink | null> {
  const password_hash = opts.password
    ? await sha256Hex(opts.password)
    : null;
  const { data, error } = await supabase
    .from("share_links")
    .insert({
      tour_id: opts.tourId,
      token: randomToken(),
      kind: "viewer",
      label: opts.label ?? null,
      password_hash,
      require_email: !!opts.requireEmail,
      expires_at: opts.expiresAt?.toISOString() ?? null,
      view_limit: opts.viewLimit ?? null,
      device_limit: opts.deviceLimit ?? null,
      shared_to_email: opts.sharedToEmail?.trim() || null,
      shared_to_phone: opts.sharedToPhone?.trim() || null,
    })
    .select()
    .single();
  if (error) {
    alert("Create viewer link failed: " + error.message);
    return null;
  }
  return data as ShareLink;
}

/** Count distinct viewer devices that have already opened a link.
 *  Reads tour_events (viewer_fingerprint per share_link_id) — no extra
 *  table needed. */
export async function distinctDeviceCount(linkId: string): Promise<number> {
  const { data } = await supabase
    .from("tour_events")
    .select("viewer_fingerprint")
    .eq("share_link_id", linkId)
    .not("viewer_fingerprint", "is", null);
  const set = new Set<string>();
  for (const r of (data ?? []) as { viewer_fingerprint: string | null }[]) {
    if (r.viewer_fingerprint) set.add(r.viewer_fingerprint);
  }
  return set.size;
}

/** Where the link was last opened from — city / country pulled from
 *  the most recent tour_event that had a country. */
export async function lastOpenedLocation(
  linkId: string
): Promise<{ country: string | null; at: string | null }> {
  const { data } = await supabase
    .from("tour_events")
    .select("country, created_at")
    .eq("share_link_id", linkId)
    .not("country", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { country: string | null; created_at: string } | null;
  return {
    country: row?.country ?? null,
    at: row?.created_at ?? null,
  };
}

export async function revokeLink(id: string) {
  await supabase
    .from("share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
}

export async function deleteLink(id: string) {
  await supabase.from("share_links").delete().eq("id", id);
}

/** Fetch by token — used by /present and /v pages. Returns null if the
 *  link doesn't exist, and a `blocked` reason if it can't be opened
 *  (revoked, expired, view-limit hit, or device-limit hit by a NEW
 *  device — an existing device that already registered can re-enter). */
export async function loadByToken(
  token: string
): Promise<{ link: ShareLink; blocked?: string } | null> {
  const { data } = await supabase
    .from("share_links")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  const link = data as ShareLink;
  if (link.revoked_at) return { link, blocked: "This link has been revoked." };
  if (link.expires_at && new Date(link.expires_at) < new Date())
    return { link, blocked: "This link has expired." };
  if (link.view_limit != null && link.view_count >= link.view_limit)
    return { link, blocked: "This link has reached its view limit." };
  // Device limit — count distinct fingerprints seen so far; block a
  // new device if we're already at the limit. An already-registered
  // fingerprint always passes (same device revisiting).
  if (link.device_limit != null && link.device_limit > 0) {
    const myFp = getViewerFingerprint();
    const seen = await distinctDeviceCount(link.id);
    if (seen >= link.device_limit) {
      // Check whether MY fingerprint was one of the ones already seen.
      const { data: mine } = await supabase
        .from("tour_events")
        .select("id")
        .eq("share_link_id", link.id)
        .eq("viewer_fingerprint", myFp)
        .limit(1);
      if (!mine || mine.length === 0) {
        return {
          link,
          blocked: `This link is limited to ${link.device_limit} ${
            link.device_limit === 1 ? "device" : "devices"
          } and that limit has been reached.`,
        };
      }
    }
  }
  return { link };
}

/** Deep per-link analytics — sessions, total time, forwarded flag,
 *  top scenes (with per-scene time), top hotspots. Computed client-side
 *  from tour_events; heavy but fine for the MSME session sizes we
 *  expect (a few hundred events per link at most). */
export type LinkAnalytics = {
  sessions: number;
  totalSeconds: number;
  avgSessionSec: number;
  distinctDevices: number;
  distinctViewers: number; // by fingerprint OR viewer_email (whichever's set)
  /** Heuristic: if distinct devices > declared device_limit OR > 1
   *  when a specific recipient email was set, we mark it forwarded. */
  forwarded: boolean;
  /** Top scenes viewed with time-in-scene per session summed. */
  scenes: Array<{ sceneId: string; views: number; seconds: number }>;
  /** Top hotspots clicked. */
  hotspots: Array<{ hotspotId: string; clicks: number }>;
};

export async function loadLinkAnalytics(
  link: ShareLink
): Promise<LinkAnalytics> {
  const { data } = await supabase
    .from("tour_events")
    .select("event_type, scene_id, hotspot_id, session_id, viewer_fingerprint, viewer_email, created_at")
    .eq("share_link_id", link.id)
    .order("created_at", { ascending: true })
    .limit(10_000);

  type Row = {
    event_type: string;
    scene_id: string | null;
    hotspot_id: string | null;
    session_id: string | null;
    viewer_fingerprint: string | null;
    viewer_email: string | null;
    created_at: string;
  };
  const rows = (data ?? []) as Row[];

  // Per-session bounds → first + last event timestamp per session_id.
  // Also per-session per-scene timing: attribute time between two
  // consecutive scene_view events (in the same session) to the first one.
  const sessionBounds = new Map<string, { first: number; last: number }>();
  const sceneTime = new Map<string, number>();
  const sceneViews = new Map<string, number>();
  const hotspotClicks = new Map<string, number>();
  const distinctFps = new Set<string>();
  const distinctViewers = new Set<string>();

  // First pass — per-session ordered events (rows are already sorted asc).
  const bySession = new Map<string, Row[]>();
  for (const r of rows) {
    if (r.viewer_fingerprint) distinctFps.add(r.viewer_fingerprint);
    if (r.viewer_email || r.viewer_fingerprint)
      distinctViewers.add(r.viewer_email ?? r.viewer_fingerprint!);
    if (!r.session_id) continue;
    const list = bySession.get(r.session_id) ?? [];
    list.push(r);
    bySession.set(r.session_id, list);
  }

  for (const [sid, list] of bySession) {
    if (list.length === 0) continue;
    const firstMs = new Date(list[0].created_at).getTime();
    const lastMs = new Date(list[list.length - 1].created_at).getTime();
    sessionBounds.set(sid, { first: firstMs, last: lastMs });

    // Per-scene time within this session.
    const sceneViewsInSession = list.filter(
      (r) => r.event_type === "scene_view" && r.scene_id
    );
    for (let i = 0; i < sceneViewsInSession.length; i++) {
      const cur = sceneViewsInSession[i];
      const next = sceneViewsInSession[i + 1];
      const start = new Date(cur.created_at).getTime();
      const end = next ? new Date(next.created_at).getTime() : lastMs;
      const dur = Math.max(0, Math.floor((end - start) / 1000));
      sceneTime.set(cur.scene_id!, (sceneTime.get(cur.scene_id!) ?? 0) + dur);
      sceneViews.set(
        cur.scene_id!,
        (sceneViews.get(cur.scene_id!) ?? 0) + 1
      );
    }

    // Hotspot clicks in this session.
    for (const r of list) {
      if (r.event_type === "hotspot_click" && r.hotspot_id) {
        hotspotClicks.set(
          r.hotspot_id,
          (hotspotClicks.get(r.hotspot_id) ?? 0) + 1
        );
      }
    }
  }

  const sessions = bySession.size;
  let totalSeconds = 0;
  for (const { first, last } of sessionBounds.values()) {
    totalSeconds += Math.max(0, Math.floor((last - first) / 1000));
  }
  const avgSessionSec = sessions > 0 ? Math.floor(totalSeconds / sessions) : 0;

  // Forwarded heuristic: distinct devices >= 2 AND either (a) a
  // specific recipient was named (email/phone), or (b) the link had a
  // device_limit >= 1 and we exceeded it plus 0 (already the same as
  // (a)). Even without a recipient, "we thought it was for one person
  // but 3 devices opened it" is a real signal.
  const recipientNamed = !!(link.shared_to_email || link.shared_to_phone);
  const forwarded =
    distinctFps.size >= 2 &&
    (recipientNamed || (link.device_limit != null && distinctFps.size > link.device_limit));

  const scenes = Array.from(sceneViews.entries())
    .map(([sceneId]) => ({
      sceneId,
      views: sceneViews.get(sceneId) ?? 0,
      seconds: sceneTime.get(sceneId) ?? 0,
    }))
    .sort((a, b) => b.seconds - a.seconds);

  const hotspots = Array.from(hotspotClicks.entries())
    .map(([hotspotId, clicks]) => ({ hotspotId, clicks }))
    .sort((a, b) => b.clicks - a.clicks);

  return {
    sessions,
    totalSeconds,
    avgSessionSec,
    distinctDevices: distinctFps.size,
    distinctViewers: distinctViewers.size,
    forwarded,
    scenes,
    hotspots,
  };
}

/** Record a successful open — bumps view_count, sets last_opened_at,
 *  and writes a tour_event so the device counter picks this up. */
export function recordLinkOpen(link: ShareLink) {
  // last_opened_at + view_count via RPC (falls back to direct update).
  supabase
    .from("share_links")
    .update({
      last_opened_at: new Date().toISOString(),
      view_count: (link.view_count ?? 0) + 1,
    })
    .eq("id", link.id)
    .then(() => {});
}

/** Check password against stored hash. Returns true if match or no
 *  password required. */
export async function checkPassword(
  link: ShareLink,
  password: string
): Promise<boolean> {
  if (!link.password_hash) return true;
  const hash = await sha256Hex(password);
  return hash === link.password_hash;
}

/** Bump view_count. Fire-and-forget; not awaited by the caller. */
export function bumpViewCount(linkId: string) {
  supabase
    .rpc("increment_share_link_view", { p_id: linkId })
    .then(({ error }) => {
      if (error) {
        // Fallback path — read + write. Race-y but fine for MVP.
        supabase
          .from("share_links")
          .select("view_count")
          .eq("id", linkId)
          .single()
          .then(({ data }) => {
            if (data) {
              supabase
                .from("share_links")
                .update({ view_count: (data.view_count ?? 0) + 1 })
                .eq("id", linkId);
            }
          });
      }
    });
}

/** Generate or retrieve a stable "viewer fingerprint" — persists per
 *  browser via localStorage. Used to distinguish unique viewers on
 *  public links without requiring login. */
export function getViewerFingerprint(): string {
  if (typeof window === "undefined") return "ssr";
  const key = "factour_viewer_fp";
  try {
    let v = localStorage.getItem(key);
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem(key, v);
    }
    return v;
  } catch {
    return "no-storage";
  }
}

/** Session-scoped store for the current viewer's email (captured via
 *  the email gate). Read by the analytics tracker. */
export function setViewerEmail(email: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem("factour_viewer_email", email);
  } catch {}
}
export function getViewerEmail(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem("factour_viewer_email");
  } catch {
    return null;
  }
}
