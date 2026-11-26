/**
 * The key a piece of text is stored and looked up under.
 *
 * SHA-1 of the text (Unicode-normalised, so "é" typed two ways is one key),
 * written out in 40 hex characters. It is SYNCHRONOUS and pure JavaScript, so the
 * browser, the server and the tests all produce the same key with no await and no
 * dependence on the Web Crypto API (which a plain-http page or an old browser
 * may not have). SHA-1 is used only as a short fingerprint here, never for security.
 */

function rotl(n: number, s: number): number {
  return (n << s) | (n >>> (32 - s));
}

export function sha1Hex(text: string): string {
  const msg = new TextEncoder().encode(text);
  const len = msg.length;
  const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  padded.set(msg);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(len / 0x20000000));
  view.setUint32(padded.length - 4, (len << 3) >>> 0);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);

  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const tmp = (rotl(a, 5) + f + e + k + w[i]) | 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = tmp;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4);
}

const cache = new Map<string, string>();

/** The storage key for a piece of source text. Same text → same key, everywhere. */
export function hashText(text: string): string {
  const hit = cache.get(text);
  if (hit) return hit;
  const h = sha1Hex(text.normalize("NFC"));
  if (cache.size > 20000) cache.clear();
  cache.set(text, h);
  return h;
}
