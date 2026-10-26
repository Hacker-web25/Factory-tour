/**
 * POST /api/track — one step of a visitor's journey, recorded first-party.
 *
 * Why this exists next to Google Analytics and Clarity: those two answer
 * "how many people" and "what did they look at", and they do it well. They
 * cannot answer "did the Gurugram pamphlet produce any paid orders",
 * because a large share of visitors block them outright and because
 * neither one ever sees our billing table. This endpoint is on our own
 * domain, so it is not blocked, and it writes into the same database the
 * funnel and the orders live in — so the join is a join, not a guess.
 *
 * The browser is trusted for very little: the event name must be one we
 * know, the path and referrer are truncated, and the visitor id is NOT
 * read from the body at all — it comes from the cookie middleware set, so
 * one visitor cannot write rows as another.
 *
 * A visitor who opts out on the cookie notice is dropped here with the
 * same 200 everyone else gets. Returning an error would tell a script
 * whether a given browser had opted out, and the page has nothing useful
 * to do with the failure anyway.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getClientIp } from "@/lib/getClientIp";
import { billingRateLimit, clean, json, readJson } from "@/lib/server/billingGuard";
import {
  OPT_OUT_COOKIE,
  classifyReferrer,
  normaliseCode,
} from "@/lib/analytics/attribution";
import {
  geoFrom,
  recordEvent,
  touchVisitor,
  visitorIdFrom,
} from "@/lib/server/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4 * 1024;

/** Events we are willing to store. An allowlist rather than free text, so
 *  a bored visitor cannot fill the table with invented event names. */
const EVENT_NAMES = new Set([
  "page_view",
  "funnel_step",
  "cta_click",
  "outbound_click",
  "scroll_depth",
  "video_play",
  "plan_selected",
  "coupon_applied",
  "pay_click",
  "tour_opened",
  // Seconds the page was in front of the visitor, and how far down they read.
  "page_time",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Small, flat, and capped: meta is a note, not a payload. */
function cleanMeta(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    if (n >= 12) break;
    if (k.length > 40) continue;
    if (typeof raw === "string") out[k] = raw.slice(0, 200);
    else if (typeof raw === "number" && Number.isFinite(raw)) out[k] = raw;
    else if (typeof raw === "boolean") out[k] = raw;
    else continue;
    n += 1;
  }
  return n ? out : null;
}

export async function POST(req: Request) {
  // Opted out: accept and discard, silently and identically.
  const cookie = req.headers.get("cookie") ?? "";
  if (cookie.includes(`${OPT_OUT_COOKIE}=1`)) return json({ ok: true });

  const visitorId = visitorIdFrom(req.headers);
  if (!visitorId) return json({ ok: true }); // no cookie yet; nothing to attach to

  const sb = supabaseAdmin();
  if (!sb) return json({ ok: true });

  const read = await readJson(req, MAX_BODY_BYTES);
  if (!read.ok) return json({ ok: true });
  const body = read.body;

  const name = clean(body.name, 40);
  if (!EVENT_NAMES.has(name)) return json({ ok: true });

  // Generous: a long browse is many page views, and losing the tail of a
  // real journey matters more than the rows a bot could add.
  const ip = getClientIp(req.headers);
  const perVisitor = await billingRateLimit(sb, `track:v:${visitorId}`, 300, 900);
  if (!perVisitor.allowed) return json({ ok: true });
  const perIp = await billingRateLimit(sb, `track:ip:${ip}`, 1200, 900);
  if (!perIp.allowed) return json({ ok: true });

  const path = clean(body.path, 300) || null;
  const referrer = clean(body.referrer, 300) || null;
  const sessionRaw = clean(body.sessionId, 40);
  const sessionId = UUID_RE.test(sessionRaw) ? sessionRaw : null;
  const geo = geoFrom(req.headers);

  // A page view is also the moment to learn where this visitor came from.
  if (name === "page_view") {
    const fromRef = classifyReferrer(referrer);
    await touchVisitor(
      sb,
      visitorId,
      {
        source: clean(body.utmSource, 120) || fromRef.source,
        medium: clean(body.utmMedium, 120) || fromRef.medium,
        campaign: clean(body.utmCampaign, 120) || null,
        code: normaliseCode(body.code),
        referrer,
        landingPath: path,
      },
      geo
    );
  }

  await recordEvent(
    sb,
    { visitorId, sessionId, name, path, referrer, meta: cleanMeta(body.meta) },
    geo
  );

  return json({ ok: true });
}

export function GET() {
  return NextResponse.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
}
