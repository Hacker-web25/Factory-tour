/**
 * lib/units.ts — "Units": the parts of a factory (Nutra unit, Head Office, R&D…).
 *
 * A unit is a run of scenes that starts with a white divider card. This file is
 * the brain behind it, with no screen code, so it can be tested on its own:
 *
 *   • proposeUnits   — work out where the units are, without asking the person
 *                      to do any sums (dividers already in the tour, then the
 *                      names, then the time each photo was taken)
 *   • planUnitRenames — HO15, HO14 … HO1 for a unit, keeping room names
 *   • layoutDividerText — fit big black text on a white card
 *   • unitKey / hiddenByCollapse / groupByUnit — what the menu and the bottom
 *                      strip need to show a unit as a folder
 *
 * A scene belongs to a unit through its `folder` (the unit's title), which is the
 * same field the menu already groups by.
 */

export type UnitScene = {
  id: string;
  name: string;
  order_index: number;
  is_flat?: boolean | null;
  is_divider?: boolean | null;
  folder?: string | null;
  unit_code?: string | null;
  captured_at?: string | null;
};

export type ProposedUnit = {
  key: string;
  /** The text on the divider card. Empty when it still needs a name. */
  title: string;
  /** The short code for numbering, e.g. HO. */
  code: string;
  /** The divider scene this unit starts with, when there is one already. */
  dividerId: string | null;
  /** True when the divider is an ordinary flat scene that looks like a divider. */
  legacyDivider: boolean;
  /** The scenes of the unit, in order, not counting the divider. */
  memberIds: string[];
};

export type Proposal = {
  units: ProposedUnit[];
  /** What the grouping was based on. */
  basis: "dividers" | "names" | "time" | "none";
};

/* ------------------------------------------------------------------ basics */

export function sortScenes<T extends UnitScene>(scenes: readonly T[]): T[] {
  return [...scenes].sort((a, b) => a.order_index - b.order_index || a.id.localeCompare(b.id));
}

export function isDivider(s: Pick<UnitScene, "is_divider">): boolean {
  return s.is_divider === true;
}

/** The unit a scene belongs to (its folder), or "" when it has none. */
export function unitKey(s: Pick<UnitScene, "folder">): string {
  return (s.folder ?? "").trim();
}

/**
 * A flat scene named in capital letters with no number ("KHOPOLI", "R&D
 * FACILITY") is almost certainly a divider that was made by hand.
 */
export function looksLikeDivider(s: UnitScene): boolean {
  if (isDivider(s) || !s.is_flat) return false;
  const letters = s.name.replace(/[^A-Za-z]/g, "");
  if (letters.length < 2) return false;
  if (/\d/.test(s.name)) return false;
  return letters === letters.toUpperCase();
}

/* ------------------------------------------------------------------- names */

export type CodedName = { code: string; num: number; room: string };

const CAMERA_NAME = /^(?:IMG|PXL|DSC|DSCN|VID|PANO|MVIMG|MVI|GOPR|GX|PHOTO|SCREENSHOT)[\s_\-.]?[\d_\-.]/i;

/** A name the camera made (IMG_2034, PXL_2026…), not one a person chose. */
export function isCameraName(name: string): boolean {
  const n = name.trim();
  return CAMERA_NAME.test(n) || /\d{6,}/.test(n);
}

/** "H0 6" is a typo for "HO 6". Fix that one slip before reading a name. */
function steadyName(name: string): string {
  return name.replace(/\b([A-Za-z])0(?=[\s\-_.]*\d)/g, "$1O");
}

/**
 * Reads "HO 15", "HO15", "R&D 16", "F77", "RO-2", "HO 3 - Reception".
 * Returns null for a name that is not a code and a number.
 */
