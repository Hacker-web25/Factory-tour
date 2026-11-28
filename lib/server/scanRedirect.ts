/**
 * lib/server/scanRedirect.ts — what happens when somebody scans a printed QR.
 *
 * Both links on paper end up here: the new personal one, /hi/aryan-k7m2xq, and
 * the older /q/<code> that every QR printed so far points at. One
 * implementation, so a person who scans an old letter gets exactly what a
 * person who scans a new one does, including the welcome.
 *
 * SPEED IS THE PRODUCT. A scan that takes four seconds is a scan the person
 * gives up on, and the letter cannot be reissued. So:
 *
 *   • ONE database round trip stands between the scan and the redirect: the
 *     lookup. Recording the scan, stamping the visitor and noting their device
 *     (three more calls, all of which used to be awaited one after another)
 *     now run AFTER the redirect has gone out, through waitUntil, so the
 *     visitor never waits for them. Where waitUntil does not exist (tests,
 *     local dev) they are simply awaited, so nothing is ever lost.
 *
 *   • The lookup is remembered for a minute per instance, so a person who taps
 *     the link twice, or a room full of people who scan the same code, cost
 *     the database one read.
 *
 *   • Everything here runs on the Edge runtime, which has no cold start, and
 *     is pinned next to the database (see the route files). A letter is
 *     scanned a handful of times a day: a normal serverless function would be
 *     cold nearly every time.
 *
 * IT ALWAYS REDIRECTS. Unknown code, switched-off code, database down,
 * missing column: every one of them lands the visitor on the homepage. The
 * one thing a printed QR must never do is show an error.
 *
 * The destination is always a path on myvpv.com (isSafePath here, and a CHECK
 * constraint on the column), so a code can never become an open redirect.
 */

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getClientIp } from "@/lib/getClientIp";
import { isSafePath, normaliseCode } from "@/lib/analytics/attribution";
import { isEmailCode } from "@/lib/personCodes";
import { HI_COOKIE, HI_COOKIE_MAX_AGE, greetingName } from "@/lib/hiLinks";
import {
  geoFrom,
  recordScan,
  setVisitorDevice,
  touchVisitor,
  visitorIdFrom,
} from "@/lib/server/analytics";

const SITE = "https://myvpv.com";

export type CodeRow = {
  code: string;
  destination: string;
  source: string;
  medium: string;
  campaign: string | null;
  active: boolean;
  person_name?: string | null;
  greeting_name?: string | null;
};

/** "_" and "%" are LIKE wildcards and codes are allowed to contain "_". */
function escapeLike(v: string): string {
  return v.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/* ── a minute of memory, per instance ─────────────────────────────────── */

const CACHE_MS = 60_000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; row: CodeRow | null }>();

function cacheGet(key: string): { row: CodeRow | null } | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_MS) {
    cache.delete(key);
    return null;
  }
  return { row: hit.row };
}

function cachePut(key: string, row: CodeRow | null): void {
  if (cache.size >= CACHE_MAX) {
    // Oldest first: a Map iterates in insertion order.
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, { at: Date.now(), row });
}

/** Test seam, and what the admin tool calls after it edits a code. */
export function __resetScanCacheForTests(): void {
  cache.clear();
  level = 0;
}

/**
 * Which optional columns the database has. Asking for a column that is not
 * there fails the WHOLE select, and a failed select would strand a scan, so
 * a "no such column" error steps down to a shorter list and remembers it
 * until the instance restarts. Any other error (database down) does NOT step
 * down: that would quietly drop the greeting for a good while after a blip.
 *
 *   0  everything, including greeting_name (supabase/hi_links.sql)
 *   1  without greeting_name
 *   2  without person_name either (supabase/analytics.sql not run: ancient)
 */
const LEVELS = [
  "code, destination, source, medium, campaign, active, person_name, greeting_name",
  "code, destination, source, medium, campaign, active, person_name",
  "code, destination, source, medium, campaign, active",
];
let level = 0;

