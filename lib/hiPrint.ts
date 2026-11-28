/**
 * lib/hiPrint.ts — the files behind a printed personal letter.
 *
 * For each person we make the QR as a PNG and as an SVG, and one spreadsheet
 * lists everyone's name, code and link. Pure (no database, no Node-only
 * APIs), so it runs in the admin route and in tests.
 *
 * The QR carries ONLY the link, https://myvpv.com/hi/aryan-k7m2xq. No name,
 * no logo in the middle: a plain, sparse code is the one that scans first
 * time on a crumpled letter under a dim office light.
 *
 * Error correction is "M" (about 15% of the code can be damaged): enough for
 * a folded or smudged letter, and still a small 29x29 grid for a link this
 * short, which is what keeps it fast to read.
 */

import qrcode from "qrcode-generator";
import { zlibSync } from "fflate";
import { CODE_ALPHABET, CODE_LENGTH, type Random } from "@/lib/personCodes";
import { greetingName, hiUrl, slugifyName } from "@/lib/hiLinks";

/* ── the code itself ───────────────────────────────────────────────────── */

export type QrMatrix = { size: number; dark: (row: number, col: number) => boolean };

/** The black-and-white grid for `text`. Smallest version that fits. */
export function qrMatrix(text: string, level: "L" | "M" | "Q" | "H" = "M"): QrMatrix {
  const q = qrcode(0, level);
  q.addData(text, "Byte");
  q.make();
  const size = q.getModuleCount();
  return { size, dark: (r, c) => q.isDark(r, c) };
}

/** Quiet zone, in modules. The QR standard asks for 4; scanners need most of it. */
export const QUIET = 4;

/**
 * A crisp vector QR. One <path> of unit squares, merged along each row, so a
 * 29x29 code is a few hundred bytes and stays sharp at any print size.
 */
export function qrSvg(text: string, opts: { fg?: string; bg?: string | null; quiet?: number } = {}): string {
  const { fg = "#000000", bg = "#ffffff", quiet = QUIET } = opts;
  const m = qrMatrix(text);
  const total = m.size + quiet * 2;
  let d = "";
  for (let r = 0; r < m.size; r++) {
    let c = 0;
    while (c < m.size) {
      if (!m.dark(r, c)) {
        c++;
        continue;
      }
      let end = c;
      while (end < m.size && m.dark(r, end)) end++;
      d += `M${c + quiet} ${r + quiet}h${end - c}v1h-${end - c}z`;
      c = end;
    }
  }
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total * 10}" height="${total * 10}" ` +
    `shape-rendering="crispEdges" role="img" aria-label="${esc}">` +
    `<title>${esc}</title>` +
    (bg ? `<rect width="${total}" height="${total}" fill="${bg}"/>` : "") +
    `<path fill="${fg}" d="${d}"/></svg>\n`
  );
}

/* ── PNG, written by hand so no image library is needed ────────────────── */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * A black-and-white PNG of the QR: 1 bit per pixel, so a 1,200 px square is a
 * couple of kilobytes. `scale` is pixels per module.
 */
