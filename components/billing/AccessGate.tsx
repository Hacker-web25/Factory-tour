"use client";

/**
 * AccessGate — the two-level support-lapse ladder, on screen.
 *
 *   active → nothing at all
 *   nag    → the support year has ended. A renewal pop-up appears on EVERY
 *            click, anywhere in the app, for SUPPORT_GRACE_DAYS (7) days.
 *   locked → the 7 days passed. A full-screen lock covers the app until the
 *            workspace is renewed; only the billing page stays reachable so
 *            the customer can pay.
 *
 * The decision is made in the database (my_org_access_state), never here,
 * so changing the system clock or editing local storage achieves nothing.
 * This component is the visible half; the enforcing half is server-side:
 * locked workspaces serve no scenes to the public (public_tour_scenes) and
 * their data cannot be written (see billing_hardening.sql, section 12b).
 *
 * Mounted once in the root layout. It renders nothing for signed-out
 * visitors, the platform owner, Pro/Ultra customers in good standing, and
 * on the billing, login and public pages.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { SUPPORT_ANNUAL_INR, SUPPORT_GRACE_DAYS, inr } from "@/lib/pricing";

type Access = {
  state: "active" | "nag" | "locked";
  plan: string;
  plan_status: string | null;
  support_until: string | null;
  locks_at: string | null;
  days_to_lock: number | null;
  role: string | null;
  /** Sales Team logins, which can lapse on their own. Absent until supabase/renewal_ladder.sql is run. */
  logins_state?: "none" | "active" | "nag" | "lapsed" | null;
  logins_until?: string | null;
};

/** Pages where the gate never shows: paying, signing in, reading policies, public tours. */
const EXEMPT =
  /^\/(billing|login|signup|auth|terms|privacy|refund-policy|shipping-policy|cookies|disclaimer|security|pricing|about|contact|legal|apply|get-started|v|embed|tour|present|api)(\/|$)/;

const RECHECK_MS = 5 * 60_000;
const DISMISS_DELAY_S = 3;

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function isExempt(pathname: string | null): boolean {
  // The URL the browser shows and the path Next routes can differ on a
  // tenant subdomain (rewrites), so either one being exempt exempts the page.
  const real = typeof window !== "undefined" ? window.location.pathname : "";
  return EXEMPT.test(pathname ?? "") || EXEMPT.test(real);
}

