/**
 * lib/analytics/client.ts — the browser half of the first-party tracking.
 *
 * Three jobs:
 *   • remember where this visit came from, once, and keep it (first touch);
 *   • group events into a visit (a session id that rolls over when idle);
 *   • send events to /api/track, and mirror them into Google Analytics.
 *
 * Everything is wrapped in try/catch. Private windows, blocked storage and
 * "clear site data" all make these calls throw, and not one of them is a
 * reason for a visitor to see a broken page.
 */

import {
  OPT_OUT_COOKIE,
  SESSION_MAX_AGE,
  normaliseCode,
  type Attribution,
} from "@/lib/analytics/attribution";

const ATTR_KEY = "vpv.attr.v1";
const SESSION_KEY = "vpv.sid.v1";

type StoredAttribution = {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  term?: string | null;
  content?: string | null;
  code?: string | null;
  referrer?: string | null;
  landingPath?: string | null;
  at?: number;
};

function safeLocal(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * True when this page is shown inside another page's frame: the hero demo
 * on our own home page, or a customer's tour embedded on their site.
 *
 * Measurement and the cookie notice both stay out of frames. The parent
 * page is already measured, so a second copy would double-count; the notice
 * would sit inside a small window and send its "Cookie Policy" link into
 * the frame; and a customer's embedded tour must not start tracking their
 * visitors with our Google and Microsoft scripts.
 */
export function isFramed(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    // Reading window.top across origins throws: that means we are framed.
    return true;
  }
}

export function hasOptedOut(): boolean {
  try {
    return document.cookie.includes(`${OPT_OUT_COOKIE}=1`);
  } catch {
    return false;
  }
}

/**
 * Store where this visit came from, the FIRST time we see it and never
 * again. A visitor who scans the pamphlet today and returns from a Google
 * search next week is still a pamphlet visitor: that is the number the
 * print run is judged on.
 */
export function captureAttribution(): StoredAttribution | null {
  if (typeof window === "undefined") return null;
  const ls = safeLocal();
  try {
    const existing = ls?.getItem(ATTR_KEY);
    if (existing) return JSON.parse(existing) as StoredAttribution;
  } catch {
    /* unreadable; fall through and write a fresh one */
  }

  try {
    const url = new URL(window.location.href);
    const q = url.searchParams;
    const pick = (k: string) => {
      const v = q.get(k);
      return v && v.trim() ? v.trim().slice(0, 120) : null;
    };
    const ref = document.referrer || null;
    const sameSite =
      !!ref && (() => {
        try {
          return new URL(ref).hostname === window.location.hostname;
        } catch {
          return false;
        }
      })();

    const attr: StoredAttribution = {
      source: pick("utm_source"),
      medium: pick("utm_medium"),
      campaign: pick("utm_campaign"),
      term: pick("utm_term"),
      content: pick("utm_content"),
      code: normaliseCode(q.get("vpv")),
      referrer: sameSite ? null : ref ? ref.slice(0, 300) : null,
      landingPath: (url.pathname + url.search).slice(0, 300),
      at: Date.now(),
    };
    ls?.setItem(ATTR_KEY, JSON.stringify(attr));
    return attr;
  } catch {
    return null;
  }
}

/** What the funnel sends with the lead, so the rep and the owner can see
 *  which pamphlet or search produced it. */
export function storedAttribution(): StoredAttribution | null {
  try {
    const raw = safeLocal()?.getItem(ATTR_KEY);
    return raw ? (JSON.parse(raw) as StoredAttribution) : null;
  } catch {
    return null;
  }
}

/** A visit. Rolls over after the same idle gap the server assumes. */
function sessionId(): string | null {
  try {
    const ls = safeLocal();
    if (!ls) return null;
    const raw = ls.getItem(SESSION_KEY);
    const now = Date.now();
    if (raw) {
      const { id, at } = JSON.parse(raw) as { id: string; at: number };
      if (id && now - at < SESSION_MAX_AGE * 1000) {
        ls.setItem(SESSION_KEY, JSON.stringify({ id, at: now }));
        return id;
      }
    }
    const id = crypto.randomUUID();
    ls.setItem(SESSION_KEY, JSON.stringify({ id, at: now }));
    return id;
  } catch {
    return null;
  }
}

type Gtag = (...args: unknown[]) => void;

/** Mirror the event into Google Analytics when it is loaded. */
function toGoogle(name: string, meta?: Record<string, unknown>): void {
  try {
    const g = (window as unknown as { gtag?: Gtag }).gtag;
    if (typeof g === "function" && name !== "page_view") g("event", name, meta ?? {});
  } catch {
    /* GA blocked or not configured */
  }
}

/**
 * Record one event. Fire-and-forget: never awaited by the UI, never throws,
 * and uses sendBeacon where the page may be closing (a click that navigates
 * away would otherwise cancel the request before it left the browser).
 */
export function track(
  name: string,
  meta?: Record<string, unknown>,
  opts: { beacon?: boolean } = {}
): void {
  if (typeof window === "undefined" || hasOptedOut()) return;
  const attr = storedAttribution();
  const payload = JSON.stringify({
    name,
    path: window.location.pathname + window.location.search,
    referrer: document.referrer || null,
    sessionId: sessionId(),
    utmSource: attr?.source ?? null,
    utmMedium: attr?.medium ?? null,
    utmCampaign: attr?.campaign ?? null,
    code: attr?.code ?? null,
    meta: meta ?? null,
  });

  toGoogle(name, meta);

  try {
    if (opts.beacon && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon("/api/track", new Blob([payload], { type: "application/json" }));
      return;
    }
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never breaks the page */
  }
}

/** Convenience for the funnel: one call per step reached. */
export function trackFunnelStep(step: string, meta?: Record<string, unknown>): void {
  track("funnel_step", { step, ...(meta ?? {}) });
}
