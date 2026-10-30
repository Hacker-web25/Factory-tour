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
 * │ SUPPORT, HOSTING & SECURITY  ₹999 a month, billed yearly as       │
 * │        ₹11,988 + GST. FREE for the first year for our first 50     │
 * │        customers; payable with the order after that. Renewed every │
 * │        year; if not, pop-ups start, then the workspace locks.      │
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

import {
  ADDITIONAL_SHOOT_DAY_INR,
  CAB_TRAVEL,
  logisticsFor,
  type LogisticsQuote,
} from "@/lib/logistics";

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

/** Support, hosting & security, per month, GST excluded. Billed yearly. */
export const SUPPORT_MONTHLY_INR = 999;
/** Support, hosting & security, per year, GST excluded (₹999 × 12). */
export const SUPPORT_ANNUAL_INR = SUPPORT_MONTHLY_INR * 12;
/** What the yearly fee is called on every screen and invoice. */
export const SUPPORT_NAME = "Support, hosting & security";
/**
 * What the yearly fee pays for, point by point. Shown behind the (?) next
 * to the fee on the bill, on the plans page and in the Terms, so a buyer
 * knows exactly why it exists and never has to think about any of it.
 */
export const SUPPORT_INCLUDES: { title: string; body: string }[] = [
  { title: "Hosting", body: "Your tours live on fast, reliable servers and open quickly for buyers anywhere in the world." },
  { title: "Security & protection", body: "Regular security updates and protection to help keep your VPV safe and working smoothly, with encrypted, controlled access to every link you share." },
  { title: "Backups", body: "Your tours, media and settings are backed up, so nothing you have built can be lost." },
  { title: "Backup server", body: "If our main server ever has a problem, a backup keeps your VPV online." },
  { title: "Updates and fixes", body: "Regular fixes and improvements to keep your VPV working smoothly, at no extra cost." },
  { title: "Technical support", body: "A real person to help you by e-mail and phone. We respond within 48 hours, so this is not an instant, live-chat service." },
];
/**
 * The support year's value as the marketing copy quotes it: the real price
 * rounded to the nearest 1,000 (11,988 → "₹12,000"). The BILL always shows
 * the exact SUPPORT_ANNUAL_INR; this is only for "first year free, worth …"
 * lines on the plan cards and the plans page, so one constant keeps them
 * from drifting apart if the price ever changes.
 */
export function supportWorthLabel(): string {
  return inr(Math.round(SUPPORT_ANNUAL_INR / 1000) * 1000);
}

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
    tagline: "Everything, including AI meeting review and unlimited offline tours.",
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
  { label: "Tours saved for offline presenting", basic: true, pro: true, ultra: "Unlimited" },
  { label: "AI meeting review: transcript, score, insights", basic: false, pro: false, ultra: true },
  {
    label: SUPPORT_NAME,
    basic: `${inr(SUPPORT_MONTHLY_INR)}/month, billed yearly + GST`,
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
 * The plans the marketing site sells (VPV Confidence, Authority, Control and
 * Enterprise). They are the SAME product as a Basic licence — a workspace
 * with a fixed number of areas — just sold as named packs at a flat
 * price instead of by the scene ladder. An "AOA" (Active Operational Area) is
 * a scene, so `scenes` below feeds the identical fulfilment path and
 * nothing downstream has to learn a new shape.
 *
 * ┌─ HOW THE LADDER IS MEANT TO FEEL ─────────────────────────────────┐
 * │ The price per area FALLS as the plan grows — ₹8,750 on Confidence, │
 * │ ₹6,875 on Authority, ₹6,000 on Control. That 31% fall is the       │
 * │ number to put in the largest type on the comparison, because it is │
 * │ what moves a buyer up a tier.                                      │
 * │                                                                    │
 * │ Extra areas are priced per plan, and cheaper the higher you are,   │
 * │ which is one more reason to climb. Both upgrade paths are checked  │
 * │ by tests/billing/12: a lower plan plus enough extras to match the  │
 * │ next plan's area count must always cost MORE than that next plan,  │
 * │ or the tier above it has no reason to exist.                        │
 * │                                                                    │
 * │ ENTERPRISE IS THE ONE EXCEPTION to both rules. It is priced for a   │
 * │ person's time (a private discussion and the shoot itself, both by   │
 * │ Mr. Nitin Gupta), not for the number of areas, so its price per     │
 * │ area is HIGHER than Control's and Control plus extras costs less.   │
 * └────────────────────────────────────────────────────────────────────┘
 *
 * Amounts are INR and EXCLUDE GST, exactly like the scene ladder.
 */

/**
 * Kill switch for LIVE payments on the site plans.
 *
 * false (now): the plan prices are final, so site plans can be bought with
 * live Razorpay keys, exactly as the scene-ladder licence can.
 *
 * true: the order route REFUSES site plans whenever Razorpay is in live
 * mode (503 `prices_not_final`) and tells the buyer to e-mail support, so
 * nothing half-settled can reach a card. Test mode is unaffected. Set it
 * back to true if a price ever has to be pulled while it is corrected.
 */
export const PLACEHOLDER_PRICES = false;

export type SitePlanId = "confidence" | "authority" | "control" | "enterprise";

/** Marginal price of each EXTRA area beyond what the plan includes.
 *  Read as: extras 1..`upTo` cost `each`. Last band covers the rest. */
export type ExtraAreaBand = { upTo: number; each: number };

export type SitePlanSpec = {
  id: SitePlanId;
  name: string;
  tagline: string;
  /** What the buyer pays WHILE the special offer is open, GST excluded.
   *  These are the decided prices: ₹39,000 / ₹59,000 / ₹90,000.
   *  (26 Oct 2026: Confidence and Authority went up by ₹4,000 each, and
   *  cab travel became free for the first 50 customers. Control is unchanged.) */
  priceInr: number;
  /**
   * The price once the special offer closes, GST excluded. Shown struck
   * through beside priceInr while the offer runs, and charged after the
   * hundredth buyer. It is a REAL future price, not a decoy — see
   * LAUNCH_OFFER for why that matters.
   */
  regularInr: number;
  /**
   * How big a plant the plan is made for, in square yards (gaj). Shown on
   * every plan card and in the Terms, and used to suggest a plan from the
   * plant size a buyer gives. `maxGaj` is null for Enterprise: it starts
   * where Control stops.
   */
  plot: { label: string; maxGaj: number | null };
  /** AOAs — Active Operational Areas. These become the workspace's scenes. */
  scenes: number;
  videos: number;
  pdfs: number;
  /** Shoot time on site that the plan includes, in hours. */
  shootHours: number;
  /**
   * One-time link expiry and share restrictions. Deliberately TRUE on
   * Control alone and not buyable as an add-on anywhere: it is the only
   * thing a big factory cannot get by buying a cheaper plan and adding
   * areas to it, so it is what Control is actually for.
   */
  sharingControls: boolean;
  /** This plan's price for each extra area. Cheaper on the higher plans. */
  extraAreaLadder: ExtraAreaBand[];
};

