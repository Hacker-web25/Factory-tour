/**
 * lib/calculatorReport.ts — who played with the /why-vpv calculator, and how
 * big their business is by their own numbers.
 *
 *   Acme Pumps · Gurugram   ₹12 crore a year   120 leads × ₹10 lakh, 10% conv.
 *                           moved the sliders 14 times over 3 min
 *
 * The page saves the numbers a moment after the visitor stops moving a
 * slider (an autosave), as `calculator_used` events. This turns those events
 * into one row per visitor, ranked by the size they typed, with the name and
 * company attached whenever we know them: from a personal QR code, or from
 * the enquiry form they filled in later.
 *
 * WHAT IT IS AND IS NOT. These are numbers a visitor typed into a
 * calculator. They show how big they say the business is, and how seriously
 * they played with it; they are not a verified revenue. The default values
 * (120 leads, ₹10 lakh, 10%, 5 points) are skipped when they are all that was
 * ever saved, so a visitor who never moved anything does not appear as a
 * ₹12 crore customer.
 *
 * Pure: rows in, a report out. Tested without a database.
 */

import {
  CALC_DEFAULTS,
  calcFigures,
  inputsFromMeta,
  sizeBand,
  SIZE_BANDS,
  type CalcInputs,
  type SizeKey,
} from "@/lib/whyVpvCalc";

export type CalcEventRow = {
  visitor_id: string;
  created_at: string;
  meta: Record<string, unknown> | null;
};

export type CalcVisitorRow = {
  visitor_id: string;
  first_source: string | null;
  first_code: string | null;
  city: string | null;
  device?: string | null;
};

export type CalcLeadRow = {
  visitor_id: string | null;
  name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  stage: string | null;
  factory_city: string | null;
};

export type CalcPersonRow = {
  code: string;
  person_name: string | null;
  person_company: string | null;
};

export type CalcRow = {
  visitorId: string;
  /** Best name we have, or null for an anonymous visitor. */
  name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  /** How we know who they are. */
  knownFrom: "enquiry" | "qr" | null;
  city: string | null;
  source: string | null;
  stage: string | null;
  /** The numbers they ended on. */
  inputs: CalcInputs;
  opportunity: number;
  recovered: number;
  band: SizeKey;
  /** Times the numbers were saved (each is a pause after moving a slider). */
  saves: number;
  firstAt: string;
  lastAt: string;
  /** Seconds between their first and last save, as a measure of how long they played. */
  playedSeconds: number;
};

export type CalcSummary = {
  visitors: number;
  /** Visitors we can put a name to. */
  identified: number;
  /** Median opportunity, rupees; 0 when nobody. */
  medianOpportunity: number;
  /** Sum of the opportunity everybody typed. */
  totalOpportunity: number;
  bands: { key: SizeKey; label: string; count: number }[];
};

const ms = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

function isDefault(i: CalcInputs): boolean {
  return (
    i.leads === CALC_DEFAULTS.leads &&
    i.valueLakh === CALC_DEFAULTS.valueLakh &&
    i.conv === CALC_DEFAULTS.conv &&
    i.lift === CALC_DEFAULTS.lift
  );
}

export function calculatorReport(
  events: CalcEventRow[],
  visitors: CalcVisitorRow[],
  leads: CalcLeadRow[],
  people: CalcPersonRow[]
): { rows: CalcRow[]; summary: CalcSummary } {
  const vById = new Map(visitors.map((v) => [v.visitor_id, v]));
  const personByCode = new Map(people.map((p) => [p.code.toLowerCase(), p]));

  // The most advanced enquiry per visitor (they may have started two).
  const leadByVisitor = new Map<string, CalcLeadRow>();
  for (const l of leads) {
    if (!l.visitor_id) continue;
    const prev = leadByVisitor.get(l.visitor_id);
    if (!prev || (!prev.name && l.name) || (!prev.phone && l.phone)) leadByVisitor.set(l.visitor_id, l);
  }

  const byVisitor = new Map<string, { at: number; iso: string; inputs: CalcInputs }[]>();
  for (const e of events) {
    const inputs = inputsFromMeta(e.meta);
    if (!inputs) continue;
    const list = byVisitor.get(e.visitor_id) ?? [];
    list.push({ at: ms(e.created_at), iso: e.created_at, inputs });
    byVisitor.set(e.visitor_id, list);
  }

  const rows: CalcRow[] = [];
  for (const [visitorId, list] of byVisitor) {
    list.sort((a, b) => a.at - b.at);
    // Never moved anything: the page's own starting numbers are not a signal.
    if (list.every((x) => isDefault(x.inputs))) continue;

    const first = list[0]!;
    const last = list[list.length - 1]!;
    const fig = calcFigures(last.inputs);
    const v = vById.get(visitorId);
    const lead = leadByVisitor.get(visitorId);
    const person = v?.first_code ? personByCode.get(v.first_code.toLowerCase()) : undefined;

    const enquiryName = lead?.name?.trim() || null;
    const qrName = person?.person_name?.trim() || null;
    rows.push({
      visitorId,
      name: enquiryName ?? qrName,
      company: lead?.company?.trim() || person?.person_company?.trim() || null,
      phone: lead?.phone ?? null,
      email: lead?.email ?? null,
      knownFrom: enquiryName ? "enquiry" : qrName ? "qr" : null,
      city: lead?.factory_city || v?.city || null,
      source: v?.first_code ? `QR ${v.first_code}` : v?.first_source ?? null,
      stage: lead?.stage ?? null,
      inputs: last.inputs,
      opportunity: Math.round(fig.opportunity),
      recovered: Math.round(fig.recovered),
      band: sizeBand(fig.opportunity).key,
      saves: list.length,
      firstAt: first.iso,
      lastAt: last.iso,
      playedSeconds: Math.max(0, Math.round((last.at - first.at) / 1000)),
    });
  }

  // Biggest first; ties go to whoever was here most recently.
  rows.sort((a, b) => b.opportunity - a.opportunity || ms(b.lastAt) - ms(a.lastAt));

  const sizes = rows.map((r) => r.opportunity).sort((a, b) => a - b);
  const mid = Math.floor(sizes.length / 2);
  const median = !sizes.length ? 0 : sizes.length % 2 ? sizes[mid]! : Math.round((sizes[mid - 1]! + sizes[mid]!) / 2);

  return {
    rows,
    summary: {
      visitors: rows.length,
      identified: rows.filter((r) => r.knownFrom).length,
      medianOpportunity: median,
      totalOpportunity: sizes.reduce((s, n) => s + n, 0),
      bands: SIZE_BANDS.map((b) => ({
        key: b.key,
        label: b.label,
        count: rows.filter((r) => r.band === b.key).length,
      })),
    },
  };
}
