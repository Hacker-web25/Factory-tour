/**
 * /api/admin/marketing/folders/<slug>/people/<code> — one person, in full.
 * Platform owner only.
 *
 *   GET    the whole journey: every visit, page, click and form field, what
 *          they told us, whether they paid, and where the follow-up stands.
 *   PATCH  what only a human knows: who called, what was said, when to call
 *          back, and a phone number or email learned on the phone.
 *
 * The code must belong to the folder in the URL. A code from another run is
 * "not found" here, so a mistyped link never shows the wrong person.
 */

import { clean, fail, json, readJson, validEmail } from "@/lib/server/billingGuard";
import { ownerGuard, isMissingColumn } from "@/lib/server/ownerGuard";
import { isOutreachState, type FolderCodeRow, type FolderRow } from "@/lib/campaignFolders";
import { personJourney, type JourneyLeadRow, type JourneyOrderRow } from "@/lib/personJourney";
import {
  CODE_COLS,
  FOLDER_COLS,
  LEAD_COLS_FULL,
  MIGRATION_HINT as MIGRATION,
  ORDER_COLS_FULL,
  loadCampaignBundle,
} from "@/lib/server/campaignQueries";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/;

type Params = { params: { slug: string; code: string } };

async function find(sb: SupabaseClient, slugRaw: string, codeRaw: string) {
  const slug = clean(slugRaw, 60);
  const code = clean(codeRaw, 48);
  if (!slug) return { error: fail(400, "bad_slug") } as const;
  if (!CODE_RE.test(code)) return { error: fail(400, "bad_code") } as const;

  const f = await sb.from("campaign_folders").select(FOLDER_COLS).eq("slug", slug).maybeSingle();
  if (f.error) {
    if (isMissingColumn(f.error) || /campaign_folders/.test(f.error.message)) {
      return { error: fail(409, "migration_needed", MIGRATION) } as const;
    }
    return { error: fail(500, "read_failed", f.error.message) } as const;
  }
  const folder = f.data as FolderRow | null;
  if (!folder) return { error: fail(404, "not_found", "No campaign by that name.") } as const;

  const c = await sb
    .from("campaign_codes")
    .select(CODE_COLS)
    .eq("code", code)
    .eq("folder_id", folder.id)
    .maybeSingle();
  if (c.error) {
    if (isMissingColumn(c.error)) return { error: fail(409, "migration_needed", MIGRATION) } as const;
    return { error: fail(500, "read_failed", c.error.message) } as const;
  }
  const row = c.data as FolderCodeRow | null;
  if (!row) return { error: fail(404, "not_found", "That person is not in this campaign.") } as const;

  return { folder, code: row } as const;
}

export async function GET(req: Request, { params }: Params) {
  const g = await ownerGuard(req);
  if ("error" in g) return g.error;
  const { sb } = g;

  const found = await find(sb, params.slug, params.code);
  if ("error" in found) return found.error;
  const { folder, code } = found;

  const loaded = await loadCampaignBundle<JourneyLeadRow, JourneyOrderRow>(sb, [code.code], {
    events: true,
    leadCols: LEAD_COLS_FULL,
    orderCols: ORDER_COLS_FULL,
  });
  if (!loaded.ok) {
    if (isMissingColumn(loaded.error)) return fail(409, "migration_needed", MIGRATION);
    return fail(500, "read_failed", loaded.error.message);
  }
  const { scans, visitors, events, leads, orders, truncated } = loaded.bundle;

  return json({
    ok: true,
    truncated,
    journey: personJourney({ folder, code, scans, visitors, events, leads, orders }),
  });
}

export async function PATCH(req: Request, { params }: Params) {
  const g = await ownerGuard(req);
  if ("error" in g) return g.error;
  const { sb } = g;

  const read = await readJson(req, MAX_BODY_BYTES);
  if (!read.ok) return fail(read.status, read.error);
  const b = read.body;

  const found = await find(sb, params.slug, params.code);
  if ("error" in found) return found.error;
  const { code } = found;

  const patch: Record<string, unknown> = {};

  /* ── follow-up ──────────────────────────────────────────────────────── */
  if (b.outreachState !== undefined) {
    const s = clean(b.outreachState, 20);
    if (!isOutreachState(s)) return fail(400, "bad_state", "Unknown follow-up status.");
    patch.outreach_state = s;
    // Moving off "not contacted" stamps the first contact, once. It is the
    // time of the first attempt, so a later change of status does not move it.
    if (s !== "new" && !code.contacted_at && b.contactedAt === undefined) {
      patch.contacted_at = new Date().toISOString();
    }
  }
  if (b.contactedAt !== undefined) {
    if (b.contactedAt === null || b.contactedAt === "") {
      patch.contacted_at = null;
    } else {
      const t = Date.parse(clean(b.contactedAt, 40));
      if (Number.isNaN(t)) return fail(400, "bad_date", "That contact time is not a date.");
      patch.contacted_at = new Date(t).toISOString();
    }
  }
  if (b.followUpOn !== undefined) {
    const d = clean(b.followUpOn, 20);
    if (!d) patch.follow_up_on = null;
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) {
      return fail(400, "bad_date", "The call-back date must look like 2026-10-28.");
    } else patch.follow_up_on = d;
  }
  if (b.repNotes !== undefined) {
    // Keep the line breaks: notes are written to be read as notes.
    const raw = typeof b.repNotes === "string" ? b.repNotes : "";
    const text = raw
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/\r\n?/g, "\n")
      .trim();
    if (text.length > 4000) return fail(400, "notes_too_long", "Notes can run to 4,000 characters.");
    patch.rep_notes = text || null;
  }

  /* ── what was learned on the phone ──────────────────────────────────── */
  if (b.phone !== undefined) {
    const raw = clean(b.phone, 40);
    if (!raw) patch.recipient_phone = null;
    else {
      const digits = raw.replace(/\D/g, "");
      if (!/^[+\d][\d\s()-]*$/.test(raw) || digits.length < 7 || digits.length > 15) {
        return fail(400, "bad_phone", "That does not look like a phone number.");
      }
      patch.recipient_phone = raw;
    }
  }
  if (b.email !== undefined) {
    const e = clean(b.email, 254).toLowerCase();
    if (!e) patch.recipient_email = null;
    else if (!validEmail(e)) return fail(400, "bad_email", "That does not look like an email address.");
    else patch.recipient_email = e;
  }
  if (b.role !== undefined) patch.recipient_role = clean(b.role, 80) || null;
  if (b.company !== undefined) patch.person_company = clean(b.company, 120) || null;

  if (!Object.keys(patch).length) return fail(400, "nothing_to_change", "Nothing to save.");

  const { error } = await sb
    .from("campaign_codes")
    .update(patch)
    .eq("code", code.code)
    .eq("folder_id", code.folder_id as string);
  if (error) {
    if (isMissingColumn(error)) return fail(409, "migration_needed", MIGRATION);
    return fail(500, "write_failed", error.message);
  }

  const after = await sb.from("campaign_codes").select(CODE_COLS).eq("code", code.code).maybeSingle();
  return json({ ok: true, code: after.data });
}
