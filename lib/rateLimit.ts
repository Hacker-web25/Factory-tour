/**
 * Generalised client/server rate-limit wrapper.
 *
 * Backed by the `check_and_bump_rate` RPC in supabase/rate_limits_and_audit.sql.
 *
 * Usage inside an API route or server action:
 *
 *   const rl = await enforceRateLimit(`notify-new-device:ip:${ip}`, 20, 3600);
 *   if (!rl.allowed) {
 *     return NextResponse.json(
 *       { ok: false, error: "rate_limited" },
 *       { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
 *     );
 *   }
 *
 * The key is a composite string you pick — the limiter has no knowledge
 * of what the key means. Convention:
 *   "<endpoint>:<dimension>:<value>"
 * e.g.
 *   "signup:ip:1.2.3.4"
 *   "share-link:fingerprint:abc123"
 *   "apply:ip:1.2.3.4"
 */

import { supabase } from "@/lib/supabase";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
};

/**
 * The limiter RPC is callable from any browser with the public key and ANY key text, so a stranger
 * could otherwise spend somebody else's allowance ("ai-analyze:org:<id>", "report-abuse:ip:<ip>").
 * On the server we therefore store an HMAC of the key under a secret only the server holds — nobody
 * else can produce, and so nobody else can burn, those counters.  Browser callers (public forms) have
 * no secret to use and keep the readable key; they are cheap, per-visitor limits.
 */
async function scopedKey(key: string): Promise<string> {
  if (typeof window !== "undefined") return key;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.RAZORPAY_KEY_SECRET || "";
  if (!secret || typeof globalThis.crypto?.subtle === "undefined") return key;
  const enc = new TextEncoder();
  const hmacKey = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await globalThis.crypto.subtle.sign("HMAC", hmacKey, enc.encode(key));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return "sk:" + hex.slice(0, 40);
}

export async function enforceRateLimit(
  key: string,
  max: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const { data, error } = await supabase.rpc("check_and_bump_rate", {
    p_key: await scopedKey(key),
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error || !data || !data[0]) {
    // Fail OPEN — if the limiter RPC isn't deployed yet, don't block
    // all traffic. Each caller should still be behind at LEAST one
    // other control (auth, device limit, etc.) so a bypass here isn't
    // catastrophic. The missing-RPC case is temporary — install the
    // migration and this returns to normal.
    if (typeof window === "undefined") {
      // eslint-disable-next-line no-console
      console.warn("[rateLimit] fail-open:", error?.message ?? "no data");
    }
    return { allowed: true, remaining: max, retryAfter: 0 };
  }
  const row = data[0] as {
    allowed: boolean;
    remaining: number;
    retry_after_seconds: number;
  };
  return {
    allowed: row.allowed,
    remaining: row.remaining,
    retryAfter: row.retry_after_seconds,
  };
}

/** Convenience: throw a Response if the limit is hit. For use inside
 *  Next route handlers where you'd otherwise write the same 429. */
export async function requireUnderRateLimit(
  key: string,
  max: number,
  windowSeconds: number
): Promise<void> {
  const r = await enforceRateLimit(key, max, windowSeconds);
  if (!r.allowed) {
    throw new Response(
      JSON.stringify({ ok: false, error: "rate_limited", retryAfter: r.retryAfter }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(r.retryAfter),
        },
      }
    );
  }
}