export function parseCodedName(name: string): CodedName | null {
  const n = steadyName(name.trim());
  if (!n || isCameraName(n)) return null;
  const m = /^([A-Za-z&]+)[\s\-_.]*(\d{1,3})(?!\d)[\s\-–—:·|]*(.*)$/.exec(n);
  if (!m) return null;
  const code = m[1];
  // A word like "Lab" or "Reception" is a room name, not a code.
  const looksLikeCode = code.length <= 2 || code === code.toUpperCase() || code.includes("&");
  if (!looksLikeCode || code.length > 6) return null;
  return { code, num: Number(m[2]), room: m[3].trim() };
}

/** The room part of a name, or "" when it is only a code and a number or a camera name. */
export function extractRoom(name: string): string {
  const n = name.trim();
  if (!n || isCameraName(n)) return "";
  const parsed = parseCodedName(n);
  const room = parsed ? parsed.room : n;
  // "6" alone is left over from a typo, not a room name.
  return /[A-Za-z]/.test(room) ? room : "";
}

const normCode = (c: string) => c.toUpperCase().replace(/0/g, "O");

/** The code most of the scenes already use, e.g. HO for "HO 15", "HO 14"… */
export function inferCode(names: readonly string[]): string | null {
  const counts = new Map<string, { n: number; shown: string }>();
  let coded = 0;
  for (const name of names) {
    const p = parseCodedName(name);
    if (!p) continue;
    coded++;
    const k = normCode(p.code);
    const cur = counts.get(k);
    if (cur) cur.n++;
    else counts.set(k, { n: 1, shown: p.code.toUpperCase() });
  }
  if (coded < 2) return null;
  let best: { n: number; shown: string } | null = null;
  for (const v of counts.values()) if (!best || v.n > best.n) best = v;
  if (!best || best.n < 2 || best.n / names.length < 0.4) return null;
  return best.shown.replace(/0/g, "O");
}

const FILLER = new Set(["UNIT", "FACILITY", "FACTORY", "PLANT", "DIVISION", "DEPARTMENT", "DEPT", "BLOCK", "THE", "OF", "AND", "&"]);

/** A first guess for a unit's code from its title: "HEAD OFFICE" → HO, "R&D FACILITY" → R&D. */
export function suggestCode(title: string): string {
  const t = title.trim().toUpperCase();
  if (!t) return "";
  const words = t.split(/\s+/).filter(Boolean);
  const kept = words.filter((w) => !FILLER.has(w));
  const use = kept.length ? kept : words;
  if (use.length === 1) {
    const w = use[0];
    if (/^[A-Z&]{1,4}$/.test(w)) return w;
    return w.replace(/[^A-Z&]/g, "").slice(0, 3);
  }
  return use
    .map((w) => (w.includes("&") ? w.replace(/[^A-Z&]/g, "") : w[0]))
    .join("")
    .replace(/[^A-Z&]/g, "")
    .slice(0, 5);
}

export type RenameOptions = {
  code: string;
  /** "down" gives the first scene the highest number (HO15, HO14 … HO1). */
  direction?: "down" | "up";
  /** HO 15 instead of HO15. */
  space?: boolean;
  /** Keep a room name after the number: "HO15 · Reception". */
  keepRoom?: boolean;
};

export type RenameStep = { id: string; from: string; to: string };

/**
 * New names for the scenes of one unit, in the order given. Flat pictures other
 * than the divider (a map, say) keep their names and are not counted.
 */
export function planUnitRenames(members: readonly UnitScene[], opts: RenameOptions): RenameStep[] {
  const code = opts.code.trim();
  if (!code) return [];
  const numbered = members.filter((s) => !isDivider(s) && !s.is_flat);
  const total = numbered.length;
  const steps: RenameStep[] = [];
  numbered.forEach((s, i) => {
    const n = opts.direction === "up" ? i + 1 : total - i;
    const room = opts.keepRoom === false ? "" : extractRoom(s.name);
    const to = `${code}${opts.space ? " " : ""}${n}${room ? ` · ${room}` : ""}`;
    if (to !== s.name) steps.push({ id: s.id, from: s.name, to });
  });
  return steps;
}

/* -------------------------------------------------------------------- time */

