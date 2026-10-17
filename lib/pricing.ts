/**
 * lib/pricing.ts — the ONE place every price in VPV is defined.
 *
 * Nothing else in the codebase may hard-code a rupee amount. The public
 * pricing page, the scene calculator, the checkout, the Razorpay order
 * and the GST invoice all read from here, so a price can never be shown
 * in one place and charged in another.
 *
 * ┌─ THE MODEL ───────────────────────────────────────────────────────┐
 * │ BASIC  one-time. The customer chooses how many scenes they want   │
 * │        on a slider; each extra scene costs less than the one       │
 * │        before, so the PRICE PER SCENE visibly falls as the pack    │
 * │        grows. Same features as Pro — the scene count is the limit. │
 * │ PRO    ₹5,000 / month. Unlimited scenes. Sold by conversation.     │
 * │ ULTRA  ₹15,000 / month. Everything, incl. AI meeting review.       │
 * │                                                                   │
 * │ ANNUAL SUPPORT & HOSTING  ₹9,999 / year, FIRST YEAR FREE with     │
 * │        every Basic purchase. Billed from year two. If it is not    │
 * │        renewed, pop-ups start, then the workspace locks (below).   │
 * └───────────────────────────────────────────────────────────────────┘
 *
 * Every amount here is INR and is EXCLUSIVE of GST — the number on the
 * marketing page is the base ("+ GST"), and the final checkout screen
 * shows the breakdown and the total actually charged. 18% GST is added
 * on top by withGst() below, and the order route charges the TOTAL.
 *
 * TO CHANGE A PRICE: edit the constants in this file, redeploy, and
 * e-mail existing customers per Terms › Price changes. Amounts are
 * whole rupees; the payment layer converts to paise.
 *
 * Pure TypeScript — no React, no browser APIs — so the server can
 * import it to price an order without trusting anything from the client.
 */

/* ═══════════════════════ Tax ═══════════════════════════════════════ */

/** Current GST rate applied to our SAC. Change in ONE place. */
export const GST_RATE = 0.18;
export const GST_LABEL = "18% GST";

/** Our service's SAC code for the invoice. 998434 = on-line software
 *  services. Confirm with your CA before the first invoice goes out. */
export const SAC_CODE = "998434";

/* ═══════════════════════ BASIC: the scene ladder ═══════════════════ */

/**
 * Marginal price of each additional scene, GST excluded. 18% GST is added on top at checkout.
 *
 * Read it as: scenes 1 to `upTo` cost `each`. The ladder is *marginal*,
 * not a flat rate — scene 1 costs ₹5,000, scenes 2 and 3 cost ₹4,000
 * apiece, and so on. That is what makes the average price per scene
 * fall as the customer drags the slider right, which is the number we
 * show them in the largest font on the page.
 *
 * Bands must be listed in ascending `upTo` order. The last band's price
 * applies to every scene beyond it.
 */
export const SCENE_PRICE_LADDER: { upTo: number; each: number }[] = [
  { upTo: 1, each: 5_000 },
  { upTo: 3, each: 4_000 },
  { upTo: 6, each: 3_250 },
  { upTo: 10, each: 2_750 },
  { upTo: 15, each: 2_250 },
  { upTo: Infinity, each: 1_999 },
];

/** Slider limits on the Basic calculator. */
export const SCENE_MIN = 2;
export const SCENE_MAX = 20;
/** Pre-selected when the calculator first appears. */
export const SCENE_DEFAULT = 5;

/**
 * What a pack of `scenes` scenes costs, GST excluded. 18% GST is added on top at checkout.
 *
 * This is the authority. The browser calls it to draw the slider; the
 * order route calls it again to set the amount actually charged. A
 * tampered client can change the number of scenes it asks for, but
 * never the price attached to that number.
 */
