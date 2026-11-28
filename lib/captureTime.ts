/**
 * lib/captureTime.ts — when a photo was taken.
 *
 * Used to tell which photos were shot together (a unit of the factory) without
 * anyone typing anything. The time comes from, in this order:
 *
 *   1. the picture itself (EXIF DateTimeOriginal, then the camera's XMP block)
 *   2. the file name, which Insta360, Pixel and phone cameras stamp with the time
 *   3. the date the file was last changed
 *
 * Every time is the camera's wall clock written as if it were UTC. Only the
 * gaps between photos matter, so one rule for all sources keeps them comparable
 * and keeps a time-zone change from creating a fake gap.
 *
 * No browser and no server code in here: the same functions run in the upload
 * page and in the API route that reads photos already stored.
 */

/** How much of the start of a file holds the EXIF and XMP blocks. */
export const CAPTURE_READ_BYTES = 128 * 1024;

function wallClock(y: number, mo: number, d: number, h: number, mi: number, s: number): string | null {
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 60) return null;
  const t = Date.UTC(y, mo - 1, d, h, mi, Math.min(s, 59));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** "2026:11:05 10:15:30" (EXIF) or "2026-11-05T10:15:30+05:30" (XMP) → ISO wall clock. */
export function parseDateText(text: string): string | null {
  const m = /^\s*(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(text);
  if (!m) return null;
  return wallClock(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]);
}

/* -------------------------------------------------------------------- EXIF */

/** The EXIF date of a JPEG, read from its first bytes, or null. */
export function exifDate(b: Uint8Array): string | null {
  if (b.length < 12 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 4 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xda) return null; // start of the picture data: no EXIF before it
    const len = (b[i + 2] << 8) | b[i + 3];
    if (marker === 0xe1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) {
      const found = readTiff(b, i + 10, Math.min(b.length, i + 2 + len));
      if (found) return found;
    }
    i += 2 + len;
  }
  return null;
}

