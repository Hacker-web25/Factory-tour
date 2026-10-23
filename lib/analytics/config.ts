/**
 * lib/analytics/config.ts — the third-party analytics IDs.
 *
 * Both are read from NEXT_PUBLIC_* so the browser can see them, and both
 * are blank until set in Vercel. Blank means the script is never written
 * into the page at all: no requests, no cookies, nothing to consent to.
 * So this ships safely before the accounts exist.
 *
 *   NEXT_PUBLIC_GA_ID        G-XXXXXXXXXX   (Google Analytics 4)
 *   NEXT_PUBLIC_CLARITY_ID   xxxxxxxxxx     (Microsoft Clarity)
 *
 * Next.js inlines NEXT_PUBLIC_* at build time, so these must be referenced
 * as whole literals — never process.env[name].
 */

export const GA_MEASUREMENT_ID = (process.env.NEXT_PUBLIC_GA_ID ?? "").trim();
export const CLARITY_PROJECT_ID = (process.env.NEXT_PUBLIC_CLARITY_ID ?? "").trim();

/** Google's own format check, so a half-pasted id fails loudly here rather
 *  than silently collecting nothing for a month. */
export const gaConfigured = /^G-[A-Z0-9]{6,}$/i.test(GA_MEASUREMENT_ID);
export const clarityConfigured = /^[a-z0-9]{6,15}$/i.test(CLARITY_PROJECT_ID);

/** Search-engine ownership checks. Paste the token from the provider.
 *  Google Search Console is how you see what people searched to find us. */
export const GOOGLE_SITE_VERIFICATION = (process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ?? "").trim();
export const BING_SITE_VERIFICATION = (process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION ?? "").trim();
