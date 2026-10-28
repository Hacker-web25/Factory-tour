import { createClient } from "@supabase/supabase-js";
import { viewHeaders } from "@/lib/viewContext";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const REST_PREFIX = `${url}/rest/v1/`;

/** Adds the viewer's tour / share-link headers (lib/viewContext.ts) to database calls so the
 *  database can show an unlisted or link-only tour to exactly the person who holds the link. */
const fetchWithViewContext: typeof fetch = (input, init) => {
  const target =
    typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
  if (!target.startsWith(REST_PREFIX)) return fetch(input, init);
  const extra = viewHeaders();
  if (Object.keys(extra).length === 0) return fetch(input, init);
  const headers = new Headers(init?.headers);
  for (const [name, value] of Object.entries(extra)) headers.set(name, value);
  return fetch(input, { ...init, headers });
};

export const supabase = createClient(url, key, {
  global: { fetch: fetchWithViewContext },
  auth: {
    // Persist the session in localStorage so the user stays signed in
    // across reloads, tab closes, and browser restarts.
    persistSession: true,
    // Auto-refresh the access token before it expires (default 1h) so
    // long editing sessions don't 401 mid-save.
    autoRefreshToken: true,
    // Handle ?code= from OAuth (Google) redirects automatically.
    detectSessionInUrl: true,
  },
});

export const PANORAMA_BUCKET = "panoramas";

/** Public URL for a panorama-bucket path. Kept as the default for
 *  back-compat with the many callers that only ever meant panoramas. */
export function publicUrl(path: string) {
  return supabase.storage.from(PANORAMA_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Public URL for an object in ANY bucket — used for company logos
 *  (stored in "tours"), recordings, and anything else that lives
 *  outside the panorama bucket. */
export function publicUrlIn(bucket: string, path: string) {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
