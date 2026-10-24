/**
 * lib/personCodes.ts — one tracked code per person.
 *
 * The printed run is personal: every buyer gets a QR made for them, so that
 * when it is scanned we know WHO opened the site and what they did, not just
 * that "somebody from the Gurugram pamphlet" did.
 *
 * Two rules shape the codes:
 *
 *   • They are RANDOM, never built from the person's name or company. The
 *     code travels in the link and is passed to Google Analytics and
 *     Microsoft Clarity so recordings can be filtered by it; a name must
 *     never leave our own database. The only place a code is tied to a
 *     person is campaign_codes, which only the owner can read.
 *
 *   • They avoid look-alike characters (0/O, 1/I/L), because a code is
 *     sometimes read aloud or typed from a printed card when a QR will
 *     not scan.
 *
 * Pure and dependency-free, so it is tested without a database.
 */

/** No 0, O, 1, I or L. 31 characters. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;
export const MAX_PEOPLE_PER_BATCH = 2000;

export type Person = { name: string; company: string | null };

/** A source of numbers in [0, 1). Replaceable so tests are deterministic. */
export type Random = () => number;

const defaultRandom: Random = () => {
  // crypto where it exists (Node 19+, every browser), Math.random otherwise.
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) {
    const buf = new Uint32Array(1);
    c.getRandomValues(buf);
    return buf[0]! / 4294967296;
  }
  return Math.random();
};

/** "ggn" -> "GGN". Letters and digits only, 1–10 of them; "P" if nothing usable. */
export function cleanPrefix(raw: unknown): string {
  const p = typeof raw === "string" ? raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) : "";
  return p || "P";
}

/**
 * Turn a pasted list into people. One person per line; a company may follow
 * the name, separated by a comma, a tab (a paste from a spreadsheet), a pipe
 * or a semicolon. Blank lines are ignored. Two people with the same name are
 * two people: each keeps their own code.
 */
export function parsePeople(text: unknown, max = MAX_PEOPLE_PER_BATCH): {
  people: Person[];
  /** Lines past the cap, so the owner is told rather than silently cut off. */
  overflow: number;
} {
  if (typeof text !== "string") return { people: [], overflow: 0 };
  const people: Person[] = [];
  let overflow = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cut = line.search(/[\t,|;]/);
    const name = (cut === -1 ? line : line.slice(0, cut)).trim().slice(0, 80);
    const company = cut === -1 ? "" : line.slice(cut + 1).trim().replace(/^[\t,|;\s]+/, "").slice(0, 80);
    if (!name) continue;
    if (people.length >= max) {
      overflow += 1;
      continue;
    }
    people.push({ name, company: company || null });
  }
  return { people, overflow };
}

/** "Aryan · Acme Pumps": what the owner sees in the table. */
export function personLabel(p: Person): string {
  return p.company ? `${p.name} · ${p.company}` : p.name;
}

/**
 * `count` new codes of the form PREFIX-XXXXXX, none of them in `taken` and
 * none repeated. Adds what it makes to `taken`, so successive calls against
 * the same set never collide with each other.
 */
export function makeCodes(
  count: number,
  prefix: string,
  taken: Set<string>,
  rnd: Random = defaultRandom
): string[] {
  const out: string[] = [];
  let guard = 0;
  while (out.length < count) {
    if (guard++ > count * 50 + 1000) {
      throw new Error("could not find enough unused codes");
    }
    let s = "";
    for (let i = 0; i < CODE_LENGTH; i++) {
      s += CODE_ALPHABET[Math.floor(rnd() * CODE_ALPHABET.length)];
    }
    const code = `${prefix}-${s}`;
    if (taken.has(code.toUpperCase())) continue;
    taken.add(code.toUpperCase());
    out.push(code);
  }
  return out;
}

/** The CSV the existing QR tool imports: one row per person. */
export function peopleCsv(
  rows: { name: string; company: string | null; code: string; url: string }[]
): string {
  // A name that starts with = + - or @ would be run as a formula when the
  // file is opened in a spreadsheet; a leading apostrophe makes it plain text.
  const safe = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
  const q = (raw: string) => {
    const v = safe(raw);
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const lines = ["name,company,code,link"];
  for (const r of rows) lines.push([r.name, r.company ?? "", r.code, r.url].map(q).join(","));
  return lines.join("\n") + "\n";
}
