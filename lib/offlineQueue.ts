"use client";

/**
 * Offline write queue.
 *
 * Analytics events (tour_events inserts) fire while a presenter is
 * offline — we can't reach Supabase, but we don't want to drop them
 * either. This module persists them in localStorage and flushes on
 * reconnect. It's intentionally scoped just to fire-and-forget writes;
 * anything the presenter needs to READ still uses the SW cache.
 */

import { supabase } from "@/lib/supabase";

const QUEUE_KEY = "factour:offline:queue";

type QueuedWrite = {
  id: string;
  table: string;
  op: "insert";
  payload: Record<string, unknown>;
  queuedAt: string;
};

function loadQueue(): QueuedWrite[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueue(q: QueuedWrite[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    // Quota exceeded — drop the oldest half rather than lose everything.
    try {
      window.localStorage.setItem(
        QUEUE_KEY,
        JSON.stringify(q.slice(Math.floor(q.length / 2)))
      );
    } catch {}
  }
}

/** Try a write immediately; if offline (or the write fails), queue it
 *  for later flush. Callers don't need to await — this is intentionally
 *  fire-and-forget. */
export async function writeOrQueue(
  table: string,
  payload: Record<string, unknown>
): Promise<void> {
  const attempt = async () => {
    const { error } = await supabase.from(table).insert(payload);
    if (error) throw new Error(error.message);
  };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    enqueue(table, payload);
    return;
  }
  try {
    await attempt();
  } catch {
    enqueue(table, payload);
  }
}

function enqueue(table: string, payload: Record<string, unknown>): void {
  const q = loadQueue();
  q.push({
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    table,
    op: "insert",
    payload,
    queuedAt: new Date().toISOString(),
  });
  saveQueue(q);
}

export function queueSize(): number {
  return loadQueue().length;
}

/** Flush every queued write to Supabase. Failures are re-queued so the
 *  next flush retries them. Called on reconnect and on app boot. */
export async function flushQueue(): Promise<{
  attempted: number;
  ok: number;
  failed: number;
}> {
  const q = loadQueue();
  if (q.length === 0) return { attempted: 0, ok: 0, failed: 0 };
  // Clear optimistically so a slow flush doesn't block new writes.
  saveQueue([]);
  let ok = 0;
  const failures: QueuedWrite[] = [];
  for (const item of q) {
    try {
      const { error } = await supabase.from(item.table).insert(item.payload);
      if (error) failures.push(item);
      else ok++;
    } catch {
      failures.push(item);
    }
  }
  if (failures.length) {
    // Merge failures back in with anything queued since we started.
    saveQueue([...failures, ...loadQueue()]);
  }
  return { attempted: q.length, ok, failed: failures.length };
}

/** Hook up: flush on window load + whenever the browser comes back
 *  online. Call from a top-level component (e.g. RootLayout via a
 *  tiny client component). */
export function installOfflineFlusher(): () => void {
  if (typeof window === "undefined") return () => {};
  const onOnline = () => {
    flushQueue().catch(() => {});
  };
  // Kick off once on install so any leftover queue from a prior visit
  // gets a chance to sync immediately.
  onOnline();
  window.addEventListener("online", onOnline);
  return () => window.removeEventListener("online", onOnline);
}
