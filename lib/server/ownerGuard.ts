/**
 * lib/server/ownerGuard.ts — "platform owner only" for the admin routes that
 * read or write marketing data. SERVER ONLY.
 *
 * Route files may only export HTTP methods, so the shared check lives here.
 * Returns either the service-role client or the response to send back.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { authenticateRequest } from "@/lib/server/requestAuth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail } from "@/lib/server/billingGuard";

export async function ownerGuard(
  req: Request
): Promise<{ sb: SupabaseClient } | { error: Response }> {
  const auth = await authenticateRequest(req);
  if (!auth) return { error: fail(401, "unauthorized") };
  if (auth.profile.role !== "owner") {
    return { error: fail(403, "forbidden", "Platform owner only.") };
  }
  const sb = supabaseAdmin();
  if (!sb) {
    return { error: fail(503, "not_configured", "SUPABASE_SERVICE_ROLE_KEY is not set.") };
  }
  return { sb };
}

/** Postgres "undefined column": the migration that adds it has not been run. */
export function isMissingColumn(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.code === "42703" || /column .* does not exist|schema cache/i.test(err.message ?? "");
}

export const MIGRATION_HINT =
  "Run supabase/analytics.sql again in the Supabase SQL editor: it adds the columns for personal codes.";
