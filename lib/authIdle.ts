"use client";

/**
 * Idle-timeout policy for signed-in users.
 *
 * Supabase's own session tokens will happily refresh forever if the
 * refresh token stays valid — good for "remember me" but bad for
 * abandoned devices. This module adds a soft ceiling: if the user
 * hasn't shown any activity for MAX_IDLE_MS, they're signed out on the
 * next page load / mount check.
 *
 * "Activity" = any pointer, keyboard, scroll or visibility-change event.
 * Every activity signal writes `now` to localStorage. The mount check
 * reads that stamp and compares to now.
 */

import { supabase } from "@/lib/supabase";

const KEY = "factour_last_active";
const MAX_IDLE_MS = 15 * 24 * 60 * 60 * 1000; // 15 days

function readLastActive(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

function writeLastActive(ts: number) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, String(ts));
  } catch {}
}

/** Refresh the last-active timestamp — throttled so we don't hammer
 *  localStorage on every pointer-move. */
let throttleTimer: number | null = null;
export function bumpActivity() {
  if (typeof window === "undefined") return;
  if (throttleTimer != null) return;
  throttleTimer = window.setTimeout(() => {
    writeLastActive(Date.now());
    throttleTimer = null;
  }, 30_000); // once per 30 seconds max
}

/** Called once on mount by IdleGuard. If the last recorded activity is
 *  older than MAX_IDLE_MS, sign the user out and clear the stamp. */
export async function enforceIdleLimit(): Promise<boolean> {
  const last = readLastActive();
  if (!last) {
    // First run — stamp now and let them stay signed in.
    writeLastActive(Date.now());
    return false;
  }
  if (Date.now() - last > MAX_IDLE_MS) {
    try {
      localStorage.removeItem(KEY);
    } catch {}
    await supabase.auth.signOut().catch(() => {});
    return true;
  }
  writeLastActive(Date.now());
  return false;
}
