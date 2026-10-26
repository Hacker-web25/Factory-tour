/**
 * Every e-mail the billing system sends, and the founder alert channel.
 * SERVER ONLY.
 *
 * Every function returns a boolean and never throws: an e-mail that fails
 * to send must never undo a payment that succeeded. The callers record
 * success on the order (welcome_emailed_at / invoice_emailed_at) so the
 * reconciler can re-send what did not go out.
 *
 * Customer-supplied text is always passed through esc() before it meets
 * HTML.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { emailShell, esc, sendEmail } from "@/lib/server/email";
import { COMPANY, POLICY } from "@/lib/company";
import { SUPPORT_ANNUAL_INR, SUPPORT_GRACE_DAYS, fromPaise, inr, inr2 } from "@/lib/pricing";
import {
  creditNoteBodyHtml,
  invoiceBodyHtml,
  type CreditNoteDoc,
  type InvoiceDoc,
  type Party,
} from "@/lib/billingDocs";

const P = 'style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;"';
const SMALL = 'style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#64748b;"';
const CELL = "padding:12px 16px;border-bottom:1px solid #e2e8f0;";

function row(label: string, value: string, last = false, mono = false): string {
  const b = last ? "padding:12px 16px;" : CELL;
  return `<tr><td style="${b}color:#64748b;">${esc(label)}</td>
    <td style="${b}text-align:right;${mono ? "font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:700;color:#0C1017;letter-spacing:0.04em;" : ""}">${value}</td></tr>`;
}

function table(rows: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="border:1px solid #e2e8f0;border-radius:12px;font-size:14px;color:#334155;">${rows}</table>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:22px 0 0;"><a href="${esc(href)}"
    style="display:inline-block;background:#1468D8;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:999px;">${esc(label)}</a></p>`;
}

const dateStr = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

/* ───────────────────────────── customer ──────────────────────────── */

export async function sendWelcomeEmail(args: {
  to: string;
  name: string;
  company: string;
  slug: string;
  scenes: number;
  supportUntil: Date | string;
  tempPassword: string | null;
}): Promise<boolean> {
  const workspace = `https://${args.slug}.myvpv.com`;
  const credentials = args.tempPassword
    ? `${table(
        row("Sign in at", `<a href="${esc(workspace)}" style="color:#1468D8;font-weight:600;">${esc(args.slug)}.myvpv.com</a>`) +
          row("Your e-mail", esc(args.to)) +
          row("First password", esc(args.tempPassword), true, true)
      )}
       <p ${SMALL}>Please change this password the first time you sign in.</p>`
    : `<p ${P}>Sign in at <a href="${esc(workspace)}" style="color:#1468D8;font-weight:600;">${esc(args.slug)}.myvpv.com</a> with your existing VPV password.</p>`;

  // No BCC here, ever: this message carries the customer's first password, and a
  // copy in a shared inbox would make that inbox a store of customer passwords.
  // The founders see the new customer in /admin/customers and on the invoice copy.
  return sendEmail({
    to: args.to,
    subject: "Your VPV workspace is ready",
    html: emailShell(
      "Welcome to VPV",
      `<p ${P}>Hello ${esc(args.name)}, your workspace for <strong>${esc(args.company)}</strong> is live.
         You bought <strong>${args.scenes} scene${args.scenes === 1 ? "" : "s"}</strong>, and your technical
         support and hosting are included free until <strong>${esc(dateStr(args.supportUntil))}</strong>.</p>
       ${credentials}
       <p ${P} >What to do first:</p>
       <ol style="margin:0 0 18px;padding-left:20px;font-size:14px;line-height:1.8;color:#334155;">
         <li>Sign in and change your password.</li>
         <li>Upload your 360° photographs and build your first tour.</li>
         <li>Add your sales team, and present to a customer.</li>
       </ol>
       <p ${SMALL}>Stuck anywhere? Write to
         <a href="mailto:${esc(COMPANY.emails.support)}" style="color:#1468D8;">${esc(COMPANY.emails.support)}</a>
         and a person will reply.</p>`
    ),
  });
}

