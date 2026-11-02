/**
 * lib/server/dbBackup.ts — read every row of every table, for the nightly backup. SERVER ONLY.
 *
 * Reads through the ordinary service-role Supabase client (PostgREST), not a direct
 * Postgres connection — the app has no database password, by design (supabaseAdmin.ts).
 * That means this is a logical, table-by-table copy of the DATA, not a `pg_dump` of the
 * database (no triggers, functions or exact column types). The schema itself is already
 * recoverable from the supabase/*.sql migrations in this repo, in order; restoring is
 * "re-run the migrations, then load this file's rows". See cloudflare/BACKUPS.md.
 *
 * A table a mistake or an outage could still be running during the dump may show a row
 * twice or miss one at a page boundary. That is an acceptable trade for a safety net
 * that needs no database downtime and no extra Supabase plan — it is not a point-in-time
 * snapshot, and is not sold as one.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { gzipSync } from "node:zlib";
import { BACKUP_TABLES } from "@/lib/server/backupTables";

const PAGE = 1000;
/** A single table this out of hand is still a bug worth knowing about, not a reason to
 *  stop backing up the other 40-odd tables. */
const MAX_ROWS_PER_TABLE = 300_000;

export type TableDump = { rows: number; truncated: boolean };
export type BackupResult = {
  takenAt: string;
  tables: Record<string, unknown[]>;
  counts: Record<string, TableDump>;
  /** A table that errored, or was cut short by the time budget. Never crashes the backup. */
  warnings: string[];
};

/** Every row of one table, oldest-inserted-looking order first where the table has a
 *  recognisable timestamp column, so a backup that is cut off by the time budget keeps
 *  the oldest (hardest to lose) rows rather than an arbitrary slice. */
async function dumpTable(
  sb: SupabaseClient,
  table: string,
  deadline: number
): Promise<{ rows: unknown[]; dump: TableDump; warning: string | null }> {
  const rows: unknown[] = [];
  let from = 0;
  for (;;) {
    if (Date.now() > deadline) {
      return { rows, dump: { rows: rows.length, truncated: true }, warning: `${table}: stopped early at ${rows.length} rows (time budget)` };
    }
    const { data, error } = await sb.from(table).select("*").range(from, from + PAGE - 1);
    if (error) {
      // A table in the list that no longer exists (or a migration not yet run — see
      // supabase/email_campaigns.sql) must not take the other tables down with it.
      return { rows, dump: { rows: rows.length, truncated: rows.length > 0 }, warning: `${table}: ${error.message}` };
    }
    const page = (data ?? []) as unknown[];
    rows.push(...page);
    if (page.length < PAGE || rows.length >= MAX_ROWS_PER_TABLE) {
      const truncated = rows.length >= MAX_ROWS_PER_TABLE && page.length === PAGE;
      return {
        rows,
        dump: { rows: rows.length, truncated },
        warning: truncated ? `${table}: stopped at ${MAX_ROWS_PER_TABLE} rows (table cap)` : null,
      };
    }
    from += PAGE;
  }
}

/** Every table in BACKUP_TABLES, within `budgetMs` overall. */
export async function buildBackup(sb: SupabaseClient, budgetMs: number): Promise<BackupResult> {
  const deadline = Date.now() + budgetMs;
  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, TableDump> = {};
  const warnings: string[] = [];
  for (const table of BACKUP_TABLES) {
    const { rows, dump, warning } = await dumpTable(sb, table, deadline);
    tables[table] = rows;
    counts[table] = dump;
    if (warning) warnings.push(warning);
  }
  return { takenAt: new Date().toISOString(), tables, counts, warnings };
}

/** The file this backup is written as: gzipped JSON, named by the minute it was taken. */
export function backupFilename(takenAt: string): string {
  return `backups/${takenAt.replace(/[:.]/g, "-")}.json.gz`;
}

export function gzipBackup(result: BackupResult): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(result)), { level: 6 });
}

/** True when every table came back with no error (truncation is not failure: it is
 *  recorded in `counts` and still a usable, if partial, backup of that table). */
export function backupHealthy(result: BackupResult): boolean {
  return !result.warnings.some((w) => !w.includes("(table cap)") && !w.includes("(time budget)"));
}
