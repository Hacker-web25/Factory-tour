/**
 * POST /api/inbox/threads/<id>/messages
 *   { kind: "reply", text, cc?, status? }  e-mail the customer from support@myvpv.com
 *   { kind: "note",  text }                an internal note, never sent
 * Inbox staff only.
 */

import { fail, json, readJson } from "@/lib/server/billingGuard";
import { addMessage, inboxGuard, parseReplyInput } from "@/lib/server/inboxDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await inboxGuard(req);
  if ("error" in g) return g.error;
  const b = await readJson(req, 64 * 1024);
  if (!b.ok) return fail(b.status, b.error);
  const input = parseReplyInput(b.body);
  if (!input.ok) return fail(400, input.error, input.message);
  const r = await addMessage(g.staff, params.id, input.input);
  if (!r.ok) return fail(r.status, r.error, r.message);
  return json({ ok: true, message: r.message, thread: r.thread });
}
