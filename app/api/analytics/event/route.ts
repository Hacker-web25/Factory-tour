/**
 * POST /api/analytics/event
 *
 * Records one tour_events row from the viewer, server-side, so that
 * geolocation (country + city) can be filled in from the request IP via
 * Vercel's `x-vercel-ip-country` and `x-vercel-ip-city` headers. The
 * browser-side `trackEvent` (lib/analytics.ts) POSTs here instead of
 * inserting into Supabase directly, which it can no longer do and know
 * the viewer's country.
 *
 * The handler never trusts the client for location, tour authorship,
 * or any derived field. It accepts only the viewer-side identifiers
 * (tour_id, scene_id, hotspot_id, event_type, session_id, viewport,
 * attribution) and writes them with the service-role client. Keeping
 * the surface small is the whole security story here — this endpoint
 * is public and anonymous by design, so it must stay idempotent-safe
 * and side-effect-free beyond a single INSERT.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getClientIp } from "@/lib/getClientIp";
import { readJson } from "@/lib/server/billingGuard";

export const runtime = "nodejs";

/** A real event is a few hundred bytes; anything bigger is not from our viewer. */
const MAX_BODY_BYTES = 4 * 1024;

/**
 * Best-effort flood brake, per server instance and per visitor address.
 * Deliberately in memory (not a database call): this route fires on every
 * hotspot hover, and a limiter that cost a query per event would be a bigger
 * load than the flood it guards against. It stops one script hammering one
 * instance; the project-wide cap belongs in a Vercel firewall rate-limit rule
 * on /api/analytics/event. Generous enough for a whole factory sharing one
 * office IP.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 600;
const MAX_TRACKED = 5_000;
const hits = new Map<string, { n: number; resetAt: number }>();

function overLimit(ip: string): boolean {
  const now = Date.now();
  if (hits.size > MAX_TRACKED) {
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    if (hits.size > MAX_TRACKED) hits.clear();
  }
  const cur = hits.get(ip);
  if (!cur || cur.resetAt <= now) {
    hits.set(ip, { n: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  cur.n += 1;
  return cur.n > MAX_PER_WINDOW;
}

type Body = {
  tour_id?: string;
  scene_id?: string | null;
  hotspot_id?: string | null;
  event_type?: string;
  session_id?: string;
  viewport_w?: number | null;
  viewport_h?: number | null;
  share_link_id?: string | null;
  presenter_user_id?: string | null;
  viewer_fingerprint?: string | null;
  viewer_email?: string | null;
};

const EVENT_TYPES = new Set([
  "tour_view",
  "scene_view",
  "hotspot_click",
  "hotspot_hover",
  "share_open",
  "menu_open",
  "autotour_start",
  "autotour_stop",
]);

function isUuid(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

function trim(s: unknown, max: number): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

export async function POST(req: Request) {
  const sb = supabaseAdmin();
  if (!sb) {
    return NextResponse.json({ ok: true, stored: false });
  }

  if (overLimit(getClientIp(req.headers))) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  // sendBeacon posts text/plain, so the type is not checked — the size cap and
  // the strict field validation below are what keep this endpoint small.
  const parsed = await readJson(req, MAX_BODY_BYTES);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
  }
  const body = parsed.body as Body;

  if (!isUuid(body.tour_id)) {
    return NextResponse.json({ ok: false, error: "bad_tour" }, { status: 400 });
  }
  if (!body.event_type || !EVENT_TYPES.has(body.event_type)) {
    return NextResponse.json({ ok: false, error: "bad_event" }, { status: 400 });
  }

  const h = req.headers;
  const country =
    trim(h.get("x-vercel-ip-country"), 8) ??
    trim(h.get("x-vercel-ip-country-code"), 8);
  const rawCity = h.get("x-vercel-ip-city");
  let city: string | null = null;
  if (rawCity) {
    try {
      city = trim(decodeURIComponent(rawCity), 80);
    } catch {
      city = trim(rawCity, 80);
    }
  }

  const row = {
    tour_id: body.tour_id,
    scene_id: isUuid(body.scene_id) ? body.scene_id : null,
    hotspot_id: isUuid(body.hotspot_id) ? body.hotspot_id : null,
    event_type: body.event_type,
    session_id: trim(body.session_id, 64),
    viewport_w:
      typeof body.viewport_w === "number" && body.viewport_w > 0
        ? Math.min(10000, Math.round(body.viewport_w))
        : null,
    viewport_h:
      typeof body.viewport_h === "number" && body.viewport_h > 0
        ? Math.min(10000, Math.round(body.viewport_h))
        : null,
    share_link_id: isUuid(body.share_link_id) ? body.share_link_id : null,
    presenter_user_id: isUuid(body.presenter_user_id)
      ? body.presenter_user_id
      : null,
    viewer_fingerprint: trim(body.viewer_fingerprint, 64),
    viewer_email: trim(body.viewer_email, 320),
    country,
    city,
  };

  const { error } = await sb.from("tour_events").insert(row);
  if (error) {
    return NextResponse.json(
      { ok: false, error: "insert_failed" },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, stored: true });
}
