/**
 * lib/campaignFolders.ts — a print run, judged.
 *
 *   Gurugram · Oct 26 pamphlet
 *   220 printed → 198 delivered → 64 scanned (32%) → 51 read it
 *     → 31 started the assessment → 9 reached the bill → 3 paid · ₹2.9L
 *   Biggest loss: 22 of 31 stopped at "Chose a plan".
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM campaignReport.ts. That file answers
 * "which code did best". This one answers "did the print run pay for
 * itself, and where exactly did we lose the rest" — which needs the one
 * number a per-code table has no room for: HOW MANY WE PRINTED.
 *
 * Every rate here is measured against the printed count, not against the
 * scans. A funnel that starts at "scans" always looks healthy, because the
 * people who threw the card away never enter it. Those are the people the
 * next print run has to win, so they stay in the denominator.
 *
 * Pure and dependency-free, like campaignReport.ts and buyerReport.ts, so
 * the whole analysis is tested without a database.
 *
 * WHAT IS KNOWN AND WHAT IS NOT. Say it plainly, because a marketing number
 * that is quietly a guess is worse than no number:
 *   • Scans are RELIABLE. Logged on our server inside the redirect, so they
 *     count whatever the visitor's browser blocks.
 *   • Time, scroll and clicks come from the page, so a visitor who blocks
 *     scripts or presses "Decline" on the cookie notice appears as scanned
 *     with no journey. They are counted as scanned and excluded from the
 *     engagement rate rather than counted as a failure.
 *   • Crawlers are dropped before anything is counted.
 */

import type { OrderRow } from "@/lib/campaignReport";
import { interestOf, type Interest } from "@/lib/interest";
import {
  PRICE_PAGES,
  STAGE_KEYS,
  STAGE_RANK,
  FUNNEL_STAGES,
  furtherStage,
  pageLabel,
  pagePath,
  stageLabel,
} from "@/lib/analytics/signals";

/* ───────────────────────────── the rows in ──────────────────────────────── */

export type FolderRow = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
  channel: string;
  destination: string;
  printed_count: number | null;
  distributed_at: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
};

export type FolderCodeRow = {
  code: string;
  folder_id: string | null;
  label: string | null;
  person_name: string | null;
  person_company: string | null;
  recipient_role: string | null;
  recipient_phone: string | null;
  recipient_email: string | null;
  delivery_state: string;
  delivered_at: string | null;
  print_seq: number | null;
  created_at: string;
  /** Written by hand on the person's page: who has been called, and how it went. */
  outreach_state?: string | null;
  contacted_at?: string | null;
  rep_notes?: string | null;
  follow_up_on?: string | null;
};

export type FolderScanRow = {
  code: string;
  visitor_id: string | null;
  created_at: string;
  device: string | null;
  is_repeat: boolean | null;
  os?: string | null;
  browser?: string | null;
};

export type FolderVisitorRow = {
  visitor_id: string;
  first_code: string | null;
  first_seen_at: string;
  last_seen_at: string;
  city: string | null;
  device: string | null;
  os: string | null;
  browser: string | null;
  /** Pages the visitor has loaded with scripts running. Zero for a scan that never loaded the page. */
  page_views?: number | null;
  /** Where the visitor first came from: a campaign source, a search engine, a site, or "direct". */
  first_source?: string | null;
  first_referrer?: string | null;
};

export type FolderEventRow = {
  visitor_id: string;
  session_id: string | null;
  name: string;
  path: string | null;
  created_at: string;
  meta: Record<string, unknown> | null;
};

export type FolderLeadRow = {
  visitor_id: string | null;
  campaign_code: string | null;
  name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  stage: string | null;
  chosen_plan: string | null;
  quoted_total_inr: number | null;
  factory_city: string | null;
  industry: string | null;
  order_id: string | null;
};

/* ─────────────────────────── tuning, named ──────────────────────────────── */

/** Below this, they glanced at it; at or above it, they read something. */
export const READ_SECONDS = 30;
/** Dwell on a price page past this, with no step after it, reads as a stall. */
export const PRICE_STALL_SECONDS = 45;
/** Total time past this with no enquiry at all is interest we never captured. */
export const SILENT_INTEREST_SECONDS = 120;

/* ──────────────────────────── the numbers out ───────────────────────────── */

export type FolderStat = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  channel: string;
  distributedAt: string | null;
  active: boolean;
  /** What was printed. Null when we never recorded it. */
  printed: number | null;
  /** Codes that exist for this folder. */
  codes: number;
  /** Codes marked as having reached a desk. */
  delivered: number;
  /** Codes scanned at least once. The honest reach of the print run. */
  scannedCodes: number;
  /** Total human taps, including the same card scanned twice. */
  scans: number;
  /** Taps that were not the first on their code — the card being shown on. */
  repeatScans: number;
  /** Taps by link-preview robots and scanners. Never counted as an open. */
  botScans: number;
  /** Codes whose scan actually loaded the website, with scripts running. */
  visited: number;
  /** Codes that left a phone number or email on the website. */
  contacts: number;
  /** Distinct browsers. */
  people: number;
  enquiries: number;
  reachedBilling: number;
  paid: number;
  revenueInr: number;
  /** Codes with no scan at all: the follow-up list. */
  neverOpened: number;
  /**
   * Scanned codes as a share of the denominator, 0–100, or null when we
   * never recorded a printed count. Never invented from the code count:
   * "32%" and "we do not know" are different answers.
   */
  scanRatePct: number | null;
  /** Paid orders per 100 printed pieces. The number that decides the next run. */
  paidPerThousandPrinted: number | null;
  /** Rupees earned per printed piece, for comparing a run against its cost. */
  revenuePerPieceInr: number | null;
};

