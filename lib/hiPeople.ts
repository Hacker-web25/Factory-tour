/**
 * lib/hiPeople.ts — turn a pasted list into the people who get a personal letter.
 *
 * The owner pastes straight from a spreadsheet (tab-separated) or types
 * lines by hand (commas). Two shapes are understood:
 *
 *   1. With a header row, the columns can come in any order:
 *
 *        Name         Company        Phone         Email   Greeting name
 *        Aryan Kapoor Kapoor Pumps   98xxxxxx12            Aryan
 *
 *   2. Without one, a line is  name, company  (an e-mail address or a phone
 *      number anywhere after the name is kept as the contact). A greeting is
 *      only read from a "Greeting name" column, never guessed from a line.
 *
 * "Greeting name" is optional everywhere. Left empty, the welcome uses the
 * first name (see greetingName in lib/hiLinks.ts); filled, it wins. That is
 * how "Rajesh Kumar Sharma" can be greeted as "Rajesh" and "Er. K. Mehta"
 * as "Mehta" without anyone editing a link.
 *
 * Pure and dependency-free, so it is tested without a database.
 */

export const MAX_HI_PEOPLE = 2000;

export type HiPerson = {
  name: string;
  company: string | null;
  /** What the owner typed to be said in the welcome; null = use the first name. */
  greeting: string | null;
  phone: string | null;
  email: string | null;
};

const HEADER_WORDS: Record<string, keyof HiPerson> = {
  name: "name",
  "full name": "name",
  fullname: "name",
  person: "name",
  buyer: "name",
  company: "company",
  firm: "company",
  business: "company",
  organisation: "company",
  organization: "company",
  greeting: "greeting",
  "greeting name": "greeting",
  greetingname: "greeting",
  "call me": "greeting",
  phone: "phone",
  mobile: "phone",
  whatsapp: "phone",
  contact: "phone",
  "phone number": "phone",
  email: "email",
  "e-mail": "email",
  "email address": "email",
};

const EMAIL = /^[^\s@,;|]+@[^\s@,;|]+\.[^\s@,;|]+$/;
const PHONE = /^\+?[\d][\d\s().-]{6,18}\d$/;

/** Split one line into cells. A tab wins (a spreadsheet paste); else , | or ; */
function cells(line: string): string[] {
  const sep = line.includes("\t") ? /\t/ : /[,|;]/;
  return line
    .split(sep)
    .map((c) => c.trim().replace(/^"(.*)"$/, "$1").replace(/""/g, '"').trim());
}

const clip = (s: string | undefined, n: number): string | null => {
  const v = (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  return v || null;
};

/** Keep digits and a leading +, so "+91 98765-43210" and "098765 43210" both dial. */
function cleanPhone(s: string): string | null {
  const t = s.trim();
  if (!PHONE.test(t)) return null;
  const digits = t.replace(/[^\d]/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return (t.startsWith("+") ? "+" : "") + digits;
}

const cleanEmail = (s: string): string | null => {
  const t = s.trim().toLowerCase();
  return EMAIL.test(t) && t.length <= 120 ? t : null;
};

export function parseHiPeople(
  text: unknown,
  max = MAX_HI_PEOPLE
): { people: HiPerson[]; overflow: number; header: boolean } {
  if (typeof text !== "string") return { people: [], overflow: 0, header: false };
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { people: [], overflow: 0, header: false };

  // A header row names its columns. It must contain a name column, so a
  // person who happens to be called "Contact" is not mistaken for one.
  let columns: (keyof HiPerson | null)[] | null = null;
  const first = cells(lines[0]!).map((c) => HEADER_WORDS[c.toLowerCase()] ?? null);
  if (first.includes("name")) columns = first;

  const people: HiPerson[] = [];
  let overflow = 0;
  for (const line of columns ? lines.slice(1) : lines) {
    const c = cells(line);
    let name: string | null = null;
    let company: string | null = null;
    let greeting: string | null = null;
    let phone: string | null = null;
    let email: string | null = null;

    if (columns) {
      for (let i = 0; i < columns.length; i++) {
        const k = columns[i];
        const v = c[i] ?? "";
        if (k === "name") name = clip(v, 80);
        else if (k === "company") company = clip(v, 80);
        else if (k === "greeting") greeting = clip(v, 24);
        else if (k === "phone") phone = cleanPhone(v);
        else if (k === "email") email = cleanEmail(v);
      }
    } else {
      name = clip(c[0], 80);
      // Everything after the name: contacts are recognised by their shape and
      // the rest is the company ("Aryan, Acme Pumps, Pune" keeps "Acme Pumps, Pune").
      // A greeting is only ever taken from a "Greeting name" column, never
      // guessed, so a city can never end up in the welcome.
      const rest: string[] = [];
      for (const extra of c.slice(1)) {
        if (!extra) continue;
        const e = cleanEmail(extra);
        const p = e ? null : cleanPhone(extra);
        if (e) email = email ?? e;
        else if (p) phone = phone ?? p;
        else rest.push(extra);
      }
      company = clip(rest.join(", "), 80);
    }

    if (!name) continue;
    if (people.length >= max) {
      overflow += 1;
      continue;
    }
    people.push({ name, company, greeting, phone, email });
  }
  return { people, overflow, header: !!columns };
}
