/**
 * lib/buyerReport.ts — what each person did after they scanned THEIR code.
 *
 *     Aryan · Acme Pumps   opened   4 min 10 s   Plans 2:05 · Case studies 1:20
 *                          started the assessment · chose Authority · bill ₹1.2L
 *
 * This is the table that answers "who is actually interested, and in what?",
 * so the follow-up call can open with the thing they were reading rather than
 * a cold pitch.
 *
 * Pure and dependency-free, like lib/campaignReport.ts, so the whole report
 * is tested without a database.
 *
 * WHAT IS AND IS NOT KNOWN
 *   • "Opened" is reliable: the scan is logged on our server inside the
 *     redirect, whatever the visitor's browser blocks.
 *   • Time and scroll come from the page itself, so a visitor who blocks
 *     scripts or chooses "Decline" on the cookie notice appears as
 *     opened with no time. That is honest, not a bug.
 *   • A code stands for a BROWSER. The same person on a laptop and a phone
 *     is two browsers under one code; a QR shown to a colleague is one code
 *     with two people. The "visitors" column says how many browsers.
 */

import type { OrderRow } from "@/lib/campaignReport";

export type PersonCodeRow = {
  code: string;
  person_name: string | null;
  person_company: string | null;
  campaign: string | null;
  created_at: string;
};

export type BuyerVisitorRow = {
  visitor_id: string;
  first_code: string | null;
  first_seen_at: string;
  last_seen_at: string;
  city: string | null;
};

export type BuyerEventRow = {
  visitor_id: string;
  session_id: string | null;
  name: string;
  path: string | null;
  created_at: string;
  meta: Record<string, unknown> | null;
};

export type BuyerScanRow = { code: string; visitor_id: string | null; created_at: string };

export type BuyerLeadRow = {
  visitor_id: string | null;
  campaign_code: string | null;
  name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  stage: string | null;
  chosen_plan: string | null;
  recommended_plan: string | null;
  quoted_total_inr: number | null;
  factory_city: string | null;
  industry: string | null;
  order_id: string | null;
};

/** How far a buyer has got, strongest first. */
export type Interest = "hot" | "warm" | "opened" | "not_opened";

export type PageStat = {
  path: string;
  label: string;
  views: number;
  seconds: number;
  /** Furthest they scrolled on this page, 0–100. */
  scroll: number;
};

