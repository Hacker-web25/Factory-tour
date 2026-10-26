import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, key, {
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
