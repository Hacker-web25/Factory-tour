/**
 * GET /q/l2q/<LINK-2-QR campaign id>[?to=/path] — the bridge for letters printed by LINK-2-QR.
 *
 * Those QR codes open LINK-2-QR, which counts the scan and then sends everyone in
 * the campaign to ONE link, so the person's code is lost on the way (lib/link2qr.ts).
 * With this page set as that link, the visitor arrives here a second or two after
 * LINK-2-QR recorded their scan. We ask LINK-2-QR for the campaign's scans, take
 * the one made just before this visit that nobody has claimed yet, and from there
 * on behave exactly like /q/<code>: the scan is logged with this browser, the
 * visitor gets first-touch attribution, and lands with utm_* and ?vpv=<code>.
 *
 * Claiming is atomic: the scan row is filled in only while it has no visitor, so
 * two people scanning the same campaign at the same moment can never both take
 * the same scan; the second one takes the next.
 *
 * IT ALWAYS REDIRECTS, like /q/<code>. LINK-2-QR asleep, the database down, no
 * matching scan: the visitor still lands on the page the letter promised.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getClientIp } from "@/lib/getClientIp";
import { isSafePath } from "@/lib/analytics/attribution";
import { parseUserAgent } from "@/lib/analytics/userAgent";
import { geoFrom, setVisitorDevice, touchVisitor, visitorIdFrom } from "@/lib/server/analytics";
import { bridgeCandidates, fetchCampaign } from "@/lib/link2qr";
import { importedScanRow, writeScans } from "@/lib/server/link2qrSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE = "https://myvpv.com";
/** LINK-2-QR has just served this visitor's redirect, so it is awake; keep the wait short. */
const LOOKUP_MS = 6_000;

function send(to: URL): NextResponse {
  const res = NextResponse.redirect(to, 302);
  res.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  return res;
}

/** Where the letter's link meant to send people: ?to= when it is one of our paths. */
function landingPath(url: URL): string {
  const to = url.searchParams.get("to");
  if (to && isSafePath(to) && !/^\/q(\/|$)/.test(to)) return to;
  return "/";
}

type CodeRow = { code: string; destination: string; source: string; medium: string; campaign: string | null; active: boolean };

export async function GET(req: Request, { params }: { params: { campaign: string } }) {
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    url = new URL(SITE);
  }
  const fallbackPath = landingPath(url);
  const fallback = new URL(fallbackPath, url.origin);

  const campaignId = /^\d{1,9}$/.test(params.campaign) ? Number(params.campaign) : NaN;
  if (!Number.isInteger(campaignId) || campaignId <= 0) return send(fallback);

  const sb = supabaseAdmin();
  if (!sb) return send(fallback);

  const now = Date.now();
  let campaign;
  try {
    campaign = await fetchCampaign(campaignId, LOOKUP_MS);
  } catch {
    campaign = null;
  }
  if (!campaign) return send(fallback);

  const headers = req.headers;
  const visitorId = visitorIdFrom(headers);
  const userAgent = headers.get("user-agent");
  const ua = parseUserAgent(userAgent);
  const geo = geoFrom(headers);

  let claimed: CodeRow | null = null;
  try {
    // Every scan of this campaign we do not hold yet, so is_repeat is right and
    // the rows we are about to claim exist.
    await writeScans(sb, campaign.scans);

    for (const scan of bridgeCandidates(campaign.scans, now)) {
      const base = importedScanRow(scan, false);
      const { data, error } = await sb
        .from("campaign_scans")
        .update({
          visitor_id: visitorId,
          user_agent: userAgent ? userAgent.slice(0, 400) : null,
          ip: getClientIp(headers),
          country: geo.country,
          city: geo.city,
          device: ua.device,
          os: ua.os,
          browser: ua.browser,
        })
        .eq("id", base.id)
        .is("visitor_id", null)
        .select("code");
      if (error || !data?.length) continue; // not ours to take, or already claimed

      const row = await sb
        .from("campaign_codes")
        .select("code, destination, source, medium, campaign, active")
        .eq("code", scan.code)
        .maybeSingle();
      claimed = (row.data as CodeRow | null) ?? null;
      break;
    }
  } catch {
    claimed = null;
  }

  if (!claimed || !claimed.active) return send(fallback);

  // The letter's own link wins over the code's default page: the campaign's link
  // in LINK-2-QR (passed as ?to=) is what the letter told the reader they would see.
  const path = url.searchParams.has("to") ? fallbackPath : isSafePath(claimed.destination) ? claimed.destination : "/";
  const dest = new URL(path, url.origin);
  dest.searchParams.set("utm_source", claimed.source);
  dest.searchParams.set("utm_medium", claimed.medium);
  if (claimed.campaign) dest.searchParams.set("utm_campaign", claimed.campaign);
  dest.searchParams.set("vpv", claimed.code);

  if (visitorId) {
    await Promise.allSettled([
      touchVisitor(
        sb,
        visitorId,
        {
          source: claimed.source,
          medium: claimed.medium,
          campaign: claimed.campaign,
          code: claimed.code,
          referrer: headers.get("referer"),
          landingPath: path,
        },
        geo,
        // The page view after this redirect is the visit; do not count it twice.
        false
      ),
    ]);
    await setVisitorDevice(sb, visitorId, userAgent);
  }

  return send(dest);
}