const pct = (n: number, d: number): number | null =>
  d > 0 ? Math.round((n / d) * 1000) / 10 : null;

const ms = (iso: string) => new Date(iso).getTime();

/** Codes count as having reached somebody once marked delivered. */
const DELIVERED_STATES = new Set(["delivered"]);

/** CODE (upper) -> folder id, and folder id -> its codes. */
function indexCodes(codes: FolderCodeRow[]): Map<string, Set<string>> {
  const byFolder = new Map<string, Set<string>>();
  for (const c of codes) {
    if (!c.folder_id) continue;
    let s = byFolder.get(c.folder_id);
    if (!s) byFolder.set(c.folder_id, (s = new Set()));
    s.add(c.code.toUpperCase());
  }
  return byFolder;
}

/**
 * Who belongs to which code. A code stands for a piece of paper: the same
 * card scanned by two people is two visitors on one code, and one person
 * handed two cards is one visitor on two codes.
 *
 * A visitor claims a code when they first arrived on it or scanned it later.
 * Robot scans claim nothing — a link-preview fetch is not a person — so the
 * list page and the person page cannot disagree about who opened what.
 */
export function claimVisitors(
  known: ReadonlySet<string>,
  scans: FolderScanRow[],
  visitors: FolderVisitorRow[]
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const claim = (code: string, visitorId: string) => {
    const c = code.toUpperCase();
    if (!known.has(c)) return;
    let s = out.get(c);
    if (!s) out.set(c, (s = new Set()));
    s.add(visitorId);
  };
  for (const v of visitors) if (v.first_code) claim(v.first_code, v.visitor_id);
  for (const s of scans) if (s.visitor_id && s.device !== "bot") claim(s.code, s.visitor_id);
  return out;
}

type LeadIndex = {
  ofCode: Map<string, FolderLeadRow>;
  ofVisitor: Map<string, FolderLeadRow>;
};

/** The furthest-along lead per code and per visitor: somebody who started
 *  the assessment twice is one enquiry, and the better of the two counts. */
function indexLeads(leads: FolderLeadRow[]): LeadIndex {
  const rank = (l: FolderLeadRow) => STAGE_RANK[l.stage ?? ""] ?? 0;
  const ofCode = new Map<string, FolderLeadRow>();
  const ofVisitor = new Map<string, FolderLeadRow>();
  for (const l of leads) {
    if (l.campaign_code) {
      const k = l.campaign_code.toUpperCase();
      const prev = ofCode.get(k);
      if (!prev || rank(l) > rank(prev)) ofCode.set(k, l);
    }
    if (l.visitor_id) {
      const prev = ofVisitor.get(l.visitor_id);
      if (!prev || rank(l) > rank(prev)) ofVisitor.set(l.visitor_id, l);
    }
  }
  return { ofCode, ofVisitor };
}

/** The lead that belongs to a code: one that names it, else one left by any
 *  browser that scanned it. */
function leadFor(key: string, vids: Iterable<string>, idx: LeadIndex): FolderLeadRow | null {
  const direct = idx.ofCode.get(key);
  if (direct) return direct;
  let best: FolderLeadRow | null = null;
  for (const v of vids) {
    const l = idx.ofVisitor.get(v);
    if (l && (!best || (STAGE_RANK[l.stage ?? ""] ?? 0) > (STAGE_RANK[best.stage ?? ""] ?? 0))) best = l;
  }
  return best;
}

/** A phone number or email typed into the website. */
const leftContact = (l: FolderLeadRow | null): boolean =>
  !!l && !!((l.phone ?? "").trim() || (l.email ?? "").trim());

/**
 * The list page: one row per folder. Deliberately does NOT take events, so
 * the overview stays a handful of cheap queries however many pages have been
 * viewed. "Visited" comes from the visitor's page-view counter instead.
 */
