/**
 * GET /api/admin/marketing/buyers — what each person did after scanning the
 * QR made for them. Platform owner only.
 *
 *   GET ?batch=<name>   everyone in a batch (or every person code), with a
 *                       summary, ranked hottest first.
 *   GET ?code=<code>    one person's visit as a timeline.
 *
 * Reads are chunked: a PostgREST "in (...)" list travels in the URL, and a
 * batch of a thousand buyers would not fit in one.
 */

import { escapeLike, fail, json } from "@/lib/server/billingGuard";
import { ownerGuard, isMissingColumn, MIGRATION_HINT } from "@/lib/server/ownerGuard";
import { normaliseCode } from "@/lib/analytics/attribution";
import {
  buyerJourney,
  buyerReport,
  buyerSummary,
  type BuyerEventRow,
  type BuyerLeadRow,
  type BuyerScanRow,
  type BuyerVisitorRow,
  type PersonCodeRow,
} from "@/lib/buyerReport";
import type { OrderRow } from "@/lib/campaignReport";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 50_000;
const IN_CHUNK = 150;
const EVENT_NAMES = ["page_view", "page_time", "funnel_step"];

const PERSON_COLS = "code, person_name, person_company, campaign, created_at";
const EVENT_COLS = "visitor_id, session_id, name, path, created_at, meta";
const LEAD_COLS =
  "id, visitor_id, campaign_code, name, company, phone, email, stage, chosen_plan, recommended_plan, quoted_total_inr, factory_city, industry, order_id";

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

async function eventsFor(sb: SupabaseClient, visitorIds: string[]): Promise<BuyerEventRow[]> {
  const out: BuyerEventRow[] = [];
  for (const group of chunks(chunks(visitorIds, IN_CHUNK), 6)) {
    const parts = await Promise.all(
      group.map((ids) =>
        sb
          .from("site_events")
          .select(EVENT_COLS)
          .in("visitor_id", ids)
          .in("name", EVENT_NAMES)
          .order("created_at", { ascending: true })
          .limit(MAX_ROWS)
      )
    );
    for (const p of parts) {
      if (p.error) throw new Error(p.error.message);
      out.push(...((p.data ?? []) as BuyerEventRow[]));
    }
  }
  return out;
}

export async function GET(req: Request) {
  const g = await ownerGuard(req);
  if ("error" in g) return g.error;
  const { sb } = g;

  const url = new URL(req.url);
  const wantCode = normaliseCode(url.searchParams.get("code"));
  const batch = (url.searchParams.get("batch") ?? "").trim().slice(0, 120) || null;

  try {
    /* ───────────────────────── one person's timeline ─────────────────── */
    if (wantCode) {
      const person = await sb
        .from("campaign_codes")
        .select(PERSON_COLS)
        .ilike("code", escapeLike(wantCode))
        .not("person_name", "is", null)
        .maybeSingle();
      if (person.error) {
        if (isMissingColumn(person.error)) return fail(409, "migration_needed", MIGRATION_HINT);
        return fail(500, "read_failed", person.error.message);
      }
      if (!person.data) return fail(404, "not_found", "No person has that code.");
      const code = (person.data as PersonCodeRow).code;

      const [byFirst, byScan] = await Promise.all([
        sb.from("site_visitors").select("visitor_id").ilike("first_code", escapeLike(code)).limit(500),
        sb.from("campaign_scans").select("visitor_id").eq("code", code).limit(2000),
      ]);
      const ids = new Set<string>();
      for (const r of byFirst.data ?? []) ids.add((r as { visitor_id: string }).visitor_id);
      for (const r of byScan.data ?? []) {
        const v = (r as { visitor_id: string | null }).visitor_id;
        if (v) ids.add(v);
      }
      const events = ids.size ? await eventsFor(sb, [...ids]) : [];
      return json({ ok: true, person: person.data, journey: buyerJourney(events) });
    }

    /* ─────────────────────────── the whole batch ──────────────────────── */
    let q = sb
      .from("campaign_codes")
      .select(PERSON_COLS)
      .not("person_name", "is", null)
      .order("created_at", { ascending: false })
      .limit(20_000);
    if (batch) q = q.eq("campaign", batch);
    const peopleRes = await q;
    if (peopleRes.error) {
      if (isMissingColumn(peopleRes.error)) return fail(409, "migration_needed", MIGRATION_HINT);
      return fail(500, "read_failed", peopleRes.error.message);
    }
    const people = (peopleRes.data ?? []) as PersonCodeRow[];

    // Every batch name, for the picker (not narrowed by the selected batch).
    const allBatches = await sb
      .from("campaign_codes")
      .select("campaign")
      .not("person_name", "is", null)
      .limit(20_000);
    const batchCount = new Map<string, number>();
    for (const r of allBatches.data ?? []) {
      const c = (r as { campaign: string | null }).campaign ?? "(no batch)";
      batchCount.set(c, (batchCount.get(c) ?? 0) + 1);
    }
    const batches = [...batchCount.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!people.length) {
      return json({ ok: true, batches, rows: [], summary: buyerSummary([]) });
    }

    const codeSet = new Set(people.map((p) => p.code.toUpperCase()));

    const [visitorsRes, scansRes, ordersRes] = await Promise.all([
      sb
        .from("site_visitors")
        .select("visitor_id, first_code, first_seen_at, last_seen_at, city")
        .not("first_code", "is", null)
        .limit(MAX_ROWS),
      sb.from("campaign_scans").select("code, visitor_id, created_at").limit(MAX_ROWS),
      sb.from("billing_orders").select("id, amount_paise, status").eq("status", "paid").limit(MAX_ROWS),
    ]);
    const bad = [visitorsRes, scansRes, ordersRes].find((r) => r.error);
    if (bad?.error) return fail(500, "read_failed", bad.error.message);

    const visitors = ((visitorsRes.data ?? []) as BuyerVisitorRow[]).filter(
      (v) => v.first_code && codeSet.has(v.first_code.toUpperCase())
    );
    const scans = ((scansRes.data ?? []) as BuyerScanRow[]).filter((s) => codeSet.has(s.code.toUpperCase()));

    const ids = new Set<string>(visitors.map((v) => v.visitor_id));
    for (const s of scans) if (s.visitor_id) ids.add(s.visitor_id);
    const idList = [...ids];

    // Leads: anyone stamped with one of these codes, plus anyone whose
    // browser is one of these people's.
    const leadMap = new Map<string, BuyerLeadRow & { id: string }>();
    const stamped = await sb.from("funnel_leads").select(LEAD_COLS).not("campaign_code", "is", null).limit(MAX_ROWS);
    if (stamped.error) return fail(500, "read_failed", stamped.error.message);
    for (const l of (stamped.data ?? []) as (BuyerLeadRow & { id: string })[]) leadMap.set(l.id, l);
    for (const group of chunks(idList, IN_CHUNK)) {
      const r = await sb.from("funnel_leads").select(LEAD_COLS).in("visitor_id", group).limit(MAX_ROWS);
      if (r.error) return fail(500, "read_failed", r.error.message);
      for (const l of (r.data ?? []) as (BuyerLeadRow & { id: string })[]) leadMap.set(l.id, l);
    }

    const events = idList.length ? await eventsFor(sb, idList) : [];

    const rows = buyerReport({
      people,
      visitors,
      events,
      scans,
      leads: [...leadMap.values()],
      orders: (ordersRes.data ?? []) as OrderRow[],
    });

    return json({ ok: true, batches, rows, summary: buyerSummary(rows) });
  } catch (e) {
    return fail(500, "read_failed", e instanceof Error ? e.message : "Could not read the report.");
  }
}
