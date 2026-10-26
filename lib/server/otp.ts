/**
 * lib/server/otp.ts — the one-way hash used to store a funnel OTP code.
 *
 * Split out from the route handlers on purpose: a Next.js route file
 * (app/api/.../route.ts) may only export its HTTP methods (GET, POST, ...)
 * and a small fixed set of config fields. Exporting an ordinary helper
 * function from one, as this used to be, fails the production build with
 * "X is not a valid Route export field" — caught by the Vercel build, not
 * by `tsc --noEmit`, which does not enforce this rule.
 */

import { createHash } from "node:crypto";

export function hashOtp(email: string, code: string): string {
  // The address is in the hash as well, so a code issued for one e-mail can
  // never verify a different one.
  return createHash("sha256").update(`${email.toLowerCase()}:${code}`).digest("hex");
}
