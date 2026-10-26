/**
 * What happens after money arrives. SERVER ONLY.
 *
 * One entry point — `fulfilOrder(orderId)` — called by the Razorpay
 * webhook, the browser's success callback, the status poll, the daily
 * reconciler and the admin "retry" button. All of them may fire at once;
 * the design makes that harmless:
 *
 *   • CLAIM.  billing_claim_fulfilment() lets exactly ONE caller proceed.
 *     The others get `inProgress` and simply wait. A worker that crashes
 *     leaves a claim that expires after 3 minutes, so the job resumes.
 *   • RESUMABLE.  Every step is safe to run twice: the organisation is
 *     created AND linked to the order in one transaction, the login is
 *     found-or-created by exact e-mail, the invoice number + row are one
 *     transaction, and top-ups / renewals carry an "already applied"
 *     marker. A crash between any two steps is repaired by the next run.
 *   • E-MAIL LAST.  The customer is told only after the workspace exists,
 *     and each e-mail is claimed so it is sent once.
 *
 * What it does, by purpose:
 *
 *   basic_licence    creates the organisation, its admin login and its
 *                    subdomain; sets the scene quota to what was bought;
 *                    starts the FREE first year of support; issues a GST
 *                    invoice; e-mails the welcome and the invoice.
 *   scene_topup      adds the scenes that were paid for.
 *   support_renewal  extends support by one year from whichever is later:
 *                    today, or the current expiry.
 *
 * Pro and Ultra never come through here — they are agreed in
 * conversation and switched on from /admin/customers.
 */

import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  alertFounders,
  sendConfirmationEmail,
  loadInvoiceDoc,
  sendInvoiceEmail,
  sendWelcomeEmail,
} from "@/lib/server/billingEmails";
import {
  GST_RATE,
  SAC_CODE,
  SCENE_MIN,
  SUPPORT_FREE_MONTHS,
  clampScenes,
  fromPaise,
  seatsFromOrderNotes,
} from "@/lib/pricing";
import { COMPANY } from "@/lib/company";
import { RESERVED_SLUGS, slugProblem, slugify, workspaceSlug } from "@/lib/slugs";

export type OrderRow = {
  id: string;
  razorpay_order_id: string | null;
  purpose: "basic_licence" | "support_renewal" | "scene_topup" | "plan_upgrade" | "seat_topup";
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
  created_by: string | null;
  provisioned_at: string | null;
  welcome_emailed_at: string | null;
  invoice_emailed_at: string | null;
  admin_user_new: boolean;
  review_flag: string | null;
  fulfilment_attempts: number;
  livemode: boolean;
  revoked_at?: string | null;
  /** What was bought, in words — written by priceFor(). */
  notes?: string | null;
  /** The workspace address the customer chose at checkout. */
  requested_slug?: string | null;
};

export type FulfilResult = {
  ok: boolean;
  alreadyDone?: boolean;
  /** Another worker holds the claim right now — wait, do not retry blindly. */
  inProgress?: boolean;
  /** True when trying again later could succeed. */
  retriable?: boolean;
  orgId?: string;
  slug?: string;
  invoiceNo?: string | null;
  error?: string;
};

/** After this many failed runs the reconciler stops and a human is told. */
export const MAX_AUTO_ATTEMPTS = 8;

/** A failure no retry can fix; the order needs a person. */
class PermanentError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
  }
}

/* ───────────────────────────── helpers ───────────────────────────── */

function readablePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = () =>
    Array.from({ length: 4 }, () => alphabet[crypto.randomInt(0, alphabet.length)]).join("");
  return `${pick()}-${pick()}-${pick()}`;
}

