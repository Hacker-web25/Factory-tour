"use client";

// Next 14 App Router requires useSearchParams() consumers to live inside
// a Suspense boundary at prerender time. We wrap the real page in one.
export const dynamic = "force-dynamic";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ensureProfile, getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export default function OAuthCallbackPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen grid place-items-center bg-black text-white p-6">
          <div className="text-sm text-neutral-400">Signing you in…</div>
        </div>
      }
    >
      <OAuthCallbackPage />
    </Suspense>
  );
}

/**
 * OAuth callback landing page.
 *
 * Supabase's JS client auto-exchanges the `?code=` in the URL for a
 * session as soon as this page mounts (detectSessionInUrl is on by
 * default). We wait for that to settle, ensure a profile row exists
 * (creates one on first Google login), then honour ?next= or send
 * the user to /.
 */
function OAuthCallbackPage() {
  const router = useRouter();
  const params = useSearchParams();
  const nextRaw = params.get("next") || "/";
  const orgName = params.get("org") || "";
  const [message, setMessage] = useState("Signing you in…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Give supabase-js a moment to swap ?code= for a session.
      // Poll for up to 5 seconds — usually resolves in <100ms.
      const start = Date.now();
      let session = await getSession();
      while (!session && Date.now() - start < 5000) {
        await new Promise((r) => setTimeout(r, 100));
        session = await getSession();
      }
      if (cancelled) return;
      if (!session) {
        setMessage("Sign-in did not complete. Try again.");
        return;
      }

      const profile = await ensureProfile(
        orgName ? { orgName } : undefined
      );
      if (cancelled) return;
      if (!profile) {
        setMessage("Could not create your account. Try again.");
        return;
      }

      // Route based on role, unless caller supplied an explicit next.
      let target = nextRaw;
      if (target === "/") {
        if (profile.role === "org_admin") target = "/client";
        else if (profile.role === "presenter") target = "/presenter";
      }
      router.replace(target);
    })();
    return () => {
      cancelled = true;
    };
    // We intentionally only run once; supabase manages its own listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Also subscribe to auth state — belt-and-braces in case the polling
  // above misses a fast token exchange on some browsers.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      // No-op — the effect above will pick up the new session on its
      // next poll iteration. Unsubscribe on unmount.
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen grid place-items-center bg-black text-white p-6">
      <div className="text-sm text-neutral-400">{message}</div>
    </div>
  );
}