export async function sendInvoiceEmail(args: {
  to: string;
  name: string;
  invoiceNo: string;
  description: string;
  totalInr: number;
  taxableInr: number;
  gstInr: number;
  /** The full tax invoice. When present it is what the customer sees. */
  doc?: InvoiceDoc | null;
}): Promise<boolean> {
  if (args.doc) {
    return sendEmail({
      to: args.to,
      bcc: COMPANY.emails.support,
      subject: `Tax invoice ${args.invoiceNo} from VPV`,
      html: emailShell("Your VPV tax invoice", invoiceBodyHtml(args.doc, args.name, COMPANY.emails.support)),
    });
  }
  return sendEmail({
    to: args.to,
    bcc: COMPANY.emails.support,
    subject: `Invoice ${args.invoiceNo} from VPV`,
    html: emailShell(
      "Your VPV invoice",
      `<p ${P}>Hello ${esc(args.name)}, thank you for your payment. Here is your tax invoice.</p>
       ${table(
         row("Invoice number", `<strong style="color:#0C1017;">${esc(args.invoiceNo)}</strong>`) +
           row("For", esc(args.description)) +
           row("Taxable value", esc(inr2(args.taxableInr))) +
           row("GST at 18%", esc(inr2(args.gstInr))) +
           row("Total paid", `<strong style="font-size:16px;color:#0C1017;">${esc(inr(args.totalInr))}</strong>`, true)
       )}
       <p ${SMALL}>Questions about this invoice? Reply to this e-mail or write to
         <a href="mailto:${esc(COMPANY.emails.support)}" style="color:#1468D8;">${esc(COMPANY.emails.support)}</a>.</p>`
    ),
  });
}

export async function sendConfirmationEmail(args: {
  to: string;
  kind: "support_renewal" | "scene_topup";
  slug: string | null;
  detail: string;
}): Promise<boolean> {
  const title = args.kind === "support_renewal" ? "Support renewed" : "Scenes added";
  return sendEmail({
    to: args.to,
    subject: args.kind === "support_renewal" ? "Your VPV support is renewed" : "Your extra VPV scenes are live",
    html: emailShell(
      title,
      `<p ${P}>${esc(args.detail)}</p>
       ${args.slug ? button(`https://${args.slug}.myvpv.com`, "Open your workspace") : ""}`
    ),
  });
}

export type ReminderKind = "t30" | "t7" | "t0" | "t3" | "t6";

export async function sendSupportReminder(args: {
  to: string;
  orgName: string;
  slug: string;
  kind: ReminderKind;
  supportUntil: Date | string;
  locksAt: Date | string;
  /** The renewal price, GST excluded: support plus any yearly Sales Team logins. */
  amountInr?: number;
}): Promise<boolean> {
  const renewInr = args.amountInr ?? SUPPORT_ANNUAL_INR;
  const until = dateStr(args.supportUntil);
  const locks = dateStr(args.locksAt);
  const url = `https://${args.slug}.myvpv.com/billing`;
  const copy: Record<ReminderKind, { subject: string; title: string; body: string }> = {
    t30: {
      subject: "Your VPV support year ends in about a month",
      title: "Your support year ends soon",
      body: `Your technical support and hosting for <strong>${esc(args.orgName)}</strong> runs until <strong>${esc(until)}</strong>. Renew for ${esc(inr(renewInr))} + GST a year from your dashboard so nothing is interrupted. Renewing early never loses you a day.`,
    },
    t7: {
      subject: "Your VPV support ends in a week",
      title: "One week left",
      body: `Your support and hosting for <strong>${esc(args.orgName)}</strong> ends on <strong>${esc(until)}</strong>. After that date a renewal reminder appears on every click, and ${SUPPORT_GRACE_DAYS} days later the workspace locks until it is renewed.`,
    },
    t0: {
      subject: "Your VPV support year has ended — please renew",
      title: "Your support year has ended",
      body: `Support and hosting for <strong>${esc(args.orgName)}</strong> ended on <strong>${esc(until)}</strong>. Renewal reminders now appear as you use VPV, and <strong>the workspace locks on ${esc(locks)}</strong> if it is not renewed. Your tours and data are kept — renewing unlocks everything instantly.`,
    },
    t3: {
      subject: "Your VPV workspace locks in a few days",
      title: "Your workspace locks soon",
      body: `<strong>${esc(args.orgName)}</strong> will lock on <strong>${esc(locks)}</strong>. While it is locked, your dashboard and the tours you have shared with customers stop working. Renew now to keep everything live.`,
    },
    t6: {
      subject: "Final notice — your VPV workspace locks tomorrow",
      title: "Final notice",
      body: `<strong>${esc(args.orgName)}</strong> locks on <strong>${esc(locks)}</strong>. Customers opening your shared tours will see them as unavailable until you renew. Renewing takes a minute and unlocks everything immediately.`,
    },
  };
  const c = copy[args.kind];
  return sendEmail({
    to: args.to,
    bcc: COMPANY.emails.support,
    subject: c.subject,
    html: emailShell(
      c.title,
      `<p ${P}>${c.body}</p>${button(url, `Renew for ${inr(renewInr)} + GST`)}
       <p ${SMALL}>Questions? Write to <a href="mailto:${esc(COMPANY.emails.support)}" style="color:#1468D8;">${esc(COMPANY.emails.support)}</a>.</p>`
    ),
  });
}