export function priceForScenes(scenes: number): number {
  const n = clampScenes(scenes);
  let total = 0;
  let priced = 0;
  for (const band of SCENE_PRICE_LADDER) {
    if (priced >= n) break;
    const upTo = Number.isFinite(band.upTo) ? band.upTo : n;
    const inThisBand = Math.min(n, upTo) - priced;
    if (inThisBand > 0) {
      total += inThisBand * band.each;
      priced += inThisBand;
    }
  }
  return total;
}

/** Scene count forced inside the allowed range, as a whole number. */
export function clampScenes(scenes: number): number {
  if (!Number.isFinite(scenes)) return SCENE_MIN;
  return Math.max(SCENE_MIN, Math.min(SCENE_MAX, Math.round(scenes)));
}

/** Average price per scene — the big number on the calculator. */
export function pricePerScene(scenes: number): number {
  const n = clampScenes(scenes);
  return Math.round(priceForScenes(n) / n);
}

/** Price per scene at the smallest pack — the "before" we compare to. */
export function anchorPricePerScene(): number {
  return pricePerScene(SCENE_MIN);
}

/**
 * How much cheaper this pack is than buying the same number of scenes
 * at the smallest pack's rate. Drives the "You save …" badge.
 */
export function sceneSavings(scenes: number): { amount: number; percent: number } {
  const n = clampScenes(scenes);
  const atAnchor = anchorPricePerScene() * n;
  const actual = priceForScenes(n);
  const amount = Math.max(0, atAnchor - actual);
  const percent = atAnchor > 0 ? Math.round((amount / atAnchor) * 100) : 0;
  return { amount, percent };
}

/** Every step of the slider, pre-computed — used by the price table. */
export function sceneLadderRows(): {
  scenes: number;
  total: number;
  perScene: number;
  savedPercent: number;
}[] {
  const rows = [];
  for (let n = SCENE_MIN; n <= SCENE_MAX; n++) {
    rows.push({
      scenes: n,
      total: priceForScenes(n),
      perScene: pricePerScene(n),
      savedPercent: sceneSavings(n).percent,
    });
  }
  return rows;
}

/* ═══════════════════════ PRO / ULTRA / support ═════════════════════ */

/** Monthly subscription prices, GST excluded. Sold by conversation —
 *  shown on the site, but not payable through the website checkout. */
export const PRO_MONTHLY_INR = 5_000;
export const ULTRA_MONTHLY_INR = 15_000;

/** Annual technical support, maintenance and hosting, GST excluded. */
export const SUPPORT_ANNUAL_INR = 9_999;
/** Months of support included free with a Basic purchase. */
export const SUPPORT_FREE_MONTHS = 12;
/**
 * LEVEL 1 → LEVEL 2 of the lapse ladder, in days.
 *
 *   support year ends ─► LEVEL 1: a renewal pop-up on every click
 *                         (work continues) for SUPPORT_GRACE_DAYS days
 *                     ─► LEVEL 2: the workspace LOCKS — dashboard wall and
 *                         the public viewers stop serving the tours —
 *                         until the renewal is paid. Renewing unlocks
 *                         instantly.
 *
 * MUST equal public.vpv_support_nag_days() in supabase/billing_hardening.sql.
 * tests/billing/ checks the two agree.
 */
export const SUPPORT_GRACE_DAYS = 7;
/** A renewal can only be bought this many days before expiry (stops a
 *  double payment for a year that is already paid for). */
export const SUPPORT_RENEW_WINDOW_DAYS = 60;

/* ═══════════════════════ Plans ═════════════════════════════════════ */

export type PlanId = "basic" | "pro" | "ultra";

export type PlanSpec = {
  id: PlanId;
  name: string;
  tagline: string;
  /** How this plan is paid for. */
  billing: "one_time" | "monthly";
  /** Null means the price depends on the scene count (Basic). */
  monthlyInr: number | null;
  /** Null means unlimited scenes. */
  sceneQuota: number | null;
  /** Can a customer buy this on the website without talking to us? */
  selfServe: boolean;
};

