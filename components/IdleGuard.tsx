"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { bumpActivity, enforceIdleLimit } from "@/lib/authIdle";

/**
 * Mounts once at the root layout. Two jobs:
 *   1. On mount, check if the last recorded activity is older than the
 *      idle limit (15 days). If yes, sign the user out and send them
 *      to /login. If no, refresh the stamp and continue.
 *   2. While mounted, listen for user activity (pointer, keyboard,
 *      scroll, visibility) and bump the stamp. Bump is throttled to
 *      once per 30 seconds so we don't thrash localStorage.
 *
 * No visible UI — pure side-effect component.
 */
export default function IdleGuard() {
  const router = useRouter();

  useEffect(() => {
    // 1) Enforce on mount.
    (async () => {
      const kicked = await enforceIdleLimit();
      if (kicked) {
        // Push to login (but only if we're not already on an auth page).
        if (typeof window !== "undefined") {
          const p = window.location.pathname;
          if (!p.startsWith("/login") && !p.startsWith("/signup")) {
            router.replace("/login");
          }
        }
      }
    })();

    // 2) Wire activity listeners for the rest of the session.
    const bump = () => bumpActivity();
    const opts = { passive: true } as AddEventListenerOptions;
    window.addEventListener("pointerdown", bump, opts);
    window.addEventListener("keydown", bump, opts);
    window.addEventListener("scroll", bump, opts);
    document.addEventListener("visibilitychange", bump);
    return () => {
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("keydown", bump);
      window.removeEventListener("scroll", bump);
      document.removeEventListener("visibilitychange", bump);
    };
  }, [router]);

  return null;
}
