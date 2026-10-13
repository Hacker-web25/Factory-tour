/**
 * POST /api/report-abuse
 *
 * Anyone can POST { tourId?, token?, reason, email? } to report a
 * shared tour as abusive (phishing, impersonation, stolen content,
 * illegal material). We stash the report in the security_audit_log
 * and return 200 — no acknowledgement about whether we acted, to
 * avoid giving an attacker a signal.
 *
 * Hard-rate-limited: 3 reports per IP per hour. Prevents using this
 * endpoint as a DoS vector against the audit log.
 */

import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rateLimit";
import { getClientIp, getClientCountry } from "@/lib/getClientIp";
import { logSecurityEvent } from "@/lib/audit";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 4 * 1024;

type Payload = {
  tourId?: string;
  token?: string;
  reason?: string;
  email?: string;
};

export async function POST(req: Request) {
  const ip = getClientIp(req.headers);
  const country = getClientCountry(req.headers);

  const rl = await enforceRateLimit(`report-abuse:ip:${ip}`, 3, 3600);
  if (!rl.allowed) {
    return new NextResponse(
      JSON.stringify({ ok: false, error: "rate_limited" }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(rl.retryAfter),
        },
      }
    );
  }

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: "payload_too_large" },
      { status: 413 }
    );
  }

  let body: Payload = {};
  try {
    body = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_payload" }, { status: 400 });
  }

  const { tourId, token, reason, email } = body;
  if (!reason || typeof reason !== "string" || reason.length < 10 || reason.length > 2000) {
    return NextResponse.json({ ok: false, error: "invalid_reason" }, { status: 400 });
  }

  await logSecurityEvent({
    event: "share_link.blocked",
    subject: tourId ?? token ?? null,
    ip,
    userAgent: req.headers.get("user-agent"),
    meta: {
      kind: "abuse-report",
      reason: reason.slice(0, 2000),
      reporter_email: email ? String(email).slice(0, 320) : null,
      country,
    },
  });

  return NextResponse.json({ ok: true });
}