export const PLANS: Record<PlanId, PlanSpec> = {
  basic: {
    id: "basic",
    name: "Basic",
    tagline: "Pick your scenes. Pay once. Own it.",
    billing: "one_time",
    monthlyInr: null,
    sceneQuota: SCENE_DEFAULT, // overridden per org by what they bought
    selfServe: true,
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "Unlimited scenes, every month.",
    billing: "monthly",
    monthlyInr: PRO_MONTHLY_INR,
    sceneQuota: null,
    selfServe: false,
  },
  ultra: {
    id: "ultra",
    name: "Ultra",
    tagline: "Everything, including AI meeting review.",
    billing: "monthly",
    monthlyInr: ULTRA_MONTHLY_INR,
    sceneQuota: null,
    selfServe: false,
  },
};

export const PLAN_ORDER: PlanId[] = ["basic", "pro", "ultra"];

export function isPlanId(v: unknown): v is PlanId {
  return v === "basic" || v === "pro" || v === "ultra";
}

/* ═══════════════════════ What each plan includes ═══════════════════ */

/** One row of the comparison table. `true` = included. */
export type FeatureRow = {
  label: string;
  basic: boolean | string;
  pro: boolean | string;
  ultra: boolean | string;
};

export const FEATURE_MATRIX: FeatureRow[] = [
  {
    label: "Scenes your customers can see",
    basic: `${SCENE_MIN}–${SCENE_MAX}, you choose`,
    pro: "Unlimited",
    ultra: "Unlimited",
  },
  { label: "360° tour builder with hotspots", basic: true, pro: true, ultra: true },
  { label: "Your own branded workspace and logo", basic: true, pro: true, ultra: true },
  { label: "Presenter dashboard and live Present mode", basic: true, pro: true, ultra: true },
  { label: "Private share links, passwords, device limits, QR", basic: true, pro: true, ultra: true },
  { label: "Video, PDF, audio and image hotspots", basic: true, pro: true, ultra: true },
  { label: "Guided auto-tour, narration, subtitles, languages", basic: true, pro: true, ultra: true },
  { label: "Viewer analytics and client pipeline", basic: true, pro: true, ultra: true },
  { label: "Sales team accounts and reports", basic: true, pro: true, ultra: true },
  { label: "Measure tool, image clean-up, capture shield", basic: true, pro: true, ultra: true },
  { label: "Add scenes any time", basic: "Buy a top-up", pro: true, ultra: true },
  { label: "AI meeting review: transcript, score, insights", basic: false, pro: false, ultra: true },
  {
    label: "Technical support, maintenance and hosting",
    basic: `Year 1 free, then ${inr(SUPPORT_ANNUAL_INR)}/year + GST`,
    pro: "Included",
    ultra: "Included, priority",
  },
];

/* ═══════════════════════ Access state (the lapse ladder) ═══════════ */

export type AccessState = "active" | "nag" | "locked";

/**
 * Where a workspace stands on the lapse ladder, right now.
 *
 * The DATABASE is the authority (public.org_access_state_of — it is what
 * the public viewers obey). This pure twin exists so the dashboard can
 * render the right screen and so tests can prove the two never disagree.
 * Boundaries are deliberately identical: strictly-after comparisons.
 *
 *   plan_status suspended / cancelled (refund, chargeback, manual) → locked
 *   Basic + support_until in the past, ≤ GRACE days ago             → nag
 *   Basic + support_until more than GRACE days ago                  → locked
 *   everything else (Pro/Ultra, no support date, in-date)           → active
 */
