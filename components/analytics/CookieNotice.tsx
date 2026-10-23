/**
 * components/analytics/CookieNotice.tsx — the cookie notice.
 *
 * India's DPDP Act 2023 expects a visitor to be told what is collected and
 * given a real way to refuse. "Decline" here is not decoration: it sets a
 * cookie that stops Google Analytics and Clarity loading on every later
 * page, and makes /api/track discard this browser's events.
 *
 * Deliberately a quiet bar, not a modal that blocks the page. The visitor
 * is a factory owner who followed a QR code off a pamphlet; a full-screen
 * consent wall is the fastest way to lose them before they see anything.
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { OPT_OUT_COOKIE, VISITOR_MAX_AGE } from "@/lib/analytics/attribution";
import { CLARITY_PROJECT_ID, GA_MEASUREMENT_ID } from "@/lib/analytics/config";

const SEEN_KEY = "vpv.cookie.notice.v1";

function setCookie(name: string, value: string, maxAge: number) {
  try {
    document.cookie = `${name}=${value}; Max-Age=${maxAge}; Path=/; SameSite=Lax${
      location.protocol === "https:" ? "; Secure" : ""
    }`;
  } catch {
    /* blocked; the notice still closes */
  }
}

export default function CookieNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Nothing is being set, so there is nothing to notify about.
    if (!GA_MEASUREMENT_ID && !CLARITY_PROJECT_ID) return;
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
    } catch {
      /* private window: show it, closing it just will not persist */
    }
    setShow(true);
  }, []);

  function close(optOut: boolean) {
    try {
      localStorage.setItem(SEEN_KEY, optOut ? "declined" : "accepted");
    } catch {
      /* fine */
    }
    if (optOut) {
      setCookie(OPT_OUT_COOKIE, "1", VISITOR_MAX_AGE);
      // Stop the scripts already running on THIS page, not just the next one.
      try {
        location.reload();
      } catch {
        /* fine */
      }
    }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-6px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13.5px] leading-relaxed text-slate-700">
          We use cookies to see how people find and use this site, so we can
          make it better. Read our{" "}
          <Link href="/cookies" className="font-semibold text-vpv-blue underline underline-offset-2">
            Cookie Policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => close(true)}
            className="rounded-full border border-slate-300 px-4 py-2 text-[13px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => close(false)}
            className="rounded-full bg-vpv-grad px-5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