export function qrPng(text: string, opts: { scale?: number; quiet?: number } = {}): Uint8Array {
  const { scale = 32, quiet = QUIET } = opts;
  const m = qrMatrix(text);
  const px = (m.size + quiet * 2) * scale;
  const rowBytes = Math.ceil(px / 8);

  // Each pixel row is: filter byte 0, then the bits (1 = white, 0 = black).
  // Every module is `scale` identical rows, so each module row is built once.
  const raw = new Uint8Array((rowBytes + 1) * px);
  const line = new Uint8Array(rowBytes + 1);
  for (let mr = -quiet; mr < m.size + quiet; mr++) {
    line.fill(0xff);
    line[0] = 0;
    if (mr >= 0 && mr < m.size) {
      for (let mc = 0; mc < m.size; mc++) {
        if (!m.dark(mr, mc)) continue;
        const x0 = (mc + quiet) * scale;
        for (let x = x0; x < x0 + scale; x++) line[1 + (x >> 3)]! &= ~(0x80 >> (x & 7));
      }
    }
    // Bits past the last pixel stay 1 (white); decoders ignore them.
    const y0 = (mr + quiet) * scale;
    for (let y = y0; y < y0 + scale; y++) raw.set(line, y * (rowBytes + 1));
  }

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, px);
  dv.setUint32(4, px);
  ihdr[8] = 1; // bit depth
  ihdr[9] = 0; // colour type: grayscale
  const sig = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  const parts = [sig, chunk("IHDR", ihdr), chunk("IDAT", zlibSync(raw, { level: 9 })), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/* ── codes ─────────────────────────────────────────────────────────────── */

const defaultRandom: Random = () => {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) {
    const buf = new Uint32Array(1);
    c.getRandomValues(buf);
    return buf[0]! / 4294967296;
  }
  return Math.random();
};

/**
 * `count` new six-character codes with NO prefix ("K7M2XQ"), none in `taken`
 * and none repeated. The prefix is left off on purpose: the link is
 * /hi/<name>-<code>, and a prefix would add a hyphen the server then has to
 * guess around. Adds what it makes to `taken`.
 */
export function makeBareCodes(count: number, taken: Set<string>, rnd: Random = defaultRandom): string[] {
  const out: string[] = [];
  let guard = 0;
  while (out.length < count) {
    if (guard++ > count * 50 + 1000) throw new Error("could not find enough unused codes");
    let s = "";
    for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[Math.floor(rnd() * CODE_ALPHABET.length)];
    if (taken.has(s)) continue;
    taken.add(s);
    out.push(s);
  }
  return out;
}

/* ── names of files and the spreadsheet ────────────────────────────────── */

export type LetterRow = {
  /** Position on the printed stack, 1-based. */
  seq: number;
  name: string;
  company: string | null;
  code: string;
  /** What the owner typed to be said in the welcome; null = the first name. */
  greeting: string | null;
  phone?: string | null;
  email?: string | null;
};

/** "007-aryan-kapoor-K7M2XQ": sorts in print order, readable, unique. */
export function fileStem(r: Pick<LetterRow, "seq" | "name" | "code">): string {
  const words = (r.name || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ø/gi, "o")
    .replace(/æ/gi, "ae")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/, "");
  return `${String(r.seq).padStart(3, "0")}-${words || "letter"}-${r.code.toUpperCase()}`;
}

/**
 * The link printed and encoded for a person: the name they will be greeted
 * by (the typed greeting if there is one, else their name), as its first
 * word, then their code. The name part is decoration only: the server finds
 * the person by the code, so it can never be used to reach someone else.
 */
export function letterUrl(r: Pick<LetterRow, "name" | "code" | "greeting">, origin = "https://myvpv.com"): string {
  const usable = (v: string | null | undefined) => !!v && !!slugifyName(greetingName(v));
  return hiUrl(usable(r.greeting) ? r.greeting : r.name, r.code, origin);
}

/** The spreadsheet: one row per person, in print order. Safe to open in Excel. */
export function lettersCsv(rows: LetterRow[], origin = "https://myvpv.com"): string {
  // A cell that starts with = + - or @ would be run as a formula; an
  // apostrophe makes it plain text.
  const safe = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
  const q = (raw: string) => {
    const v = safe(raw);
    return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const lines = ["No,Name,Company,Greeting,Phone,Email,Code,Link,File"];
  for (const r of rows) {
    lines.push(
      [
        String(r.seq),
        r.name,
        r.company ?? "",
        r.greeting ?? "",
        r.phone ?? "",
        r.email ?? "",
        r.code,
        letterUrl(r, origin),
        fileStem(r),
      ]
        .map(q)
        .join(",")
    );
  }
  // A byte-order mark makes Excel read names such as "Ørsted" or Devanagari correctly.
  return "﻿" + lines.join("\r\n") + "\r\n";
}