export function accessStateFor(
  org: {
    plan: string;
    plan_status?: string | null;
    support_until?: string | Date | null;
  },
  now: Date = new Date()
): { state: AccessState; locksAt: Date | null; daysToLock: number | null } {
  const status = org.plan_status ?? "active";
  if (status === "suspended" || status === "cancelled") {
    return { state: "locked", locksAt: null, daysToLock: null };
  }
  if (org.plan !== "basic" || !org.support_until) {
    return { state: "active", locksAt: null, daysToLock: null };
  }
  const until = new Date(org.support_until);
  if (Number.isNaN(until.getTime())) {
    return { state: "active", locksAt: null, daysToLock: null };
  }
  const locksAt = new Date(until.getTime() + SUPPORT_GRACE_DAYS * 86_400_000);
  if (until.getTime() >= now.getTime()) {
    return { state: "active", locksAt, daysToLock: null };
  }
  if (locksAt.getTime() < now.getTime()) {
    return { state: "locked", locksAt, daysToLock: 0 };
  }
  const daysToLock = Math.max(
    1,
    Math.ceil((locksAt.getTime() - now.getTime()) / 86_400_000)
  );
  return { state: "nag", locksAt, daysToLock };
}

/** A scene count we are willing to sell: a whole number inside the slider. */
export function isValidSceneCount(n: unknown): n is number {
  return (
    typeof n === "number" &&
    Number.isInteger(n) &&
    n >= SCENE_MIN &&
    n <= SCENE_MAX
  );
}

/* ═══════════════════════ Money helpers ════════════════════════════ */

/** Indian digit grouping: 1234567 → "₹12,34,567". No Intl dependency,
 *  so server and browser always render the same string. */
export function inr(amount: number): string {
  const n = Math.round(amount);
  const s = String(Math.abs(n));
  let grouped: string;
  if (s.length <= 3) {
    grouped = s;
  } else {
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    grouped = `${rest},${last3}`;
  }
  return `${n < 0 ? "-" : ""}₹${grouped}`;
}

/** Two decimals, Indian grouping: 25422.88 → "₹25,422.88". */
export function inr2(amount: number): string {
  const [whole, frac] = Math.abs(amount).toFixed(2).split(".");
  return `${amount < 0 ? "-" : ""}${inr(Number(whole))}.${frac}`;
}

/**
 * Add 18% GST on top of a base (GST-exclusive) price.
 *
 * Our shown prices are the base. The customer sees "₹X + GST" on the
 * marketing page and plan cards. On the final checkout screen, and on
 * the Razorpay button, we charge the TOTAL this returns (base + GST).
 * The invoice stores the taxable value (= base), the GST, and the total.
 *
 *   withGst(10000)  →  { taxable: 10000, gst: 1800, total: 11800 }
 */
export function withGst(base: number): {
  taxable: number;
  gst: number;
  total: number;
} {
  const taxable = Math.round(base * 100) / 100;
  const gst = Math.round(taxable * GST_RATE * 100) / 100;
  const total = Math.round((taxable + gst) * 100) / 100;
  return { taxable, gst, total };
}

/** Rupees → paise, which is what Razorpay's API takes. Integer only. */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Paise → rupees, for displaying a stored order amount. */
export function fromPaise(paise: number): number {
  return Math.round(paise) / 100;
}

/* ═══════════════ SITE PLANS: the named packs on myvpv.com ═════════ */

/**
 * The three plans the marketing site sells (VPV Confidence, Authority,
 * Control). They are the SAME product as a Basic licence — a workspace
 * with a fixed number of areas — just sold as named packs at a flat
 * price instead of by the scene ladder. An "AOA" (area of attention) is
 * a scene, so `scenes` below feeds the identical fulfilment path and
 * nothing downstream has to learn a new shape.
 *
 * ┌─ BEFORE YOU TAKE REAL MONEY ──────────────────────────────────────┐
 * │ Every price here is still the placeholder the site was built with. │
 * │ Set the real figures, then set PLACEHOLDER_PRICES to false. Until  │
 * │ you do, the order route REFUSES these plans whenever Razorpay is   │
 * │ in live mode, so a placeholder can never be charged to a card.     │
 * │ Test mode is unaffected, so the whole flow can be rehearsed now.   │
 * └────────────────────────────────────────────────────────────────────┘
 *
 * Amounts are INR and EXCLUDE GST, exactly like the scene ladder.
 */
export const PLACEHOLDER_PRICES = true;

export type SitePlanId = "confidence" | "authority" | "control";

