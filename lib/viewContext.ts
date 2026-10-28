/**
 * What the public viewer tells the database about WHICH tour / link it is opening.
 *
 * Tours that are "unlisted", and tours reached through a share link, can no longer be listed with the
 * public API key: the database (security_phase3b_lockdown.sql) shows such a tour only to a request that
 * carries its id / link token — and, where a password is set, the proof ("grant") that the password was
 * entered.  lib/supabase.ts adds these values as request headers to every database call.
 *
 * The values are not secrets from the visitor (they come from the address they opened); the grants are
 * HMACs only the database can make (security_phase3a_additive.sql), handed out after a correct password.
 */

export type ViewContext = {
  /** Tour id from the address bar (unlisted tours). */
  tourId?: string;
  /** Proof the unlisted tour's password was entered. */
  tourGrant?: string;
  /** Share-link token. */
  shareToken?: string;
  /** Proof the share link's password was entered. */
  shareGrant?: string;
  /** Anonymous device id (device-limited links). */
  fp?: string;
  /** E-mail typed into an e-mail gate. */
  email?: string;
};

let ctx: ViewContext = {};

export function setViewContext(patch: Partial<ViewContext>): void {
  ctx = { ...ctx, ...patch };
}

export function clearViewContext(): void {
  ctx = {};
}

/** Header-safe value: printable ASCII only, bounded. */
function safe(v: string | undefined, max = 300): string | null {
  if (!v) return null;
  const s = v.replace(/[^\x20-\x7E]/g, "").trim().slice(0, max);
  return s || null;
}

/** Headers to add to a database request ({} when nothing is set). */
export function viewHeaders(): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (name: string, v: string | undefined, max?: number) => {
    const s = safe(v, max);
    if (s) out[name] = s;
  };
  put("x-view-tour", ctx.tourId, 64);
  put("x-tour-grant", ctx.tourGrant, 128);
  put("x-share-token", ctx.shareToken, 128);
  put("x-share-grant", ctx.shareGrant, 128);
  put("x-viewer-fp", ctx.fp, 128);
  put("x-viewer-email", ctx.email, 254);
  return out;
}

/* Grants survive a reload of the tab (sessionStorage only; gone when the tab closes). */
const GRANTS_KEY = "vpv_view_grants";

function readGrants(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.sessionStorage.getItem(GRANTS_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export function rememberGrant(key: string, grant: string): void {
  if (typeof window === "undefined") return;
  try {
    const all = readGrants();
    all[key] = grant;
    window.sessionStorage.setItem(GRANTS_KEY, JSON.stringify(all));
  } catch {
    /* storage disabled — the grant simply isn't remembered */
  }
}

export function recallGrant(key: string): string | null {
  return readGrants()[key] ?? null;
}

export function forgetGrant(key: string): void {
  if (typeof window === "undefined") return;
  try {
    const all = readGrants();
    delete all[key];
    window.sessionStorage.setItem(GRANTS_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}
