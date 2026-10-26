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

import { SITE_PLAN_ORDER, SITE_PLANS, planForPlot, type PlotBand, type SitePlanId } from "@/lib/pricing";
import { storedAttribution, trackFunnelStep } from "@/lib/analytics/client";

/** Where the visitor has got to. Mirrors funnel_leads.stage. */
export type FunnelStage = "info" | "scope" | "security" | "plan" | "sales" | "billing" | "paid";

export type FunnelState = {
  /** The funnel_leads row for this visitor, once the first step is saved. */
  leadId: string | null;

  /* Step 1 — who they are and where the factory is. */
  name: string;
  phone: string;
  email: string;
  company: string;
  /** The matched industry labels, for display and the lead row. */
  industry: string;
  /** Kept for leads saved before the typed answer existed. */
  industryOther: string;
  /** What they typed for "What does your factory make?". */
  industryText: string;
  /** Industry guesses the visitor removed from the chips. */
  industryExcluded: string[];
  factoryCity: string;
  factoryState: string;
  /** How big the plant is. Empty until they say; "Not sure" is allowed. */
  plotBand: PlotBand | "";

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

  /* Step 5 — the sales team. The salary is only for the calculator and
     never leaves the browser. */
  hasSalesTeam: boolean | null;
  salesSeats: number;
  monthlySalary: number;

  /* Step 6 — consent and verification. */
  marketingConsent: boolean;
  termsAccepted: boolean;
  /** Legacy flag: a bare yes that never said WHICH address. Never trusted; see isEmailVerified(). */
  emailVerified: boolean;
  /** The exact address a code was confirmed for. Verification only counts for this one. */
  verifiedEmail: string;
  gstin: string;

  /** Set the moment Razorpay reports a payment, so returning to the bill
   *  sends the buyer to the welcome page instead of inviting a second
   *  payment. Empty until then. */
  paidOrderId: string;
};

