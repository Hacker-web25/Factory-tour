/**
 * Reading when a photo was taken: EXIF in both byte orders, the camera's XMP
 * block, file names stamped by Insta360 / Pixel, and the last-changed date.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  captureTimeFromBytes,
  captureTimeOfFile,
  exifDate,
  modifiedDate,
  nameDate,
  parseDateText,
  xmpDate,
} from "../../lib/captureTime";

/** A small JPEG whose EXIF holds one date, built by hand. */
function jpegWithExif(opts: { little: boolean; dateOriginal?: string; dateTime?: string; digitized?: string }): Uint8Array {
  const { little } = opts;
  const u16 = (n: number) => (little ? [n & 255, n >> 8] : [n >> 8, n & 255]);
  const u32 = (n: number) =>
    little ? [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255] : [(n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
  const str = (s: string) => [...Buffer.from(s + "\0", "ascii")];

  const exifTags: Array<[number, string]> = [];
  if (opts.dateOriginal) exifTags.push([0x9003, opts.dateOriginal]);
  if (opts.digitized) exifTags.push([0x9004, opts.digitized]);
  const ifd0Tags: Array<[number, string]> = [];
  if (opts.dateTime) ifd0Tags.push([0x0132, opts.dateTime]);

  // Layout (offsets from the TIFF header): header 8, IFD0, ExifIFD, then the strings.
  const ifd0Count = ifd0Tags.length + (exifTags.length ? 1 : 0);
  const ifd0Size = 2 + ifd0Count * 12 + 4;
  const exifOff = 8 + ifd0Size;
  const exifSize = exifTags.length ? 2 + exifTags.length * 12 + 4 : 0;
  let strOff = exifOff + exifSize;

  const tiff: number[] = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8)];
  const strings: number[] = [];
  const entry = (tag: number, text: string) => {
    const e = [...u16(tag), ...u16(2), ...u32(text.length + 1), ...u32(strOff)];
    strings.push(...str(text));
    strOff += text.length + 1;
    return e;
  };

  tiff.push(...u16(ifd0Count));
  for (const [tag, text] of ifd0Tags) tiff.push(...entry(tag, text));
  if (exifTags.length) tiff.push(...u16(0x8769), ...u16(4), ...u32(1), ...u32(exifOff));
  tiff.push(...u32(0));
  if (exifTags.length) {
    tiff.push(...u16(exifTags.length));
    for (const [tag, text] of exifTags) tiff.push(...entry(tag, text));
    tiff.push(...u32(0));
  }
  tiff.push(...strings);

  const app1 = [...Buffer.from("Exif\0\0", "binary"), ...tiff];
  const len = app1.length + 2;
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...app1, 0xff, 0xda, 0, 2, 0, 0]);
}

