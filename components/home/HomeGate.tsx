"use client";

/**
 * HomeGate — decides what "/" shows.
 *
 *   signed out  → the public landing page (rendered on the server, so
 *                 search engines and payment reviewers see it with no JS)
 *   signed in   → the owner dashboard, loaded only when needed so
 *                 visitors never download the editor code
 *
 * The session lives in the browser (localStorage), so this check has to
 * run on the client. Until it settles we keep showing the landing page.
 */

import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";

const OwnerHome = dynamic(() => import("@/components/dashboard/OwnerHome"), {
  ssr: false,
});

type Mode = "checking" | "anon" | "member";

/** True if Supabase has left a login token in this browser. Only a hint to
 *  avoid flashing the landing page at someone who is signed in; the real
 *  answer still comes from getSession(). */
function looksSignedIn(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? "";
      if (k.startsWith("sb-") && k.endsWith("-auth-token")) return true;
    }
  } catch {
    /* storage blocked: treat as signed out */
  }
  return false;
}

export default function HomeGate({ landing }: { landing: ReactNode }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("checking");
  const [hint, setHint] = useState(false);

  useLayoutEffect(() => {
    setHint(looksSignedIn());
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const session = await getSession().catch(() => null);
      if (!alive) return;
      if (session) {
        setMode("member");
        return;
      }
      // factory-tour-zeta.vercel.app (and previews) are the operator's
      // back-office, not the public site: signed-out visitors go straight
      // to sign-in there, as before.
      if (window.location.hostname.endsWith(".vercel.app")) {
        router.replace("/login");
        return;
      }
      setMode("anon");
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  if (mode === "member") return <OwnerHome />;
  if (mode === "checking" && hint) {
    // Signed in, session still loading: a blank screen beats a flash of
    // the marketing page.
    return <div className="min-h-screen bg-white" aria-busy="true" />;
  }
  return <>{landing}</>;
}