function missingColumn(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.code === "42703" || /column .* does not exist|schema cache|could not find/i.test(err.message ?? "");
}

async function lookup(sb: SupabaseClient, candidates: string[]): Promise<CodeRow | null> {
  const key = candidates.join("|").toLowerCase();
  const hit = cacheGet(key);
  if (hit) return hit.row;

  // Ask for every spelling at once: as written, and in capitals, which is how
  // codes are stored. One query, however many candidates.
  const spellings = Array.from(new Set(candidates.flatMap((c) => [c, c.toUpperCase()])));

  let res = await sb.from("campaign_codes").select(LEVELS[level]!).in("code", spellings).limit(4);
  while (res.error && missingColumn(res.error) && level < LEVELS.length - 1) {
    level += 1;
    res = await sb.from("campaign_codes").select(LEVELS[level]!).in("code", spellings).limit(4);
  }
  if (res.error) throw new Error(res.error.message);

  let rows = ((res.data ?? []) as unknown as CodeRow[]).filter(Boolean);

  if (!rows.length) {
    // A code typed in by hand from the print, in whatever case. Only on a miss,
    // so the common path stays one read.
    const bare = candidates[candidates.length - 1]!;
    const loose = await sb
      .from("campaign_codes")
      .select(LEVELS[level]!)
      .ilike("code", escapeLike(bare))
      .limit(1);
    if (loose.error) throw new Error(loose.error.message);
    rows = ((loose.data ?? []) as unknown as CodeRow[]).filter(Boolean);
  }

  // Longest candidate wins: "GGN-K7M2XQ" beats a bare "K7M2XQ" that happens to exist.
  let best: CodeRow | null = null;
  for (const cand of candidates) {
    const m = rows.find((r) => r.code.toLowerCase() === cand.toLowerCase());
    if (m) {
      best = m;
      break;
    }
  }
  cachePut(key, best);
  return best;
}

/* ── running work after the response has gone ─────────────────────────── */

type WaitUntil = (p: Promise<unknown>) => void;

/** Vercel's request context, where there is one. Same trick @vercel/functions uses. */
function vercelWaitUntil(): WaitUntil | null {
  try {
    const ctx = (globalThis as Record<symbol, unknown>)[Symbol.for("@vercel/request-context")] as
      | { get?: () => { waitUntil?: WaitUntil } | undefined }
      | undefined;
    const w = ctx?.get?.()?.waitUntil;
    return typeof w === "function" ? w : null;
  } catch {
    return null;
  }
}

/**
 * Run `work` after the response where the platform allows it, otherwise right
 * now. Returns the promise only when it had to be awaited, so the caller can
 * `await` the return value and lose nothing either way.
 */
function afterResponse(work: () => Promise<unknown>): Promise<unknown> | undefined {
  const wu = vercelWaitUntil();
  const p = work().catch(() => {
    /* analytics must never break a redirect */
  });
  if (wu) {
    wu(p);
    return undefined;
  }
  return p;
}

/* ── the response ─────────────────────────────────────────────────────── */

/** 302, never 301: a permanent redirect would be cached by the browser and by
 *  every proxy in between, and the second scan would never reach us. */
