/**
 * lib/server/analytics.ts — writing the first-party analytics. SERVER ONLY.
 *
 * Every function here is best-effort and returns void: losing an analytics
 * row must never break the page the visitor came for. A pamphlet that
 * cannot be counted is a bad day; a pamphlet whose QR code 500s is a
 * wasted print run.
 *
 * Route files may only export HTTP methods, so the shared pieces live here
 * (lib/server/otp.ts has the same note on why).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { VISITOR_HEADER, type Attribution } from "@/lib/analytics/attribution";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The anonymous browser id middleware resolved for this request. */
export function visitorIdFrom(headers: Headers): string | null {
  const v = headers.get(VISITOR_HEADER);
  return v && UUID_RE.test(v) ? v : null;
}

export type Geo = { country: string | null; city: string | null };

/** City-level location from Vercel's edge, the same source the tour
 *  analytics already use. Blank in local dev, which is fine. */
export function geoFrom(headers: Headers): Geo {
  const trim = (v: string | null, max: number) => {
    if (!v) return null;
    // Vercel percent-encodes city names with spaces or accents.
    let s = v;
    try {
      s = decodeURIComponent(v);
    } catch {
      /* leave it as sent */
    }
    s = s.trim().slice(0, max);
    return s.length ? s : null;
  };
  const country =
    trim(headers.get("x-vercel-ip-country"), 8) ??
    trim(headers.get("cf-ipcountry"), 8);
  return {
    country: country && country !== "XX" ? country : null,
    city: trim(headers.get("x-vercel-ip-city"), 120),
  };
}

/**
 * Record (or refresh) the visitor, keeping first-touch attribution.
 * `countView` is false for a QR scan, because the page view that follows
 * the redirect counts it — otherwise one scan would show as two visits.
 */
export async function touchVisitor(
  sb: SupabaseClient,
  visitorId: string,
  a: Partial<Attribution>,
  geo: Geo,
  countView = true
): Promise<void> {
  try {
    await sb.rpc("vpv_touch_visitor", {
      p_visitor: visitorId,
      p_source: a.source ?? null,
      p_medium: a.medium ?? null,
      p_campaign: a.campaign ?? null,
      p_code: a.code ?? null,
      p_referrer: a.referrer ?? null,
      p_landing: a.landingPath ?? null,
      p_country: geo.country,
      p_city: geo.city,
      p_count_view: countView,
    });
  } catch {
    /* analytics must never break the page */
  }
}

/** One row on the journey. */
export async function recordEvent(
  sb: SupabaseClient,
  row: {
    visitorId: string;
    sessionId?: string | null;
    name: string;
    path?: string | null;
    referrer?: string | null;
    meta?: Record<string, unknown> | null;
  },
  geo: Geo
): Promise<void> {
  try {
    await sb.from("site_events").insert({
      visitor_id: row.visitorId,
      session_id: row.sessionId ?? null,
      name: row.name,
      path: row.path ?? null,
      referrer: row.referrer ?? null,
      meta: row.meta ?? null,
      country: geo.country,
      city: geo.city,
    });
  } catch {
    /* best effort */
  }
}

/** One scan of a printed code. */
export async function recordScan(
  sb: SupabaseClient,
  row: {
    code: string;
    visitorId: string | null;
    referrer: string | null;
    userAgent: string | null;
    ip: string | null;
  },
  geo: Geo
): Promise<void> {
  try {
    await sb.from("campaign_scans").insert({
      code: row.code,
      visitor_id: row.visitorId,
      referrer: row.referrer,
      user_agent: row.userAgent ? row.userAgent.slice(0, 400) : null,
      ip: row.ip,
      country: geo.country,
      city: geo.city,
    });
  } catch {
    /* best effort */
  }
}
