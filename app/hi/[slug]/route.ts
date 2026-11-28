/**
 * GET /hi/<name>-<code> — the personal link on a printed letter,
 * for example myvpv.com/hi/aryan-k7m2xq.
 *
 * The name is there so the reader sees their own name on our own domain and
 * trusts the QR they just scanned. The server ignores it: the code on the end
 * identifies the person, and the welcome is written from our own record of them
 * (see lib/hiLinks.ts). Everything else, including the guarantee that it
 * ALWAYS redirects, is shared with /q/<code> in lib/server/scanRedirect.ts.
 */

import { scanRedirect } from "@/lib/server/scanRedirect";
import { codeCandidates } from "@/lib/hiLinks";

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  return scanRedirect(req, codeCandidates(params.slug));
}
