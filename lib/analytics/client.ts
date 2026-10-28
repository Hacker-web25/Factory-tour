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
  /** `path` is for an event about a page the visitor has already left: the
   *  time spent on it is sent after the route has changed, when
   *  window.location already shows the next page. */
  opts: { beacon?: boolean; path?: string } = {}
): void {
  if (typeof window === "undefined" || hasOptedOut()) return;
  const attr = storedAttribution();
  const payload = JSON.stringify({
    name,
    path: opts.path ?? window.location.pathname + window.location.search,
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

/** Round to the nearest 10, so "how far they scrolled" groups cleanly. */
export function scrollBucket(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, Math.round(pct / 10) * 10));
}

/**
 * How long a visitor actually spent on one page, and how far down it they
 * read. Counts only time the tab was in front of them (a tab left open
 * overnight is not engagement), and is capped at 30 minutes per page.
 *
 * Returns a function that sends what was measured and starts over; call it
 * when the visitor leaves the page, and it is also wired to the tab being
 * hidden or closed, which is the moment a phone user actually leaves.
 */
export function watchPageTime(path: string): () => void {
  if (typeof window === "undefined") return () => {};
  let since: number | null = document.visibilityState === "visible" ? Date.now() : null;
  let active = 0;
  let deepest = 0;

  const onScroll = () => {
    const el = document.documentElement;
    const room = el.scrollHeight - window.innerHeight;
    const pct = room > 0 ? (window.scrollY / room) * 100 : 100;
    if (pct > deepest) deepest = Math.min(100, pct);
  };
  const flush = () => {
    if (since !== null) {
      active += Date.now() - since;
      since = null;
    }
    const seconds = Math.min(1800, Math.round(active / 1000));
    if (seconds >= 1) {
      track("page_time", { seconds, scroll: scrollBucket(deepest) }, { beacon: true, path });
    }
    active = 0;
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") flush();
    else since = Date.now();
  };

  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", flush);

  return () => {
    flush();
    window.removeEventListener("scroll", onScroll);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", flush);
  };
}

/** Convenience for the funnel: one call per step reached. */
export function trackFunnelStep(step: string, meta?: Record<string, unknown>): void {
  track("funnel_step", { step, ...(meta ?? {}) });
}

/* ───────────────────────────── micro-signals ────────────────────────────── */

/**
 * Everything below answers "why did they stop?". page_view and page_time
 * say WHERE somebody went; these say what they pressed, what they skipped,
 * what they asked, and where they hesitated.
 *
 * This is the half that matters most for the money, because the six-page
 * assessment (/assessment/…) is rendered by the Next.js app, not by the
 * marketing bundle. lib/site/measure.ts does the same job in plain
 * browser JS for the bundle's pages; the two must stay in step, and a test
 * checks that neither one fires an event the server would discard.
 *
 * Read off the DOM by tag, text and href — never by class name. Class names
 * change on every build of either side, and a signal keyed to one would
 * break silently and not be missed for a month.
 */

/** Three clicks inside a second within 40px: jabbing at something dead. */
const RAGE_WINDOW_MS = 1000;
const RAGE_RADIUS_PX = 40;
const RAGE_CLICKS = 3;
/** Headings watched per page. A cap, so one long page cannot exhaust the
 *  per-visitor rate limit on /api/track and lose the rest of the journey. */
const MAX_SECTIONS = 14;

const PLAN_WORDS = /\b(confidence|authority|control|enterprise)\b/i;

function textOf(el: Element | null, max = 80): string {
  try {
    const t = ((el as HTMLElement | null)?.innerText || el?.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
    return t.slice(0, max);
  } catch {
    return "";
  }
}

/** The clickable thing the visitor actually meant to press, or null. */
function interactiveAncestor(start: EventTarget | null): Element | null {
  let el = start instanceof Element ? start : null;
  for (let i = 0; el && i < 6; i++) {
    const tag = el.tagName;
    if (
      tag === "A" || tag === "BUTTON" || tag === "INPUT" || tag === "SELECT" ||
      tag === "TEXTAREA" || tag === "LABEL" || tag === "SUMMARY"
    ) {
      return el;
    }
    const role = el.getAttribute("role");
    if (role === "button" || role === "link" || el.hasAttribute("tabindex")) return el;
    el = el.parentElement;
  }
  return null;
}

function nearestPlan(el: Element | null): string | null {
  let cur = el;
  for (let i = 0; cur && i < 4; i++) {
    const m = PLAN_WORDS.exec(textOf(cur, 400));
    if (m) return m[1]!.toLowerCase();
    cur = cur.parentElement;
  }
  return null;
}

function fieldNameOf(el: Element): string {
  const h = el as HTMLInputElement;
  return (
    h.getAttribute("name") ||
    h.getAttribute("id") ||
    h.getAttribute("aria-label") ||
    h.getAttribute("placeholder") ||
    h.type ||
    "field"
  ).slice(0, 60);
}

/**
 * Watch one page for the signals above. Returns a teardown function; call
 * it on route change, which is also when a half-filled form counts as
 * abandoned.
 *
 * Every signal fires at most once per page.
 */
export function watchSignals(path: string): () => void {
  if (typeof window === "undefined" || hasOptedOut() || isFramed()) return () => {};

  const sent = new Set<string>();
  const once = (k: string): boolean => {
    if (sent.has(k)) return false;
    sent.add(k);
    return true;
  };

  let field: string | null = null;
  let submitted = false;
  let rageAt = 0;
  let rageX = 0;
  let rageY = 0;
  let rageN = 0;

  const onClick = (e: MouseEvent) => {
    try {
      const now = Date.now();
      if (
        now - rageAt < RAGE_WINDOW_MS &&
        Math.abs(e.clientX - rageX) < RAGE_RADIUS_PX &&
        Math.abs(e.clientY - rageY) < RAGE_RADIUS_PX
      ) {
        rageN += 1;
      } else {
        rageN = 1;
      }
      rageAt = now;
      rageX = e.clientX;
      rageY = e.clientY;
      if (rageN === RAGE_CLICKS && once("rage")) {
        track("rage_click", { label: textOf(e.target as Element, 60), path });
      }

      const el = interactiveAncestor(e.target);
      if (!el) {
        // A click on nothing clickable. One per page: the first is
        // informative, the rest is somebody scrolling by tapping.
        if (once("dead")) track("dead_click", { label: textOf(e.target as Element, 60), path });
        return;
      }

      const label = textOf(el, 80);
      const href = el.getAttribute("href") ?? "";

      if (/^tel:/i.test(href)) return track("tel_click", { label });
      if (/^mailto:/i.test(href)) return track("email_click", { label });
      if (/wa\.me|whatsapp/i.test(href)) return track("whatsapp_click", { label });
      if (/^https?:/i.test(href) && !href.includes(window.location.hostname)) {
        return track("outbound_click", { label, href: href.slice(0, 200) });
      }
      // A question, however it is marked up: a <summary>, an accordion
      // header, or a heading ending in a question mark. These are the
      // objections to answer on the call.
      if ((el.tagName === "SUMMARY" || /\?\s*$/.test(label)) && label.length > 8) {
        if (once(`faq:${label}`)) track("faq_open", { question: label });
        return;
      }
      const plan = nearestPlan(el);
      if (plan && /plan|choose|select|start|buy|get|continue/i.test(`${label} ${href}`)) {
        return track("plan_selected", { plan, label });
      }
      if (/^(pay|pay now|proceed to pay|make payment)/i.test(label)) {
        return track("pay_click", { label });
      }
      if (label) track("cta_click", { label, path });
    } catch {
      /* a signal is never a reason to break a click */
    }
  };

  const onScroll = () => {
    try {
      const el = document.documentElement;
      const room = el.scrollHeight - window.innerHeight;
      const depth = room > 0 ? (window.scrollY / room) * 100 : 100;
      for (const m of [25, 50, 75, 100]) {
        if (depth >= m && once(`d${m}`)) track("scroll_depth", { depth: m, path });
      }
    } catch {
      /* ignore */
    }
  };

  const onFocusIn = (e: Event) => {
    const t = e.target as Element | null;
    if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) field = fieldNameOf(t);
  };
  const onSubmit = () => {
    submitted = true;
  };
  // Pointer leaving through the top of the window is the reach for the
  // close button or the address bar. Desktop only, which is why it is one
  // signal among several rather than the only one.
  const onMouseOut = (e: MouseEvent) => {
    if (!e.relatedTarget && e.clientY <= 0 && once("exit")) track("exit_intent", { path });
  };
  const onCopy = () => {
    if (once("copy")) track("copy_text", { path });
  };
  const onPrint = () => {
    if (once("print")) track("print_page", { path });
  };

  // Which sections of a long page they actually reached. Headings, because
  // they survive a rebuild.
  let io: IntersectionObserver | null = null;
  try {
    if (typeof IntersectionObserver === "function") {
      io = new IntersectionObserver(
        (entries) => {
          for (const en of entries) {
            if (!en.isIntersecting) continue;
            const t = textOf(en.target, 60);
            if (t && once(`s:${t}`)) track("section_view", { section: t, path });
            io?.unobserve(en.target);
          }
        },
        { threshold: 0.55 }
      );
      const heads = document.querySelectorAll("h1,h2,h3");
      for (let i = 0; i < heads.length && i < MAX_SECTIONS; i++) io.observe(heads[i]!);
    }
  } catch {
    io = null;
  }

  document.addEventListener("click", onClick, true);
  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("submit", onSubmit, true);
  document.addEventListener("mouseout", onMouseOut);
  document.addEventListener("copy", onCopy);
  window.addEventListener("beforeprint", onPrint);
  window.addEventListener("scroll", onScroll, { passive: true });

  /** A form left half-filled. We send only the NAME of the field they were
   *  on when they gave up — never what they typed. */
  const abandon = () => {
    if (field && !submitted) {
      track("form_abandon", { field, path }, { beacon: true, path });
    }
    field = null;
  };
  window.addEventListener("pagehide", abandon);

  onScroll();

  return () => {
    abandon();
    io?.disconnect();
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("focusin", onFocusIn, true);
    document.removeEventListener("submit", onSubmit, true);
    document.removeEventListener("mouseout", onMouseOut);
    document.removeEventListener("copy", onCopy);
    window.removeEventListener("beforeprint", onPrint);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("pagehide", abandon);
  };
}
