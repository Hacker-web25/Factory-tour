/**
 * POST /api/funnel/otp/send — e-mail a six-digit code to the buyer.
 *
 * The billing step verifies the buyer's e-mail address before they can pay,
 * for two reasons: the workspace, the first password and the GST invoice are
 * all delivered to that address, so a typo loses the customer their purchase;
 * and a verified address raises the cost of ordering under somebody else's
 * name.
 *
 * E-mail, not SMS, deliberately. Sending any SMS to an Indian number — an OTP
 * included — needs DLT registration of the entity, the header and every
 * template before a single message can go out. Resend is already wired for
 * the invoice and welcome e-mails and needs none of that, so the phone number
 * is collected unverified for now and the address is what we check.
 *
 * The code is stored only as a SHA-256 hash, so a leaked row cannot be used
 * to verify anyone's address. Rate limited per address and per IP.
 */

import { NextResponse } from "next/server";
import { createHash, randomInt } from "node:crypto";
import { getClientIp } from "@/lib/getClientIp";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { emailShell, esc, sendEmail } from "@/lib/server/email";
import { COMPANY } from "@/lib/company";
import {
  billingRateLimit,
  clean,
  fail,
  isDisposableEmail,
  json,
  limiterEmail,
  readJson,
  validEmail,
} from "@/lib/server/billingGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2 * 1024;

/** How long a code is good for. Long enough to find the e-mail, short
 *  enough that a shoulder-surfed code is useless by the time it is read. */
export const OTP_TTL_SECONDS = 10 * 60;

export function hashOtp(email: string, code: string): string {
  // The address is in the hash as well, so a code issued for one e-mail can
  // never verify a different one.
  return createHash("sha256").update(`${email.toLowerCase()}:${code}`).digest("hex");
}

export async function POST(req: Request) {
  const sb = supabaseAdmin();
  if (!sb) return fail(503, "not_configured", "Verification is not set up yet.");

  const read = await readJson(req, MAX_BODY_BYTES);
  if (!read.ok) return fail(read.status, read.error);

  const email = clean(read.body.email, 254).toLowerCase();
  if (!validEmail(email)) {
    return fail(400, "bad_email", "That e-mail address does not look right.");
  }
  if (isDisposableEmail(email)) {
    return fail(400, "disposable_email", "Please use your company e-mail address.");
  }

  const ip = getClientIp(req.headers);
  // Two limits: one stops a single address being mail-bombed, the other stops
  // one machine working through a list of addresses.
  const perEmail = await billingRateLimit(sb, `funnel_otp:email:${limiterEmail(email)}`, 5, 900);
  if (!perEmail.allowed) {
    return fail(429, "rate_limited", "Too many codes requested. Try again shortly.", {
      "Retry-After": String(perEmail.retryAfter),
    });
  }
  const perIp = await billingRateLimit(sb, `funnel_otp:ip:${ip}`, 20, 900);
  if (!perIp.allowed) {
    return fail(429, "rate_limited", undefined, { "Retry-After": String(perIp.retryAfter) });
  }

  // randomInt is cryptographically random; Math.random would be guessable.
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString();
  const leadId =
    typeof read.body.leadId === "string" && read.body.leadId.length === 36
      ? read.body.leadId
      : null;

  const { error } = await sb.from("funnel_otp").insert({
    email,
    code_hash: hashOtp(email, code),
    expires_at: expiresAt,
    lead_id: leadId,
    ip,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[funnel/otp/send] insert failed:", error.message);
    return fail(500, "otp_store_failed", "Could not start verification. Please try again.");
  }

  const sent = await sendEmail({
    to: email,
    subject: `${code} is your VPV verification code`,
    html: emailShell(
      "Confirm your e-mail",
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">
         Enter this code on the VPV billing page to confirm this address.</p>
       <p style="margin:0 0 18px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
          font-size:34px;font-weight:700;letter-spacing:0.18em;color:#0C1017;">${esc(code)}</p>
       <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#64748b;">
         The code expires in 10 minutes. Your workspace details and your GST
         invoice will be sent to this address, which is why we check it.</p>
       <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#64748b;">
         If you did not ask for this, you can ignore this e-mail — nothing has
         been charged. Questions go to
         <a href="mailto:${esc(COMPANY.emails.support)}" style="color:#1468D8;">${esc(COMPANY.emails.support)}</a>.</p>`
    ),
  });

  // Whether the code was sent is reported, but the code never is, and an
  // address that does not exist gets the same shape of answer as one that
  // does — so this endpoint cannot be used to test whether we have a customer.
  return json({ ok: true, sent, expiresInSeconds: OTP_TTL_SECONDS });
}

export function GET() {
  return NextResponse.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
}
