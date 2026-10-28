/**
 * /api/admin/marketing/folders/<slug> — one print run, in full.
 * Platform owner only.
 *
 *   GET    the funnel from press to payment, every person, every signal.
 *   PATCH  record what the report cannot know by itself: how many were
 *          printed, when they went out, and which pieces actually reached
 *          a desk.
 *
 * The queries are scoped to this folder's codes and chunked, because `in`
 * lists travel in the URL: a folder of 2,000 codes would otherwise build a
 * request too long to send, and fail only in production.
 */

import { clean, fail, json, readJson } from "@/lib/server/billingGuard";
import { ownerGuard, isMissingColumn } from "@/lib/server/ownerGuard";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  folderDetail,
  isDeliveryState,
  type FolderCodeRow,
  type FolderLeadRow,
  type FolderRow,
} from "@/lib/campaignFolders";
import type { OrderRow } from "@/lib/campaignReport";
import {
  CHUNK,
  CODE_COLS,
  FOLDER_COLS,
  LEAD_COLS_LIST,
  MIGRATION_HINT as MIGRATION,
  ORDER_COLS_LIST,
  loadCampaignBundle,
  pageAll,
} from "@/lib/server/campaignQueries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;

async function loadFolder(sb: SupabaseClient, slug: string) {
  return sb.from("campaign_folders").select(FOLDER_COLS).eq("slug", slug).maybeSingle();
}

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const g = await ownerGuard(req);
  if ("error" in g) return g.error;
  const { sb } = g;

  const slug = clean(params.slug, 60);
  if (!slug) return fail(400, "bad_slug");

  const found = await loadFolder(sb, slug);
  if (found.error) {
    if (isMissingColumn(found.error) || /campaign_folders/.test(found.error.message)) {
      return fail(409, "migration_needed", MIGRATION);
    }
    return fail(500, "read_failed", found.error.message);
  }
  const folder = found.data as FolderRow | null;
  if (!folder) return fail(404, "not_found", "No campaign by that name.");

  const codesQ = await pageAll<FolderCodeRow>((from, to) =>
    sb
      .from("campaign_codes")
      .select(CODE_COLS)
      .eq("folder_id", folder.id)
      .order("code", { ascending: true })
      .range(from, to)
  );
  if (codesQ.error) {
    if (isMissingColumn(codesQ.error)) return fail(409, "migration_needed", MIGRATION);
    return fail(500, "read_failed", codesQ.error.message);
  }
  const codes = codesQ.rows;

  // A campaign with no codes yet is a real state, not an error: it has been
  // named and the codes are made next.
  if (!codes.length) {
    return json({
      ok: true,
      detail: folderDetail({ folder, codes: [], scans: [], visitors: [], events: [], leads: [], orders: [] }),
    });
  }

  const loaded = await loadCampaignBundle<FolderLeadRow, OrderRow>(
    sb,
    codes.map((c) => c.code),
    { events: true, leadCols: LEAD_COLS_LIST, orderCols: ORDER_COLS_LIST }
  );
  if (!loaded.ok) return fail(500, "read_failed", loaded.error.message);
  const { scans, visitors, events, leads, orders, truncated } = loaded.bundle;

  return json({
    ok: true,
    truncated,
    detail: folderDetail({ folder, codes, scans, visitors, events, leads, orders }),
  });
}

export async function PATCH(req: Request, { params }: { params: { slug: string } }) {
  const g = await ownerGuard(req);
  if ("error" in g) return g.error;
  const { sb } = g;

  const slug = clean(params.slug, 60);
  if (!slug) return fail(400, "bad_slug");

  const read = await readJson(req, MAX_BODY_BYTES);
  if (!read.ok) return fail(read.status, read.error);
  const b = read.body;

  const found = await loadFolder(sb, slug);
  if (found.error) return fail(500, "read_failed", found.error.message);
  const folder = found.data as FolderRow | null;
  if (!folder) return fail(404, "not_found", "No print run by that name.");

  /* ── the folder itself ──────────────────────────────────────────────── */
  const patch: Record<string, unknown> = {};

  if (b.printedCount !== undefined) {
    if (b.printedCount === null || b.printedCount === "") {
      patch.printed_count = null;
    } else {
      const n = Number(b.printedCount);
      if (!Number.isInteger(n) || n < 0 || n > 1_000_000) {
        return fail(400, "bad_printed", "How many were printed? A whole number, or leave it blank.");
      }
      patch.printed_count = n;
    }
  }
  if (b.distributedAt !== undefined) {
    const when = clean(b.distributedAt, 20);
    if (!when) patch.distributed_at = null;
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(when) || Number.isNaN(Date.parse(when))) {
      return fail(400, "bad_date", "The handed-out date must look like 2026-10-28.");
    } else patch.distributed_at = when;
  }
  if (b.notes !== undefined) patch.notes = clean(b.notes, 2_000) || null;
  if (b.city !== undefined) patch.city = clean(b.city, 80) || null;
  if (typeof b.active === "boolean") patch.active = b.active;
  if (b.active === false) patch.archived_at = new Date().toISOString();

  if (Object.keys(patch).length) {
    const { error } = await sb.from("campaign_folders").update(patch).eq("id", folder.id);
    if (error) return fail(500, "write_failed", error.message);
  }

  /* ── which pieces reached a desk ────────────────────────────────────────
     Recorded by hand, by whoever handed them out, and never inferred from a
     scan: if a scan set it, the delivered count could not be lower than the
     scanned count and the step would always read 100% — a number that looks
     like information and is not. */
  let codesUpdated = 0;
  if (b.delivery !== undefined) {
    const state = clean((b.delivery as { state?: unknown })?.state, 20);
    if (!isDeliveryState(state)) {
      return fail(400, "bad_state", "Unknown delivery state.");
    }
    const raw = (b.delivery as { codes?: unknown }).codes;
    const all = (b.delivery as { all?: unknown }).all === true;

    const stamp = state === "delivered" ? new Date().toISOString() : null;
    const update = { delivery_state: state, delivered_at: stamp };

    if (all) {
      const { error, count } = await sb
        .from("campaign_codes")
        .update(update, { count: "exact" })
        .eq("folder_id", folder.id);
      if (error) return fail(500, "write_failed", error.message);
      codesUpdated = count ?? 0;
    } else {
      const list = Array.isArray(raw)
        ? raw.map((c) => clean(c, 48)).filter((c): c is string => !!c).slice(0, 5_000)
        : [];
      if (!list.length) return fail(400, "no_codes", "Which pieces? Send a list of codes, or all: true.");
      for (let i = 0; i < list.length; i += CHUNK) {
        const { error, count } = await sb
          .from("campaign_codes")
          .update(update, { count: "exact" })
          .eq("folder_id", folder.id)
          .in("code", list.slice(i, i + CHUNK));
        if (error) return fail(500, "write_failed", error.message);
        codesUpdated += count ?? 0;
      }
    }
  }

  const after = await loadFolder(sb, slug);
  return json({ ok: true, folder: after.data, codesUpdated });
}
