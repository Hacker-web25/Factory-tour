/**
 * lib/mediaUrl.ts — where a public picture or sound lives.
 *
 * Today every file is in Supabase Storage. With NEXT_PUBLIC_MEDIA_BASE_URL set,
 * the two public buckets (panoramas, tours) are read and written through the
 * Cloudflare media Worker instead. Left empty, nothing changes: every function
 * here returns exactly what Supabase would have.
 *
 * Pure, with no Supabase client in it, so the rules are tested without a
 * browser and so lib/supabase.ts can use it without a circular import.
 */

/** Buckets served from Cloudflare when it is switched on. The rest stay in Supabase (recordings are private). */
export const MEDIA_BUCKETS: readonly string[] = ["panoramas", "tours"];

/** The Worker's address, no trailing slash. Empty = Cloudflare is off. */
export const MEDIA_BASE: string = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? "").trim().replace(/\/+$/, "");

/** Biggest file the Worker accepts. Cloudflare's Worker request limit on the free plan is 100 MB. */
export const MEDIA_MAX_BYTES = 100 * 1024 * 1024;

export function isMediaBucket(bucket: string): boolean {
  return MEDIA_BUCKETS.includes(bucket);
}

export function mediaEnabled(bucket: string, base: string = MEDIA_BASE): boolean {
  return base !== "" && isMediaBucket(bucket);
}

/** Each part of the path is percent-encoded; the slashes between parts stay. */
export function encodeObjectPath(path: string): string {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export function mediaPublicUrl(bucket: string, path: string, base: string = MEDIA_BASE): string {
  return `${base}/${bucket}/${encodeObjectPath(path)}`;
}

/**
 * A Supabase public URL that was saved in the database before the switch
 * ("…/storage/v1/object/public/panoramas/<path>") points at the same file the
 * Worker serves. Returns the Worker's address for it, or null when the URL is
 * not one of ours or Cloudflare is off.
 */
export function rewriteSupabaseUrl(url: string, supabaseUrl: string, base: string = MEDIA_BASE): string | null {
  if (!base || !supabaseUrl) return null;
  const prefix = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/`;
  if (!url.startsWith(prefix)) return null;
  const rest = url.slice(prefix.length).split("?")[0]!;
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const bucket = rest.slice(0, slash);
  if (!isMediaBucket(bucket)) return null;
  return `${base}/${bucket}/${rest.slice(slash + 1)}`;
}

/** What a file path may look like: letters, digits, dot, dash, underscore, slash. No "..", no empty parts. */
const SAFE_PATH = /^[A-Za-z0-9][A-Za-z0-9._\-/]{0,299}$/;

export function isSafeObjectPath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    SAFE_PATH.test(path) &&
    !path.includes("..") &&
    !path.includes("//") &&
    !path.endsWith("/")
  );
}