export async function sendRefundEmail(args: {
  to: string;
  name: string;
  amountInr: number;
  creditNoteNo: string | null;
  fullyRefunded: boolean;
  purpose: string;
  /** The full credit note. When present it is what the customer sees. */
  doc?: CreditNoteDoc | null;
}): Promise<boolean> {
  const closes =
    args.fullyRefunded && args.purpose === "basic_licence"
      ? " Because the licence has been refunded in full, the workspace has been closed."
      : args.fullyRefunded && args.purpose === "scene_topup"
        ? " The extra scenes have been removed from your workspace."
        : args.fullyRefunded && args.purpose === "support_renewal"
          ? " The extra year of support has been taken off your account."
          : "";
  if (args.doc) {
    return sendEmail({
      to: args.to,
      bcc: COMPANY.emails.support,
      subject: `Your VPV refund of ${inr2(args.doc.total)} has been sent`,
      html: emailShell(
        "Refund sent",
        creditNoteBodyHtml(args.doc, {
          greetingName: args.name,
          fullyRefunded: args.fullyRefunded,
          closes,
          processing: POLICY.refundProcessing,
          supportEmail: COMPANY.emails.support,
        })
      ),
    });
  }
  return sendEmail({
    to: args.to,
    bcc: COMPANY.emails.support,
    subject: "Your VPV refund has been processed",
    html: emailShell(
      "Refund processed",
      `<p ${P}>Hello ${esc(args.name)}, we have refunded <strong>${esc(inr2(args.amountInr))}</strong> to your
         original payment method. It usually reaches you within 5 to 7 business days.${esc(closes)}</p>
       ${args.creditNoteNo ? table(row("Credit note", `<strong style="color:#0C1017;">${esc(args.creditNoteNo)}</strong>`, true)) : ""}
       <p ${SMALL}>Questions? Write to <a href="mailto:${esc(COMPANY.emails.support)}" style="color:#1468D8;">${esc(COMPANY.emails.support)}</a>.</p>`
    ),
  });
}

/* ───────────────────────────── founders ──────────────────────────── */

/**
 * Tell the founders something needs a human. The alert is stored (visible
 * on /admin/payments) and e-mailed — but only once per (kind, order) while
 * the first is still open, so a retrying webhook cannot flood the inbox.
 * Never throws; never includes a secret or a card detail.
 */
