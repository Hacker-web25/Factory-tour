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
 * │ ANNUAL TECHNICAL SUPPORT  ₹10,000 / year, FIRST YEAR FREE with    │
 * │        every Basic purchase. Billed from year two.                 │
 * └───────────────────────────────────────────────────────────────────┘
 *
 * Every amount here is INR and INCLUDES GST — the number the customer
 * sees is the number they pay. Invoices show the taxable value and the
 * GST separately (splitGst below).
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
 * Marginal price of each additional scene, GST included.
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
 * What a pack of `scenes` scenes costs, GST included.
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

/** Monthly subscription prices, GST included. Sold by conversation —
 *  shown on the site, but not payable through the website checkout. */
export const PRO_MONTHLY_INR = 5_000;
export const ULTRA_MONTHLY_INR = 15_000;

/** Annual technical support and maintenance, GST included. */
export const SUPPORT_ANNUAL_INR = 10_000;
/** Months of support included free with a Basic purchase. */
export const SUPPORT_FREE_MONTHS = 12;
/** Days after the renewal date before support actually pauses. */
export const SUPPORT_GRACE_DAYS = 15;

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
    label: "Technical support and maintenance",
    basic: "Year 1 free, then ₹10,000/year",
    pro: "Included",
    ultra: "Included, priority",
  },
];

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
 * Split a GST-inclusive price into the taxable value and the GST inside
 * it, to the paisa, so the two always add back to what the customer
 * paid: 29,999 → 25,422.88 + 4,576.12.
 */
export function splitGst(inclusive: number): {
  taxable: number;
  gst: number;
  total: number;
} {
  const taxable = Math.round((inclusive / (1 + GST_RATE)) * 100) / 100;
  const gst = Math.round((inclusive - taxable) * 100) / 100;
  return { taxable, gst, total: inclusive };
}

/** Rupees → paise, which is what Razorpay's API takes. Integer only. */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Paise → rupees, for displaying a stored order amount. */
export function fromPaise(paise: number): number {
  return Math.round(paise) / 100;
}

/* ═══════════════════════ What we charge for ═══════════════════════ */

/**
 * The only two things the website takes money for. Pro and Ultra are
 * deliberately absent: they are large recurring amounts, agreed in
 * conversation and invoiced separately.
 */
export type PurchasePurpose = "basic_licence" | "support_renewal" | "scene_topup";

export function isPurchasePurpose(v: unknown): v is PurchasePurpose {
  return v === "basic_licence" || v === "support_renewal" || v === "scene_topup";
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
  purpose: PurchasePurpose,
  opts: { scenes?: number; existingScenes?: number } = {}
): { amountInr: number; description: string; scenes: number | null } {
  switch (purpose) {
    case "basic_licence": {
      const n = clampScenes(opts.scenes ?? SCENE_DEFAULT);
      return {
        amountInr: priceForScenes(n),
        description: `VPV Basic licence — ${n} scene${n === 1 ? "" : "s"} (includes 1 year technical support)`,
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
    case "support_renewal":
      return {
        amountInr: SUPPORT_ANNUAL_INR,
        description: "VPV annual technical support and maintenance — 1 year",
        scenes: null,
      };
  }
}
