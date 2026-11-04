/**
 * lib/server/inboxMailer.ts — the two doors of the VPV Inbox. SERVER ONLY.
 *
 *   in   Resend "receiving" posts a signed webhook (metadata only) when mail
 *        arrives at support@myvpv.com; we check the signature, then ask
 *        Resend for the body and headers.
 *   out  replies and the automatic acknowledgement go out through the Resend
 *        API as support@myvpv.com.
 *
 * Env: RESEND_API_KEY (already set for invoices and sign-in codes),
 *      RESEND_WEBHOOK_SECRET (the "whsec_…" signing secret of the webhook).
 */

import crypto from "node:crypto";

/* ───────────────────────── webhook signature ───────────────────────── */

const TOLERANCE_SECONDS = 5 * 60;

/**
 * Resend signs webhooks with Svix: HMAC-SHA256 over `${id}.${timestamp}.${body}`
 * using the base64 part of the "whsec_…" secret. The header can hold several
 * space-separated "v1,<signature>" entries (a secret being rotated).
 */
export function verifyWebhook(
  rawBody: string,
  headers: { get(name: string): string | null },
  secret: string | undefined,
  nowMs = Date.now()
): boolean {
  if (!secret) return false;
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sigHeader = headers.get("svix-signature");
  if (!id || !ts || !sigHeader) return false;

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  if (Math.abs(nowMs / 1000 - tsNum) > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = crypto.createHmac("sha256", key).update(`${id}.${ts}.${rawBody}`).digest();

  for (const part of sigHeader.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    let given: Buffer;
    try {
      given = Buffer.from(sig, "base64");
    } catch {
      continue;
    }
    if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) return true;
  }
  return false;
}

/* ───────────────────────── received mail ───────────────────────── */

export type ReceivedMail = {
  id: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  html: string;
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
  headers: Record<string, unknown>;
  attachments: { filename: string; contentType: string; size: number | null }[];
};

/* eslint-disable @typescript-eslint/no-explicit-any */

function strList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === "string" && v) return [v];
  return [];
}

function headerOf(h: Record<string, unknown>, name: string): string | null {
  for (const [k, v] of Object.entries(h)) {
    if (k.toLowerCase() === name) return String(Array.isArray(v) ? v.join(" ") : v ?? "") || null;
  }
  return null;
}

/** Fetch the body of a received message. Returns null when Resend cannot give it. */
export async function fetchReceivedEmail(emailId: string): Promise<ReceivedMail | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !/^[A-Za-z0-9_-]{6,80}$/.test(emailId)) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
      method: "GET",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    const d: any = await res.json();
    const headers: Record<string, unknown> =
      d.headers && typeof d.headers === "object" && !Array.isArray(d.headers) ? d.headers : {};
    return {
      id: String(d.id ?? emailId),
      from: String(d.from ?? ""),
      to: strList(d.to),
      cc: strList(d.cc),
      subject: String(d.subject ?? ""),
      text: String(d.text ?? ""),
      html: String(d.html ?? ""),
      messageId: (d.message_id ? String(d.message_id) : null) ?? headerOf(headers, "message-id"),
      inReplyTo: headerOf(headers, "in-reply-to"),
      references: headerOf(headers, "references"),
      headers,
      attachments: Array.isArray(d.attachments)
        ? d.attachments.slice(0, 20).map((a: any) => ({
            filename: String(a?.filename ?? "file").slice(0, 200),
            contentType: String(a?.content_type ?? a?.contentType ?? "application/octet-stream").slice(0, 100),
            size: Number.isFinite(Number(a?.size)) ? Number(a.size) : null,
          }))
        : [],
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ───────────────────────── sending ───────────────────────── */

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

/** Header values must be one line; a customer's Message-ID is untrusted. */
function oneLine(v: string): string {
  return v.replace(/[\r\n\u2028\u2029]+/g, " ").trim().slice(0, 1000);
}

export async function sendMail(args: {
  fromName: string;
  fromAddress: string;
  to: string;
  cc?: string[];
  subject: string;
  text: string;
  html: string;
  inReplyTo?: string | null;
  references?: string | null;
  /** Mark robot-sent mail (the acknowledgement) so other auto-responders stay quiet. */
  automatic?: boolean;
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set." };

  const headers: Record<string, string> = {};
  if (args.inReplyTo) headers["In-Reply-To"] = oneLine(args.inReplyTo);
  if (args.references) headers["References"] = oneLine(args.references);
  if (args.automatic) {
    headers["Auto-Submitted"] = "auto-replied";
    headers["X-Auto-Response-Suppress"] = "All";
    headers["Precedence"] = "auto_reply";
  }

  const fromName = args.fromName.replace(/["<>\r\n]/g, "").trim() || "VPV Support";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${fromName} <${args.fromAddress}>`,
        to: [args.to],
        ...(args.cc && args.cc.length ? { cc: args.cc } : {}),
        reply_to: args.fromAddress,
        subject: args.subject,
        html: args.html,
        text: args.text,
        ...(Object.keys(headers).length ? { headers } : {}),
      }),
    });
    if (!res.ok) {
      let detail = "";
      try {
        detail = String(((await res.json()) as any)?.message ?? "");
      } catch {
        /* intentional — the error body is optional */
      }
      return { ok: false, error: `Resend ${res.status}${detail ? `: ${detail}` : ""}`.slice(0, 300) };
    }
    const d: any = await res.json().catch(() => ({}));
    return { ok: true, id: String(d?.id ?? "") };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.name === "AbortError" ? "Resend timed out." : "Could not reach Resend." };
  } finally {
    clearTimeout(timer);
  }
}
