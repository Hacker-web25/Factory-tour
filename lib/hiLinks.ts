/**
 * lib/hiLinks.ts — the personal link on a printed letter: myvpv.com/hi/aryan-k7m2xq
 *
 * What the reader sees is their own first name on our own domain, which is
 * what makes a stranger's QR code feel safe to open. What we track is the
 * random part on the end.
 *
 *   /hi/<name>-<code>      aryan-k7m2xq
 *
 * Three rules, all of them about not leaking a person:
 *
 *   • The NAME in the link is decoration. The server never reads it back: the
 *     greeting comes from our own database, found by the CODE. So a mistyped
 *     or hand-edited name still works, and nobody can make the welcome say
 *     something we did not choose by editing the link.
 *
 *   • The CODE is random (see lib/personCodes.ts). It is the only part that
 *     is passed on to the page, to Google Analytics and to Microsoft Clarity,
 *     because the redirect swaps the whole link for /?vpv=<code>. The name
 *     never reaches either of them.
 *
 *   • The greeting itself travels in a short-lived first-party cookie (HI_COOKIE),
 *     not in the address bar, for the same reason.
 *
 * Pure and dependency-free: it runs in the edge redirect, in the admin
 * generator and in tests.
 */

/** The cookie the redirect sets so the landing page can say "welcome Aryan". */
export const HI_COOKIE = "vpv_hi";
/** One hour is plenty: it only has to survive the redirect and the first page load. */
export const HI_COOKIE_MAX_AGE = 60 * 60;

/** Codes made for this system. Same alphabet as lib/personCodes.ts (no 0/O, 1/I/L). */
export const HI_CODE_LENGTH = 6;

/** The longest name part we put in a link. Keeps the QR code sparse and easy to scan. */
export const HI_SLUG_NAME_MAX = 14;

/**
 * "Aryan Kapoor" -> "aryan", "Dr. Rajesh Kumar" -> "rajesh", "Ørsted" -> "orsted".
 * Letters and digits only, lower case, accents folded. Empty when the name has
 * nothing Latin in it (a name written in Devanagari): the link is then just the code.
 */
export function slugifyName(name: unknown): string {
  if (typeof name !== "string") return "";
  const folded = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ø/gi, "o")
    .replace(/æ/gi, "ae")
    .replace(/ß/g, "ss")
    .toLowerCase();
  return folded.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, HI_SLUG_NAME_MAX).replace(/-+$/, "");
}

/** Words that come before a first name and are never it. */
const TITLES = new Set([
  "mr", "mrs", "ms", "miss", "mx", "dr", "prof", "shri", "smt", "sri", "er", "ca", "adv", "col", "capt", "maj", "gen", "sh",
]);

/**
 * The name the welcome writes. A greeting the owner typed wins outright; with
 * none, it is the first word of the name that is not a title:
 * "Dr. Rajesh Kumar Sharma" -> "Rajesh". Null when there is nothing to say,
 * and the welcome then just says "welcome".
 */
export function greetingName(personName: unknown, override?: unknown): string | null {
  const clip = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 24).trim();
  if (typeof override === "string" && clip(override)) return clip(override);
  if (typeof personName !== "string") return null;
  const words = personName
    .replace(/[,;|]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
  for (const w of words) {
    const bare = w.replace(/\./g, "").toLowerCase();
    if (TITLES.has(bare)) continue;
    // A lone initial ("R. K. Sharma") is not a name we can greet someone by.
    if (bare.length < 2) continue;
    return clip(w.replace(/^[^\p{L}]+|[^\p{L}'’-]+$/gu, ""));
  }
  return null;
}

/**
 * The slug that goes after /hi/. `code` is the person's own tracked code.
 * Only the FIRST name goes in the link ("aryan-k7m2xq"): short enough for a
 * sparse, easy-to-scan QR, and friendly rather than formal.
 */
export function hiSlug(name: unknown, code: string): string {
  const n = slugifyName(greetingName(name));
  return n ? `${n}-${code.toLowerCase()}` : code.toLowerCase();
}

/** The full link for a person. */
export function hiUrl(name: unknown, code: string, origin = "https://myvpv.com"): string {
  return `${origin}/hi/${hiSlug(name, code)}`;
}

/**
 * The codes a slug could be pointing at, longest first. Whatever comes before
 * the code is the (ignored) name. Codes made for this system have no hyphen
 * ("K7M2XQ"); older ones look like "GGN-K7M2XQ", so the last one part and the
 * last two parts are both candidates and the caller asks the database for both
 * in ONE query (a second round trip is the thing we are trying to avoid).
 *
 *   "aryan-k7m2xq"      -> ["aryan-k7m2xq", "k7m2xq"]   (only the second exists)
 *   "aryan-ggn-k7m2xq"  -> ["ggn-k7m2xq", "k7m2xq"]
 *   "k7m2xq"            -> ["k7m2xq"]
 */
export function codeCandidates(slug: unknown): string[] {
  if (typeof slug !== "string") return [];
  let s = slug.trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    /* use it as sent */
  }
  s = s.slice(0, 80);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(s)) return [];
  const parts = s.split("-").filter(Boolean);
  const out: string[] = [];
  // Never more than two parts: a longer tail is a name with hyphens in it.
  for (let n = Math.min(2, parts.length); n >= 1; n--) {
    const c = parts.slice(-n).join("-");
    if (/^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/.test(c)) out.push(c);
  }
  return out;
}

/** Read the greeting back. Never throws; null means "no greeting". */
export function decodeGreeting(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const v = decodeURIComponent(raw).replace(/\s+/g, " ").trim().slice(0, 24);
    return v || null;
  } catch {
    return null;
  }
}
