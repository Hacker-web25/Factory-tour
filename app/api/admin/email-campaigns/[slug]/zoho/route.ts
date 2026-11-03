/**
 * POST /api/admin/email-campaigns/<slug>/zoho — load what Zoho knows.
 * Platform owner only.
 *
 * Zoho already tracks who was sent the e-mail, who opened it, who clicked,
 * who bounced and who unsubscribed. We do not rebuild that. The owner
 * exports a report from Zoho and uploads it; this matches each row to a
 * recipient by e-mail address and records it. Works on any Zoho plan, and
 * uploading the same report twice changes nothing.
 *
 * Body, one of:
 *   { kind, rows: [{ email, at?, count? }] }   a report
 *   { kind: "sent", all: true }                everyone was sent it
 */

import { fail, json, readJson } from "@/lib/server/billingGuard";
import { ownerGuard } from "@/lib/server/ownerGuard";
import { pageAll } from "@/lib/server/campaignQueries";
import { loadEmailCampaign, isMissingTable, EMAIL_MIGRATION_HINT } from "@/lib/server/emailCampaignDb";
import { kindOfCrmStatus, normaliseEmail, ZOHO_REPORT_KINDS, type ZohoReportKind } from "@/lib/emailImport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 3 * 1024 * 1024;
const WRITE_CHUNK = 500;

