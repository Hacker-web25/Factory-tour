/**
 * lib/sceneNames.ts — finishing a scene's name for the person typing it.
 *
 * Type "Lab" and get "Laboratory". The suggestions come from names people really
 * use: a built-in list of factory areas, the scenes of the tour being edited, the
 * scene names the person can already see on myvpv, and (for words and phrases
 * that many different tours use) the platform as a whole.
 *
 * Pure: no screen, no network. The editor feeds it data and asks for completions.
 *
 *   buildVocab   — turn lists of names into a searchable vocabulary
 *   suggest      — the completions for what has been typed so far
 *   aggregateNames — count names across tours; used by the server so that a name
 *                    is only offered to other people when several tours use it
 */

import { extractRoom, parseCodedName } from "@/lib/units";

export type Source = { text: string; weight: number };

type Entry = { text: string; w: number; forms: Map<string, number> };
export type Vocab = { phrases: Map<string, Entry>; words: Map<string, Entry> };

export type Suggestion = { text: string; kind: "phrase" | "word" | "short" | "fixed"; score: number };

/** Things people type short, that stand for a longer name. */
export const ABBREVIATIONS: Record<string, string> = {
  qc: "Quality Control",
  qa: "Quality Assurance",
  ipqc: "In-Process Quality Control",
  rm: "Raw Material",
  pm: "Packing Material",
  fg: "Finished Goods",
  wip: "Work in Progress",
  etp: "Effluent Treatment Plant",
  wtp: "Water Treatment Plant",
  stp: "Sewage Treatment Plant",
  ahu: "Air Handling Unit",
  "r&d": "Research & Development",
  hr: "Human Resources",
  wh: "Warehouse",
  mfg: "Manufacturing",
  prod: "Production",
  maint: "Maintenance",
  admin: "Administration",
  dept: "Department",
  lab: "Laboratory",
};

const minWord = 3;

