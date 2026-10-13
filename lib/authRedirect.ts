import { supabase } from "@/lib/supabase";

/**
 * Navigate a signed-in user to their org dashboard.
 *
 * On production myvpv.com, when the destination org subdomain
 * differs from the current host, we cross the subdomain by pointing
 * the browser at <slug>.myvpv.com/auth/handoff and carrying the
 * current session's access + refresh tokens in the URL fragment.
 * The handoff page swaps those tokens into localStorage on the new
 * origin via supabase.auth.setSession(). This mirrors Supabase's
 * own OAuth callback flow and sidesteps the 4 KB per-cookie limit
 * that made a Domain=.myvpv.com session cookie unworkable.
 *
 * Everywhere else (localhost, factory-tour-zeta.vercel.app, or when
 * we're already on the correct org subdomain) we stay same-origin
 * and just navigate the path.
 */
export async function goToDashboard(
  slug: string,
  role: "owner" | "sales",
): Promise<void> {
  if (typeof window === "undefined") return;

  const host = window.location.hostname.toLowerCase();
  const onMyVpv = host === "myvpv.com" || host.endsWith(".myvpv.com");
  const alreadyOnOrgSub = host === `${slug}.myvpv.com`;

  if (onMyVpv && !alreadyOnOrgSub) {
    const { data } = await supabase.auth.getSession();
    const s = data.session;
    if (s?.access_token && s?.refresh_token) {
      const q = new URLSearchParams({
        access_token: s.access_token,
        refresh_token: s.refresh_token,
        next: `/${role}`,
      });
      window.location.href =
        `https://${slug}.myvpv.com/auth/handoff#${q.toString()}`;
      return;
    }
    // No session in memory — fall through to same-origin path
    // navigation so the user hits /login again cleanly.
  }

  window.location.href = `/${slug}/${role}`;
}
