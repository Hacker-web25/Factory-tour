/** GET /q/l2q with no campaign: a printed link must never show an error, so go home. */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const res = NextResponse.redirect(new URL("/", req.url), 302);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
