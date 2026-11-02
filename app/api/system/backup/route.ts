/**
 * GET /api/system/backup — the nightly database backup, run by Vercel Cron.
 *
 * Supabase Free has no automatic backups (security-review-2026-10.md §5). This is
 * the stand-in until the project is on a paid plan: every table in
 * lib/server/backupTables.ts, read through the service-role client (there is no
 * database password to run a real `pg_dump` with — see lib/server/dbBackup.ts),
 * gzipped, and written to a private Cloudflare R2 bucket through its own Worker
 * (cloudflare/backup-worker.js). The oldest backups beyond KEEP are then deleted.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`, the same secret
 * /api/billing/reconcile checks. Anyone else gets a 401.
 *
 * Never throws past its own try/catch: a cron job that merely fails quietly
 * tonight is a backup nobody notices is missing until the day it is needed. If
 * the Worker is not set up yet, or a backup does not look right, this writes a
 * row to billing_alerts and e-mails the owner the same way a payment problem
 * would (alertFounders) — it does not fail the HTTP call Vercel Cron is polling,
 * because a 5xx there does not reach a human either.
 */

import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { buildBackup, backupFilename, gzipBackup, backupHealthy } from "@/lib/server/dbBackup";
import { backupStoreConfigured, putBackup, listBackups, deleteBackup, backupsToPrune } from "@/lib/server/backupStore";
import { alertFounders } from "@/lib/server/billingEmails";
import { json, fail, safeEqualSecret } from "@/lib/server/billingGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 290;

/** Nightly backups kept, at a clean month-plus of daily history. */
const KEEP = 35;
/** Leaves time to gzip, upload and prune within maxDuration. */
const DUMP_BUDGET_MS = 230_000;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const secret = process.env.CRON_SECRET || "";
  if (!secret || !(await safeEqualSecret(token, secret))) return fail(401, "unauthorized");

  const sb = supabaseAdmin();
  if (!sb) return fail(500, "not_configured", "No service-role key.");

  if (!backupStoreConfigured()) {
    await alertFounders(sb, {
      kind: "backup_not_configured",
      severity: "warning",
      detail: "The nightly database backup has no place to write to yet: BACKUP_BASE_URL / BACKUP_UPLOAD_SECRET are not set in Vercel. See cloudflare/BACKUPS.md.",
    });
    return json({ ok: true, skipped: true, reason: "not_configured" });
  }

  const result = await buildBackup(sb, DUMP_BUDGET_MS);
  const healthy = backupHealthy(result);
  const filename = backupFilename(result.takenAt);
  const gz = gzipBackup(result);

  const upload = await putBackup(filename, gz);
  if (!upload.ok) {
    await alertFounders(sb, {
      kind: "backup_upload_failed",
      severity: "critical",
      detail: `Tonight's backup (${filename}, ${gz.length} bytes) could not be uploaded: ${upload.reason}`,
    });
    return fail(502, "upload_failed", upload.reason);
  }

  if (!healthy) {
    await alertFounders(sb, {
      kind: "backup_incomplete",
      severity: "warning",
      detail: `Tonight's backup (${filename}) uploaded, but was not clean: ${result.warnings.join("; ")}`,
    });
  }

  let pruned: string[] = [];
  const listed = await listBackups();
  if (listed.ok) {
    pruned = backupsToPrune(listed.files, KEEP);
    for (const key of pruned) await deleteBackup(key);
  }

  return json({
    ok: true,
    filename,
    bytes: gz.length,
    tables: Object.keys(result.counts).length,
    rows: Object.values(result.counts).reduce((n, c) => n + c.rows, 0),
    warnings: result.warnings,
    pruned: pruned.length,
  });
}
