"use client";

/**
 * Login rate-limit wrapper.
 *
 * The rule lives in SQL (check_login_rate_limit): 5 failed attempts
 * in the past 15 minutes locks the account for 15 min from the latest
 * failure. The two helpers here just wrap the RPC calls so the login
 * page doesn't have to care about the row shape.
 */

import { supabase } from "@/lib/supabase";
import { shortUserAgent } from "@/lib/deviceFingerprint";

export type LockoutState = {
  locked: boolean;
  lockedUntil: Date | null;
  failedRecent: number;
};

export async function checkLoginLockout(email: string): Promise<LockoutState> {
  const { data, error } = await supabase.rpc("check_login_rate_limit", {
    p_email: email,
  });
  if (error || !data || !data[0]) {
    return { locked: false, lockedUntil: null, failedRecent: 0 };
  }
  const row = data[0] as {
    locked: boolean;
    locked_until: string | null;
    failed_recent: number;
  };
  return {
    locked: !!row.locked,
    lockedUntil: row.locked_until ? new Date(row.locked_until) : null,
    failedRecent: row.failed_recent ?? 0,
  };
}

export async function recordLoginAttempt(
  email: string,
  success: boolean
): Promise<void> {
  await supabase.rpc("record_login_attempt", {
    p_email: email,
    p_success: success,
    p_user_agent: shortUserAgent(),
  });
}

/** Human-readable "X min Y sec" countdown for the lockout UI. */
export function formatLockoutRemaining(until: Date): string {
  const ms = until.getTime() - Date.now();
  if (ms <= 0) return "a moment";
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  if (mins > 0) return `${mins} min ${secs}s`;
  return `${secs}s`;
}