export type BuyerStat = {
  code: string;
  name: string;
  company: string | null;
  batch: string | null;
  interest: Interest;
  /** Taps on the QR, counted on our server. */
  scans: number;
  /** Distinct browsers behind this code. */
  visitors: number;
  /** Separate visits (a gap of 30 idle minutes starts a new one). */
  visits: number;
  pageViews: number;
  /** Seconds a page was actually in front of them, all pages together. */
  activeSeconds: number;
  firstOpenedAt: string | null;
  lastSeenAt: string | null;
  city: string | null;
  /** The pages they spent the longest on, most time first. */
  pages: PageStat[];
  /** The one page that held their attention. */
  topPage: PageStat | null;
  /** Furthest assessment step reached, or null if they never started it. */
  stage: string | null;
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

const STAGE_RANK: Record<string, number> = {
  info: 1,
  scope: 2,
  security: 3,
  plan: 4,
  sales: 5,
  billing: 6,
  paid: 7,
};

/** Seconds on the site before "they actually read something". */
export const WARM_SECONDS = 60;

/** Query strings and trailing slashes are not different pages. */
export function pagePath(raw: string | null | undefined): string {
  if (!raw) return "/";
  const noQuery = raw.split("?")[0]!.split("#")[0]!;
  const trimmed = noQuery.replace(/\/+$/, "");
  return trimmed || "/";
}

const PAGE_NAMES: Record<string, string> = {
  "/": "Home",
  "/plans": "Plans & pricing",
  "/case-studies": "Case studies",
  "/how-it-works": "How it works",
  "/faq": "FAQ",
  "/why-vpv": "Why VPV",
  "/about": "About",
  "/apply": "Apply",
  "/booking": "Booking",
  "/order-confirmation": "Order confirmation",
  "/assessment": "Assessment: start",
  "/assessment/scope": "Assessment: factory scope",
  "/assessment/security": "Assessment: security",
  "/assessment/plan": "Assessment: plan",
  "/assessment/sales": "Assessment: sales",
  "/assessment/billing": "Assessment: bill",
  "/contact": "Contact",
  "/security": "Security",
  "/privacy": "Privacy",
  "/terms": "Terms",
  "/cookies": "Cookie policy",
};

export function pageLabel(path: string): string {
  return PAGE_NAMES[pagePath(path)] ?? pagePath(path);
}

type Acc = {
  visitorIds: Set<string>;
  sessions: Set<string>;
  pageViews: number;
  seconds: number;
  firstAt: number | null;
  lastAt: number | null;
  city: string | null;
  pages: Map<string, PageStat>;
};

const ms = (iso: string) => new Date(iso).getTime();

export function buyerReport(input: {
  people: PersonCodeRow[];
  visitors: BuyerVisitorRow[];
  events: BuyerEventRow[];
  scans: BuyerScanRow[];
  leads: BuyerLeadRow[];
  orders: OrderRow[];
}): BuyerStat[] {
  const { people, visitors, events, scans, leads, orders } = input;
  // Codes are matched without regard to case, as the /q route does.
  const known = new Set(people.map((p) => p.code.toUpperCase()));

  // visitor -> the person code(s) they belong to. First touch, plus anyone
  // who scanned a code even though they had arrived some other way first.
  const owners = new Map<string, Set<string>>();
  const own = (visitorId: string, code: string) => {
    const c = code.toUpperCase();
    if (!known.has(c)) return;
    let s = owners.get(visitorId);
    if (!s) owners.set(visitorId, (s = new Set()));
    s.add(c);
  };
  for (const v of visitors) if (v.first_code) own(v.visitor_id, v.first_code);

  const scanCount = new Map<string, number>();
  const firstScan = new Map<string, number>();
  for (const s of scans) {
    const c = s.code.toUpperCase();
    if (!known.has(c)) continue;
    scanCount.set(c, (scanCount.get(c) ?? 0) + 1);
    const t = ms(s.created_at);
    if (!firstScan.has(c) || t < firstScan.get(c)!) firstScan.set(c, t);
    if (s.visitor_id) own(s.visitor_id, c);
  }

  const acc = new Map<string, Acc>();
  const get = (c: string): Acc => {
    let a = acc.get(c);
    if (!a) {
      acc.set(
        c,
        (a = {
          visitorIds: new Set(),
          sessions: new Set(),
          pageViews: 0,
          seconds: 0,
          firstAt: null,
          lastAt: null,
          city: null,
          pages: new Map(),
        })
      );
    }
    return a;
  };

  for (const [vid, codes] of owners) for (const c of codes) get(c).visitorIds.add(vid);
  for (const v of visitors) {
    for (const c of owners.get(v.visitor_id) ?? []) {
      const a = get(c);
      if (!a.city && v.city) a.city = v.city;
    }
  }

  const stat = (a: Acc, path: string): PageStat => {
    const p = pagePath(path);
    let s = a.pages.get(p);
    if (!s) a.pages.set(p, (s = { path: p, label: pageLabel(p), views: 0, seconds: 0, scroll: 0 }));
    return s;
  };

  for (const e of events) {
    const codes = owners.get(e.visitor_id);
    if (!codes) continue;
    const t = ms(e.created_at);
    for (const c of codes) {
      const a = get(c);
      if (e.session_id) a.sessions.add(e.session_id);
      if (a.firstAt === null || t < a.firstAt) a.firstAt = t;
      if (a.lastAt === null || t > a.lastAt) a.lastAt = t;
      if (e.name === "page_view") {
        a.pageViews += 1;
        stat(a, e.path ?? "/").views += 1;
      } else if (e.name === "page_time") {
        const sec = Number(e.meta?.seconds);
        const scroll = Number(e.meta?.scroll);
        if (Number.isFinite(sec) && sec > 0) {
          const s = Math.min(1800, Math.round(sec));
          a.seconds += s;
          stat(a, e.path ?? "/").seconds += s;
        }
        if (Number.isFinite(scroll)) {
          const ps = stat(a, e.path ?? "/");
          ps.scroll = Math.max(ps.scroll, Math.min(100, Math.round(scroll)));
        }
      }
    }
  }

  // The lead: by browser first, then by the code stamped on the lead itself.
  const paidAmount = new Map<string, number>();
  for (const o of orders) {
    if (o.status === "paid") paidAmount.set(o.id, Math.round((o.amount_paise ?? 0) / 100));
  }
  const leadFor = new Map<string, BuyerLeadRow>();
  const better = (x: BuyerLeadRow, y: BuyerLeadRow | undefined) =>
    !y || (STAGE_RANK[x.stage ?? ""] ?? 0) > (STAGE_RANK[y.stage ?? ""] ?? 0);
  for (const l of leads) {
    const codes = new Set<string>();
    if (l.campaign_code && known.has(l.campaign_code.toUpperCase())) codes.add(l.campaign_code.toUpperCase());
    if (l.visitor_id) for (const c of owners.get(l.visitor_id) ?? []) codes.add(c);
    for (const c of codes) if (better(l, leadFor.get(c))) leadFor.set(c, l);
  }

  const rows: BuyerStat[] = people.map((p) => {
    const c = p.code.toUpperCase();
    const a = acc.get(c);
    const lead = leadFor.get(c) ?? null;
    const scansN = scanCount.get(c) ?? 0;
    const opened = scansN > 0 || (a?.visitorIds.size ?? 0) > 0;
    const pages = [...(a?.pages.values() ?? [])].sort(
      (x, y) => y.seconds - x.seconds || y.views - x.views || x.path.localeCompare(y.path)
    );
    const seconds = a?.seconds ?? 0;
    const stage = lead?.stage ?? null;
    const rank = STAGE_RANK[stage ?? ""] ?? 0;
    const paid = !!lead?.order_id && paidAmount.has(lead.order_id);

    // Hot: past choosing a plan, or paid. Warm: started the assessment, or
    // read for a minute across more than one page, or looked at pricing or
    // a case study. Opened: scanned and looked, nothing more.
    const looked = new Set(pages.map((x) => x.path));
    let interest: Interest = "not_opened";
    if (opened) interest = "opened";
    if (
      lead ||
      (seconds >= WARM_SECONDS && looked.size >= 2) ||
      looked.has("/plans") ||
      looked.has("/case-studies")
    ) {
      interest = "warm";
    }
    if (paid || rank >= STAGE_RANK.plan!) interest = "hot";

    const firstAt = [a?.firstAt ?? null, firstScan.get(c) ?? null].filter((x): x is number => x !== null);
    const lastAt = a?.lastAt ?? firstScan.get(c) ?? null;

    return {
      code: p.code,
      name: p.person_name ?? p.code,
      company: p.person_company,
      batch: p.campaign,
      interest,
      scans: scansN,
      visitors: a?.visitorIds.size ?? 0,
      visits: opened ? Math.max(1, a?.sessions.size ?? 0) : 0,
      pageViews: a?.pageViews ?? 0,
      activeSeconds: seconds,
      firstOpenedAt: firstAt.length ? new Date(Math.min(...firstAt)).toISOString() : null,
      lastSeenAt: lastAt !== null ? new Date(lastAt).toISOString() : null,
      city: a?.city ?? null,
      pages: pages.slice(0, 8),
      topPage: pages.find((x) => x.seconds > 0) ?? pages[0] ?? null,
      stage,
      lead: lead
        ? {
            name: lead.name,
            company: lead.company,
            phone: lead.phone,
            email: lead.email,
            plan: lead.chosen_plan ?? lead.recommended_plan,
            quotedInr: lead.quoted_total_inr,
            factoryCity: lead.factory_city,
            industry: lead.industry,
          }
        : null,
      paid,
      revenueInr: paid && lead?.order_id ? (paidAmount.get(lead.order_id) ?? 0) : 0,
    };
  });

  const order: Record<Interest, number> = { hot: 0, warm: 1, opened: 2, not_opened: 3 };
  rows.sort(
    (x, y) =>
      order[x.interest] - order[y.interest] ||
      y.revenueInr - x.revenueInr ||
      y.activeSeconds - x.activeSeconds ||
      y.scans - x.scans ||
      x.name.localeCompare(y.name)
  );
  return rows;
}

export type BuyerSummary = {
  people: number;
  opened: number;
  /** 0–100, whole numbers. */
  openedPct: number;
  warm: number;
  hot: number;
  paid: number;
  revenueInr: number;
  /** Average over the people who opened AND have time recorded. */
  avgSeconds: number;
  /** Which pages held people longest, across everyone: the audience's mind. */
  topPages: { path: string; label: string; seconds: number; people: number }[];
};

export function buyerSummary(rows: BuyerStat[]): BuyerSummary {
  const opened = rows.filter((r) => r.interest !== "not_opened");
  const timed = opened.filter((r) => r.activeSeconds > 0);
  const byPage = new Map<string, { label: string; seconds: number; people: number }>();
  for (const r of rows) {
    for (const p of r.pages) {
      if (p.seconds <= 0) continue;
      const cur = byPage.get(p.path) ?? { label: p.label, seconds: 0, people: 0 };
      cur.seconds += p.seconds;
      cur.people += 1;
      byPage.set(p.path, cur);
    }
  }
  return {
    people: rows.length,
    opened: opened.length,
    openedPct: rows.length ? Math.round((opened.length / rows.length) * 100) : 0,
    warm: rows.filter((r) => r.interest === "warm" || r.interest === "hot").length,
    hot: rows.filter((r) => r.interest === "hot").length,
    paid: rows.filter((r) => r.paid).length,
    revenueInr: rows.reduce((n, r) => n + r.revenueInr, 0),
    avgSeconds: timed.length ? Math.round(timed.reduce((n, r) => n + r.activeSeconds, 0) / timed.length) : 0,
    topPages: [...byPage.entries()]
      .map(([path, v]) => ({ path, ...v }))
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 6),
  };
}

