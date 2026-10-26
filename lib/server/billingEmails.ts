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
import { emailShell, esc, sendEmail, type EmailAttachment } from "@/lib/server/email";
import { COMPANY, POLICY } from "@/lib/company";
import { SUPPORT_ANNUAL_INR, SUPPORT_GRACE_DAYS, fromPaise, inr, inr2, type InvoiceLine } from "@/lib/pricing";
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
  /**
   * True when our crew shoots the plant (every plan sold from the
   * website). It changes what the customer is told to do next, and
   * getting it wrong is not cosmetic: a plan customer told to "upload
   * your 360° photographs" thinks they have bought software and that
   * the shoot they paid for is not coming.
   */
  crewShoots?: boolean;
}): Promise<boolean> {
  const workspace = `https://${args.slug}.myvpv.com`;
  const credentials = args.tempPassword
    ? `${table(
        row("Sign in at", `<a href="${esc(workspace)}" style="color:#1468D8;font-weight:600;">${esc(args.slug)}.myvpv.com</a>`) +
          row("Your e-mail", esc(args.to)) +
          row("First password", esc(args.tempPassword), true, true)
      )}
       <p ${SMALL}>Please change this password the first time you sign in — your dashboard is in
         <strong>Settings &rsaquo; Password</strong>. If you forget it, &ldquo;Forgot password&rdquo; on the sign-in
         page will send you a fresh link.</p>`
    : `<p ${P}>Sign in at <a href="${esc(workspace)}" style="color:#1468D8;font-weight:600;">${esc(args.slug)}.myvpv.com</a> with your existing VPV password.</p>`;

  const steps = args.crewShoots
    ? `<li>Sign in with the password above and change it.</li>
       <li>Look out for our call: we agree a shoot date for your plant with you.</li>
       <li>On the day, our crew films your plant in a single visit — you carry on working.</li>
       <li>Your VPV appears in this workspace, ready to show to buyers.</li>`
    : `<li>Sign in and change your password.</li>
       <li>Upload your 360° photographs and build your first tour.</li>
       <li>Add your sales team, and present to a customer.</li>`;

  // No BCC here, ever: this message carries the customer's first password, and a
  // copy in a shared inbox would make that inbox a store of customer passwords.
  // The founders see the new customer in /admin/customers and on the invoice copy.
  return sendEmail({
    to: args.to,
    subject: "Your VPV workspace is ready",
    html: emailShell(
      "Welcome to VPV",
      `<p ${P}>Hello ${esc(args.name)}, your workspace for <strong>${esc(args.company)}</strong> is live.
         It is set up for <strong>${args.scenes} area${args.scenes === 1 ? "" : "s"}</strong> of your plant, and your
         support, hosting and security are included free until <strong>${esc(dateStr(args.supportUntil))}</strong>.</p>
       ${credentials}
       <p ${P}>What happens next:</p>
       <ol style="margin:0 0 18px;padding-left:20px;font-size:14px;line-height:1.8;color:#334155;">${steps}</ol>
       <p ${SMALL}>Your tax invoice is in a separate e-mail, with a PDF you can pass to your accounts team.</p>
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
    // The PDF is the invoice; the message body is a covering note. If the
    // PDF cannot be built we still send the note, because a customer who
    // has paid must get something — and the figures are in the body too.
    let attachments: EmailAttachment[] | undefined;
    try {
      const { renderInvoicePdf, invoiceFileName } = await import("@/lib/server/invoicePdf");
      attachments = [
        {
          filename: invoiceFileName(args.invoiceNo),
          content: await renderInvoicePdf(args.doc),
          contentType: "application/pdf",
        },
      ];
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[billing] invoice PDF failed, sending the e-mail without it:", (e as Error)?.message);
    }
    return sendEmail({
      to: args.to,
      bcc: COMPANY.emails.support,
      subject: `Tax invoice ${args.invoiceNo} from VPV`,
      html: emailShell(
        "Your VPV tax invoice",
        invoiceBodyHtml(args.doc, args.name, COMPANY.emails.support, Boolean(attachments))
      ),
      attachments,
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

/**
 * Which reminder this is. The stage comes from the database
 * (vpv_reminder_kind): t30 · t7 · t1 before the end date, d0 … d6 on each day
 * of the grace period, then "locked". A leading L means it is about the Sales
 * Team logins, which can have an end date of their own.
 */
export type ReminderKind = string;

export type ReminderScope = "support" | "both" | "logins";

export type ReminderStage =
  | { stage: "t30" | "t7" | "t1" | "locked"; logins: boolean }
  | { stage: "day"; day: number; logins: boolean };

export function parseReminderKind(kind: string): ReminderStage | null {
  const logins = kind.startsWith("L");
  const k = logins ? kind.slice(1) : kind;
  if (k === "t30" || k === "t7" || k === "t1" || k === "locked") return { stage: k, logins };
  const m = /^d(\d{1,2})$/.exec(k);
  if (m) return { stage: "day", day: Number(m[1]), logins };
  // The five-stage ladder this replaced (a database that has not had
  // supabase/renewal_ladder.sql run yet still hands these out).
  const legacy = /^t([036])$/.exec(k);
  if (legacy) return { stage: "day", day: Number(legacy[1]), logins };
  return null;
}

export type ReminderMail = { subject: string; title: string; body: string; button: string };

/** The words of one reminder. Pure, so every stage can be read and tested. */
export function reminderMail(args: {
  kind: ReminderKind;
  scope: ReminderScope;
  orgName: string;
  /** When what this e-mail is about ends. */
  dueAt: Date | string;
  /** When it stops working if unpaid. */
  locksAt: Date | string;
  supportInr: number;
  seats: number;
  seatInr: number;
}): ReminderMail | null {
  const st = parseReminderKind(args.kind);
  if (!st) return null;
  const org = `<strong>${esc(args.orgName)}</strong>`;
  const due = esc(dateStr(args.dueAt));
  const locks = esc(dateStr(args.locksAt));
  const loginsInr = Math.max(0, args.seats) * Math.max(0, args.seatInr);
  const loginsOnly = args.scope === "logins";
  const withLogins = args.scope === "both" && loginsInr > 0;
  const total = loginsOnly ? loginsInr : args.supportInr + (withLogins ? loginsInr : 0);
  const n = (x: number, one: string, many: string) => `${x} ${x === 1 ? one : many}`;
  const salespeople = n(args.seats, "Sales Team login", "Sales Team logins");

  const what = loginsOnly ? salespeople : withLogins ? "support, hosting and Sales Team logins" : "technical support and hosting";
  const lines = loginsOnly
    ? `${salespeople}: ${esc(inr(loginsInr))} + GST a year`
    : withLogins
      ? `Support, hosting &amp; security: ${esc(inr(args.supportInr))} · ${esc(salespeople)}: ${esc(inr(loginsInr))} — ${esc(inr(total))} + GST a year`
      : `${esc(inr(args.supportInr))} + GST a year`;

  const consequence = loginsOnly
    ? `On <strong>${locks}</strong> your salespeople are switched off. You, your tours and your data keep working, and renewing switches them back on.`
    : withLogins
      ? `On <strong>${locks}</strong> the workspace locks — your dashboard and the tours you have shared stop opening. You can also renew support alone; then only your salespeople are switched off.`
      : `On <strong>${locks}</strong> the workspace locks — your dashboard and the tours you have shared stop opening. Your data is kept, and renewing unlocks everything at once.`;

  const label = `Renew for ${inr(total)} + GST`;
  const left = (day: number) => Math.max(1, SUPPORT_GRACE_DAYS - day);

  switch (st.stage) {
    case "t30":
      return {
        subject: loginsOnly ? "Your VPV Sales Team logins renew in about a month" : "Your VPV renewal is due in about a month",
        title: "Renewal coming up",
        body: `Your ${esc(what)} for ${org} runs until <strong>${due}</strong>. Renewing is ${lines}. Renewing early never loses you a day.`,
        button: label,
      };
    case "t7":
      return {
        subject: loginsOnly ? "Your VPV Sales Team logins renew in a week" : "Your VPV renewal is due in a week",
        title: "One week left",
        body: `Your ${esc(what)} for ${org} ends on <strong>${due}</strong>. Renewing is ${lines}. After that date you get a reminder every day for ${SUPPORT_GRACE_DAYS} days. ${consequence}`,
        button: label,
      };
    case "t1":
      return {
        subject: loginsOnly ? "Your VPV Sales Team logins end tomorrow" : "Your VPV renewal is due tomorrow",
        title: "Due tomorrow",
        body: `Your ${esc(what)} for ${org} ends <strong>tomorrow, ${due}</strong>. Renewing is ${lines}. ${consequence}`,
        button: label,
      };
    case "day": {
      const d = left(st.day);
      return {
        subject: loginsOnly
          ? `Your VPV Sales Team logins stop in ${n(d, "day", "days")} — please renew`
          : `Your VPV workspace locks in ${n(d, "day", "days")} — please renew`,
        title: d === 1 ? "Last day to renew" : `${n(d, "day", "days")} left`,
        body: `Your ${esc(what)} for ${org} ended on <strong>${due}</strong>. ${consequence} Renewing is ${lines}.`,
        button: label,
      };
    }
    case "locked":
      return {
        subject: loginsOnly ? "Your VPV Sales Team logins have been switched off" : "Your VPV workspace is locked",
        title: loginsOnly ? "Salespeople switched off" : "Your workspace is locked",
        body: loginsOnly
          ? `The ${esc(salespeople)} for ${org} ended on <strong>${due}</strong> and were not renewed, so your salespeople can no longer sign in. You, your tours and your data are unaffected. Renew for ${lines} and they work again immediately.`
          : `${org} was not renewed by <strong>${esc(dateStr(args.locksAt))}</strong> and is now locked: your dashboard and the tours you have shared are unavailable. <strong>Your tours and data are kept.</strong> Renew for ${lines} and everything unlocks the moment the payment is confirmed.`,
        button: label,
      };
  }
}

export async function sendSupportReminder(args: {
  to: string;
  orgName: string;
  slug: string;
  kind: ReminderKind;
  scope?: ReminderScope;
  /** When what this e-mail is about ends (the support year, or the logins' own end date). */
  supportUntil: Date | string;
  locksAt: Date | string;
  /** Legacy single price: support plus yearly logins, GST excluded. Used when the parts below are not given. */
  amountInr?: number;
  supportInr?: number;
  seats?: number;
  seatInr?: number;
}): Promise<boolean> {
  const seats = args.seats ?? 0;
  const seatInr = args.seatInr ?? 0;
  const supportInr = args.supportInr ?? (args.amountInr !== undefined ? args.amountInr - seats * seatInr : SUPPORT_ANNUAL_INR);
  const mail = reminderMail({
    kind: args.kind,
    scope: args.scope ?? "support",
    orgName: args.orgName,
    dueAt: args.supportUntil,
    locksAt: args.locksAt,
    supportInr,
    seats,
    seatInr,
  });
  if (!mail) return false;
  const url = `https://${args.slug}.myvpv.com/billing?renew=1`;
  return sendEmail({
    to: args.to,
    bcc: COMPANY.emails.support,
    subject: mail.subject,
    html: emailShell(
      mail.title,
      `<p ${P}>${mail.body}</p>${button(url, mail.button)}
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
      .select("razorpay_payment_id, method, bank, wallet, card_last4, status, created_at")
      .eq("order_id", orderId)
      .in("status", ["captured", "refunded", "partially_refunded"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    // The printed invoice itemises what the order was; the e-mail body does
    // not need it. A database without supabase/invoice_lines.sql, or an
    // order taken before it, returns nothing here and prints one row.
    const { data: ord } = await sb
      .from("billing_orders")
      .select("created_at, buyer_phone, line_items")
      .eq("id", orderId)
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
      orderNo: orderReference(orderId),
      orderedAt: (ord?.created_at as string) ?? null,
      paidAt: (pay?.created_at as string) ?? (inv.issued_at as string) ?? null,
      billToPhone: (ord?.buyer_phone as string) ?? null,
      lines: Array.isArray(ord?.line_items) ? (ord!.line_items as InvoiceLine[]) : [],
    };
  } catch {
    return null; // the plain invoice e-mail is the fallback
  }
}

/**
 * A short order reference a customer can quote on the phone.
 *
 * Derived from the order's own id rather than counted in a second
 * sequence: a sequence is one more thing that can skip, collide or get
 * out of step with the invoice numbers, and this needs to be unique and
 * readable, not consecutive.
 */
export function orderReference(orderId: string): string {
  return `VPV-ORD-${orderId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
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