/** The per-outcome kinds and the "crm_status" shortcut that carries them all. */
const ALL_KINDS = [...ZOHO_REPORT_KINDS, "crm_status"] as const;
type AnyKind = (typeof ALL_KINDS)[number];
function isKind(v: unknown): v is AnyKind {
  return typeof v === "string" && (ALL_KINDS as readonly string[]).includes(v);
}

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const g = await ownerGuard(req);
  if ("error" in g) return g.error;
  const { sb } = g;

  const read = await readJson(req, MAX_BODY_BYTES);
  if (!read.ok) return fail(read.status, read.error);
  const b = read.body;
  if (!isKind(b.kind)) return fail(400, "bad_kind", "Say which report this is: sent, opened, clicked, bounced or unsubscribed.");
  const kind = b.kind;

  const loaded = await loadEmailCampaign(sb, params.slug);
  if (!loaded.ok) return fail(loaded.status, loaded.error, loaded.message);
  const { folder, email } = loaded;

  const recips = await pageAll<{ code: string; recipient_email: string | null }>((from, to) =>
    sb
      .from("campaign_codes")
      .select("code, recipient_email")
      .eq("folder_id", folder.id)
      .order("code", { ascending: true })
      .range(from, to)
  );
  if (recips.error) return fail(500, "read_failed", recips.error.message);
  const codeOf = new Map<string, string>();
  for (const r of recips.rows) {
    const e = normaliseEmail(r.recipient_email ?? "");
    if (e) codeOf.set(e, r.code);
  }

  const now = new Date().toISOString();
  const sentAtDefault = email.sent_at ?? now;
  const notFound: string[] = [];
  let notFoundCount = 0;
  let writes: Record<string, unknown>[] = [];

  /**
   * Build one write row for one lead's one outcome, so the two body shapes
   * (per-kind and crm_status) share the same writer and the same chunker.
   * The result is only `null` for a status word we did not understand or for
   * "not opened" (which is a non-event).
   */
  function rowFor(k: ZohoReportKind, code: string, at: string, count: number): Record<string, unknown> {
    switch (k) {
      case "sent":
        return { code, sent_at: at, delivered: true, updated_at: now };
      case "opened":
        return { code, delivered: true, opened_at: at, open_count: count, updated_at: now };
      case "clicked":
        return { code, delivered: true, clicked_at: at, click_count: count, updated_at: now };
      case "bounced":
        return { code, delivered: false, bounced: true, bounce_reason: null, updated_at: now };
      case "unsubscribed":
        return { code, unsubscribed: true, updated_at: now };
      case "complained":
        return { code, complained: true, updated_at: now };
    }
  }

  let unknownStatus = 0;

  if (b.all === true) {
    if (kind !== "sent") return fail(400, "bad_all", "“Everyone” only applies to the sent report.");
    writes = recips.rows.map((r) => ({ code: r.code, sent_at: sentAtDefault, delivered: true, updated_at: now }));
  } else if (kind === "crm_status") {
    // Zoho CRM mass-email export: {email, status, at?} per row. One row per lead;
    // the status cell says what happened. "Opened" and "Clicked" also imply the
    // mail was sent — we write a sent row too so the funnel in the UI is honest
    // when the exporter did not include a Delivered column.
    const rows = Array.isArray(b.rows) ? (b.rows as { email?: unknown; status?: unknown; at?: unknown }[]) : [];
    if (!rows.length) return fail(400, "no_rows", "The report had no leads in it.");
    for (const r of rows) {
      const e = normaliseEmail(r.email);
      if (!e) continue;
      const code = codeOf.get(e);
      if (!code) {
        notFoundCount += 1;
        if (notFound.length < 20) notFound.push(e);
        continue;
      }
      const status = typeof r.status === "string" ? r.status : "";
      const k = kindOfCrmStatus(status);
      if (k === undefined) {
        unknownStatus += 1;
        continue;
      }
      const at = typeof r.at === "string" && !Number.isNaN(Date.parse(r.at)) ? new Date(r.at).toISOString() : now;
      if (k === null) {
        // "Not opened" — the e-mail reached them but they did not open it.
        writes.push(rowFor("sent", code, at, 1));
        continue;
      }
      writes.push(rowFor(k, code, at, 1));
      if (k === "opened" || k === "clicked") {
        // Imply "sent" so segments like "Did not open" are correct.
        writes.push(rowFor("sent", code, at, 1));
      }
    }
  } else {
    const rows = Array.isArray(b.rows) ? (b.rows as { email?: unknown; at?: unknown; count?: unknown }[]) : [];
    if (!rows.length) return fail(400, "no_rows", "The report had no e-mail addresses in it.");
    for (const r of rows) {
      const e = normaliseEmail(r.email);
      if (!e) continue;
      const code = codeOf.get(e);
      if (!code) {
        notFoundCount += 1;
        if (notFound.length < 20) notFound.push(e);
        continue;
      }
      const at = typeof r.at === "string" && !Number.isNaN(Date.parse(r.at)) ? new Date(r.at).toISOString() : now;
      const count = Number.isInteger(Number(r.count)) && Number(r.count) > 0 ? Math.min(Number(r.count), 100_000) : 1;
      writes.push(rowFor(kind, code, at, count));
    }
  }

  /**
   * Dedup within one call. Zoho CRM reports can list the same lead on several
   * rows (one Opened, one Clicked), and the "crm_status" branch above adds its
   * own implied-sent rows. An upsert with onConflict:code only applies the LAST
   * conflicting row from each batch, so without this dedup the row's columns
   * would be whichever outcome happened to appear last — and that could overwrite
   * `opened_at` with a later-in-batch sent row that carries no opened_at.
   *
   * We merge in order: writes further down in the array are applied on top,
   * which preserves "Clicked implies Sent" (Clicked wins), and preserves per-kind
   * fields (opened_at from Opened survives alongside delivered from Sent).
   */
  const merged = new Map<string, Record<string, unknown>>();
  for (const w of writes) {
    const code = String(w.code);
    const prev = merged.get(code) ?? {};
    merged.set(code, { ...prev, ...w, updated_at: now });
  }
  const mergedRows = Array.from(merged.values());

  for (let i = 0; i < mergedRows.length; i += WRITE_CHUNK) {
    const { error } = await sb.from("email_recipient_stats").upsert(mergedRows.slice(i, i + WRITE_CHUNK), { onConflict: "code" });
    if (error) {
      if (isMissingTable(error)) return fail(409, "migration_needed", EMAIL_MIGRATION_HINT);
      return fail(500, "write_failed", error.message);
    }
  }

  return json({ ok: true, kind, matched: mergedRows.length, notFound, notFoundCount, unknownStatus });
}
