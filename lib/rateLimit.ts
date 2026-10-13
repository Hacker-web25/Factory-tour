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

export async function enforceRateLimit(
  key: string,
  max: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const { data, error } = await supabase.rpc("check_and_bump_rate", {
    p_key: key,
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
