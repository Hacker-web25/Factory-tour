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

import { SITE_PLANS, SITE_PLAN_ORDER, type SitePlanId } from "@/lib/pricing";

/** Where a feature starts. "all" = every plan; "sales" = the Sales Team add-on. */
export type Tier = "all" | "authority" | "control" | "sales" | "hidden";

export type FeatureKey =
  // promised on every plan
  | "tours"
  | "info_icons"
  | "dashboard_password"
  | "custom_domain"
  | "branding"
  | "share_links"
  // promised from Authority up
  | "process_videos"
  | "pdf_reports"
  // promised on Control and Enterprise only
  | "sharing_controls"
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
export const ROLLOUT: Record<FeatureKey, { tier: Tier; label: string }> = {
  tours: { tier: "all", label: "Virtual tours of your plant" },
  info_icons: { tier: "all", label: "Information icons" },
  dashboard_password: { tier: "all", label: "Password-protected dashboard" },
  custom_domain: { tier: "all", label: "Your own VPV address" },
  branding: { tier: "all", label: "Your logo and colours" },
  share_links: { tier: "all", label: "Share a tour by link" },

  process_videos: { tier: "authority", label: "Process videos" },
  pdf_reports: { tier: "authority", label: "PDF reports" },

  sharing_controls: { tier: "control", label: "One-time links and sharing restrictions" },

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

const RANK: Record<SitePlanId, number> = { confidence: 0, authority: 1, control: 2, enterprise: 3 };

/** What the workspace has, as the entitlement rules need it. */
export type WorkspaceFacts = {
  /** organizations.plan — basic (every site plan), or the old pro / ultra. */
  plan?: string | null;
  /** organizations.site_plan — which of the four plans was bought. */
  site_plan?: string | null;
  /** Sales Team logins paid for. */
  sales_seats?: number | null;
  /** The signed-in person's role. The platform owner (our team) sees everything. */
  role?: string | null;
};

/**
 * The plan the rules apply. Pro and Ultra (monthly plans agreed by
 * conversation, before the four plans existed) get Enterprise's features.
 * A Basic workspace with no plan recorded was bought on the old scene
 * ladder and gets Confidence's; /admin/customers can set it.
 */
export function effectivePlan(f: WorkspaceFacts): SitePlanId {
  if (f.plan === "pro" || f.plan === "ultra") return "enterprise";
  const sp = String(f.site_plan ?? "");
  return (SITE_PLAN_ORDER as string[]).includes(sp) ? (sp as SitePlanId) : "confidence";
}

export type Access =
  | { state: "open" }
  | { state: "locked"; upgradeTo: SitePlanId | "sales_team" }
  | { state: "hidden" };

/** Can this workspace use this feature, and if not, what unlocks it? */
export function accessTo(f: WorkspaceFacts, key: FeatureKey): Access {
  if (f.role === "owner") return { state: "open" };
  const tier = ROLLOUT[key].tier;
  if (tier === "hidden") return { state: "hidden" };
  if (tier === "all") return { state: "open" };
  if (tier === "sales") return (f.sales_seats ?? 0) > 0 ? { state: "open" } : { state: "locked", upgradeTo: "sales_team" };
  const plan = effectivePlan(f);
  const need: SitePlanId = tier === "authority" ? "authority" : "control";
  return RANK[plan] >= RANK[need] ? { state: "open" } : { state: "locked", upgradeTo: need };
}

export const canUse = (f: WorkspaceFacts, key: FeatureKey) => accessTo(f, key).state === "open";
export const isHidden = (f: WorkspaceFacts, key: FeatureKey) => accessTo(f, key).state === "hidden";

/** How many process videos and PDF reports the plan includes. */
export function planLimits(f: WorkspaceFacts): { videos: number; pdfs: number } {
  if (f.role === "owner") return { videos: Infinity, pdfs: Infinity };
  const p = SITE_PLANS[effectivePlan(f)];
  return { videos: p.videos, pdfs: p.pdfs };
}

/** The next plan up, which is the only one the dashboard ever suggests. Null on Control and Enterprise. */
export function nextPlan(f: WorkspaceFacts): SitePlanId | null {
  const p = effectivePlan(f);
  if (p === "confidence") return "authority";
  if (p === "authority") return "control";
  return null;
}

/** Plans this workspace can upgrade to from its own page (never Enterprise: it is a conversation). */
export function upgradeOptions(f: WorkspaceFacts): SitePlanId[] {
  const from = RANK[effectivePlan(f)];
  return (["authority", "control"] as SitePlanId[]).filter((p) => RANK[p] > from);
}

export function isUpgrade(from: SitePlanId, to: SitePlanId): boolean {
  return RANK[to] > RANK[from] && to !== "enterprise";
}

/** "VPV Control" etc. */
export const planName = (p: SitePlanId) => SITE_PLANS[p].name;
