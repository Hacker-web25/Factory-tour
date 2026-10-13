/**
 * What happens after money arrives. SERVER ONLY.
 *
 * One entry point — `fulfilOrder(orderId)` — which is called by both the
 * Razorpay webhook and the browser's success callback. It is
 * IDEMPOTENT: whichever arrives first does the work, the other finds
 * `provisioned_at` already set and returns immediately. That matters,
 * because Razorpay retries webhooks and customers refresh success pages.
 *
 * What it does, by purpose:
 *
 *   basic_licence    creates the organisation, its admin login and its
 *                    subdomain; sets the scene quota to what was bought;
 *                    starts the FREE first year of technical support;
 *                    issues a GST invoice; e-mails the welcome and the
 *                    invoice. This replaces the SQL you run by hand.
 *
 *   scene_topup      raises the existing org's scene quota.
 *
 *   support_renewal  extends support by one year from whichever is
 *                    later: today, or the current expiry (so renewing
 *                    early never loses the customer any days).
 *
 * Pro and Ultra never come through here — they are agreed in
 * conversation and switched on from /admin/customers.
 */

import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { emailShell, esc, sendEmail } from "@/lib/server/email";
import { fromPaise, inr, inr2, GST_RATE, SAC_CODE, SUPPORT_FREE_MONTHS } from "@/lib/pricing";
import { COMPANY } from "@/lib/company";

export type OrderRow = {
  id: string;
  razorpay_order_id: string | null;
  purpose: "basic_licence" | "support_renewal" | "scene_topup";
  scenes: number | null;
  amount_paise: number;
  taxable_paise: number | null;
  gst_paise: number | null;
  status: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string | null;
  buyer_company: string;
  buyer_gstin: string | null;
  buyer_address: string | null;
  buyer_state: string | null;
  org_id: string | null;
  provisioned_at: string | null;
};

/* ───────────────────────────── helpers ───────────────────────────── */

function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return s || "plant";
}

/** Subdomains the routing layer reserves — an org can never take one. */
const RESERVED_SLUGS = new Set([
  "www", "app", "api", "admin", "auth", "cdn", "static", "assets",
  "mail", "email", "docs", "help", "support", "blog", "status",
  "login", "dashboard", "apply", "billing", "pay", "checkout",
]);

async function uniqueSlug(sb: SupabaseClient, name: string): Promise<string> {
  const base = slugify(name);
  const candidates = [base, ...Array.from({ length: 6 }, () => `${base}-${crypto.randomInt(100, 999)}`)];
  for (const c of candidates) {
    if (RESERVED_SLUGS.has(c)) continue;
    const { data } = await sb.from("organizations").select("id").eq("slug", c).maybeSingle();
    if (!data) return c;
  }
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

/**
 * A first password the customer can actually read out over the phone:
 * no look-alike characters, four groups of four. They are told to
 * change it, and the dashboard asks them to.
 */
function readablePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = () =>
    Array.from({ length: 4 }, () => alphabet[crypto.randomInt(0, alphabet.length)]).join("");
  return `${pick()}-${pick()}-${pick()}`;
}

function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d;
}

/* ───────────────────────────── invoice ───────────────────────────── */

/**
 * Issue the GST invoice for an order. Returns the invoice number, or
 * null if one already exists (the unique index on order_id makes a
 * second attempt a no-op rather than a duplicate).
 *
 * Place of supply decides the tax split: same state as us → CGST+SGST,
 * any other state → IGST. When our own state is not yet filled in
 * (lib/company.ts), we fall back to IGST and flag it on the row, so the
 * first invoices are still issued and your CA can correct the setting.
 */
