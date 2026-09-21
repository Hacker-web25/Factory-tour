import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Cookie-backed session storage scoped to .myvpv.com so the Supabase
 * session survives cross-subdomain navigation (login.myvpv.com →
 * <slug>.myvpv.com after sign-in). Falls back to per-origin cookies
 * on any other host (localhost, factory-tour-zeta.vercel.app).
 */
function makeCookieStorage() {
  return {
    getItem(k: string): string | null {
      if (typeof document === "undefined") return null;
      const target = encodeURIComponent(k);
      const parts = document.cookie ? document.cookie.split("; ") : [];
      for (const p of parts) {
        const eq = p.indexOf("=");
        if (eq < 0) continue;
        if (p.slice(0, eq) === target) {
          try {
            return decodeURIComponent(p.slice(eq + 1));
          } catch {
            return null;
          }
        }
      }
      return null;
    },
    setItem(k: string, v: string): void {
      if (typeof document === "undefined") return;
      const host = window.location.hostname.toLowerCase();
      const onMyVpv = host === "myvpv.com" || host.endsWith(".myvpv.com");
      const domainPart = onMyVpv ? "; Domain=.myvpv.com" : "";
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      // 30 days — matches Supabase default session TTL semantics.
      const maxAge = 60 * 60 * 24 * 30;
      document.cookie =
        `${encodeURIComponent(k)}=${encodeURIComponent(v)}` +
        `; Path=/${domainPart}; Max-Age=${maxAge}; SameSite=Lax${secure}`;
    },
    removeItem(k: string): void {
      if (typeof document === "undefined") return;
      const host = window.location.hostname.toLowerCase();
      const onMyVpv = host === "myvpv.com" || host.endsWith(".myvpv.com");
      const domainPart = onMyVpv ? "; Domain=.myvpv.com" : "";
      document.cookie =
        `${encodeURIComponent(k)}=` +
        `; Path=/${domainPart}; Max-Age=0; SameSite=Lax`;
    },
  };
}

export const supabase = createClient(url, key, {
  auth: {
    // Persist the session across reloads, tab closes, and browser
    // restarts. Uses cookie storage scoped to .myvpv.com in prod so
    // the session survives subdomain hops after login.
    persistSession: true,
    // Auto-refresh access tokens (default 1 h lifetime) so long
    // editing sessions don't 401 mid-save.
    autoRefreshToken: true,
    // Handle ?code= from OAuth (Google) redirects automatically.
    detectSessionInUrl: true,
    // Custom cookie-based storage — enables cross-subdomain sessions.
    storage:
      typeof window !== "undefined" ? makeCookieStorage() : undefined,
  },
});

export const PANORAMA_BUCKET = "panoramas";

export function publicUrl(path: string) {
  return supabase.storage.from(PANORAMA_BUCKET).getPublicUrl(path).data.publicUrl;
}
