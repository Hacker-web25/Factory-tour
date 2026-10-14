/**
 * Shared defences for the money routes. SERVER ONLY.
 *
 *   • readBody()        reads the request body with a HARD byte cap. The old
 *                       check trusted the Content-Length header, which a
 *                       client can simply leave out (chunked transfer) — so
 *                       the cap is now enforced while reading.
 *   • billingRateLimit() database-backed limiter that never fails OPEN on a
 *                       money route: if the database limiter is unreachable
 *                       it falls back to a per-instance in-memory window, so
 *                       a card-testing bot cannot switch the limit off by
 *                       making the limiter error.
 *   • validators        e-mail, GSTIN, free-text cleaning, disposable-mail
 *                       block, LIKE-wildcard escaping.
 *   • json()            responses that are never cached.
 */

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/* ───────────────────────────── responses ─────────────────────────── */

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

export function fail(status: number, error: string, message?: string, headers?: Record<string, string>) {
  return json({ ok: false, error, ...(message ? { message } : {}) }, status, headers);
}

/* ───────────────────────────── body reader ───────────────────────── */

export type BodyResult =
  | { ok: true; text: string }
  | { ok: false; status: 400 | 413; error: "payload_too_large" | "bad_payload" };

/** Read at most `maxBytes` of the body; refuse (without buffering the rest) if it is larger. */
export async function readBody(req: Request, maxBytes: number): Promise<BodyResult> {
  const declared = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, status: 413, error: "payload_too_large" };
  }
  if (!req.body) return { ok: true, text: "" };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          /* intentional — the stream is being abandoned */
        }
        return { ok: false, status: 413, error: "payload_too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: "bad_payload" };
  }
  return { ok: true, text: Buffer.concat(chunks).toString("utf8") };
}

/** Read + JSON.parse an object body. */
export async function readJson(
  req: Request,
  maxBytes: number
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; status: 400 | 413; error: string }> {
  const r = await readBody(req, maxBytes);
  if (!r.ok) return r;
  try {
    const parsed = JSON.parse(r.text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, status: 400, error: "bad_payload" };
    }
    return { ok: true, body: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, status: 400, error: "bad_payload" };
  }
}

/* ───────────────────────────── rate limiting ─────────────────────── */

type Window = { count: number; resetAt: number };
const memory = new Map<string, Window>();

function memoryLimit(key: string, max: number, windowSeconds: number) {
  const now = Date.now();
  if (memory.size > 5000) {
    for (const [k, w] of memory) if (w.resetAt < now) memory.delete(k);
  }
  const w = memory.get(key);
  if (!w || w.resetAt < now) {
    memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, retryAfter: 0 };
  }
  w.count += 1;
  if (w.count > max) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((w.resetAt - now) / 1000)) };
  }
  return { allowed: true, retryAfter: 0 };
}

export function __resetBillingRateLimitMemory(): void {
  memory.clear();
}

/**
 * The limiter RPC (`check_and_bump_rate`) is also callable from the browser with
 * the public key, with any key text. If we stored our own keys as readable text
 * ("billing-order:all", "billing-order:email:alice@x.com") a stranger could call
 * it directly to burn another person's allowance — or the whole shop's — and
 * block real customers. So the stored key is an HMAC under a server-only
 * secret: only this server can produce, and therefore spend, these counters.
 */
function limiterKey(key: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.RAZORPAY_KEY_SECRET || "";
  return "bk:" + crypto.createHmac("sha256", secret || "vpv-unkeyed").update(key).digest("hex").slice(0, 40);
}

export async function billingRateLimit(
  sb: SupabaseClient,
  key: string,
  max: number,
  windowSeconds: number
): Promise<{ allowed: boolean; retryAfter: number }> {
  try {
    const { data, error } = await sb.rpc("check_and_bump_rate", {
      p_key: limiterKey(key),
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    const row = Array.isArray(data) ? data[0] : null;
    if (!error && row) {
      return { allowed: Boolean(row.allowed), retryAfter: Number(row.retry_after_seconds ?? 0) };
    }
  } catch {
    /* intentional — fall through to the in-memory window below */
  }
  return memoryLimit(key, max, windowSeconds);
}

/* ───────────────────────────── validation ────────────────────────── */

/** Trim, cap and reject control characters from anything a human typed. */
export function clean(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

const EMAIL_RE =
  /^[A-Za-z0-9._+-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,24}$/;

export function validEmail(v: string): boolean {
  return v.length <= 254 && EMAIL_RE.test(v) && !v.includes("..");
}

/** Pattern + known state code + the real GSTIN check character. See lib/gstin.ts. */
export { validGstin } from "@/lib/gstin";

const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "10minutemail.com", "tempmail.com",
  "temp-mail.org", "yopmail.com", "trashmail.com", "getnada.com", "sharklasers.com",
  "throwawaymail.com", "dispostable.com", "maildrop.cc", "fakeinbox.com", "mintemail.com",
  "tempmailo.com", "emailondeck.com", "mohmal.com", "burnermail.io",
]);

/**
 * The e-mail as the LIMITER should see it. "a+1@x.com", "a+2@x.com" and (at
 * Gmail) "a.b@gmail.com" / "ab@gmail.com" all reach the same inbox, so a bot
 * that varies the tag must not get a fresh allowance each time. Only ever used
 * to build a limiter key — never stored, never used for the account itself.
 */
export function limiterEmail(email: string): string {
  const [localRaw = "", domainRaw = ""] = email.toLowerCase().trim().split("@");
  const domain = domainRaw === "googlemail.com" ? "gmail.com" : domainRaw;
  let local = localRaw.split("+")[0];
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local || localRaw}@${domain}`;
}

export function isDisposableEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return DISPOSABLE.has(domain);
}

/** Escape LIKE / ILIKE wildcards so user input is matched literally. */
export function escapeLike(v: string): string {
  return v.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Constant-time string compare for bearer secrets. */
export async function safeEqualSecret(a: string, b: string): Promise<boolean> {
  const { timingSafeEqual } = await import("node:crypto");
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
