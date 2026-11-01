/**
 * POST /api/admin/marketing/folders/import — register a campaign whose QR codes
 * already exist. Platform owner only.
 *
 * The QR tool makes the codes (they are inside the printed QR images), so
 * unlike /api/admin/marketing/people we do not invent any: the browser reads
 * them out of the zip and sends them here with the person each belongs to.
 * One call creates the campaign and files every code under it, so a zip
 * upload replaces "make the campaign, then add each code by hand".
 *
 * All or nothing: if anything fails after the campaign was created, the codes
 * written so far and the new campaign are removed again, so a retry starts
 * clean and no printed QR is left pointing at half a campaign.
 *
 * A code that is already registered is never overwritten (it may carry scan
 * history); it is reported back as skipped.
 */

import { clean, fail, json, readJson } from "@/lib/server/billingGuard";
import { ownerGuard, isMissingColumn, MIGRATION_HINT } from "@/lib/server/ownerGuard";
import { isSafePath, normaliseCode } from "@/lib/analytics/attribution";
import { folderSlug, isFolderChannel } from "@/lib/campaignFolders";
import { MAX_ZIP_PEOPLE } from "@/lib/qrZip";
import { personLabel } from "@/lib/personCodes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 512 * 1024;
const INSERT_CHUNK = 500;

type InPerson = { code?: unknown; name?: unknown; company?: unknown };

export async function POST(req: Request) {
  const g = await ownerGuard(req);
  if ("error" in g) return g.error;
  const { sb } = g;

  const read = await readJson(req, MAX_BODY_BYTES);
  if (!read.ok) return fail(read.status, read.error);
  const b = read.body;

  /* ── the people ─────────────────────────────────────────────────────── */
  const rawPeople = Array.isArray(b.people) ? (b.people as InPerson[]) : [];
  if (!rawPeople.length) return fail(400, "no_people", "The zip had no readable QR codes in it.");
  if (rawPeople.length > MAX_ZIP_PEOPLE) {
    return fail(400, "too_many", `A campaign holds up to ${MAX_ZIP_PEOPLE} people per upload.`);
  }
  const seen = new Set<string>();
  const people: { code: string; name: string; company: string | null }[] = [];
  for (const p of rawPeople) {
    const code = normaliseCode(p.code);
    const name = clean(p.name, 80);
    if (!code || !name) return fail(400, "bad_person", "Every row needs a code and a name.");
    const key = code.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    people.push({ code, name, company: clean(p.company, 80) || null });
  }

  /* ── the campaign ───────────────────────────────────────────────────── */
  const name = clean(b.name, 120);
  if (!name) return fail(400, "bad_name", "Name the campaign, for example “Product Testing”.");
  const slug = folderSlug(clean(b.slug, 60) || name);
  if (!slug) return fail(400, "bad_slug", "That name has no letters or digits in it; give it a plainer one.");

  const destination = clean(b.destination, 300) || "/";
  if (!isSafePath(destination)) {
    return fail(400, "bad_destination", "The destination must be a path on myvpv.com, like /plans.");
  }
  const channel = clean(b.channel, 30) || "pamphlet";
  if (!isFolderChannel(channel)) return fail(400, "bad_channel", "Unknown channel.");

  // The zip is what was printed, so that is the default denominator.
  let printed: number = people.length;
  if (b.printedCount !== undefined && b.printedCount !== null && b.printedCount !== "") {
    const n = Number(b.printedCount);
    if (!Number.isInteger(n) || n < 0 || n > 1_000_000) {
      return fail(400, "bad_printed", "How many were printed? A whole number, or leave it blank.");
    }
    printed = n;
  }
  let distributedAt: string | null = null;
  const when = clean(b.distributedAt, 20);
  if (when) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(when) || Number.isNaN(Date.parse(when))) {
      return fail(400, "bad_date", "The handed-out date must look like 2026-10-28.");
    }
    distributedAt = when;
  }

  /* ── codes that are already registered stay as they are ─────────────── */
  const existing = await sb.from("campaign_codes").select("code").limit(200_000);
  if (existing.error) return fail(500, "read_failed", existing.error.message);
  const taken = new Set((existing.data ?? []).map((r) => String((r as { code: string }).code).toUpperCase()));
  const fresh = people.filter((p) => !taken.has(p.code.toUpperCase()));
  const skipped = people.length - fresh.length;
  if (!fresh.length) {
    return fail(409, "all_registered", "Every code in this zip is already registered. Nothing was added.");
  }

  const made = await sb
    .from("campaign_folders")
    .insert({
      slug,
      name,
      city: clean(b.city, 80) || null,
      state: null,
      channel,
      destination,
      printed_count: printed,
      distributed_at: distributedAt,
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

  const rows = fresh.map((p, i) => ({
    code: p.code,
    label: personLabel({ name: p.name, company: p.company }),
    destination,
    source: channel,
    medium: "qr",
    campaign: name,
    person_name: p.name,
    person_company: p.company,
    folder_id: folder.id,
    print_seq: i + 1,
  }));

  const inserted: string[] = [];
  const undo = async () => {
    for (let j = 0; j < inserted.length; j += INSERT_CHUNK) {
      await sb.from("campaign_codes").delete().in("code", inserted.slice(j, j + INSERT_CHUNK));
    }
    await sb.from("campaign_folders").delete().eq("id", folder.id);
  };
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    const { error } = await sb.from("campaign_codes").insert(chunk);
    if (error) {
      await undo();
      if (isMissingColumn(error)) return fail(409, "migration_needed", MIGRATION_HINT);
      return fail(500, "write_failed", error.message);
    }
    for (const r of chunk) inserted.push(r.code);
  }

  return json({ ok: true, folder: { slug: folder.slug, name: folder.name }, added: rows.length, skipped });
}
