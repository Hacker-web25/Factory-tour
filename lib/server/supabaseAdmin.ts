/**
 * Service-role Supabase client. SERVER ONLY.
 *
 * This client bypasses row-level security, so it is the only thing in
 * the codebase that can write a payment, create an organisation or hand
 * out a plan. Three rules:
 *
 *   1. NEVER import this from a file that a browser bundle can reach.
 *      It is used by /api/billing/* and nothing else.
 *   2. The key lives in SUPABASE_SERVICE_ROLE_KEY — a Vercel
 *      "Sensitive" environment variable, never NEXT_PUBLIC_*.
 *   3. If the key is missing we return null rather than falling back to
 *      the anon key. A billing route that cannot write must fail loudly,
 *      not quietly write nothing.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Test seam. Only honoured when NODE_ENV === "test", so production code
 * can never be redirected at a different database by accident.
 */
export function __setSupabaseAdminForTests(client: SupabaseClient | null): void {
  if (process.env.NODE_ENV !== "test") throw new Error("test_only");
  cached = client;
}

export function supabaseAdmin(): SupabaseClient | null {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "X-Client-Info": "vpv-billing" } },
  });
  return cached;
}

/** True when billing can actually write to the database. */
export function billingConfigured(): boolean {
  if (cached) return true;
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
