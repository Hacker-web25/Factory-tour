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
  /** Path in the voice-samples storage bucket, or null until the rep
   *  records their one-time sample at first login. See
   *  /privacy#recordings-ai. */
  voice_sample_path?: string | null;
  voice_sample_captured_at?: string | null;
};

export type Organization = {
  id: string;
  name: string;
  created_at: string;
  /** Org-wide toggle: auto-record presentations (voice) for AI insights.
   *  Legacy — the single source of truth is now `recording_mode`. */
  auto_record?: boolean;
  /** How presenter sessions start recording:
   *    'auto'   — recording starts automatically (today's default behaviour)
   *    'manual' — the sales rep sees a popup and decides */
  recording_mode?: "auto" | "manual";
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

/** Idempotently make sure the signed-in user has a profiles row.
 *
 *  Normally the database trigger on sign-up has already created it, so this is
 *  a read. If it has not (some OAuth set-ups skip the trigger), a bare
 *  "presenter" row is created for the user's own id.
 *
 *  This function NEVER creates an organisation and NEVER sets a role or an
 *  organisation on the profile. A workspace comes only from a paid order
 *  (server-side fulfilment), an admin, or redeeming an invite code, and the
 *  database refuses any other attempt. The older version created an org from a
 *  `?org=` URL parameter and copied another account's role by matching e-mail —
 *  both are gone because anything the browser can ask for, an attacker can ask
 *  for too.
 */
export async function ensureProfile(): Promise<Profile | null> {
  const session = await getSession();
  if (!session) return null;
  const uid = session.user.id;
  const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;

  const { data: existing } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", uid)
    .maybeSingle();
  if (existing) return existing as Profile;

  const fullName =
    (meta.full_name as string | undefined) ??
    (meta.name as string | undefined) ??
    null;

  const { data: created } = await supabase
    .from("profiles")
    .insert({
      id: uid,
      email: session.user.email ?? "",
      full_name: fullName,
      role: "presenter",
    })
    .select()
    .single();
  return (created as Profile) ?? null;
}


