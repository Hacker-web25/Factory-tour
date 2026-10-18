/**
 * GET /api/funnel/popular — which area and process tiles get a gold star.
 *
 * Until enough different companies have filled step 2, this answers with
 * our own "Must-show" recommendations; after that, with the tiles they
 * actually picked most. See rankPopular() in lib/factoryAreas.ts for the
 * rules. Only totals ever leave the server — never anyone's own choices.
 *
 * Cached at the edge for ten minutes: the ranking moves slowly, and the
 * page works perfectly well on a slightly older answer.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { rankPopular, CURATED_AREA_PICKS, CURATED_PROCESS_PICKS } from "@/lib/factoryAreas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sb = supabaseAdmin();
  let result: ReturnType<typeof rankPopular> = {
    phase: "curated",
    fills: 0,
    areaIds: CURATED_AREA_PICKS,
    processIds: CURATED_PROCESS_PICKS,
  };
  if (sb) {
    const { data, error } = await sb
      .from("funnel_leads")
      .select("email, areas, processes")
      .not("areas", "is", null)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) {
      // eslint-disable-next-line no-console
      console.warn("[funnel/popular] read failed, showing recommendations:", error.message);
    } else {
      result = rankPopular(data ?? []);
    }
  }
  // The raw count is not sent: the browser only needs to know which tiles
  // to star and which label to use.
  return NextResponse.json(
    { ok: true, phase: result.phase, areaIds: result.areaIds, processIds: result.processIds },
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=600" } }
  );
}