export function folderOverview(input: {
  folders: FolderRow[];
  codes: FolderCodeRow[];
  scans: FolderScanRow[];
  leads: FolderLeadRow[];
  orders: OrderRow[];
  /** Optional: without them "visited" reads zero rather than being guessed. */
  visitors?: FolderVisitorRow[];
}): FolderStat[] {
  const { folders, codes, scans, leads, orders } = input;
  const visitors = input.visitors ?? [];

  const paidAmount = new Map<string, number>();
  for (const o of orders) {
    if (o.status !== "paid") continue;
    paidAmount.set(o.id, Math.round((o.amount_paise ?? 0) / 100));
  }

  const codesByFolder = indexCodes(codes);
  const folderOfCode = new Map<string, string>();
  for (const [f, set] of codesByFolder) for (const c of set) folderOfCode.set(c, f);

  type Agg = {
    scans: number;
    repeatScans: number;
    botScans: number;
    scannedCodes: Set<string>;
    visitedCodes: Set<string>;
    leadCodes: Set<string>;
    contactCodes: Set<string>;
    billingCodes: Set<string>;
    paidCodes: Set<string>;
    people: Set<string>;
    revenueInr: number;
  };
  const fresh = (): Agg => ({
    scans: 0,
    repeatScans: 0,
    botScans: 0,
    scannedCodes: new Set(),
    visitedCodes: new Set(),
    leadCodes: new Set(),
    contactCodes: new Set(),
    billingCodes: new Set(),
    paidCodes: new Set(),
    people: new Set(),
    revenueInr: 0,
  });
  const agg = new Map<string, Agg>();
  const of = (id: string): Agg => {
    let a = agg.get(id);
    if (!a) agg.set(id, (a = fresh()));
    return a;
  };

  for (const s of scans) {
    const key = s.code.toUpperCase();
    const f = folderOfCode.get(key);
    if (!f) continue;
    const a = of(f);
    // A robot is not a person: it is not an open, not a rate, not a repeat.
    if (s.device === "bot") {
      a.botScans += 1;
      continue;
    }
    a.scans += 1;
    if (s.is_repeat) a.repeatScans += 1;
    a.scannedCodes.add(key);
    if (s.visitor_id) a.people.add(s.visitor_id);
  }

  /* Per CODE, not per row: two leads on one code are one enquiry, and a
     person is counted once however many browsers they used. */
  const known = new Set(folderOfCode.keys());
  const claimed = claimVisitors(known, scans, visitors);
  const pageViewsOf = new Map(visitors.map((v) => [v.visitor_id, v.page_views ?? 0]));
  const leadIdx = indexLeads(leads);

  for (const key of known) {
    const f = folderOfCode.get(key)!;
    const a = of(f);
    const vids = claimed.get(key) ?? new Set<string>();

    if ([...vids].some((v) => (pageViewsOf.get(v) ?? 0) > 0)) a.visitedCodes.add(key);

    const lead = leadFor(key, vids, leadIdx);
    if (!lead) continue;
    a.leadCodes.add(key);
    if (leftContact(lead)) a.contactCodes.add(key);
    if ((STAGE_RANK[lead.stage ?? ""] ?? 0) >= STAGE_RANK.billing!) a.billingCodes.add(key);
    if (lead.order_id && paidAmount.has(lead.order_id)) {
      a.paidCodes.add(key);
      a.revenueInr += paidAmount.get(lead.order_id) ?? 0;
    }
  }

  const deliveredByFolder = new Map<string, number>();
  const codeCount = new Map<string, number>();
  for (const c of codes) {
    if (!c.folder_id) continue;
    codeCount.set(c.folder_id, (codeCount.get(c.folder_id) ?? 0) + 1);
    if (DELIVERED_STATES.has(c.delivery_state)) {
      deliveredByFolder.set(c.folder_id, (deliveredByFolder.get(c.folder_id) ?? 0) + 1);
    }
  }

  const rows = folders.map((f) => {
    const a = agg.get(f.id) ?? fresh();
    const made = codeCount.get(f.id) ?? 0;
    const printed = f.printed_count;
    const scannedCodes = a.scannedCodes.size;
    // The denominator for reach. Printed is the truth; without it there is
    // no rate, and we say so rather than quietly substituting the code count.
    const denom = printed ?? null;
    const paid = a.paidCodes.size;
    return {
      id: f.id,
      slug: f.slug,
      name: f.name,
      city: f.city,
      channel: f.channel,
      distributedAt: f.distributed_at,
      active: f.active,
      printed,
      codes: made,
      delivered: deliveredByFolder.get(f.id) ?? 0,
      scannedCodes,
      scans: a.scans,
      repeatScans: a.repeatScans,
      botScans: a.botScans,
      visited: a.visitedCodes.size,
      contacts: a.contactCodes.size,
      people: a.people.size,
      enquiries: a.leadCodes.size,
      reachedBilling: a.billingCodes.size,
      paid,
      revenueInr: a.revenueInr,
      neverOpened: Math.max(0, made - scannedCodes),
      scanRatePct: denom ? pct(scannedCodes, denom) : null,
      paidPerThousandPrinted: denom ? Math.round((paid / denom) * 1000 * 10) / 10 : null,
      revenuePerPieceInr: denom ? Math.round(a.revenueInr / denom) : null,
    } satisfies FolderStat;
  });

  // Earned money first, then intent, then reach. A run that sold nothing but
  // was scanned 500 times still deserves to be looked at.
  rows.sort(
    (x, y) =>
      y.revenueInr - x.revenueInr ||
      y.paid - x.paid ||
      y.reachedBilling - x.reachedBilling ||
      y.enquiries - x.enquiries ||
      y.scannedCodes - x.scannedCodes ||
      ms(y.distributedAt ?? "1970-01-01") - ms(x.distributedAt ?? "1970-01-01") ||
      x.name.localeCompare(y.name)
  );
  return rows;
}

/* ──────────────────────── the funnel, with the losses ───────────────────── */

export type FunnelStep = {
  key: string;
  label: string;
  count: number;
  /** Share of the step above, 0–100. Null for the first step. */
  ofPreviousPct: number | null;
  /** Share of what was printed, 0–100. Null when printed is unknown. */
  ofPrintedPct: number | null;
  /** People who reached the step above and not this one. */
  lost: number;
  /** True for the step that lost the most people. */
  biggestLoss: boolean;
  /** Said in words, for the step that leaks most. */
  note: string | null;
};

/**
 * The whole run as one ladder, from the printing press to the money.
 *
 * The first four rungs are things we did or they did with the paper; the
 * rest is the assessment. Keeping them on one ladder is the point: it is
 * the only view where "we printed 5,000 and sold three" cannot hide.
 */
