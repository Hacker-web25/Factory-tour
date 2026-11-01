/**
 * POST /api/admin/email-campaigns — create an e-mail campaign from a list.
 * Platform owner only.
 *
 * One call does the whole set-up, all or nothing:
 *   1. a campaign folder (channel "email") named like the campaign in Zoho,
 *   2. ONE shared coupon (code, discount, use limit, expiry = send time + N
 *      days), not a coupon per person,
 *   3. one tracked code per recipient, with their e-mail address kept so
 *      Zoho's reports can be matched back to the person,
 *   4. the e-mail's own settings (subject, text, Zoho name).
 *
 * If any step fails after the folder exists, everything made so far is
 * removed again, so a retry never trips over half a campaign.
 *
 * The list is checked again here even though the browser already did: the
 * browser is not trusted.
 */

import { clean, fail, json, readJson } from "@/lib/server/billingGuard";
import { ownerGuard, isMissingColumn } from "@/lib/server/ownerGuard";
import { isSafePath } from "@/lib/analytics/attribution";
import { folderSlug } from "@/lib/campaignFolders";
import { EMAIL_CODE_PREFIX, makeCodes, personLabel } from "@/lib/personCodes";
import { MAX_EMAIL_PEOPLE, nameFromEmail, normaliseEmail } from "@/lib/emailImport";
import { couponExpiry } from "@/lib/emailCampaign";
import { normaliseCouponCode } from "@/lib/server/coupons";
import { EMAIL_MIGRATION_HINT, isMissingTable } from "@/lib/server/emailCampaignDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 10,000 people at ~200 bytes each, with room. Vercel's own cap is 4.5 MB. */
const MAX_BODY_BYTES = 3 * 1024 * 1024;
const INSERT_CHUNK = 500;

type InRecipient = { email?: unknown; name?: unknown; company?: unknown; phone?: unknown };

