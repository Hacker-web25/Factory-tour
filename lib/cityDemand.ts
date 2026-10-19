/**
 * lib/cityDemand.ts — where enquiries and orders are coming from, by city.
 *
 * The funnel's city picker only offers the cities we shoot in today; anyone
 * else types theirs. This turns the stored leads into one row per city —
 * how many companies asked, how many reached a price, how many paid — so
 * the next city to add is the one the numbers point at, not a guess.
 *
 * Pure, so it is tested without a database.
 */

import { cityKey, findCity, isServiceCity } from "@/lib/logistics";

export type CityDemandRow = {
  city: string;
  state: string | null;
  inServiceArea: boolean;
  /** Distinct companies (by e-mail) that named this city. */
  enquiries: number;
  /** …that went on to see a recommended plan. */
  reachedPlan: number;
  /** …that reached the bill. */
  reachedBilling: number;
  paid: number;
};

const AT_LEAST_PLAN = new Set(["plan", "sales", "billing", "paid"]);
const AT_LEAST_BILLING = new Set(["billing", "paid"]);

export function cityDemand(
  rows: { email: string | null; factory_city: string | null; factory_state?: string | null; stage: string | null }[]
): CityDemandRow[] {
  // One company counts once per city, at the furthest stage it reached.
  const RANK: Record<string, number> = { info: 0, scope: 1, security: 2, plan: 3, sales: 4, billing: 5, paid: 6 };
  const best = new Map<string, { cityKey: string; display: string; state: string | null; stage: string }>();
  rows.forEach((r, i) => {
    const raw = (r.factory_city ?? "").trim();
    if (!raw) return;
    const known = findCity(raw);
    const key = cityKey(known ? known.city : raw);
    const who = `${key}::${(r.email ?? "").trim().toLowerCase() || `anon-${i}`}`;
    const stage = r.stage ?? "info";
    const prev = best.get(who);
    if (!prev || (RANK[stage] ?? 0) > (RANK[prev.stage] ?? 0)) {
      best.set(who, {
        cityKey: key,
        display: known ? known.city : raw.replace(/\s+/g, " "),
        state: known?.state ?? r.factory_state ?? null,
        stage,
      });
    }
  });

  const out = new Map<string, CityDemandRow>();
  for (const v of best.values()) {
    const row =
      out.get(v.cityKey) ??
      {
        city: v.display,
        state: v.state,
        inServiceArea: isServiceCity(v.display),
        enquiries: 0,
        reachedPlan: 0,
        reachedBilling: 0,
        paid: 0,
      };
    row.enquiries++;
    if (AT_LEAST_PLAN.has(v.stage)) row.reachedPlan++;
    if (AT_LEAST_BILLING.has(v.stage)) row.reachedBilling++;
    if (v.stage === "paid") row.paid++;
    out.set(v.cityKey, row);
  }
  return [...out.values()].sort(
    (a, b) => b.paid - a.paid || b.reachedBilling - a.reachedBilling || b.enquiries - a.enquiries || a.city.localeCompare(b.city)
  );
}
