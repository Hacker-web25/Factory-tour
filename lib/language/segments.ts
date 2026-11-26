/**
 * Turning Whisper's raw output into subtitle lines a person can read.
 *
 * Pure functions, no network: the website feeds in what the Worker returned for
 * each ~30-second piece of audio and gets back clean, ordered, readable lines.
 *
 *   • drops what Whisper invents on silence and music (loops, "♪", "[Music]")
 *   • splits a long sentence into screen-sized lines, timing each by its words
 *   • never lets two lines overlap, and never lets one be empty or backwards
 */

export type Segment = { start: number; end: number; text: string };

export type RawWord = { w: string; s: number; e: number };
export type RawSegment = {
  start: number;
  end: number;
  text: string;
  words?: RawWord[];
  /** no_speech_prob */
  nsp?: number;
  /** avg_logprob */
  lp?: number;
  /** compression_ratio */
  cr?: number;
};

export type SplitOptions = {
  /** Longest line in characters. 84 = two lines of 42, the broadcast norm. */
  maxChars: number;
  /** Longest a line stays on screen, seconds. */
  maxSeconds: number;
};

export const DEFAULT_SPLIT: SplitOptions = { maxChars: 84, maxSeconds: 7 };

const round2 = (n: number) => Math.round(n * 100) / 100;