export function folderFunnel(input: {
  printed: number | null;
  delivered: number;
  codesMade: number;
  scannedCodes: number;
  readIt: number;
  /** Furthest stage reached, per person. */
  stages: (string | null)[];
}): FunnelStep[] {
  const { printed, delivered, codesMade, scannedCodes, readIt, stages } = input;

  const atOrPast = (key: string) =>
    stages.filter((s) => (STAGE_RANK[s ?? ""] ?? 0) >= (STAGE_RANK[key] ?? 99)).length;

  const raw: { key: string; label: string; count: number }[] = [
    { key: "printed", label: "Printed", count: printed ?? codesMade },
    { key: "delivered", label: "Reached a desk", count: delivered },
    { key: "scanned", label: "Scanned the code", count: scannedCodes },
    { key: "read", label: "Read the page", count: readIt },
    ...STAGE_KEYS.map((k) => ({
      key: k,
      label: FUNNEL_STAGES.find((s) => s.key === k)!.label,
      count: atOrPast(k),
    })),
  ];

  // "Reached a desk" is only meaningful once somebody has recorded it. Left
  // in at zero it would read as a catastrophic loss at step two, which is a
  // lie about the print run rather than a fact about it.
  const steps = raw.filter((s) => s.key !== "delivered" || s.count > 0);

  const base = printed ?? null;
  const out: FunnelStep[] = steps.map((s, i) => {
    const prev = i === 0 ? null : steps[i - 1]!.count;
    return {
      key: s.key,
      label: s.label,
      count: s.count,
      ofPreviousPct: prev === null ? null : pct(s.count, prev),
      ofPrintedPct: base ? pct(s.count, base) : null,
      // Never negative: a code scanned by somebody it was not printed for
      // can make a later step larger than the one above it.
      lost: prev === null ? 0 : Math.max(0, prev - s.count),
      biggestLoss: false,
      note: null,
    };
  });

  // The leak worth fixing is the biggest absolute loss after the page was
  // actually read. Losses before that are a distribution problem, not a
  // problem with the site, and they are obvious from the top of the table.
  //
  // A tie goes to the EARLIER step (`>` rather than `>=`): when two rungs
  // leak equally, the one nearer the top is the one to fix first, because
  // everybody lost there never reaches the second one to be lost again.
  let worst = -1;
  let worstAt = -1;
  for (let i = 0; i < out.length; i++) {
    const s = out[i]!;
    if (s.key === "delivered" || s.key === "scanned" || s.key === "printed") continue;
    if (s.lost > worst) {
      worst = s.lost;
      worstAt = i;
    }
  }
  if (worstAt >= 0 && worst > 0) {
    const s = out[worstAt]!;
    const from = out[worstAt - 1]?.label ?? "the step before";
    s.biggestLoss = true;
    s.note = `${s.lost} of ${out[worstAt - 1]?.count ?? s.lost} got as far as “${from}” and no further.`;
  }
  return out;
}

/* ───────────────────── one person, in as much detail as we have ─────────── */

/** Why a person is worth a call, or why we lost them. */
export type SignalKind =
  | "price_stall"
  | "silent_interest"
  | "shown_to_others"
  | "returned"
  | "exit_on_price"
  | "objections"
  | "form_abandon"
  | "frustrated"
  | "read_terms";

export type Signal = {
  kind: SignalKind;
  /** One line the owner can act on, written out rather than a code. */
  text: string;
  /** Louder signals first in the list. */
  weight: number;
};

export type PersonPageStat = {
  path: string;
  label: string;
  views: number;
  seconds: number;
  scroll: number;
};

export type FolderPerson = {
  code: string;
  name: string | null;
  company: string | null;
  role: string | null;
  phone: string | null;
  email: string | null;
  deliveryState: string;
  printSeq: number | null;
  /** Any sign of life: scanned, loaded the site, or left details. */
  opened: boolean;
  /** Human scans of the card. Robots are counted separately below. */
  scans: number;
  repeatScans: number;
  /** Link-preview and scanner hits: never an open. */
  botScans: number;
  /** First and last time a person scanned the card. Null: nobody has. */
  firstScanAt: string | null;
  lastScanAt: string | null;
  /**
   * The website loaded with scripts running. A scan that never got that far
   * (closed the tab, no signal, scripts blocked) is opened but not visited,
   * and that gap is worth knowing about.
   */
  visited: boolean;
  firstVisitAt: string | null;
  /** Seconds on the pages that show money. */
  priceSeconds: number;
  /** Operating systems and browsers seen, for "what do they use". */
  os: string[];
  browsers: string[];
  interest: Interest;
  /** 0–100. Orders people; never lifts one across a level. */
  interestScore: number;
  /** Why they are at that level, strongest first, in words. */
  interestWhy: string[];
  /** The plan they picked on the pricing page, when they picked one. */
  pickedPlan: string | null;
  clickedPay: boolean;
  /**
   * How to reach them. From the website form when they filled it in (that is
   * consent, given in their own words); else whatever was typed in by hand.
   */
  contact: {
    name: string | null;
    company: string | null;
    phone: string | null;
    email: string | null;
    source: "form" | "manual" | null;
  };
  /** The follow-up log, written by hand on the person's page. */
  outreach: {
    state: string;
    contactedAt: string | null;
    notes: string | null;
    followUpOn: string | null;
  };
  visitors: number;
  /** Separate visits: a gap of 30 idle minutes starts a new one. */
  visits: number;
  pageViews: number;
  activeSeconds: number;
  firstOpenedAt: string | null;
  lastSeenAt: string | null;
  city: string | null;
  devices: string[];
  pages: PersonPageStat[];
  topPage: PersonPageStat | null;
  stage: string | null;
  stageLabel: string;
  /** FAQ entries they opened: their objections, in their own order. */
  objections: string[];
  signals: Signal[];
  lead: {
    name: string | null;
    company: string | null;
    phone: string | null;
    email: string | null;
    plan: string | null;
    quotedInr: number | null;
    factoryCity: string | null;
    industry: string | null;
  } | null;
  paid: boolean;
  revenueInr: number;
};

