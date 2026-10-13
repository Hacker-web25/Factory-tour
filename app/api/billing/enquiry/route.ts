/**
 * POST /api/billing/enquiry
 *
 * The "let's talk" form behind Pro and Ultra. These are large recurring
 * amounts that nobody pays from a web page without a conversation, so
 * instead of a checkout we capture the enquiry, store it and e-mail it
 * to the founders' inbox. The reply and the payment link happen by
 * hand, and the plan is switched on from /admin/customers.
 *
 * Request  { plan, name, company, email, phone?, message?, scenes? }
 */

import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/getClientIp";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { emailShell, esc, sendEmail } from "@/lib/server/email";
import { COMPANY } from "@/lib/company";
import { isPlanId } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max);
}

export async function POST(req: Request) {
  const ip = getClientIp(req.headers);
  const rl = await enforceRateLimit(`billing-enquiry:ip:${ip}`, 6, 3600);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", message: "You have sent this a few times already. Please e-mail us directly." },
      { status: 429 }
    );
  }
  if (Number(req.headers.get("content-length") || "0") > 8192) {
    return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_payload" }, { status: 400 });
  }

  const plan = isPlanId(body.plan) ? body.plan : null;
  const name = clean(body.name, 120);
  const company = clean(body.company, 160);
  const email = clean(body.email, 254).toLowerCase();
  const phone = clean(body.phone, 20);
  const message = clean(body.message, 2000);
  const scenes = Number.isFinite(Number(body.scenes)) ? Math.round(Number(body.scenes)) : null;

  if (!name || !company) {
    return NextResponse.json({ ok: false, error: "missing_fields", message: "Please give your name and company." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ ok: false, error: "bad_email", message: "That e-mail address does not look right." }, { status: 400 });
  }

  const sb = supabaseAdmin();
  if (sb) {
    await sb.from("sales_enquiries").insert({
      plan,
      name,
      company,
      email,
      phone: phone || null,
      message: message || null,
      scenes_hint: scenes && scenes > 0 && scenes < 1000 ? scenes : null,
      client_ip: ip,
    });
  }

  // Tell the team. `replyTo` means a reply goes straight to the customer.
  await sendEmail({
    to: COMPANY.emails.founders,
    replyTo: email,
    subject: `VPV enquiry — ${company}${plan ? ` (${plan})` : ""}`,
    html: emailShell(
      "New enquiry",
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
              style="border:1px solid #e2e8f0;border-radius:12px;font-size:14px;color:#334155;">
         <tr><td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;color:#64748b;">Plan</td>
             <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;text-align:right;">${esc(plan ?? "not stated")}</td></tr>
         <tr><td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;color:#64748b;">Name</td>
             <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;text-align:right;">${esc(name)}</td></tr>
         <tr><td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;color:#64748b;">Company</td>
             <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;text-align:right;">${esc(company)}</td></tr>
         <tr><td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;color:#64748b;">E-mail</td>
             <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;text-align:right;">${esc(email)}</td></tr>
         <tr><td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;color:#64748b;">Phone</td>
             <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;text-align:right;">${esc(phone || "—")}</td></tr>
         <tr><td style="padding:10px 16px;color:#64748b;">Scenes</td>
             <td style="padding:10px 16px;text-align:right;">${esc(scenes ?? "—")}</td></tr>
       </table>
       ${message ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.7;color:#334155;white-space:pre-wrap;">${esc(message)}</p>` : ""}`
    ),
  });

  // And acknowledge to the customer, so they know it landed.
  await sendEmail({
    to: email,
    replyTo: COMPANY.emails.founders,
    subject: "We have your VPV enquiry",
    html: emailShell(
      "Thank you — we will be in touch",
      `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">
         Hello ${esc(name)}, thank you for your interest in VPV. A person from
         our team will reply within two business days with a written
         proposal for ${esc(company)}.
       </p>
       <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
         If it is urgent, write to
         <a href="mailto:${esc(COMPANY.emails.founders)}" style="color:#1468D8;">${esc(COMPANY.emails.founders)}</a>.
       </p>`
    ),
  });

  return NextResponse.json({ ok: true });
}