export const SITE_PLANS: Record<SitePlanId, SitePlanSpec> = {
  confidence: {
    id: "confidence",
    name: "VPV Confidence",
    tagline: "Prove you're a trusted manufacturer.",
    priceInr: 39_000,
    regularInr: 48_750,
    plot: { label: "Recommended for factories up to 200 sq yards (gaj)", maxGaj: 200 },
    scenes: 4,
    videos: 0,
    pdfs: 0,
    shootHours: 2,
    sharingControls: false,
    extraAreaLadder: [
      { upTo: 3, each: 6_000 },
      { upTo: Infinity, each: 5_500 },
    ],
  },
  authority: {
    id: "authority",
    name: "VPV Authority",
    tagline: "Show your systems, processes and capabilities.",
    priceInr: 59_000,
    regularInr: 73_750,
    plot: { label: "Recommended for factories up to 500–600 sq yards (gaj)", maxGaj: 600 },
    scenes: 8,
    videos: 3,
    pdfs: 20,
    shootHours: 4,
    sharingControls: false,
    extraAreaLadder: [
      { upTo: 3, each: 5_500 },
      { upTo: Infinity, each: 5_000 },
    ],
  },
  control: {
    id: "control",
    name: "VPV Control",
    tagline: "Complete factory experience. Secure, controlled access and sharing.",
    priceInr: 90_000,
    regularInr: 112_500,
    plot: { label: "Recommended for factories up to 1,000 sq yards (gaj)", maxGaj: 1000 },
    scenes: 15,
    videos: 8,
    pdfs: 50,
    shootHours: 6,
    sharingControls: true,
    extraAreaLadder: [
      { upTo: 5, each: 4_500 },
      { upTo: 10, each: 3_900 },
      { upTo: Infinity, each: 3_400 },
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "VPV Enterprise",
    tagline: "Your plant, guided and filmed personally by Mr. Nitin Gupta.",
    // ₹2,99,999 while the special offer is open. The regular price is what
    // makes that a 20% saving, exactly as for the other plans: ₹2,99,999 is
    // 80% of ₹3,74,999 (to the rupee, after rounding).
    priceInr: 299_999,
    regularInr: 374_999,
    plot: { label: "Recommended for factories of 1,000+ sq yards (gaj)", maxGaj: null },
    scenes: 25,
    videos: 15,
    pdfs: 100,
    shootHours: 8,
    sharingControls: true,
    // The same extras ladder as Control: extra areas cost the same whichever
    // of the two large plans they are added to.
    extraAreaLadder: [
      { upTo: 5, each: 4_500 },
      { upTo: 10, each: 3_900 },
      { upTo: Infinity, each: 3_400 },
    ],
  },
};

export const SITE_PLAN_ORDER: SitePlanId[] = ["confidence", "authority", "control", "enterprise"];

export function isSitePlanId(v: unknown): v is SitePlanId {
  return v === "confidence" || v === "authority" || v === "control" || v === "enterprise";
}

/**
 * What VPV Enterprise adds to everything in Control: two things that cannot
 * be bought any other way, because they are one person's time.
 *
 * `short` is the line on a plan card; `long` is the sentence on the plan page
 * and in the Terms. The name is the founder's own, given for this use.
 */
export const ENTERPRISE_PERSONAL = {
  person: "Mr. Nitin Gupta",
  discussion: {
    title: "A private, one-to-one discussion with Mr. Nitin Gupta",
    short: "Personal, exclusive discussion with Mr. Nitin Gupta",
    long:
      "Before a single frame is shot, you sit down one-to-one with Mr. Nitin Gupta, in a session reserved for you alone, " +
      "to shape how your plant is presented to the buyers who matter most to you.",
  },
  shoot: {
    title: "Your plant filmed personally by Mr. Nitin Gupta",
    short: "Personal, exclusive shoot by Mr. Nitin Gupta",
    long:
      "Mr. Nitin Gupta comes to your plant and shoots it himself, so every frame of your VPV carries his personal attention " +
      "rather than being left to a crew.",
  },
} as const;

/** The size bands a buyer can pick, in the order of the plans that fit them. */
export type PlotBand = "upto200" | "upto600" | "upto1000" | "above1000";
export const PLOT_BANDS: { id: PlotBand; label: string; plan: SitePlanId }[] = [
  { id: "upto200", label: "Up to 200 sq yards (gaj)", plan: "confidence" },
  { id: "upto600", label: "201 to 600 sq yards (gaj)", plan: "authority" },
  { id: "upto1000", label: "601 to 1,000 sq yards (gaj)", plan: "control" },
  { id: "above1000", label: "More than 1,000 sq yards (gaj)", plan: "enterprise" },
];
export function isPlotBand(v: unknown): v is PlotBand {
  return PLOT_BANDS.some((b) => b.id === v);
}
/** The smallest plan made for a plant this big. */
export function planForPlot(band: PlotBand | null | undefined): SitePlanId | null {
  return PLOT_BANDS.find((b) => b.id === band)?.plan ?? null;
}

/* ─────────────────────── Special offer ──────────────────────────── */

/**
 * The special offer for our first 50 customers: 20% off the regular plan
 * price, and 50% off each sales-team login (see SALES_TEAM).
 *
 * ┌─ THIS IS A PROMISE, AND THE CODE KEEPS IT ────────────────────────┐
 * │ "First 50 customers" is printed on the site, so it has to be       │
 * │ true. An offer that never ends is a false-urgency claim under the  │
 * │ CCPA's dark-pattern guidelines. So the order route COUNTS paid     │
 * │ site-plan orders (lib/server/launchOffer.ts) and, from the 51st,   │
 * │ prices at regularInr — automatically, with nobody having to        │
 * │ remember. Refunded orders do not count: they are not customers.    │
 * └────────────────────────────────────────────────────────────────────┘
 *
 * `active: false` ends the offer early for everyone.
 */
export const LAUNCH_OFFER = {
  active: true,
  percent: 20,
  limit: 50,
  label: "Special offer for our first 50 customers",
  short: "Special offer",
};

/** Is the offer open, given how many customers have already bought? */
export function launchOfferOpen(sold: number): boolean {
  return LAUNCH_OFFER.active && sold < LAUNCH_OFFER.limit;
}

/** What a plan costs right now, GST excluded. */
export function planPrice(planId: SitePlanId, offerOpen = LAUNCH_OFFER.active): number {
  const p = SITE_PLANS[planId];
  return offerOpen && LAUNCH_OFFER.active ? p.priceInr : p.regularInr;
}

/** The rupees the offer takes off a plan, 0 once it has closed. */
export function offerSaving(planId: SitePlanId, offerOpen = LAUNCH_OFFER.active): number {
  const p = SITE_PLANS[planId];
  return p.regularInr - planPrice(planId, offerOpen);
}

/** Kept for the older checkout screens: discount on a regular price. */
export function launchDiscount(regular: number): number {
  if (!LAUNCH_OFFER.active) return 0;
  return Math.round((regular * LAUNCH_OFFER.percent) / 100);
}

/* ─────────────────────── Add-ons ─────────────────────────────────── */

/** Each extra process video, GST excluded. Flat across plans: the cost to
 *  us is the shoot time and the edit, which does not change by plan. */
export const EXTRA_VIDEO_INR = 5_000;

/** Slider limits for the add-ons on the recommendation page. */
export const EXTRA_AREA_MAX = 15;
export const EXTRA_VIDEO_MAX = 12;

/**
 * Said on every screen that sells a video, because a buyer is entitled to
 * know what the footage is shot on before they pay, not after.
 */
export const VIDEO_SHOT_NOTE =
  "Process videos are shot on iPhone and colour-graded by our team.";

/** A whole number of extras inside the slider's range. */
export function clampExtraAreas(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 0;
  return Math.max(0, Math.min(EXTRA_AREA_MAX, v));
}

export function clampExtraVideos(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 0;
  return Math.max(0, Math.min(EXTRA_VIDEO_MAX, v));
}

/** What `n` extra areas cost on a given plan, GST excluded. */
export function extraAreaCost(planId: SitePlanId, n: number): number {
  const count = clampExtraAreas(n);
  let total = 0;
  let priced = 0;
  for (const band of SITE_PLANS[planId].extraAreaLadder) {
    if (priced >= count) break;
    const upTo = Number.isFinite(band.upTo) ? band.upTo : count;
    const inBand = Math.min(count, upTo) - priced;
    if (inBand > 0) {
      total += inBand * band.each;
      priced += inBand;
    }
  }
  return total;
}

/** Marginal price of the NEXT extra area — the "add one more" price. */
export function nextExtraAreaPrice(planId: SitePlanId, have: number): number {
  const n = clampExtraAreas(have);
  return extraAreaCost(planId, n + 1) - extraAreaCost(planId, n);
}

/**
 * Average price per area across the plan AND its extras — the big number
 * on the add-on slider. It falls as extras are added, because every band
 * is cheaper than the plan's own per-area price.
 */
export function sitePerArea(
  planId: SitePlanId,
  extraAreas = 0,
  offerOpen = LAUNCH_OFFER.active
): number {
  const plan = SITE_PLANS[planId];
  const n = clampExtraAreas(extraAreas);
  const areas = plan.scenes + n;
  return Math.round((planPrice(planId, offerOpen) + extraAreaCost(planId, n)) / areas);
}

/**
 * The discount bands behind the "add more areas" banner: each band's price
 * per area and how far below the plan's own per-area price it is. Honest
 * by construction — the percentage is computed from the same two numbers
 * the buyer can see.
 */
export function discountBands(
  planId: SitePlanId,
  offerOpen = LAUNCH_OFFER.active
): { from: number; to: number | null; each: number; percentOff: number }[] {
  const base = sitePerArea(planId, 0, offerOpen);
  let from = 1;
  return SITE_PLANS[planId].extraAreaLadder.map((band) => {
    const to = Number.isFinite(band.upTo) ? band.upTo : null;
    const row = {
      from,
      to,
      each: band.each,
      percentOff: Math.max(0, Math.round((1 - band.each / base) * 100)),
    };
    if (to !== null) from = to + 1;
    return row;
  });
}

/** What the extras save against paying the plan's own per-area rate. */
export function extrasSaving(
  planId: SitePlanId,
  extraAreas: number,
  offerOpen = LAUNCH_OFFER.active
): number {
  const n = clampExtraAreas(extraAreas);
  return Math.max(0, n * sitePerArea(planId, 0, offerOpen) - extraAreaCost(planId, n));
}

/** Every step of the add-on slider, pre-computed for the table. */
export function extraAreaRows(planId: SitePlanId, offerOpen = LAUNCH_OFFER.active): {
  extras: number;
  areas: number;
  total: number;
  perArea: number;
}[] {
  const plan = SITE_PLANS[planId];
  const rows = [];
  for (let n = 0; n <= EXTRA_AREA_MAX; n++) {
    rows.push({
      extras: n,
      areas: plan.scenes + n,
      total: planPrice(planId, offerOpen) + extraAreaCost(planId, n),
      perArea: sitePerArea(planId, n, offerOpen),
    });
  }
  return rows;
}

/* ─────────────────────── Sales team ─────────────────────────────── */

/**
 * The Sales Team add-on: a login for each salesperson, with the MD's sales
 * dashboard — every meeting's start time and place, meetings per client,
 * and how far each deal has moved.
 *
 * YEARLY per salesperson (since 26 Oct 2026; it used to be one-time). The
 * first year is bought with the plan; from year 2 it renews together with
 * support, hosting & security, at the price the customer bought at. One flat
 * price per login, no volume discount. Our first 50 customers pay ₹199 per
 * login per year (shown against the regular ₹999); from the 51st customer it
 * is ₹999. Like the plan prices, the regular price is a real future price,
 * not a decoy.
 */
export const SALES_TEAM = {
  regularInr: 999,
  offerInr: 199,
  percentOff: 80,
  /** Billed every year, not once. */
  period: "year" as const,
  /** Slider limit. A bigger team is a conversation, not a slider. */
  maxSeats: 200,
  /** What the salary calculator starts from, per salesperson per month. */
  defaultMonthlySalaryInr: 30_000,
};

export function clampSalesSeats(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 0;
  return Math.max(0, Math.min(SALES_TEAM.maxSeats, v));
}

/** One salesperson login for a year, right now. */
export function seatPrice(offerOpen = LAUNCH_OFFER.active): number {
  return offerOpen && LAUNCH_OFFER.active ? SALES_TEAM.offerInr : SALES_TEAM.regularInr;
}

/**
 * What one year's renewal costs, GST excluded: support, hosting & security,
 * plus each sales login at the price the customer bought it at.
 */
export function renewalAmount(seats: number, seatInr: number): number {
  const n = clampSalesSeats(seats);
  return SUPPORT_ANNUAL_INR + n * Math.max(0, Math.round(seatInr || 0));
}

/**
 * The sales team bought with a plan, read back from the order's notes
 * ("sales team 5 logins at ₹199/yr"). Orders from before logins became
 * yearly say "sales team 5 logins" with no price: those were paid once, so
 * they renew at nothing (seatInr 0) — the customer was promised one-time.
 */
export function seatsFromOrderNotes(notes: string | null | undefined): { seats: number; seatInr: number } {
  const m = /sales team (\d+) logins?(?: at ₹([\d,]+)\/yr)?/.exec(notes ?? "");
  if (!m) return { seats: 0, seatInr: 0 };
  const seats = clampSalesSeats(Number(m[1]));
  const seatInr = m[2] ? Number(m[2].replace(/,/g, "")) : 0;
  return { seats, seatInr: Number.isFinite(seatInr) ? seatInr : 0 };
}

/**
 * The calculator on the Sales team step: what the team costs in salary,
 * and what the add-on costs against it. Every figure is arithmetic on the
 * two numbers the buyer typed — there is no invented "return" in here.
 */
export function salesTeamMaths(
  seats: number,
  monthlySalaryInr: number,
  offerOpen = LAUNCH_OFFER.active
): {
  seats: number;
  monthlySalaryBill: number;
  annualSalaryBill: number;
  addOnCost: number;
  regularAddOnCost: number;
  /** Add-on cost as a share of ONE year's salary bill, in percent. */
  percentOfAnnualSalary: number;
  /** How many days of one salesperson's pay one login costs. */
  daysOfSalaryPerLogin: number;
} {
  const n = Math.max(1, clampSalesSeats(seats));
  const salary = Math.max(1_000, Math.round(monthlySalaryInr || SALES_TEAM.defaultMonthlySalaryInr));
  const monthly = n * salary;
  const annual = monthly * 12;
  const cost = n * seatPrice(offerOpen);
  return {
    seats: n,
    monthlySalaryBill: monthly,
    annualSalaryBill: annual,
    addOnCost: cost,
    regularAddOnCost: n * SALES_TEAM.regularInr,
    percentOfAnnualSalary: Math.round((cost / annual) * 10_000) / 100,
    // Not rounded: ₹999 against ₹1,000 a day is 0.999 days, and the page
    // says "less than one day" — rounding to 1.00 would make that false.
    daysOfSalaryPerLogin: seatPrice(offerOpen) / (salary / 30),
  };
}

/** ₹36 lakh, ₹1.08 crore — how a factory owner says a big rupee figure. */
export function inrLakhs(amount: number): string {
  const n = Math.round(amount);
  const trim = (v: number) => v.toFixed(2).replace(/\.?0+$/, "");
  if (n >= 1_00_00_000) return `₹${trim(n / 1_00_00_000)} crore`;
  if (n >= 1_00_000) return `₹${trim(n / 1_00_000)} lakh`;
  return inr(n);
}

/* ─────────────────────── Shoot time ─────────────────────────────── */

/**
 * How long the crew is on site.
 *
 * Each plan includes a fixed shoot time — 2, 4 and 6 hours — that covers
 * its own areas and videos. Every extra area or video adds roughly
 * MINUTES_PER_EXTRA_* minutes; the added time is rounded UP to whole hours
 * and charged at EXTRA_HOUR_INR an hour, as its own line on the bill.
 *
 * A shoot longer than SHOOT_DAY_HOURS runs into a second day. That is SHOWN
 * (the buyer needs to plan the crew's overnight stay) but NOT charged as a
 * day on top of the hours: time is already billed by the hour, and adding
 * the logistics sheet's ₹20,000 day fee as well would bill the same hours
 * twice — and turn one extra area into a ₹20,999 jump on the slider. To
 * charge a second day as well, set CHARGE_ADDITIONAL_SHOOT_DAY to true.
 *
 * Change these to match what the crew actually takes; every quote follows.
 */
export const MINUTES_PER_EXTRA_AREA = 15;
export const MINUTES_PER_EXTRA_VIDEO = 15;
export const EXTRA_HOUR_INR = 999;
export const SHOOT_DAY_HOURS = 8;
export const CHARGE_ADDITIONAL_SHOOT_DAY = false;

export type ShootTime = {
  includedHours: number;
  extraMinutes: number;
  /** Whole hours charged beyond what the plan includes. */
  extraHours: number;
  totalHours: number;
  days: number;
};

export function shootTimeFor(
  planId: SitePlanId,
  extraAreas = 0,
  extraVideos = 0
): ShootTime {
  const plan = SITE_PLANS[planId];
  const extraMinutes =
    clampExtraAreas(extraAreas) * MINUTES_PER_EXTRA_AREA +
    clampExtraVideos(extraVideos) * MINUTES_PER_EXTRA_VIDEO;
  const extraHours = Math.ceil(extraMinutes / 60);
  const totalHours = plan.shootHours + extraHours;
  return {
    includedHours: plan.shootHours,
    extraMinutes,
    extraHours,
    totalHours,
    days: Math.max(1, Math.ceil(totalHours / SHOOT_DAY_HOURS)),
  };
}

/** "6 hours", "1 hour". */
export function hoursLabel(h: number): string {
  return `${h} hour${h === 1 ? "" : "s"}`;
}

/* ─────────────────────── Travel (legacy two-zone) ───────────────── */

/**
 * The OLD two-zone travel question ("is your factory in Delhi NCR?").
 *
 * Superseded by the city in lib/logistics.ts, which is what the funnel asks
 * for and what the bill shows. Kept so the earlier /checkout page and the
 * marketing site's code keep working: inside NCR is the cab; outside is a
 * place we do not shoot yet, and the order route refuses it.
 *
 * Prefer `city` over `travel` in every new call.
 */
export type TravelZone = "ncr" | "outside";

export const TRAVEL_FEES: Record<TravelZone, { label: string; amountInr: number }> = {
  ncr: { label: "Delhi NCR", amountInr: CAB_TRAVEL.amountInr },
  outside: { label: "Outside Delhi NCR (coming soon)", amountInr: CAB_TRAVEL.amountInr },
};

export function isTravelZone(v: unknown): v is TravelZone {
  return v === "ncr" || v === "outside";
}

/* ─────────────────────── The quote ──────────────────────────────── */

/** One line on the bill. The buyer sees exactly these, in this order. */
export type QuoteLine = {
  label: string;
  amountInr: number;
  note?: string;
  kind?: "plan" | "offer" | "extra" | "travel" | "time" | "support" | "coupon";
  /** The full price when this line is discounted to less (the support
   *  year, free for our first customers), so a screen can strike it out. */
  regularInr?: number;
};

/**
 * A coupon, as the order route found it in the database. Pricing never
 * looks a coupon up itself: whoever calls siteQuote() has already checked
 * the code is real, active and not used up (lib/server/coupons.ts).
 */
export type Coupon = {
  code: string;
  /** Exactly one of these is set. */
  percentOff: number | null;
  amountOffInr: number | null;
};

/** Rupees a coupon takes off a base, never more than the base. */
export function couponDiscount(c: Coupon, base: number): number {
  if (!(base > 0)) return 0;
  const raw =
    c.percentOff != null
      ? Math.round((base * Math.min(100, Math.max(0, c.percentOff))) / 100)
      : Math.max(0, Math.round(c.amountOffInr ?? 0));
  return Math.min(base, raw);
}

export function couponLabel(c: Coupon): string {
  return c.percentOff != null ? `${c.percentOff}% off` : `${inr(c.amountOffInr ?? 0)} off`;
}

export type SiteQuote = {
  plan: SitePlanSpec;
  offerOpen: boolean;
  /** What the special offer takes off, 0 once it has closed. */
  savingInr: number;
  extraAreas: number;
  extraVideos: number;
  totalAreas: number;
  totalVideos: number;
  /** Null when priced by the legacy travel zone instead of a city. */
  logistics: LogisticsQuote | null;
  /** False for a city we do not shoot in yet: the bill can be shown, but
   *  it cannot be paid. */
  available: boolean;
  /** What the support year costs on THIS order: 0 while the offer is open. */
  supportInr: number;
  /** What the coupon took off, 0 without one. */
  couponInr: number;
  coupon: Coupon | null;
  shoot: ShootTime;
  /** Kept for callers that only want the day count. */
  shootDays: number;
  /** Sales-team logins on this order, 0 when none. */
  salesSeats: number;
  lines: QuoteLine[];
  /** Sum of the lines, GST excluded. */
  taxableInr: number;
  gstInr: number;
  /** What the card is actually charged. */
  totalInr: number;
  /** The headline number on the slider. */
  perAreaInr: number;
};

/**
 * The full breakdown for a site plan — plan, offer, extras, travel, shoot
 * time, GST — so the recommendation page, the billing page and the order
 * route all quote identical numbers from one calculation.
 *
 * Nothing is hidden until the end: every line this returns is meant to be
 * on screen before the buyer is asked to pay.
 *
 * The first year of support, hosting & security is a line of its own:
 * free (struck out) while the offer is open, charged with the order after.
 * A coupon comes off the plan, extras, shoot time and sales team — never
 * the travel or the support year.
 */
/** The smallest bill a coupon can leave, GST excluded (Razorpay cannot take ₹0). */
export const MIN_PAYABLE_INR = 1;

/**
 * The cab line. Free for our first 50 customers — shown at its real price,
 * struck out, exactly like the first year of support — and charged after.
 */
function travelLine(label: string, amountInr: number, offerOpen: boolean): QuoteLine {
  const free = offerOpen && LAUNCH_OFFER.active;
  return {
    kind: "travel",
    label,
    amountInr: free ? 0 : amountInr,
    regularInr: amountInr,
    note: free ? `Free for our first ${LAUNCH_OFFER.limit} customers. ${CAB_TRAVEL.mode}` : CAB_TRAVEL.mode,
  };
}

export function siteQuote(
  planId: SitePlanId,
  opts: {
    extraAreas?: number;
    extraVideos?: number;
    city?: string;
    travel?: TravelZone;
    /** Whether the special offer still applies. The server decides this
     *  from the real count of buyers; screens pass what the server said. */
    offerOpen?: boolean;
    /** Sales-team logins bought with the plan. */
    salesSeats?: number;
    /** A coupon the caller has already checked is valid. */
    coupon?: Coupon | null;
  } = {}
): SiteQuote {
  const plan = SITE_PLANS[planId];
  const offerOpen = (opts.offerOpen ?? true) && LAUNCH_OFFER.active;
  const extraAreas = clampExtraAreas(opts.extraAreas);
  const extraVideos = clampExtraVideos(opts.extraVideos);
  const totalAreas = plan.scenes + extraAreas;
  const totalVideos = plan.videos + extraVideos;
  const shoot = shootTimeFor(planId, extraAreas, extraVideos);
  const savingInr = offerSaving(planId, offerOpen);

  const lines: QuoteLine[] = [
    {
      kind: "plan",
      label: `${plan.name} — ${plan.scenes} areas${plan.videos > 0 ? `, ${plan.videos} process videos` : ""}${plan.pdfs > 0 ? `, ${plan.pdfs} PDFs` : ""}`,
      amountInr: plan.regularInr,
      note: `${hoursLabel(plan.shootHours)} of shoot time included`,
    },
  ];
  if (savingInr > 0) {
    lines.push({
      kind: "offer",
      label: `${LAUNCH_OFFER.short} — ${LAUNCH_OFFER.percent}% off`,
      amountInr: -savingInr,
      note: `For our first ${LAUNCH_OFFER.limit} customers`,
    });
  }

  if (extraAreas > 0) {
    lines.push({
      kind: "extra",
      label: `${extraAreas} extra area${extraAreas === 1 ? "" : "s"}`,
      amountInr: extraAreaCost(planId, extraAreas),
      note: `${totalAreas} areas in total`,
    });
  }
  if (extraVideos > 0) {
    lines.push({
      kind: "extra",
      label: `${extraVideos} extra process video${extraVideos === 1 ? "" : "s"}`,
      amountInr: extraVideos * EXTRA_VIDEO_INR,
      note: VIDEO_SHOT_NOTE,
    });
  }

  if (shoot.extraHours > 0) {
    lines.push({
      kind: "time",
      label: `Extra shoot time — ${hoursLabel(shoot.extraHours)}`,
      amountInr: shoot.extraHours * EXTRA_HOUR_INR,
      note: `${hoursLabel(shoot.includedHours)} included, ${hoursLabel(shoot.totalHours)} needed · ₹${EXTRA_HOUR_INR}/hour`,
    });
  }

  const salesSeats = clampSalesSeats(opts.salesSeats);
  if (salesSeats > 0) {
    lines.push({
      kind: "extra",
      label: `Sales team — ${salesSeats} salesperson login${salesSeats === 1 ? "" : "s"}`,
      amountInr: salesSeats * SALES_TEAM.regularInr,
      note: `First year. ${inr(SALES_TEAM.regularInr)} per login per year, with the MD's sales dashboard. Renews yearly with support`,
    });
    if (offerOpen) {
      lines.push({
        kind: "offer",
        label: `${LAUNCH_OFFER.short} — ${inr(SALES_TEAM.offerInr)} per login per year`,
        amountInr: -salesSeats * (SALES_TEAM.regularInr - SALES_TEAM.offerInr),
        note: `For our first ${LAUNCH_OFFER.limit} customers, every year you renew`,
      });
    }
  }

  // The coupon, on everything above: plan, offer, extras, time, sales team.
  const coupon = opts.coupon ?? null;
  let couponInr = 0;
  if (coupon) {
    const base = lines.reduce((sum, l) => sum + l.amountInr, 0);
    couponInr = couponDiscount(coupon, base);
    if (couponInr > 0) {
      lines.push({
        kind: "coupon",
        label: `Coupon ${coupon.code} — ${couponLabel(coupon)}`,
        amountInr: -couponInr,
      });
    }
  }

  // Travel: the cab, for a city we shoot in.
  let logistics: LogisticsQuote | null = null;
  let available = true;
  if (typeof opts.city === "string" && opts.city.trim()) {
    logistics = logisticsFor(opts.city);
    available = logistics.inServiceArea;
    if (available) {
      lines.push(travelLine(`${CAB_TRAVEL.label} — ${logistics.city}`, logistics.amountInr, offerOpen));
    }
  } else {
    const zone: TravelZone = isTravelZone(opts.travel) ? opts.travel : "outside";
    available = zone === "ncr";
    if (available) {
      lines.push(travelLine(`${CAB_TRAVEL.label} — ${TRAVEL_FEES[zone].label}`, TRAVEL_FEES[zone].amountInr, offerOpen));
    }
  }

  // The first year of support, hosting & security.
  const supportInr = offerOpen ? 0 : SUPPORT_ANNUAL_INR;
  lines.push({
    kind: "support",
    label: `First year of ${SUPPORT_NAME.toLowerCase()}`,
    amountInr: supportInr,
    regularInr: SUPPORT_ANNUAL_INR,
    note: offerOpen
      ? `Free for our first ${LAUNCH_OFFER.limit} customers. From year 2, ${inr(SUPPORT_ANNUAL_INR)} + GST a year (${inr(SUPPORT_MONTHLY_INR)}/month)`
      : `${inr(SUPPORT_MONTHLY_INR)}/month, billed yearly. Renews at ${inr(SUPPORT_ANNUAL_INR)} + GST a year`,
  });

  if (shoot.days > 1 && CHARGE_ADDITIONAL_SHOOT_DAY) {
    const extraDays = shoot.days - 1;
    lines.push({
      kind: "time",
      label: `${extraDays} additional shoot day${extraDays === 1 ? "" : "s"}`,
      amountInr: extraDays * ADDITIONAL_SHOOT_DAY_INR,
      note: `${hoursLabel(shoot.totalHours)} on site runs past one ${SHOOT_DAY_HOURS}-hour day`,
    });
  }

  // Razorpay cannot take ₹0, and with travel and support free a 100% coupon
  // would otherwise leave nothing to pay. A coupon therefore always leaves at
  // least ₹1 (+ GST) on the bill: the coupon line gives the last rupee back.
  let taxableBeforeFloor = lines.reduce((sum, l) => sum + l.amountInr, 0);
  if (couponInr > 0 && taxableBeforeFloor < MIN_PAYABLE_INR) {
    const giveBack = Math.min(couponInr, MIN_PAYABLE_INR - taxableBeforeFloor);
    couponInr -= giveBack;
    const cl = lines.find((l) => l.kind === "coupon");
    if (cl) cl.amountInr = -couponInr;
    taxableBeforeFloor += giveBack;
  }

  const taxableInr = taxableBeforeFloor;
  const g = withGst(taxableInr);

  return {
    plan,
    offerOpen,
    savingInr,
    extraAreas,
    extraVideos,
    totalAreas,
    totalVideos,
    logistics,
    available,
    supportInr,
    couponInr,
    coupon: couponInr > 0 ? coupon : null,
    shoot,
    shootDays: shoot.days,
    salesSeats,
    lines,
    taxableInr: g.taxable,
    gstInr: g.gst,
    totalInr: g.total,
    perAreaInr: sitePerArea(planId, extraAreas, offerOpen),
  };
}

/**
 * The older, narrower quote: plan plus a travel zone, nothing else.
 * Kept so /checkout and the pay bridge keep working unchanged. New code
 * should call siteQuote().
 */
export function sitePlanQuote(
  planId: SitePlanId,
  travel: TravelZone,
  offerOpen = LAUNCH_OFFER.active
): {
  plan: SitePlanSpec;
  base: number;
  discount: number;
  travelFee: number;
  /** Payable now, GST excluded. */
  amountInr: number;
} {
  const plan = SITE_PLANS[planId];
  const discount = offerSaving(planId, offerOpen);
  // Free while the special offer is open, like the first year of support.
  const travelFee = offerOpen && LAUNCH_OFFER.active ? 0 : TRAVEL_FEES[travel].amountInr;
  return {
    plan,
    base: plan.regularInr,
    discount,
    travelFee,
    amountInr: plan.regularInr - discount + travelFee,
  };
}

/* ═══════════════════ What the invoice itemises ════════════════════ */

/**
 * One printed row of a tax invoice.
 *
 * This is NOT the same thing as a QuoteLine. A quote is a running total
 * on a screen; an invoice is a document that has to be readable by a
 * stranger — the buyer's accountant — years later. So a row may carry no
 * money at all ("On-site capture … Included"): it is there to say what
 * the money bought.
 *
 * A discount is a row with a NEGATIVE amount rather than a smaller plan
 * price. Under GST a discount is only excluded from the taxable value
 * when the invoice itself shows it, so the special offer and any coupon
 * must stay visible here.
 */
export type InvoiceLine = {
  title: string;
  /** The small grey second line under the title. */
  detail?: string | null;
  /** Null hides the quantity column for this row. */
  qty?: number | null;
  /** Null prints "Included" — a row that is part of the plan price. */
  unitInr?: number | null;
  /** Null prints an em dash: nothing is charged on this row. */
  amountInr: number | null;
};

/** What one plan covers, in one sentence, for the invoice's first row. */
export function planInclusionSentence(q: SiteQuote): string {
  const bits = [`360° factory walkthrough`, `${q.totalAreas} Active Operational Areas`];
  if (q.totalVideos > 0) bits.push(`${q.totalVideos} process videos`);
  if (q.plan.pdfs > 0) bits.push(`${q.plan.pdfs} lab reports & certifications`);
  bits.push("information icons", "custom domain", "password-protected dashboard and branding");
  if (q.plan.sharingControls) bits.push("one-time link expiry and sharing restrictions");
  return `${bits.join(", ")}.`;
}

/**
 * Turn a site-plan quote into the rows a buyer sees on the invoice.
 *
 * The money must still add up to the same taxable value, so every quote
 * line becomes a row. The two "Included" rows carry no amount and are
 * there to answer the question an invoice for a one-line "VPV Authority"
 * always provokes: what exactly did we pay for?
 */
export function invoiceLinesFromQuote(q: SiteQuote): InvoiceLine[] {
  const out: InvoiceLine[] = [];
  for (const l of q.lines) {
    if (l.kind === "plan") {
      out.push({ title: q.plan.name, detail: planInclusionSentence(q), qty: 1, unitInr: l.amountInr, amountInr: l.amountInr });
      out.push({
        title: "On-site capture",
        detail: `Our crew shoots your plant — ${hoursLabel(q.shoot.totalHours)} on site${q.shoot.days > 1 ? ` over ${q.shoot.days} days` : ", in a single visit"}.`,
        qty: 1,
        unitInr: null,
        amountInr: null,
      });
      out.push({
        title: "Project setup & delivery",
        detail: "Editing, colour grading, workspace setup and handover training.",
        qty: 1,
        unitInr: null,
        amountInr: null,
      });
      continue;
    }
    const qty =
      l.kind === "extra" && /^(\d+) extra/.exec(l.label) ? Number(/^(\d+) extra/.exec(l.label)![1]) : 1;
    out.push({
      title: l.label,
      detail: l.note ?? null,
      qty,
      unitInr: qty > 1 ? Math.round((l.amountInr / qty) * 100) / 100 : l.amountInr,
      amountInr: l.amountInr,
    });
  }
  return out;
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
export type PurchasePurpose = "basic_licence" | "support_renewal" | "scene_topup" | "plan_upgrade" | "seat_topup";

export function isPurchasePurpose(v: unknown): v is PurchasePurpose {
  return (
    v === "basic_licence" ||
    v === "support_renewal" ||
    v === "scene_topup" ||
    v === "plan_upgrade" ||
    v === "seat_topup"
  );
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

/** What moving up a plan costs: the difference between the two plans at today's prices. */
export function upgradeQuote(
  from: SitePlanId,
  to: SitePlanId,
  offerOpen = LAUNCH_OFFER.active
): { amountInr: number; addAreas: number; addVideos: number; addPdfs: number } {
  const a = SITE_PLANS[from];
  const b = SITE_PLANS[to];
  return {
    amountInr: Math.max(0, planPrice(to, offerOpen) - planPrice(from, offerOpen)),
    addAreas: Math.max(0, b.scenes - a.scenes),
    addVideos: Math.max(0, b.videos - a.videos),
    addPdfs: Math.max(0, b.pdfs - a.pdfs),
  };
}

export function clampMonths(m: unknown): number {
  const v = typeof m === "number" && Number.isFinite(m) ? Math.ceil(m) : 12;
  return Math.max(1, Math.min(12, v));
}

/** Whole months from now until `end`, rounded up; 12 when there is no future end date. */
export function monthsUntil(end: Date | string | null | undefined, now = new Date()): number {
  if (!end) return 12;
  const t = new Date(end).getTime();
  if (!Number.isFinite(t) || t <= now.getTime()) return 12;
  return clampMonths((t - now.getTime()) / (30.4375 * 86_400_000));
}

/** Extra logins bought mid-year pay only for the months until the logins renew. */
export function seatTopupAmount(seats: number, eachPerYear: number, months: number): number {
  return Math.round((Math.max(0, seats) * Math.max(0, eachPerYear) * clampMonths(months)) / 12);
}

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
    city?: string;
    extraAreas?: number;
    extraVideos?: number;
    /** Decided by the order route from the real count of buyers. */
    offerOpen?: boolean;
    salesSeats?: number;
    /** Renewal only: the price per sales login the customer bought at. */
    seatInr?: number;
    /** Looked up and checked by the order route. */
    coupon?: Coupon | null;
    /** plan_upgrade: the plan the workspace has, and the one it is buying. */
    fromPlan?: SitePlanId;
    toPlan?: SitePlanId;
    /** seat_topup: whole months left until the logins' renewal date (1–12). */
    monthsLeft?: number;
  } = {}
): { amountInr: number; description: string; scenes: number | null; lines: InvoiceLine[] } {
  switch (purpose) {
    case "plan_upgrade": {
      const from: SitePlanId = isSitePlanId(opts.fromPlan) ? opts.fromPlan : "confidence";
      const to: SitePlanId = isSitePlanId(opts.toPlan) ? opts.toPlan : "control";
      const q = upgradeQuote(from, to, opts.offerOpen);
      const have = Math.max(0, Math.round(opts.existingScenes ?? 0));
      return {
        amountInr: q.amountInr,
        description: `Upgrade ${SITE_PLANS[from].name} → ${SITE_PLANS[to].name}${q.addAreas > 0 ? ` (+${q.addAreas} areas)` : ""}`,
        scenes: have + q.addAreas,
        lines: [
          {
            title: `Upgrade to ${SITE_PLANS[to].name}`,
            detail:
              `From ${SITE_PLANS[from].name}: the price difference at today's prices. ` +
              [
                q.addAreas > 0 ? `${q.addAreas} more areas` : "",
                q.addVideos > 0 ? `${q.addVideos} more process videos` : "",
                q.addPdfs > 0 ? `${q.addPdfs} more lab reports & certifications` : "",
                SITE_PLANS[to].sharingControls && !SITE_PLANS[from].sharingControls ? "one-time links and sharing restrictions" : "",
              ]
                .filter(Boolean)
                .join(", ") +
              ".",
            qty: 1,
            unitInr: q.amountInr,
            amountInr: q.amountInr,
          },
        ],
      };
    }
    case "seat_topup": {
      const seats = Math.max(1, clampSalesSeats(opts.salesSeats ?? 1));
      const each = Math.max(0, Math.round(opts.seatInr ?? seatPrice(opts.offerOpen)));
      const months = clampMonths(opts.monthsLeft);
      const amount = seatTopupAmount(seats, each, months);
      return {
        amountInr: amount,
        description: `Sales Team logins — ${seats} more at ${inr(each)}/yr, ${months} month${months === 1 ? "" : "s"}`,
        scenes: null,
        lines: [
          {
            title: `Sales Team logins — ${seats} more salesperson login${seats === 1 ? "" : "s"}`,
            detail:
              months === 12
                ? `For one year, at ${inr(each)} per login a year.`
                : `For the ${months} month${months === 1 ? "" : "s"} until your logins renew, at ${inr(each)} per login a year.`,
            qty: seats,
            unitInr: Math.round((amount / seats) * 100) / 100,
            amountInr: amount,
          },
        ],
      };
    }
    case "basic_licence": {
      const n = clampScenes(opts.scenes ?? SCENE_DEFAULT);
      return {
        amountInr: priceForScenes(n),
        description: `VPV Basic licence — ${n} scene${n === 1 ? "" : "s"} (includes 1 year support and hosting)`,
        scenes: n,
        lines: [
          {
            title: "VPV Basic licence",
            detail: `${n} scene${n === 1 ? "" : "s"}, including the first year of ${SUPPORT_NAME.toLowerCase()}.`,
            qty: n,
            unitInr: Math.round((priceForScenes(n) / n) * 100) / 100,
            amountInr: priceForScenes(n),
          },
        ],
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
        lines: [
          {
            title: `${added} extra scene${added === 1 ? "" : "s"}`,
            detail: `Your workspace goes from ${have} to ${capped} scenes.`,
            qty: added,
            unitInr:
              added > 0
                ? Math.round(((priceForScenes(capped) - priceForScenes(have)) / added) * 100) / 100
                : null,
            amountInr: Math.max(0, priceForScenes(capped) - priceForScenes(have)),
          },
        ],
      };
    }
    case "site_plan": {
      // The browser names a plan, a city and how many extras it wants.
      // Every one of those is checked against the tables above and the
      // price comes from here — a tampered request can pick a different
      // plan or more areas, never a cheaper rate for them.
      const planId: SitePlanId = isSitePlanId(opts.sitePlanId)
        ? opts.sitePlanId
        : "confidence";
      const q = siteQuote(planId, {
        extraAreas: opts.extraAreas,
        extraVideos: opts.extraVideos,
        city: opts.city,
        travel: opts.travel,
        offerOpen: opts.offerOpen,
        salesSeats: opts.salesSeats,
        coupon: opts.coupon,
      });
      const parts = [`${q.plan.name} — ${q.totalAreas} areas`];
      if (q.totalVideos > 0) parts.push(`${q.totalVideos} process videos`);
      if (q.savingInr > 0) parts.push(LAUNCH_OFFER.short);
      parts.push(`${hoursLabel(q.shoot.totalHours)} shoot`);
      // Read back by seatsFromOrderNotes() when the workspace is built, so the
      // yearly renewal knows how many logins, and at what price, to bill.
      if (q.salesSeats > 0) {
        parts.push(`sales team ${q.salesSeats} login${q.salesSeats === 1 ? "" : "s"} at ${inr(seatPrice(q.offerOpen))}/yr`);
      }
      const travelFree = q.lines.some((l) => l.kind === "travel" && l.amountInr === 0);
      const where = q.logistics ? q.logistics.city : TRAVEL_FEES[isTravelZone(opts.travel) ? opts.travel : "outside"].label;
      parts.push(`cab ${where}${travelFree ? " (free)" : ""}`);
      if (q.shoot.days > 1) parts.push(`${q.shoot.days} shoot days`);
      // The coupon's code is how lib/server/coupons.ts counts its uses, so
      // it is written in a fixed shape.
      if (q.coupon) parts.push(`coupon ${q.coupon.code}`);
      return {
        amountInr: q.taxableInr,
        description: `${parts.join(", ")} (includes year 1 of ${SUPPORT_NAME.toLowerCase()}${q.supportInr === 0 ? ", free" : ""})`,
        scenes: q.totalAreas,
        lines: invoiceLinesFromQuote(q),
      };
    }
    case "support_renewal": {
      const seats = clampSalesSeats(opts.salesSeats ?? 0);
      // 0 = logins bought before they were yearly: paid once, never renewed.
      const each = seats > 0 ? Math.max(0, Math.round(opts.seatInr ?? 0)) : 0;
      return {
        amountInr: renewalAmount(seats, each),
        description:
          `VPV ${SUPPORT_NAME.toLowerCase()} — 1 year` +
          (seats > 0 && each > 0 ? `, with sales team ${seats} login${seats === 1 ? "" : "s"} at ${inr(each)}/yr` : ""),
        scenes: null,
        lines: [
          {
            title: SUPPORT_NAME,
            detail: "One more year of hosting, security, backups, updates and technical support.",
            qty: 1,
            unitInr: SUPPORT_ANNUAL_INR,
            amountInr: SUPPORT_ANNUAL_INR,
          },
          ...(seats > 0 && each > 0
            ? [
                {
                  title: `Sales Team logins — ${seats} salesperson login${seats === 1 ? "" : "s"}`,
                  detail: "Renewed for one year, with the MD's sales dashboard.",
                  qty: seats,
                  unitInr: each,
                  amountInr: seats * each,
                },
              ]
            : []),
        ],
      };
    }
  }
}
