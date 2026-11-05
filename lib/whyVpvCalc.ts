/**
 * lib/whyVpvCalc.ts — the arithmetic behind the /why-vpv calculator, in one
 * place, because two things must agree on it: the page that shows the
 * visitor their numbers, and the owner's report that says how big each
 * visitor's business is.
 *
 *   qualified leads a year × average business per lead = total opportunity
 *   × today's conversion                                = what they win
 *   the rest                                            = left on the table
 *   × the lift VPV could add (in points)                = what is won back
 *
 * Pure: no browser, no database.
 */

export type CalcInputs = {
  /** Qualified leads a year. */
  leads: number;
  /** Average yearly business per lead, in lakh rupees. */
  valueLakh: number;
  /** Conversion today, percent. */
  conv: number;
  /** Conversion lift with VPV, in percentage points. */
  lift: number;
};

/** The limits the page's boxes allow. Anything outside is somebody
 *  playing with the request, not a customer. */
export const CALC_LIMITS = {
  leads: { min: 1, max: 100_000 },
  valueLakh: { min: 0.1, max: 10_000 },
  conv: { min: 1, max: 95 },
  lift: { min: 1, max: 30 },
} as const;

export const CALC_DEFAULTS: CalcInputs = { leads: 120, valueLakh: 10, conv: 10, lift: 5 };

export type CalcField = keyof CalcInputs;

export type CalcFigures = {
  opportunity: number;
  won: number;
  lost: number;
  /** The lift actually applied: it cannot take conversion past 100%. */
  liftApplied: number;
  newConv: number;
  recovered: number;
};

export function calcFigures(i: CalcInputs): CalcFigures {
  const opportunity = i.leads * i.valueLakh * 1_00_000;
  const won = (opportunity * i.conv) / 100;
  const lost = opportunity - won;
  const liftApplied = Math.min(i.lift, 100 - i.conv);
  const newConv = i.conv + liftApplied;
  const recovered = (opportunity * liftApplied) / 100;
  return { opportunity, won, lost, liftApplied, newConv, recovered };
}

function pick(raw: unknown, f: CalcField): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const { min, max } = CALC_LIMITS[f];
  return raw >= min && raw <= max ? raw : null;
}

/**
 * Inputs read back from a stored event. Anything missing or out of range
 * makes the whole event unusable (null), so a forged request cannot skew the
 * owner's totals. The size is recomputed from these, never read from the
 * event, for the same reason.
 */
export function inputsFromMeta(meta: Record<string, unknown> | null | undefined): CalcInputs | null {
  if (!meta) return null;
  const leads = pick(meta.leads, "leads");
  const valueLakh = pick(meta.valueLakh, "valueLakh");
  const conv = pick(meta.conv, "conv");
  const lift = pick(meta.lift, "lift");
  if (leads === null || valueLakh === null || conv === null || lift === null) return null;
  return { leads, valueLakh, conv, lift };
}

/** What the page sends: flat, small, and only numbers and one short word. */
export function metaFromInputs(
  i: CalcInputs,
  extra: { field?: CalcField | null; saves?: number } = {}
): Record<string, number | string> {
  const f = calcFigures(i);
  const meta: Record<string, number | string> = {
    leads: i.leads,
    valueLakh: i.valueLakh,
    conv: i.conv,
    lift: i.lift,
    opportunity: Math.round(f.opportunity),
    recovered: Math.round(f.recovered),
  };
  if (extra.field) meta.field = extra.field;
  if (typeof extra.saves === "number") meta.saves = extra.saves;
  return meta;
}

/* ─────────────────────────── how big is the customer ────────────────────── */

export const SIZE_BANDS = [
  { key: "small", label: "Under ₹1 crore a year", below: 1_00_00_000 },
  { key: "mid", label: "₹1–10 crore", below: 10_00_00_000 },
  { key: "large", label: "₹10–50 crore", below: 50_00_00_000 },
  { key: "major", label: "₹50 crore and above", below: Infinity },
] as const;

export type SizeKey = (typeof SIZE_BANDS)[number]["key"];

/** The yearly business a visitor says passes through their leads. */
export function sizeBand(opportunityInr: number): (typeof SIZE_BANDS)[number] {
  for (const b of SIZE_BANDS) if (opportunityInr < b.below) return b;
  return SIZE_BANDS[SIZE_BANDS.length - 1]!;
}
