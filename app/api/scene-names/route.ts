/**
 * GET /api/scene-names — the names people give their scenes, so the name box
 * in the editor can finish what is being typed ("Lab" → "Laboratory").
 *
 * Two lists come back:
 *   • mine   — every scene name the caller can already see (their own
 *              workspace; our own team sees the whole platform, as in the
 *              editor itself), with how many times each is used. Read as the
 *              caller, so row-level security decides what is in it.
 *   • common — names and words used by at least three different customers,
 *              which is what lets a new account get good suggestions on day
 *              one. A name only one or two companies use ("Kilitch
 *              Reception", a product name) is never sent to anyone else.
 *              Tours that belong to no customer count as one owner, so a
 *              customer cannot be "three owners" by itself.
 *
 * Response { mine: {n, uses}[], common: { phrases: {n, owners}[], words: {n, owners}[] } }
 * Cached for each caller for a few minutes, and the common list for half an hour.
 */

import { authenticateRequest } from "@/lib/server/requestAuth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { loadCommon, loadMine, type Common } from "@/lib/server/sceneNamesData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "private, max-age=120" },
  });
}

export async function GET(req: Request) {
  const auth = await authenticateRequest(req);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const mine = await loadMine(auth.user.id, auth.sb);
  let common: Common = { phrases: [], words: [] };
  try {
    common = await loadCommon(supabaseAdmin());
  } catch {
    // The shared list is a bonus; the caller's own names still work without it.
  }
  return json({ mine, common });
}
