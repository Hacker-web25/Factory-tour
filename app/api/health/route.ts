/**
 * GET /api/health — public uptime / status endpoint.
 *
 * Returns a tiny JSON blob you can point an uptime monitor at
 * (BetterStack, UptimeRobot, Pingdom, Vercel's own analytics).
 *
 * Deliberately boring: no DB roundtrip, no auth. The point is to
 * confirm the edge is reachable + the deployment is live, not to
 * do a deep health probe. For a deep probe, call this and then
 * query a public read on Supabase from the monitor directly.
 */

import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: "vpv",
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
      time: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
