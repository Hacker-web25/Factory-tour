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
 * Safety rules (the old version broke the last two):
 *   • owner-only, rate limited, body-size capped
 *   • an e-mail is matched EXACTLY (no LIKE wildcards)
 *   • an existing account is attached only if it belongs to NO organisation;
 *     it is never moved out of another customer's workspace
 *   • any failure part-way removes what this call created, so a retry
 *     starts clean instead of colliding with a half-built workspace
 *
 * Request  { company, adminEmail, adminName, plan, scenes?, supportMonths?, state?, note? }
 *   state    the customer's state (decides the CGST+SGST / IGST split on later
 *            invoices). Optional here; if it is left out the customer is asked
 *            once, at their first top-up or renewal.
 * Response { ok, slug, email, tempPassword }   ← show the password ONCE
 */

import crypto from "node:crypto";
import { authenticateRequest } from "@/lib/server/requestAuth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { emailShell, esc, sendEmail } from "@/lib/server/email";
import { billingRateLimit, clean, fail, json, readJson, validEmail } from "@/lib/server/billingGuard";
import { isPlanId, clampScenes } from "@/lib/pricing";
import { COMPANY } from "@/lib/company";
import { RESERVED_SLUGS, slugify } from "@/lib/slugs";
import { canonicalIndianState } from "@/lib/indianStates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readablePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const group = () =>
    Array.from({ length: 4 }, () => alphabet[crypto.randomInt(0, alphabet.length)]).join("");
  return `${group()}-${group()}-${group()}`;
}

/** Add whole months without the "31 January + 1 month = 3 March" overflow. */
function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

export async function POST(req: Request) {
  const auth = await authenticateRequest(req);
  if (!auth) return fail(401, "unauthorized");
  if (auth.profile.role !== "owner") return fail(403, "forbidden", "Platform owner only.");

  const sb = supabaseAdmin();
  if (!sb) return fail(503, "not_configured", "SUPABASE_SERVICE_ROLE_KEY is not set.");

  const rl = await billingRateLimit(sb, `admin-provision:${auth.profile.id}`, 30, 3600);
  if (!rl.allowed) return fail(429, "rate_limited", undefined, { "Retry-After": String(rl.retryAfter || 60) });

  const parsed = await readJson(req, 8 * 1024);
  if (!parsed.ok) return fail(parsed.status, parsed.error);
  const body = parsed.body;

  const company = clean(body.company, 160);
  const adminEmail = clean(body.adminEmail, 254).toLowerCase();
  const adminName = clean(body.adminName, 120) || company;
  const plan = isPlanId(body.plan) ? body.plan : "basic";
  const note = clean(body.note, 500) || null;
  const supportMonths = Number.isFinite(Number(body.supportMonths))
    ? Math.max(0, Math.min(60, Math.round(Number(body.supportMonths))))
    : 12;
  const scenes = plan === "basic" ? clampScenes(Number(body.scenes ?? 2)) : null;

  const stateRaw = clean(body.state, 60);
  const billingState = stateRaw ? canonicalIndianState(stateRaw) : null;

  if (!company) return fail(400, "missing_company", "Company name is required.");
  if (stateRaw && !billingState) return fail(400, "bad_state", "That state is not one we recognise. Pick it from the list.");
  if (!validEmail(adminEmail)) return fail(400, "bad_email", "That admin e-mail does not look right.");

  const supportUntil = supportMonths > 0 ? addMonths(new Date(), supportMonths).toISOString() : null;

  /* ── Does this e-mail already have a login? ─────────────────────── */
  const { data: existingId, error: findErr } = await sb.rpc("billing_find_auth_user", { p_email: adminEmail });
  if (findErr) return fail(500, "lookup_failed", "Could not check for an existing account.");

  let userId: string | null = (existingId as string | null) ?? null;
  let createdUser = false;
  let tempPassword: string | null = null;

  if (userId) {
    const { data: prof } = await sb.from("profiles").select("org_id, role").eq("id", userId).maybeSingle();
    if (prof?.org_id || prof?.role === "owner") {
      return fail(
        409,
        "email_in_use",
        "That e-mail already belongs to another workspace. Use a different admin e-mail; accounts are never moved between workspaces."
      );
    }
  }

  /* ── Organisation (retry on slug collision, no check-then-insert race) */
  const base = slugify(company);
  let org: { id: string; slug: string } | null = null;
  for (let i = 0; i < 10 && !org; i++) {
    const candidate = i === 0 ? base : i < 8 ? `${base}-${crypto.randomInt(100, 999)}` : `${base}-${crypto.randomBytes(3).toString("hex")}`;
    if (RESERVED_SLUGS.has(candidate)) continue;
    const { data, error } = await sb
      .from("organizations")
      .insert({
        name: company,
        slug: candidate,
        plan,
        scene_quota: scenes,
        basic_scene_cap: scenes ? Math.min(10, Math.max(1, scenes)) : 2,
        plan_status: "active",
        support_until: supportUntil,
        activated_at: new Date().toISOString(),
        billing_email: adminEmail,
        billing_name: company,
        billing_state: billingState,
      })
      .select("id, slug")
      .single();
    if (!error && data) {
      org = data as { id: string; slug: string };
    } else if ((error as { code?: string } | null)?.code !== "23505") {
      return fail(500, "org_failed", "Could not create the organisation.");
    }
  }
  if (!org) return fail(500, "org_failed", "Could not find a free workspace address. Try a slightly different company name.");

  const undo = async () => {
    // Remove only what THIS call created.
    await sb.from("plan_events").delete().eq("org_id", org!.id);
    await sb.from("profiles").update({ org_id: null }).eq("org_id", org!.id);
    await sb.from("organizations").delete().eq("id", org!.id);
    if (createdUser && userId) await sb.auth.admin.deleteUser(userId).catch(() => undefined);
  };

  /* ── Admin login ────────────────────────────────────────────────── */
  if (!userId) {
    tempPassword = readablePassword();
    const { data: created, error: userErr } = await sb.auth.admin.createUser({
      email: adminEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: adminName, org_slug: org.slug },
    });
    if (userErr || !created?.user?.id) {
      await undo();
      return fail(500, "user_failed", "Could not create the admin login.");
    }
    userId = created.user.id;
    createdUser = true;
  }

  const { error: profileErr } = await sb.from("profiles").upsert(
    { id: userId, email: adminEmail, full_name: adminName, role: "org_admin", org_id: org.id },
    { onConflict: "id" }
  );
  if (profileErr) {
    await undo();
    return fail(500, "profile_failed", "Could not set up the admin profile.");
  }

  await sb.from("plan_events").insert({
    org_id: org.id,
    event: "provisioned",
    to_plan: plan,
    to_quota: scenes,
    support_until: supportUntil,
    actor: `owner:${auth.profile.id}`,
    note: note ?? "Created from the admin panel",
  });

  /* ── Welcome e-mail (best effort — the owner also sees the password) */
  const workspace = `https://${org.slug}.myvpv.com`;
  // No BCC: this message carries the first password (see billingEmails.ts).
  await sendEmail({
    to: adminEmail,
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
    )
  }).catch(() => undefined);

  return json({
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
