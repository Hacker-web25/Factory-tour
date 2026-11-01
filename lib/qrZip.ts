/**
 * lib/qrZip.ts — read a QR-letters zip into a list of people and codes.
 *
 * The QR tool hands over a zip shaped like
 *
 *   All Letters.pdf
 *   Aryan/L_1.png
 *   Meera Shah/L_1.png
 *   Meera Shah/L_2.png
 *
 * One folder per person (the folder name is the person), one image per
 * letter. The code is not in any file name: it is inside the QR image, as
 * the link the letter's QR opens, e.g. https://qr-generation-ag74.onrender.com/r/NVEMJ2XF.
 *
 * Decoding the images needs a canvas, so it happens in the browser. This file
 * is the pure part: which entries to look at, who each one is, what a decoded
 * link means, and how to line the results up. Pure so it is tested without a
 * browser or a zip.
 */

import { normaliseCode } from "@/lib/analytics/attribution";

export const MAX_ZIP_PEOPLE = 2000;

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

export type ZipEntry = {
  /** Path inside the zip, forward slashes. */
  path: string;
  /** Person the folder names. */
  name: string;
  /** Letter number from L_3.png, or null when the file name has none. */
  letter: number | null;
  /** Position in the archive, to keep the order the QR tool wrote. */
  order: number;
};

/**
 * Which entries are letter images, and who each belongs to. Skips the
 * __MACOSX litter and dotfiles a Mac adds when it zips a folder, and anything
 * that is not an image (the letters PDF is deliberately ignored).
 */
export function zipEntries(paths: string[]): ZipEntry[] {
  const out: ZipEntry[] = [];
  paths.forEach((raw, order) => {
    const path = raw.replace(/\\/g, "/");
    const parts = path.split("/").filter(Boolean);
    if (!parts.length || path.endsWith("/")) return;
    if (parts.some((p) => p === "__MACOSX" || p.startsWith("."))) return;
    const file = parts[parts.length - 1]!;
    if (!IMAGE_EXT.test(file)) return;

    const base = file.replace(IMAGE_EXT, "");
    const m = /(?:^|[^0-9])(\d{1,5})$/.exec(base);
    const letter = m ? Number(m[1]) : null;

    // The person is the folder the image sits in. An image at the top level
    // has no folder, so its file name stands in for the name.
    const folder = parts.length >= 2 ? parts[parts.length - 2]! : base;
    const name = folder.trim().replace(/\s+/g, " ").slice(0, 80);
    if (!name) return;
    out.push({ path, name, letter, order });
  });
  return out;
}

/**
 * The code behind a decoded QR. A letter's QR opens .../r/<code> on the QR
 * service; one made for us opens myvpv.com/q/<code>; a bare token is also fine.
 * Anything else (a phone number, a link with no code) is not a code.
 */
export function codeFromQrText(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const t = text.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) {
    let u: URL;
    try {
      u = new URL(t);
    } catch {
      return null;
    }
    const m = /\/(?:r|q)\/([^/?#]+)\/?$/i.exec(u.pathname);
    return m ? normaliseCode(decodeURIComponent(m[1]!)) : null;
  }
  return normaliseCode(t);
}

/** A campaign name from the zip's file name: "Product_Testing-qr-codes.zip" -> "Product Testing". */
export function campaignNameFromZip(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, "").replace(/\.zip$/i, "");
  const cleaned = base
    .replace(/[-_ ]*qr[-_ ]*codes?\s*$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || base).slice(0, 120);
}

export type DecodedLetter = ZipEntry & { code: string | null; problem?: string };

export type ZipPerson = {
  code: string;
  name: string;
  /** Position in the batch: the order the QR tool wrote them in. */
  seq: number;
};

export type ZipPlan = {
  people: ZipPerson[];
  /** Images we could not read a code from, with the reason. */
  unreadable: { path: string; reason: string }[];
  /** The same code in more than one image: only the first is kept. */
  duplicates: { code: string; path: string }[];
  /** People past MAX_ZIP_PEOPLE. */
  overflow: number;
};

/** Line decoded images up as people, in archive order, one row per code. */
export function planFromDecoded(letters: DecodedLetter[]): ZipPlan {
  const ordered = [...letters].sort(
    (a, b) => a.order - b.order || (a.letter ?? 0) - (b.letter ?? 0)
  );
  const seen = new Set<string>();
  const people: ZipPerson[] = [];
  const unreadable: ZipPlan["unreadable"] = [];
  const duplicates: ZipPlan["duplicates"] = [];
  let overflow = 0;

  for (const l of ordered) {
    if (!l.code) {
      unreadable.push({ path: l.path, reason: l.problem ?? "No QR code found in this image." });
      continue;
    }
    const key = l.code.toUpperCase();
    if (seen.has(key)) {
      duplicates.push({ code: l.code, path: l.path });
      continue;
    }
    if (people.length >= MAX_ZIP_PEOPLE) {
      overflow += 1;
      continue;
    }
    seen.add(key);
    people.push({ code: l.code, name: l.name, seq: people.length + 1 });
  }
  return { people, unreadable, duplicates, overflow };
}
