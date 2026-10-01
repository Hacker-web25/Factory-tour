"use client";

/**
 * Fire-and-forget wrapper that pings our Next API route to send the
 * "new device signed in" email. The API route silently no-ops when
 * RESEND_API_KEY isn't configured, so this is safe to call before you
 * wire up the email provider.
 */

import { shortUserAgent } from "@/lib/deviceFingerprint";

export async function notifyNewDevice(args: {
  email: string;
  fullName: string | null;
  deviceFingerprint: string;
}): Promise<void> {
  try {
    await fetch("/api/notify-new-device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: args.email,
        fullName: args.fullName,
        deviceFingerprint: args.deviceFingerprint,
        userAgent: shortUserAgent(),
      }),
      keepalive: true,
    });
  } catch {
    /* ignore — the email alert is best-effort, not blocking */
  }
}