import { journeyStartMs, scopeEvents } from "@/lib/journeyScope";

const SESSION_GAP_MS = 30 * 60 * 1000;

/** A string out of an event's meta, trimmed and capped. */
function metaStr(meta: Record<string, unknown> | null, key: string): string | null {
  const v = meta?.[key];
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, 120);
  return s.length ? s : null;
}

function metaNum(meta: Record<string, unknown> | null, key: string): number | null {
  const v = meta?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export type FolderDetail = {
  folder: FolderRow;
  stat: FolderStat;
  funnel: FunnelStep[];
  /** EVERYONE on the list, in the order the letters were printed: the table. */
  roster: FolderPerson[];
  people: FolderPerson[];
  /** Codes with no scan: who to chase, and the reason to print fewer next time. */
  neverOpened: FolderPerson[];
  /** Pages across the whole run, by the time people actually spent on them. */
  pages: PersonPageStat[];
  /** Every objection raised, most common first. */
  objections: { question: string; people: number }[];
  /** Phone / tablet / computer split of the people who opened it. */
  devices: { device: string; people: number }[];
  /** The one or two sentences worth reading first. */
  headlines: string[];
};

/**
 * Everything known about one print run. Takes the folder's own codes,
 * scans, visitors, events and leads — already narrowed to this folder by
 * the route, so this stays pure and cheap.
 */
export function folderDetail(input: {
  folder: FolderRow;
  codes: FolderCodeRow[];
  scans: FolderScanRow[];
  visitors: FolderVisitorRow[];
  events: FolderEventRow[];
  leads: FolderLeadRow[];
  orders: OrderRow[];
}): FolderDetail {
  const { folder, codes, scans, visitors, events, leads, orders } = input;

  const stat =
    folderOverview({ folders: [folder], codes, scans, leads, orders, visitors })[0] ??
    ({} as FolderStat);

  const paidAmount = new Map<string, number>();
  for (const o of orders) {
    if (o.status !== "paid") continue;
    paidAmount.set(o.id, Math.round((o.amount_paise ?? 0) / 100));
  }

  /* Which visitors belong to which code. Shared with the overview, so the
     list page and this one cannot disagree about who opened what. */
  const known = new Set(codes.map((c) => c.code.toUpperCase()));
  const visitorsOfCode = claimVisitors(known, scans, visitors);

  const visitorById = new Map(visitors.map((v) => [v.visitor_id, v]));

  /* Events, grouped once. */
  const eventsOf = new Map<string, FolderEventRow[]>();
  for (const e of events) {
    let list = eventsOf.get(e.visitor_id);
    if (!list) eventsOf.set(e.visitor_id, (list = []));
    list.push(e);
  }
  for (const list of eventsOf.values()) list.sort((a, b) => ms(a.created_at) - ms(b.created_at));

  /* Leads, by code and by visitor: the furthest-along one wins. */
  const leadIdx = indexLeads(leads);

  const scansOfCode = new Map<string, FolderScanRow[]>();
  for (const s of scans) {
    const k = s.code.toUpperCase();
    let list = scansOfCode.get(k);
    if (!list) scansOfCode.set(k, (list = []));
    list.push(s);
  }

  const runPages = new Map<string, PersonPageStat>();
  const objectionCount = new Map<string, Set<string>>();
  const deviceCount = new Map<string, Set<string>>();

  const people: FolderPerson[] = codes.map((c) => {
    const key = c.code.toUpperCase();
    const vids = [...(visitorsOfCode.get(key) ?? [])];
    const allScans = scansOfCode.get(key) ?? [];
    // A robot's hit is never an open: split it off before anything is counted.
    const codeScans = allScans.filter((s) => s.device !== "bot");
    const botScans = allScans.length - codeScans.length;

    let pageViews = 0;
    let activeSeconds = 0;
    let firstAt: number | null = null;
    let lastAt: number | null = null;
    let city: string | null = null;
    const devices = new Set<string>();
    const sessions = new Set<string>();
    const sessionStamps: number[] = [];
    const pages = new Map<string, PersonPageStat>();
    const objections: string[] = [];
    let stage: string | null = null;
    let exitOnPrice = false;
    let abandonedField: string | null = null;
    let frustration = 0;
    let readTerms = false;
    let clickedPay = false;
    let pickedPlan: string | null = null;
    let firstScan: number | null = null;
    let lastScan: number | null = null;
    let firstView: number | null = null;
    let visitorPageViews = 0;
    const osSeen = new Set<string>();
    const browsersSeen = new Set<string>();

    for (const s of codeScans) {
      const t = ms(s.created_at);
      if (firstAt === null || t < firstAt) firstAt = t;
      if (lastAt === null || t > lastAt) lastAt = t;
      if (firstScan === null || t < firstScan) firstScan = t;
      if (lastScan === null || t > lastScan) lastScan = t;
      if (s.device) devices.add(s.device);
      if (s.os) osSeen.add(s.os);
      if (s.browser) browsersSeen.add(s.browser);
    }

    for (const vid of vids) {
      const v = visitorById.get(vid);
      if (v) {
        city = city ?? v.city;
        if (v.device && v.device !== "bot") devices.add(v.device);
        if (v.os) osSeen.add(v.os);
        if (v.browser) browsersSeen.add(v.browser);
        visitorPageViews += v.page_views ?? 0;
        const fs = ms(v.first_seen_at);
        const ls = ms(v.last_seen_at);
        if (firstAt === null || fs < firstAt) firstAt = fs;
        if (lastAt === null || ls > lastAt) lastAt = ls;
      }

      // Only the person's own journey: public pages, from the scan on. The same
      // browser may also have been used for the admin or an earlier test.
      const allOfVisitor = eventsOf.get(vid) ?? [];
      const startMs = journeyStartMs(
        c.code,
        codeScans.map((x) => x.created_at),
        allOfVisitor
      );
      for (const e of scopeEvents(allOfVisitor, startMs)) {
        const t = ms(e.created_at);
        if (lastAt === null || t > lastAt) lastAt = t;
        if (e.session_id) sessions.add(e.session_id);
        else sessionStamps.push(t);

        const path = pagePath(e.path);
        const row =
          pages.get(path) ??
          (pages.set(path, { path, label: pageLabel(path), views: 0, seconds: 0, scroll: 0 }),
          pages.get(path)!);

        switch (e.name) {
          case "page_view":
            pageViews += 1;
            row.views += 1;
            if (firstView === null || t < firstView) firstView = t;
            if (path === "/terms" || path === "/refund-policy") readTerms = true;
            break;
          case "page_time": {
            const sec = metaNum(e.meta, "seconds");
            const scroll = metaNum(e.meta, "scroll");
            if (sec !== null && sec > 0) {
              const capped = Math.min(1800, Math.round(sec));
              activeSeconds += capped;
              row.seconds += capped;
            }
            if (scroll !== null) row.scroll = Math.max(row.scroll, Math.min(100, Math.round(scroll)));
            break;
          }
          case "funnel_step":
            stage = furtherStage(stage, metaStr(e.meta, "step"));
            break;
          case "pay_click":
            clickedPay = true;
            break;
          case "plan_selected":
            pickedPlan = pickedPlan ?? metaStr(e.meta, "plan") ?? metaStr(e.meta, "label") ?? "a plan";
            break;
          case "faq_open": {
            const q = metaStr(e.meta, "question") ?? metaStr(e.meta, "label");
            if (q && !objections.includes(q)) objections.push(q);
            break;
          }
          case "exit_intent":
            if (PRICE_PAGES.has(path)) exitOnPrice = true;
            break;
          case "form_abandon":
            abandonedField = metaStr(e.meta, "field") ?? abandonedField;
            break;
          case "rage_click":
          case "dead_click":
            frustration += 1;
            break;
          default:
            break;
        }
      }
    }

    const lead = leadFor(key, vids, leadIdx);
    stage = furtherStage(stage, lead?.stage ?? null);
    const paid = !!(lead?.order_id && paidAmount.has(lead.order_id));
    if (paid) stage = furtherStage(stage, "paid");
    const revenueInr = paid ? paidAmount.get(lead!.order_id!) ?? 0 : 0;

    /* Visits: distinct session ids, plus any event with no session id that
       sits more than the idle gap away from the last one. */
    let visits = sessions.size;
    sessionStamps.sort((a, b) => a - b);
    let prev: number | null = null;
    for (const t of sessionStamps) {
      if (prev === null || t - prev > SESSION_GAP_MS) visits += 1;
      prev = t;
    }
    if (visits === 0 && codeScans.length) visits = 1;

    const pageList = [...pages.values()]
      .filter((p) => p.views > 0 || p.seconds > 0)
      .sort((a, b) => b.seconds - a.seconds || b.views - a.views);

    /* Roll the person's pages into the run's. */
    for (const p of pageList) {
      const r =
        runPages.get(p.path) ??
        (runPages.set(p.path, { path: p.path, label: p.label, views: 0, seconds: 0, scroll: 0 }),
        runPages.get(p.path)!);
      r.views += p.views;
      r.seconds += p.seconds;
      r.scroll = Math.max(r.scroll, p.scroll);
    }
    for (const q of objections) {
      const s = objectionCount.get(q) ?? (objectionCount.set(q, new Set()), objectionCount.get(q)!);
      s.add(key);
    }
    for (const d of devices) {
      const s = deviceCount.get(d) ?? (deviceCount.set(d, new Set()), deviceCount.get(d)!);
      s.add(key);
    }

    /* ── the signals ─────────────────────────────────────────────────────── */
    const signals: Signal[] = [];
    const priceSeconds = pageList
      .filter((p) => PRICE_PAGES.has(p.path))
      .reduce((n, p) => n + p.seconds, 0);
    const rank = STAGE_RANK[stage ?? ""] ?? 0;

    if (priceSeconds >= PRICE_STALL_SECONDS && !paid) {
      signals.push({
        kind: "price_stall",
        text:
          rank >= STAGE_RANK.billing!
            ? `Reached the bill and spent ${Math.round(priceSeconds)}s on the price without paying — hesitating about money.`
            : `Spent ${Math.round(priceSeconds)}s on the price and went no further. Lead with value, not the number.`,
        weight: 90,
      });
    }
    if (exitOnPrice && !paid) {
      signals.push({
        kind: "exit_on_price",
        text: "Moved to close the tab while on the price. The number is the objection.",
        weight: 85,
      });
    }
    if (activeSeconds >= SILENT_INTEREST_SECONDS && !lead) {
      signals.push({
        kind: "silent_interest",
        text: `Read for ${Math.round(activeSeconds / 60)} min and never told us who they are. Worth a cold call — they are already interested.`,
        weight: 80,
      });
    }
    if (objections.length) {
      signals.push({
        kind: "objections",
        text: `Opened ${objections.length} question${objections.length === 1 ? "" : "s"}: ${objections.slice(0, 3).join("; ")}. Answer these on the call.`,
        weight: 75,
      });
    }
    if (abandonedField) {
      signals.push({
        kind: "form_abandon",
        text: `Stopped filling the form at “${abandonedField}”.`,
        weight: 70,
      });
    }
    if (devices.size > 1 || codeScans.some((s) => s.is_repeat)) {
      signals.push({
        kind: "shown_to_others",
        text:
          devices.size > 1
            ? "Opened on more than one kind of device — the card was passed on or shown to somebody."
            : "Scanned more than once — the card was shown to somebody else.",
        weight: 65,
      });
    }
    if (visits > 1) {
      signals.push({
        kind: "returned",
        text: `Came back ${visits} times. Returning on a printed card is a strong signal.`,
        weight: 60,
      });
    }
    if (readTerms) {
      signals.push({
        kind: "read_terms",
        text: "Read the terms or the refund policy — they were checking whether we are real.",
        weight: 55,
      });
    }
    if (frustration >= 3) {
      signals.push({
        kind: "frustrated",
        text: `${frustration} clicks that did nothing. Something on the page is not working for them.`,
        weight: 50,
      });
    }
    signals.sort((a, b) => b.weight - a.weight);

    /* ── opened, visited, interested, reachable ───────────────────────────── */
    // Opened is the scan. Visited is the site loading AFTER the scan, with
    // scripts running: a card scanned in a dead-signal corridor is opened and
    // not visited, and that difference is worth seeing.
    const visited = pageViews > 0 || visitorPageViews > 0;
    const engaged = codeScans.length > 0 || visited || !!lead;
    const gaveContact = leftContact(lead);
    const verdict = interestOf({
      opened: engaged,
      paid,
      stage,
      activeSeconds,
      priceSeconds,
      visits,
      objections: objections.length,
      leftContact: gaveContact,
      clickedPay,
      pickedPlan: pickedPlan !== null,
    });
    const formPhone = (lead?.phone ?? "").trim() || null;
    const formEmail = (lead?.email ?? "").trim() || null;
    const contactPhone = formPhone ?? ((c.recipient_phone ?? "").trim() || null);
    const contactEmail = formEmail ?? ((c.recipient_email ?? "").trim() || null);

    return {
      code: c.code,
      name: c.person_name,
      company: c.person_company,
      role: c.recipient_role,
      phone: c.recipient_phone,
      email: c.recipient_email,
      deliveryState: c.delivery_state,
      printSeq: c.print_seq,
      opened: engaged,
      scans: codeScans.length,
      repeatScans: codeScans.filter((s) => s.is_repeat).length,
      botScans,
      firstScanAt: firstScan === null ? null : new Date(firstScan).toISOString(),
      lastScanAt: lastScan === null ? null : new Date(lastScan).toISOString(),
      visited,
      firstVisitAt: firstView === null ? null : new Date(firstView).toISOString(),
      priceSeconds,
      os: [...osSeen].sort(),
      browsers: [...browsersSeen].sort(),
      interest: verdict.level,
      interestScore: verdict.score,
      interestWhy: verdict.why,
      pickedPlan,
      clickedPay,
      contact: {
        name: (lead?.name ?? "").trim() || c.person_name,
        company: (lead?.company ?? "").trim() || c.person_company,
        phone: contactPhone,
        email: contactEmail,
        source: formPhone || formEmail ? "form" : contactPhone || contactEmail ? "manual" : null,
      },
      outreach: {
        state: c.outreach_state ?? "new",
        contactedAt: c.contacted_at ?? null,
        notes: c.rep_notes ?? null,
        followUpOn: c.follow_up_on ?? null,
      },
      visitors: vids.length,
      visits,
      pageViews,
      activeSeconds,
      firstOpenedAt: firstAt === null ? null : new Date(firstAt).toISOString(),
      lastSeenAt: lastAt === null ? null : new Date(lastAt).toISOString(),
      city,
      devices: [...devices].sort(),
      pages: pageList,
      topPage: pageList[0] ?? null,
      stage,
      stageLabel: stageLabel(stage),
      objections,
      signals,
      lead: lead
        ? {
            name: lead.name,
            company: lead.company,
            phone: lead.phone,
            email: lead.email,
            plan: lead.chosen_plan,
            quotedInr: lead.quoted_total_inr,
            factoryCity: lead.factory_city,
            industry: lead.industry,
          }
        : null,
      paid,
      revenueInr,
    } satisfies FolderPerson;
  });

  /* Most interesting first: money, then how far they got, then how long. */
  const opened = people
    .filter((p) => p.opened)
    .sort(
      (a, b) =>
        b.revenueInr - a.revenueInr ||
        (STAGE_RANK[b.stage ?? ""] ?? 0) - (STAGE_RANK[a.stage ?? ""] ?? 0) ||
        b.activeSeconds - a.activeSeconds ||
        b.scans - a.scans ||
        a.code.localeCompare(b.code)
    );
  const neverOpened = people
    .filter((p) => !p.opened)
    .sort((a, b) => (a.printSeq ?? 0) - (b.printSeq ?? 0) || a.code.localeCompare(b.code));

  const roster = [...people].sort(
    (a, b) =>
      (a.printSeq ?? Number.MAX_SAFE_INTEGER) - (b.printSeq ?? Number.MAX_SAFE_INTEGER) ||
      (a.name ?? a.code).localeCompare(b.name ?? b.code)
  );

  const readIt = opened.filter((p) => p.activeSeconds >= READ_SECONDS).length;
  const funnel = folderFunnel({
    printed: folder.printed_count,
    delivered: stat.delivered ?? 0,
    codesMade: codes.length,
    scannedCodes: stat.scannedCodes ?? 0,
    readIt,
    stages: opened.map((p) => p.stage),
  });

  return {
    folder,
    stat,
    funnel,
    roster,
    people: opened,
    neverOpened,
    pages: [...runPages.values()].sort((a, b) => b.seconds - a.seconds || b.views - a.views),
    objections: [...objectionCount.entries()]
      .map(([question, set]) => ({ question, people: set.size }))
      .sort((a, b) => b.people - a.people || a.question.localeCompare(b.question)),
    devices: [...deviceCount.entries()]
      .map(([device, set]) => ({ device, people: set.size }))
      .sort((a, b) => b.people - a.people),
    headlines: headlinesFor(stat, funnel, opened),
  };
}

/**
 * The two or three sentences worth reading before the tables. Written as
 * sentences on purpose: a number without its meaning gets stared at and
 * then ignored.
 */
export function headlinesFor(
  stat: FolderStat,
  funnel: FunnelStep[],
  people: FolderPerson[]
): string[] {
  const out: string[] = [];

  if (stat.printed && stat.scanRatePct !== null) {
    out.push(
      `${stat.scannedCodes} of ${stat.printed} printed pieces were scanned (${stat.scanRatePct}%)${
        stat.repeatScans ? `, and ${stat.repeatScans} were scanned more than once` : ""
      }.`
    );
  } else if (stat.scannedCodes) {
    out.push(
      `${stat.scannedCodes} codes were scanned. Record how many pieces were printed to turn this into a rate.`
    );
  }

  const hot = people.filter((p) => p.interest === "hot").length;
  if (hot) {
    out.push(
      `${hot} ${hot === 1 ? "person is" : "people are"} hot: they left details, chose a plan or reached the bill. Call them first.`
    );
  }

  const gap = people.filter((p) => p.scans > 0 && !p.visited).length;
  if (gap) {
    out.push(
      `${gap} scanned the card but the site never loaded for them (no signal, or scripts blocked). They may need a nudge.`
    );
  }

  const leak = funnel.find((f) => f.biggestLoss);
  if (leak?.note) out.push(`Biggest loss: ${leak.note}`);

  if (stat.paid) {
    out.push(
      `${stat.paid} paid, ₹${stat.revenueInr.toLocaleString("en-IN")} earned${
        stat.revenuePerPieceInr !== null ? ` — ₹${stat.revenuePerPieceInr} per piece printed` : ""
      }.`
    );
  }

  const stalls = people.filter((p) => p.signals.some((s) => s.kind === "price_stall")).length;
  if (stalls) {
    out.push(
      `${stalls} ${stalls === 1 ? "person" : "people"} stalled on the price — the clearest thing to fix or to call about.`
    );
  }

  const silent = people.filter((p) => p.signals.some((s) => s.kind === "silent_interest")).length;
  if (silent) {
    out.push(
      `${silent} read it properly and never left a name. They are already interested; nothing will reach them but a call.`
    );
  }

  return out;
}

/* ───────────────────────────── naming a folder ──────────────────────────── */

/**
 * "Gurugram — Oct 26, batch 1" -> "gurugram-oct-26-batch-1".
 *
 * Mirrors the CHECK constraint on campaign_folders.slug: lower case, starts
 * with a letter or digit, then letters, digits, hyphen or underscore, 2–49
 * characters. Returns null when nothing usable is left, so the caller asks
 * for a better name rather than writing a row the database will reject.
 */
export function folderSlug(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 49);
  return /^[a-z0-9][a-z0-9_-]{1,48}$/.test(s) ? s : null;
}

