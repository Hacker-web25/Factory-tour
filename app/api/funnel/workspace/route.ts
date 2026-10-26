/**
 * GET /api/funnel/workspace?slug=acme-steel
 *
 * Is this workspace address free? Asked while the customer types it on
 * the billing step, so they learn it is taken BEFORE they pay rather
 * than after — the old flow silently appended a random number instead.
 *
 * Response { ok, slug, available, problem }
 *   problem  a sentence to show when the name is malformed or taken
 *
 * Deliberately says only yes or no about one exact name: it never lists
 * customers, and never suggests "acme-steel is taken, try acme-steel-2",
 * which would confirm a competitor's address just as readily.
 */

import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { billingRateLimit } from "@/lib/server/billingGuard";
import { fail, json } from "@/lib/server/billingGuard";
import { getClientIp } from "@/lib/getClientIp";
import { slugProblem, workspaceSlug } from "@/lib/slugs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const raw = (new URL(req.url).searchParams.get("slug") ?? "").trim().toLowerCase();
  // Canonicalise first: the browser shows what we would actually use, so
  // "Acme Steel" and "acme-steel" cannot disagree about availability.
  const slug = raw.includes(" ") || /[A-Z]/.test(raw) ? workspaceSlug(raw) : raw;

  const problem = slugProblem(slug);
  if (problem) return json({ ok: true, slug, available: false, problem });

  const sb = supabaseAdmin();
  if (!sb) return fail(503, "not_configured", "Checking is unavailable right now.");

  // Typing is one request per keystroke pause; this stops a script using
  // it to enumerate who our customers are.
  const rl = await billingRateLimit(sb, `workspace-check:${getClientIp(req.headers)}`, 120, 600);
  if (!rl.allowed) {
    return fail(429, "rate_limited", "Too many checks. Please wait a moment.", {
      "Retry-After": String(rl.retryAfter),
    });
  }

  const { data: org, error } = await sb.from("organizations").select("id").eq("slug", slug).maybeSingle();
  if (error) return fail(503, "check_failed", "We could not check that just now.");
  if (org) {
    return json({ ok: true, slug, available: false, problem: "That address is already taken. Please choose another." });
  }

  // Also claimed by an order that is open or paid but not yet built, so
  // two people checking out at the same time cannot both be promised it.
  const { data: held } = await sb
    .from("billing_orders")
    .select("id")
    .eq("requested_slug", slug)
    .in("status", ["created", "paid"])
    .limit(1);
  if (held && held.length > 0) {
    return json({ ok: true, slug, available: false, problem: "Someone is checking out with that address right now. Please choose another." });
  }

  return json({ ok: true, slug, available: true, problem: null });
}
