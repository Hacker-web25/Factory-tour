/**
 * Authenticate an API request that carries the user's Supabase access
 * token in `Authorization: Bearer <jwt>`.
 *
 * Returns a Supabase client that acts AS that user — every query it runs
 * goes through RLS exactly like the browser would — plus their profile.
 * No service-role key is involved, so a bug in a route can never read
 * more than the caller could already read themselves.
 *
 * SERVER ONLY. Do not import from client components.
 */

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export type AuthedRequest = {
  sb: SupabaseClient;
  user: User;
  profile: {
    id: string;
    email: string;
    full_name: string | null;
    role: string;
    org_id: string | null;
  };
};

let testAuthenticator: ((req: Request) => Promise<AuthedRequest | null>) | null = null;

/** Test seam — only honoured when NODE_ENV === "test". */
export function __setAuthenticatorForTests(
  fn: ((req: Request) => Promise<AuthedRequest | null>) | null
): void {
  if (process.env.NODE_ENV !== "test") throw new Error("test_only");
  testAuthenticator = fn;
}

export async function authenticateRequest(req: Request): Promise<AuthedRequest | null> {
  if (process.env.NODE_ENV === "test" && testAuthenticator) return testAuthenticator(req);
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || token.length > 4096) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;

  const { data: profile } = await sb
    .from("profiles")
    .select("id, email, full_name, role, org_id")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile) return null;

  return { sb, user: data.user, profile: profile as AuthedRequest["profile"] };
}

export function isOrgAdmin(p: AuthedRequest["profile"]): boolean {
  return p.role === "org_admin" || p.role === "owner";
}