/** The time a photo was taken, in milliseconds, or null. */
export function capturedMs(s: Pick<UnitScene, "captured_at">): number | null {
  if (!s.captured_at) return null;
  const t = Date.parse(s.captured_at);
  return Number.isFinite(t) ? t : null;
}

/** How willing to split: 1 = only big breaks … 5 = split at small breaks. */
export type Sensitivity = 1 | 2 | 3 | 4 | 5;
const FLOOR_MINUTES: Record<Sensitivity, number> = { 1: 30, 2: 15, 3: 8, 4: 4, 5: 2 };
/** A pause this many times longer than the usual gap also counts as a break. */
const USUAL_GAP_TIMES: Record<Sensitivity, number> = { 1: 12, 2: 10, 3: 8, 4: 5, 5: 3 };

/**
 * Indexes (in the list given) where a new unit begins because there was a long
 * pause between two photos. Returns null when too few photos carry a time to
 * trust it.
 */
export function timeBreaks(scenes: readonly UnitScene[], sensitivity: Sensitivity = 3): Set<number> | null {
  const times = scenes.map(capturedMs);
  const have = times.filter((t) => t != null).length;
  if (scenes.length < 3 || have / scenes.length < 0.6) return null;
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const a = times[i - 1];
    const b = times[i];
    if (a != null && b != null) gaps.push(Math.abs(b - a));
  }
  if (!gaps.length) return null;
  const sorted = [...gaps].sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)];
  const threshold = Math.max(FLOOR_MINUTES[sensitivity] * 60_000, median * USUAL_GAP_TIMES[sensitivity]);
  const out = new Set<number>();
  for (let i = 1; i < times.length; i++) {
    const a = times[i - 1];
    const b = times[i];
    if (a != null && b != null && Math.abs(b - a) > threshold) out.add(i);
  }
  return out;
}

/* ---------------------------------------------------------------- proposal */

