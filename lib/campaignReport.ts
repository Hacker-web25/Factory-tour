/**
 * lib/campaignReport.ts — turn raw analytics rows into the one table the
 * owner actually wants to look at:
 *
 *     Gurugram pamphlet · 240 scans · 180 people · 44 enquiries · 12 bills · 3 paid · ₹3.4L
 *
 * Pure and dependency-free, like lib/cityDemand.ts, so the whole funnel
 * can be tested without a database.
 *
 * SCANS vs PEOPLE. A scan is a tap on the QR code; a person is a distinct
 * browser. They differ because one person often scans twice — once to look,
 * once to show a colleague. Counting only scans overstates reach; counting
 * only people hides how interested they were. Both are shown.
 */

export type CodeRow = {
  code: string;
  label: string;
  destination: string;
  source: string;
  medium: string;
  campaign: string | null;
  active: boolean;
  created_at: string;
};

export type ScanRow = { code: string; visitor_id: string | null };

export type LeadRow = {
  campaign_code: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  stage: string | null;
  order_id: string | null;
};

export type OrderRow = { id: string; amount_paise: number | null; status: string | null };

export type CampaignStat = {
  code: string;
  label: string;
  destination: string;
  source: string;
  medium: string;
  active: boolean;
  createdAt: string;
  /** Taps on the QR code. */
  scans: number;
  /** Distinct browsers behind those taps. */
  people: number;
  /** Started the assessment (a row in funnel_leads). */
  enquiries: number;
  /** Got as far as the bill — the most valuable list a rep can call. */
  reachedBilling: number;
  /** Paid. */
  paid: number;
  /** What those paid orders were actually charged, in whole rupees. */
  revenueInr: number;
};

/** Stages at or past the billing screen. */
const BILLING_OR_BEYOND = new Set(["billing", "paid"]);

export function campaignReport(input: {
  codes: CodeRow[];
  scans: ScanRow[];
  leads: LeadRow[];
  orders: OrderRow[];
}): CampaignStat[] {
  const { codes, scans, leads, orders } = input;

  // Only money that actually settled counts as revenue.
  const paidAmount = new Map<string, number>();
  for (const o of orders) {
    if (o.status !== "paid") continue;
    paidAmount.set(o.id, Math.round((o.amount_paise ?? 0) / 100));
  }

  const scanCount = new Map<string, number>();
  const people = new Map<string, Set<string>>();
  for (const s of scans) {
    scanCount.set(s.code, (scanCount.get(s.code) ?? 0) + 1);
    if (s.visitor_id) {
      let set = people.get(s.code);
      if (!set) people.set(s.code, (set = new Set()));
      set.add(s.visitor_id);
    }
  }

  type Agg = { enquiries: number; reachedBilling: number; paid: number; revenueInr: number };
  const byCode = new Map<string, Agg>();
  for (const l of leads) {
    const code = l.campaign_code;
    if (!code) continue;
    let a = byCode.get(code);
    if (!a) byCode.set(code, (a = { enquiries: 0, reachedBilling: 0, paid: 0, revenueInr: 0 }));
    a.enquiries += 1;
    if (l.stage && BILLING_OR_BEYOND.has(l.stage)) a.reachedBilling += 1;
    if (l.order_id && paidAmount.has(l.order_id)) {
      a.paid += 1;
      a.revenueInr += paidAmount.get(l.order_id) ?? 0;
    }
  }

  const rows: CampaignStat[] = codes.map((c) => {
    const a = byCode.get(c.code) ?? { enquiries: 0, reachedBilling: 0, paid: 0, revenueInr: 0 };
    return {
      code: c.code,
      label: c.label,
      destination: c.destination,
      source: c.source,
      medium: c.medium,
      active: c.active,
      createdAt: c.created_at,
      scans: scanCount.get(c.code) ?? 0,
      people: people.get(c.code)?.size ?? 0,
      enquiries: a.enquiries,
      reachedBilling: a.reachedBilling,
      paid: a.paid,
      revenueInr: a.revenueInr,
    };
  });

  // Most successful first: money, then intent, then reach. A code that sold
  // nothing but was scanned 500 times still deserves to be seen.
  rows.sort(
    (x, y) =>
      y.revenueInr - x.revenueInr ||
      y.paid - x.paid ||
      y.reachedBilling - x.reachedBilling ||
      y.enquiries - x.enquiries ||
      y.scans - x.scans ||
      x.code.localeCompare(y.code)
  );
  return rows;
}

/** Where visitors came from overall, pamphlets included. Answers "is any
 *  of this marketing working, and is AI sending anyone?" */
export type SourceStat = {
  source: string;
  medium: string;
  people: number;
  enquiries: number;
  paid: number;
};

export function sourceReport(input: {
  visitors: { first_source: string | null; first_medium: string | null }[];
  leads: LeadRow[];
  orders: OrderRow[];
}): SourceStat[] {
  const paid = new Set(
    input.orders.filter((o) => o.status === "paid").map((o) => o.id)
  );
  const key = (s: string | null, m: string | null) =>
    `${s || "direct"}\u0000${m || "none"}`;

  const map = new Map<string, SourceStat>();
  const bump = (s: string | null, m: string | null, field: keyof SourceStat) => {
    const k = key(s, m);
    let row = map.get(k);
    if (!row) {
      map.set(k, (row = { source: s || "direct", medium: m || "none", people: 0, enquiries: 0, paid: 0 }));
    }
    if (field !== "source" && field !== "medium") row[field] += 1;
  };

  for (const v of input.visitors) bump(v.first_source, v.first_medium, "people");
  for (const l of input.leads) {
    bump(l.utm_source, l.utm_medium, "enquiries");
    if (l.order_id && paid.has(l.order_id)) bump(l.utm_source, l.utm_medium, "paid");
  }

  return [...map.values()].sort(
    (a, b) => b.paid - a.paid || b.enquiries - a.enquiries || b.people - a.people
  );
}
