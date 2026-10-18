/**
 * lib/funnel.ts — the visitor's answers as they move through the VPV
 * pricing funnel, and the rule that turns those answers into a plan.
 *
 * Five steps, each its own page, and each one needs what the steps before
 * it collected. The answers live in the visitor's own browser between
 * steps (nothing here is a source of truth for money) and are mirrored to
 * `funnel_leads` on the server after every step so a rep can call back
 * somebody who dropped out halfway.
 *
 * ┌─ WHAT THIS FILE IS NOT ───────────────────────────────────────────┐
 * │ It never decides a price. The recommendation page shows numbers    │
 * │ from siteQuote() in lib/pricing.ts, and /api/billing/order prices  │
 * │ the order again from the same function before charging a card. A   │
 * │ visitor who edits their own localStorage changes what they SEE and │
 * │ what they ask to buy, never the rate they are charged for it.      │
 * └───────────────────────────────────────────────────────────────────┘
 */

import { SITE_PLAN_ORDER, SITE_PLANS, type SitePlanId } from "@/lib/pricing";

/** Where the visitor has got to. Mirrors funnel_leads.stage. */
export type FunnelStage = "info" | "scope" | "security" | "plan" | "billing" | "paid";

export type FunnelState = {
  /** The funnel_leads row for this visitor, once the first step is saved. */
  leadId: string | null;

  /* Step 1 — who they are and where the factory is. */
  name: string;
  phone: string;
  email: string;
  company: string;
  industry: string;
  industryOther: string;
  factoryCity: string;
  factoryState: string;

  /* Step 2 — the scope they want. Areas and processes are picked from the
     catalogue in lib/factoryAreas.ts; the counts follow from the picks. */
  selectedAreas: string[];
  customAreas: string[];
  selectedProcesses: string[];
  customProcesses: string[];
  aoaCount: number | null;
  videoCount: number | null;
  pdfCount: number | null;

  /* Step 3 — the security question. */
  wantsSharingControls: boolean | null;

  /* Step 4 — the plan and the add-ons. */
  chosenPlan: SitePlanId | null;
  extraAreas: number;
  extraVideos: number;

  /* Step 1 — agreement to the Terms, Privacy Policy and other policies.
     The Privacy Policy is where being contacted about this enquiry is
     explained, so agreeing to it is what lets a rep call back. */
  policiesAccepted: boolean;

  /* Step 5 — consent and verification. */
  marketingConsent: boolean;
  termsAccepted: boolean;
  emailVerified: boolean;
  gstin: string;
};

export const EMPTY_FUNNEL: FunnelState = {
  leadId: null,
  name: "",
  phone: "",
  email: "",
  company: "",
  industry: "",
  industryOther: "",
  factoryCity: "",
  factoryState: "",
  selectedAreas: [],
  customAreas: [],
  selectedProcesses: [],
  customProcesses: [],
  aoaCount: null,
  videoCount: null,
  pdfCount: null,
  wantsSharingControls: null,
  chosenPlan: null,
  extraAreas: 0,
  extraVideos: 0,
  policiesAccepted: false,
  marketingConsent: false,
  termsAccepted: false,
  emailVerified: false,
  gstin: "",
};

const KEY = "vpv.funnel.v1";

/** The visitor's answers so far. Returns a blank state on the server, in a
 *  private window, or when the stored shape is from an older version. */
export function loadFunnel(): FunnelState {
  if (typeof window === "undefined") return { ...EMPTY_FUNNEL };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY_FUNNEL };
    const parsed = JSON.parse(raw) as Partial<FunnelState>;
    // Spread over the defaults so a field added later is never undefined.
    return { ...EMPTY_FUNNEL, ...parsed };
  } catch {
    /* intentional — storage can be blocked or hold stale JSON; a blank
       funnel is always a safe answer and the visitor just re-answers. */
    return { ...EMPTY_FUNNEL };
  }
}

/** Merge a step's answers in and hand back the whole state. */
export function saveFunnel(patch: Partial<FunnelState>): FunnelState {
  const next = { ...loadFunnel(), ...patch };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* intentional — a full or blocked store must not break the funnel;
         the answers stay in React state for the rest of the visit. */
    }
  }
  return next;
}

/** Called once the purchase is done, so a second visit starts clean. */
export function clearFunnel(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* intentional — nothing to do if the store refuses. */
  }
}

/* ───────────────────────── The recommendation ────────────────────── */

export type Recommendation = {
  plan: SitePlanId;
  /** Why this one, in the buyer's own terms. */
  reasons: string[];
  /** Extras the plan does not cover, pre-set on the slider. */
  extraAreas: number;
  extraVideos: number;
  /** True when nothing in the catalogue covers the ask on its own. */
  needsExtras: boolean;
};

