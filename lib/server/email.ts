/**
 * Transactional e-mail through Resend. SERVER ONLY.
 *
 * Every function returns a boolean rather than throwing: a welcome
 * e-mail that fails to send must never roll back a payment that
 * succeeded. Failures are recorded on the order so you can re-send.
 *
 * Env: RESEND_API_KEY, RESEND_FROM ("VPV <support@myvpv.com>")
 */

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/** Escape anything that came from a customer before it meets our HTML. */
export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A file to send with the message — today, only the invoice PDF. */
export type EmailAttachment = {
  /** What the recipient's e-mail program will call it when they save it. */
  filename: string;
  content: Buffer;
  contentType?: string;
};

export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
  /** Plain-text twin of the HTML. Mail with both parts is filtered as
   *  less spammy than HTML alone, so OTP and invoice mail should pass it. */
  text?: string;
  replyTo?: string;
  bcc?: string;
  /** Resend takes attachments base64-encoded in the JSON body. The whole
   *  message, encoded, has to stay under about 40 MB; an invoice is tens
   *  of kilobytes, so there is nothing to guard against here. */
  attachments?: EmailAttachment[];
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const from = process.env.RESEND_FROM || "VPV <support@myvpv.com>";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [args.to],
        ...(args.bcc ? { bcc: [args.bcc] } : {}),
        ...(args.replyTo ? { reply_to: args.replyTo } : {}),
        subject: args.subject,
        html: args.html,
        ...(args.text ? { text: args.text } : {}),
        ...(args.attachments && args.attachments.length > 0
          ? {
              attachments: args.attachments.map((a) => ({
                filename: a.filename,
                content: a.content.toString("base64"),
                ...(a.contentType ? { content_type: a.contentType } : {}),
              })),
            }
          : {}),
      }),
    });
    if (!res.ok) {
      // Say WHY in the Vercel logs (no secrets): an unverified sending
      // domain, a bad key and a rate limit all look alike to a customer.
      let why = "";
      try {
        const body = (await res.json()) as { message?: string; name?: string };
        why = `${body.name ?? ""} ${body.message ?? ""}`.trim();
      } catch {
        /* body was not JSON */
      }
      // eslint-disable-next-line no-console
      console.error(`[email] Resend refused the message (HTTP ${res.status}) from "${from}": ${why}`);
    }
    return res.ok;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[email] could not reach Resend:", e instanceof Error ? e.message : e);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Shared shell so every VPV e-mail looks like it came from one company. */
export function emailShell(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f8fd;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f8fd;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;font-family:Inter,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <tr><td style="background:linear-gradient(120deg,#0B3D91,#1468D8 52%,#19B8F2);padding:22px 28px;">
    <div style="color:#fff;font-size:17px;font-weight:600;letter-spacing:-0.01em;">VPV — Virtual Plant Visit</div>
  </td></tr>
  <tr><td style="padding:28px;">
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#0C1017;font-weight:600;">${esc(title)}</h1>
    ${bodyHtml}
  </td></tr>
  <tr><td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6;">
    Operated by The Next Design ·
    <a href="https://myvpv.com/terms" style="color:#1468D8;">Terms</a> ·
    <a href="https://myvpv.com/privacy" style="color:#1468D8;">Privacy</a> ·
    <a href="https://myvpv.com/refund-policy" style="color:#1468D8;">Refunds</a>
  </td></tr>
</table></td></tr></table></body></html>`;
}
