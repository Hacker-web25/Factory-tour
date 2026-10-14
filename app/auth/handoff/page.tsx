"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { safeNext } from "@/lib/safeNext";

export const dynamic = "force-dynamic";

/**
 * Cross-subdomain session hand-off.
 *
 * Reached from goToDashboard() after a successful sign-in on the main
 * site (myvpv.com) when the destination is an org subdomain
 * (e.g. dukaan.myvpv.com). The access + refresh tokens ride in the
 * URL fragment — same pattern Supabase's own OAuth callback uses,
 * so tokens never hit the server. Once setSession() lands the
 * session in this origin's localStorage we replace() to the final
 * destination, clearing the tokens from browser history.
 */
export default function AuthHandoff() {
  useEffect(() => {
    (async () => {
      const hash = window.location.hash.replace(/^#/, "");
      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      // `next` is attacker-controllable — only a same-site path passes.
      const next = safeNext(params.get("next"), "/");

      // Strip the tokens from the address bar / history right away,
      // before any async work.
      window.history.replaceState(null, "", window.location.pathname);

      if (!access_token || !refresh_token) {
        window.location.replace("/login?reauth=1");
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });
      if (error) {
        console.error("Auth hand-off failed:", error);
        window.location.replace("/login?reauth=1");
        return;
      }

      // Use replace() so the tokens don't linger in history.
      window.location.replace(next);
    })();
  }, []);

  return (
    <div className="min-h-screen grid place-items-center bg-black text-white p-6">
      <div className="text-sm text-white/50">Signing you in…</div>
    </div>
  );
}
