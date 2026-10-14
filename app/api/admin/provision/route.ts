/**
 * POST /api/admin/provision   —  platform owner only.
 *
 * This is the SQL you run by hand today, turned into a button. Give it a
 * company name, an admin e-mail and a plan, and it creates:
 *
 *   • the organisation, with a free subdomain slug
 *   • the admin's login, with a password you can read out
 *   • the plan, the scene quota and the support expiry
 *   • an audit row in plan_events saying you did it and why
 *
 * Use it for Pro and Ultra customers, who pay you outside the website,
 * and for anyone you are setting up by hand. Basic customers who buy
 * online are provisioned automatically by the Razorpay webhook instead.
 *
 * Request  { company, adminEmail, adminName, plan, scenes?, supportMonths?, note? }
 * Response { ok, slug, email, tempPassword }   ← show the password ONCE
 */

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { authenticateRequest } from "@/lib/server/requestAuth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { emailShell, esc, sendEmail } from "@/lib/server/email";
import { isPlanId, clampScenes } from "@/lib/pricing";
import { COMPANY } from "@/lib/company";
import { RESERVED_SLUGS, slugify } from "@/lib/slugs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readablePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const group = () =>
    Array.from({ length: 4 }, () => alphabet[crypto.randomInt(0, alphabet.length)]).join("");
  return `${group()}-${group()}-${group()}`;
}

function fail(status: number, error: string, message?: string) {
  return NextResponse.json({ ok: false, error, message }, { status });
}

export async function POST(req: Request) {
  const auth = await authenticateRequest(req);
  if (!auth) return fail(401, "unauthorized");
  if (auth.profile.role !== "owner") return fail(403, "forbidden", "Platform owner only.");

  const sb = supabaseAdmin();
  if (!sb) return fail(503, "not_configured", "SUPABASE_SERVICE_ROLE_KEY is not set.");

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail(400, "bad_payload");
  }

  const company = String(body.company ?? "").trim().slice(0, 160);
  const adminEmail = String(body.adminEmail ?? "").trim().toLowerCase().slice(0, 254);
  const adminName = String(body.adminName ?? "").trim().slice(0, 120) || company;
  const plan = isPlanId(body.plan) ? body.plan : "basic";
  const note = String(body.note ?? "").trim().slice(0, 500) || null;
  const supportMonths = Number.isFinite(Number(body.supportMonths))
    ? Math.max(0, Math.min(60, Math.round(Number(body.supportMonths))))
    : 12;
  const scenes =
    plan === "basic" ? clampScenes(Number(body.scenes ?? 2)) : null;

  if (!company) return fail(400, "missing_company", "Company name is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(adminEmail)) {
    return fail(400, "bad_email", "That admin e-mail does not look right.");
  }

  // ── Unique slug ────────────────────────────────────────────────
  const base = slugify(company);
  // Default is a guaranteed-unique, non-reserved fallback; the loop below
  // replaces it with the nicest free name it can find.
  let slug = `${base}-${crypto.randomBytes(3).toString("hex")}`;
  for (let i = 0; i < 8; i++) {
    const candidate = i === 0 ? base : `${base}-${crypto.randomInt(100, 999)}`;
    if (RESERVED_SLUGS.has(candidate)) continue;
    const { data: taken } = await sb
      .from("organizations")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!taken) {
      slug = candidate;
      break;
    }
  }

  const supportUntil =
    supportMonths > 0
      ? new Date(new Date().setMonth(new Date().getMonth() + supportMonths)).toISOString()
      : null;

  // ── Organisation ───────────────────────────────────────────────
  const { data: org, error: orgErr } = await sb
    .from("organizations")
    .insert({
      name: company,
      slug,
      plan,
      scene_quota: scenes,
      basic_scene_cap: scenes ? Math.min(10, Math.max(1, scenes)) : 2,
      plan_status: "active",
      support_until: supportUntil,
      activated_at: new Date().toISOString(),
      billing_email: adminEmail,
      billing_name: company,
    })
    .select("id, slug")
    .single();
  if (orgErr || !org) return fail(500, "org_failed", "Could not create the organisation.");

  // ── Admin login ────────────────────────────────────────────────
  let tempPassword: string | null = readablePassword();
  const { data: created, error: userErr } = await sb.auth.admin.createUser({
    email: adminEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: adminName, org_slug: org.slug },
  });

  let userId = created?.user?.id ?? null;
  if (userErr || !userId) {
    // The e-mail already has an account — attach it instead of failing.
    const { data: existing } = await sb
      .from("profiles")
      .select("id")
      .ilike("email", adminEmail)
      .maybeSingle();
    userId = (existing?.id as string) ?? null;
    tempPassword = null;
    if (!userId) {
      await sb.from("organizations").delete().eq("id", org.id);
      return fail(500, "user_failed", "Could not create the admin login.");
    }
  }

  const { error: profileErr } = await sb.from("profiles").upsert(
    {
      id: userId,
      email: adminEmail,
      full_name: adminName,
      role: "org_admin",
      org_id: org.id,
    },
    { onConflict: "id" }
  );
  if (profileErr) return fail(500, "profile_failed", "Could not set up the admin profile.");

  await sb.from("plan_events").insert({
    org_id: org.id,
    event: "provisioned",
    to_plan: plan,
    to_quota: scenes,
    support_until: supportUntil,
    actor: `owner:${auth.profile.id}`,
    note: note ?? "Created from the admin panel",
  });

  // ── Welcome e-mail ─────────────────────────────────────────────
  const workspace = `https://${org.slug}.myvpv.com`;
  await sendEmail({
    to: adminEmail,
    bcc: COMPANY.emails.founders,
    subject: "Your VPV workspace is ready",
    html: emailShell(
      "Welcome to VPV",
      `<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#334155;">
         Hello ${esc(adminName)}, your workspace for <strong>${esc(company)}</strong>
         is live on the <strong>${esc(plan)}</strong> plan.
       </p>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
              style="border:1px solid #e2e8f0;border-radius:12px;font-size:14px;color:#334155;">
         <tr><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;color:#64748b;">Sign in at</td>
             <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;text-align:right;">
               <a href="${esc(workspace)}" style="color:#1468D8;font-weight:600;">${esc(org.slug)}.myvpv.com</a></td></tr>
         <tr><td style="padding:12px 16px;${tempPassword ? "border-bottom:1px solid #e2e8f0;" : ""}color:#64748b;">Your e-mail</td>
             <td style="padding:12px 16px;${tempPassword ? "border-bottom:1px solid #e2e8f0;" : ""}text-align:right;">${esc(adminEmail)}</td></tr>
         ${
           tempPassword
             ? `<tr><td style="padding:12px 16px;color:#64748b;">First password</td>
                    <td style="padding:12px 16px;text-align:right;font-family:ui-monospace,Menlo,monospace;font-weight:700;letter-spacing:0.04em;color:#0C1017;">${esc(tempPassword)}</td></tr>`
             : ""
         }
       </table>
       <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#64748b;">
         ${tempPassword ? "Please change this password the first time you sign in." : "Sign in with your existing VPV password."}
         Any questions, write to <a href="mailto:${esc(COMPANY.emails.support)}" style="color:#1468D8;">${esc(COMPANY.emails.support)}</a>.
       </p>`
    ),
  });

  return NextResponse.json({
    ok: true,
    orgId: org.id,
    slug: org.slug,
    email: adminEmail,
    // Shown once in the admin screen so you can read it out if the
    // e-mail is slow. It is not stored anywhere in plaintext.
    tempPassword,
    plan,
    scenes,
    supportUntil,
  });
}
