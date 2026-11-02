/**
 * lib/link2qr.ts — read scans from LINK-2-QR, the tool that prints our QR letters.
 *
 * Why this exists. A printed letter's QR opens LINK-2-QR, not us:
 *
 *   qr-generation-one.vercel.app/r/<code>  →  qr-generation-ag74.onrender.com/r/<code>
 *       (LINK-2-QR counts the scan here)    →  the campaign's link, e.g. https://myvpv.com
 *
 * The link is the same for every person in a campaign, so the code is dropped on
 * the way and myvpv.com never learns who scanned. The letters are already printed,
 * so the QR cannot change. Two things fix it without reprinting:
 *
 *   1. Import: LINK-2-QR keeps every scan with its exact time, per code. We copy
 *      those into campaign_scans, so "Opened" is right, including old scans.
 *   2. Bridge: the campaign's link in LINK-2-QR is changed to
 *      https://myvpv.com/q/l2q/<campaign id>. That page asks LINK-2-QR which of its
 *      codes was scanned a moment ago and continues exactly like /q/<code>, so
 *      the website visit, the journey and any order are tied to the right person.
 *
 * Both write the same scan row: its id is derived from (code, scan time), so a scan
 * is never counted twice whichever of the two sees it first.
 *
 * This file is the pure part plus the HTTP client; the database work is in
 * lib/server/link2qrSync.ts and app/q/l2q/[campaign]/route.ts.
 */

import { createHash } from "crypto";

export const LINK2QR_BASE = (process.env.LINK2QR_API_BASE || "https://qr-generation-ag74.onrender.com").replace(/\/+$/, "");

/** How far back a bridge visit may look for "its" scan. Covers a slow phone and
 *  a LINK-2-QR server waking from sleep; short enough that two people scanning
 *  the same campaign minutes apart are never confused. */
export const BRIDGE_LOOKBACK_MS = 3 * 60 * 1000;
/** Clock difference allowed between LINK-2-QR's server and ours. */
export const BRIDGE_CLOCK_SKEW_MS = 15 * 1000;

export type L2qScan = { code: string; at: number };
export type L2qLink = { id: number; label: string; destinationUrl: string };
export type L2qCampaign = { id: number; name: string; links: L2qLink[]; scans: L2qScan[]; codes: string[] };

const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/;

