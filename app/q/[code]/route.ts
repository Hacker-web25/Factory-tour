/**
 * GET /q/<code> — the link behind every QR code printed so far.
 *
 * This is what the pamphlets and letters already in people's hands point at,
 * so it keeps working exactly as before. The work itself lives in
 * lib/server/scanRedirect.ts, shared with the new personal link /hi/<name>-<code>:
 * one lookup, redirect, then the bookkeeping after the visitor has gone.
 *
 * IT ALWAYS REDIRECTS. See scanRedirect.ts for why, and for why this runs on
 * the Edge runtime next to the database instead of as an ordinary function.
 */

import { scanRedirect } from "@/lib/server/scanRedirect";

// Edge: no cold start. A printed code is scanned a few times a day, which is
// the worst case for an ordinary serverless function: cold almost every time.
export const runtime = "edge";
export const dynamic = "force-dynamic";
// Next to the database (Supabase is in Seoul), so the one lookup that stands
// between the scan and the redirect takes milliseconds instead of a round trip
// across an ocean.
export const preferredRegion = "icn1";

export async function GET(req: Request, { params }: { params: { code: string } }) {
  return scanRedirect(req, [params.code]);
}
