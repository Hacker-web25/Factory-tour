/**
 * /api/inbox/members — who besides the platform owner may use the inbox.
 * Platform owner only.
 *
 *   POST   { email, name?, role?: "agent" | "admin" }   add (or update) a person
 *   DELETE { email }                                    remove a person
 *
 * A person is matched by the e-mail on their VPV login, which must be
 * confirmed. Signing in with Google counts as confirmed.
 */

import { clean, fail, json, readJson } from "@/lib/server/billingGuard";
import { inboxGuard, isMissingTable, listTeam, MIGRATION_HINT } from "@/lib/server/inboxDb";
import { parseAddress } from "@/lib/inboxMail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await inboxGuard(req, { owner: true });
  if ("error" in g) return g.error;
  const { staff } = g;
  const b = await readJson(req, 4 * 1024);
  if (!b.ok) return fail(b.status, b.error);

  const a = parseAddress(b.body.email);
  if (!a) return fail(400, "bad_email", "Enter a valid e-mail address.");
  const role = b.body.role === "admin" ? "admin" : "agent";
  const name = clean(b.body.name, 80) || null;

  const { error } = await staff.sb
    .from("inbox_members")
    .upsert({ email: a.email, name, role, added_by: staff.email }, { onConflict: "email" });
  if (error) {
    if (isMissingTable(error)) return fail(503, "migration_needed", MIGRATION_HINT);
    return fail(500, "server_error");
  }
  return json({ ok: true, team: await listTeam(staff.sb) });
}

export async function DELETE(req: Request) {
  const g = await inboxGuard(req, { owner: true });
  if ("error" in g) return g.error;
  const { staff } = g;
  const b = await readJson(req, 4 * 1024);
  if (!b.ok) return fail(b.status, b.error);
  const a = parseAddress(b.body.email);
  if (!a) return fail(400, "bad_email");

  const { error } = await staff.sb.from("inbox_members").delete().eq("email", a.email);
  if (error) return fail(500, "server_error");
  // Their open conversations go back to the pool.
  await staff.sb.from("inbox_threads").update({ assignee_email: null }).eq("assignee_email", a.email);
  return json({ ok: true, team: await listTeam(staff.sb) });
}