async function issueInvoice(
  sb: SupabaseClient,
  order: OrderRow,
  description: string
): Promise<string | null> {
  const existing = await sb
    .from("billing_invoices")
    .select("invoice_no")
    .eq("order_id", order.id)
    .maybeSingle();
  if (existing.data?.invoice_no) return existing.data.invoice_no as string;

  const { data: numberData, error: numberErr } = await sb.rpc("next_invoice_number");
  if (numberErr || !numberData) return null;
  const invoiceNo = String(numberData);

  const total = order.amount_paise;
  const taxable = order.taxable_paise ?? Math.round(total / (1 + GST_RATE));
  const gst = order.gst_paise ?? total - taxable;

  const ourState = (COMPANY.state || "").trim().toLowerCase();
  const theirState = (order.buyer_state || "").trim().toLowerCase();
  const intraState = Boolean(ourState) && ourState === theirState;

  const { error } = await sb.from("billing_invoices").insert({
    order_id: order.id,
    org_id: order.org_id,
    invoice_no: invoiceNo,
    fy: invoiceNo.split("/")[1] ?? null,
    bill_to_name: order.buyer_company || order.buyer_name,
    bill_to_email: order.buyer_email,
    bill_to_address: order.buyer_address,
    bill_to_gstin: order.buyer_gstin,
    bill_to_state: order.buyer_state,
    description,
    sac_code: SAC_CODE,
    taxable_paise: taxable,
    gst_rate: GST_RATE,
    cgst_paise: intraState ? Math.round(gst / 2) : 0,
    sgst_paise: intraState ? gst - Math.round(gst / 2) : 0,
    igst_paise: intraState ? 0 : gst,
    total_paise: total,
    place_of_supply: order.buyer_state,
  });
  if (error) return null;
  return invoiceNo;
}

