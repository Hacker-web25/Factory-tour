/**
 * POST /api/notify-new-device
 *
 * Sends a "new device signed in" email alert to the user. Uses Resend
 * (https://resend.com) when RESEND_API_KEY + RESEND_FROM are set in the
 * environment. If either is missing, the route LOGS the alert and
 * returns success — so this is safe to deploy before you've wired up
 * an email provider.
 *
 * Env vars:
 *   RESEND_API_KEY   — Resend account API key (secret)
 *   RESEND_FROM      — "VPV Alerts <alerts@myvpv.com>"
 *
 * Payload: { email, fullName, deviceFingerprint, userAgent }
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Payload = {
  email?: string;
  fullName?: string | null;
  deviceFingerprint?: string;
  userAgent?: string;
};

export async function POST(req: Request) {
  let body: Payload = {};
  try {
    body = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ ok: false, error: "bad payload" }, { status: 400 });
  }

  const { email, fullName, deviceFingerprint, userAgent } = body;
  if (!email || !deviceFingerprint) {
    return NextResponse.json({ ok: false, error: "missing fields" }, { status: 400 });
  }

  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;

  if (!key || !from) {
    // Soft fallback — email provider not configured yet. We still
    // return ok so the login flow doesn't surface a spurious error.
    console.log(
      "[notify-new-device] RESEND not configured; alert not sent:",
      { email, deviceFingerprint, userAgent }
    );
    return NextResponse.json({ ok: true, sent: false, reason: "no-provider" });
  }

  const safeName = (fullName || "there").replace(/[<>]/g, "");
  const safeUA = (userAgent || "Unknown browser").replace(/[<>]/g, "");
  const fpTail = deviceFingerprint.slice(-12);
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
        Your VPV account (<strong>${email}</strong>) was just signed in from a
        device we haven't seen before.
      </p>
      <table style="width: 100%; background: #f8fafc; border: 1px solid #e2e8f0;
                    border-radius: 10px; padding: 14px; margin: 0 0 18px;
                    border-collapse: separate; border-spacing: 0;">
        <tr>
          <td style="font-size: 11px; color: #64748b; padding: 2px 0;">Browser</td>
          <td style="font-size: 13px; color: #0f172a; padding: 2px 0; text-align: right;">${safeUA}</td>
        </tr>
        <tr>
          <td style="font-size: 11px; color: #64748b; padding: 2px 0;">When</td>
          <td style="font-size: 13px; color: #0f172a; padding: 2px 0; text-align: right;">${when}</td>
        </tr>
        <tr>
          <td style="font-size: 11px; color: #64748b; padding: 2px 0;">Device ID</td>
          <td style="font-size: 11px; color: #0f172a; padding: 2px 0; text-align: right;
                     font-family: ui-monospace, monospace;">…${fpTail}</td>
        </tr>
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
      console.warn("[notify-new-device] Resend returned", resp.status, text);
    }
    return NextResponse.json({ ok, sent: ok });
  } catch (e) {
    console.error("[notify-new-device] send failed:", e);
    return NextResponse.json({ ok: false, sent: false }, { status: 500 });
  }
}