/** A password nobody knows: the real first password is set when the welcome e-mail is sent. */
function unusablePassword(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * The addresses to try for a new workspace, best first.
 *
 * The customer's own choice, made at checkout and already checked for
 * availability there, comes first and will almost always win. The
 * numbered fallbacks exist only for the races and the old orders: a
 * workspace MUST get some address, and refusing to build one for a
 * customer who has already paid would be far worse than an address with
 * a number in it. Before October 2026 the first candidate was all there
 * was, which is how the company "LiveTest" was handed livetest-407.
 */
function slugCandidates(company: string, chosen?: string | null): string[] {
  const want = chosen ? workspaceSlug(chosen) : "";
  const base = slugify(company);
  const out = [...(want && !slugProblem(want) ? [want] : []), base];
  for (let i = 0; i < 6; i++) out.push(`${base}-${crypto.randomInt(100, 999)}`);
  out.push(`${base}-${crypto.randomBytes(3).toString("hex")}`);
  return out.filter((c, i, a) => a.indexOf(c) === i).filter((c) => !RESERVED_SLUGS.has(c));
}

type Rpc<T> = { data: T | null; error: { message: string; code?: string } | null };

async function rpc<T>(sb: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = (await sb.rpc(fn, args)) as Rpc<T>;
  if (error) {
    const e = new Error(`${fn}_failed: ${error.message}`);
    (e as Error & { code?: string }).code = error.code;
    throw e;
  }
  return data as T;
}

/* ───────────────────────────── entry point ───────────────────────── */

export async function fulfilOrder(orderId: string): Promise<FulfilResult> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "billing_not_configured", retriable: true };

  let claimed: OrderRow | null = null;
  try {
    claimed = await rpc<OrderRow | null>(sb, "billing_claim_fulfilment", { p_order: orderId });
  } catch {
    return { ok: false, error: "claim_failed", retriable: true };
  }

  if (!claimed) {
    // Not claimable: not paid, already built, or another worker is on it.
    const { data: o } = await sb
      .from("billing_orders")
      .select("id, status, provisioned_at, org_id")
      .eq("id", orderId)
      .maybeSingle();
    if (!o) return { ok: false, error: "order_not_found", retriable: false };
    if (o.provisioned_at) {
      const slug = await slugOf(sb, o.org_id as string | null);
      await sendPendingEmails(orderId).catch(() => undefined);
      return { ok: true, alreadyDone: true, orgId: (o.org_id as string) ?? undefined, slug };
    }
    if (o.status !== "paid") return { ok: false, error: "order_not_paid", retriable: false };
    return { ok: false, inProgress: true, retriable: true, error: "fulfilment_in_progress" };
  }

  const row = claimed;
  try {
    let result: FulfilResult;
    switch (row.purpose) {
      case "basic_licence":
        result = await fulfilBasicLicence(sb, row);
        break;
      case "scene_topup":
        result = await fulfilSceneTopup(sb, row);
        break;
      case "support_renewal":
        result = await fulfilSupportRenewal(sb, row);
        break;
      case "plan_upgrade":
        result = await fulfilPlanUpgrade(sb, row);
        break;
      case "seat_topup":
        result = await fulfilSeatTopup(sb, row);
        break;
      default:
        throw new PermanentError("unknown_purpose");
    }
    // Tell the customer. Best effort — failures are retried by the reconciler.
    await sendPendingEmails(row.id).catch(() => undefined);
    return result;
  } catch (e) {
    const permanent = e instanceof PermanentError;
    const message = e instanceof Error ? e.message : "fulfilment_failed";
    await sb
      .rpc("billing_release_fulfilment", { p_order: row.id, p_error: message })
      .then(() => undefined, () => undefined);

    // The money was refunded (or charged back) while we were building. That is
    // not a fault: stop, quietly, and do not retry or page anyone.
    if (/order_not_payable/.test(message)) {
      return { ok: false, error: "order_not_paid", retriable: false };
    }

    if (permanent) {
      await sb
        .from("billing_orders")
        .update({ review_flag: (e as PermanentError).code, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      await alertFounders(sb, {
        kind: `fulfilment_${(e as PermanentError).code}`,
        severity: "critical",
        orderId: row.id,
        detail: `A PAID order could not be set up automatically (${(e as PermanentError).code}). Customer: ${row.buyer_company} <${row.buyer_email}>. Please resolve by hand or refund.`,
      });
      return { ok: false, error: (e as PermanentError).code, retriable: false };
    }

    if (row.fulfilment_attempts >= MAX_AUTO_ATTEMPTS) {
      await alertFounders(sb, {
        kind: "fulfilment_stuck",
        severity: "critical",
        orderId: row.id,
        detail: `A PAID order failed to set up ${row.fulfilment_attempts} times (${message.slice(0, 200)}). Customer: ${row.buyer_company} <${row.buyer_email}>.`,
      });
    }
    return { ok: false, error: message.slice(0, 200), retriable: true };
  }
}

async function slugOf(sb: SupabaseClient, orgId: string | null): Promise<string | undefined> {
  if (!orgId) return undefined;
  const { data } = await sb.from("organizations").select("slug").eq("id", orgId).maybeSingle();
  return (data?.slug as string) ?? undefined;
}

/* ---- Basic: build the whole customer, start to finish --------------- */

async function fulfilBasicLicence(sb: SupabaseClient, row: OrderRow): Promise<FulfilResult> {
  const scenes = clampScenes(row.scenes ?? SCENE_MIN);

  // 1. Organisation — created and linked to the order in ONE transaction.
  let orgId: string | null = row.org_id;
  let slug: string | null = null;
  if (orgId) {
    slug = (await slugOf(sb, orgId)) ?? null;
  } else {
    // Refuse BEFORE building anything if this e-mail already belongs to someone
    // else's workspace (or to the platform owner), so a refused order leaves no
    // half-made, orphan workspace behind.
    await assertLoginAvailable(sb, row);
    let lastErr: unknown = null;
    for (const candidate of slugCandidates(row.buyer_company, row.requested_slug)) {
      const { data: taken } = await sb.from("organizations").select("id").eq("slug", candidate).maybeSingle();
      if (taken) continue;
      try {
        const out = await rpc<{ org_id: string; slug: string }>(sb, "billing_create_org_for_order", {
          p_order: row.id,
          p_slug: candidate,
          p_scenes: scenes,
          p_support_months: SUPPORT_FREE_MONTHS,
        });
        orgId = out.org_id;
        slug = out.slug;
        break;
      } catch (e) {
        lastErr = e;
        if ((e as { code?: string }).code === "23505") continue; // slug raced — try the next
        throw e;
      }
    }
    if (!orgId || !slug) throw lastErr instanceof Error ? lastErr : new Error("org_create_failed");
  }

  // 2. The admin login.
  await ensureAdminUser(sb, row, orgId, slug as string);

  // 3. The GST invoice (number + row in one transaction).
  const invoiceNo = await issueInvoice(
    sb,
    row.id,
    `VPV Basic licence — ${scenes} scene${scenes === 1 ? "" : "s"}, including 1 year of technical support and hosting`
  );

  // 3b. Sales Team logins are yearly: remember how many, and at what price,
  // so the renewal bills them. Never fails the build: a database without the
  // columns yet (supabase/sales_seats.sql not run) only means the renewal
  // bills support alone, and a person is told.
  await rememberSalesSeats(sb, row, orgId);
  // Which of the four plans this was: it decides the workspace's features.
  await rememberSitePlan(sb, row, orgId);

  // 4. Done. Anything after this point is notification, retried separately.
  await markProvisioned(sb, row.id, orgId);
  return { ok: true, orgId, slug: slug as string, invoiceNo };
}

async function rememberSitePlan(sb: SupabaseClient, row: OrderRow, orgId: string): Promise<void> {
  const m = /^VPV (Confidence|Authority|Control|Enterprise) /.exec((row as { notes?: string | null }).notes ?? "");
  if (!m) return;
  const plan = m[1].toLowerCase();
  try {
    const { error } = await sb.from("organizations").update({ site_plan: plan }).eq("id", orgId).is("site_plan", null);
    if (error) throw new Error(error.message);
  } catch (e) {
    await alertFounders(sb, {
      kind: "site_plan_not_saved",
      severity: "warning",
      orderId: row.id,
      detail: `${row.buyer_company} bought ${m[1]} but the plan could not be saved on the workspace (${(e as Error).message.slice(0, 120)}). Run supabase/plan_features.sql; it fills the plan in from the order.`,
    });
  }
}

async function rememberSalesSeats(sb: SupabaseClient, row: OrderRow, orgId: string): Promise<void> {
  const { seats, seatInr } = seatsFromOrderNotes((row as { notes?: string | null }).notes);
  if (seats <= 0) return;
  try {
    const { error } = await sb
      .from("organizations")
      .update({ sales_seats: seats, sales_seat_inr: seatInr })
      .eq("id", orgId);
    if (error) throw new Error(error.message);
  } catch (e) {
    await alertFounders(sb, {
      kind: "sales_seats_not_saved",
      severity: "warning",
      orderId: row.id,
      detail: `${seats} Sales Team login(s) at ₹${seatInr}/yr were paid for but could not be saved on the workspace (${(e as Error).message.slice(0, 120)}). Run supabase/sales_seats.sql, then set organizations.sales_seats = ${seats}, sales_seat_inr = ${seatInr} for this workspace, so the renewal bills them.`,
    }).catch(() => undefined);
  }
}

/**
 * Is this buyer's e-mail free to become a new workspace's admin? An account that
 * already belongs to another workspace — or is the platform owner — is never
 * touched: a person decides what to do (the order is flagged and the founders alerted).
 */
async function assertLoginAvailable(sb: SupabaseClient, row: OrderRow): Promise<void> {
  const userId = await rpc<string | null>(sb, "billing_find_auth_user", { p_email: row.buyer_email.toLowerCase() });
  if (!userId) return;
  const { data: profile, error } = await sb.from("profiles").select("id, org_id, role").eq("id", userId).maybeSingle();
  if (error) throw new Error("profile_lookup_failed");
  if (!profile?.org_id && profile?.role !== "owner") return;
  // A login this very order created earlier (a retry) is ours, whatever profile a
  // database trigger gave it: see loginIsOurs().
  if (await loginIsOurs(sb, userId, row.id)) return;
  throw new PermanentError("email_in_use");
}

/**
 * Was this login created by THIS order's own build? We stamp the order id into the
 * login's metadata when we create it, so a retry after a crash can recognise it.
 *
 * It matters because Supabase projects often carry a trigger that makes a profile row
 * the moment any login is created, and some give it the "owner" role by default. Seeing
 * "owner" on a login we have just made ourselves is that default, not the platform owner.
 * The real owner's login was never created by an order, so it never matches.
 */
async function loginIsOurs(sb: SupabaseClient, userId: string, orderId: string): Promise<boolean> {
  const { data: au, error } = await sb.auth.admin.getUserById(userId);
  // Cannot tell: fail the attempt (it is retried) rather than guess either way.
  if (error || !au?.user) throw new Error("user_lookup_failed");
  return (au.user.user_metadata as { vpv_order_id?: string } | undefined)?.vpv_order_id === orderId;
}

/**
 * Find-or-create the workspace admin's login, WITHOUT ever moving an
 * existing account out of another workspace. The e-mail is looked up
 * exactly (never with LIKE), so an address such as "%@example.com" cannot
 * match somebody else's account.
 */
async function ensureAdminUser(
  sb: SupabaseClient,
  row: OrderRow,
  orgId: string,
  slug: string
): Promise<void> {
  const email = row.buyer_email.toLowerCase();

  let userId = await rpc<string | null>(sb, "billing_find_auth_user", { p_email: email });
  let weCreatedIt = false;

  if (!userId) {
    const { data: created, error } = await sb.auth.admin.createUser({
      email,
      password: unusablePassword(),
      email_confirm: true,
      user_metadata: { full_name: row.buyer_name, org_slug: slug, vpv_order_id: row.id },
    });
    userId = created?.user?.id ?? null;
    weCreatedIt = Boolean(userId);
    if (!userId) {
      // Lost a race with another signup — the account exists now.
      userId = await rpc<string | null>(sb, "billing_find_auth_user", { p_email: email });
      if (!userId) throw new Error(`user_create_failed: ${error?.message ?? "unknown"}`);
    }
  }

  const { data: profile } = await sb
    .from("profiles")
    .select("id, org_id, role")
    .eq("id", userId)
    .maybeSingle();

  // Ours = created by this order (now, or by an earlier attempt that crashed).
  const ours = weCreatedIt || (await loginIsOurs(sb, userId, row.id));

  // The account already belongs to a different workspace. Never move it:
  // that would break the other customer. A person resolves this.
  if (profile?.org_id && profile.org_id !== orgId) {
    throw new PermanentError("email_in_use");
  }
  // Never rewrite the role of the platform owner (anyone can type their e-mail into a
  // checkout form). A person resolves this too.
  // (An "owner" role on a login this order itself created is a trigger's default; see loginIsOurs.)
  if (profile?.role === "owner" && !ours) {
    throw new PermanentError("email_in_use");
  }

  if (!profile || profile.org_id !== orgId) {
    const { error: profileErr } = await sb.from("profiles").upsert(
      {
        id: userId,
        email,
        full_name: row.buyer_name,
        role: "org_admin",
        org_id: orgId,
      },
      { onConflict: "id" }
    );
    if (profileErr) throw new Error("profile_create_failed");
  }

  // `ours` (above) also decides who is given the first password. A crash right
  // after createUser is recognised by the order id we stamped into the metadata.
  const { error: linkErr } = await sb
    .from("billing_orders")
    .update({ created_by: userId, admin_user_new: ours, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  // This link decides who is given the first password. Never carry on without it.
  if (linkErr) throw new Error("order_link_failed");
}

/* ---- Top-up: more scenes for a workspace that already exists -------- */

async function fulfilSceneTopup(sb: SupabaseClient, row: OrderRow): Promise<FulfilResult> {
  if (!row.org_id) throw new PermanentError("topup_without_org");

  let applied: { from?: number; to?: number };
  try {
    applied = await rpc<{ from?: number; to?: number }>(sb, "billing_apply_topup", { p_order: row.id });
  } catch (e) {
    // Paid for more scenes than Basic can hold: no retry can fix it, a person must.
    if (/topup_exceeds_cap/.test((e as Error).message)) throw new PermanentError("topup_exceeds_cap");
    throw e;
  }
  const { data: org } = await sb
    .from("organizations")
    .select("scene_quota, slug")
    .eq("id", row.org_id)
    .maybeSingle();
  const now = (org?.scene_quota as number) ?? applied.to ?? 0;

  const invoiceNo = await issueInvoice(
    sb,
    row.id,
    `VPV scene top-up — now ${now} scene${now === 1 ? "" : "s"} in total`
  );
  await markProvisioned(sb, row.id, row.org_id);
  return { ok: true, orgId: row.org_id, slug: (org?.slug as string) ?? undefined, invoiceNo };
}

/* ---- Plan upgrade: the new plan's features and areas, at once -------- */

async function fulfilPlanUpgrade(sb: SupabaseClient, row: OrderRow): Promise<FulfilResult> {
  if (!row.org_id) throw new PermanentError("upgrade_without_org");
  let out: { site_plan?: string };
  try {
    out = await rpc<{ site_plan?: string }>(sb, "billing_apply_plan_upgrade", { p_order: row.id });
  } catch (e) {
    if (/upgrade_target_missing/.test((e as Error).message)) throw new PermanentError("upgrade_target_missing");
    throw e;
  }
  const plan = String(out.site_plan ?? "");
  const name = plan ? `VPV ${plan.charAt(0).toUpperCase()}${plan.slice(1)}` : "the new plan";
  const invoiceNo = await issueInvoice(sb, row.id, `Upgrade to ${name}`);
  await markProvisioned(sb, row.id, row.org_id);
  return { ok: true, orgId: row.org_id, slug: await slugOf(sb, row.org_id), invoiceNo };
}

/* ---- More Sales Team logins ------------------------------------------ */

async function fulfilSeatTopup(sb: SupabaseClient, row: OrderRow): Promise<FulfilResult> {
  if (!row.org_id) throw new PermanentError("topup_without_org");
  let out: { sales_seats?: number };
  try {
    out = await rpc<{ sales_seats?: number }>(sb, "billing_apply_seat_topup", { p_order: row.id });
  } catch (e) {
    if (/seats_missing/.test((e as Error).message)) throw new PermanentError("seats_missing");
    throw e;
  }
  const n = Number(out.sales_seats ?? 0);
  const invoiceNo = await issueInvoice(sb, row.id, `Sales Team logins — now ${n} in total`);
  await markProvisioned(sb, row.id, row.org_id);
  return { ok: true, orgId: row.org_id, slug: await slugOf(sb, row.org_id), invoiceNo };
}

/* ---- Support renewal ----------------------------------------------- */

async function fulfilSupportRenewal(sb: SupabaseClient, row: OrderRow): Promise<FulfilResult> {
  if (!row.org_id) throw new PermanentError("renewal_without_org");

  const out = await rpc<{ support_until: string }>(sb, "billing_apply_support_renewal", { p_order: row.id });
  const until = new Date(out.support_until);

  const invoiceNo = await issueInvoice(
    sb,
    row.id,
    `VPV annual technical support, maintenance and hosting — until ${until.toISOString().slice(0, 10)}`
  );
  await markProvisioned(sb, row.id, row.org_id);
  return { ok: true, orgId: row.org_id, slug: await slugOf(sb, row.org_id), invoiceNo };
}

/* ───────────────────────── shared steps ──────────────────────────── */

async function issueInvoice(sb: SupabaseClient, orderId: string, description: string): Promise<string> {
  const no = await rpc<string>(sb, "billing_issue_invoice", {
    p_order: orderId,
    p_description: description,
    p_our_state: COMPANY.state,
    p_gst_rate: GST_RATE,
    p_sac: SAC_CODE,
  });
  if (!no) throw new Error("invoice_failed");
  return no;
}

async function markProvisioned(sb: SupabaseClient, orderId: string, orgId: string): Promise<void> {
  const { error } = await sb
    .from("billing_orders")
    .update({
      org_id: orgId,
      provisioned_at: new Date().toISOString(),
      provisioning_error: null,
      review_flag: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .is("provisioned_at", null);
  if (error) throw new Error("mark_provisioned_failed");
}

/* ───────────────────────────── e-mails ───────────────────────────── */

/**
 * Send whatever the customer has not yet been sent for an order that has
 * been provisioned. Each e-mail is CLAIMED first, so two workers (webhook
 * and browser callback landing together) cannot both send it — which
 * matters, because the welcome e-mail resets the first password.
 */
export async function sendPendingEmails(orderId: string): Promise<{ welcome: boolean; invoice: boolean }> {
  const sb = supabaseAdmin();
  const sent = { welcome: false, invoice: false };
  if (!sb) return sent;

  const { data: o } = await sb.from("billing_orders").select("*").eq("id", orderId).maybeSingle();
  const order = o as OrderRow | null;
  if (!order || !order.provisioned_at) return sent;
  // A refunded order gets its refund e-mail and credit note, not a welcome with a password.
  if (order.status === "refunded" || order.revoked_at) return sent;

  if (!order.welcome_emailed_at && (await claimEmail(sb, order.id, "welcome"))) {
    let ok = false;
    try {
      ok = await sendConfirmation(sb, order);
    } catch {
      ok = false;
    }
    await finishEmail(sb, order.id, "welcome", ok);
    sent.welcome = ok;
  }

  if (!order.invoice_emailed_at && (await claimEmail(sb, order.id, "invoice"))) {
    let ok = false;
    try {
      const { data: inv } = await sb
        .from("billing_invoices")
        .select("invoice_no, description, total_paise, taxable_paise")
        .eq("order_id", order.id)
        .maybeSingle();
      if (inv) {
        const total = fromPaise(Number(inv.total_paise));
        const taxable = fromPaise(Number(inv.taxable_paise));
        ok = await sendInvoiceEmail({
          to: order.buyer_email,
          name: order.buyer_name,
          invoiceNo: inv.invoice_no as string,
          description: inv.description as string,
          totalInr: total,
          taxableInr: taxable,
          gstInr: Math.round((total - taxable) * 100) / 100,
          doc: await loadInvoiceDoc(sb, order.id),
        });
      }
    } catch {
      ok = false;
    }
    await finishEmail(sb, order.id, "invoice", ok);
    sent.invoice = ok;
  }
  return sent;
}

async function claimEmail(sb: SupabaseClient, orderId: string, which: "welcome" | "invoice"): Promise<boolean> {
  const { data, error } = await sb.rpc("billing_claim_email", { p_order: orderId, p_which: which });
  return !error && data === true;
}

async function finishEmail(sb: SupabaseClient, orderId: string, which: "welcome" | "invoice", ok: boolean) {
  await sb.rpc("billing_finish_email", { p_order: orderId, p_which: which, p_sent: ok });
}

/**
 * Did this order buy one of the named plans from the marketing site —
 * the ones where our crew comes and shoots — rather than the self-serve
 * scene licence? Site plans are stored as basic_licence like everything
 * else, so the description is the only thing that tells them apart.
 * Mirrors SITE_PLAN_NOTE in lib/server/launchOffer.ts.
 */
function isSitePlanOrder(notes: string | null | undefined): boolean {
  return /^VPV (Confidence|Authority|Control|Enterprise) /.test(notes ?? "");
}

async function sendConfirmation(sb: SupabaseClient, order: OrderRow): Promise<boolean> {
  const { data: org } = await sb
    .from("organizations")
    .select("slug, scene_quota, support_until")
    .eq("id", order.org_id)
    .maybeSingle();
  const slug = (org?.slug as string) ?? null;

  if (order.purpose === "support_renewal") {
    return sendConfirmationEmail({
      to: order.buyer_email,
      kind: "support_renewal",
      slug,
      detail: `Your technical support and hosting is active until ${new Date(org?.support_until as string).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })}. Nothing changes in your workspace — you simply stay covered for another year.`,
    });
  }
  if (order.purpose === "plan_upgrade" || order.purpose === "seat_topup") {
    const { data: more } = await sb
      .from("organizations")
      .select("site_plan, sales_seats")
      .eq("id", order.org_id)
      .maybeSingle();
    const m = (more ?? {}) as { site_plan?: string | null; sales_seats?: number | null };
    const planName = m.site_plan ? `VPV ${m.site_plan.charAt(0).toUpperCase()}${m.site_plan.slice(1)}` : "your new plan";
    return sendConfirmationEmail({
      to: order.buyer_email,
      kind: order.purpose,
      slug,
      detail:
        order.purpose === "plan_upgrade"
          ? `Your workspace is now on ${planName}, with ${org?.scene_quota ?? "more"} areas. The new features are open in your dashboard now. We will call you to book the shoot for the extra areas.`
          : `Your workspace now has ${m.sales_seats ?? "more"} Sales Team logins. Share an invite code from your Team page and your new salespeople can sign in straight away.`,
    });
  }
  if (order.purpose === "scene_topup") {
    return sendConfirmationEmail({
      to: order.buyer_email,
      kind: "scene_topup",
      slug,
      detail: `Your workspace now shows ${org?.scene_quota ?? "more"} scenes to your customers. The new scenes are live now.`,
    });
  }

  // basic_licence: hand over the first password — only to a login that
  // was created for THIS order and has never been used.
  let tempPassword: string | null = null;
  if (order.admin_user_new && order.created_by) {
    const { data: au, error: lookupErr } = await sb.auth.admin.getUserById(order.created_by);
    // Cannot tell whether this login has ever been used → do not send an e-mail
    // that is missing the password it promises. The reconciler retries.
    if (lookupErr || !au?.user) return false;
    if (!au.user.last_sign_in_at) {
      const candidate = readablePassword();
      const { error } = await sb.auth.admin.updateUserById(order.created_by, { password: candidate });
      if (error) return false; // do not send an e-mail promising a password we could not set
      tempPassword = candidate;
    }
  }
  return sendWelcomeEmail({
    to: order.buyer_email,
    name: order.buyer_name,
    company: order.buyer_company,
    slug: slug ?? "",
    scenes: (org?.scene_quota as number) ?? order.scenes ?? 0,
    supportUntil: (org?.support_until as string) ?? new Date().toISOString(),
    tempPassword,
    crewShoots: isSitePlanOrder(order.notes),
  });
}
