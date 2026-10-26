/**
 * GET /q/<code> — the link behind every printed QR code.
 *
 * This is what the pamphlet points at. It does three things and then gets
 * out of the way:
 *
 *   1. logs the scan SERVER-SIDE, so it counts even when the visitor
 *      blocks every script (roughly a third of them do, which is why
 *      Google Analytics alone cannot tell you what a print run achieved);
 *   2. stamps the visitor with first-touch attribution, so the order they
 *      place three weeks later still traces back to this pamphlet;
 *   3. redirects to the real page with utm_* attached, so Google Analytics
 *      groups the visit exactly the way our own tables do.
 *
 * IT ALWAYS REDIRECTS. A code that is unknown, archived, or arrives while
 * the database is down still lands the visitor on the homepage. The one
 * thing a printed QR code must never do is show an error: the pamphlet is
 * already in somebody's hand and cannot be reissued.
 *
 * The destination is always a path on myvpv.com (enforced by isSafePath
 * here and by a CHECK constraint on the column), so a code can never be
 * turned into an open redirect that lends our domain to a phishing page.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getClientIp } from "@/lib/getClientIp";
import { escapeLike } from "@/lib/server/billingGuard";
import { isSafePath, normaliseCode } from "@/lib/analytics/attribution";
import {
  geoFrom,
  recordScan,
  touchVisitor,
  visitorIdFrom,
} from "@/lib/server/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE = "https://myvpv.com";

/** 302, never 301: a permanent redirect would be cached by the browser and
 *  by every proxy in between, and the second scan would never reach us. */
function send(to: URL | string): NextResponse {
  const res = NextResponse.redirect(to, 302);
  res.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  return res;
}

export async function GET(req: Request, { params }: { params: { code: string } }) {
  const origin = (() => {
    try {
      return new URL(req.url).origin;
    } catch {
      return SITE;
    }
  })();
  const home = new URL("/", origin);

  const code = normaliseCode(params.code);
  if (!code) return send(home);

  const sb = supabaseAdmin();
  if (!sb) return send(home); // never strand a scan

  type Row = {
    code: string;
    destination: string;
    source: string;
    medium: string;
    campaign: string | null;
    active: boolean;
  };

  let row: Row | null = null;
  try {
    // Exact first; then case-insensitively, because a code may be typed in
    // by hand from the print rather than scanned. escapeLike matters: "_"
    // is a LIKE wildcard and codes are allowed to contain it.
    const exact = await sb
      .from("campaign_codes")
      .select("code, destination, source, medium, campaign, active")
      .eq("code", code)
      .maybeSingle();
    row = (exact.data as Row | null) ?? null;
    if (!row) {
      const loose = await sb
        .from("campaign_codes")
        .select("code, destination, source, medium, campaign, active")
        .ilike("code", escapeLike(code))
        .limit(1)
        .maybeSingle();
      row = (loose.data as Row | null) ?? null;
    }
  } catch {
    return send(home);
  }

  if (!row || !row.active || !isSafePath(row.destination)) return send(home);

  // Where they are actually going, with the campaign stamped on the URL.
  const dest = new URL(row.destination, origin);
  dest.searchParams.set("utm_source", row.source);
  dest.searchParams.set("utm_medium", row.medium);
  if (row.campaign) dest.searchParams.set("utm_campaign", row.campaign);
  // Our own code, read back by the tracker and the funnel.
  dest.searchParams.set("vpv", row.code);

  const headers = req.headers;
  const geo = geoFrom(headers);
  const visitorId = visitorIdFrom(headers);
  const referrer = headers.get("referer");

  await Promise.allSettled([
    recordScan(
      sb,
      {
        code: row.code,
        visitorId,
        referrer,
        userAgent: headers.get("user-agent"),
        ip: getClientIp(headers),
      },
      geo
    ),
    visitorId
      ? touchVisitor(
          sb,
          visitorId,
          {
            source: row.source,
            medium: row.medium,
            campaign: row.campaign,
            code: row.code,
            referrer,
            landingPath: row.destination,
          },
          geo,
          // The page view on the other side of this redirect is the visit.
          // Counting it here too would double every scan.
          false
        )
      : Promise.resolve(),
  ]);

  return send(dest);
}
