/**
 * GET /api/funnel/offer — is the special offer still open, and how many
 * places are left.
 *
 * The funnel shows the offer price only while this says it is open, so the
 * price a buyer sees on the plan and billing screens is the price the
 * order route will charge. Cached at the edge for a minute: the count
 * moves one payment at a time, and the order route re-checks it for real
 * before any card is charged.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { launchOfferState } from "@/lib/server/launchOffer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const state = await launchOfferState(supabaseAdmin());
  return NextResponse.json(
    { ok: true, ...state },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60" } }
  );
}
