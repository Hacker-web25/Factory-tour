/**
 * /api/admin/marketing/folders — print runs, and how each one did.
 * Platform owner only.
 *
 *   GET   one row per folder: printed, delivered, scanned, enquiries, paid,
 *         revenue, and the rates that only exist once a printed count is
 *         recorded.
 *   POST  create a folder (a city, a batch, a trade show).
 *
 * Folders are never deleted, only archived — the codes inside them are
 * printed on paper that cannot be recalled, and deleting a folder would
 * take the history of a whole print run with it.
 */

import { clean, fail, json, readJson } from "@/lib/server/billingGuard";
import { ownerGuard, isMissingColumn } from "@/lib/server/ownerGuard";
import { isSafePath } from "@/lib/analytics/attribution";
import {
  folderOverview,
  folderSlug,
  isFolderChannel,
  type FolderCodeRow,
  type FolderLeadRow,
  type FolderRow,
} from "@/lib/campaignFolders";
import type { OrderRow } from "@/lib/campaignReport";
import {
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

const MAX_BODY_BYTES = 8 * 1024;

export async function GET(req: Request) {
  const g = await ownerGuard(req);
  if ("error" in g) return g.error;
  const { sb } = g;

  const folders = await sb
    .from("campaign_folders")
    .select(FOLDER_COLS)
    .order("created_at", { ascending: false })
    .limit(2_000);
  if (folders.error) {
    if (isMissingColumn(folders.error) || /campaign_folders/.test(folders.error.message)) {
      return json({ ok: true, needsMigration: true, hint: MIGRATION, folders: [] });
    }
    return fail(500, "read_failed", folders.error.message);
  }

  // Everything the rollup needs, and nothing it does not: no page events
  // here, so the list stays a handful of cheap reads however much has been
  // browsed. Paged, because one request returns at most ~1,000 rows.
  const codesQ = await pageAll<FolderCodeRow>((from, to) =>
    sb
      .from("campaign_codes")
      .select(CODE_COLS)
      .not("folder_id", "is", null)
      .order("code", { ascending: true })
      .range(from, to)
  );
  if (codesQ.error) {
    if (isMissingColumn(codesQ.error)) {
      return json({ ok: true, needsMigration: true, hint: MIGRATION, folders: [] });
    }
    return fail(500, "read_failed", codesQ.error.message);
  }

  const loaded = await loadCampaignBundle<FolderLeadRow, OrderRow>(
    sb,
    codesQ.rows.map((c) => c.code),
    { events: false, leadCols: LEAD_COLS_LIST, orderCols: ORDER_COLS_LIST }
  );
  if (!loaded.ok) {
    if (isMissingColumn(loaded.error)) {
      return json({ ok: true, needsMigration: true, hint: MIGRATION, folders: [] });
    }
    return fail(500, "read_failed", loaded.error.message);
  }

  const rows = folderOverview({
    folders: (folders.data ?? []) as FolderRow[],
    codes: codesQ.rows,
    scans: loaded.bundle.scans,
    leads: loaded.bundle.leads,
    orders: loaded.bundle.orders,
    visitors: loaded.bundle.visitors,
  });

  return json({ ok: true, folders: rows, truncated: loaded.bundle.truncated });
}

export async function POST(req: Request) {
  const g = await ownerGuard(req);
  if ("error" in g) return g.error;
  const { sb } = g;

  const read = await readJson(req, MAX_BODY_BYTES);
  if (!read.ok) return fail(read.status, read.error);
  const b = read.body;

  const name = clean(b.name, 120);
  if (!name) {
    return fail(400, "bad_name", "Name this run, for example “Gurugram — Oct 26, batch 1”.");
  }
  const slug = folderSlug(clean(b.slug, 60) || name);
  if (!slug) {
    return fail(400, "bad_slug", "That name has no letters or digits in it; give it a plainer one.");
  }

  const destination = clean(b.destination, 300) || "/";
  if (!isSafePath(destination)) {
    return fail(400, "bad_destination", "The destination must be a path on myvpv.com, like /plans.");
  }

  const channel = clean(b.channel, 30) || "pamphlet";
  if (!isFolderChannel(channel)) {
    return fail(400, "bad_channel", "Unknown channel.");
  }

  // The printed count is the denominator every rate in the report is
  // measured against. Optional, because it is often known only after the
  // press run — but the folder page keeps asking for it until it is set.
  let printed: number | null = null;
  if (b.printedCount !== undefined && b.printedCount !== null && b.printedCount !== "") {
    const n = Number(b.printedCount);
    if (!Number.isInteger(n) || n < 0 || n > 1_000_000) {
      return fail(400, "bad_printed", "How many were printed? A whole number, or leave it blank.");
    }
    printed = n;
  }

  let distributedAt: string | null = null;
  const when = clean(b.distributedAt, 20);
  if (when) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(when) || Number.isNaN(Date.parse(when))) {
      return fail(400, "bad_date", "The handed-out date must look like 2026-10-28.");
    }
    distributedAt = when;
  }

  const row = {
    slug,
    name,
    city: clean(b.city, 80) || null,
    state: clean(b.state, 80) || null,
    channel,
    destination,
    printed_count: printed,
    distributed_at: distributedAt,
    notes: clean(b.notes, 2_000) || null,
  };

  const { data, error } = await sb.from("campaign_folders").insert(row).select(FOLDER_COLS).single();
  if (error) {
    if (/duplicate key|unique/i.test(error.message)) {
      return fail(409, "slug_taken", `There is already a run called “${slug}”. Give this one a different name.`);
    }
    if (isMissingColumn(error) || /campaign_folders/.test(error.message)) {
      return fail(409, "migration_needed", MIGRATION);
    }
    return fail(500, "write_failed", error.message);
  }

  return json({ ok: true, folder: data });
}
