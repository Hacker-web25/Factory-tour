/**
 * The files behind a printed personal letter: the pasted list, the codes, the
 * QR images and the spreadsheet. The QR is checked the only way that counts:
 * decode the finished picture and get the link back.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { unzlibSync } from "fflate";
import jsQR from "jsqr";
import { parseHiPeople } from "@/lib/hiPeople";
import { CODE_ALPHABET } from "@/lib/personCodes";
import { codeCandidates, hiUrl } from "@/lib/hiLinks";
import { fileStem, lettersCsv, letterUrl, makeBareCodes, qrMatrix, qrPng, qrSvg, type LetterRow } from "@/lib/hiPrint";

/** Read our own PNG back into RGBA pixels (1-bit grayscale, no filters). */
function decodePng(png: Uint8Array): { w: number; h: number; rgba: Uint8ClampedArray } {
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "PNG signature");
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let o = 8;
  let w = 0;
  let h = 0;
  const idat: Uint8Array[] = [];
  while (o < png.length) {
    const len = dv.getUint32(o);
    const type = String.fromCharCode(...png.subarray(o + 4, o + 8));
    const data = png.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") {
      w = new DataView(data.buffer, data.byteOffset).getUint32(0);
      h = new DataView(data.buffer, data.byteOffset).getUint32(4);
      assert.equal(data[8], 1, "1 bit per pixel");
      assert.equal(data[9], 0, "grayscale");
    }
    if (type === "IDAT") idat.push(data);
    o += 12 + len;
  }
  const joined = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
  let p = 0;
  for (const d of idat) {
    joined.set(d, p);
    p += d.length;
  }
  const raw = unzlibSync(joined);
  const rowBytes = Math.ceil(w / 8);
  assert.equal(raw.length, (rowBytes + 1) * h);
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    assert.equal(raw[y * (rowBytes + 1)], 0, "filter none");
    for (let x = 0; x < w; x++) {
      const white = (raw[y * (rowBytes + 1) + 1 + (x >> 3)]! >> (7 - (x & 7))) & 1;
      const v = white ? 255 : 0;
      const i = (y * w + x) * 4;
      rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
      rgba[i + 3] = 255;
    }
  }
  return { w, h, rgba };
}

describe("the pasted list", () => {
  it("reads name and company, one person per line", () => {
    const { people, header } = parseHiPeople("Aryan Kapoor, Kapoor Pumps\nMeera Shah\n\n  R. Kulkarni | Kulkarni Dies ");
    assert.equal(header, false);
    assert.deepEqual(people.map((p) => [p.name, p.company]), [
      ["Aryan Kapoor", "Kapoor Pumps"],
      ["Meera Shah", null],
      ["R. Kulkarni", "Kulkarni Dies"],
    ]);
  });

  it("keeps everything after the name as the company, and never guesses a greeting", () => {
    const { people } = parseHiPeople("Aryan, Acme Pumps, Pune");
    assert.equal(people[0]!.company, "Acme Pumps, Pune");
    assert.equal(people[0]!.greeting, null);
  });

  it("picks a phone number and an e-mail out of the line by their shape", () => {
    const { people } = parseHiPeople("Aryan, Acme, +91 98765-43210, aryan@acme.in");
    assert.equal(people[0]!.phone, "+919876543210");
    assert.equal(people[0]!.email, "aryan@acme.in");
    assert.equal(people[0]!.company, "Acme");
  });

  it("reads a spreadsheet paste with a header row, columns in any order, and the Greeting name column", () => {
    const text = ["Greeting name\tCompany\tName\tMobile", "Rajesh\tSharma Forge\tDr. Rajesh Kumar Sharma\t098765 43210", "\tAcme\tMeera Shah\t"].join("\n");
    const { people, header } = parseHiPeople(text);
    assert.equal(header, true);
    assert.equal(people.length, 2);
    assert.deepEqual(
      people.map((p) => [p.name, p.company, p.greeting, p.phone]),
      [
        ["Dr. Rajesh Kumar Sharma", "Sharma Forge", "Rajesh", "098765"],
        ["Meera Shah", "Acme", null, null],
      ].map((r, i) => (i === 0 ? [r[0], r[1], r[2], "09876543210"] : r))
    );
  });

  it("does not mistake a person called Name or Contact for a header", () => {
    assert.equal(parseHiPeople("Contact Singh, Acme").header, false);
    assert.equal(parseHiPeople("Contact Singh, Acme").people.length, 1);
  });

  it("strips CSV quotes, drops empty names, and reports lines past the cap", () => {
    const { people, overflow } = parseHiPeople('"Aryan","Acme"\n,Nobody\nB\nC\nD', 2);
    assert.deepEqual(people.map((p) => p.name), ["Aryan", "B"]);
    assert.equal(overflow, 2);
  });

  it("clips a long greeting to what the welcome can write", () => {
    const { people } = parseHiPeople("Name,Greeting\nAryan," + "x".repeat(60));
    assert.equal(people[0]!.greeting!.length, 24);
  });
});

