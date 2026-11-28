/**
 * GET /api/admin/marketing/people/pack — the files to print for a batch of
 * personal letters, as one ZIP. Platform owner only.
 *
 *   GET ?folder=<print run slug>   everyone filed under that print run
 *   GET ?batch=<batch name>        everyone in a batch that has no print run
 *
 * Built from what is in the database, so the pack can be downloaded again
 * whenever it is needed (a reprint, a lost file) and always matches the codes
 * that are live. Contents: links.csv, letters.pdf, png/ and svg/ (see
 * lib/server/hiLetters.ts).
 */

import { clean, fail } from "@/lib/server/billingGuard";
import { ownerGuard, isMissingColumn, MIGRATION_HINT } from "@/lib/server/ownerGuard";
import { lettersPack } from "@/lib/server/hiLetters";
import { MAX_HI_PEOPLE } from "@/lib/hiPeople";
import type { LetterRow } from "@/lib/hiPrint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Drawing two thousand pages and QR images takes a few seconds.
export const maxDuration = 60;

type Row = {
  code: string;
  person_name: string | null;
  person_company: string | null;
  print_seq?: number | null;
  created_at: string;
  greeting_name?: string | null;
  recipient_phone?: string | null;
  recipient_email?: string | null;
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "letters";

export async function GET(req: Request) {
  const g = await ownerGuard(req);
  if ("error" in g) return g.error;
  const { sb } = g;

  const url = new URL(req.url);
  const folderSlug = clean(url.searchParams.get("folder"), 60);
  const batch = clean(url.searchParams.get("batch"), 120);
  if (!folderSlug && !batch) return fail(400, "bad_request", "Say which print run or batch to pack.");

  let name = batch;
  let folderId: string | null = null;
  if (folderSlug) {
    const f = await sb.from("campaign_folders").select("id, name").eq("slug", folderSlug).maybeSingle();
    if (f.error) {
      if (isMissingColumn(f.error) || /campaign_folders/.test(f.error.message)) {
        return fail(409, "migration_needed", "Run supabase/campaign_folders.sql in the Supabase SQL editor.");
      }
      return fail(500, "read_failed", f.error.message);
    }
    if (!f.data) return fail(404, "no_folder", "No print run by that name.");
    folderId = (f.data as { id: string; name: string }).id;
    name = (f.data as { id: string; name: string }).name;
  }

  // The newer columns are asked for first and dropped if the migration that
  // adds them has not been run, so an older database still gets its pack.
  const LEVELS = [
    "code, person_name, person_company, print_seq, created_at, greeting_name, recipient_phone, recipient_email",
    "code, person_name, person_company, print_seq, created_at, greeting_name",
    "code, person_name, person_company, print_seq, created_at",
    "code, person_name, person_company, created_at",
  ];
  let data: Row[] | null = null;
  let lastError: { code?: string; message?: string } | null = null;
  for (const cols of LEVELS) {
    let q = sb.from("campaign_codes").select(cols).not("person_name", "is", null).limit(MAX_HI_PEOPLE + 1);
    q = folderId ? q.eq("folder_id", folderId) : q.eq("campaign", batch);
    q = cols.includes("print_seq") ? q.order("print_seq", { ascending: true, nullsFirst: false }) : q;
    const r = await q.order("created_at", { ascending: true });
    if (!r.error) {
      data = (r.data ?? []) as unknown as Row[];
      lastError = null;
      break;
    }
    lastError = r.error;
    if (!isMissingColumn(r.error)) return fail(500, "read_failed", r.error.message);
  }
  if (lastError || !data) return fail(409, "migration_needed", MIGRATION_HINT);
  if (!data.length) return fail(404, "empty", "Nobody is in that print run or batch yet.");
  if (data.length > MAX_HI_PEOPLE) {
    return fail(413, "too_many", `That is more than ${MAX_HI_PEOPLE} people; split it into smaller print runs.`);
  }

  const rows: LetterRow[] = data.map((r, i) => ({
    // The stack position: the stored number when there is one, else the order made.
    seq: Number(r.print_seq) > 0 ? Number(r.print_seq) : i + 1,
    name: r.person_name ?? "",
    company: r.person_company,
    code: r.code,
    greeting: r.greeting_name ?? null,
    phone: r.recipient_phone ?? null,
    email: r.recipient_email ?? null,
  }));

  const zip = await lettersPack(rows);
  return new Response(zip as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slug(name)}-letters.zip"`,
      "Cache-Control": "no-store",
      "Content-Length": String(zip.byteLength),
    },
  });
}
