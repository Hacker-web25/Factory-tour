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

/** Idempotently ensure a profiles row exists for the current auth user.
 *  Needed for OAuth sign-ins (Google), where our signUp() flow doesn't
 *  run and no profile is auto-created. Safe to call every login. */
export async function ensureProfile(opts?: {
  orgName?: string;
}): Promise<Profile | null> {
  const session = await getSession();
  if (!session) return null;
  const uid = session.user.id;
  // Already have a profile? Done.
  const { data: existing } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", uid)
    .maybeSingle();
  if (existing) return existing as Profile;

  // No profile yet — create one. If orgName is provided, spin up a
  // fresh org and mark them as its admin; otherwise register as an
  // unassigned presenter (an admin can move them to an org later).
  let orgId: string | null = null;
  let role: Role = "presenter";
  if (opts?.orgName) {
    const { data: org } = await supabase
      .from("organizations")
      .insert({ name: opts.orgName.trim() })
      .select()
      .single();
    if (org) {
      orgId = org.id;
      role = "org_admin";
    }
  }
  const email = session.user.email ?? "";
  const fullName =
    (session.user.user_metadata?.full_name as string | undefined) ??
    (session.user.user_metadata?.name as string | undefined) ??
    null;
  const { data: created } = await supabase
    .from("profiles")
    .insert({
      id: uid,
      email,
      full_name: fullName,
      role,
      org_id: orgId,
    })
    .select()
    .single();
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
  const { data: authData, error: authErr } = await supabase.auth.signUp({
    email,
    password: opts.password,
  });
  if (authErr) return { error: authErr };
  const userId = authData.user?.id;
  if (!userId) return { error: new Error("No user id returned from signUp") };

  let orgId: string | null = null;
  let role: Role = "presenter";
  if (opts.orgName) {
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .insert({ name: opts.orgName.trim() })
      .select()
      .single();
    if (orgErr) return { error: orgErr };
    orgId = org.id;
    role = "org_admin";
  }

  const { error: profileErr } = await supabase.from("profiles").insert({
    id: userId,
    email,
    full_name: opts.fullName ?? null,
    role,
    org_id: orgId,
  });
  if (profileErr) return { error: profileErr };

  return { userId, orgId, role };
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

  const { error: profileErr } = await supabase.from("profiles").insert({
    id: userId,
    email,
    full_name: opts.fullName ?? null,
    role: "presenter",
    org_id: opts.orgId,
  });
  if (profileErr) return { error: profileErr };

  return { userId, tempPassword: temp };
}
