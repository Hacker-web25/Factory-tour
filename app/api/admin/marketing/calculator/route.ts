/**
 * GET /api/admin/marketing/calculator — who played with the /why-vpv
 * calculator and how big their business is by their own numbers.
 * Platform owner only.
 *
 *   GET ?days=<n>   look back n days (default 90, at most 365)
 *
 * The page saves the visitor's numbers as `calculator_used` events a moment
 * after they stop moving a slider. This reads them back, one row per visitor,
 * biggest first, with a name and company where we know them. See
 * lib/calculatorReport.ts for what the numbers do and do not mean.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fail, json } from "@/lib/server/billingGuard";
import { ownerGuard } from "@/lib/server/ownerGuard";
import {
  calculatorReport,
  type CalcEventRow,
  type CalcLeadRow,
  type CalcPersonRow,
  type CalcVisitorRow,
} from "@/lib/calculatorReport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 20_000;
const IN_CHUNK = 150;

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

async function inChunks<T>(
  sb: SupabaseClient,
  table: string,
  cols: string,
  column: string,
  ids: string[]
): Promise<T[]> {
  const out: T[] = [];
  for (const group of chunks(ids, IN_CHUNK)) {
    const r = await sb.from(table).select(cols).in(column, group).limit(MAX_ROWS);
    if (r.error) throw new Error(r.error.message);
    out.push(...((r.data ?? []) as T[]));
  }
  return out;
}

export async function GET(req: Request) {
  const g = await ownerGuard(req);
  if ("error" in g) return g.error;
  const { sb } = g;

  const days = Math.max(1, Math.min(365, Math.round(Number(new URL(req.url).searchParams.get("days")) || 90)));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  try {
    const ev = await sb
      .from("site_events")
      .select("visitor_id, created_at, meta")
      .eq("name", "calculator_used")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS);
    if (ev.error) return fail(500, "read_failed", ev.error.message);
    const events = (ev.data ?? []) as CalcEventRow[];

    const ids = [...new Set(events.map((e) => e.visitor_id))];
    const [visitors, leads, people] = await Promise.all([
      inChunks<CalcVisitorRow>(sb, "site_visitors", "visitor_id, first_source, first_code, city", "visitor_id", ids),
      inChunks<CalcLeadRow>(
        sb,
        "funnel_leads",
        "visitor_id, name, company, phone, email, stage, factory_city",
        "visitor_id",
        ids
      ),
      (async () => {
        const r = await sb
          .from("campaign_codes")
          .select("code, person_name, person_company")
          .not("person_name", "is", null)
          .limit(MAX_ROWS);
        // Older databases without the personal-code columns: no names from QR, still a report.
        return r.error ? [] : ((r.data ?? []) as CalcPersonRow[]);
      })(),
    ]);

    const { rows, summary } = calculatorReport(events, visitors, leads, people);
    return json({ ok: true, days, rows: rows.slice(0, 500), summary, truncated: rows.length > 500 });
  } catch (e) {
    return fail(500, "read_failed", e instanceof Error ? e.message : "Could not read the report.");
  }
}
