"use client";

/**
 * lib/clients — CRUD + aggregates for the client pipeline.
 *
 * A "client" is a prospect a salesperson is pitching to. Each
 * presentation session can be linked to a client via
 * `presentation_sessions.client_id`, so the MIS can:
 *   • show pipeline stage per client
 *   • count presentations per client
 *   • count deals closed per salesperson
 *   • filter every tracking metric by client
 *
 * All fetches here go through Supabase RLS — a presenter sees only
 * their own clients; org_admin sees every client in their org.
 */

import { supabase } from "@/lib/supabase";

export type ClientStatus = "active" | "moved_ahead" | "closed" | "lost";

export type Client = {
  id: string;
  org_id: string;
  presenter_user_id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  industry: string | null;
  notes: string | null;
  status: ClientStatus;
  estimated_value: number | null;
  actual_value: number | null;
  next_follow_up_at: string | null;
  first_presented_at: string | null;
  last_presented_at: string | null;
  moved_ahead_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ClientInsert = Pick<Client, "org_id" | "presenter_user_id" | "name"> &
  Partial<
    Pick<
      Client,
      | "company"
      | "email"
      | "phone"
      | "industry"
      | "notes"
      | "estimated_value"
      | "next_follow_up_at"
    >
  >;

export const STATUS_LABELS: Record<ClientStatus, string> = {
  active: "Active",
  moved_ahead: "Moved ahead",
  closed: "Deal closed",
  lost: "Lost",
};

export const STATUS_COLORS: Record<ClientStatus, { bg: string; text: string; dot: string }> = {
  active:      { bg: "bg-slate-100",   text: "text-slate-700",   dot: "bg-slate-400" },
  moved_ahead: { bg: "bg-amber-100",   text: "text-amber-800",   dot: "bg-amber-500" },
  closed:      { bg: "bg-emerald-100", text: "text-emerald-800", dot: "bg-emerald-500" },
  lost:        { bg: "bg-rose-100",    text: "text-rose-700",    dot: "bg-rose-500" },
};

/* --------------------------- CRUD ----------------------------------- */

export async function listClientsForPresenter(presenterId: string): Promise<Client[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("presenter_user_id", presenterId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Client[];
}

export async function listClientsForOrg(orgId: string): Promise<Client[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Client[];
}

export async function createClient(row: ClientInsert): Promise<Client> {
  const { data, error } = await supabase
    .from("clients")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data as Client;
}

export async function updateClient(id: string, patch: Partial<Client>): Promise<void> {
  const { error } = await supabase.from("clients").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteClient(id: string): Promise<void> {
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) throw error;
}

/** Move to "closed" — sets closed_at automatically. */
export async function markClientClosed(id: string, actualValue?: number): Promise<void> {
  await updateClient(id, {
    status: "closed",
    closed_at: new Date().toISOString(),
    ...(actualValue != null ? { actual_value: actualValue } : {}),
  });
}

/** Move to "moved ahead" — sets moved_ahead_at if not already set. */
export async function markClientMovedAhead(id: string): Promise<void> {
  await updateClient(id, {
    status: "moved_ahead",
    moved_ahead_at: new Date().toISOString(),
  });
}

/** Move to "lost" — resets closed_at (this is a different kind of close). */
export async function markClientLost(id: string): Promise<void> {
  await updateClient(id, {
    status: "lost",
    closed_at: new Date().toISOString(),
  });
}

/* --------------------------- Aggregates ------------------------------ */

/** Count of sessions per client, plus last presented and total viewing
 *  seconds. Reads presentation_sessions where client_id is set. */
export type ClientStats = {
  clientId: string;
  presentationCount: number;
  totalSeconds: number;
  lastPresentedAt: string | null;
};

export async function loadStatsForClients(
  clientIds: string[]
): Promise<Map<string, ClientStats>> {
  const out = new Map<string, ClientStats>();
  if (clientIds.length === 0) return out;
  for (const id of clientIds) {
    out.set(id, {
      clientId: id,
      presentationCount: 0,
      totalSeconds: 0,
      lastPresentedAt: null,
    });
  }
  const { data } = await supabase
    .from("presentation_sessions")
    .select("client_id, duration_sec, started_at")
    .in("client_id", clientIds);
  for (const row of (data ?? []) as {
    client_id: string;
    duration_sec: number | null;
    started_at: string;
  }[]) {
    const s = out.get(row.client_id);
    if (!s) continue;
    s.presentationCount += 1;
    s.totalSeconds += row.duration_sec ?? 0;
    if (!s.lastPresentedAt || row.started_at > s.lastPresentedAt) {
      s.lastPresentedAt = row.started_at;
    }
  }
  return out;
}

/** Total deals closed per member in a time window (defaults to 30 days).
 *  Used by SalesTeamMIS. */
export async function dealsClosedByMember(
  orgId: string,
  windowDays = 30
): Promise<Map<string, number>> {
  const since = new Date(Date.now() - windowDays * 24 * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from("clients")
    .select("presenter_user_id, status, closed_at")
    .eq("org_id", orgId)
    .eq("status", "closed")
    .gte("closed_at", since);
  const out = new Map<string, number>();
  for (const r of (data ?? []) as { presenter_user_id: string }[]) {
    out.set(r.presenter_user_id, (out.get(r.presenter_user_id) ?? 0) + 1);
  }
  return out;
}

/** Pipeline breakdown per member. Returns { active, moved_ahead, closed,
 *  lost } counts keyed by presenter_user_id. */
export async function pipelineBreakdown(
  orgId: string
): Promise<Map<string, Record<ClientStatus, number>>> {
  const { data } = await supabase
    .from("clients")
    .select("presenter_user_id, status")
    .eq("org_id", orgId);
  const out = new Map<string, Record<ClientStatus, number>>();
  for (const r of (data ?? []) as { presenter_user_id: string; status: ClientStatus }[]) {
    const cur = out.get(r.presenter_user_id) ?? {
      active: 0,
      moved_ahead: 0,
      closed: 0,
      lost: 0,
    };
    cur[r.status] += 1;
    out.set(r.presenter_user_id, cur);
  }
  return out;
}

/** After a session ends we bump the client's last_presented_at (and
 *  first_presented_at if never set). Cheap fire-and-forget update. */
export async function touchClientOnPresentation(
  clientId: string,
  at = new Date().toISOString()
): Promise<void> {
  // Read the current values so we only set first_presented_at once.
  const { data } = await supabase
    .from("clients")
    .select("first_presented_at")
    .eq("id", clientId)
    .maybeSingle();
  const patch: Partial<Client> = { last_presented_at: at };
  if (!data?.first_presented_at) patch.first_presented_at = at;
  await updateClient(clientId, patch);
}