export const EMPTY_FUNNEL: FunnelState = {
  leadId: null,
  name: "",
  phone: "",
  email: "",
  company: "",
  industry: "",
  industryOther: "",
  industryText: "",
  industryExcluded: [],
  factoryCity: "",
  factoryState: "",
  plotBand: "",
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
  hasSalesTeam: null,
  salesSeats: 5,
  monthlySalary: 30_000,
  marketingConsent: false,
  termsAccepted: false,
  emailVerified: false,
  verifiedEmail: "",
  gstin: "",
  paidOrderId: "",
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

/** One spelling of an address, so "Rajesh@Co.in " and "rajesh@co.in" are the same. */
export function normaliseEmail(v: string): string {
  return (v ?? "").trim().toLowerCase();
}

/**
 * Has THIS address been confirmed with a code? Confirmation belongs to an
 * address, not to the browser: a visitor who confirmed one e-mail and then
 * typed another has confirmed nothing for the second.
 */
export function isEmailVerified(state: Pick<FunnelState, "email" | "verifiedEmail">): boolean {
  const e = normaliseEmail(state.email);
  return e !== "" && e === normaliseEmail(state.verifiedEmail);
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
 * Three things must all be covered, and the answer is the cheapest plan
 * that covers every one of them:
 *
 *   1. THE PLANT. A plant of 1,000+ sq yards (gaj) is VPV Enterprise; 601 to
 *      1,000 is Control at least; 201 to 600 is Authority at least. A buyer
 *      who does not say ("not sure") is not held to a size.
 *   2. THE LINK. If they said they want to stop the link reaching a
 *      competitor, the plan must have sharing controls: Control or
 *      Enterprise. One-time link expiry and share restrictions exist on no
 *      other plan and cannot be bought as an add-on, so no amount of extra
 *      areas on a cheaper plan gets them what they just said they need.
 *   3. THE SCOPE. Its areas, videos and PDFs must cover what they picked.
 *
 * If no plan covers the scope on its own, it is the plan their plant and
 * link need, with the shortfall added as extras.
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
  plotBand?: PlotBand | "" | null;
}): Recommendation {
  const aoa = Math.max(0, s.aoaCount ?? 0);
  const videos = Math.max(0, s.videoCount ?? 0);
  const pdfs = Math.max(0, s.pdfCount ?? 0);
  const reasons: string[] = [];

  const floorId = planForPlot(s.plotBand || null);
  const floor = floorId ? SITE_PLAN_ORDER.indexOf(floorId) : 0;
  const wantsLink = s.wantsSharingControls === true;

  // Enterprise is for a big PLANT, never a way round the limits of a smaller
  // plan: it is offered only when the plant is 1,000+ sq yards, and then it
  // is the only plan that fits.
  const allowed = SITE_PLAN_ORDER.filter(
    (id, i) =>
      i >= floor &&
      (floorId === "enterprise" ? id === "enterprise" : id !== "enterprise") &&
      (!wantsLink || SITE_PLANS[id].sharingControls)
  );
  const covers = (id: SitePlanId) => {
    const p = SITE_PLANS[id];
    return p.scenes >= aoa && p.videos >= videos && p.pdfs >= pdfs;
  };

  const fit = allowed.find(covers);
  // Nothing covers the scope outright: the largest plan the plant and the
  // link allow, with the shortfall added as extras.
  const chosen: SitePlanId = fit ?? allowed[allowed.length - 1];
  const p = SITE_PLANS[chosen];

  if (floorId && floorId !== "confidence") {
    reasons.push(`${p.plot.label} — which matches the plant size you gave.`);
  }
  if (wantsLink) {
    reasons.push(
      "You asked to stop your VPV link being shared with competitors. One-time link expiry and share restrictions are part of VPV Control and VPV Enterprise."
    );
  }

  if (fit) {
    if (aoa > 0) reasons.push(`Covers the ${aoa} area${aoa === 1 ? "" : "s"} you chose, with ${p.scenes} included.`);
    if (videos > 0) reasons.push(`Includes ${p.videos} process videos — you asked for ${videos}.`);
    if (pdfs > 0) reasons.push(`Includes ${p.pdfs} PDF reports — you asked for ${pdfs}.`);
    return { plan: chosen, reasons, extraAreas: 0, extraVideos: 0, needsExtras: false };
  }

  const extraAreas = Math.max(0, aoa - p.scenes);
  const extraVideos = Math.max(0, videos - p.videos);
  if (!wantsLink && !floorId) {
    reasons.push(`What you picked goes beyond every plan, so this is ${p.name}, our largest standard plan, with the rest added on.`);
  } else if (aoa > 0) {
    reasons.push(`Covers the ${aoa} area${aoa === 1 ? "" : "s"} you chose, with the rest added on top of the ${p.scenes} included.`);
  }
  if (extraAreas > 0) reasons.push(`${extraAreas} extra area${extraAreas === 1 ? "" : "s"} on top of the ${p.scenes} included.`);
  if (extraVideos > 0) reasons.push(`${extraVideos} extra process video${extraVideos === 1 ? "" : "s"} on top of the ${p.videos} included.`);
  if (pdfs > p.pdfs) reasons.push(`${p.pdfs} PDF reports are included; you can add more from your dashboard.`);
  return { plan: chosen, reasons, extraAreas, extraVideos, needsExtras: true };
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
/** The attribution block the lead route expects. Shaped here so the
 *  route has one object to validate instead of nine loose fields. */
function attributionForLead(): Record<string, string | null> | null {
  const a = storedAttribution();
  if (!a) return null;
  return {
    source: a.source ?? null,
    medium: a.medium ?? null,
    campaign: a.campaign ?? null,
    term: a.term ?? null,
    content: a.content ?? null,
    code: a.code ?? null,
    referrer: a.referrer ?? null,
    landingPath: a.landingPath ?? null,
  };
}

export async function mirrorLead(
  stage: FunnelStage,
  state: FunnelState,
  extra: Record<string, unknown> = {}
): Promise<string | null> {
  // One event per step reached, so /admin/marketing can show how far a
  // pamphlet scan actually got. Fire-and-forget; never blocks the step.
  trackFunnelStep(stage);
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
        industryText: state.industryText,
        industryExcluded: state.industryExcluded,
        factoryCity: state.factoryCity,
        factoryState: state.factoryState,
        plotBand: state.plotBand,
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
        hasSalesTeam: state.hasSalesTeam,
        salesSeats: state.hasSalesTeam ? state.salesSeats : 0,
        // Where this visitor came from, captured on their first page and
        // kept since. Sent with every step so the rep and /admin/marketing
        // can see which pamphlet, search or ad produced the enquiry, and
        // so a paid order traces back to it.
        attribution: attributionForLead(),
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