export async function POST(req: Request) {
  const g = await ownerGuard(req);
  if ("error" in g) return g.error;
  const { sb } = g;

  const read = await readJson(req, MAX_BODY_BYTES);
  if (!read.ok) return fail(read.status, read.error);
  const b = read.body;

  /* ── the list ───────────────────────────────────────────────────────── */
  const raw = Array.isArray(b.recipients) ? (b.recipients as InRecipient[]) : [];
  if (!raw.length) return fail(400, "no_people", "The file had no valid e-mail addresses in it.");
  if (raw.length > MAX_EMAIL_PEOPLE) {
    return fail(400, "too_many", `A campaign holds up to ${MAX_EMAIL_PEOPLE.toLocaleString("en-IN")} people. Split the file.`);
  }
  const seen = new Set<string>();
  const people: { email: string; name: string; company: string | null; phone: string | null }[] = [];
  for (const r of raw) {
    const email = normaliseEmail(r.email);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    people.push({
      email,
      name: clean(r.name, 80) || nameFromEmail(email),
      company: clean(r.company, 80) || null,
      phone: /^[6-9]\d{9}$/.test(clean(r.phone, 12)) ? clean(r.phone, 12) : null,
    });
  }
  if (!people.length) return fail(400, "no_people", "The file had no valid e-mail addresses in it.");

  /* ── the campaign ───────────────────────────────────────────────────── */
  const name = clean(b.name, 120);
  if (!name) return fail(400, "bad_name", "Give the campaign the same name it has in Zoho.");
  const slug = folderSlug(clean(b.slug, 60) || name);
  if (!slug) return fail(400, "bad_slug", "That name has no letters or digits in it; give it a plainer one.");

  const destination = clean(b.destination, 300) || "/";
  if (!isSafePath(destination)) {
    return fail(400, "bad_destination", "The landing page must be a path on myvpv.com, like /plans.");
  }

  let sentAt = new Date();
  if (typeof b.sentAt === "string" && b.sentAt.trim()) {
    const t = Date.parse(b.sentAt);
    if (Number.isNaN(t)) return fail(400, "bad_date", "The send time is not a date.");
    sentAt = new Date(t);
  }

  /* ── the shared coupon, if there is one ─────────────────────────────── */
  type CouponIn = { code?: unknown; kind?: unknown; value?: unknown; days?: unknown; maxUses?: unknown };
  const c = (b.coupon && typeof b.coupon === "object" ? (b.coupon as CouponIn) : null);
  let coupon: {
    code: string;
    percent_off: number | null;
    amount_off_inr: number | null;
    max_uses: number | null;
    expires_at: string;
    days: number;
  } | null = null;
  if (c) {
    const code = normaliseCouponCode(c.code);
    if (!code) {
      return fail(400, "bad_coupon", "The coupon code must be 3 to 24 letters, digits, - or _, like DIWALI50.");
    }
    const value = Number(c.value);
    const days = Number(c.days);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return fail(400, "bad_coupon_days", "The coupon must be valid for a whole number of days, 1 to 365.");
    }
    const percent = c.kind === "percent";
    if (percent ? !(Number.isInteger(value) && value >= 1 && value <= 100) : !(Number.isInteger(value) && value >= 1 && value <= 10_000_000)) {
      return fail(400, "bad_coupon_value", percent ? "A percent off must be a whole number from 1 to 100." : "An amount off must be a whole number of rupees.");
    }
    let maxUses: number | null = null;
    if (c.maxUses !== null && c.maxUses !== undefined && c.maxUses !== "") {
      maxUses = Number(c.maxUses);
      if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1_000_000) {
        return fail(400, "bad_coupon_uses", "The use limit must be a whole number, or empty for no limit.");
      }
    }
    coupon = {
      code,
      percent_off: percent ? value : null,
      amount_off_inr: percent ? null : value,
      max_uses: maxUses,
      expires_at: couponExpiry(sentAt, days).toISOString(),
      days,
    };
  }

  /* ── make sure the migration has been run, before writing anything ──── */
  const probe = await sb.from("email_campaigns").select("folder_id").limit(1);
  if (probe.error) {
    if (isMissingTable(probe.error)) return fail(409, "migration_needed", EMAIL_MIGRATION_HINT);
    return fail(500, "read_failed", probe.error.message);
  }

  if (coupon) {
    const exists = await sb.from("coupons").select("code").eq("code", coupon.code).maybeSingle();
    if (exists.error) return fail(500, "read_failed", exists.error.message);
    if (exists.data) {
      return fail(409, "coupon_taken", `The coupon code ${coupon.code} already exists. Pick a different one.`);
    }
  }

  // Every code already in use, so a new one can never collide.
  const existing = await sb.from("campaign_codes").select("code").limit(200_000);
  if (existing.error) return fail(500, "read_failed", existing.error.message);
  const taken = new Set((existing.data ?? []).map((r) => String((r as { code: string }).code).toUpperCase()));
  let codes: string[];
  try {
    codes = makeCodes(people.length, EMAIL_CODE_PREFIX, taken);
  } catch {
    return fail(500, "no_codes", "Could not find enough unused codes. Try again.");
  }

  /* ── write, and undo on any failure ─────────────────────────────────── */
  const made = await sb
    .from("campaign_folders")
    .insert({
      slug,
      name,
      city: clean(b.city, 80) || null,
      state: null,
      channel: "email",
      destination,
      printed_count: people.length,
      distributed_at: sentAt.toISOString().slice(0, 10),
      notes: clean(b.notes, 2_000) || null,
    })
    .select("id, slug, name")
    .single();
  if (made.error) {
    if (/duplicate key|unique/i.test(made.error.message)) {
      return fail(409, "slug_taken", `There is already a campaign called “${slug}”. Give this one a different name.`);
    }
    if (isMissingColumn(made.error) || /campaign_folders/.test(made.error.message)) {
      return fail(409, "migration_needed", "Run supabase/campaign_folders.sql in the Supabase SQL editor.");
    }
    return fail(500, "write_failed", made.error.message);
  }
  const folder = made.data as { id: string; slug: string; name: string };

  let couponMade = false;
  const undo = async () => {
    await sb.from("campaign_codes").delete().eq("folder_id", folder.id);
    await sb.from("campaign_folders").delete().eq("id", folder.id); // cascades email_campaigns
    if (couponMade && coupon) await sb.from("coupons").delete().eq("code", coupon.code);
  };

  if (coupon) {
    const { error } = await sb.from("coupons").insert({
      code: coupon.code,
      percent_off: coupon.percent_off,
      amount_off_inr: coupon.amount_off_inr,
      max_uses: coupon.max_uses,
      expires_at: coupon.expires_at,
      active: true,
      note: `E-mail campaign: ${name}`,
    });
    if (error) {
      await undo();
      return fail(500, "write_failed", error.message);
    }
    couponMade = true;
  }

  const rows = people.map((p, i) => ({
    code: codes[i]!,
    label: personLabel({ name: p.name, company: p.company }),
    destination,
    source: "email",
    medium: "email",
    campaign: name,
    person_name: p.name,
    person_company: p.company,
    recipient_email: p.email,
    recipient_phone: p.phone,
    folder_id: folder.id,
    print_seq: i + 1,
  }));
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const { error } = await sb.from("campaign_codes").insert(rows.slice(i, i + INSERT_CHUNK));
    if (error) {
      await undo();
      if (isMissingColumn(error)) return fail(409, "migration_needed", "Run supabase/campaign_folders.sql in the Supabase SQL editor.");
      return fail(500, "write_failed", error.message);
    }
  }

  const ec = await sb.from("email_campaigns").insert({
    folder_id: folder.id,
    zoho_campaign_name: clean(b.zohoName, 120) || name,
    subject: clean(b.subject, 200) || null,
    preheader: clean(b.preheader, 200) || null,
    body_text: clean(b.bodyText, 20_000) || null,
    sent_at: sentAt.toISOString(),
    coupon_code: coupon?.code ?? null,
    coupon_days: coupon?.days ?? null,
  });
  if (ec.error) {
    await undo();
    return fail(500, "write_failed", ec.error.message);
  }

  return json({
    ok: true,
    slug: folder.slug,
    count: people.length,
    coupon: coupon ? { code: coupon.code, expiresAt: coupon.expires_at } : null,
  });
}