function readTiff(b: Uint8Array, tiff: number, end: number): string | null {
  if (tiff + 8 > end) return null;
  const little = b[tiff] === 0x49 && b[tiff + 1] === 0x49;
  if (!little && !(b[tiff] === 0x4d && b[tiff + 1] === 0x4d)) return null;
  const u16 = (o: number) => (o + 2 > b.length ? 0 : little ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
  const u32 = (o: number) =>
    o + 4 > b.length
      ? 0
      : little
        ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
        : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

  const ascii = (o: number, n: number) => {
    let s = "";
    for (let k = 0; k < n && o + k < b.length; k++) {
      const c = b[o + k];
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  };

  /** Every tag of one IFD → where its value sits. */
  const entries = (ifd: number): Map<number, { type: number; count: number; at: number }> => {
    const out = new Map<number, { type: number; count: number; at: number }>();
    const start = tiff + ifd;
    if (start + 2 > b.length) return out;
    const n = Math.min(u16(start), 200);
    for (let k = 0; k < n; k++) {
      const e = start + 2 + k * 12;
      if (e + 12 > b.length) break;
      const type = u16(e + 2);
      const count = u32(e + 4);
      // A value of 4 bytes or fewer sits in the entry; longer values sit where it points.
      const size = type === 2 || type === 1 ? count : count * 4;
      out.set(u16(e), { type, count, at: size <= 4 ? e + 8 : tiff + u32(e + 8) });
    }
    return out;
  };

  const text = (e: { type: number; count: number; at: number } | undefined) =>
    e && e.type === 2 && e.count >= 19 ? parseDateText(ascii(e.at, Math.min(e.count, 32))) : null;

  const ifd0 = entries(u32(tiff + 4));
  const exifPtr = ifd0.get(0x8769);
  const exif = exifPtr ? entries(u32(exifPtr.at)) : new Map();
  return text(exif.get(0x9003)) ?? text(exif.get(0x9004)) ?? text(ifd0.get(0x0132)) ?? null;
}

/* --------------------------------------------------------------------- XMP */

/** The date in a picture's XMP block (some stitching tools write only that). */
export function xmpDate(b: Uint8Array): string | null {
  let s = "";
  const n = Math.min(b.length, CAPTURE_READ_BYTES);
  for (let k = 0; k < n; k++) s += String.fromCharCode(b[k]);
  const at = s.indexOf("<x:xmpmeta");
  if (at < 0) return null;
  const block = s.slice(at, at + 60_000);
  for (const tag of ["exif:DateTimeOriginal", "xmp:CreateDate", "photoshop:DateCreated"]) {
    const m = new RegExp(`${tag}(?:="([^"]+)"|>([^<]+)<)`).exec(block);
    const v = m?.[1] ?? m?.[2];
    const iso = v ? parseDateText(v) : null;
    if (iso) return iso;
  }
  return null;
}

/* --------------------------------------------------------------- file name */

/** Insta360 "IMG_20261105_101530_00_001", Pixel "PXL_20261105_101530123", "2026-11-05 10.15.30". */
export function nameDate(name: string): string | null {
  const a = /(20\d{2})(\d{2})(\d{2})[_\-T ]?(\d{2})(\d{2})(\d{2})/.exec(name);
  if (a) {
    const iso = wallClock(+a[1], +a[2], +a[3], +a[4], +a[5], +a[6]);
    if (iso) return iso;
  }
  const b = /(20\d{2})-(\d{2})-(\d{2})[ T_at]{1,4}(\d{2})[.:\-](\d{2})[.:\-](\d{2})/.exec(name);
  return b ? wallClock(+b[1], +b[2], +b[3], +b[4], +b[5], +b[6]) : null;
}

/* ---------------------------------------------------------------- the lot */

export type CaptureSource = "exif" | "xmp" | "name" | "modified";
export type CaptureTime = { at: string; source: CaptureSource };

/** The wall clock of a "last changed" time, in the same form as the others. */
export function modifiedDate(lastModified: number): string | null {
  if (!Number.isFinite(lastModified) || lastModified <= 0) return null;
  const d = new Date(lastModified);
  return wallClock(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
}

/** The best time we can read from the first bytes of a picture and its name. */
export function captureTimeFromBytes(bytes: Uint8Array, name: string, lastModified?: number): CaptureTime | null {
  const exif = exifDate(bytes);
  if (exif) return { at: exif, source: "exif" };
  const xmp = xmpDate(bytes);
  if (xmp) return { at: xmp, source: "xmp" };
  const fromName = nameDate(name);
  if (fromName) return { at: fromName, source: "name" };
  const mod = lastModified != null ? modifiedDate(lastModified) : null;
  return mod ? { at: mod, source: "modified" } : null;
}

type FileLike = {
  name: string;
  lastModified: number;
  slice(start: number, end: number): { arrayBuffer(): Promise<ArrayBuffer> };
};

/** The capture time of a picture the person just picked. Never throws. */
export async function captureTimeOfFile(file: FileLike): Promise<CaptureTime | null> {
  try {
    const bytes = new Uint8Array(await file.slice(0, CAPTURE_READ_BYTES).arrayBuffer());
    return captureTimeFromBytes(bytes, file.name, file.lastModified);
  } catch {
    return captureTimeFromBytes(new Uint8Array(0), file.name, file.lastModified);
  }
}

/**
 * The first `max` bytes of a response. A server that ignores the Range header
 * sends the whole picture; this stops reading after `max` instead of pulling
 * tens of megabytes.
 */
export async function readFirstBytes(res: { body: ReadableStream<Uint8Array> | null; arrayBuffer(): Promise<ArrayBuffer> }, max: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(await res.arrayBuffer()).slice(0, max);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  try {
    while (got < max) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      got += value.length;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  const out = new Uint8Array(Math.min(got, max));
  let at = 0;
  for (const c of chunks) {
    const take = Math.min(c.length, out.length - at);
    if (take <= 0) break;
    out.set(c.subarray(0, take), at);
    at += take;
  }
  return out;
}
