/**
 * GET /api/inbox/threads?status=open|waiting|solved|spam|all&mine=1
 * The conversation list, newest first, plus the tab counts. Inbox staff only.
 */

import { fail, json } from "@/lib/server/billingGuard";
import { inboxGuard, isMissingTable, listThreads, threadCounts, MIGRATION_HINT } from "@/lib/server/inboxDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await inboxGuard(req);
  if ("error" in g) return g.error;
  const { staff } = g;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "open";
  const mine = url.searchParams.get("mine") === "1";
  const { threads, error } = await listThreads(staff.sb, {
    status: status === "all" ? undefined : status,
    assignee: mine ? staff.email : null,
  });
  if (error) {
    if (isMissingTable(error)) return fail(503, "migration_needed", MIGRATION_HINT);
    return fail(500, "server_error");
  }
  return json({ ok: true, threads, counts: await threadCounts(staff.sb) });
}
