/**
 * POST /api/admin/marketing/people — one tracked code per person, in bulk.
 * Platform owner only.
 *
 * Paste a list (one person per line: "Name, Company") and get back a random
 * code and a link for each. Feed the links to the QR tool that makes the
 * personal QR images; when a buyer scans theirs, /admin/marketing/buyers
 * and the folder page show what they did.
 *
 * Send `folderSlug` to file the batch under a print run, which is what makes
 * the folder report possible: the folder owns how many were printed, and
 * every rate in the report is measured against that number.
 *
 * Each code also gets a `print_seq` — its position in the batch — so a code
 * can be found again on the physical stack of paper ("run GGN-OCT26, piece
 * 137") without searching 220 cards by eye.
 *
 * The whole batch is created or none of it is: a half-made batch would leave
 * some printed QRs pointing at nothing.
 *
 * Send `style: "hi"` for the personal letters: each person gets a bare random
 * code and the link myvpv.com/hi/<first name>-<code>, and the list may carry
 * a header row with a "Greeting name" column (see lib/hiPeople.ts). The files
 * to print come from GET /api/admin/marketing/people/pack.
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
import { parseHiPeople, type HiPerson } from "@/lib/hiPeople";
import { letterUrl, lettersCsv, makeBareCodes } from "@/lib/hiPrint";
import type { FolderRow } from "@/lib/campaignFolders";

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

  // "hi" = the personal letters: a header row and a Greeting column are allowed,
  // and the link is /hi/<first name>-<code>. Anything else is the plain /q/ batch.
  const hi = b.style === "hi";
  let people: HiPerson[];
  let overflow: number;
  if (hi) {
    ({ people, overflow } = parseHiPeople(b.text));
  } else {
    const plain = parsePeople(b.text);
    overflow = plain.overflow;
    people = plain.people.map((p) => ({ ...p, greeting: null, phone: null, email: null }));
  }
  if (!people.length) {
    return fail(400, "no_people", "Paste at least one name, one person per line.");
  }

  // A batch belongs to a print run when one is named. The folder's own name
  // and destination then win, so the two can never drift apart.
  let folder: FolderRow | null = null;
  const folderSlugWanted = clean(b.folderSlug, 60);
  if (folderSlugWanted) {
    const f = await sb
      .from("campaign_folders")
      .select("id, slug, name, city, state, channel, destination, printed_count, distributed_at, notes, active, created_at")
      .eq("slug", folderSlugWanted)
      .maybeSingle();
    if (f.error) {
      if (isMissingColumn(f.error) || /campaign_folders/.test(f.error.message)) {
        return fail(409, "migration_needed", "Run supabase/campaign_folders.sql in the Supabase SQL editor.");
      }
      return fail(500, "read_failed", f.error.message);
    }
    folder = (f.data as FolderRow | null) ?? null;
    if (!folder) return fail(404, "no_folder", "No print run by that name.");
  }

  const campaign = folder?.name ?? clean(b.campaign, 120);
  if (!campaign) {
    return fail(400, "bad_campaign", "Name this batch, for example “Gurugram, Oct 26”.");
  }
  const destination = folder?.destination ?? (clean(b.destination, 300) || "/");
  if (!isSafePath(destination)) {
    return fail(400, "bad_destination", "The destination must be a path on myvpv.com, like /plans.");
  }
  const prefix = cleanPrefix(b.prefix);
  const source = clean(b.source, 60) || folder?.channel || (hi ? "letter" : "pamphlet");
  const medium = clean(b.medium, 60) || "qr";

  // Every code already in use, so a new one can never collide. Codes are
  // matched without regard to case, so they are compared that way.
  const taken = new Set<string>();
  const existing = await sb.from("campaign_codes").select("code").limit(200_000);
  if (existing.error) return fail(500, "read_failed", existing.error.message);
  for (const r of existing.data ?? []) taken.add(String((r as { code: string }).code).toUpperCase());

  let codes: string[];
  try {
    codes = hi ? makeBareCodes(people.length, taken) : makeCodes(people.length, prefix, taken);
  } catch {
    return fail(500, "no_codes", "Could not find enough unused codes; try a different prefix.");
  }

  // Numbering continues from what the run already holds, so a second batch
  // into the same folder does not restart at 1 and collide on the stack.
  let seqFrom = 0;
  if (folder) {
    const last = await sb
      .from("campaign_codes")
      .select("print_seq")
      .eq("folder_id", folder.id)
      .order("print_seq", { ascending: false })
      .limit(1)
      .maybeSingle();
    seqFrom = Number((last.data as { print_seq: number | null } | null)?.print_seq ?? 0) || 0;
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
    // Optional columns are only sent when there is something to put in them,
    // so a list without greetings or contacts works before their migrations are run.
    ...(p.greeting ? { greeting_name: p.greeting } : {}),
    ...(p.phone ? { recipient_phone: p.phone } : {}),
    ...(p.email ? { recipient_email: p.email } : {}),
    ...(folder ? { folder_id: folder.id, print_seq: seqFrom + i + 1 } : {}),
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
      if (isMissingColumn(error)) {
        if (/greeting_name/.test(error.message)) {
          return fail(409, "migration_needed", "Run supabase/hi_links.sql in the Supabase SQL editor: it adds the Greeting name column.");
        }
        if (/recipient_(phone|email)/.test(error.message)) {
          return fail(409, "migration_needed", "Run supabase/campaign_folders.sql in the Supabase SQL editor: it adds the phone and e-mail columns.");
        }
        return fail(409, "migration_needed", MIGRATION_HINT);
      }
      return fail(500, "write_failed", error.message);
    }
    for (const r of chunk) inserted.push(r.code);
  }

  if (hi) {
    const letters = rows.map((r, i) => ({
      seq: folder ? seqFrom + i + 1 : i + 1,
      name: r.person_name,
      company: r.person_company,
      code: r.code,
      greeting: people[i]!.greeting,
      phone: people[i]!.phone,
      email: people[i]!.email,
    }));
    return json({
      ok: true,
      style: "hi",
      count: letters.length,
      overflow,
      campaign,
      folder: folder ? { slug: folder.slug, name: folder.name } : null,
      rows: letters.map((l) => ({
        name: l.name,
        company: l.company,
        code: l.code,
        greeting: l.greeting,
        url: letterUrl(l),
      })),
      csv: lettersCsv(letters),
    });
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
    folder: folder ? { slug: folder.slug, name: folder.name } : null,
    rows: out,
    csv: peopleCsv(out),
  });
}
