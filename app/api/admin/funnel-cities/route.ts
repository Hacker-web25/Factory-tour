/**
 * GET /api/admin/funnel-cities — enquiries and orders by factory city.
 * Platform owner only. See lib/cityDemand.ts for how rows are counted.
 */

import { authenticateRequest } from "@/lib/server/requestAuth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, json } from "@/lib/server/billingGuard";
import { cityDemand } from "@/lib/cityDemand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await authenticateRequest(req);
  if (!auth) return fail(401, "unauthorized");
  if (auth.profile.role !== "owner") return fail(403, "forbidden", "Platform owner only.");
  const sb = supabaseAdmin();
  if (!sb) return fail(503, "not_configured", "SUPABASE_SERVICE_ROLE_KEY is not set.");

  const { data, error } = await sb
    .from("funnel_leads")
    .select("email, factory_city, factory_state, stage")
    .not("factory_city", "is", null)
    .order("created_at", { ascending: false })
    .limit(10000);
  if (error) return fail(500, "read_failed", error.message);
  return json({ ok: true, rows: cityDemand(data ?? []) });
}
