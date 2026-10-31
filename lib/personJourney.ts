/**
 * lib/personJourney.ts — one person's whole story, in order.
 *
 *   Tue 28 Oct, 7:42 pm · Visit 1 · iPhone · Safari · Delhi
 *     Scanned the card
 *     Viewed Home                         48 s · read 80%
 *     Clicked “See pricing”
 *     Viewed Plans & pricing              2 min 5 s · read 100%
 *       Picked the Standard plan
 *       Opened FAQ: “Do you offer EMI?”
 *     Moved to close the tab
 *   Thu 30 Oct, 11:05 am · Visit 2 · Windows · Chrome · Delhi
 *     Viewed Assessment: the bill          3 min 12 s
 *     Reached: the bill
 *
 * This answers the question the table cannot: not "how far did they get" but
 * "what did they actually do, and when". It is the part of Google Analytics
 * that matters for a printed card, filtered down to ONE named human.
 *
 * It does not reimplement the numbers. The headline figures (visits, time,
 * stage, interest) come from folderDetail with this single code in it, so the
 * person's page and the campaign table can never disagree about the same
 * person. Only the narrative is built here.
 *
 * Pure: rows in, a story out. Tested without a database.
 */

import { journeyStartMs, scopeEvents } from "@/lib/journeyScope";
import {
  folderDetail,
  type FolderCodeRow,
  type FolderEventRow,
  type FolderPerson,
  type FolderRow,
  type FolderScanRow,
  type FolderVisitorRow,
} from "@/lib/campaignFolders";
import type { OrderRow } from "@/lib/campaignReport";
import { formatSeconds } from "@/lib/interest";
import {
  FUNNEL_STAGES,
  STAGE_RANK,
  pageLabel,
  pagePath,
  stageLabel,
} from "@/lib/analytics/signals";

/* ───────────────────────────── the rows in ──────────────────────────────── */

/** Everything the enquiry form collected. A superset of FolderLeadRow. */
export type JourneyLeadRow = {
  id: string;
  created_at: string;
  updated_at: string | null;
  visitor_id: string | null;
  campaign_code: string | null;
  stage: string | null;
  name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  email_verified_at: string | null;
  industry: string | null;
  industry_text: string | null;
  factory_city: string | null;
  factory_state: string | null;
  plot_size: string | null;
  areas: string[] | null;
  processes: string[] | null;
  aoa_count: number | null;
  video_count: number | null;
  pdf_count: number | null;
  wants_sharing_controls: boolean | null;
  recommended_plan: string | null;
  chosen_plan: string | null;
  extra_areas: number | null;
  extra_videos: number | null;
  quoted_total_inr: number | null;
  has_sales_team: boolean | null;
  sales_seats: number | null;
  terms_accepted_at: string | null;
  marketing_consent: boolean | null;
  order_id: string | null;
};

export type JourneyOrderRow = OrderRow & {
  created_at: string | null;
  paid_at: string | null;
  refunded_paise: number | null;
  buyer_name: string | null;
  buyer_email: string | null;
  buyer_phone: string | null;
  buyer_company: string | null;
  buyer_city: string | null;
};

/* ──────────────────────────── the story out ─────────────────────────────── */

export type JourneyTone = "neutral" | "good" | "warn" | "bad";

export type JourneyItem = {
  at: string;
  kind: "scan" | "page" | "action" | "step" | "lead" | "order" | "outreach";
  tone: JourneyTone;
  /** One line, in words: "Opened FAQ: “Do you offer EMI?”". */
  title: string;
  /** The small print: "2 min 5 s · read 100%". */
  detail: string | null;
};

export type JourneyStop = {
  path: string;
  label: string;
  at: string;
  /** Seconds on the page; null when the page never reported leaving. */
  seconds: number | null;
  /** Deepest scroll, 0–100; null when unknown. */
  scroll: number | null;
  sections: string[];
  actions: string[];
};

