/**
 * /api/inbox/settings
 *   GET  who you are, the auto-reply settings, and the team. Inbox staff.
 *   PUT  change the auto-reply wording, reply target, office hours, signature.
 *        Inbox admins (and the platform owner) only.
 */

import { fail, json, readJson } from "@/lib/server/billingGuard";
import { inboxGuard, isMissingTable, listTeam, loadSettings, parseSettingsPatch, MIGRATION_HINT } from "@/lib/server/inboxDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await inboxGuard(req);
  if ("error" in g) return g.error;
  const { staff } = g;
  const settings = await loadSettings(staff.sb);
  const team = await listTeam(staff.sb);
  return json({
    ok: true,
    me: { email: staff.email, name: staff.name, isOwner: staff.isOwner, isAdmin: staff.isAdmin },
    settings,
    team,
  });
}

export async function PUT(req: Request) {
  const g = await inboxGuard(req, { admin: true });
  if ("error" in g) return g.error;
  const { staff } = g;
  const b = await readJson(req, 16 * 1024);
  if (!b.ok) return fail(b.status, b.error);
  const p = parseSettingsPatch(b.body);
  if (!p.ok) return fail(400, "bad_settings", p.message);
  if (!Object.keys(p.patch).length) return fail(400, "nothing_to_change");

  // The office must open before it closes, judged on the merged result.
  const current = await loadSettings(staff.sb);
  const start = Number(p.patch.office_start_hour ?? current.office_start_hour);
  const end = Number(p.patch.office_end_hour ?? current.office_end_hour);
  if (end <= start) return fail(400, "bad_settings", "The office must close after it opens.");

  const { error } = await staff.sb
    .from("inbox_settings")
    .upsert({ id: true, ...p.patch, updated_at: new Date().toISOString(), updated_by: staff.email }, { onConflict: "id" });
  if (error) {
    if (isMissingTable(error)) return fail(503, "migration_needed", MIGRATION_HINT);
    return fail(500, "server_error");
  }
  return json({ ok: true, settings: await loadSettings(staff.sb) });
}