function tidyTitle(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/**
 * Where the units are. Dividers that already exist win, then a change in the
 * code the names use ("F12" then "HO 15"), then a long pause between photos.
 */
export function proposeUnits(all: readonly UnitScene[], sensitivity: Sensitivity = 3): Proposal {
  const sorted = sortScenes(all);
  if (!sorted.length) return { units: [], basis: "none" };

  const hasDividers = sorted.some((s) => isDivider(s) || looksLikeDivider(s));
  if (hasDividers) {
    const units: ProposedUnit[] = [];
    let cur: ProposedUnit | null = null;
    const finish = () => {
      if (cur && (cur.dividerId || cur.memberIds.length)) units.push(cur);
    };
    sorted.forEach((s) => {
      if (isDivider(s) || looksLikeDivider(s)) {
        finish();
        cur = {
          key: `d-${s.id}`,
          title: tidyTitle(s.name),
          code: (s.unit_code ?? "").trim(),
          dividerId: s.id,
          legacyDivider: !isDivider(s),
          memberIds: [],
        };
      } else {
        if (!cur) cur = { key: "start", title: "", code: "", dividerId: null, legacyDivider: false, memberIds: [] };
        cur.memberIds.push(s.id);
      }
    });
    finish();
    const byId = new Map(sorted.map((s) => [s.id, s]));
    for (const u of units) {
      if (!u.code) {
        const names = u.memberIds.map((id) => byId.get(id)!.name);
        u.code = inferCode(names) ?? suggestCode(u.title);
      }
    }
    return { units, basis: "dividers" };
  }

  // No dividers: look for where the names change code, and where time jumps.
  const breaks = new Set<number>();
  let basis: Proposal["basis"] = "none";
  const codes = sorted.map((s) => {
    const p = parseCodedName(s.name);
    return p ? normCode(p.code) : null;
  });
  for (let i = 1; i < sorted.length; i++) {
    if (codes[i] && codes[i - 1] && codes[i] !== codes[i - 1]) breaks.add(i);
  }
  if (breaks.size) basis = "names";
  const tb = timeBreaks(sorted, sensitivity);
  if (tb && tb.size) {
    for (const i of tb) breaks.add(i);
    basis = basis === "names" ? "names" : "time";
  }

  const units: ProposedUnit[] = [];
  let start = 0;
  const cuts = [...breaks].sort((a, b) => a - b);
  cuts.push(sorted.length);
  for (const end of cuts) {
    const chunk = sorted.slice(start, end);
    if (chunk.length) {
      units.push({
        key: `g-${chunk[0].id}`,
        title: "",
        code: inferCode(chunk.map((s) => s.name)) ?? "",
        dividerId: null,
        legacyDivider: false,
        memberIds: chunk.map((s) => s.id),
      });
    }
    start = end;
  }
  return { units, basis: units.length > 1 ? basis : "none" };
}

/* ------------------------------------------------------------- menu & strip */

export type UnitGroup<T extends UnitScene> = {
  key: string;
  /** null for scenes that belong to no unit. */
  label: string | null;
  divider: T | null;
  scenes: T[];
};

/**
 * The scenes grouped as the menu shows them: one group per folder, in the order
 * the folders first appear. A unit's divider is held apart from its scenes.
 */
export function groupByUnit<T extends UnitScene>(scenes: readonly T[]): UnitGroup<T>[] {
  const map = new Map<string, UnitGroup<T>>();
  for (const s of scenes) {
    const k = unitKey(s) || (isDivider(s) ? s.name.trim() : "");
    const key = k || "__root__";
    let g = map.get(key);
    if (!g) {
      g = { key, label: k || null, divider: null, scenes: [] };
      map.set(key, g);
    }
    if (isDivider(s) && !g.divider && g.label !== null) g.divider = s;
    else g.scenes.push(s);
  }
  return Array.from(map.values());
}

/** The scenes to show in a strip when some units are folded up. A folded unit still shows its divider. */
export function hiddenByCollapse<T extends UnitScene>(scenes: readonly T[], folded: ReadonlySet<string>): T[] {
  if (!folded.size) return [...scenes];
  return scenes.filter((s) => {
    if (isDivider(s)) return true;
    const k = unitKey(s);
    return !(k && folded.has(k));
  });
}

/** The unit title a divider stands for. */
export function dividerUnitKey(s: UnitScene): string {
  return unitKey(s) || s.name.trim();
}

/** How many scenes are areas. A divider is not one. */
export function countAreas(scenes: readonly UnitScene[]): number {
  return scenes.filter((s) => !isDivider(s)).length;
}

/* ---------------------------------------------------------- divider picture */

export type TextBox = { lines: string[]; fontSize: number };

/**
 * Wraps and sizes the divider text to fit the card. `measure` returns the width
 * of a line at a font size (the real canvas in the browser, a stand-in in tests).
 */
export function layoutDividerText(
  rawTitle: string,
  width: number,
  height: number,
  measure: (text: string, fontSize: number) => number,
): TextBox {
  const title = rawTitle.trim().replace(/\s+/g, " ").toUpperCase() || "UNIT";
  const maxW = width * 0.8;
  const maxH = height * 0.62;
  const words = title.split(" ");
  const MAX_LINES = 3;
  const minSize = height * 0.04;
  let size = height * 0.24;

  const wrap = (fs: number): string[] => {
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (!line || measure(next, fs) <= maxW) line = next;
      else {
        lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  for (;;) {
    const lines = wrap(size);
    const widest = Math.max(...lines.map((l) => measure(l, size)));
    const tall = lines.length * size * 1.12;
    if (lines.length <= MAX_LINES && widest <= maxW && tall <= maxH) return { lines, fontSize: size };
    if (size <= minSize) return { lines: lines.slice(0, MAX_LINES), fontSize: minSize };
    size = Math.max(minSize, size * 0.93);
  }
}

/** A tidy file name for a divider picture. */
export function dividerFileName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `divider-${slug || "unit"}.png`;
}
