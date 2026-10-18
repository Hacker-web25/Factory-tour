/**
 * POST /api/funnel/otp/verify — check the six-digit code from the buyer.
 *
 * Only the newest unconsumed code for that address counts, so asking for a
 * fresh code invalidates the old one in practice. A code is consumed the
 * moment it succeeds and can never verify twice.
 *
 * Six digits is a million guesses, so the guard is the attempt counter, not
 * the code length: MAX_ATTEMPTS wrong tries burns that code, and the rate
 * limiter caps how fast new ones can be asked for. Wrong code and expired
 * code return the same shape, so nothing here says whether an address has a
 * live code waiting.
 */

import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/getClientIp";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  billingRateLimit,
  clean,
  fail,
  json,
  limiterEmail,
  readJson,
  validEmail,
} from "@/lib/server/billingGuard";
import { hashOtp } from "../send/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2 * 1024;
/** Wrong guesses allowed against one code before it is dead. */
const MAX_ATTEMPTS = 5;

export async function POST(req: Request) {
  const sb = supabaseAdmin();
  if (!sb) return fail(503, "not_configured", "Verification is not set up yet.");

  const read = await readJson(req, MAX_BODY_BYTES);
  if (!read.ok) return fail(read.status, read.error);

  const email = clean(read.body.email, 254).toLowerCase();
  const code = clean(read.body.code, 12).replace(/\D/g, "");
  if (!validEmail(email)) return fail(400, "bad_email");
  if (code.length !== 6) return fail(400, "bad_code", "Enter the six-digit code.");

  const ip = getClientIp(req.headers);
  const perEmail = await billingRateLimit(sb, `funnel_otp_try:email:${limiterEmail(email)}`, 12, 900);
  if (!perEmail.allowed) {
    return fail(429, "rate_limited", "Too many attempts. Try again shortly.", {
      "Retry-After": String(perEmail.retryAfter),
    });
  }
  const perIp = await billingRateLimit(sb, `funnel_otp_try:ip:${ip}`, 40, 900);
  if (!perIp.allowed) {
    return fail(429, "rate_limited", undefined, { "Retry-After": String(perIp.retryAfter) });
  }

  const { data: row, error } = await sb
    .from("funnel_otp")
    .select("id, code_hash, expires_at, attempts, lead_id")
    .eq("email", email)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[funnel/otp/verify] lookup failed:", error.message);
    return fail(500, "verify_failed", "Could not check that code. Please try again.");
  }
  // No live code and a wrong code are told apart nowhere but here.
  if (!row) return fail(400, "code_invalid", "That code has expired. Ask for a new one.");

  if (row.attempts >= MAX_ATTEMPTS) {
    return fail(400, "code_invalid", "That code is no longer valid. Ask for a new one.");
  }

  if (row.code_hash !== hashOtp(email, code)) {
    // Bump first, answer second, so a client that hangs up still pays for the
    // guess it made.
    await sb
      .from("funnel_otp")
      .update({ attempts: row.attempts + 1 })
      .eq("id", row.id);
    const left = MAX_ATTEMPTS - (row.attempts + 1);
    return fail(
      400,
      "code_invalid",
      left > 0 ? `That code is not right. ${left} attempt${left === 1 ? "" : "s"} left.` : "That code is no longer valid. Ask for a new one."
    );
  }

  const now = new Date().toISOString();
  await sb.from("funnel_otp").update({ consumed_at: now }).eq("id", row.id);

  // Record the verification on the lead too, so /admin can see which leads
  // reached a confirmed address. Best-effort: the buyer is verified either
  // way and must not be blocked by a note failing to save.
  const leadId =
    typeof read.body.leadId === "string" && read.body.leadId.length === 36
      ? read.body.leadId
      : row.lead_id;
  if (leadId) {
    const { error: leadErr } = await sb
      .from("funnel_leads")
      .update({ email_verified_at: now, email })
      .eq("id", leadId);
    if (leadErr) {
      // eslint-disable-next-line no-console
      console.warn("[funnel/otp/verify] lead note failed:", leadErr.message);
    }
  }

  return json({ ok: true, verified: true, email });
}

export function GET() {
  return NextResponse.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
}
