"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Cross-subdomain session hand-off.
 *
 * Reached from goToDashboard() after a successful sign-in on
 * login.myvpv.com when the destination is a different org subdomain
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
      const next = params.get("next") || "/";

      if (!access_token || !refresh_token) {
        window.location.replace("/login");
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });
      if (error) {
        console.error("Auth hand-off failed:", error);
        window.location.replace("/login");
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