export function tidy(text: string): string {
  return String(text ?? "")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ───────────────────────── what Whisper makes up ───────────────────── */

// Only music notes / brackets / dots left once the text is stripped.
const NO_WORDS = /^[\s♪♫♬🎵🎶\[\]()*_.…\-–—'"]*$/u;
// "[Music]", "(applause)", "[ Silence ]": a sound note, not speech.
const SOUND_NOTE = /^[\[(*]\s*(music|musica|música|musique|applause|laughter|silence|noise|inaudible|blank_audio|no speech)\s*[\])*]\.?$/i;

export function isNonSpeech(seg: RawSegment): boolean {
  const text = tidy(seg.text);
  if (!text || NO_WORDS.test(text) || SOUND_NOTE.test(text)) return true;
  // Whisper's own confidence signals. Thresholds are the model's defaults, a
  // little more forgiving so real speech with an accent is not thrown away.
  if (typeof seg.nsp === "number" && seg.nsp >= 0.85 && (seg.lp === undefined || seg.lp < -0.6)) return true;
  if (typeof seg.cr === "number" && seg.cr > 2.6 && text.length > 20) return true;
  return false;
}

/** Whisper sometimes repeats one line over and over after a quiet stretch. Keep the first. */
export function dropRepeatLoops(segs: Segment[], minRun = 3): Segment[] {
  const out: Segment[] = [];
  let i = 0;
  while (i < segs.length) {
    let j = i + 1;
    const key = segs[i].text.toLowerCase();
    while (j < segs.length && segs[j].text.toLowerCase() === key) j++;
    if (j - i >= minRun) {
      out.push({ ...segs[i], end: segs[i].end }); // the loop's first line only
    } else {
      for (let k = i; k < j; k++) out.push(segs[k]);
    }
    i = j;
  }
  return out;
}

/* ───────────────────────── splitting long lines ────────────────────── */

const SENTENCE = /[^.!?。！？…]+[.!?。！？…]+["')\]»”]*\s*|[^.!?。！？…]+$/g;
const CLAUSE = /[^,;:、，；：]+[,;:、，；：]+\s*|[^,;:、，；：]+$/g;
const CJK = /[　-ヿ㐀-鿿가-힯＀-￯]/;

/** Join two pieces of one line: Chinese, Japanese and Korean text is not separated by spaces. */
function joinParts(a: string, b: string): string {
  return CJK.test(a.slice(-1)) || CJK.test(b.charAt(0)) ? a + b : `${a} ${b}`;
}

function pieces(text: string, re: RegExp): string[] {
  const m = text.match(re);
  return (m ? m : [text]).map((p) => p.trim()).filter(Boolean);
}

/** Cut a run of words at word boundaries so no piece passes `max` characters. */
function byWords(text: string, max: number): string[] {
  if (CJK.test(text) && !/\s/.test(text)) {
    const out: string[] = [];
    for (let i = 0; i < text.length; i += max) out.push(text.slice(i, i + max));
    return out;
  }
  const out: string[] = [];
  let cur = "";
  for (const word of text.split(" ")) {
    if (word.length > max) {
      // one absurdly long "word" (a URL, say): hard-cut it
      if (cur) out.push(cur);
      cur = "";
      for (let i = 0; i < word.length; i += max) out.push(word.slice(i, i + max));
      continue;
    }
    if (cur && cur.length + 1 + word.length > max) {
      out.push(cur);
      cur = word;
    } else {
      cur = cur ? `${cur} ${word}` : word;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Break text into parts no longer than `max`, preferring sentence ends, then commas, then spaces. */
export function breakText(text: string, max: number): string[] {
  const t = tidy(text);
  if (t.length <= max) return [t];
  const out: string[] = [];
  for (const sentence of pieces(t, SENTENCE)) {
    if (sentence.length <= max) {
      out.push(sentence);
      continue;
    }
    for (const clause of pieces(sentence, CLAUSE)) {
      if (clause.length <= max) out.push(clause);
      else out.push(...byWords(clause, max));
    }
  }
  // Glue neighbours back together while they still fit, so we don't end up with many tiny lines.
  const glued: string[] = [];
  for (const p of out) {
    const last = glued[glued.length - 1];
    if (last !== undefined && joinParts(last, p).length <= max) glued[glued.length - 1] = joinParts(last, p);
    else glued.push(p);
  }
  return glued;
}

const strip = (s: string) => s.replace(/\s+/g, "");

/** Time each part of a split line. By real word timing when the words add up to the text, else by length. */
function timeParts(seg: RawSegment, parts: string[]): Segment[] {
  const start = seg.start;
  const end = Math.max(seg.end, seg.start + 0.1);
  const total = parts.reduce((n, p) => n + strip(p).length, 0) || 1;
  const words = (seg.words ?? []).filter((w) => Number.isFinite(w.s) && Number.isFinite(w.e));
  const wordsMatch = words.length > 0 && strip(words.map((w) => w.w).join("")) === strip(tidy(seg.text));

  const out: Segment[] = [];
  if (wordsMatch) {
    // cumulative character position at the end of each word
    const ends: number[] = [];
    let n = 0;
    for (const w of words) {
      n += strip(w.w).length;
      ends.push(n);
    }
    let used = 0;
    parts.forEach((p, idx) => {
      const first = used;
      used += strip(p).length;
      const fi = ends.findIndex((x) => x > first);
      const li = ends.findIndex((x) => x >= used);
      const s = idx === 0 ? start : words[Math.max(fi, 0)].s;
      const e = idx === parts.length - 1 ? end : words[li === -1 ? words.length - 1 : li].e;
      out.push({ start: s, end: Math.max(e, s + 0.1), text: p });
    });
  } else {
    let t = start;
    parts.forEach((p, idx) => {
      const share = ((strip(p).length / total) * (end - start)) || 0;
      const e = idx === parts.length - 1 ? end : t + share;
      out.push({ start: t, end: Math.max(e, t + 0.1), text: p });
      t = e;
    });
  }
  return out;
}

export function splitLong(seg: RawSegment, opts: SplitOptions = DEFAULT_SPLIT): Segment[] {
  const text = tidy(seg.text);
  const dur = seg.end - seg.start;
  // A line too long for the time it has is split by time too, so it never sits on screen for ages.
  const byTime = dur > opts.maxSeconds ? Math.ceil(text.length / Math.ceil(dur / opts.maxSeconds)) : opts.maxChars;
  const limit = Math.max(20, Math.min(opts.maxChars, byTime));
  const parts = breakText(text, limit);
  if (parts.length === 1) return [{ start: seg.start, end: Math.max(seg.end, seg.start + 0.1), text }];
  return timeParts({ ...seg, text }, parts);
}

/* ───────────────────────── putting it all together ─────────────────── */

/** One chunk's raw lines → clean lines on the chunk's own clock (offset not yet added). */
export function cleanChunk(raw: RawSegment[], opts: SplitOptions = DEFAULT_SPLIT): Segment[] {
  const kept = raw.filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start && !isNonSpeech(s));
  const lines: Segment[] = [];
  for (const s of kept) lines.push(...splitLong({ ...s, text: tidy(s.text) }, opts));
  return lines;
}

/** Join the chunks (each with its start time in the whole recording) into one ordered, non-overlapping list. */
export function assemble(chunks: { offset: number; segments: Segment[] }[]): Segment[] {
  const all: Segment[] = [];
  for (const c of chunks) {
    for (const s of c.segments) all.push({ start: s.start + c.offset, end: s.end + c.offset, text: s.text });
  }
  all.sort((a, b) => a.start - b.start || a.end - b.end);
  const looped = dropRepeatLoops(all);
  const out: Segment[] = [];
  for (const s of looped) {
    const prev = out[out.length - 1];
    if (prev && s.start < prev.end) {
      // overlap: let the earlier line end where the next begins, unless that would erase it
      if (s.start - prev.start >= 0.2) prev.end = s.start;
      else if (s.text.toLowerCase() === prev.text.toLowerCase()) continue; // the same line heard twice
      else s.start = prev.end;
    }
    if (s.end - s.start < 0.05) continue;
    out.push({ start: round2(s.start), end: round2(s.end), text: s.text });
  }
  // rounding can leave a 0 gap overlap of 0.01 — settle it
  for (let i = 1; i < out.length; i++) if (out[i].start < out[i - 1].end) out[i - 1].end = out[i].start;
  return out.filter((s) => s.end > s.start);
}

/* ───────────────────────── reading and finding ─────────────────────── */

function vttTime(s: string): number | null {
  const m = s.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/);
  if (!m) return null;
  return Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, "0")) / 1000;
}

/** Whisper also returns WebVTT. Used when the Worker's answer carries no segment list. */
export function parseVtt(vtt: string): RawSegment[] {
  const out: RawSegment[] = [];
  for (const block of String(vtt ?? "").split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/).filter((l) => l.trim() !== "");
    const at = lines.findIndex((l) => l.includes("-->"));
    if (at === -1) continue;
    const [a, b] = lines[at].split("-->");
    const start = vttTime(a);
    const end = vttTime((b || "").trim().split(/\s+/)[0]);
    const text = tidy(lines.slice(at + 1).join(" "));
    if (start !== null && end !== null && end > start && text) out.push({ start, end, text });
  }
  return out;
}

/** The line to show at time `t`, or -1 between lines. Segments must be ordered. */
export function activeIndex(segs: Segment[], t: number): number {
  let lo = 0;
  let hi = segs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = segs[mid];
    if (t < s.start) hi = mid - 1;
    else if (t >= s.end) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/** A transcript's language, only if it is a code we can translate from. */
export function cleanLanguage(code: unknown, fallback = "en"): string {
  const s = String(code ?? "").trim();
  return /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(s) ? s : fallback;
}

/**
 * The line to show at time `t`: the one being spoken, kept on screen a moment
 * after it ends (`hold` seconds) unless the next line has already started.
 * -1 when nothing should show.
 */
export function lineAt(segs: Segment[], t: number, hold = 0.3): number {
  const i = activeIndex(segs, t);
  if (i !== -1) return i;
  // in a gap: find the last line that started before t
  let lo = 0;
  let hi = segs.length - 1;
  let last = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segs[mid].start <= t) {
      last = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return last !== -1 && t < segs[last].end + hold ? last : -1;
}

/**
 * Lines after a person has edited them by hand: blank lines dropped, put in time order, each at
 * least 0.05 s long, and none running into the next. Never throws on odd numbers.
 */
export function normalizeEdited(segs: Segment[]): Segment[] {
  const MIN = 0.05;
  const round = (n: number) => Math.round(n * 100) / 100;
  const clean = segs
    .map((s) => ({ start: Number(s.start), end: Number(s.end), text: String(s.text ?? "").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim() }))
    .filter((s) => s.text.length > 0 && Number.isFinite(s.start) && Number.isFinite(s.end))
    .map((s) => ({ ...s, start: Math.max(0, s.start) }))
    .sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  for (const s of clean) {
    const prev = out[out.length - 1];
    let start = s.start;
    if (prev) {
      if (prev.end > start) prev.end = Math.max(prev.start + MIN, start);
      if (start < prev.start + MIN) start = prev.start + MIN;
    }
    out.push({ start: round(start), end: round(Math.max(s.end, start + MIN)), text: s.text });
  }
  // rounding can bring an end back past the next start by a hair
  for (let i = 0; i + 1 < out.length; i++) if (out[i].end > out[i + 1].start) out[i].end = Math.max(round(out[i].start + MIN), out[i + 1].start);
  return out;
}