describe("codes with no prefix", () => {
  it("are six characters of the readable alphabet, none repeated, none already used", () => {
    const taken = new Set(["AAAAAA"]);
    let i = 0;
    const codes = makeBareCodes(500, taken);
    assert.equal(new Set(codes).size, 500);
    for (const c of codes) {
      assert.match(c, new RegExp(`^[${CODE_ALPHABET}]{6}$`));
      assert.ok(c !== "AAAAAA");
      i++;
    }
    assert.equal(taken.size, 501, "what it makes is added to the taken set");
  });

  it("skip a code that is taken, however the random numbers fall", () => {
    const taken = new Set(["AAAAAA"]);
    const seq = [0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    let k = 0;
    const [c] = makeBareCodes(1, taken, () => seq[k++ % seq.length]!);
    assert.notEqual(c, "AAAAAA");
  });

  it("make links the scan route can find again", () => {
    const [code] = makeBareCodes(1, new Set());
    const url = hiUrl("Aryan Kapoor", code!);
    assert.match(url, /^https:\/\/myvpv\.com\/hi\/aryan-[a-z0-9]{6}$/);
    const slug = url.split("/hi/")[1]!;
    assert.ok(codeCandidates(slug).some((c) => c.toUpperCase() === code));
  });
});

describe("the QR images", () => {
  const url = "https://myvpv.com/hi/aryan-k7m2xq";

  it("a typical link is a small 29x29 code, which is what scans fastest", () => {
    assert.equal(qrMatrix(url).size, 29);
    // The longest link we make (a 14-letter first name) still fits version 3 or 4.
    assert.ok(qrMatrix("https://myvpv.com/hi/venkatachalam-k7m2xq").size <= 33);
  });

  it("the PNG decodes back to exactly the link", () => {
    const { w, h, rgba } = decodePng(qrPng(url));
    assert.equal(w, h);
    assert.ok(w >= 1000, `${w}px is big enough to print sharply`);
    const got = jsQR(rgba, w, h);
    assert.equal(got?.data, url);
  });

  it("the PNG stays small", () => {
    assert.ok(qrPng(url).length < 20_000);
  });

  it("every code in a batch decodes to its own link (no mix-ups)", () => {
    const codes = makeBareCodes(12, new Set());
    codes.forEach((code, i) => {
      const u = hiUrl(["Aryan", "Meera Shah", "Dr. R. K. Sharma", "Ørsted", "Zoë Chen", "Li", "Anand", "Priya", "Sundaram", "Imran", "Kavita", "Vikram"][i]!, code);
      const { w, h, rgba } = decodePng(qrPng(u, { scale: 8 }));
      assert.equal(jsQR(rgba, w, h)?.data, u);
    });
  });

  it("the SVG is one clean path, carries the link as its title, and escapes it", () => {
    const svg = qrSvg(url);
    assert.match(svg, /^<svg [^>]*viewBox="0 0 37 37"/);
    assert.equal((svg.match(/<path /g) ?? []).length, 1);
    assert.ok(svg.includes(`<title>${url}</title>`));
    assert.ok(!qrSvg('https://x.test/?a=1&b="<"').includes('"<"'), "markup characters are escaped");
    assert.ok(svg.length < 6000);
  });

  it("the SVG draws the same squares as the PNG", () => {
    const m = qrMatrix(url);
    const svg = qrSvg(url);
    let dark = 0;
    for (const mm of svg.matchAll(/h(\d+)v1h-\d+z/g)) dark += Number(mm[1]);
    let expected = 0;
    for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.dark(r, c)) expected++;
    assert.equal(dark, expected);
  });
});

describe("file names and the spreadsheet", () => {
  const row = (over: Partial<LetterRow> = {}): LetterRow => ({
    seq: 7, name: "Aryan Kapoor", company: "Kapoor Pumps", code: "K7M2XQ", greeting: null, ...over,
  });

  it("files sort in print order and say who they are for", () => {
    assert.equal(fileStem(row()), "007-aryan-kapoor-K7M2XQ");
    assert.equal(fileStem(row({ seq: 123, name: "Ørsted Müller" })), "123-orsted-muller-K7M2XQ");
    assert.equal(fileStem(row({ name: "राजेश" })), "007-letter-K7M2XQ", "a name with no Latin letters still gets a clean file name");
  });

  it("the link is the name they will be greeted by (first word) and the code", () => {
    assert.equal(letterUrl(row()), "https://myvpv.com/hi/aryan-k7m2xq");
    assert.equal(letterUrl(row({ name: "Dr. Rajesh Kumar Sharma", greeting: "Rajesh" })), "https://myvpv.com/hi/rajesh-k7m2xq");
    assert.equal(letterUrl(row({ greeting: "Raju bhai" })), "https://myvpv.com/hi/raju-k7m2xq");
  });

  it("a name or greeting with no Latin letters falls back, and at worst the link is just the code", () => {
    assert.equal(letterUrl(row({ name: "राजेश कुमार", greeting: "Rajesh" })), "https://myvpv.com/hi/rajesh-k7m2xq");
    assert.equal(letterUrl(row({ name: "Aryan", greeting: "आर्यन" })), "https://myvpv.com/hi/aryan-k7m2xq");
    assert.equal(letterUrl(row({ name: "राजेश कुमार", greeting: null })), "https://myvpv.com/hi/k7m2xq");
  });

  it("the spreadsheet has one row per person, the link, and a byte-order mark for Excel", () => {
    const csv = lettersCsv([row(), row({ seq: 8, name: "Meera, Shah", code: "ABCDEF", company: null, greeting: "Meera", phone: "+919876543210" })]);
    assert.ok(csv.startsWith("﻿No,Name,Company,Greeting,Phone,Email,Code,Link,File\r\n"));
    const lines = csv.trim().split("\r\n");
    assert.equal(lines.length, 3);
    assert.ok(lines[1]!.includes("https://myvpv.com/hi/aryan-k7m2xq"));
    assert.ok(lines[2]!.includes('"Meera, Shah"'));
    assert.ok(lines[2]!.includes("+919876543210"));
  });

  it("never lets a name be run as a formula", () => {
    const csv = lettersCsv([row({ name: "=HYPERLINK(\"http://evil\")", company: "+cmd", greeting: "@x" })]);
    assert.ok(!/(^|,)=HYPERLINK/.test(csv.split("\r\n")[1]!));
    assert.ok(csv.includes("'=HYPERLINK"));
    assert.ok(csv.includes("'+cmd") && csv.includes("'@x"));
  });
});