/* ------------------------------------------------------------------- names */

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => (w.length <= 3 && /^[a-z&]+$/.test(w) && w !== "and" && w !== "the" && w !== "of" ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/**
 * The part of a scene name worth remembering: no code ("HO15 ·"), no trailing
 * number ("Granulation 2"), nothing the camera named. "" when nothing is left.
 */
export function vocabText(name: string): string {
  let t = extractRoom(name).trim();
  if (!t) return "";
  t = t.replace(/[\s\-_.]*\d+\s*$/, "").replace(/^[\s\-–—:·|]+|[\s\-–—:·|]+$/g, "").replace(/\s+/g, " ");
  if (t.length < minWord || !/[A-Za-z]{2}/.test(t)) return "";
  if (/\d{3,}/.test(t)) return "";
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (letters.length > 4 && letters === letters.toUpperCase()) t = titleCase(t);
  return t;
}

const key = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function add(map: Map<string, Entry>, text: string, w: number) {
  const k = key(text);
  const e = map.get(k) ?? { text, w: 0, forms: new Map<string, number>() };
  e.w += w;
  e.forms.set(text, (e.forms.get(text) ?? 0) + w);
  // Show the form people wrote most; on a tie, the one that is not all lower case.
  let best = e.text;
  let bestW = -1;
  for (const [form, fw] of e.forms) {
    const bonus = form !== form.toLowerCase() ? 0.01 : 0;
    if (fw + bonus > bestW) {
      best = form;
      bestW = fw + bonus;
    }
  }
  e.text = best;
  map.set(k, e);
}

/** A vocabulary from names, each counted with its weight (how much to trust it). */
export function buildVocab(sources: readonly Source[]): Vocab {
  const phrases = new Map<string, Entry>();
  const words = new Map<string, Entry>();
  for (const s of sources) {
    const t = vocabText(s.text);
    if (!t) continue;
    add(phrases, t, s.weight);
    for (const raw of t.split(" ")) {
      const w = raw.replace(/^[^A-Za-z&]+|[^A-Za-z&]+$/g, "");
      if (w.length >= minWord && /^[A-Za-z&'-]+$/.test(w)) add(words, w, s.weight * 0.6);
    }
  }
  return { phrases, words };
}

/* ----------------------------------------------------------------- suggest */

/** True when the two words differ by one letter added, dropped, changed or swapped. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // one letter changed
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // two swapped
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}

/** A leading code and number the person typed ("HO3 ", "R&D 4 - "), kept as it is. */
function splitHead(typed: string): { head: string; tail: string } {
  const m = /^(\s*[A-Za-z&]{1,6}[\s\-_.]*\d{1,3}[\s\-–—:·|]*)(.*)$/.exec(typed);
  if (m && parseCodedName(typed.trim())) return { head: m[1], tail: m[2] };
  return { head: "", tail: typed };
}

export type SuggestOptions = { limit?: number };

/**
 * Completions for `typed`, best first. Each `text` is the whole new value of the
 * field (anything like a leading "HO3 ·" is kept). Nothing is suggested before two
 * letters, and the exact text already typed is never suggested back.
 */
export function suggest(vocab: Vocab, typed: string, opts: SuggestOptions = {}): Suggestion[] {
  const limit = opts.limit ?? 5;
  const { head, tail } = splitHead(typed);
  const q = tail.replace(/^\s+/, "");
  const lead = tail.slice(0, tail.length - q.length);
  const qk = q.toLowerCase().replace(/\s+/g, " ");
  if (qk.trim().length < 2) return [];

  const out = new Map<string, Suggestion>();
  const put = (text: string, kind: Suggestion["kind"], score: number) => {
    const full = head + lead + text;
    if (key(full) === key(typed)) return;
    const k = key(full);
    const cur = out.get(k);
    if (!cur || cur.score < score) out.set(k, { text: full, kind, score });
  };

  // 1. A name that begins with what was typed.
  for (const [k, e] of vocab.phrases) if (k.startsWith(qk) && k !== qk.trimEnd()) put(e.text, "phrase", e.w);

  // 2. The last word finished, keeping what comes before it as typed.
  const sp = qk.lastIndexOf(" ");
  const before = q.slice(0, sp + 1);
  const last = qk.slice(sp + 1);
  if (last.length >= 2) {
    for (const [k, e] of vocab.words) {
      if (k.startsWith(last) && k !== last) put(before + e.text, "word", e.w * 0.7);
    }
    // 3. A short form the last word stands for ("qc" → "Quality Control").
    const long = ABBREVIATIONS[last];
    if (long) put(before + long, "short", 100);
  }

  // 4. Nothing matched: allow one slip in the last word ("laborotory").
  if (out.size === 0 && last.length >= 4) {
    for (const [k, e] of vocab.words) {
      if (k[0] === last[0] && k.length >= 4 && withinOneEdit(last, k)) put(before + e.text, "fixed", e.w * 0.5);
    }
  }

  return [...out.values()]
    .sort((a, b) => b.score - a.score || a.text.length - b.text.length || a.text.localeCompare(b.text))
    .slice(0, limit);
}

/* --------------------------------------------------------------- aggregate */

export type NameRow = { name: string; owner: string };
export type NameCount = { n: string; uses: number; owners: number };

/**
 * Counts, over many scenes, how often each name (and each word in a name) is
 * used and by how many different owners. `owner` is whatever separates one
 * customer's tours from another's.
 */
export function aggregateNames(rows: readonly NameRow[]): { phrases: NameCount[]; words: NameCount[] } {
  const ph = new Map<string, { forms: Map<string, number>; uses: number; owners: Set<string> }>();
  const wd = new Map<string, { forms: Map<string, number>; uses: number; owners: Set<string> }>();
  const bump = (m: typeof ph, text: string, owner: string) => {
    const k = key(text);
    const e = m.get(k) ?? { forms: new Map<string, number>(), uses: 0, owners: new Set<string>() };
    e.uses++;
    e.owners.add(owner);
    e.forms.set(text, (e.forms.get(text) ?? 0) + 1);
    m.set(k, e);
  };
  for (const r of rows) {
    const t = vocabText(r.name);
    if (!t) continue;
    bump(ph, t, r.owner);
    const seen = new Set<string>();
    for (const raw of t.split(" ")) {
      const w = raw.replace(/^[^A-Za-z&]+|[^A-Za-z&]+$/g, "");
      if (w.length >= minWord && /^[A-Za-z&'-]+$/.test(w) && !seen.has(w.toLowerCase())) {
        seen.add(w.toLowerCase());
        bump(wd, w, r.owner);
      }
    }
  }
  const finish = (m: typeof ph): NameCount[] =>
    [...m.values()].map((e) => {
      let best = "";
      let bw = -1;
      for (const [f, c] of e.forms) if (c > bw) ((best = f), (bw = c));
      return { n: best, uses: e.uses, owners: e.owners.size };
    });
  return { phrases: finish(ph), words: finish(wd) };
}

/** What the server may hand to anyone: names used by at least `minOwners` different owners. */
export function genericNames(agg: ReturnType<typeof aggregateNames>, minOwners: number): { phrases: NameCount[]; words: NameCount[] } {
  const keep = (l: NameCount[]) => l.filter((x) => x.owners >= minOwners).sort((a, b) => b.owners - a.owners || b.uses - a.uses);
  return { phrases: keep(agg.phrases), words: keep(agg.words) };
}

/* ------------------------------------------------------------ what to learn from */

/** What /api/scene-names sends. */
export type ServerNames = {
  mine?: { n: string; uses: number }[];
  common?: { phrases?: { n: string; owners: number }[]; words?: { n: string; owners: number }[] };
};

/** How much a name counts, by where it comes from. A built-in area is 1. */
export const WEIGHT = {
  /** A name in the tour being edited: people repeat themselves within a tour. */
  tour: 9,
  /** Per use of a name in the caller's other scenes, up to MINE_MAX_USES. */
  mine: 1.5,
  mineMaxUses: 5,
  /** A name many customers use. */
  commonBase: 1,
  commonPerOwner: 0.3,
  commonMaxOwners: 10,
  commonWord: 0.8,
} as const;

/** The names the caller and other customers have used, as things to learn from. */
export function sourcesFromServer(d: ServerNames | null | undefined): Source[] {
  if (!d) return [];
  const out: Source[] = [];
  for (const m of d.mine ?? []) {
    if (m?.n) out.push({ text: m.n, weight: WEIGHT.mine * Math.min(Math.max(m.uses, 1), WEIGHT.mineMaxUses) });
  }
  for (const p of d.common?.phrases ?? []) {
    if (p?.n) out.push({ text: p.n, weight: WEIGHT.commonBase + WEIGHT.commonPerOwner * Math.min(p.owners, WEIGHT.commonMaxOwners) });
  }
  for (const w of d.common?.words ?? []) {
    if (w?.n) out.push({ text: w.n, weight: WEIGHT.commonWord });
  }
  return out;
}

/** The names already in the tour being edited (leave out the scene being renamed). */
export function sourcesFromTour(names: readonly (string | null | undefined)[]): Source[] {
  const out: Source[] = [];
  for (const n of names) if (n) out.push({ text: n, weight: WEIGHT.tour });
  return out;
}