export default function AccessGate() {
  const pathname = usePathname();
  const [access, setAccess] = useState<Access | null>(null);
  const [popup, setPopup] = useState(false);
  const [countdown, setCountdown] = useState(DISMISS_DELAY_S);
  const closedAt = useRef(0);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const alive = useRef(true);

  /* ── ask the database what state this workspace is in ─────────── */
  const refresh = useCallback(async () => {
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        if (alive.current) setAccess(null);
        return;
      }
      const { data, error } = await supabase.rpc("my_org_access_state");
      if (error) {
        // Migration not applied yet, or a blip: do not lock anyone out on a UI error.
        if (alive.current) setAccess(null);
        return;
      }
      const row = (Array.isArray(data) ? data[0] : data) as Access | null | undefined;
      if (alive.current) setAccess(row ?? null);
    } catch {
      if (alive.current) setAccess(null);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const timer = window.setInterval(() => void refresh(), RECHECK_MS);
    const onFocus = () => void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onChanged = () => void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("vpv:billing-changed", onChanged);
    const { data: sub } = supabase.auth.onAuthStateChange(() => void refresh());
    return () => {
      alive.current = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("vpv:billing-changed", onChanged);
      sub.subscription.unsubscribe();
    };
  }, [refresh]);

  // Re-check when moving between pages while the workspace is not in good standing.
  useEffect(() => {
    if (access && access.state !== "active") void refresh();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const exempt = isExempt(pathname);
  // A salesperson whose company's logins lapsed: the workspace works for the
  // owner and the customers, but THIS person is switched off.
  const loginsOff = !!access && access.role === "presenter" && access.logins_state === "lapsed";
  const state: "active" | "nag" | "locked" | "logins" =
    exempt || !access ? "active" : access.state !== "active" ? access.state : loginsOff ? "logins" : "active";

  /* ── level 1: a pop-up on every click ─────────────────────────── */
  useEffect(() => {
    if (state !== "nag") {
      setPopup(false);
      return;
    }
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!t) return;
      if (t.closest?.("[data-vpv-gate]")) return; // clicks on the pop-up itself
      if (t.closest?.(".razorpay-container, iframe")) return;
      if (Date.now() - closedAt.current < 350) return; // the click that closed it
      setCountdown(DISMISS_DELAY_S);
      setPopup(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [state]);

  useEffect(() => {
    if (!popup) return;
    if (countdown <= 0) return;
    const id = window.setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [popup, countdown]);

  const closePopup = useCallback(() => {
    closedAt.current = Date.now();
    setPopup(false);
  }, []);

  useEffect(() => {
    if (!popup) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && countdown <= 0) closePopup();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popup, countdown, closePopup]);

  /* ── level 2: the lock ────────────────────────────────────────── */
  useEffect(() => {
    if (state !== "locked" && state !== "logins") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = overlayRef.current?.querySelector<HTMLElement>("a,button");
    first?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !overlayRef.current) return;
      const items = Array.from(overlayRef.current.querySelectorAll<HTMLElement>("a,button"));
      if (items.length === 0) return;
      const i = items.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        items[items.length - 1].focus();
      } else if (!e.shiftKey && (i === -1 || i === items.length - 1)) {
        e.preventDefault();
        items[0].focus();
      } else if (i === -1) {
        e.preventDefault();
        items[0].focus();
      }
    };
    window.addEventListener("keydown", trap);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", trap);
    };
  }, [state]);

  if (!access || state === "active") return null;

  const isAdmin = access.role === "org_admin";
  const closed = access.plan_status === "suspended" || access.plan_status === "cancelled";
  const canRenew = access.plan === "basic" && !closed && isAdmin;
  const locksOn = fmtDate(access.locks_at);
  const endedOn = fmtDate(access.support_until);
  const days = access.days_to_lock;

  async function signOut() {
    try {
      await supabase.auth.signOut();
    } finally {
      window.location.href = "/login";
    }
  }

  /* LEVEL 2 — locked ------------------------------------------------ */
  if (state === "locked") {
    return (
      <div
        ref={overlayRef}
        data-vpv-gate
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="vpv-lock-title"
        className="fixed inset-0 grid place-items-center overflow-y-auto bg-[rgba(8,15,28,0.94)] p-5 backdrop-blur-md"
        style={{ zIndex: 2147483000 }}
      >
        <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-red-50">
            <Lock className="text-red-600" size={26} />
          </div>
          <h2 id="vpv-lock-title" className="mt-5 text-[24px] font-semibold tracking-tight text-slate-900">
            {closed ? "This workspace is closed" : "Your workspace is locked"}
          </h2>
          <p className="mt-3 text-[14.5px] leading-relaxed text-slate-600">
            {closed ? (
              <>This workspace was closed after a refund or at the owner&apos;s request. To reopen it, write to support@myvpv.com.</>
            ) : (
              <>
                Technical support and hosting ended on {endedOn}, and the {SUPPORT_GRACE_DAYS}-day reminder
                period has passed. <strong className="text-slate-900">Your tours and data are safe</strong> —
                renewing unlocks everything the moment the payment is confirmed.
              </>
            )}
          </p>
          <div className="mt-6 flex flex-col gap-3">
            {canRenew && (
              <a
                href="/billing?renew=1"
                className="rounded-full bg-gradient-to-r from-[#0B3D91] via-[#1468D8] to-[#19B8F2] py-3 text-[15px] font-semibold text-white"
              >
                Renew for {inr(SUPPORT_ANNUAL_INR)} a year
              </a>
            )}
            {!canRenew && !closed && (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-[13.5px] text-slate-600">
                Please ask your organisation&apos;s admin to renew. Only an admin can make this payment.
              </p>
            )}
            <a href="mailto:support@myvpv.com" className="text-[13.5px] font-medium text-[#1468D8] underline underline-offset-2">
              Write to support@myvpv.com
            </a>
            <button type="button" onClick={signOut} className="text-[13px] text-slate-500 hover:text-slate-800">
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* A SALESPERSON'S LOGIN HAS LAPSED ---------------------------------- */
  if (state === "logins") {
    return (
      <div
        ref={overlayRef}
        data-vpv-gate
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="vpv-logins-title"
        className="fixed inset-0 grid place-items-center overflow-y-auto bg-[rgba(8,15,28,0.94)] p-5 backdrop-blur-md"
        style={{ zIndex: 2147483000 }}
      >
        <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-50">
            <Lock className="text-amber-600" size={26} />
          </div>
          <h2 id="vpv-logins-title" className="mt-5 text-[24px] font-semibold tracking-tight text-slate-900">
            Your Sales Team login has expired
          </h2>
          <p className="mt-3 text-[14.5px] leading-relaxed text-slate-600">
            Your company&apos;s Sales Team logins ended on {fmtDate(access.logins_until ?? null)} and were not renewed.
            Please ask your organisation&apos;s admin to renew them — you will be able to sign in again the moment the
            payment is confirmed. Nothing you have created has been deleted.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <a href="mailto:support@myvpv.com" className="text-[13.5px] font-medium text-[#1468D8] underline underline-offset-2">
              Write to support@myvpv.com
            </a>
            <button type="button" onClick={signOut} className="text-[13px] text-slate-500 hover:text-slate-800">
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* LEVEL 1 — the pop-up on every click ------------------------------ */
  if (!popup) return null;

  return (
    <div
      data-vpv-gate
      role="dialog"
      aria-modal="true"
      aria-labelledby="vpv-nag-title"
      className="fixed inset-0 grid place-items-center bg-[rgba(8,15,28,0.55)] p-5 backdrop-blur-[2px]"
      style={{ zIndex: 2147483000 }}
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-50">
            <AlertTriangle className="text-amber-600" size={20} />
          </span>
          <div>
            <h2 id="vpv-nag-title" className="text-[19px] font-semibold tracking-tight text-slate-900">
              Your support year has ended
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-slate-600">
              Technical support and hosting ended on <strong className="text-slate-900">{endedOn}</strong>.
              {locksOn && (
                <>
                  {" "}This workspace <strong className="text-red-700">locks on {locksOn}</strong>
                  {days !== null && <> ({days} day{days === 1 ? "" : "s"} left)</>} unless it is renewed.
                </>
              )}{" "}
              Your tours and data are kept — renewing restores everything instantly.
            </p>
            {!isAdmin && (
              <p className="mt-2 text-[13px] text-slate-500">Please ask your organisation&apos;s admin to renew.</p>
            )}
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row-reverse">
          {isAdmin && (
            <a
              href="/billing?renew=1"
              autoFocus
              className="flex-1 rounded-full bg-gradient-to-r from-[#0B3D91] via-[#1468D8] to-[#19B8F2] py-3 text-center text-[14.5px] font-semibold text-white"
            >
              Renew for {inr(SUPPORT_ANNUAL_INR)}
            </a>
          )}
          <button
            type="button"
            disabled={countdown > 0}
            onClick={closePopup}
            className="flex-1 rounded-full border border-slate-200 py-3 text-[14px] font-medium text-slate-600 enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {countdown > 0 ? `Remind me later (${countdown})` : "Remind me later"}
          </button>
        </div>
      </div>
    </div>
  );
}
