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

  const email = session.user.email ?? "";
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

/** Create a new user account. Also creates a matching profile row. If
 *  `orgName` is provided, creates a fresh organization and marks the user
 *  as its `org_admin`. Otherwise the user is created as a `presenter` and
 *  must be assigned to an org later by an admin. */
export async function signUp(opts: {
  email: string;
  password: string;
  fullName?: string;
  orgName?: string;
}) {
  const email = opts.email.trim().toLowerCase();
  // Pass the full name + org name as user_metadata so the DB trigger
  // (handle_new_user) can pick them up. Direct client-side profile
  // insert races with the auth.users insert when email confirmation is
  // enabled — the trigger runs in the same transaction so there's no
  // FK-violates-profiles_id_fkey race.
  const { data: authData, error: authErr } = await supabase.auth.signUp({
    email,
    password: opts.password,
    options: {
      data: {
        full_name: opts.fullName ?? null,
        pending_org_name: opts.orgName?.trim() ?? null,
      },
    },
  });
  if (authErr) return { error: authErr };
  const userId = authData.user?.id;

  // If Supabase requires email confirmation, authData.session is null.
  // We can't touch profiles/organizations yet (user isn't logged in).
  // The trigger has already created a base profile row; the org will
  // be created on first login via ensureProfile(). Signal the caller
  // to show a "check your email" screen.
  if (!authData.session) {
    return { needsEmailConfirmation: true, userId: userId ?? null };
  }

  // Email confirmation is disabled — we have a live session. Create
  // the org + patch the auto-created profile now.
  let orgId: string | null = null;
  let role: Role = "presenter";
  if (opts.orgName && userId) {
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .insert({ name: opts.orgName.trim() })
      .select()
      .single();
    if (orgErr) return { error: orgErr };
    orgId = org.id;
    role = "org_admin";
  }
  if (userId) {
    // Upsert — the DB trigger has already created a base profile row,
    // but if for any reason it didn't (or if an older client bundle
    // tried to insert), upsert handles both paths without ever raising
    // duplicate-key or missing-row errors.
    await supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          email,
          full_name: opts.fullName ?? null,
          role,
          org_id: orgId,
        },
        { onConflict: "id" }
      );
  }

  return { userId: userId ?? null, orgId, role };
}

/** Invite a new presenter to an existing org. Only `org_admin` should call
 *  this. Creates a Supabase auth user with a temporary password (returned
 *  to the caller so they can email it to the presenter). */
export async function invitePresenter(opts: {
  email: string;
  fullName?: string;
  orgId: string;
}) {
  const email = opts.email.trim().toLowerCase();
  // Generate a memorable temp password — 12 chars, alphanumeric.
  const temp =
    Math.random().toString(36).slice(2, 8) +
    Math.random().toString(36).slice(2, 8).toUpperCase();

  const { data: authData, error: authErr } = await supabase.auth.signUp({
    email,
    password: temp,
  });
  if (authErr) return { error: authErr };
  const userId = authData.user?.id;
  if (!userId) return { error: new Error("No user id returned") };

  // Upsert — the DB trigger auto-created a base profile row already;
  // we just need to patch in role + org_id + any name provided here.
  const { error: profileErr } = await supabase.from("profiles").upsert(
    {
      id: userId,
      email,
      full_name: opts.fullName ?? null,
      role: "presenter",
      org_id: opts.orgId,
    },
    { onConflict: "id" }
  );
  if (profileErr) return { error: profileErr };

  return { userId, tempPassword: temp };
}