export async function alertFounders(
  sb: SupabaseClient,
  args: {
    kind: string;
    severity?: "info" | "warning" | "critical";
    orderId?: string | null;
    detail: string;
  }
): Promise<void> {
  try {
    const severity = args.severity ?? "warning";
    let q = sb.from("billing_alerts").select("id").eq("kind", args.kind).is("resolved_at", null);
    q = args.orderId ? q.eq("order_id", args.orderId) : q.is("order_id", null);
    const { data: open } = await q.limit(1);
    if (open && open.length > 0) return;

    await sb.from("billing_alerts").insert({
      kind: args.kind,
      severity,
      order_id: args.orderId ?? null,
      detail: args.detail.slice(0, 1000),
    });

    await sendEmail({
      to: COMPANY.emails.support,
      subject: `[VPV payments · ${severity}] ${args.kind}`,
      html: emailShell(
        `Payments: ${args.kind}`,
        `<p ${P}>${esc(args.detail)}</p>
         ${args.orderId ? `<p ${SMALL}>Order: ${esc(args.orderId)}</p>` : ""}
         ${button("https://myvpv.com/admin/payments", "Open payments health")}`
      ),
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[billing] alert failed:", (e as Error)?.message);
  }
}

/* ───────────────────── frozen documents, read back ─────────────────── */

function seller(): Party {
  return { name: COMPANY.legalName, addressLines: COMPANY.addressLines, gstin: COMPANY.gstin, state: COMPANY.state };
}

function paymentLabel(p: { method?: string | null; bank?: string | null; wallet?: string | null; card_last4?: string | null } | null): string | null {
  if (!p?.method) return null;
  if (p.method === "upi") return "UPI";
  if (p.method === "card") return p.card_last4 ? `Card ending ${p.card_last4}` : "Card";
  if (p.method === "netbanking") return p.bank ? `Netbanking (${p.bank})` : "Netbanking";
  if (p.method === "wallet") return p.wallet ? `Wallet (${p.wallet})` : "Wallet";
  return p.method;
}

/** The invoice as it was frozen at sale, plus how it was paid. Null if there is none. */
export async function loadInvoiceDoc(sb: SupabaseClient, orderId: string): Promise<InvoiceDoc | null> {
  try {
    const { data: inv } = await sb.from("billing_invoices").select("*").eq("order_id", orderId).maybeSingle();
    if (!inv) return null;
    const { data: pay } = await sb
      .from("billing_payments")
      .select("razorpay_payment_id, method, bank, wallet, card_last4, status")
      .eq("order_id", orderId)
      .in("status", ["captured", "refunded", "partially_refunded"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    return {
      invoiceNo: inv.invoice_no as string,
      issuedAt: inv.issued_at as string,
      seller: seller(),
      billTo: {
        name: inv.bill_to_name as string,
        email: inv.bill_to_email as string,
        address: (inv.bill_to_address as string) ?? null,
        gstin: (inv.bill_to_gstin as string) ?? null,
        state: (inv.bill_to_state as string) ?? null,
      },
      placeOfSupply: (inv.place_of_supply as string) ?? null,
      description: inv.description as string,
      sac: (inv.sac_code as string) ?? "998434",
      gstRatePct: Math.round(Number(inv.gst_rate) * 10000) / 100,
      taxable: fromPaise(Number(inv.taxable_paise)),
      cgst: fromPaise(Number(inv.cgst_paise)),
      sgst: fromPaise(Number(inv.sgst_paise)),
      igst: fromPaise(Number(inv.igst_paise)),
      total: fromPaise(Number(inv.total_paise)),
      paymentId: (pay?.razorpay_payment_id as string) ?? null,
      paymentLabel: paymentLabel(pay as never),
    };
  } catch {
    return null; // the plain invoice e-mail is the fallback
  }
}

/** One credit note with the invoice it corrects. Null if it cannot be read. */
export async function loadCreditNoteDoc(sb: SupabaseClient, creditNoteNo: string): Promise<CreditNoteDoc | null> {
  try {
    const { data: cn } = await sb.from("billing_credit_notes").select("*").eq("credit_note_no", creditNoteNo).maybeSingle();
    if (!cn) return null;
    const { data: inv } = cn.invoice_id
      ? await sb.from("billing_invoices").select("*").eq("id", cn.invoice_id as string).maybeSingle()
      : { data: null };
    const { data: rf } = await sb
      .from("billing_refunds")
      .select("razorpay_refund_id, kind")
      .eq("id", cn.refund_id as string)
      .maybeSingle();
    return {
      creditNoteNo: cn.credit_note_no as string,
      issuedAt: cn.issued_at as string,
      invoiceNo: (inv?.invoice_no as string) ?? null,
      invoiceDate: (inv?.issued_at as string) ?? null,
      seller: seller(),
      billTo: {
        name: (inv?.bill_to_name as string) ?? "",
        email: (inv?.bill_to_email as string) ?? "",
        address: (inv?.bill_to_address as string) ?? null,
        gstin: (inv?.bill_to_gstin as string) ?? null,
        state: (inv?.bill_to_state as string) ?? null,
      },
      placeOfSupply: (inv?.place_of_supply as string) ?? null,
      description: (inv?.description as string) ?? "VPV",
      sac: (inv?.sac_code as string) ?? "998434",
      taxable: fromPaise(Number(cn.taxable_paise)),
      cgst: fromPaise(Number(cn.cgst_paise)),
      sgst: fromPaise(Number(cn.sgst_paise)),
      igst: fromPaise(Number(cn.igst_paise)),
      total: fromPaise(Number(cn.total_paise)),
      // A chargeback has no Razorpay refund id the customer could quote.
      refundId: rf && rf.kind === "refund" ? (rf.razorpay_refund_id as string) : null,
    };
  } catch {
    return null;
  }
}
