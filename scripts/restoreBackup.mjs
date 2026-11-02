#!/usr/bin/env node
/**
 * scripts/restoreBackup.mjs — read one nightly backup and show, or restore, its rows.
 *
 * This is a DISASTER-RECOVERY tool, run by hand from a developer machine or Vercel's
 * own shell — never by the app. See cloudflare/BACKUPS.md for when to reach for it.
 *
 * Usage:
 *   node scripts/restoreBackup.mjs list
 *       Lists every backup file in the private bucket (name, size, uploaded).
 *
 *   node scripts/restoreBackup.mjs inspect <filename> [table]
 *       Downloads one backup and prints how many rows each table has, or (with a
 *       table name) prints that table's rows as JSON — for looking something up
 *       without touching the live database at all.
 *
 *   node scripts/restoreBackup.mjs restore <filename> <table> [--really]
 *       Upserts one table's rows from the backup back into Supabase, matched on
 *       that table's primary key (so re-running is safe). Prints what it WOULD do
 *       and changes nothing unless --really is passed — restoring the wrong table
 *       over live data is exactly the kind of mistake this tool exists to undo,
 *       not cause.
 *
 * Needs, as environment variables (the same ones Vercel holds):
 *   BACKUP_BASE_URL, BACKUP_UPLOAD_SECRET   — the backup Worker
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — only for `restore`
 */
import { gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";

const [, , cmd, ...rest] = process.argv;

function need(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name} in the environment.`);
    process.exit(1);
  }
  return v;
}

function base() {
  return need("BACKUP_BASE_URL").replace(/\/+$/, "");
}
function headers() {
  return { authorization: `Bearer ${need("BACKUP_UPLOAD_SECRET")}` };
}

async function list() {
  const res = await fetch(`${base()}/`, { headers: headers() });
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  const { files } = await res.json();
  for (const f of files.sort((a, b) => a.key.localeCompare(b.key))) {
    console.log(`${f.key}\t${(f.size / 1024).toFixed(0)} KB\t${f.uploaded}`);
  }
  if (!files.length) console.log("(no backups yet)");
}

async function fetchBackup(filename) {
  const res = await fetch(`${base()}/${filename}`, { headers: headers() });
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const gz = Buffer.from(await res.arrayBuffer());
  return JSON.parse(gunzipSync(gz).toString("utf8"));
}

async function inspect(filename, table) {
  const backup = await fetchBackup(filename);
  if (!table) {
    console.log(`Taken: ${backup.takenAt}`);
    if (backup.warnings?.length) console.log(`Warnings:\n  ${backup.warnings.join("\n  ")}`);
    for (const [t, c] of Object.entries(backup.counts)) {
      console.log(`${t}\t${c.rows}${c.truncated ? "  (TRUNCATED)" : ""}`);
    }
    return;
  }
  if (!(table in backup.tables)) throw new Error(`No table "${table}" in this backup.`);
  console.log(JSON.stringify(backup.tables[table], null, 2));
}

async function restore(filename, table, really) {
  const backup = await fetchBackup(filename);
  if (!(table in backup.tables)) throw new Error(`No table "${table}" in this backup.`);
  const rows = backup.tables[table];
  console.log(`${filename} → ${table}: ${rows.length} rows (taken ${backup.takenAt})`);
  if (!really) {
    console.log("Dry run — nothing written. Re-run with --really to upsert these rows.");
    console.log(rows[0] ? `First row:\n${JSON.stringify(rows[0], null, 2)}` : "(table is empty)");
    return;
  }
  const sb = createClient(need("NEXT_PUBLIC_SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"));
  const CHUNK = 500;
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await sb.from(table).upsert(slice);
    if (error) throw new Error(`upsert failed at row ${i}: ${error.message}`);
    written += slice.length;
    console.log(`  ${written}/${rows.length}`);
  }
  console.log(`Restored ${written} rows into ${table}.`);
}

try {
  if (cmd === "list") await list();
  else if (cmd === "inspect") await inspect(rest[0], rest[1]);
  else if (cmd === "restore") await restore(rest[0], rest[1], rest.includes("--really"));
  else {
    console.log("Usage: restoreBackup.mjs list | inspect <file> [table] | restore <file> <table> [--really]");
    process.exit(1);
  }
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
