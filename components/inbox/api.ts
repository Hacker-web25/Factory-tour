/**
 * Browser side of the VPV Inbox: types, the one fetch helper, and small
 * formatters. The server never sends the raw HTML of incoming mail, only text.
 */

import { supabase } from "@/lib/supabase";
import type { InboxSettings } from "@/lib/inboxMail";

export type Thread = {
  id: string;
  ticket_no: number | string;
  subject: string;
  customer_email: string;
  customer_name: string | null;
  status: "open" | "waiting" | "solved" | "spam";
  assignee_email: string | null;
  message_count: number;
  unread: boolean;
  last_message_at: string;
  last_inbound_at: string | null;
  first_reply_at: string | null;
  due_at: string | null;
  ack_sent_at: string | null;
  created_at: string;
};

export type Message = {
  id: string;
  direction: "in" | "out" | "note";
  kind: "mail" | "ack" | "note";
  from_email: string | null;
  from_name: string | null;
  to_emails: string[];
  cc_emails: string[];
  subject: string | null;
  text_body: string;
  author_email: string | null;
  attachments: { filename: string; contentType: string; size: number | null }[];
  delivery: "sent" | "failed" | null;
  error: string | null;
  created_at: string;
};

export type Me = { email: string; name: string; isOwner: boolean; isAdmin: boolean };
export type TeamMember = { email: string; name: string; role: string };
export type Counts = { open: number; waiting: number; solved: number; spam: number; unread: number };
export type { InboxSettings };

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; message: string };

export async function api<T = Record<string, unknown>>(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<ApiResult<T>> {
  try {
    const { data: s } = await supabase.auth.getSession();
    const res = await fetch(path, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${s.session?.access_token ?? ""}`,
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || d.ok === false) {
      return {
        ok: false,
        status: res.status,
        error: String(d.error ?? "error"),
        message: String(d.message ?? "Something went wrong. Try again."),
      };
    }
    return { ok: true, data: d as T };
  } catch {
    return { ok: false, status: 0, error: "network", message: "Could not reach the server." };
  }
}

export const ticketLabel = (n: number | string) => `VPV-${n}`;

/** "10:42 am" today, "Mon 3 Nov" this year, "3 Nov 2025" otherwise. */
export function shortTime(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, now)) return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  const y = new Date(now.getTime() - 86_400_000);
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

export function longTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

/** Open and nobody has answered yet, past the time we promised. */
export function isOverdue(t: Thread, now = Date.now()): boolean {
  return t.status === "open" && !t.first_reply_at && !!t.due_at && new Date(t.due_at).getTime() < now;
}

export const initialsOf = (nameOrEmail: string) => {
  const base = nameOrEmail.split("@")[0] ?? nameOrEmail;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
};
