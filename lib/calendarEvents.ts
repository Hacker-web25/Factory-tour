"use client";

/**
 * Calendar events — client-visit / demo / follow-up scheduling shared
 * between the org_admin and their sales team.
 *
 * The org_admin can create events for the team; presenters can create
 * their own. Both dashboards read from the same table so plans stay
 * in sync.
 */

import { supabase } from "@/lib/supabase";

export type CalendarEvent = {
  id: string;
  org_id: string;
  owner_user_id: string | null;
  assignee_user_id: string | null;
  title: string;
  notes: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  status: "planned" | "done" | "cancelled";
  created_at: string;
};

/** Load events for an org within a window (default: past 24h to +30d
 *  so today shows up, and the "upcoming" list has plenty). */
export async function loadCalendarEvents(
  orgId: string,
  opts?: { fromIso?: string; toIso?: string; assigneeId?: string }
): Promise<CalendarEvent[]> {
  const now = Date.now();
  const from =
    opts?.fromIso ?? new Date(now - 24 * 3600 * 1000).toISOString();
  const to =
    opts?.toIso ?? new Date(now + 30 * 24 * 3600 * 1000).toISOString();
  let q = supabase
    .from("calendar_events")
    .select("*")
    .eq("org_id", orgId)
    .gte("starts_at", from)
    .lte("starts_at", to)
    .order("starts_at", { ascending: true });
  if (opts?.assigneeId) q = q.eq("assignee_user_id", opts.assigneeId);
  const { data } = await q;
  return (data ?? []) as CalendarEvent[];
}

export async function createCalendarEvent(input: {
  org_id: string;
  owner_user_id: string;
  assignee_user_id?: string | null;
  title: string;
  notes?: string;
  starts_at: string;
  ends_at?: string | null;
  location?: string;
}): Promise<{ event?: CalendarEvent; error?: string }> {
  const { data, error } = await supabase
    .from("calendar_events")
    .insert({
      org_id: input.org_id,
      owner_user_id: input.owner_user_id,
      assignee_user_id: input.assignee_user_id ?? input.owner_user_id,
      title: input.title,
      notes: input.notes ?? null,
      starts_at: input.starts_at,
      ends_at: input.ends_at ?? null,
      location: input.location ?? null,
    })
    .select()
    .single();
  if (error) return { error: error.message };
  return { event: data as CalendarEvent };
}

export async function updateEventStatus(
  id: string,
  status: CalendarEvent["status"]
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("calendar_events")
    .update({ status })
    .eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  await supabase.from("calendar_events").delete().eq("id", id);
}