/**
 * The lowest plan that covers everything the visitor asked for.
 *
 * Two rules, in order:
 *
 *   1. If they said they want to stop the link reaching a competitor, it is
 *      CONTROL. One-time link expiry and share restrictions exist on no
 *      other plan and cannot be bought as an add-on, so no amount of extra
 *      areas on a cheaper plan gets them what they just said they need.
 *   2. Otherwise the cheapest plan whose areas, videos and PDFs all cover
 *      the ask. If none does, Control plus the shortfall as add-ons.
 *
 * Deliberately the LOWEST qualifying plan, not the dearest: a buyer who
 * later finds they were sold more than they needed does not renew, and the
 * annual Digital Care is where this product makes its money.
 */
export function recommendPlan(s: {
  aoaCount?: number | null;
  videoCount?: number | null;
  pdfCount?: number | null;
  wantsSharingControls?: boolean | null;
}): Recommendation {
  const aoa = Math.max(0, s.aoaCount ?? 0);
  const videos = Math.max(0, s.videoCount ?? 0);
  const pdfs = Math.max(0, s.pdfCount ?? 0);
  const reasons: string[] = [];

  if (s.wantsSharingControls === true) {
    const plan = SITE_PLANS.control;
    reasons.push(
      "You asked to stop your VPV link being shared with competitors. One-time link expiry and share restrictions are part of VPV Control only."
    );
    const extraAreas = Math.max(0, aoa - plan.scenes);
    const extraVideos = Math.max(0, videos - plan.videos);
    if (aoa > 0) reasons.push(`Covers the ${aoa} area${aoa === 1 ? "" : "s"} you chose.`);
    return {
      plan: "control",
      reasons,
      extraAreas,
      extraVideos,
      needsExtras: extraAreas > 0 || extraVideos > 0,
    };
  }

  const fit = SITE_PLAN_ORDER.find((id) => {
    const p = SITE_PLANS[id];
    return p.scenes >= aoa && p.videos >= videos && p.pdfs >= pdfs;
  });

  if (fit) {
    const p = SITE_PLANS[fit];
    reasons.push(
      `Covers the ${aoa} area${aoa === 1 ? "" : "s"} you chose, with ${p.scenes} included.`
    );
    if (videos > 0) reasons.push(`Includes ${p.videos} process videos — you asked for ${videos}.`);
    if (pdfs > 0) reasons.push(`Includes ${p.pdfs} PDF reports — you asked for ${pdfs}.`);
    return { plan: fit, reasons, extraAreas: 0, extraVideos: 0, needsExtras: false };
  }

  // Beyond every plan. Control plus the shortfall, which is also what the
  // site has always said: "Beyond plan limits: priced on request."
  const p = SITE_PLANS.control;
  const extraAreas = Math.max(0, aoa - p.scenes);
  const extraVideos = Math.max(0, videos - p.videos);
  reasons.push(`What you picked goes beyond every plan, so this is ${p.name}, our largest, with the rest added on.`);
  if (extraAreas > 0) reasons.push(`${extraAreas} extra area${extraAreas === 1 ? "" : "s"} on top of the ${p.scenes} included.`);
  if (extraVideos > 0) reasons.push(`${extraVideos} extra process video${extraVideos === 1 ? "" : "s"} on top of the ${p.videos} included.`);
  if (pdfs > p.pdfs) reasons.push(`${p.pdfs} PDF reports are included; you can add more from your dashboard.`);
  return { plan: "control", reasons, extraAreas, extraVideos, needsExtras: true };
}

/* ───────────────────────── Server mirror ─────────────────────────── */

/**
 * Mirror the visitor's answers to funnel_leads and remember the row id.
 *
 * Fire-and-forget on purpose: this is our sales note, not the purchase. A
 * failed write is logged and the visitor carries on to the next step, which
 * is the only acceptable behaviour — losing a lead row is a nuisance,
 * blocking a sale is not.
 */
export async function mirrorLead(
  stage: FunnelStage,
  state: FunnelState,
  extra: Record<string, unknown> = {}
): Promise<string | null> {
  try {
    const res = await fetch("/api/funnel/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: state.leadId,
        stage,
        name: state.name,
        phone: state.phone,
        email: state.email,
        company: state.company,
        industry: state.industry,
        industryOther: state.industryOther,
        factoryCity: state.factoryCity,
        factoryState: state.factoryState,
        aoaCount: state.aoaCount,
        selectedAreas: state.selectedAreas,
        customAreas: state.customAreas,
        selectedProcesses: state.selectedProcesses,
        customProcesses: state.customProcesses,
        videoCount: state.videoCount,
        pdfCount: state.pdfCount,
        wantsSharingControls: state.wantsSharingControls,
        chosenPlan: state.chosenPlan,
        extraAreas: state.extraAreas,
        extraVideos: state.extraVideos,
        marketingConsent: state.marketingConsent,
        policiesAccepted: state.policiesAccepted,
        ...extra,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; leadId?: string | null };
    if (data.leadId && data.leadId !== state.leadId) {
      saveFunnel({ leadId: data.leadId });
      return data.leadId;
    }
    return state.leadId;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[funnel] lead mirror failed:", err instanceof Error ? err.message : err);
    return state.leadId;
  }
}
