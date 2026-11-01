/**
 * /api/admin/email-campaigns/<slug> — one e-mail campaign. Platform owner only.
 *
 *   GET    the e-mail's settings, the shared coupon and how much of it is
 *          used, every recipient, and what Zoho has told us about each one.
 *          The website side (who clicked, read, paid) comes from the
 *          campaign route, which already knows how to compute it.
 *   PATCH  edit the e-mail text, the send time, and the coupon: how many days
 *          it lasts, its use limit, or switch it off.
 */

import { clean, fail, json, readJson } from "@/lib/server/billingGuard";
import { ownerGuard } from "@/lib/server/ownerGuard";
import { pageAll } from "@/lib/server/campaignQueries";
import { couponUses } from "@/lib/server/coupons";
import { loadEmailCampaign, loadStats, isMissingTable, EMAIL_MIGRATION_HINT } from "@/lib/server/emailCampaignDb";
import { couponExpiry } from "@/lib/emailCampaign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;

type RecipientRow = {
  code: string;
  person_name: string | null;
  person_company: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  print_seq: number | null;
};

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const g = await ownerGuard(req);
  if ("error" in g) return g.error;
  const { sb } = g;

  const loaded = await loadEmailCampaign(sb, params.slug);
  if (!loaded.ok) return fail(loaded.status, loaded.error, loaded.message);
  const { folder, email } = loaded;

  const recips = await pageAll<RecipientRow>((from, to) =>
    sb
      .from("campaign_codes")
      .select("code, person_name, person_company, recipient_email, recipient_phone, print_seq")
      .eq("folder_id", folder.id)
      .order("print_seq", { ascending: true })
      .range(from, to)
  );
  if (recips.error) return fail(500, "read_failed", recips.error.message);

  const stats = await loadStats(sb, recips.rows.map((r) => r.code));
  if (!stats.ok) {
    if (isMissingTable(stats.error)) return fail(409, "migration_needed", EMAIL_MIGRATION_HINT);
    return fail(500, "read_failed", stats.error.message);
  }

  let coupon: {
    code: string;
    percentOff: number | null;
    amountOffInr: number | null;
    maxUses: number | null;
    expiresAt: string | null;
    active: boolean;
    uses: number | null;
  } | null = null;
  if (email.coupon_code) {
    const c = await sb
      .from("coupons")
      .select("code, percent_off, amount_off_inr, max_uses, expires_at, active")
      .eq("code", email.coupon_code)
      .maybeSingle();
    if (c.error) return fail(500, "read_failed", c.error.message);
    if (c.data) {
      const row = c.data as {
        code: string;
        percent_off: number | null;
        amount_off_inr: number | null;
        max_uses: number | null;
        expires_at: string | null;
        active: boolean;
      };
      coupon = {
        code: row.code,
        percentOff: row.percent_off,
        amountOffInr: row.amount_off_inr,
        maxUses: row.max_uses,
        expiresAt: row.expires_at,
        active: row.active,
        uses: await couponUses(sb, row.code),
      };
    }
  }

  return json({
    ok: true,
    campaign: {
      slug: folder.slug,
      name: folder.name,
      destination: folder.destination,
      createdAt: folder.created_at,
      zohoCampaignName: email.zoho_campaign_name,
      subject: email.subject,
      preheader: email.preheader,
      bodyText: email.body_text,
      sentAt: email.sent_at,
      couponDays: email.coupon_days,
    },
    coupon,
    recipients: recips.rows.map((r) => ({
      code: r.code,
      email: r.recipient_email ?? "",
      name: r.person_name,
      company: r.person_company,
      phone: r.recipient_phone,
    })),
    stats: Object.fromEntries(stats.stats),
    truncated: recips.truncated,
  });
}

export async function PATCH(req: Request, { params }: { params: { slug: string } }) {
  const g = await ownerGuard(req);
  if ("error" in g) return g.error;
  const { sb } = g;

  const read = await readJson(req, MAX_BODY_BYTES);
  if (!read.ok) return fail(read.status, read.error);
  const b = read.body;

  const loaded = await loadEmailCampaign(sb, params.slug);
  if (!loaded.ok) return fail(loaded.status, loaded.error, loaded.message);
  const { folder, email } = loaded;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.subject !== undefined) patch.subject = clean(b.subject, 200) || null;
  if (b.preheader !== undefined) patch.preheader = clean(b.preheader, 200) || null;
  if (b.bodyText !== undefined) patch.body_text = clean(b.bodyText, 20_000) || null;
  if (b.zohoCampaignName !== undefined) patch.zoho_campaign_name = clean(b.zohoCampaignName, 120) || null;

  let sentAt = email.sent_at ? new Date(email.sent_at) : new Date(folder.created_at);
  if (b.sentAt !== undefined) {
    const t = typeof b.sentAt === "string" ? Date.parse(b.sentAt) : NaN;
    if (Number.isNaN(t)) return fail(400, "bad_date", "The send time is not a date.");
    sentAt = new Date(t);
    patch.sent_at = sentAt.toISOString();
  }

  let days = email.coupon_days;
  if (b.couponDays !== undefined) {
    const n = Number(b.couponDays);
    if (!Number.isInteger(n) || n < 1 || n > 365) {
      return fail(400, "bad_coupon_days", "The coupon must be valid for a whole number of days, 1 to 365.");
    }
    days = n;
    patch.coupon_days = n;
  }

  const couponPatch: Record<string, unknown> = {};
  if (email.coupon_code) {
    // The coupon runs for `days` days from the send time, so changing either one moves the end.
    if ((b.couponDays !== undefined || b.sentAt !== undefined) && days) {
      couponPatch.expires_at = couponExpiry(sentAt, days).toISOString();
    }
    if (b.couponMaxUses !== undefined) {
      if (b.couponMaxUses === null || b.couponMaxUses === "") couponPatch.max_uses = null;
      else {
        const n = Number(b.couponMaxUses);
        if (!Number.isInteger(n) || n < 1 || n > 1_000_000) {
          return fail(400, "bad_coupon_uses", "The use limit must be a whole number, or empty for no limit.");
        }
        couponPatch.max_uses = n;
      }
    }
    if (typeof b.couponActive === "boolean") couponPatch.active = b.couponActive;
  } else if (b.couponDays !== undefined || b.couponMaxUses !== undefined || b.couponActive !== undefined) {
    return fail(400, "no_coupon", "This campaign has no coupon.");
  }

  const upd = await sb.from("email_campaigns").update(patch).eq("folder_id", folder.id);
  if (upd.error) return fail(500, "write_failed", upd.error.message);
  if (Object.keys(couponPatch).length && email.coupon_code) {
    const c = await sb.from("coupons").update(couponPatch).eq("code", email.coupon_code);
    if (c.error) return fail(500, "write_failed", c.error.message);
  }
  if (b.sentAt !== undefined) {
    await sb.from("campaign_folders").update({ distributed_at: sentAt.toISOString().slice(0, 10) }).eq("id", folder.id);
  }

  return json({ ok: true });
}
