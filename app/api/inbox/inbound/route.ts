/**
 * POST /api/inbox/inbound — Resend telling us that mail has arrived at
 * support@myvpv.com. PUBLIC, but only a correctly signed request does anything.
 *
 *   1. SIGNATURE FIRST: the Svix HMAC over the raw body is checked before the
 *      body is parsed or the database is touched.
 *   2. The webhook carries only the message's id; the body and headers are
 *      fetched from Resend with our own key (so a forged id cannot inject text).
 *   3. Answering non-2xx makes Resend retry, so a failed fetch or a database
 *      hiccup is not a lost customer. The same message delivered twice is
 *      stored once (unique provider_id).
 *
 * Resend dashboard → Webhooks → Add:
 *   URL     https://myvpv.com/api/inbox/inbound
 *   Event   email.received
 *   Secret  copy the "whsec_…" value into RESEND_WEBHOOK_SECRET in Vercel
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { fail, json, readBody } from "@/lib/server/billingGuard";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { verifyWebhook } from "@/lib/server/inboxMailer";
import { processInbound } from "@/lib/server/inboxDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return fail(503, "not_configured", "RESEND_WEBHOOK_SECRET is not set.");

  const body = await readBody(req, 256 * 1024);
  if (!body.ok) return fail(body.status, body.error);
  if (!verifyWebhook(body.text, req.headers, secret)) return fail(401, "bad_signature");

  let event: any;
  try {
    event = JSON.parse(body.text);
  } catch {
    return fail(400, "bad_payload");
  }
  if (event?.type !== "email.received") return json({ ok: true, ignored: event?.type ?? "unknown" });
  const emailId = String(event?.data?.email_id ?? event?.data?.id ?? "");
  if (!emailId) return fail(400, "bad_payload", "No email id.");

  const sb = supabaseAdmin();
  if (!sb) return fail(503, "not_configured", "SUPABASE_SERVICE_ROLE_KEY is not set.");

  try {
    const r = await processInbound(sb, emailId);
    if (r.status === "fetch_failed") return fail(502, "fetch_failed", "Could not read the message from Resend; it will be retried.");
    return json({ ok: true, ...r });
  } catch (e) {
    console.error("[inbox] inbound failed", e instanceof Error ? e.message : e);
    return fail(500, "server_error");
  }
}
