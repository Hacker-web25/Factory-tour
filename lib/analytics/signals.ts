/**
 * lib/analytics/signals.ts — the vocabulary of the tracking, in ONE place.
 *
 * Three things have to agree on what an event is called, and they are
 * written in three different languages:
 *
 *   • lib/analytics/client.ts   TypeScript, for the Next.js app pages
 *   • lib/site/measure.ts       plain browser JS, for the marketing bundle
 *   • app/api/track/route.ts    the server, which allowlists what it stores
 *
 * When they drifted before, an event fired for weeks and was silently
 * discarded by the route. So the names live here and the server imports
 * them; measure.ts is plain JS inside a template string and cannot import,
 * so its names are checked against this list by a test instead.
 *
 * Pure and dependency-free: no Node, no browser, no database.
 */

/* ────────────────────────── what we record ──────────────────────────────── */

/**
 * Every event the server will store. An allowlist rather than free text, so
 * a bored visitor cannot fill the table with invented names.
 *
 * Grouped by the question each one answers, because an event nobody can
 * name a question for is an event nobody will ever read.
 */
export const EVENT_NAMES = [
  /* Where they went and how long they stayed. */
  "page_view",
  "page_time",
  "funnel_step",

  /* What they reached on a long page. The marketing pages are tall; knowing
     somebody scrolled past the price and kept reading is the difference
     between "saw the price" and "read the price". */
  "section_view",
  "scroll_depth",

  /* What they pressed. */
  "cta_click",
  "plan_selected",
  "pay_click",
  "coupon_applied",
  "outbound_click",
  "video_play",
  "tour_opened",

  /* What they were unsure about. A factory owner who opens three FAQ
     entries has three objections, and they are the ones to answer on the
     call. */
  "faq_open",
  "price_toggle",

  /* Signals of intent strong enough to act on the same day. */
  "tel_click",
  "whatsapp_click",
  "email_click",
  "copy_text",
  "print_page",

  /* Signals of hesitation. Where the money is lost. */
  "exit_intent",
  "form_field_blur",
  "form_abandon",
  "dead_click",
  "rage_click",
  "form_error",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

/** The set the route checks against. */
export const EVENT_NAME_SET: ReadonlySet<string> = new Set(EVENT_NAMES);

export function isKnownEvent(name: unknown): name is EventName {
  return typeof name === "string" && EVENT_NAME_SET.has(name);
}

/* ─────────────────────────── the funnel ladder ──────────────────────────── */

/**
 * The assessment, step by step, in the order a buyer walks it. `funnel_step`
 * events and funnel_leads.stage both use these keys.
 *
 * `paid` is not a step of the assessment — it is what happens after the bill
 * — but it belongs on the ladder because the whole point of the ladder is to
 * see how far down it the money gets.
 */
export const FUNNEL_STAGES = [
  { key: "info", label: "Told us who they are" },
  { key: "scope", label: "Described the factory" },
  { key: "security", label: "Answered on security" },
  { key: "plan", label: "Chose a plan" },
  { key: "sales", label: "Answered on sales logins" },
  { key: "billing", label: "Reached the bill" },
  { key: "paid", label: "Paid" },
] as const;

export type StageKey = (typeof FUNNEL_STAGES)[number]["key"];

export const STAGE_KEYS: readonly StageKey[] = FUNNEL_STAGES.map((s) => s.key);

/** 1-based position on the ladder; 0 for anything we do not recognise. */
export const STAGE_RANK: Record<string, number> = Object.fromEntries(
  FUNNEL_STAGES.map((s, i) => [s.key, i + 1])
);

export function stageLabel(key: string | null | undefined): string {
  if (!key) return "Never started";
  return FUNNEL_STAGES.find((s) => s.key === key)?.label ?? key;
}

/** The furthest of two stages, either of which may be unknown. */
export function furtherStage(
  a: string | null | undefined,
  b: string | null | undefined
): string | null {
  const ra = STAGE_RANK[a ?? ""] ?? 0;
  const rb = STAGE_RANK[b ?? ""] ?? 0;
  if (ra === 0 && rb === 0) return null;
  return ra >= rb ? a ?? null : b ?? null;
}

/* ─────────────────────── the pages that carry meaning ───────────────────── */

/**
 * Paths whose names the owner should see written out, rather than as a URL.
 * Kept here because both the buyer report and the folder report label pages.
 */
export const PAGE_NAMES: Record<string, string> = {
  "/": "Home",
  "/plans": "Plans & pricing",
  "/pricing": "Pricing",
  "/experience": "Experience a tour",
  "/case-studies": "Case studies",
  "/how-it-works": "How it works",
  "/why-vpv": "Why VPV",
  "/faq": "FAQ",
  "/about": "About",
  "/contact": "Contact",
  "/apply": "Apply",
  "/booking": "Booking",
  "/get-started": "Get started",
  "/order-confirmation": "Order confirmation",
  "/assessment": "Assessment: start",
  "/assessment/scope": "Assessment: factory scope",
  "/assessment/security": "Assessment: security",
  "/assessment/plan": "Assessment: plan",
  "/assessment/sales-team": "Assessment: sales logins",
  "/assessment/billing": "Assessment: the bill",
  "/assessment/price": "Assessment: price",
  "/security": "Security",
  "/privacy": "Privacy policy",
  "/terms": "Terms",
  "/cookies": "Cookie policy",
  "/refund-policy": "Refund policy",
  "/login": "Sign in",
};

/**
 * The pages where hesitation about MONEY shows up. Long dwell here with no
 * step afterwards is the signal that the price is the problem.
 */
export const PRICE_PAGES: ReadonlySet<string> = new Set([
  "/plans",
  "/pricing",
  "/assessment/billing",
  "/assessment/price",
]);

/** Query strings and trailing slashes are not different pages. */
export function pagePath(raw: string | null | undefined): string {
  if (!raw) return "/";
  const noQuery = raw.split("?")[0]!.split("#")[0]!;
  const trimmed = noQuery.replace(/\/+$/, "");
  return trimmed || "/";
}

export function pageLabel(path: string | null | undefined): string {
  const p = pagePath(path);
  return PAGE_NAMES[p] ?? p;
}