export type SitePlanSpec = {
  id: SitePlanId;
  name: string;
  tagline: string;
  /** One-time licence price, GST excluded. */
  priceInr: number;
  /** AOAs — areas of attention. These become the workspace's scenes. */
  scenes: number;
  videos: number;
  pdfs: number;
  infoIcons: boolean;
  sharingControls: boolean;
};

export const SITE_PLANS: Record<SitePlanId, SitePlanSpec> = {
  confidence: {
    id: "confidence",
    name: "VPV Confidence",
    tagline: "Prove you're a trusted manufacturer.",
    priceInr: 49_000,
    scenes: 5,
    videos: 0,
    pdfs: 0,
    infoIcons: false,
    sharingControls: false,
  },
  authority: {
    id: "authority",
    name: "VPV Authority",
    tagline: "Show your systems, processes and capabilities.",
    priceInr: 99_000,
    scenes: 10,
    videos: 5,
    pdfs: 5,
    infoIcons: true,
    sharingControls: false,
  },
  control: {
    id: "control",
    name: "VPV Control",
    tagline: "Secure, controlled access and sharing.",
    priceInr: 199_000,
    scenes: 20,
    videos: 10,
    pdfs: 20,
    infoIcons: true,
    sharingControls: true,
  },
};

export const SITE_PLAN_ORDER: SitePlanId[] = ["confidence", "authority", "control"];

export function isSitePlanId(v: unknown): v is SitePlanId {
  return v === "confidence" || v === "authority" || v === "control";
}

/**
 * The launch discount shown on the site.
 *
 * `limit` is a PROMISE made to the buyer ("our first 100 customers"), so
 * it has to be true. Turn `active` off once that many have bought — an
 * offer that never ends is a false-urgency claim under the CCPA's
 * dark-pattern guidelines, and this one is printed on the page.
 */
export const LAUNCH_OFFER = {
  active: true,
  percent: 20,
  limit: 100,
  label: "Launch offer (20% off)",
};

/** Discount in rupees for a plan, 0 when the offer is off. */
export function launchDiscount(base: number): number {
  if (!LAUNCH_OFFER.active) return 0;
  return Math.round((base * LAUNCH_OFFER.percent) / 100);
}

/**
 * Travel and logistics for the factory shoot, charged with the order.
 * Delhi NCR is a day trip; anywhere else carries a night and a longer
 * journey for the crew.
 */
export type TravelZone = "ncr" | "outside";

export const TRAVEL_FEES: Record<TravelZone, { label: string; amountInr: number }> = {
  ncr: { label: "Delhi NCR", amountInr: 3_000 },
  outside: { label: "Outside Delhi NCR", amountInr: 15_000 },
};

export function isTravelZone(v: unknown): v is TravelZone {
  return v === "ncr" || v === "outside";
}

/**
 * The full breakdown for a site plan, so the checkout screen and the
 * order route quote identical numbers from one calculation.
 *
 * Digital Care (₹9,999/yr) is deliberately NOT in here: it is mandatory
 * but billed from go-live, not taken with this payment.
 */
export function sitePlanQuote(planId: SitePlanId, travel: TravelZone): {
  plan: SitePlanSpec;
  base: number;
  discount: number;
  travelFee: number;
  /** Payable now, GST excluded. */
  amountInr: number;
} {
  const plan = SITE_PLANS[planId];
  const discount = launchDiscount(plan.priceInr);
  const travelFee = TRAVEL_FEES[travel].amountInr;
  return {
    plan,
    base: plan.priceInr,
    discount,
    travelFee,
    amountInr: plan.priceInr - discount + travelFee,
  };
}

/* ═══════════════════════ What we charge for ═══════════════════════ */

/**
 * The things the website takes money for, AS STORED in billing_orders.
 * Pro and Ultra are deliberately absent: they are large recurring
 * amounts, agreed in conversation and invoiced separately.
 *
 * This list is mirrored by a CHECK constraint in supabase/billing.sql
 * and branched on by fulfilment, the one-workspace lock and the refund
 * reversal. Adding a value here means changing all of those, so a new
 * way to SELL something is added as a RequestPurpose below instead.
 */
