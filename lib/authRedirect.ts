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
    // No session in memory to carry across subdomains. We must NOT
    // fall through to the literal /{slug}/{role} path here — that
    // would render this org's dashboard on the wrong host (app.myvpv.com
    // or the apex), exactly the leak this function exists to prevent.
    // Send them to /login instead; they'll land correctly next time.
    window.location.href = "/login";
    return;
  }

  if (alreadyOnOrgSub) {
    // Already on the right subdomain — bare path, middleware rewrites
    // it invisibly, so the URL bar never shows /{slug}/{role}.
    window.location.href = `/${role}`;
    return;
  }

  // Local dev / Vercel previews — no real subdomains exist here, so
  // the literal /{slug}/{role} path is the only way to reach an org.
  window.location.href = `/${slug}/${role}`;
}
