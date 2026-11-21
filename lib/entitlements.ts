/**
 * lib/entitlements.ts — what each plan actually gets. ONE place.
 *
 * The website promises a short list per plan (lib/site/bundleData.ts builds
 * the plan cards from lib/pricing.ts). The app can do much more than that,
 * and until now everyone got all of it. From 26 Oct 2026:
 *
 *   • a feature promised on a plan is OPEN on that plan and every plan above;
 *   • a feature promised only on a higher plan is LOCKED (visible, with an
 *     "Upgrade to …" pop-up that leads to the upgrade page);
 *   • a feature promised on no plan at all is HIDDEN from everyone. The code
 *     stays; it is revealed later as a new feature by changing its line in
 *     ROLLOUT below from "hidden" to the plan it should start on.
 *
 * Pure and shared: the dashboard, the API routes and the tests all read the
 * same table. The database repeats the two rules that guard money or
 * privacy (sharing controls on links, the Sales Team logins), so a modified
 * browser cannot open them.
 */

import { SITE_PLANS, SITE_PLAN_ORDER, isKnownPlanId, planPrice, type LinkControl, type SitePlanId, type SoldPlanId } from "@/lib/pricing";

/**
 * Where a feature starts. "all" = every plan; "media" = plans with process
 * videos and lab reports (Pro and up, and the old Authority and up);
 * "link" = one of the link controls, each on the plans whose
 * `linkControls` include it (see lib/pricing.ts); "sales" = the Sales Team
 * add-on.
 */
export type Tier = "all" | "media" | "link" | "sales" | "hidden";

export type FeatureKey =
  // promised on every plan
  | "tours"
  | "info_icons"
  | "dashboard_password"
  | "custom_domain"
  | "branding"
  | "share_links"
  // promised from Pro up (level 1)
  | "process_videos"
  | "pdf_reports"
  // the link controls, each from its own plan (lib/pricing.ts linkControls)
  | "link_one_time"
  | "link_password"
  | "link_expiry"
  | "link_devices"
  | "link_email_gate"
  // the Sales Team add-on (any plan)
  | "sales_team"
  // promised nowhere yet — future rollouts
  | "meeting_recording"
  | "ai_meeting_analysis"
  | "voice_samples"
  | "subtitles_translations"
  | "audio_narration"
  | "auto_tour"
  | "measure_tool"
  | "menu_builder"
  | "offline_mode"
  | "qr_codes"
  | "embed"
  | "visitor_analytics"
  | "leads"
  | "calendar"
  | "live_coediting"
  | "tour_duplicate"
  | "tour_import_export";

/**
 * THE TABLE. Changing a line here is how a feature is released.
 * `label` is what the upgrade pop-up calls it.
 */
export const ROLLOUT: Record<FeatureKey, { tier: Tier; label: string; control?: LinkControl }> = {
  tours: { tier: "all", label: "Virtual tours of your plant" },
  info_icons: { tier: "all", label: "Information icons" },
  dashboard_password: { tier: "all", label: "Password-protected dashboard" },
  custom_domain: { tier: "all", label: "Your own VPV address" },
  branding: { tier: "all", label: "Your logo and colours" },
  share_links: { tier: "all", label: "Share a tour by link" },

  process_videos: { tier: "media", label: "Process videos" },
  pdf_reports: { tier: "media", label: "Lab reports & certifications" },

  link_one_time: { tier: "link", control: "oneTime", label: "One-time view links" },
  link_password: { tier: "link", control: "password", label: "Password-protected links" },
  link_expiry: { tier: "link", control: "expiry", label: "Control link expiry time" },
  link_devices: { tier: "link", control: "devices", label: "Limit device access" },
  // Promised on no card; it comes with every control (Signature, and the old Control and Enterprise).
  link_email_gate: { tier: "link", control: "devices", label: "E-mail before viewing" },

  sales_team: { tier: "sales", label: "Sales Team dashboard and logins" },

  meeting_recording: { tier: "hidden", label: "Meeting recording and transcripts" },
  ai_meeting_analysis: { tier: "hidden", label: "AI meeting analysis" },
  voice_samples: { tier: "hidden", label: "Voice samples" },
  subtitles_translations: { tier: "hidden", label: "Subtitles and translations" },
  audio_narration: { tier: "hidden", label: "Audio narration" },
  auto_tour: { tier: "hidden", label: "Auto-play tour" },
  measure_tool: { tier: "hidden", label: "Measuring tool" },
  menu_builder: { tier: "hidden", label: "Menu builder" },
  offline_mode: { tier: "hidden", label: "Offline presenting" },
  qr_codes: { tier: "hidden", label: "QR codes" },
  embed: { tier: "hidden", label: "Embed on your website" },
  visitor_analytics: { tier: "hidden", label: "Visitor analytics" },
  leads: { tier: "hidden", label: "Leads" },
  calendar: { tier: "hidden", label: "Calendar" },
  live_coediting: { tier: "hidden", label: "Live co-editing" },
  tour_duplicate: { tier: "hidden", label: "Duplicate a tour" },
  tour_import_export: { tier: "hidden", label: "Import and export tours" },
};

export const FEATURE_KEYS = Object.keys(ROLLOUT) as FeatureKey[];