export type JourneyVisit = {
  /** 1-based, oldest first. */
  n: number;
  startedAt: string;
  endedAt: string;
  /** Time the page was actually in front of them. */
  activeSeconds: number;
  /** First to last sign of life, wall clock. */
  spanSeconds: number;
  device: string | null;
  os: string | null;
  browser: string | null;
  city: string | null;
  /** How this visit began, in words. */
  how: string;
  scanned: boolean;
  stops: JourneyStop[];
  items: JourneyItem[];
};

export type JourneyLead = {
  id: string;
  startedAt: string;
  updatedAt: string | null;
  stage: string | null;
  stageLabel: string;
  name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  emailVerified: boolean;
  industry: string | null;
  factoryCity: string | null;
  factoryState: string | null;
  plotSize: string | null;
  areas: string[];
  processes: string[];
  aoaCount: number | null;
  videoCount: number | null;
  pdfCount: number | null;
  wantsSharingControls: boolean | null;
  recommendedPlan: string | null;
  chosenPlan: string | null;
  extraAreas: number | null;
  extraVideos: number | null;
  quotedTotalInr: number | null;
  hasSalesTeam: boolean | null;
  salesSeats: number | null;
  termsAcceptedAt: string | null;
  marketingConsent: boolean | null;
};

export type JourneyOrder = {
  id: string;
  status: string;
  amountInr: number;
  createdAt: string | null;
  paidAt: string | null;
  refundedInr: number;
  buyerName: string | null;
  buyerEmail: string | null;
  buyerPhone: string | null;
  buyerCompany: string | null;
  buyerCity: string | null;
};

export type LadderStep = {
  key: string;
  label: string;
  reached: boolean;
  /** When they first reached it, if we saw them do it. */
  reachedAt: string | null;
};

export type Journey = {
  /** The very row the campaign table shows for this person. */
  person: FolderPerson;
  folder: { slug: string; name: string; city: string | null };
  visits: JourneyVisit[];
  /** Lead, order and follow-up events: things that happen outside a visit. */
  milestones: JourneyItem[];
  ladder: LadderStep[];
  lead: JourneyLead | null;
  order: JourneyOrder | null;
  /** Pages by time spent, across every visit. */
  pages: FolderPerson["pages"];
};

/* ──────────────────────────────── helpers ───────────────────────────────── */

/** Silence this long and the next sign of life is a new visit. */
const VISIT_GAP_MS = 30 * 60 * 1000;
/** A page cannot have been read for longer than this; a tab left open can. */
const MAX_PAGE_SECONDS = 1800;

const ms = (iso: string) => new Date(iso).getTime();
const iso = (t: number) => new Date(t).toISOString();

function str(meta: Record<string, unknown> | null | undefined, key: string, max = 120): string | null {
  const v = meta?.[key];
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, max);
  return s.length ? s : null;
}