/** The campaign ids LINK-2-QR lists. Unknown shapes give an empty list, never a throw. */
export function parseCampaignList(body: unknown): number[] {
  const list = Array.isArray(body)
    ? body
    : body && typeof body === "object" && Array.isArray((body as { campaigns?: unknown }).campaigns)
      ? (body as { campaigns: unknown[] }).campaigns
      : [];
  const ids: number[] = [];
  for (const c of list) {
    const id = c && typeof c === "object" ? Number((c as { id?: unknown }).id) : NaN;
    if (Number.isInteger(id) && id > 0 && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** One campaign: its links and every scan of every code, with the time in ms. */
export function parseCampaign(body: unknown): L2qCampaign | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { campaign?: { id?: unknown; name?: unknown }; links?: unknown; people?: unknown };
  const id = Number(b.campaign?.id);
  if (!Number.isInteger(id) || id <= 0) return null;

  const links: L2qLink[] = [];
  for (const l of Array.isArray(b.links) ? b.links : []) {
    if (!l || typeof l !== "object") continue;
    const x = l as { id?: unknown; label?: unknown; destinationUrl?: unknown };
    const lid = Number(x.id);
    if (!Number.isInteger(lid)) continue;
    links.push({ id: lid, label: String(x.label ?? ""), destinationUrl: String(x.destinationUrl ?? "") });
  }

  const scans: L2qScan[] = [];
  const codes: string[] = [];
  const seen = new Set<string>();
  for (const p of Array.isArray(b.people) ? b.people : []) {
    if (!p || typeof p !== "object") continue;
    for (const l of Array.isArray((p as { links?: unknown }).links) ? (p as { links: unknown[] }).links : []) {
      if (!l || typeof l !== "object") continue;
      const code = String((l as { code?: unknown }).code ?? "").trim();
      if (!CODE_RE.test(code)) continue;
      if (!codes.includes(code)) codes.push(code);
      for (const s of Array.isArray((l as { scans?: unknown }).scans) ? (l as { scans: unknown[] }).scans : []) {
        const at = typeof s === "string" ? Date.parse(s) : NaN;
        if (!Number.isFinite(at)) continue;
        const key = `${code}|${at}`;
        if (seen.has(key)) continue;
        seen.add(key);
        scans.push({ code, at });
      }
    }
  }
  scans.sort((a, b) => a.at - b.at || a.code.localeCompare(b.code));
  return { id, name: String(b.campaign?.name ?? ""), links, scans, codes };
}

/**
 * The campaign_scans id for one LINK-2-QR scan. The same scan always gets the same
 * id, so the import and the bridge can both write it and the database keeps one row.
 */
export function scanRowId(code: string, at: number): string {
  const h = createHash("sha256").update(`link2qr:${code}:${new Date(at).toISOString()}`).digest("hex");
  // Shape it as an RFC 4122 uuid (version 5 style, variant 10xx).
  const v = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${v}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * Which scans a bridge visit arriving at `now` could belong to, best first:
 * scans made just before now come first, nearest first; then the few that look
 * a little in the future (clocks differ slightly). Anything older than the
 * lookback is never a candidate, so an old scan cannot be claimed by a stranger.
 */
export function bridgeCandidates(scans: L2qScan[], now: number): L2qScan[] {
  const inWindow = scans.filter((s) => s.at >= now - BRIDGE_LOOKBACK_MS && s.at <= now + BRIDGE_CLOCK_SKEW_MS);
  const past = inWindow.filter((s) => s.at <= now).sort((a, b) => b.at - a.at);
  const future = inWindow.filter((s) => s.at > now).sort((a, b) => a.at - b.at);
  return [...past, ...future];
}

/* ─────────────────────────── HTTP ─────────────────────────── */

let sessionCookie: string | null = null;

async function getOnce(path: string, timeoutMs: number, cookie: string | null): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(`${LINK2QR_BASE}/api${path}`, {
      headers: { accept: "application/json", ...(cookie ? { cookie } : {}) },
      cache: "no-store",
      signal: ctl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

/** Sign in when LINK-2-QR asks for it and LINK2QR_PASSWORD is set. */
async function login(timeoutMs: number): Promise<boolean> {
  const password = process.env.LINK2QR_PASSWORD;
  if (!password) return false;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${LINK2QR_BASE}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
      cache: "no-store",
      signal: ctl.signal,
    });
    const set = res.headers.get("set-cookie");
    if (!res.ok || !set) return false;
    sessionCookie = set.split(/,(?=[^;]+=)/).map((c) => c.split(";")[0]!.trim()).join("; ");
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/** GET a LINK-2-QR API path as JSON. Throws on timeout or a bad answer. */
export async function link2qrGet(path: string, timeoutMs: number): Promise<unknown> {
  let res = await getOnce(path, timeoutMs, sessionCookie);
  if ((res.status === 401 || res.status === 403) && (await login(timeoutMs))) {
    res = await getOnce(path, timeoutMs, sessionCookie);
  }
  if (!res.ok) throw new Error(`LINK-2-QR answered ${res.status} for ${path}`);
  return res.json();
}

export async function fetchCampaign(id: number, timeoutMs: number): Promise<L2qCampaign | null> {
  return parseCampaign(await link2qrGet(`/campaigns/${id}`, timeoutMs));
}

export async function fetchCampaignIds(timeoutMs: number): Promise<number[]> {
  return parseCampaignList(await link2qrGet("/campaigns", timeoutMs));
}
