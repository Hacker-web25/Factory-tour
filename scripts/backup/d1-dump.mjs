#!/usr/bin/env node
/**
 * Saves the subtitles and translations (the Cloudflare D1 database "vpv-language")
 * to one SQL file that can rebuild the database from nothing.
 *
 * It reads through the language Worker's read-only GET /backup route, using the
 * separate BACKUP_SECRET. That secret cannot translate, transcribe, change or
 * delete anything, so putting it in the nightly job is low risk.
 *
 *   LANGUAGE_API_URL=https://vpv-language.<you>.workers.dev \
 *   BACKUP_SECRET=...                                         \
 *   node scripts/backup/d1-dump.mjs --out vpv-language.sql.gz --summary d1-summary.json
 *
 * The file is plain SQL (CREATE TABLE IF NOT EXISTS + INSERT OR REPLACE), so it
 * restores with:   npx wrangler d1 execute vpv-language --remote --file=vpv-language.sql
 * Cloudflare refuses any single SQL statement over 100 KB, so a long text value
 * (a very long transcript) is written as a short INSERT followed by UPDATEs that
 * append the rest in pieces. Every statement stays well under the limit.
 */
import { gzipSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
// 20,000 characters is at most 80 KB even if every character takes 4 bytes.
export const CHUNK_CHARS = 20_000;

export class DumpError extends Error {}

/** One SQL string literal. A NUL character cannot sit inside a SQLite literal, so it is spliced in with char(0). */
export function quote(text) {
  return text
    .split("\u0000")
    .map((part) => `'${part.replace(/'/g, "''")}'`)
    .join("||char(0)||");
}

function literal(v, where) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new DumpError(`${where}: a number that is not finite`);
    return String(v);
  }
  if (typeof v === "string") return quote(v);
  throw new DumpError(`${where}: a value of type ${typeof v} cannot be written as SQL`);
}

/** The statements that recreate one row. Long text is appended in pieces. */
export function rowStatements(table, key, row) {
  if (!IDENT.test(table)) throw new DumpError(`bad table name ${table}`);
  const cols = Object.keys(row);
  for (const c of cols) if (!IDENT.test(c)) throw new DumpError(`${table}: bad column name ${c}`);
  for (const k of key) {
    if (typeof row[k] !== "string" || row[k].length > 1000) throw new DumpError(`${table}: key column ${k} is missing or too long`);
  }
  const first = [];
  const rest = []; // [column, remaining pieces]
  for (const c of cols) {
    const v = row[c];
    if (typeof v === "string" && v.length > CHUNK_CHARS && !key.includes(c)) {
      const pieces = [];
      let i = 0;
      while (i < v.length) {
        let end = Math.min(i + CHUNK_CHARS, v.length);
        // Never cut a surrogate pair (an emoji, say) in half.
        if (end < v.length && v.charCodeAt(end - 1) >= 0xd800 && v.charCodeAt(end - 1) <= 0xdbff) end += 1;
        pieces.push(v.slice(i, end));
        i = end;
      }
      first.push(quote(pieces[0]));
      rest.push([c, pieces.slice(1)]);
    } else {
      first.push(literal(v, `${table}.${c}`));
    }
  }
  const out = [`INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${first.join(", ")});`];
  const where = key.map((k) => `${k} = ${quote(row[k])}`).join(" AND ");
  for (const [c, pieces] of rest) {
    for (const p of pieces) out.push(`UPDATE ${table} SET ${c} = ${c} || ${quote(p)} WHERE ${where};`);
  }
  return out;
}

export function createStatement(sql) {
  if (typeof sql !== "string" || !/^\s*CREATE TABLE\s/i.test(sql)) throw new DumpError("the Worker did not return a CREATE TABLE statement");
  return sql.replace(/^\s*CREATE TABLE\s+(IF NOT EXISTS\s+)?/i, "CREATE TABLE IF NOT EXISTS ").trim().replace(/;?$/, ";");
}

async function getJson(fetchImpl, url, secret, sleep, attempts = 4) {
  let lastError = "";
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(1000 * 2 ** (i - 1));
    let res;
    try {
      res = await fetchImpl(url, { headers: { authorization: `Bearer ${secret}` } });
    } catch (e) {
      lastError = `network error: ${e && e.message ? e.message : e}`;
      continue;
    }
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* not JSON: handled below */
    }
    if (res.status === 401) throw new DumpError("401 unauthorized: BACKUP_SECRET does not match the Worker's BACKUP_SECRET");
    if (res.status === 503 && body && body.error === "not_configured") throw new DumpError("503 not_configured: add the BACKUP_SECRET secret to the language Worker");
    if (res.status === 404) throw new DumpError("404: the language Worker is the old version and has no /backup route. Paste the new cloudflare/language-worker.js into it");
    if (res.status === 429 || res.status >= 500) {
      lastError = `HTTP ${res.status}`;
      continue;
    }
    if (!body) throw new DumpError(`HTTP ${res.status}: the answer was not JSON`);
    if (!res.ok || body.ok !== true) throw new DumpError(`HTTP ${res.status}: ${body.error || "failed"}`);
    return body;
  }
  throw new DumpError(`gave up after ${attempts} tries (${lastError})`);
}

