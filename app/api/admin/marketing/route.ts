/**
 * /api/admin/marketing — the tracked-link registry and its results.
 * Platform owner only.
 *
 *   GET    the report: every code with scans, enquiries, bills and revenue,
 *          plus where all traffic came from.
 *   POST   create a code (what you print a QR of).
 *   PATCH  turn one off, or back on.
 *
 * Codes are never deleted, only archived. A printed pamphlet cannot be
 * recalled, so the code behind it has to keep resolving for years — and
 * deleting it would take its history with it.
 */

import { authenticateRequest } from "@/lib/server/requestAuth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { clean, fail, json, readJson } from "@/lib/server/billingGuard";
import { isMissingColumn } from "@/lib/server/ownerGuard";
import { isSafePath, normaliseCode } from "@/lib/analytics/attribution";
import {
  campaignReport,
  sourceReport,
  type CodeRow,
  type LeadRow,
  type OrderRow,
  type ScanRow,
} from "@/lib/campaignReport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4 * 1024;
const MAX_ROWS = 50_000;

async function owner(req: Request) {
  const auth = await authenticateRequest(req);
  if (!auth) return { error: fail(401, "unauthorized") } as const;
  if (auth.profile.role !== "owner") {
    return { error: fail(403, "forbidden", "Platform owner only.") } as const;
  }
  const sb = supabaseAdmin();
  if (!sb) {
    return { error: fail(503, "not_configured", "SUPABASE_SERVICE_ROLE_KEY is not set.") } as const;
  }
  return { sb } as const;
}

export async function GET(req: Request) {
  const g = await owner(req);
  if ("error" in g) return g.error;
  const { sb } = g;

  // Codes made for one person each live on the Buyers page; here they would
  // bury the handful of campaign codes under hundreds of rows. Before the
  // personal-codes migration is run the column does not exist, so ask without
  // the filter then.
  const CODE_COLS = "code, label, destination, source, medium, campaign, active, created_at";
  const campaignCodes = async () => {
    const r = await sb
      .from("campaign_codes")
      .select(CODE_COLS)
      .is("person_name", null)
      .order("created_at", { ascending: false });
    if (!isMissingColumn(r.error)) return r;
    return sb.from("campaign_codes").select(CODE_COLS).order("created_at", { ascending: false });
  };

  const [codes, scans, leads, orders, visitors] = await Promise.all([
    campaignCodes(),
    sb.from("campaign_scans").select("code, visitor_id").limit(MAX_ROWS),
    sb.from("funnel_leads").select("campaign_code, utm_source, utm_medium, stage, order_id").limit(MAX_ROWS),
    sb.from("billing_orders").select("id, amount_paise, status").eq("status", "paid").limit(MAX_ROWS),
    sb.from("site_visitors").select("first_source, first_medium").limit(MAX_ROWS),
  ]);

  const firstError = [codes, scans, leads, orders, visitors].find((r) => r.error);
  if (firstError?.error) return fail(500, "read_failed", firstError.error.message);

  const codeRows = (codes.data ?? []) as CodeRow[];
  const leadRows = (leads.data ?? []) as LeadRow[];
  const orderRows = (orders.data ?? []) as OrderRow[];

  return json({
    ok: true,
    campaigns: campaignReport({
      codes: codeRows,
      scans: (scans.data ?? []) as ScanRow[],
      leads: leadRows,
      orders: orderRows,
    }),
    sources: sourceReport({
      visitors: (visitors.data ?? []) as { first_source: string | null; first_medium: string | null }[],
      leads: leadRows,
      orders: orderRows,
    }),
  });
}

export async function POST(req: Request) {
  const g = await owner(req);
  if ("error" in g) return g.error;
  const { sb } = g;

  const read = await readJson(req, MAX_BODY_BYTES);
  if (!read.ok) return fail(read.status, read.error);
  const b = read.body;

  const code = normaliseCode(b.code);
  if (!code) {
    return fail(400, "bad_code", "Use 2–40 letters, numbers, dashes or underscores.");
  }
  const label = clean(b.label, 120);
  if (!label) return fail(400, "bad_label", "Give it a name you will recognise later.");

  const destination = clean(b.destination, 300) || "/";
  if (!isSafePath(destination)) {
    return fail(400, "bad_destination", "The destination must be a path on myvpv.com, like /plans.");
  }

  const row = {
    code,
    label,
    destination,
    source: clean(b.source, 60) || "pamphlet",
    medium: clean(b.medium, 60) || "qr",
    campaign: clean(b.campaign, 120) || null,
    notes: clean(b.notes, 400) || null,
  };

  const { error } = await sb.from("campaign_codes").insert(row);
  if (error) {
    // 23505 = unique violation: the code is already in use.
    if ((error as { code?: string }).code === "23505") {
      return fail(409, "code_taken", `The code "${code}" is already in use.`);
    }
    return fail(500, "write_failed", error.message);
  }
  return json({ ok: true, code, url: `https://myvpv.com/q/${code}` });
}

export async function PATCH(req: Request) {
  const g = await owner(req);
  if ("error" in g) return g.error;
  const { sb } = g;

  const read = await readJson(req, MAX_BODY_BYTES);
  if (!read.ok) return fail(read.status, read.error);

  const code = normaliseCode(read.body.code);
  if (!code) return fail(400, "bad_code");
  const active = read.body.active === true;

  const { error } = await sb
    .from("campaign_codes")
    .update({ active, archived_at: active ? null : new Date().toISOString() })
    .eq("code", code);
  if (error) return fail(500, "write_failed", error.message);
  return json({ ok: true, code, active });
}
