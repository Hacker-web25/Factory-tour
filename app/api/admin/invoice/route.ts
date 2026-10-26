/**
 * GET /api/admin/invoice?order=<uuid>   → the tax invoice as a PDF
 * GET /api/admin/invoice?export=2026-27 → every invoice of a financial
 *                                         year as CSV, for the accountant
 *
 * Platform owner only.
 *
 * WHY the export exists: VPV invoices are numbered and stored by the
 * website, while the rest of The Next Design's sales live in a
 * spreadsheet. The one thing that must never happen is the same sale
 * being entered twice, or a VPV invoice being missed, in the GST return.
 * So the accountant gets one file a month with every VPV invoice in it —
 * and the export checks its own numbering for gaps before handing it over,
 * because a consecutive series is what the law actually asks for.
 */

import { authenticateRequest } from "@/lib/server/requestAuth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail } from "@/lib/server/billingGuard";
import { loadInvoiceDoc } from "@/lib/server/billingEmails";
import { invoiceFileName, renderInvoicePdf } from "@/lib/server/invoicePdf";
import { fromPaise } from "@/lib/pricing";
import { missingNumbers } from "@/lib/billingDocs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const auth = await authenticateRequest(req);
  if (!auth) return fail(401, "unauthorized");
  if (auth.profile.role !== "owner") return fail(403, "forbidden", "Platform owner only.");
  const sb = supabaseAdmin();
  if (!sb) return fail(503, "not_configured", "SUPABASE_SERVICE_ROLE_KEY is not set.");

  const url = new URL(req.url);
  const fy = url.searchParams.get("export");
  if (fy) return exportCsv(sb, fy);

  const orderId = (url.searchParams.get("order") ?? "").trim();
  if (!UUID.test(orderId)) return fail(400, "bad_order", "Pass ?order=<order id>.");

  const doc = await loadInvoiceDoc(sb, orderId);
  if (!doc) return fail(404, "no_invoice", "That order has no invoice yet.");

  const pdf = await renderInvoicePdf(doc);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoiceFileName(doc.invoiceNo)}"`,
      "Cache-Control": "no-store",
    },
  });
}

type Row = {
  invoice_no: string;
  issued_at: string;
  bill_to_name: string;
  bill_to_gstin: string | null;
  bill_to_state: string | null;
  place_of_supply: string | null;
  sac_code: string | null;
  description: string;
  taxable_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
  total_paise: number;
  order_id: string;
};

const csvCell = (v: unknown): string => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function exportCsv(sb: NonNullable<ReturnType<typeof supabaseAdmin>>, fy: string): Promise<Response> {
  if (!/^\d{4}-\d{2}$/.test(fy)) return fail(400, "bad_year", "Use a financial year like 2026-27.");

  const { data, error } = await sb
    .from("billing_invoices")
    .select(
      "invoice_no, issued_at, bill_to_name, bill_to_gstin, bill_to_state, place_of_supply, sac_code, description, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, order_id"
    )
    .eq("fy", fy)
    .order("invoice_no", { ascending: true })
    .limit(10000);
  if (error) return fail(500, "read_failed", error.message);

  const rows = (data ?? []) as Row[];
  const header = [
    "Invoice no",
    "Invoice date",
    "Customer",
    "Customer GSTIN",
    "Place of supply",
    "SAC",
    "Description",
    "Taxable value",
    "CGST",
    "SGST",
    "IGST",
    "Total",
    "Order id",
  ];
  const body = rows.map((r) =>
    [
      r.invoice_no,
      new Date(r.issued_at).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" }),
      r.bill_to_name,
      r.bill_to_gstin ?? "",
      r.place_of_supply ?? r.bill_to_state ?? "",
      r.sac_code ?? "",
      r.description,
      fromPaise(r.taxable_paise).toFixed(2),
      fromPaise(r.cgst_paise).toFixed(2),
      fromPaise(r.sgst_paise).toFixed(2),
      fromPaise(r.igst_paise).toFixed(2),
      fromPaise(r.total_paise).toFixed(2),
      r.order_id,
    ]
      .map(csvCell)
      .join(",")
  );

  // Totals the accountant can tick against the return, then the gap check.
  const sum = (k: keyof Row) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  body.push("");
  body.push(
    [`TOTAL (${rows.length} invoices)`, "", "", "", "", "", "", fromPaise(sum("taxable_paise")).toFixed(2), fromPaise(sum("cgst_paise")).toFixed(2), fromPaise(sum("sgst_paise")).toFixed(2), fromPaise(sum("igst_paise")).toFixed(2), fromPaise(sum("total_paise")).toFixed(2), ""]
      .map(csvCell)
      .join(",")
  );
  const gaps = missingNumbers(rows.map((r) => r.invoice_no));
  body.push("");
  body.push(
    csvCell(
      gaps.length === 0
        ? `Numbering checked: ${rows.length === 0 ? "no invoices yet" : `1 to ${rows.length}, none missing`}.`
        : `NUMBERING GAP — these numbers were allocated but have no invoice: ${gaps.join(", ")}. Tell VPV before filing.`
    )
  );

  const csv = [header.map(csvCell).join(","), ...body].join("\n");
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="VPV-invoices-${fy}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
