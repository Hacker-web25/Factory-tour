"use client";

/**
 * Device session management for the sales-team "one email, one device"
 * rule (configurable up to N via the invite code's device_limit).
 *
 * Flow during sign-in:
 *   1. supabase.auth.signInWithPassword(...)
 *   2. isNewDevice(fp)         // for the new-device email check
 *   3. claimDeviceSlot(fp)     // either 'ok' or 'full'
 *   4. On 'full' → sign the user back out and show the "device limit
 *      reached" screen with the active-count + limit.
 *   5. On 'ok'  → heartbeat every ~5 min from the dashboard so the
 *      session isn't culled as idle while actively being used.
 */

import { supabase } from "@/lib/supabase";
import { getDeviceFingerprint, shortUserAgent } from "@/lib/deviceFingerprint";

export type ClaimResult =
  | { status: "ok"; activeCount: number; deviceLimit: number }
  | { status: "full"; activeCount: number; deviceLimit: number }
  | { status: "unauth" };

/** Claim (or re-claim) the device slot for the authenticated user. */
export async function claimDeviceSlot(): Promise<ClaimResult> {
  const fp = getDeviceFingerprint();
  const ua = shortUserAgent();
  const { data, error } = await supabase.rpc("claim_device_slot", {
    p_fingerprint: fp,
    p_user_agent: ua,
    p_country: null,
  });
  if (error || !data || !data[0]) {
    return { status: "unauth" };
  }
  const row = data[0] as {
    status: "ok" | "full" | "unauth";
    active_count: number;
    device_limit: number;
  };
  if (row.status === "ok") {
    return { status: "ok", activeCount: row.active_count, deviceLimit: row.device_limit };
  }
  if (row.status === "full") {
    return { status: "full", activeCount: row.active_count, deviceLimit: row.device_limit };
  }
  return { status: "unauth" };
}

/** True when this fingerprint has never been seen for this user before.
 *  Call this BEFORE claimDeviceSlot (which inserts the row). */
export async function isNewDevice(): Promise<boolean> {
  const fp = getDeviceFingerprint();
  const { data, error } = await supabase.rpc("is_new_device", {
    p_fingerprint: fp,
  });
  if (error) return false;
  return !!data;
}

/** Release THIS device's slot — called on explicit sign-out. */
export async function releaseDeviceSlot(): Promise<void> {
  const fp = getDeviceFingerprint();
  await supabase.rpc("release_device_slot", { p_fingerprint: fp });
}

/** Fire-and-forget heartbeat. The dashboard calls this on an interval
 *  so a long-running tab stays "active" and doesn't idle out. */
export async function heartbeatDeviceSlot(): Promise<void> {
  try {
    await claimDeviceSlot();
  } catch {
    /* silent — heartbeat failure doesn't matter */
  }
}
