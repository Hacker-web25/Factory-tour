/**
 * POST /api/admin/marketing/people — one tracked code per person, in bulk.
 * Platform owner only.
 *
 * Paste a list (one person per line: "Name, Company") and get back a random
 * code and a link for each. Feed the links to the QR tool that makes the
 * personal QR images; when a buyer scans theirs, /admin/marketing/buyers
 * shows what they did.
 *
 * The whole batch is created or none of it is: a half-made batch would leave
 * some printed QRs pointing at nothing.
 */

import { clean, fail, json, readJson } from "@/lib/server/billingGuard";
import { ownerGuard, isMissingColumn, MIGRATION_HINT } from "@/lib/server/ownerGuard";
import { isSafePath } from "@/lib/analytics/attribution";
import {
  cleanPrefix,
  makeCodes,
  parsePeople,
  peopleCsv,
  personLabel,
} from "@/lib/personCodes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ~2,000 lines of "Name, Company" is well under this. */
const MAX_BODY_BYTES = 256 * 1024;
const INSERT_CHUNK = 500;

export async function POST(req: Request) {
  const g = await ownerGuard(req);
  if ("error" in g) return g.error;
  const { sb } = g;

  const read = await readJson(req, MAX_BODY_BYTES);
  if (!read.ok) return fail(read.status, read.error);
  const b = read.body;

  const { people, overflow } = parsePeople(b.text);
  if (!people.length) {
    return fail(400, "no_people", "Paste at least one name, one person per line.");
  }

  const campaign = clean(b.campaign, 120);
  if (!campaign) {
    return fail(400, "bad_campaign", "Name this batch, for example “Gurugram, Oct 26”.");
  }
  const destination = clean(b.destination, 300) || "/";
  if (!isSafePath(destination)) {
    return fail(400, "bad_destination", "The destination must be a path on myvpv.com, like /plans.");
  }
  const prefix = cleanPrefix(b.prefix);
  const source = clean(b.source, 60) || "pamphlet";
  const medium = clean(b.medium, 60) || "qr";

  // Every code already in use, so a new one can never collide. Codes are
  // matched without regard to case, so they are compared that way.
  const taken = new Set<string>();
  const existing = await sb.from("campaign_codes").select("code").limit(200_000);
  if (existing.error) return fail(500, "read_failed", existing.error.message);
  for (const r of existing.data ?? []) taken.add(String((r as { code: string }).code).toUpperCase());

  let codes: string[];
  try {
    codes = makeCodes(people.length, prefix, taken);
  } catch {
    return fail(500, "no_codes", "Could not find enough unused codes; try a different prefix.");
  }

  const rows = people.map((p, i) => ({
    code: codes[i]!,
    label: personLabel(p),
    destination,
    source,
    medium,
    campaign,
    person_name: p.name,
    person_company: p.company,
  }));

  const inserted: string[] = [];
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    const { error } = await sb.from("campaign_codes").insert(chunk);
    if (error) {
      // Undo what was written, so the batch is all or nothing.
      if (inserted.length) {
        await sb.from("campaign_codes").delete().in("code", inserted.slice(0, 500));
        for (let j = 500; j < inserted.length; j += 500) {
          await sb.from("campaign_codes").delete().in("code", inserted.slice(j, j + 500));
        }
      }
      if (isMissingColumn(error)) return fail(409, "migration_needed", MIGRATION_HINT);
      return fail(500, "write_failed", error.message);
    }
    for (const r of chunk) inserted.push(r.code);
  }

  const out = rows.map((r) => ({
    name: r.person_name,
    company: r.person_company,
    code: r.code,
    url: `https://myvpv.com/q/${r.code}`,
  }));

  return json({
    ok: true,
    count: out.length,
    overflow,
    campaign,
    rows: out,
    csv: peopleCsv(out),
  });
}