/**
 * Reads every row of every table.
 * @returns {{statements: string[], counts: Record<string, number>, sql: string}}
 */
export async function dumpD1({ baseUrl, secret, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => new Date() }) {
  if (!baseUrl || !/^https?:\/\//.test(baseUrl)) throw new DumpError("LANGUAGE_API_URL is missing or is not a web address");
  if (!secret || secret.length < 24) throw new DumpError("BACKUP_SECRET is missing or shorter than 24 characters");
  const base = baseUrl.replace(/\/+$/, "");

  const index = await getJson(fetchImpl, `${base}/backup`, secret, sleep);
  const names = Object.keys(index.tables || {});
  if (names.length === 0) throw new DumpError("the Worker listed no tables");

  const statements = [];
  const counts = {};
  const startedAt = now().toISOString();

  for (const name of names) {
    const meta = index.tables[name];
    if (!IDENT.test(name) || !Array.isArray(meta.key) || meta.key.length === 0) throw new DumpError(`bad table description for ${name}`);
    statements.push(createStatement(meta.create_sql));
    let n = 0;
    let after = null;
    const seen = new Set();
    for (let page = 0; ; page++) {
      if (page > 100_000) throw new DumpError(`${name}: more than 100,000 pages, something is wrong`);
      const q = new URLSearchParams({ table: name });
      if (after) q.set("after", JSON.stringify(after));
      const body = await getJson(fetchImpl, `${base}/backup?${q}`, secret, sleep);
      if (!Array.isArray(body.rows)) throw new DumpError(`${name}: the Worker sent no rows array`);
      for (const row of body.rows) {
        const id = meta.key.map((k) => row[k]).join("\u0001");
        if (seen.has(id)) throw new DumpError(`${name}: the same row came twice, paging is broken`);
        seen.add(id);
        statements.push(...rowStatements(name, meta.key, row));
        n++;
      }
      if (!body.next) break;
      if (body.rows.length === 0) throw new DumpError(`${name}: the Worker said there is more but sent no rows`);
      after = body.next;
    }
    counts[name] = n;
  }

  // Rows can legitimately be added or removed while we read. Anything outside the
  // range between the count before and the count after means rows were missed.
  const after = await getJson(fetchImpl, `${base}/backup`, secret, sleep);
  for (const name of names) {
    const lo = Math.min(index.tables[name].count, after.tables[name].count);
    const hi = Math.max(index.tables[name].count, after.tables[name].count);
    if (counts[name] < lo || counts[name] > hi) {
      throw new DumpError(`${name}: read ${counts[name]} rows but the table held ${index.tables[name].count} before and ${after.tables[name].count} after`);
    }
  }

  const header = `-- VPV language database backup\n-- taken ${startedAt}\n-- rows: ${names.map((n) => `${n}=${counts[n]}`).join(", ")}\n-- restore: npx wrangler d1 execute vpv-language --remote --file=<this file>\n`;
  return { statements, counts, sql: `${header}${statements.join("\n")}\n`, startedAt };
}

/* ───────────────────────────── command line ────────────────────────── */

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const out = arg("--out");
  const summary = arg("--summary");
  if (!out) throw new DumpError("usage: d1-dump.mjs --out <file.sql.gz> [--summary <file.json>]");
  const result = await dumpD1({ baseUrl: process.env.LANGUAGE_API_URL, secret: process.env.BACKUP_SECRET });
  const gz = gzipSync(Buffer.from(result.sql, "utf8"));
  writeFileSync(out, gz);
  if (summary) writeFileSync(summary, JSON.stringify({ takenAt: result.startedAt, counts: result.counts, sqlBytes: Buffer.byteLength(result.sql), gzBytes: gz.length }, null, 2) + "\n");
  const total = Object.values(result.counts).reduce((a, b) => a + b, 0);
  console.log(`D1 backup: ${total} rows (${Object.entries(result.counts).map(([k, v]) => `${k}=${v}`).join(", ")}), ${gz.length} bytes gzipped`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`D1 backup failed: ${e && e.message ? e.message : e}`);
    process.exit(1);
  });
}
