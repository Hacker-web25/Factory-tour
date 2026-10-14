"use client";

import { supabase } from "@/lib/supabase";

/**
 * Auth + profile helpers built on Supabase Auth.
 *
 * We keep three roles in the `profiles` table:
 *   owner      — you; sees every tour across every org
 *   org_admin  — a client's boss; sees their org's tours + team analytics
 *   presenter  — a salesperson; sees the tours they can present + own analytics
 *
 * The Supabase user id (auth.users.id) IS the profiles.id — one row per user.
 */

export type Role = "owner" | "org_admin" | "presenter";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  org_id: string | null;
  created_at: string;
};

export type Organization = {
  id: string;
  name: string;
  created_at: string;
  /** Org-wide toggle: auto-record presentations (voice) for AI insights. */
  auto_record?: boolean;
};

/** Get the currently-signed-in user's Supabase session. Returns null when
 *  logged out. */
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

/** Load the profile row for the currently-signed-in user. Returns null if
 *  logged out OR if the profile doesn't exist yet. */
export async function getMyProfile(): Promise<Profile | null> {
  const session = await getSession();
  if (!session) return null;
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .maybeSingle();
  return (data as Profile) ?? null;
}

/** Sign in with email + password. Returns { session, error }. */
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  return { session: data.session, error };
}

/** Sign out and clear the local session. */
export async function signOut() {
  await supabase.auth.signOut();
}

/** Start the Google OAuth flow. Supabase redirects to Google, then back
 *  to `/auth/callback` where we ensure the user has a profile row. */
export async function signInWithGoogle(next: string = "/") {
  const redirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
      : undefined;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  return { error };
}

/** Idempotently ensure a profiles row exists AND has an org for the
 *  current auth user. Handles three scenarios:
 *   1. Google OAuth first login — profile might not exist yet (some
 *      Supabase setups skip the trigger for OAuth).
 *   2. Email/password signup with confirmation — trigger created a
 *      base profile but org_id is still null; if user_metadata has a
 *      pending_org_name from signup, create the org now.
 *   3. Any subsequent login — no-op fast path. */
export async function ensureProfile(opts?: {
  orgName?: string;
}): Promise<Profile | null> {
  const session = await getSession();
  if (!session) return null;
  const uid = session.user.id;
  const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;
  const pendingOrgFromSignup =
    (meta.pending_org_name as string | undefined) ?? undefined;
  const orgNameToCreate = opts?.orgName ?? pendingOrgFromSignup;

  const { data: existing } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", uid)
    .maybeSingle();

  // Fast path — profile exists AND already has an org (or user
  // explicitly signed up without one). Nothing to do.
  if (existing && (existing.org_id || !orgNameToCreate)) {
    return existing as Profile;
  }

  // Need to create the org (either brand-new profile OR existing
  // profile from trigger that hasn't been linked to an org yet).
  let orgId: string | null = existing?.org_id ?? null;
  let role: Role = existing?.role ?? "presenter";

  const email = session.user.email ?? "";

  // Same person, different sign-in method. Supabase gives email/password
  // and Google OAuth sign-ins SEPARATE auth.users rows (and so separate
  // uids) unless the project has identity linking turned on, so without
  // this check someone who signed up with a password and later taps
  // "Sign in with Google" using the identical address would silently get
  // a second, brand-new, org-less account instead of landing back in
  // their existing one. Google verifies the email itself, so matching on
  // it here is safe. This only ever ATTACHES this new auth identity to
  // the existing org/role — it never creates or deletes anything. Best
  // effort: if the profiles table's row-level security doesn't allow
  // reading another user's row by email, this silently finds nothing and
  // falls through to the normal new-org path below (no regression).
  if (!orgId && email) {
    try {
      const { data: sameEmailProfile } = await supabase
        .from("profiles")
        .select("org_id, role")
        .eq("email", email)
        .neq("id", uid)
        .not("org_id", "is", null)
        .limit(1)
        .maybeSingle();
      if (sameEmailProfile?.org_id) {
        orgId = sameEmailProfile.org_id;
        role = (sameEmailProfile.role as Role) ?? role;
      }
    } catch {
      // Ignore — fall through to the org-creation path below.
    }
  }

  if (!orgId && orgNameToCreate) {
    const { data: org } = await supabase
      .from("organizations")
      .insert({ name: orgNameToCreate.trim() })
      .select()
      .single();
    if (org) {
      orgId = org.id;
      role = "org_admin";
    }
  }

  const fullName =
    (meta.full_name as string | undefined) ??
    (meta.name as string | undefined) ??
    null;

  // Upsert — inserts if trigger didn't fire (OAuth in some configs),
  // updates if the trigger already created a base row.
  const { data: upserted } = await supabase
    .from("profiles")
    .upsert(
      {
        id: uid,
        email,
        full_name: fullName ?? existing?.full_name ?? null,
        role,
        org_id: orgId,
      },
      { onConflict: "id" }
    )
    .select()
    .single();
  const created = upserted;
  return (created as Profile) ?? null;
}


