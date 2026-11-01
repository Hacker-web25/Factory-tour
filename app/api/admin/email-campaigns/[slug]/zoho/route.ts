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
import { normaliseEmail, ZOHO_REPORT_KINDS, type ZohoReportKind } from "@/lib/emailImport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 3 * 1024 * 1024;
const WRITE_CHUNK = 500;

function isKind(v: unknown): v is ZohoReportKind {
  return typeof v === "string" && (ZOHO_REPORT_KINDS as readonly string[]).includes(v);
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

  if (b.all === true) {
    if (kind !== "sent") return fail(400, "bad_all", "“Everyone” only applies to the sent report.");
    writes = recips.rows.map((r) => ({ code: r.code, sent_at: sentAtDefault, delivered: true, updated_at: now }));
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
      // Every row in one call carries the same keys, so an upsert never nulls a column it was not given.
      switch (kind) {
        case "sent":
          writes.push({ code, sent_at: at, delivered: true, updated_at: now });
          break;
        case "opened":
          writes.push({ code, delivered: true, opened_at: at, open_count: count, updated_at: now });
          break;
        case "clicked":
          writes.push({ code, delivered: true, clicked_at: at, click_count: count, updated_at: now });
          break;
        case "bounced":
          writes.push({ code, delivered: false, bounced: true, bounce_reason: null, updated_at: now });
          break;
        case "unsubscribed":
          writes.push({ code, unsubscribed: true, updated_at: now });
          break;
        case "complained":
          writes.push({ code, complained: true, updated_at: now });
          break;
      }
    }
  }

  for (let i = 0; i < writes.length; i += WRITE_CHUNK) {
    const { error } = await sb.from("email_recipient_stats").upsert(writes.slice(i, i + WRITE_CHUNK), { onConflict: "code" });
    if (error) {
      if (isMissingTable(error)) return fail(409, "migration_needed", EMAIL_MIGRATION_HINT);
      return fail(500, "write_failed", error.message);
    }
  }

  return json({ ok: true, kind, matched: writes.length, notFound, notFoundCount });
}
