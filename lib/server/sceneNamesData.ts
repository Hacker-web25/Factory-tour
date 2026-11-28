/**
 * Loads the scene names behind /api/scene-names. SERVER ONLY.
 *
 * Kept apart from the route so it can be tested with pretend databases.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { aggregateNames, genericNames, type NameRow } from "@/lib/sceneNames";

/** A name or word is shared with other customers only when this many different customers use it. */
export const COMMON_MIN_OWNERS = 3;
const PAGE = 1000;
const MAX_ROWS_MINE = 20_000;
const MAX_ROWS_ALL = 60_000;
const MAX_MINE_NAMES = 4_000;
const MAX_COMMON = 2_000;
const MINE_CACHE_MS = 5 * 60_000;
const COMMON_CACHE_MS = 30 * 60_000;

export type Mine = { n: string; uses: number }[];
export type Common = { phrases: { n: string; owners: number }[]; words: { n: string; owners: number }[] };

const mineCache = new Map<string, { at: number; mine: Mine }>();
let commonCache: { at: number; common: Common } | null = null;

/** Test seam: forget what was cached. */
export function __resetSceneNameCacheForTests(): void {
  if (process.env.NODE_ENV !== "test") throw new Error("test_only");
  mineCache.clear();
  commonCache = null;
}

/** Reads a table a page at a time, so no single request is large. */
async function pages<T>(
  read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  max: number
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await read(from, from + PAGE - 1);
    if (error || !data) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

/** Each distinct name (ignoring capitals and spacing) with how many scenes use it, most used first. */
export function countNames(names: readonly (string | null)[]): Mine {
  const m = new Map<string, { n: string; uses: number }>();
  for (const raw of names) {
    const n = (raw ?? "").trim().replace(/\s+/g, " ");
    if (!n || n.length > 80) continue;
    const k = n.toLowerCase();
    const e = m.get(k);
    if (e) e.uses++;
    else m.set(k, { n, uses: 1 });
  }
  return [...m.values()].sort((a, b) => b.uses - a.uses || a.n.localeCompare(b.n)).slice(0, MAX_MINE_NAMES);
}

/** Every scene name the caller's own client can read (row-level security decides which). */
export async function loadMine(userId: string, sb: SupabaseClient): Promise<Mine> {
  const hit = mineCache.get(userId);
  if (hit && Date.now() - hit.at < MINE_CACHE_MS) return hit.mine;
  const rows = await pages<{ name: string | null }>(
    (a, b) => sb.from("scenes").select("name").order("id").range(a, b),
    MAX_ROWS_MINE
  );
  const mine = countNames(rows.map((r) => r.name));
  mineCache.set(userId, { at: Date.now(), mine });
  if (mineCache.size > 500) mineCache.delete(mineCache.keys().next().value as string);
  return mine;
}

/**
 * Names and words used by at least COMMON_MIN_OWNERS different customers.
 * Tours that belong to no customer are our own work: one owner between them,
 * so no customer can look like several.
 */
export async function loadCommon(admin: SupabaseClient | null): Promise<Common> {
  if (commonCache && Date.now() - commonCache.at < COMMON_CACHE_MS) return commonCache.common;
  if (!admin) return { phrases: [], words: [] };

  const tours = await pages<{ id: string; org_id: string | null }>(
    (a, b) => admin.from("tours").select("id, org_id").order("id").range(a, b),
    MAX_ROWS_ALL
  );
  const ownerOf = new Map(tours.map((t) => [t.id, t.org_id ?? "platform"]));
  const scenes = await pages<{ name: string | null; tour_id: string }>(
    (a, b) => admin.from("scenes").select("name, tour_id").order("id").range(a, b),
    MAX_ROWS_ALL
  );
  const rows: NameRow[] = [];
  for (const s of scenes) {
    const owner = ownerOf.get(s.tour_id);
    if (owner && s.name) rows.push({ name: s.name, owner });
  }
  const g = genericNames(aggregateNames(rows), COMMON_MIN_OWNERS);
  const common: Common = {
    phrases: g.phrases.slice(0, MAX_COMMON).map((x) => ({ n: x.n, owners: x.owners })),
    words: g.words.slice(0, MAX_COMMON).map((x) => ({ n: x.n, owners: x.owners })),
  };
  commonCache = { at: Date.now(), common };
  return common;
}