function invoiceEmailHtml(args: {
  invoiceNo: string;
  description: string;
  totalInr: number;
  taxableInr: number;
  gstInr: number;
  buyerName: string;
}): string {
  return emailShell(
    "Your VPV invoice",
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">
       Hello ${esc(args.buyerName)}, thank you for your payment. Here is your tax invoice.
     </p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
            style="border:1px solid #e2e8f0;border-radius:12px;font-size:14px;color:#334155;">
       <tr><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;color:#64748b;">Invoice number</td>
           <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;color:#0C1017;">${esc(args.invoiceNo)}</td></tr>
       <tr><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;color:#64748b;">For</td>
           <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;text-align:right;">${esc(args.description)}</td></tr>
       <tr><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;color:#64748b;">Taxable value</td>
           <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;text-align:right;">${esc(inr2(args.taxableInr))}</td></tr>
       <tr><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;color:#64748b;">GST at 18%</td>
           <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;text-align:right;">${esc(inr2(args.gstInr))}</td></tr>
       <tr><td style="padding:14px 16px;font-weight:600;color:#0C1017;">Total paid</td>
           <td style="padding:14px 16px;text-align:right;font-weight:700;font-size:16px;color:#0C1017;">${esc(inr(args.totalInr))}</td></tr>
     </table>
     <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#64748b;">
       Questions about this invoice? Reply to this e-mail or write to
       <a href="mailto:${esc(COMPANY.emails.billing)}" style="color:#1468D8;">${esc(COMPANY.emails.billing)}</a>.
     </p>`
  );
}

/* ─────────────────────────── fulfilment ──────────────────────────── */

export type FulfilResult = {
  ok: boolean;
  alreadyDone?: boolean;
  orgId?: string;
  slug?: string;
  invoiceNo?: string | null;
  error?: string;
};

export async function fulfilOrder(orderId: string): Promise<FulfilResult> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "billing_not_configured" };

  const { data: order, error } = await sb
    .from("billing_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !order) return { ok: false, error: "order_not_found" };

  const row = order as OrderRow;

  // Only a paid order is fulfilled, and only once.
  if (row.status !== "paid") return { ok: false, error: "order_not_paid" };
  if (row.provisioned_at) {
    return { ok: true, alreadyDone: true, orgId: row.org_id ?? undefined };
  }

  try {
    switch (row.purpose) {
      case "basic_licence":
        return await fulfilBasicLicence(sb, row);
      case "scene_topup":
        return await fulfilSceneTopup(sb, row);
      case "support_renewal":
        return await fulfilSupportRenewal(sb, row);
      default:
        return { ok: false, error: "unknown_purpose" };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "fulfilment_failed";
    await sb
      .from("billing_orders")
      .update({ provisioning_error: message.slice(0, 500), updated_at: new Date().toISOString() })
      .eq("id", row.id);
    return { ok: false, error: message };
  }
}

/* ---- Basic: build the whole customer, start to finish --------------- */

async function fulfilBasicLicence(sb: SupabaseClient, row: OrderRow): Promise<FulfilResult> {
  const scenes = row.scenes ?? 2;
  const now = new Date();
  const supportUntil = addMonths(now, SUPPORT_FREE_MONTHS);

  let orgId = row.org_id;
  let slug: string | null = null;
  let tempPassword: string | null = null;

  if (orgId) {
    // An existing customer buying another licence — raise their quota
    // rather than building a second workspace.
    const { data: org } = await sb
      .from("organizations")
      .select("slug, scene_quota")
      .eq("id", orgId)
      .maybeSingle();
    slug = (org?.slug as string) ?? null;
    const newQuota = Math.max(scenes, (org?.scene_quota as number) ?? 0);
    await sb
      .from("organizations")
      .update({ scene_quota: newQuota, support_until: supportUntil.toISOString() })
      .eq("id", orgId);
  } else {
    // ── New customer. Workspace, login, subdomain. ──────────────────
    slug = await uniqueSlug(sb, row.buyer_company);

    const { data: org, error: orgErr } = await sb
      .from("organizations")
      .insert({
        name: row.buyer_company,
        slug,
        plan: "basic",
        scene_quota: scenes,
        basic_scene_cap: Math.min(10, Math.max(1, scenes)), // keep the legacy column sane
        plan_status: "active",
        support_until: supportUntil.toISOString(),
        activated_at: now.toISOString(),
        billing_name: row.buyer_company,
        billing_email: row.buyer_email,
        billing_phone: row.buyer_phone,
        billing_address: row.buyer_address,
        billing_gstin: row.buyer_gstin,
        billing_state: row.buyer_state,
      })
      .select("id, slug")
      .single();
    if (orgErr || !org) throw new Error("org_create_failed");
    orgId = org.id as string;
    slug = org.slug as string;

    // The admin login. If this e-mail already has an account (they were
    // a presenter somewhere, say), we attach that account to the new
    // org as its admin instead of failing the purchase.
    tempPassword = readablePassword();
    const { data: created, error: userErr } = await sb.auth.admin.createUser({
      email: row.buyer_email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: row.buyer_name, org_slug: slug },
    });

    let userId = created?.user?.id ?? null;
    if (userErr || !userId) {
      const { data: existingProfile } = await sb
        .from("profiles")
        .select("id")
        .ilike("email", row.buyer_email)
        .maybeSingle();
      userId = (existingProfile?.id as string) ?? null;
      tempPassword = null; // they keep the password they already have
      if (!userId) throw new Error("user_create_failed");
    }

    // Profile row: org admin of the new workspace.
    const { error: profileErr } = await sb.from("profiles").upsert(
      {
        id: userId,
        email: row.buyer_email,
        full_name: row.buyer_name,
        role: "org_admin",
        org_id: orgId,
      },
      { onConflict: "id" }
    );
    if (profileErr) throw new Error("profile_create_failed");

    await sb.from("billing_orders").update({ created_by: userId }).eq("id", row.id);
  }

  const invoiceNo = await issueInvoice(
    sb,
    { ...row, org_id: orgId },
    `VPV Basic licence — ${scenes} scene${scenes === 1 ? "" : "s"}, including 1 year of technical support`
  );

  await sb.from("plan_events").insert({
    org_id: orgId,
    order_id: row.id,
    event: "provisioned",
    to_plan: "basic",
    to_quota: scenes,
    support_until: supportUntil.toISOString(),
    actor: "webhook",
    note: `Paid order ${row.razorpay_order_id ?? row.id}`,
  });

  await sb
    .from("billing_orders")
    .update({
      org_id: orgId,
      provisioned_at: new Date().toISOString(),
      provisioning_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  await sendWelcome({
    order: row,
    slug: slug ?? "",
    scenes,
    tempPassword,
    supportUntil,
  });
  await sendInvoiceEmail(row, invoiceNo, `VPV Basic licence — ${scenes} scenes`);

  return { ok: true, orgId: orgId ?? undefined, slug: slug ?? undefined, invoiceNo };
}

/* ---- Top-up: more scenes for a workspace that already exists -------- */

async function fulfilSceneTopup(sb: SupabaseClient, row: OrderRow): Promise<FulfilResult> {
  if (!row.org_id) return { ok: false, error: "topup_without_org" };

  const { data: org } = await sb
    .from("organizations")
    .select("scene_quota, slug")
    .eq("id", row.org_id)
    .maybeSingle();

  const from = (org?.scene_quota as number) ?? 0;
  const to = Math.max(from, row.scenes ?? from);

  await sb
    .from("organizations")
    .update({ scene_quota: to, basic_scene_cap: Math.min(10, Math.max(1, to)) })
    .eq("id", row.org_id);

  const invoiceNo = await issueInvoice(sb, row, `VPV scene top-up — ${from} to ${to} scenes`);

  await sb.from("plan_events").insert({
    org_id: row.org_id,
    order_id: row.id,
    event: "quota_changed",
    from_quota: from,
    to_quota: to,
    actor: "webhook",
    note: "Scene top-up purchased online",
  });

  await sb
    .from("billing_orders")
    .update({ provisioned_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", row.id);

  await sendInvoiceEmail(row, invoiceNo, `VPV scene top-up — now ${to} scenes`);
  return { ok: true, orgId: row.org_id, slug: (org?.slug as string) ?? undefined, invoiceNo };
}

/* ---- Support renewal ----------------------------------------------- */

async function fulfilSupportRenewal(sb: SupabaseClient, row: OrderRow): Promise<FulfilResult> {
  if (!row.org_id) return { ok: false, error: "renewal_without_org" };

  const { data: org } = await sb
    .from("organizations")
    .select("support_until, slug, name")
    .eq("id", row.org_id)
    .maybeSingle();

  // Renew from the later of today or the current expiry, so a customer
  // who pays a month early keeps that month.
  const current = org?.support_until ? new Date(org.support_until as string) : null;
  const base = current && current > new Date() ? current : new Date();
  const until = addMonths(base, 12);

  await sb
    .from("organizations")
    .update({ support_until: until.toISOString() })
    .eq("id", row.org_id);

  const invoiceNo = await issueInvoice(
    sb,
    row,
    `VPV annual technical support — until ${until.toISOString().slice(0, 10)}`
  );

  await sb.from("plan_events").insert({
    org_id: row.org_id,
    order_id: row.id,
    event: "support_renewed",
    support_until: until.toISOString(),
    actor: "webhook",
  });

  await sb
    .from("billing_orders")
    .update({ provisioned_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", row.id);

  await sendInvoiceEmail(row, invoiceNo, "VPV annual technical support — 1 year");

  await sendEmail({
    to: row.buyer_email,
    subject: "Your VPV support is renewed",
    html: emailShell(
      "Support renewed",
      `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">
         Your technical support and maintenance is active until
         <strong>${esc(until.toDateString())}</strong>. Nothing changes in your
         workspace — you simply stay covered for another year.
       </p>`
    ),
  });

  return { ok: true, orgId: row.org_id, invoiceNo };
}

/* ───────────────────────────── e-mails ───────────────────────────── */

async function sendWelcome(args: {
  order: OrderRow;
  slug: string;
  scenes: number;
  tempPassword: string | null;
  supportUntil: Date;
}): Promise<void> {
  const workspace = `https://${args.slug}.myvpv.com`;
  const credentials = args.tempPassword
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
              style="border:1px solid #e2e8f0;border-radius:12px;font-size:14px;color:#334155;margin:0 0 18px;">
         <tr><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;color:#64748b;">Sign in at</td>
             <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;text-align:right;">
               <a href="${esc(workspace)}" style="color:#1468D8;font-weight:600;">${esc(args.slug)}.myvpv.com</a></td></tr>
         <tr><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;color:#64748b;">Your e-mail</td>
             <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;text-align:right;">${esc(args.order.buyer_email)}</td></tr>
         <tr><td style="padding:12px 16px;color:#64748b;">First password</td>
             <td style="padding:12px 16px;text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:700;color:#0C1017;letter-spacing:0.04em;">${esc(args.tempPassword)}</td></tr>
       </table>
       <p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:#64748b;">
         Please change this password the first time you sign in.
       </p>`
    : `<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#334155;">
         Sign in at <a href="${esc(workspace)}" style="color:#1468D8;font-weight:600;">${esc(args.slug)}.myvpv.com</a>
         with your existing VPV password.
       </p>`;

  await sendEmail({
    to: args.order.buyer_email,
    bcc: COMPANY.emails.founders,
    subject: "Your VPV workspace is ready",
    html: emailShell(
      "Welcome to VPV",
      `<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#334155;">
         Hello ${esc(args.order.buyer_name)}, your workspace for
         <strong>${esc(args.order.buyer_company)}</strong> is live. You bought
         <strong>${args.scenes} scene${args.scenes === 1 ? "" : "s"}</strong>, and your
         technical support is included free until
         <strong>${esc(args.supportUntil.toDateString())}</strong>.
       </p>
       ${credentials}
       <p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#334155;">What to do first:</p>
       <ol style="margin:0 0 18px;padding-left:20px;font-size:14px;line-height:1.8;color:#334155;">
         <li>Sign in and change your password.</li>
         <li>Upload your 360° photographs and build your first tour.</li>
         <li>Add your sales team, and present to a customer.</li>
       </ol>
       <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
         Stuck anywhere? Write to
         <a href="mailto:${esc(COMPANY.emails.support)}" style="color:#1468D8;">${esc(COMPANY.emails.support)}</a>
         and a person will reply.
       </p>`
    ),
  });
}

async function sendInvoiceEmail(
  row: OrderRow,
  invoiceNo: string | null,
  description: string
): Promise<void> {
  if (!invoiceNo) return;
  const total = fromPaise(row.amount_paise);
  const taxable = fromPaise(row.taxable_paise ?? Math.round(row.amount_paise / (1 + GST_RATE)));
  await sendEmail({
    to: row.buyer_email,
    bcc: COMPANY.emails.billing,
    subject: `Invoice ${invoiceNo} from VPV`,
    html: invoiceEmailHtml({
      invoiceNo,
      description,
      totalInr: total,
      taxableInr: taxable,
      gstInr: total - taxable,
      buyerName: row.buyer_name,
    }),
  });
}

/* ───────────────────── recording a payment ──────────────────────── */

/**
 * Write a payment against its order and flip the order to `paid`.
 * Idempotent on razorpay_payment_id: the webhook and the browser
 * callback both call this, often within a second of each other, and the
 * second one must not create a duplicate or double-fulfil.
 *
 * Returns the order id so the caller can fulfil it.
 */
export async function recordPayment(args: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  amountPaise: number;
  status: string;
  method?: string | null;
  bank?: string | null;
  wallet?: string | null;
  vpa?: string | null;
  cardLast4?: string | null;
  feePaise?: number | null;
  taxPaise?: number | null;
  source: "webhook" | "checkout_callback";
  signatureVerified: boolean;
  errorCode?: string | null;
  errorDescription?: string | null;
}): Promise<{ ok: boolean; orderId?: string; error?: string }> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "billing_not_configured" };

  const { data: order } = await sb
    .from("billing_orders")
    .select("id, amount_paise, status")
    .eq("razorpay_order_id", args.razorpayOrderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "order_not_found" };

  // The amount Razorpay captured must equal the amount we asked for.
  // If it does not, something is wrong — record it, do NOT fulfil.
  const captured = args.status === "captured" || args.status === "authorized";
  const amountMatches = Number(args.amountPaise) === Number(order.amount_paise);

  await sb.from("billing_payments").upsert(
    {
      order_id: order.id,
      razorpay_payment_id: args.razorpayPaymentId,
      razorpay_order_id: args.razorpayOrderId,
      amount_paise: args.amountPaise,
      status: args.status,
      method: args.method ?? null,
      bank: args.bank ?? null,
      wallet: args.wallet ?? null,
      vpa: args.vpa ?? null,
      card_last4: args.cardLast4 ?? null,
      fee_paise: args.feePaise ?? null,
      tax_paise: args.taxPaise ?? null,
      source: args.source,
      signature_verified: args.signatureVerified,
      error_code: args.errorCode ?? null,
      error_description: args.errorDescription ?? null,
      captured_at: captured ? new Date().toISOString() : null,
    },
    { onConflict: "razorpay_payment_id" }
  );

  if (!captured) {
    await sb
      .from("billing_orders")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("status", "created");
    return { ok: false, orderId: order.id as string, error: "payment_not_captured" };
  }

  if (!amountMatches) {
    await sb
      .from("billing_orders")
      .update({
        provisioning_error: `Amount mismatch: captured ${args.amountPaise}, expected ${order.amount_paise}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);
    return { ok: false, orderId: order.id as string, error: "amount_mismatch" };
  }

  if (order.status !== "paid") {
    await sb
      .from("billing_orders")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);
  }

  return { ok: true, orderId: order.id as string };
}
