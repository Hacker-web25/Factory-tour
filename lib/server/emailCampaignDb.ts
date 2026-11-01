/**
 * lib/server/emailCampaignDb.ts — shared reads for the e-mail campaign routes.
 * SERVER ONLY.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { clean } from "@/lib/server/billingGuard";
import { CHUNK, FOLDER_COLS } from "@/lib/server/campaignQueries";
import type { FolderRow } from "@/lib/campaignFolders";
import type { ZohoStats } from "@/lib/emailCampaign";

export const EMAIL_MIGRATION_HINT =
  "E-mail campaigns need two new tables. Run supabase/email_campaigns.sql once in the Supabase SQL editor, then try again.";

/** The table (or its schema-cache entry) is not there: the migration has not been run. */
export function isMissingTable(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return (
    err.code === "42P01" ||
    err.code === "PGRST205" ||
    /relation .* does not exist|could not find the table|schema cache/i.test(err.message ?? "")
  );
}

export type EmailCampaignRow = {
  folder_id: string;
  zoho_campaign_name: string | null;
  subject: string | null;
  preheader: string | null;
  body_text: string | null;
  sent_at: string | null;
  coupon_code: string | null;
  coupon_days: number | null;
  created_at: string;
};

export const EMAIL_CAMPAIGN_COLS =
  "folder_id, zoho_campaign_name, subject, preheader, body_text, sent_at, coupon_code, coupon_days, created_at";

export type LoadedEmailCampaign =
  | { ok: true; folder: FolderRow; email: EmailCampaignRow }
  | { ok: false; status: number; error: string; message?: string };

/** The folder and its e-mail settings, or the reason there is no such e-mail campaign. */
export async function loadEmailCampaign(sb: SupabaseClient, rawSlug: string): Promise<LoadedEmailCampaign> {
  const slug = clean(rawSlug, 60);
  if (!slug) return { ok: false, status: 400, error: "bad_slug" };
  const f = await sb.from("campaign_folders").select(FOLDER_COLS).eq("slug", slug).maybeSingle();
  if (f.error) return { ok: false, status: 500, error: "read_failed", message: f.error.message };
  if (!f.data) return { ok: false, status: 404, error: "not_found", message: "No campaign by that name." };
  const folder = f.data as unknown as FolderRow;

  const e = await sb.from("email_campaigns").select(EMAIL_CAMPAIGN_COLS).eq("folder_id", folder.id).maybeSingle();
  if (e.error) {
    if (isMissingTable(e.error)) return { ok: false, status: 409, error: "migration_needed", message: EMAIL_MIGRATION_HINT };
    return { ok: false, status: 500, error: "read_failed", message: e.error.message };
  }
  if (!e.data) {
    return { ok: false, status: 404, error: "not_email", message: "That campaign was not made as an e-mail campaign." };
  }
  return { ok: true, folder, email: e.data as unknown as EmailCampaignRow };
}

type StatsRow = {
  code: string;
  sent_at: string | null;
  delivered: boolean;
  opened_at: string | null;
  open_count: number;
  clicked_at: string | null;
  click_count: number;
  bounced: boolean;
  bounce_reason: string | null;
  unsubscribed: boolean;
  complained: boolean;
};

/** What Zoho has told us about each code, in chunks so the request stays short. */
export async function loadStats(
  sb: SupabaseClient,
  codes: string[]
): Promise<{ ok: true; stats: Map<string, ZohoStats> } | { ok: false; error: { code?: string; message: string } }> {
  const stats = new Map<string, ZohoStats>();
  for (let i = 0; i < codes.length; i += CHUNK) {
    const { data, error } = await sb
      .from("email_recipient_stats")
      .select("code, sent_at, delivered, opened_at, open_count, clicked_at, click_count, bounced, bounce_reason, unsubscribed, complained")
      .in("code", codes.slice(i, i + CHUNK));
    if (error) return { ok: false, error };
    for (const r of (data ?? []) as unknown as StatsRow[]) {
      stats.set(r.code, {
        sent: r.sent_at !== null || r.delivered,
        delivered: r.delivered,
        openedAt: r.opened_at,
        openCount: r.open_count,
        clickedAt: r.clicked_at,
        clickCount: r.click_count,
        bounced: r.bounced,
        bounceReason: r.bounce_reason,
        unsubscribed: r.unsubscribed,
        complained: r.complained,
      });
    }
  }
  return { ok: true, stats };
}
