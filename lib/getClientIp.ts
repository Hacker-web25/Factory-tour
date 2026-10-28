/**
 * Extract the real client IP from a request.
 *
 * We run on Vercel, which sets x-vercel-forwarded-for / x-real-ip /
 * x-forwarded-for itself and overwrites anything the client sent. We are NOT
 * behind Cloudflare, so cf-connecting-ip is attacker-controlled and is
 * deliberately ignored: trusting it would let any visitor dodge every
 * per-IP limit by sending a different fake value on each request.
 *
 * Order of preference:
 *   1. x-vpv-ip              set by our own middleware (it overwrites any
 *                            value the client sent) from the headers below
 *   2. x-vercel-forwarded-for
 *   3. x-real-ip
 *   4. x-forwarded-for       first entry (closest to the real client)
 *   5. "unknown"             never trust fallthrough as a stable key
 *
 * The last-resort "unknown" bucket is important: without it, a request
 * missing all these headers would key into the empty string and give
 * every anonymous caller the SAME rate-limit bucket, instantly
 * breaking the limit for everyone.
 */

export function getClientIp(headers: Headers): string {
  const first = (v: string | null) => (v ? v.split(",")[0]!.trim() : "");

  const vpv = first(headers.get("x-vpv-ip"));
  if (vpv) return vpv;

  const vercel = first(headers.get("x-vercel-forwarded-for"));
  if (vercel) return vercel;

  const real = first(headers.get("x-real-ip"));
  if (real) return real;

  const fwd = first(headers.get("x-forwarded-for"));
  if (fwd) return fwd;

  return "unknown";
}

/** Short country code when the request comes through Vercel's Edge
 *  (geo header). Blank in local dev. */
export function getClientCountry(headers: Headers): string | null {
  const country =
    headers.get("x-vercel-ip-country") ??
    headers.get("cf-ipcountry") ??
    null;
  return country && country !== "XX" ? country : null;
}
