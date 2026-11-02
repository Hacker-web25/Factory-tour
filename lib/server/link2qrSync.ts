/**
 * lib/server/link2qrSync.ts — copy LINK-2-QR's scans into campaign_scans. SERVER ONLY.
 *
 * Runs when the campaign dashboard is opened (with a short time budget, so a
 * sleeping LINK-2-QR server never makes the dashboard hang) and from the
 * "Sync scans" button (long budget). Safe to run any number of times at once:
 * every scan's row id comes from (code, scan time), and rows are inserted with
 * "ignore duplicates", so nothing is ever counted twice or overwritten. A row the
 * bridge has already filled in (visitor, device, city) is left as it is.
 *
 * Only codes that exist in our campaign_codes are imported, i.e. people of
 * campaigns uploaded from a LINK-2-QR zip. Everything else is ignored.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LINK2QR_BASE,
  fetchCampaign,
  fetchCampaignIds,
  scanRowId,
  type L2qScan,
} from "@/lib/link2qr";

export type Link2QrSyncResult = {
  ok: boolean;
  /** New scan rows written by this run. */
  imported: number;
  /** Scans LINK-2-QR reported for codes we know. */
  matched: number;
  /** LINK-2-QR campaigns read. */
  campaigns: number;
  /** When LINK-2-QR was last read successfully (ms), from this server's memory. */
  at: number | null;
  error?: string;
};

const MIN_GAP_MS = 20_000;
let last: Link2QrSyncResult | null = null;
let lastRunAt = 0;
let inflight: Promise<Link2QrSyncResult> | null = null;

const CHUNK = 200;

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** Codes from `codes` that exist in campaign_codes. */
async function knownCodes(sb: SupabaseClient, codes: string[]): Promise<Set<string>> {
  const known = new Set<string>();
  for (const slice of chunks(codes, CHUNK)) {
    const { data, error } = await sb.from("campaign_codes").select("code").in("code", slice);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as { code: string }[]) known.add(r.code);
  }
  return known;
}

/** The earliest scan time we already hold per code, to set is_repeat right. */
async function firstScanAt(sb: SupabaseClient, codes: string[]): Promise<Map<string, number>> {
  const first = new Map<string, number>();
  for (const slice of chunks(codes, CHUNK)) {
    const { data, error } = await sb
      .from("campaign_scans")
      .select("code, created_at")
      .in("code", slice)
      .order("created_at", { ascending: true })
      .limit(5000);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as { code: string; created_at: string }[]) {
      const t = Date.parse(r.created_at);
      if (Number.isFinite(t) && !first.has(r.code)) first.set(r.code, t);
    }
  }
  return first;
}

/** The row an imported scan becomes. Exported for the bridge and the tests. */
export function importedScanRow(scan: L2qScan, isRepeat: boolean) {
  return {
    id: scanRowId(scan.code, scan.at),
    code: scan.code,
    created_at: new Date(scan.at).toISOString(),
    referrer: `${LINK2QR_BASE}/r/${scan.code}`,
    is_repeat: isRepeat,
  };
}

/** Write scans we know of; returns how many were new. */
export async function writeScans(sb: SupabaseClient, scans: L2qScan[]): Promise<{ imported: number; matched: number }> {
  if (!scans.length) return { imported: 0, matched: 0 };
  const codes = Array.from(new Set(scans.map((s) => s.code)));
  const known = await knownCodes(sb, codes);
  const mine = scans.filter((s) => known.has(s.code)).sort((a, b) => a.at - b.at);
  if (!mine.length) return { imported: 0, matched: 0 };

  const first = await firstScanAt(sb, Array.from(new Set(mine.map((s) => s.code))));
  const rows = mine.map((s) => {
    const earliestHeld = first.get(s.code);
    const firstOfCode = mine.find((m) => m.code === s.code)!.at;
    const earliest = earliestHeld === undefined ? firstOfCode : Math.min(earliestHeld, firstOfCode);
    return importedScanRow(s, s.at > earliest);
  });

  let imported = 0;
  for (const slice of chunks(rows, 500)) {
    const { data, error } = await sb
      .from("campaign_scans")
      .upsert(slice, { onConflict: "id", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(error.message);
    imported += (data ?? []).length;
  }
  return { imported, matched: mine.length };
}

async function run(sb: SupabaseClient, budgetMs: number): Promise<Link2QrSyncResult> {
  const deadline = Date.now() + budgetMs;
  const left = () => Math.max(1_000, deadline - Date.now());
  try {
    const ids = await fetchCampaignIds(left());
    const scans: L2qScan[] = [];
    let read = 0;
    // A few at a time: LINK-2-QR is a small server.
    for (const group of chunks(ids, 4)) {
      const got = await Promise.all(group.map((id) => fetchCampaign(id, left())));
      for (const c of got) {
        if (!c) continue;
        read++;
        scans.push(...c.scans);
      }
    }
    const { imported, matched } = await writeScans(sb, scans);
    return { ok: true, imported, matched, campaigns: read, at: Date.now() };
  } catch (e) {
    const message = e instanceof Error ? (e.name === "AbortError" ? "LINK-2-QR did not answer in time" : e.message) : "failed";
    return { ok: false, imported: 0, matched: 0, campaigns: 0, at: last?.at ?? null, error: message };
  }
}

/**
 * Bring campaign_scans up to date with LINK-2-QR. `budgetMs` caps the wait;
 * `force` skips the 20-second reuse of the last result.
 */
export async function syncLink2Qr(
  sb: SupabaseClient,
  opts: { budgetMs: number; force?: boolean }
): Promise<Link2QrSyncResult> {
  if (!opts.force && last && Date.now() - lastRunAt < MIN_GAP_MS) return last;
  if (inflight) return inflight;
  lastRunAt = Date.now();
  inflight = run(sb, opts.budgetMs)
    .then((r) => {
      last = r.ok ? r : { ...r, at: last?.at ?? null };
      return r;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