export type PurchasePurpose = "basic_licence" | "support_renewal" | "scene_topup";

export function isPurchasePurpose(v: unknown): v is PurchasePurpose {
  return v === "basic_licence" || v === "support_renewal" || v === "scene_topup";
}

/**
 * What the BROWSER may ask to buy.
 *
 * "site_plan" is the marketing site's named pack — VPV Confidence,
 * Authority or Control. It is not a fourth product: it is a Basic
 * licence with a fixed number of areas, sold at a flat price instead of
 * by the scene ladder. So it is priced as a plan and then STORED as
 * `basic_licence`, which is what it is. That way the workspace is built,
 * the one-purchase-per-buyer lock holds and a refund reverses the plan
 * exactly as they already do for every other licence — no new branch in
 * the money code, and no change to the database.
 */
export type RequestPurpose = PurchasePurpose | "site_plan";

export function isRequestPurpose(v: unknown): v is RequestPurpose {
  return isPurchasePurpose(v) || v === "site_plan";
}

/** The purpose actually written to billing_orders. */
export function storedPurpose(p: RequestPurpose): PurchasePurpose {
  return p === "site_plan" ? "basic_licence" : p;
}

/**
 * Price a purchase, server-side. This function is the single gate every
 * rupee passes through — the API route calls it and never reads an
 * amount from the request body.
 *
 * `scenes` is required for a licence or a top-up, ignored otherwise.
 * For a top-up, `existingScenes` is how many the org already owns, so
 * the customer pays the ladder's marginal price for the new ones rather
 * than starting again at ₹5,000.
 */
export function priceFor(
  purpose: RequestPurpose,
  opts: {
    scenes?: number;
    existingScenes?: number;
    sitePlanId?: SitePlanId;
    travel?: TravelZone;
  } = {}
): { amountInr: number; description: string; scenes: number | null } {
  switch (purpose) {
    case "basic_licence": {
      const n = clampScenes(opts.scenes ?? SCENE_DEFAULT);
      return {
        amountInr: priceForScenes(n),
        description: `VPV Basic licence — ${n} scene${n === 1 ? "" : "s"} (includes 1 year support and hosting)`,
        scenes: n,
      };
    }
    case "scene_topup": {
      const have = Math.max(0, Math.round(opts.existingScenes ?? 0));
      const want = Math.max(have + 1, Math.round(opts.scenes ?? have + 1));
      const capped = Math.min(SCENE_MAX, want);
      const added = capped - have;
      return {
        amountInr: Math.max(0, priceForScenes(capped) - priceForScenes(have)),
        description: `VPV scene top-up — ${added} more scene${added === 1 ? "" : "s"} (${have} → ${capped})`,
        scenes: capped,
      };
    }
    case "site_plan": {
      // The browser names a plan and a travel zone. Both are checked
      // against the tables above, and the price comes from here — a
      // tampered request can pick a different plan, never a cheaper one.
      const planId: SitePlanId = isSitePlanId(opts.sitePlanId)
        ? opts.sitePlanId
        : "confidence";
      const travel: TravelZone = isTravelZone(opts.travel) ? opts.travel : "outside";
      const q = sitePlanQuote(planId, travel);
      const parts = [`${q.plan.name} — ${q.plan.scenes} areas`];
      if (q.discount > 0) parts.push(LAUNCH_OFFER.label);
      parts.push(`travel ${TRAVEL_FEES[travel].label}`);
      return {
        amountInr: q.amountInr,
        description: `${parts.join(", ")} (includes 1 year support and hosting)`,
        scenes: q.plan.scenes,
      };
    }
    case "support_renewal":
      return {
        amountInr: SUPPORT_ANNUAL_INR,
        description: "VPV annual technical support, maintenance and hosting — 1 year",
        scenes: null,
      };
  }
}
