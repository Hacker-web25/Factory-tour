/**
 * lib/analytics/userAgent.ts — device, OS and browser from a user agent.
 *
 * WHY WE BOTHER. The printed pamphlet is read at a desk, and what happens
 * next tells us how the buyer works:
 *
 *   • phone  — he scanned the QR where he was standing. The commonest case,
 *              and the reason the landing page has to be readable one-handed.
 *   • tablet — often the shop floor.
 *   • desktop— somebody typed the code in later, or forwarded the link to a
 *              purchase officer. A desktop visit on a pamphlet code usually
 *              means the card was passed on, which is a buying signal.
 *
 * Deliberately small. A full user-agent library is a dependency, a licence
 * and a monthly update for three strings we only ever group by, and user
 * agents are frozen and lie more every year. This is good enough to group
 * by and honest about not knowing: everything returns null rather than a
 * confident guess.
 *
 * Order matters in here. Edge calls itself Chrome, Chrome calls itself
 * Safari, and every Android tablet calls itself Linux, so the specific
 * tests come before the general ones.
 *
 * Pure and dependency-free, so it is tested without a browser.
 */

export type DeviceKind = "phone" | "tablet" | "desktop" | "bot";

export type ParsedAgent = {
  device: DeviceKind | null;
  os: string | null;
  browser: string | null;
};

export const UNKNOWN_AGENT: ParsedAgent = { device: null, os: null, browser: null };

/** Crawlers, so a Googlebot pass is never counted as a factory owner. */
const BOT =
  /(bot|crawler|spider|crawling|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|preview|monitor|curl|wget|python-requests|headless|lighthouse|pagespeed|gtmetrix|semrush|ahrefs)/i;

/**
 * A tablet before a phone: an iPad's agent contains neither "Mobile" nor
 * "Android", and an Android tablet is exactly an Android that does NOT say
 * "Mobile" — which is the only reliable way Google has ever given us to
 * tell the two apart.
 */
function deviceOf(ua: string): DeviceKind {
  if (BOT.test(ua)) return "bot";
  if (/ipad/i.test(ua)) return "tablet";
  // iPadOS 13+ reports itself as a Macintosh; the touch points give it away
  // only in the browser, so a Mac that also says "Mobile" is an iPad.
  if (/macintosh/i.test(ua) && /mobile/i.test(ua)) return "tablet";
  if (/tablet|kindle|silk|playbook|nexus (7|9|10)/i.test(ua)) return "tablet";
  if (/android/i.test(ua) && !/mobile/i.test(ua)) return "tablet";
  if (/iphone|ipod|android|windows phone|iemobile|blackberry|bb10|opera mini|mobile/i.test(ua)) {
    return "phone";
  }
  return "desktop";
}

function osOf(ua: string): string | null {
  if (/windows nt/i.test(ua)) return "Windows";
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/cros/i.test(ua)) return "ChromeOS";
  // After iOS, because an iPhone's agent also says "like Mac OS X".
  if (/mac os x|macintosh/i.test(ua)) return "macOS";
  if (/linux/i.test(ua)) return "Linux";
  return null;
}

/**
 * Most specific first. Every Chromium browser claims to be Chrome and
 * Safari, so Edge, Opera, Samsung and Brave have to be tested before it,
 * and Safari last of all.
 */
function browserOf(ua: string): string | null {
  if (/edg(e|a|ios)?\//i.test(ua)) return "Edge";
  if (/opr\/|opera|opios/i.test(ua)) return "Opera";
  if (/samsungbrowser/i.test(ua)) return "Samsung Internet";
  if (/ucbrowser/i.test(ua)) return "UC Browser";
  if (/brave\//i.test(ua)) return "Brave";
  if (/miuibrowser/i.test(ua)) return "MIUI Browser";
  if (/firefox\/|fxios/i.test(ua)) return "Firefox";
  // In-app browsers matter: a WhatsApp-forwarded link opens in one, and
  // that tells us the card was passed from one person to another.
  if (/fban|fbav|instagram/i.test(ua)) return "Facebook in-app";
  if (/line\//i.test(ua)) return "LINE in-app";
  if (/crios|chrome\//i.test(ua)) return "Chrome";
  if (/safari\//i.test(ua)) return "Safari";
  return null;
}

/** Parse a user agent. Anything unreadable comes back as all-null. */
export function parseUserAgent(raw: string | null | undefined): ParsedAgent {
  if (typeof raw !== "string") return UNKNOWN_AGENT;
  const ua = raw.trim().slice(0, 400);
  if (!ua) return UNKNOWN_AGENT;
  const device = deviceOf(ua);
  // A crawler has no person behind it, so its OS and browser are noise.
  if (device === "bot") return { device: "bot", os: null, browser: null };
  return { device, os: osOf(ua), browser: browserOf(ua) };
}

/** True for traffic with nobody behind it. Kept out of every rate. */
export function isBot(raw: string | null | undefined): boolean {
  return parseUserAgent(raw).device === "bot";
}

const DEVICE_LABELS: Record<DeviceKind, string> = {
  phone: "Phone",
  tablet: "Tablet",
  desktop: "Computer",
  bot: "Crawler",
};

export function deviceLabel(d: string | null | undefined): string {
  return d && d in DEVICE_LABELS ? DEVICE_LABELS[d as DeviceKind] : "Unknown";
}
