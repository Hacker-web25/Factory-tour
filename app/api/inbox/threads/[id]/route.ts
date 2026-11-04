/**
 * /api/inbox/threads/<id>
 *   GET    the conversation and every message in it (text only).
 *   PATCH  { status?, assignee_email?, unread? }
 * Inbox staff only.
 */

import { fail, json, readJson } from "@/lib/server/billingGuard";
import { getThread, inboxGuard, updateThread } from "@/lib/server/inboxDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const g = await inboxGuard(req);
  if ("error" in g) return g.error;
  const t = await getThread(g.staff.sb, params.id);
  if (!t) return fail(404, "not_found");
  return json({ ok: true, ...t });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await inboxGuard(req);
  if ("error" in g) return g.error;
  const b = await readJson(req, 8 * 1024);
  if (!b.ok) return fail(b.status, b.error);
  const r = await updateThread(g.staff, params.id, b.body);
  if (!r.ok) return fail(r.status, r.error, r.message);
  return json({ ok: true, thread: r.thread });
}