describe("reading dates", () => {
  it("reads EXIF and XMP style dates as the camera's wall clock", () => {
    assert.equal(parseDateText("2026:11:05 10:15:30"), "2026-11-05T10:15:30.000Z");
    assert.equal(parseDateText("2026-11-05T10:15:30+05:30"), "2026-11-05T10:15:30.000Z");
    assert.equal(parseDateText("0000:00:00 00:00:00"), null);
    assert.equal(parseDateText("yesterday"), null);
  });

  it("reads the original date from EXIF, in either byte order", () => {
    for (const little of [true, false]) {
      const b = jpegWithExif({ little, dateOriginal: "2026:11:05 10:15:30" });
      assert.equal(exifDate(b), "2026-11-05T10:15:30.000Z", little ? "little" : "big");
    }
  });

  it("prefers the original date over the digitized and file dates", () => {
    const b = jpegWithExif({ little: true, dateOriginal: "2026:11:05 10:00:00", digitized: "2026:11:06 11:00:00", dateTime: "2026:11:07 12:00:00" });
    assert.equal(exifDate(b), "2026-11-05T10:00:00.000Z");
    assert.equal(exifDate(jpegWithExif({ little: true, digitized: "2026:11:06 11:00:00", dateTime: "2026:11:07 12:00:00" })), "2026-11-06T11:00:00.000Z");
    assert.equal(exifDate(jpegWithExif({ little: false, dateTime: "2026:11:07 12:00:00" })), "2026-11-07T12:00:00.000Z");
  });

  it("returns null for a picture with no EXIF, for junk, and for something that is not a JPEG", () => {
    assert.equal(exifDate(Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0, 2, 0, 0, 1, 2, 3, 4])), null);
    assert.equal(exifDate(new Uint8Array(0)), null);
    assert.equal(exifDate(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0])), null);
    // An EXIF block cut short must not read past the end.
    const whole = jpegWithExif({ little: true, dateOriginal: "2026:11:05 10:15:30" });
    assert.doesNotThrow(() => exifDate(whole.slice(0, 40)));
  });

  it("reads the XMP block when there is no EXIF", () => {
    const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:Description exif:DateTimeOriginal="2026-11-05T10:15:30.12+05:30"/></x:xmpmeta>`;
    assert.equal(xmpDate(Buffer.from(`\xff\xd8junk${xmp}`, "latin1")), "2026-11-05T10:15:30.000Z");
    assert.equal(xmpDate(Buffer.from("no metadata here")), null);
  });

  it("reads the time the camera put in the file name", () => {
    assert.equal(nameDate("IMG_20261105_101530_00_001.jpg"), "2026-11-05T10:15:30.000Z");
    assert.equal(nameDate("PXL_20261105_101530123.jpg"), "2026-11-05T10:15:30.000Z");
    assert.equal(nameDate("Photo 2026-11-05 at 10.15.30.jpg"), "2026-11-05T10:15:30.000Z");
    assert.equal(nameDate("Reception.jpg"), null);
    assert.equal(nameDate("IMG_20269905_101530.jpg"), null);
  });

  it("keeps the last-changed date as wall clock too", () => {
    const lm = new Date(2026, 10, 5, 10, 15, 30).getTime(); // local time on this machine
    assert.equal(modifiedDate(lm), "2026-11-05T10:15:30.000Z");
    assert.equal(modifiedDate(0), null);
    assert.equal(modifiedDate(NaN), null);
  });
});

describe("the best time for a picture", () => {
  it("goes EXIF, then XMP, then name, then last changed", () => {
    const exif = jpegWithExif({ little: true, dateOriginal: "2026:11:05 10:15:30" });
    assert.deepEqual(captureTimeFromBytes(exif, "IMG_20200101_000000.jpg", 1), { at: "2026-11-05T10:15:30.000Z", source: "exif" });
    assert.equal(captureTimeFromBytes(new Uint8Array(4), "IMG_20261105_101530_00_001.jpg", 1)?.source, "name");
    assert.equal(captureTimeFromBytes(new Uint8Array(4), "Reception.jpg", new Date(2026, 10, 5, 9, 0, 0).getTime())?.source, "modified");
    assert.equal(captureTimeFromBytes(new Uint8Array(4), "Reception.jpg"), null);
  });

  it("reads a File and never throws", async () => {
    const exif = jpegWithExif({ little: false, dateOriginal: "2026:11:05 10:15:30" });
    const file = new File([exif as BlobPart], "x.jpg", { lastModified: 5 });
    assert.equal((await captureTimeOfFile(file))?.at, "2026-11-05T10:15:30.000Z");
    const broken = { name: "IMG_20261105_101530_00_001.jpg", lastModified: 5, slice: () => { throw new Error("nope"); } };
    assert.equal((await captureTimeOfFile(broken))?.source, "name");
  });
});

describe("reading only the start of a response", () => {
  it("stops after the bytes asked for", async () => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled++;
        c.enqueue(new Uint8Array(40_000).fill(7));
        if (pulled > 50) c.close();
      },
    });
    const { readFirstBytes } = await import("../../lib/captureTime");
    const out = await readFirstBytes({ body, arrayBuffer: async () => new ArrayBuffer(0) }, 100_000);
    assert.equal(out.length, 100_000);
    assert.ok(pulled < 10, `pulled ${pulled} chunks`);
  });

  it("returns a short body whole", async () => {
    const { readFirstBytes } = await import("../../lib/captureTime");
    const out = await readFirstBytes(new Response(Uint8Array.from([1, 2, 3])), 100);
    assert.deepEqual([...out], [1, 2, 3]);
  });
});