/** The channels a folder may use. Mirrors the CHECK constraint. */
export const FOLDER_CHANNELS = [
  "pamphlet",
  "tradeshow",
  "courier",
  "visit",
  "email",
  "whatsapp",
  "other",
] as const;

export type FolderChannel = (typeof FOLDER_CHANNELS)[number];

export function isFolderChannel(v: unknown): v is FolderChannel {
  return typeof v === "string" && (FOLDER_CHANNELS as readonly string[]).includes(v);
}

/** The states a printed piece can be in. Mirrors the CHECK constraint. */
export const DELIVERY_STATES = ["made", "printed", "delivered", "refused", "lost"] as const;

export type DeliveryState = (typeof DELIVERY_STATES)[number];

export function isDeliveryState(v: unknown): v is DeliveryState {
  return typeof v === "string" && (DELIVERY_STATES as readonly string[]).includes(v);
}

export const DELIVERY_LABELS: Record<DeliveryState, string> = {
  made: "Code made",
  printed: "Printed",
  delivered: "Reached a desk",
  refused: "Refused at the gate",
  lost: "Lost",
};

/* ───────────────────────── follow-up, written by hand ───────────────────── */

/** Where a person stands with whoever is calling them. Mirrors the CHECK constraint. */
export const OUTREACH_STATES = ["new", "tried", "spoke", "booked", "won", "declined", "wrong_person"] as const;

export type OutreachState = (typeof OUTREACH_STATES)[number];

export function isOutreachState(v: unknown): v is OutreachState {
  return typeof v === "string" && (OUTREACH_STATES as readonly string[]).includes(v);
}

export const OUTREACH_LABELS: Record<OutreachState, string> = {
  new: "Not contacted",
  tried: "Tried, no answer",
  spoke: "Spoke to them",
  booked: "Call or visit booked",
  won: "Won",
  declined: "Said no",
  wrong_person: "Wrong person",
};