function send(to: URL | string, opts: { coupon?: string; greeting?: string | null } = {}): NextResponse {
  const res = NextResponse.redirect(to, 302);
  res.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  // An e-mail campaign's shared coupon rides along, so the buyer does not have
  // to type it. Readable by the billing page, which checks it with the server.
  if (opts.coupon) {
    res.cookies.set("vpv_coupon", opts.coupon, {
      maxAge: 14 * 24 * 60 * 60,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
  }
  // The name the welcome writes. Not HttpOnly: the page's own script reads it.
  // It rides in a cookie rather than the address, so the name never reaches
  // Google Analytics or Clarity.
  if (opts.greeting) {
    // Passed raw: Next percent-encodes the value itself (encoding it here too
    // would turn "Rajesh ji" into "Rajesh%2520ji"). The page decodes it once.
    res.cookies.set(HI_COOKIE, opts.greeting, {
      maxAge: HI_COOKIE_MAX_AGE,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
  }
  return res;
}

/**
 * Handle one scan. `candidates` are the codes the link could be pointing at,
 * longest first (see codeCandidates in lib/hiLinks.ts); for /q/<code> it is
 * just that one code.
 */
export async function scanRedirect(req: Request, candidates: string[]): Promise<Response> {
  const origin = (() => {
    try {
      return new URL(req.url).origin;
    } catch {
      return SITE;
    }
  })();
  const home = new URL("/", origin);

  const cands = candidates.map((c) => normaliseCode(c)).filter((c): c is string => !!c);
  if (!cands.length) return send(home);

  const sb = supabaseAdmin();
  if (!sb) return send(home); // never strand a scan

  let row: CodeRow | null = null;
  try {
    row = await lookup(sb, cands);
  } catch {
    return send(home);
  }
  if (!row || !row.active || !isSafePath(row.destination)) return send(home);

  // Where they are actually going, with the campaign stamped on the URL.
  const dest = new URL(row.destination, origin);
  dest.searchParams.set("utm_source", row.source);
  dest.searchParams.set("utm_medium", row.medium);
  if (row.campaign) dest.searchParams.set("utm_campaign", row.campaign);
  // Our own code, read back by the tracker and the funnel. Random, so it can
  // go to Google Analytics and Clarity without a person's name going with it.
  dest.searchParams.set("vpv", row.code);

  // An e-mail campaign's shared coupon, if it has one that can still be used.
  // Only e-mail codes look it up, so QR and print scans do no extra work, and a
  // failure here can never stop the redirect: an e-mailed link must land.
  let coupon: string | undefined;
  if (isEmailCode(row.code)) {
    try {
      const f = await sb.from("campaign_codes").select("folder_id").eq("code", row.code).maybeSingle();
      const folderId = (f.data as { folder_id: string | null } | null)?.folder_id;
      if (folderId) {
        const ec = await sb.from("email_campaigns").select("coupon_code").eq("folder_id", folderId).maybeSingle();
        const couponCode = (ec.data as { coupon_code: string | null } | null)?.coupon_code;
        if (couponCode) {
          const c = await sb.from("coupons").select("active, expires_at").eq("code", couponCode).maybeSingle();
          const cd = c.data as { active: boolean; expires_at: string | null } | null;
          if (cd?.active && (!cd.expires_at || new Date(cd.expires_at).getTime() > Date.now())) {
            coupon = couponCode;
            dest.searchParams.set("coupon", couponCode);
          }
        }
      }
    } catch {
      /* no coupon: the visitor still arrives */
    }
  }

  const headers = req.headers;
  const geo = geoFrom(headers);
  const visitorId = visitorIdFrom(headers);
  const referrer = headers.get("referer");
  const userAgent = headers.get("user-agent");
  const ip = getClientIp(headers);
  const scanned = row;

  // Everything below is bookkeeping. The visitor does not wait for it.
  const pending = afterResponse(async () => {
    await Promise.allSettled([
      recordScan(sb, { code: scanned.code, visitorId, referrer, userAgent, ip }, geo),
      visitorId
        ? touchVisitor(
            sb,
            visitorId,
            {
              source: scanned.source,
              medium: scanned.medium,
              campaign: scanned.campaign,
              code: scanned.code,
              referrer,
              landingPath: scanned.destination,
            },
            geo,
            // The page view on the other side of this redirect is the visit.
            // Counting it here too would double every scan.
            false
          )
        : Promise.resolve(),
    ]);
    // After touchVisitor, never before: this fills blanks on a row that call
    // has just created.
    if (visitorId) await setVisitorDevice(sb, visitorId, userAgent);
  });

  const res = send(dest, {
    coupon,
    greeting: greetingName(row.person_name, row.greeting_name),
  });
  // Where waitUntil does not exist the work is awaited here, before returning.
  if (pending) await pending;
  return res;
}
