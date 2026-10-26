/**
 * GET /api/admin/usage — how paying customers said they will use VPV.
 * Platform owner only.
 *
 * Response { ok, counts: { id, title, count }[], answered, rows: [...] }
 * Test-mode orders are included but marked, so a dry run is visible
 * without being mistaken for a customer.
 */

import { authenticateRequest } from "@/lib/server/requestAuth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, json } from "@/lib/server/billingGuard";
import { USAGE_OPTIONS } from "@/lib/purchaseUsage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UsageRow = { order_id: string; uses: string[]; other_text: string | null; updated_at: string };
type OrderRow = {
  id: string;
  buyer_company: string;
  buyer_name: string;
  buyer_email: string;
  amount_paise: number;
  paid_at: string | null;
  livemode: boolean;
};

export async function GET(req: Request) {
  const auth = await authenticateRequest(req);
  if (!auth) return fail(401, "unauthorized");
  if (auth.profile.role !== "owner") return fail(403, "forbidden", "Platform owner only.");
  const sb = supabaseAdmin();
  if (!sb) return fail(503, "not_configured", "SUPABASE_SERVICE_ROLE_KEY is not set.");

  const { data: usage, error } = await sb
    .from("order_usage")
    .select("order_id, uses, other_text, updated_at")
    .order("updated_at", { ascending: false })
    .limit(5000);
  if (error) {
    // Before supabase/purchase_usage.sql is run the table does not exist.
    if (/order_usage/.test(error.message) && /does not exist|schema cache/i.test(error.message)) {
      return json({ ok: true, needsMigration: true, counts: [], answered: 0, rows: [] });
    }
    return fail(500, "read_failed", error.message);
  }
  const usageRows = (usage ?? []) as UsageRow[];

  const ids = usageRows.map((u) => u.order_id);
  const orders = new Map<string, OrderRow>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb
      .from("billing_orders")
      .select("id, buyer_company, buyer_name, buyer_email, amount_paise, paid_at, livemode")
      .in("id", ids.slice(i, i + 200));
    for (const o of (data ?? []) as OrderRow[]) orders.set(o.id, o);
  }

  // Counts are for real customers only; test orders would skew them.
  const live = usageRows.filter((u) => orders.get(u.order_id)?.livemode !== false);
  const counts = USAGE_OPTIONS.map((o) => ({
    id: o.id,
    title: o.title,
    count: live.filter((u) => u.uses.includes(o.id)).length,
  }));

  return json({
    ok: true,
    answered: live.length,
    counts,
    rows: usageRows.map((u) => {
      const o = orders.get(u.order_id);
      return {
        orderId: u.order_id,
        company: o?.buyer_company ?? "—",
        name: o?.buyer_name ?? "",
        email: o?.buyer_email ?? "",
        amountPaise: o?.amount_paise ?? 0,
        paidAt: o?.paid_at ?? null,
        test: o?.livemode === false,
        uses: u.uses,
        other: u.other_text,
        answeredAt: u.updated_at,
      };
    }),
  });
}