export type JourneyItem = {
  at: string;
  kind: "page" | "step";
  label: string;
  path: string | null;
  /** Seconds they stayed on this page visit, when known. */
  seconds: number | null;
  /** Furthest scroll on it, when known. */
  scroll: number | null;
};

/**
 * One person's visit as a timeline: each page, how long they stayed, how far
 * down they read, and the assessment steps they reached in between.
 * `events` may be in any order.
 */
export function buyerJourney(events: BuyerEventRow[]): JourneyItem[] {
  const sorted = [...events].sort(
    (a, b) => ms(a.created_at) - ms(b.created_at) || a.name.localeCompare(b.name)
  );
  const items: JourneyItem[] = [];
  const open = new Map<string, JourneyItem>(); // path -> the latest visit to it

  for (const e of sorted) {
    if (e.name === "page_view") {
      const path = pagePath(e.path);
      const item: JourneyItem = {
        at: e.created_at,
        kind: "page",
        label: pageLabel(path),
        path,
        seconds: null,
        scroll: null,
      };
      items.push(item);
      open.set(path, item);
    } else if (e.name === "page_time") {
      const item = open.get(pagePath(e.path));
      if (!item) continue;
      const sec = Number(e.meta?.seconds);
      const scroll = Number(e.meta?.scroll);
      if (Number.isFinite(sec) && sec > 0) item.seconds = (item.seconds ?? 0) + Math.min(1800, Math.round(sec));
      if (Number.isFinite(scroll)) item.scroll = Math.max(item.scroll ?? 0, Math.min(100, Math.round(scroll)));
    } else if (e.name === "funnel_step") {
      const step = typeof e.meta?.step === "string" ? e.meta.step : null;
      if (step) {
        items.push({
          at: e.created_at,
          kind: "step",
          label: `Reached the “${step}” step of the assessment`,
          path: null,
          seconds: null,
          scroll: null,
        });
      }
    }
  }
  return items;
}

/** 135 -> "2 min 15 s". Under a minute: "40 s". Nothing: "—". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h} h ${m % 60} min`;
  }
  return s ? `${m} min ${s} s` : `${m} min`;
}
