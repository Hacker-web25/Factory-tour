"use client";

/**
 * Cloudflare Turnstile — the "are you a person?" check on sign-in, sign-up and password reset.
 *
 * The SITE key below is public by design (it is sent to every browser). The SECRET key lives only in the
 * Supabase dashboard (Authentication → Bot and Abuse Protection), where Supabase verifies each token
 * server-side before it lets a sign-in / sign-up / reset through.  Until that switch is on, the token we
 * send is simply ignored, so shipping this widget first is safe.
 *
 * Tokens are single-use: call `reset()` after every attempt (success or failure) to get a fresh one.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "0x4AAAAAAFqAAW4g29Mbp1CG";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export type TurnstileState = "loading" | "ready" | "failed";
export type TurnstileHandle = { reset: () => void };

let scriptPromise: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no_window"));
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scriptPromise = null; // allow a retry on the next mount
        reject(new Error("turnstile_load_failed"));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

type Props = {
  /** Called with a fresh token, or null when it expired / errored. */
  onToken: (token: string | null) => void;
  /** Lets the form know whether to wait for the check or carry on without it. */
  onState?: (state: TurnstileState) => void;
  className?: string;
};

const TurnstileBox = forwardRef<TurnstileHandle, Props>(function TurnstileBox(
  { onToken, onState, className },
  ref
) {
  const host = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const tokenCb = useRef(onToken);
  const stateCb = useRef(onState);
  tokenCb.current = onToken;
  stateCb.current = onState;

  useImperativeHandle(ref, () => ({
    reset() {
      tokenCb.current(null);
      try {
        if (window.turnstile && widgetId.current) window.turnstile.reset(widgetId.current);
      } catch {
        /* widget already gone */
      }
    },
  }));

  useEffect(() => {
    let cancelled = false;
    stateCb.current?.("loading");
    loadTurnstile()
      .then(() => {
        if (cancelled || !host.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(host.current, {
          sitekey: TURNSTILE_SITE_KEY,
          // Shows nothing unless Cloudflare wants the visitor to click something.
          appearance: "interaction-only",
          callback: (t: string) => {
            tokenCb.current(t);
            stateCb.current?.("ready");
          },
          "expired-callback": () => tokenCb.current(null),
          "timeout-callback": () => tokenCb.current(null),
          "error-callback": () => {
            tokenCb.current(null);
            stateCb.current?.("failed");
          },
        });
      })
      .catch(() => {
        if (!cancelled) stateCb.current?.("failed");
      });
    return () => {
      cancelled = true;
      try {
        if (window.turnstile && widgetId.current) window.turnstile.remove(widgetId.current);
      } catch {
        /* ignore */
      }
      widgetId.current = null;
    };
  }, []);

  return <div ref={host} className={className} />;
});

export default TurnstileBox;
