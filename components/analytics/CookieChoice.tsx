/**
 * components/analytics/CookieChoice.tsx — the same choice as the cookie
 * notice, but always available on the Cookie Policy page, so a visitor who
 * pressed "Accept all" can still withdraw it (and one who declined can change
 * their mind). Uses the same storage key and opt-out cookie as the notice.
 */

"use client";

import { useEffect, useState } from "react";
import { OPT_OUT_COOKIE, VISITOR_MAX_AGE } from "@/lib/analytics/attribution";
import { hasOptedOut } from "@/lib/analytics/client";

const SEEN_KEY = "vpv.cookie.notice.v1";

function setCookie(name: string, value: string, maxAge: number) {
  try {
    document.cookie = `${name}=${value}; Max-Age=${maxAge}; Path=/; SameSite=Lax${
      location.protocol === "https:" ? "; Secure" : ""
    }`;
  } catch {
    /* blocked */
  }
}

export default function CookieChoice() {
  const [declined, setDeclined] = useState<boolean | null>(null);

  useEffect(() => {
    setDeclined(hasOptedOut());
  }, []);

  function choose(decline: boolean) {
    try {
      localStorage.setItem(SEEN_KEY, decline ? "essential" : "accepted");
    } catch {
      /* fine */
    }
    if (decline) setCookie(OPT_OUT_COOKIE, "1", VISITOR_MAX_AGE);
    else setCookie(OPT_OUT_COOKIE, "", 0);
    // Reload so Google Analytics and Clarity start or stop on this page too.
    try {
      location.reload();
    } catch {
      setDeclined(decline);
    }
  }

  return (
    <div className="my-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-[14px] font-semibold text-slate-900">Your choice about measurement cookies</p>
      <p className="mt-1 text-[13.5px] text-slate-600" aria-live="polite">
        {declined === null
          ? " "
          : declined
            ? "Currently declined: only the cookies the site needs to work are in use."
            : "Currently accepted: Google Analytics, Microsoft Clarity and our own visit measurement are on."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => choose(true)}
          disabled={declined === true}
          className="rounded-full border border-slate-300 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-default disabled:opacity-50"
        >
          Decline
        </button>
        <button
          type="button"
          onClick={() => choose(false)}
          disabled={declined === false}
          className="rounded-full bg-vpv-grad px-5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-50"
        >
          Accept all
        </button>
      </div>
    </div>
  );
}