function num(meta: Record<string, unknown> | null | undefined, key: string): number | null {
  const v = meta?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

function hostOf(href: string | null): string | null {
  if (!href) return null;
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** The plan as a person would say it: "standard" -> "Standard". */
const planName = (raw: string | null) => (raw ? cap(raw.replace(/[_-]+/g, " ").trim()) : null);

/**
 * One tracked event as one line of English, or null when it is folded into
 * the page it happened on (page views, time on page, scroll, sections and
 * field fills are shown as part of the page, not as rows of their own).
 */
export function describeEvent(
  e: Pick<FolderEventRow, "name" | "path" | "meta">
): { title: string; detail: string | null; tone: JourneyTone } | null {
  const m = e.meta;
  const label = str(m, "label", 80);
  const onPrice = (() => {
    const p = pagePath(e.path);
    return p === "/plans" || p === "/pricing" || p.startsWith("/assessment/billing") || p.startsWith("/assessment/price");
  })();

  switch (e.name) {
    case "page_view":
    case "page_time":
    case "scroll_depth":
    case "section_view":
    case "form_field_blur":
      return null;

    case "cta_click":
      return { title: label ? `Clicked “${label}”` : "Clicked a button", detail: null, tone: "neutral" };
    case "plan_selected": {
      const plan = planName(str(m, "plan"));
      return {
        title: plan ? `Picked the ${plan} plan` : "Picked a plan",
        detail: label,
        tone: "good",
      };
    }
    case "pay_click":
      return { title: label ? `Clicked “${label}”` : "Clicked pay", detail: "At the payment step", tone: "good" };
    case "coupon_applied":
      return { title: "Applied a coupon code", detail: null, tone: "neutral" };
    case "faq_open": {
      const q = str(m, "question") ?? label;
      return { title: q ? `Opened FAQ: “${q}”` : "Opened a FAQ answer", detail: null, tone: "neutral" };
    }
    case "price_toggle":
      return { title: "Switched the price view", detail: str(m, "mode") ?? str(m, "view"), tone: "neutral" };
    case "tel_click":
      return { title: "Tapped to call us", detail: label, tone: "good" };
    case "whatsapp_click":
      return { title: "Tapped WhatsApp", detail: label, tone: "good" };
    case "email_click":
      return { title: "Tapped to email us", detail: label, tone: "good" };
    case "outbound_click": {
      const host = hostOf(str(m, "href", 200));
      return { title: host ? `Left the site for ${host}` : "Left the site through a link", detail: label, tone: "neutral" };
    }
    case "video_play":
      return { title: "Played a video", detail: label, tone: "good" };
    case "tour_opened":
      return { title: "Opened a sample tour", detail: label, tone: "good" };
    case "exit_intent":
      return {
        title: onPrice ? "Moved to close the tab while on the price" : "Moved to close the tab",
        detail: null,
        tone: onPrice ? "bad" : "warn",
      };
    case "form_abandon": {
      const f = str(m, "field");
      return { title: f ? `Stopped filling the form at “${f}”` : "Stopped filling the form", detail: null, tone: "bad" };
    }
    case "form_error": {
      const f = str(m, "field");
      return { title: f ? `Hit an error on “${f}”` : "Hit a form error", detail: str(m, "message"), tone: "warn" };
    }
    case "rage_click":
      return {
        title: label ? `Clicked “${label}” again and again` : "Clicked the same spot again and again",
        detail: "Nothing happened. Something is not working for them.",
        tone: "bad",
      };
    case "dead_click":
      return {
        title: label ? `Clicked “${label}” and nothing happened` : "Clicked something that did nothing",
        detail: null,
        tone: "warn",
      };
    case "copy_text":
      return { title: "Copied text from the page", detail: null, tone: "neutral" };
    case "print_page":
      return { title: "Printed the page", detail: null, tone: "good" };
    case "funnel_step": {
      const step = str(m, "step");
      return { title: `Reached: ${stageLabel(step)}`, detail: null, tone: "good" };
    }
    default:
      return { title: cap(e.name.replace(/_/g, " ")), detail: null, tone: "neutral" };
  }
}

/* ──────────────────────────── building the story ────────────────────────── */

type Moment =
  | { t: number; kind: "scan"; scan: FolderScanRow }
  | { t: number; kind: "event"; event: FolderEventRow };

export function personJourney(input: {
  folder: FolderRow;
  code: FolderCodeRow;
  /** Every scan of this code, robots included. */
  scans: FolderScanRow[];
  visitors: FolderVisitorRow[];
  events: FolderEventRow[];
  leads: JourneyLeadRow[];
  orders: JourneyOrderRow[];
}): Journey {
  const { folder, code, scans, visitors, events, leads, orders } = input;

  /* The headline numbers come from the same code the table uses. */
  const detail = folderDetail({ folder, codes: [code], scans, visitors, events, leads, orders });
  const person = detail.roster[0]!;

  const visitorById = new Map(visitors.map((v) => [v.visitor_id, v]));
  const humanScans = scans.filter((s) => s.device !== "bot");

  /* ── 1. every sign of life, grouped by the browser it came from ─────────── */
  const byBrowser = new Map<string, Moment[]>();
  const push = (key: string, m: Moment) => {
    let list = byBrowser.get(key);
    if (!list) byBrowser.set(key, (list = []));
    list.push(m);
  };
  for (const s of humanScans) push(s.visitor_id ?? "no-cookie", { t: ms(s.created_at), kind: "scan", scan: s });
  {
    // The person's own pages only: public pages, from the scan on (see journeyScope).
    const byVisitor = new Map<string, FolderEventRow[]>();
    for (const e of events) {
      const list = byVisitor.get(e.visitor_id) ?? [];
      list.push(e);
      byVisitor.set(e.visitor_id, list);
    }
    const startMs = journeyStartMs(
      code.code,
      humanScans.map((s) => s.created_at),
      events
    );
    for (const list of byVisitor.values()) {
      for (const e of scopeEvents(list, startMs)) push(e.visitor_id, { t: ms(e.created_at), kind: "event", event: e });
    }
  }

  /* ── 2. split each browser's moments into visits ───────────────────────── */
  const groups: { key: string; moments: Moment[] }[] = [];
  for (const [key, list] of byBrowser) {
    list.sort((a, b) => a.t - b.t);
    let cur: Moment[] = [];
    for (const m of list) {
      const prev = cur[cur.length - 1];
      if (prev && m.t - prev.t > VISIT_GAP_MS) {
        groups.push({ key, moments: cur });
        cur = [];
      }
      cur.push(m);
    }
    if (cur.length) groups.push({ key, moments: cur });
  }
  groups.sort((a, b) => a.moments[0]!.t - b.moments[0]!.t);

  /* The first human scan is "the card was opened"; any later one is the same
     card coming out again, on this phone or somebody else's. */
  const orderedScans = [...humanScans].sort((a, b) => ms(a.created_at) - ms(b.created_at));
  const firstScan = orderedScans[0] ?? null;

  const visits: JourneyVisit[] = groups.map((g, idx) => {
    const v = g.key === "no-cookie" ? undefined : visitorById.get(g.key);
    const stops: JourneyStop[] = [];
    const items: JourneyItem[] = [];
    let active = 0;
    let scanInVisit: FolderScanRow | null = null;
    let device: string | null = v?.device ?? null;
    let os: string | null = v?.os ?? null;
    let browser: string | null = v?.browser ?? null;
    let city: string | null = v?.city ?? null;

    const stopFor = (path: string, at: number): JourneyStop => {
      const last = stops[stops.length - 1];
      if (last && last.path === path) return last;
      const s: JourneyStop = {
        path,
        label: pageLabel(path),
        at: iso(at),
        seconds: null,
        scroll: null,
        sections: [],
        actions: [],
      };
      stops.push(s);
      return s;
    };

    for (const m of g.moments) {
      if (m.kind === "scan") {
        const s = m.scan;
        scanInVisit = scanInVisit ?? s;
        device = device ?? s.device;
        os = os ?? s.os ?? null;
        browser = browser ?? s.browser ?? null;
        const first = firstScan && s.created_at === firstScan.created_at && s.code === firstScan.code;
        items.push({
          at: s.created_at,
          kind: "scan",
          tone: "good",
          title: first ? "Scanned the card" : "Scanned the card again",
          detail: first
            ? null
            : s.is_repeat
              ? "The card was opened before: shown to someone, or opened again on another phone."
              : null,
        });
        continue;
      }

      const e = m.event;
      const path = pagePath(e.path);

      switch (e.name) {
        case "page_view": {
          // A new page view always opens a new stop, even on the same path:
          // two loads of the pricing page are two looks at the price.
          const s: JourneyStop = {
            path,
            label: pageLabel(path),
            at: e.created_at,
            seconds: null,
            scroll: null,
            sections: [],
            actions: [],
          };
          stops.push(s);
          break;
        }
        case "page_time": {
          const sec = num(e.meta, "seconds");
          const scroll = num(e.meta, "scroll");
          // The report arrives as they LEAVE: it belongs to the latest stop
          // on this path that has not been closed yet.
          let target: JourneyStop | undefined;
          for (let i = stops.length - 1; i >= 0; i--) {
            if (stops[i]!.path === path && stops[i]!.seconds === null) {
              target = stops[i];
              break;
            }
          }
          if (!target) target = stopFor(path, m.t - Math.round((sec ?? 0) * 1000));
          if (sec !== null && sec > 0) {
            const capped = Math.min(MAX_PAGE_SECONDS, Math.round(sec));
            target.seconds = (target.seconds ?? 0) + capped;
            active += capped;
          } else if (target.seconds === null) {
            target.seconds = 0;
          }
          if (scroll !== null) target.scroll = Math.max(target.scroll ?? 0, Math.min(100, Math.round(scroll)));
          break;
        }
        case "scroll_depth": {
          const d = num(e.meta, "depth");
          const s = stopFor(path, m.t);
          if (d !== null) s.scroll = Math.max(s.scroll ?? 0, Math.min(100, Math.round(d)));
          break;
        }
        case "section_view": {
          const sec = str(e.meta, "section", 80);
          const s = stopFor(path, m.t);
          if (sec && !s.sections.includes(sec)) s.sections.push(sec);
          break;
        }
        case "form_field_blur": {
          const f = str(e.meta, "field", 60);
          const s = stopFor(path, m.t);
          if (f && !s.actions.includes(`filled ${f}`)) s.actions.push(`filled ${f}`);
          break;
        }
        default: {
          const d = describeEvent(e);
          if (d) {
            const s = stopFor(path, m.t);
            s.actions.push(d.title);
            items.push({ at: e.created_at, kind: e.name === "funnel_step" ? "step" : "action", ...d });
          }
        }
      }
    }

    /* A page's row is written once its time is known, and dated when it began. */
    for (const s of stops) {
      const bits: string[] = [];
      if (s.seconds !== null && s.seconds > 0) bits.push(`${formatSeconds(s.seconds)} on the page`);
      else if (s.seconds === 0) bits.push("left almost at once");
      if (s.scroll !== null) bits.push(`read ${s.scroll}% of it`);
      const filled = s.actions.filter((a) => a.startsWith("filled "));
      if (filled.length) bits.push(`${filled.map((a) => a.slice(7)).join(", ")} filled in`);
      items.push({
        at: s.at,
        kind: "page",
        tone: "neutral",
        title: `Viewed ${s.label}`,
        detail: bits.length ? bits.join(" · ") : null,
      });
    }
    items.sort((a, b) => ms(a.at) - ms(b.at));

    const startedAt = g.moments[0]!.t;
    const endedAt = g.moments[g.moments.length - 1]!.t;

    const how = scanInVisit
      ? "Scanned the QR card"
      : idx === 0 && v?.first_source && v.first_source !== "direct"
        ? `Arrived from ${v.first_source}`
        : idx === 0
          ? "Came straight to the site"
          : "Came back to the site";

    return {
      n: idx + 1,
      startedAt: iso(startedAt),
      endedAt: iso(endedAt),
      activeSeconds: active,
      spanSeconds: Math.max(0, Math.round((endedAt - startedAt) / 1000)),
      device,
      os,
      browser,
      city,
      how,
      scanned: scanInVisit !== null,
      stops,
      items,
    };
  });

  /* ── 3. the lead and the order, in display form ────────────────────────── */
  const rank = (l: JourneyLeadRow) => STAGE_RANK[l.stage ?? ""] ?? 0;
  const mine = leads
    .filter(
      (l) =>
        (l.campaign_code && l.campaign_code.toUpperCase() === code.code.toUpperCase()) ||
        (l.visitor_id && visitors.some((v) => v.visitor_id === l.visitor_id))
    )
    .sort((a, b) => rank(b) - rank(a) || ms(b.updated_at ?? b.created_at) - ms(a.updated_at ?? a.created_at));
  const l = mine[0] ?? null;

  const lead: JourneyLead | null = l
    ? {
        id: l.id,
        startedAt: l.created_at,
        updatedAt: l.updated_at,
        stage: l.stage,
        stageLabel: stageLabel(l.stage),
        name: l.name,
        company: l.company,
        phone: l.phone,
        email: l.email,
        emailVerified: !!l.email_verified_at,
        industry: l.industry_text || l.industry,
        factoryCity: l.factory_city,
        factoryState: l.factory_state,
        plotSize: l.plot_size,
        areas: l.areas ?? [],
        processes: l.processes ?? [],
        aoaCount: l.aoa_count,
        videoCount: l.video_count,
        pdfCount: l.pdf_count,
        wantsSharingControls: l.wants_sharing_controls,
        recommendedPlan: l.recommended_plan,
        chosenPlan: l.chosen_plan,
        extraAreas: l.extra_areas,
        extraVideos: l.extra_videos,
        quotedTotalInr: l.quoted_total_inr,
        hasSalesTeam: l.has_sales_team,
        salesSeats: l.sales_seats,
        termsAcceptedAt: l.terms_accepted_at,
        marketingConsent: l.marketing_consent,
      }
    : null;

  const o = l?.order_id ? orders.find((x) => x.id === l.order_id) ?? null : null;
  const order: JourneyOrder | null = o
    ? {
        id: o.id,
        status: o.status ?? "unknown",
        amountInr: Math.round((o.amount_paise ?? 0) / 100),
        createdAt: o.created_at,
        paidAt: o.paid_at,
        refundedInr: Math.round((o.refunded_paise ?? 0) / 100),
        buyerName: o.buyer_name,
        buyerEmail: o.buyer_email,
        buyerPhone: o.buyer_phone,
        buyerCompany: o.buyer_company,
        buyerCity: o.buyer_city,
      }
    : null;

  /* ── 4. milestones outside a visit ─────────────────────────────────────── */
  const milestones: JourneyItem[] = [];
  if (l) {
    milestones.push({
      at: l.created_at,
      kind: "lead",
      tone: "good",
      title: "Started the enquiry form",
      detail: l.name ? `As ${l.name}${l.company ? `, ${l.company}` : ""}` : null,
    });
    if (l.terms_accepted_at)
      milestones.push({ at: l.terms_accepted_at, kind: "lead", tone: "neutral", title: "Accepted the terms", detail: null });
    if (l.email_verified_at)
      milestones.push({ at: l.email_verified_at, kind: "lead", tone: "good", title: "Verified their email", detail: l.email });
  }
  if (order) {
    if (order.createdAt)
      milestones.push({
        at: order.createdAt,
        kind: "order",
        tone: "good",
        title: `Created an order for ₹${order.amountInr.toLocaleString("en-IN")}`,
        detail: null,
      });
    if (order.paidAt)
      milestones.push({
        at: order.paidAt,
        kind: "order",
        tone: "good",
        title: `Paid ₹${order.amountInr.toLocaleString("en-IN")}`,
        detail: null,
      });
  }
  if (code.contacted_at) {
    milestones.push({
      at: code.contacted_at,
      kind: "outreach",
      tone: "neutral",
      title: "You followed up",
      detail: code.outreach_state && code.outreach_state !== "new" ? code.outreach_state.replace(/_/g, " ") : null,
    });
  }
  milestones.sort((a, b) => ms(a.at) - ms(b.at));

  /* ── 5. the ladder, with when each rung was first reached ──────────────── */
  const stepAt = new Map<string, number>();
  for (const e of events) {
    if (e.name !== "funnel_step") continue;
    const step = str(e.meta, "step");
    if (!step) continue;
    const t = ms(e.created_at);
    const prev = stepAt.get(step);
    if (prev === undefined || t < prev) stepAt.set(step, t);
  }
  const personRank = STAGE_RANK[person.stage ?? ""] ?? 0;
  const ladder: LadderStep[] = FUNNEL_STAGES.map((s) => ({
    key: s.key,
    label: s.label,
    reached: (STAGE_RANK[s.key] ?? 0) <= personRank,
    reachedAt: s.key === "paid" ? order?.paidAt ?? null : stepAt.has(s.key) ? iso(stepAt.get(s.key)!) : null,
  }));

  return {
    person,
    folder: { slug: folder.slug, name: folder.name, city: folder.city },
    visits,
    milestones,
    ladder,
    lead,
    order,
    pages: person.pages,
  };
}
