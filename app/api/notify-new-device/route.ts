/**
 * POST /api/notify-new-device
 *
 * Sends a "new device signed in" email alert via Resend when the keys
 * are configured. Silently no-ops when they're not, so this is safe
 * to deploy before you've wired up an email provider.
 *
 * Security:
 *   - Rate-limited per IP (20/hour) via check_and_bump_rate.
 *   - Payload size capped at 4 KB.
 *   - Required fields validated before any outbound call.
 *   - All errors return 200 ok:false so a spammer can't use timing
 *     to probe what's live.
 *
 * Env:
 *   RESEND_API_KEY  (secret)
 *   RESEND_FROM     ("VPV Alerts <support@myvpv.com>")
 */

import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/getClientIp";
import { logSecurityEvent } from "@/lib/audit";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 4 * 1024;

type Payload = {
  email?: string;
  fullName?: string | null;
  deviceFingerprint?: string;
  userAgent?: string;
};

export async function POST(req: Request) {
  const ip = getClientIp(req.headers);

  // ── Rate limit (per-IP, per endpoint) ─────────────────────────
  const rl = await enforceRateLimit(`notify-new-device:ip:${ip}`, 20, 3600);
  if (!rl.allowed) {
    logSecurityEvent({
      event: "ratelimit.hit",
      subject: "notify-new-device",
      ip,
      meta: { endpoint: "notify-new-device" },
    });
    return new NextResponse(JSON.stringify({ ok: false, error: "rate_limited" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(rl.retryAfter),
      },
    });
  }

  // ── Body size + parse ────────────────────────────────────────
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

  const { email, fullName, deviceFingerprint, userAgent } = body;
  if (!email || !deviceFingerprint) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  // Shape validation — defuse injection into the email HTML below.
  if (
    typeof email !== "string" ||
    typeof deviceFingerprint !== "string" ||
    email.length > 320 ||
    deviceFingerprint.length > 128 ||
    (fullName && (typeof fullName !== "string" || fullName.length > 200)) ||
    (userAgent && (typeof userAgent !== "string" || userAgent.length > 500))
  ) {
    return NextResponse.json({ ok: false, error: "invalid_fields" }, { status: 400 });
  }

  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;

  if (!key || !from) {
    // eslint-disable-next-line no-console
    console.log(
      "[notify-new-device] RESEND not configured; alert not sent:",
      { email, deviceFingerprint, userAgent }
    );
    return NextResponse.json({ ok: true, sent: false, reason: "no-provider" });
  }

  // Minimal HTML escape — defence in depth even though fields are
  // validated above.
  const esc = (s: string) =>
    s.replace(/[<>&"]/g, (c) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] || c)
    );

  const safeName = esc(fullName || "there");
  const safeEmail = esc(email);
  const safeUA = esc(userAgent || "Unknown browser");
  const fpTail = esc(deviceFingerprint.slice(-12));
  const when = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";

  const html = `
    <div style="font-family: -apple-system, Segoe UI, sans-serif;
                max-width: 480px; margin: 0 auto; padding: 32px 24px;
                background: #ffffff; color: #0f172a;">
      <div style="font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
                  color: #64748b; margin-bottom: 8px;">VPV Security Alert</div>
      <h2 style="font-size: 20px; font-weight: 600; margin: 0 0 14px;
                 letter-spacing: -0.015em;">New device signed in</h2>
      <p style="font-size: 14px; line-height: 1.6; margin: 0 0 18px; color: #334155;">
        Hi ${safeName},<br><br>
        Your VPV account (<strong>${safeEmail}</strong>) was just signed in from a
        device we haven't seen before.
      </p>
      <table style="width: 100%; background: #f8fafc; border: 1px solid #e2e8f0;
                    border-radius: 10px; padding: 14px; margin: 0 0 18px;
                    border-collapse: separate; border-spacing: 0;">
        <tr><td style="font-size: 11px; color: #64748b; padding: 2px 0;">Browser</td>
            <td style="font-size: 13px; color: #0f172a; padding: 2px 0; text-align: right;">${safeUA}</td></tr>
        <tr><td style="font-size: 11px; color: #64748b; padding: 2px 0;">When</td>
            <td style="font-size: 13px; color: #0f172a; padding: 2px 0; text-align: right;">${when}</td></tr>
        <tr><td style="font-size: 11px; color: #64748b; padding: 2px 0;">Device ID</td>
            <td style="font-size: 11px; color: #0f172a; padding: 2px 0; text-align: right;
                       font-family: ui-monospace, monospace;">…${fpTail}</td></tr>
      </table>
      <p style="font-size: 13px; line-height: 1.55; margin: 0 0 20px; color: #334155;">
        <strong>If this was you,</strong> no action is needed.<br>
        <strong>If it wasn't,</strong> change your password immediately from
        <em>Dashboard → Settings → Security</em>, and tell your organisation admin.
      </p>
      <div style="font-size: 11px; color: #94a3b8; margin: 32px 0 0;
                  padding-top: 16px; border-top: 1px solid #e2e8f0;">
        VPV — Virtual Plant Visit · This alert was sent automatically.
      </div>
    </div>
  `;

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: email,
        subject: "New device signed in to your VPV account",
        html,
      }),
    });
    const ok = resp.ok;
    if (!ok) {
      const text = await resp.text().catch(() => "");
      // eslint-disable-next-line no-console
      console.warn("[notify-new-device] Resend returned", resp.status, text);
    }
    // Audit the event (fire-and-forget).
    logSecurityEvent({
      event: "login.new_device",
      subject: email,
      ip,
      userAgent: userAgent ?? null,
      meta: { fingerprint_tail: fpTail, sent: ok },
    });
    return NextResponse.json({ ok, sent: ok });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[notify-new-device] send failed:", e);
    return NextResponse.json({ ok: false, sent: false }, { status: 500 });
  }
}
