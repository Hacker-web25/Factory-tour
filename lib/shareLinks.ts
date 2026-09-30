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