/** What the workspace has, as the entitlement rules need it. */
export type WorkspaceFacts = {
  /** organizations.plan — basic (every site plan), or the old pro / ultra. */
  plan?: string | null;
  /** organizations.site_plan — which plan was bought (one of the four, or an older one). */
  site_plan?: string | null;
  /** organizations.plan_billing — "annual" or "lifetime" (plans on sale only). */
  plan_billing?: string | null;
  /** Sales Team logins paid for. */
  sales_seats?: number | null;
  /** The signed-in person's role. The platform owner (our team) sees everything. */
  role?: string | null;
};

/**
 * The plan the rules apply. Pro and Ultra in organizations.PLAN (monthly
 * plans agreed by conversation, before any of the site plans existed) get
 * the top features, as the old Enterprise did. A Basic workspace with no
 * plan recorded was bought on the old scene ladder and gets the base
 * features; /admin/customers can set it. A plan no longer sold (Confidence,
 * Authority, Control, Enterprise) keeps exactly what it had.
 */
export function effectivePlan(f: WorkspaceFacts): SitePlanId {
  if (f.plan === "pro" || f.plan === "ultra") return "enterprise";
  const sp = String(f.site_plan ?? "");
  return isKnownPlanId(sp) ? sp : "confidence";
}

export type Access =
  | { state: "open" }
  | { state: "locked"; upgradeTo: SoldPlanId | "sales_team" }
  | { state: "hidden" };

/** Can this workspace use this feature, and if not, what unlocks it? */
export function accessTo(f: WorkspaceFacts, key: FeatureKey): Access {
  if (f.role === "owner") return { state: "open" };
  const tier = ROLLOUT[key].tier;
  if (tier === "hidden") return { state: "hidden" };
  if (tier === "all") return { state: "open" };
  if (tier === "sales") return (f.sales_seats ?? 0) > 0 ? { state: "open" } : { state: "locked", upgradeTo: "sales_team" };
  const has = (p: SitePlanId) =>
    tier === "media" ? SITE_PLANS[p].level >= 1 : SITE_PLANS[p].linkControls[ROLLOUT[key].control!];
  if (has(effectivePlan(f))) return { state: "open" };
  // The first plan this workspace can move up to that has it; failing that,
  // the first plan on sale that has it (White Glove, and any move from a
  // plan sold before 21 Nov 2026, are arranged with our team, so the pop-up
  // says so instead of linking to a payment — see canBuyUpgrade).
  const to = upgradeOptions(f).find(has) ?? SITE_PLAN_ORDER.find(has) ?? "white_glove";
  return { state: "locked", upgradeTo: to };
}

export const canUse = (f: WorkspaceFacts, key: FeatureKey) => accessTo(f, key).state === "open";
export const isHidden = (f: WorkspaceFacts, key: FeatureKey) => accessTo(f, key).state === "hidden";

/** How many process videos, lab reports & certifications and information icons the plan includes. */
export function planLimits(f: WorkspaceFacts): { videos: number; pdfs: number; infoIcons: number } {
  if (f.role === "owner") return { videos: Infinity, pdfs: Infinity, infoIcons: Infinity };
  const p = SITE_PLANS[effectivePlan(f)];
  return { videos: p.videos, pdfs: p.pdfs, infoIcons: p.infoIcons };
}

/** The first plan this workspace can move up to that allows more of something. */
export function upgradeForMore(f: WorkspaceFacts, what: "videos" | "pdfs" | "infoIcons"): SoldPlanId | null {
  const now = SITE_PLANS[effectivePlan(f)][what];
  return upgradeOptions(f).find((p) => SITE_PLANS[p][what] > now) ?? null;
}

/**
 * Can a workspace on `from` move up to `to` from its own dashboard? Only
 * from one yearly plan to a yearly plan on sale that costs more, has at
 * least as many areas and at least the same features (the customer pays the
 * yearly difference for the months left). Never to White Glove: it includes
 * Mr. Gupta's own time, so it is a conversation, not a button. A workspace
 * on a one-time plan from before 21 Nov 2026 moves to a yearly plan by
 * talking to us, too: what it already paid has to be settled by a person.
 */
export function isUpgrade(from: SitePlanId, to: SitePlanId): boolean {
  const a = SITE_PLANS[from];
  const b = SITE_PLANS[to];
  return (
    a.billing === "yearly" &&
    !b.legacy &&
    !b.personal &&
    b.level >= a.level &&
    b.scenes >= a.scenes &&
    planPrice(to) > planPrice(from)
  );
}

/** Plans this workspace can upgrade to from its own page, smallest first. */
export function upgradeOptions(f: WorkspaceFacts): SoldPlanId[] {
  // A plan bought for life has no yearly price to prorate: moving it up is
  // arranged with our team.
  if (f.plan_billing === "lifetime") return [];
  const from = effectivePlan(f);
  return SITE_PLAN_ORDER.filter((p) => isUpgrade(from, p));
}

/** Can this workspace pay for a move to `to` online? (Else: write to us.) */
export function canBuyUpgrade(f: WorkspaceFacts, to: SitePlanId): boolean {
  return f.plan_billing !== "lifetime" && isUpgrade(effectivePlan(f), to);
}

/**
 * The one plan the dashboard ever suggests: the first that opens features
 * this workspace does not have (Light → Premium; Premium → Ultra). Null on
 * Ultra and up, where nothing more is sold from the dashboard.
 */
export function nextPlan(f: WorkspaceFacts): SoldPlanId | null {
  const level = SITE_PLANS[effectivePlan(f)].level;
  return upgradeOptions(f).find((p) => SITE_PLANS[p].level > level) ?? null;
}

/** "VPV Control" etc. */
export const planName = (p: SitePlanId) => SITE_PLANS[p].name;
