/**
 * lib/analytics/attribution.ts — where a visitor came from.
 *
 * Shared by the QR redirect (/q/[code]), the tracker (/api/track) and the
 * funnel, so all three agree on what "source" means. No Node imports: this
 * file runs in the browser, in a route handler and in edge middleware.
 *
 * FIRST-TOUCH is the rule. If someone scans the pamphlet, closes the tab,
 * and comes back a week later through a Google search, the pamphlet keeps
 * the credit. Last-touch would quietly credit Google for every sale the
 * print run produced, which is the opposite of what we need to know.
 */

/** First-party cookie holding the anonymous browser id. One year. */
export const VISITOR_COOKIE = "vpv_vid";
/** Groups events into one visit. Rolls over after 30 idle minutes. */
export const SESSION_COOKIE = "vpv_sid";
/** Set when the visitor opts out on the cookie notice. */
export const OPT_OUT_COOKIE = "vpv_no_analytics";
/** Middleware hands the resolved id to route handlers on this header,
 *  the same trick already used for the client IP (x-vpv-ip). */
export const VISITOR_HEADER = "x-vpv-vid";

export const VISITOR_MAX_AGE = 60 * 60 * 24 * 365; // 1 year
export const SESSION_MAX_AGE = 60 * 30; // 30 minutes

export type Attribution = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  term: string | null;
  content: string | null;
  /** Our own campaign_codes.code, set when they arrived through /q/<code>. */
  code: string | null;
  referrer: string | null;
  landingPath: string | null;
};

export const EMPTY_ATTRIBUTION: Attribution = {
  source: null,
  medium: null,
  campaign: null,
  term: null,
  content: null,
  code: null,
  referrer: null,
  landingPath: null,
};

/** Hosts we recognise, so a visit from a search engine is not filed as
 *  "referral" alongside a link from somebody's blog. */
const SEARCH_ENGINES = /(^|\.)(google|bing|duckduckgo|yahoo|yandex|baidu|ecosia|brave)\./i;
const SOCIAL = /(^|\.)(linkedin|facebook|instagram|twitter|x|t|youtube|whatsapp|pinterest|reddit)\.(com|co|in|be|me)$/i;
/** The AI assistants people increasingly arrive from. Worth its own medium:
 *  "did ChatGPT recommend us" is a question the owner will ask. */
const AI_ASSISTANTS = /(^|\.)(chatgpt|openai|perplexity|claude|anthropic|gemini|copilot)\.(com|ai)$/i;

function hostOf(referrer: string): string | null {
  try {
    return new URL(referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Turn a bare referrer into a source + medium when no utm_* was given. */
export function classifyReferrer(
  referrer: string | null,
  selfHost = "myvpv.com"
): { source: string | null; medium: string | null } {
  if (!referrer) return { source: "direct", medium: "none" };
  const host = hostOf(referrer);
  if (!host) return { source: "direct", medium: "none" };
  // Moving between our own pages is not a new source.
  if (host === selfHost || host.endsWith(`.${selfHost}`)) {
    return { source: null, medium: null };
  }
  const bare = host.replace(/^www\./, "");
  if (AI_ASSISTANTS.test(host)) return { source: bare, medium: "ai_assistant" };
  if (SEARCH_ENGINES.test(host)) return { source: bare.split(".")[0]!, medium: "organic" };
  if (SOCIAL.test(host)) return { source: bare.split(".")[0]!, medium: "social" };
  return { source: bare, medium: "referral" };
}

const str = (v: string | null, max = 120): string | null => {
  if (!v) return null;
  const t = v.trim().slice(0, max);
  return t.length ? t : null;
};

/**
 * Read attribution off a landing URL. utm_* wins; a bare referrer is
 * classified; everything else is "direct".
 */
export function parseAttribution(
  url: URL,
  referrer: string | null,
  selfHost = "myvpv.com"
): Attribution {
  const q = url.searchParams;
  const utmSource = str(q.get("utm_source"));
  const utmMedium = str(q.get("utm_medium"));
  const fromRef = classifyReferrer(referrer, selfHost);

  return {
    source: utmSource ?? fromRef.source,
    medium: utmMedium ?? fromRef.medium,
    campaign: str(q.get("utm_campaign")),
    term: str(q.get("utm_term")),
    content: str(q.get("utm_content")),
    code: normaliseCode(q.get("vpv") ?? q.get("utm_id")),
    referrer: str(referrer, 300),
    landingPath: str(url.pathname + (url.search || ""), 300),
  };
}

/** A campaign code as it may be typed, printed or scanned. Mirrors the
 *  CHECK constraint on campaign_codes.code. */
export function normaliseCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const c = raw.trim();
  return /^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/.test(c) ? c : null;
}

/** True when the string is a path on our own site and not a way out of it.
 *  Guards the QR destination: a code can never become an open redirect. */
export function isSafePath(p: unknown): p is string {
  return (
    typeof p === "string" &&
    p.startsWith("/") &&
    !p.startsWith("//") &&
    !p.includes("\\") &&
    p.length <= 300
  );
}
