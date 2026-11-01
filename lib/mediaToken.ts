/**
 * lib/mediaToken.ts — the short-lived permission slip for one upload.
 *
 * The website decides who may upload (a signed-in workspace admin) and hands
 * the browser a token that is good for ONE file name, up to a size limit, for a
 * few minutes. The Cloudflare Worker checks the token with the same secret and
 * writes the file. No Cloudflare account keys are ever in the browser, and the
 * Worker never has to ask Supabase who someone is.
 *
 * Token = base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload)).
 * cloudflare/media-worker.js has its own copy of verify (a Worker cannot
 * import from this repo); tests/billing/34 checks that the two agree.
 */

export type MediaTokenPayload = {
  /** bucket */
  b: string;
  /** path inside the bucket */
  p: string;
  /** expires, unix seconds */
  e: number;
  /** most bytes the file may have */
  m: number;
  /** 1 when an existing file with this name may be replaced */
  u: 0 | 1;
  /** what the slip allows: write this file, or delete it */
  a: "put" | "del";
};

const enc = new TextEncoder();

function toB64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(s: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

export async function signMediaToken(
  secret: string,
  p: {
    bucket: string;
    path: string;
    maxBytes: number;
    upsert: boolean;
    action?: "put" | "del";
    ttlSeconds?: number;
    now?: number;
  }
): Promise<string> {
  const now = p.now ?? Math.floor(Date.now() / 1000);
  const payload: MediaTokenPayload = {
    b: p.bucket,
    p: p.path,
    e: now + (p.ttlSeconds ?? 600),
    m: Math.floor(p.maxBytes),
    u: p.upsert ? 1 : 0,
    a: p.action ?? "put",
  };
  const body = toB64Url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), enc.encode(body)));
  return `${body}.${toB64Url(sig)}`;
}

export async function verifyMediaToken(
  secret: string,
  token: string,
  now: number = Math.floor(Date.now() / 1000)
): Promise<MediaTokenPayload | null> {
  const dot = token.indexOf(".");
  if (!secret || dot <= 0 || token.length > 2048) return null;
  const body = token.slice(0, dot);
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret, "verify"),
      fromB64Url(token.slice(dot + 1)),
      enc.encode(body)
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64Url(body))) as MediaTokenPayload;
    if (
      typeof payload.b !== "string" ||
      typeof payload.p !== "string" ||
      typeof payload.e !== "number" ||
      typeof payload.m !== "number" ||
      (payload.a !== "put" && payload.a !== "del") ||
      payload.e <= now
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
