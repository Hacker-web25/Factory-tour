/**
 * Extract the real client IP from a request, regardless of whether
 * we're behind Vercel, Cloudflare, or running locally.
 *
 * Order of preference:
 *   1. x-vpv-ip   — set by our own middleware once it's parsed everything
 *   2. cf-connecting-ip  — Cloudflare's definitive header
 *   3. x-real-ip  — common NGINX / Vercel header
 *   4. x-forwarded-for — the first entry (closest to the real client)
 *   5. "unknown"  — never trust fallthrough as a stable key
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

  const cf = first(headers.get("cf-connecting-ip"));
  if (cf) return cf;

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
