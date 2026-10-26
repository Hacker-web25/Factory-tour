"use client";

/**
 * Tour assignment helpers — who can present which tour.
 *
 * Before this, the sales dashboard showed every tour in the org (the
 * DB has no per-user restriction). Now, an org_admin explicitly
 * assigns tours to specific presenters, and the presenter dashboard
 * only lists tours they've been assigned.
 *
 * Backwards-compat: if a presenter has ZERO assignments AND the org
 * has few tours, we fall back to showing all tours — so this feature
 * doesn't break existing tours that were "auto-visible" before. Admin
 * can lock this down by explicitly assigning tours.
 */

import { supabase } from "@/lib/supabase";

export type TourAssignment = {
  tour_id: string;
  user_id: string;
  assigned_by: string | null;
  assigned_at: string;
};

/** Assignments across the whole org (used by the admin UI). */
export async function loadAssignmentsForOrg(
  tourIds: string[]
): Promise<TourAssignment[]> {
  if (tourIds.length === 0) return [];
  const { data } = await supabase
    .from("tour_assignments")
    .select("*")
    .in("tour_id", tourIds);
  return (data ?? []) as TourAssignment[];
}

/** Tour ids the given presenter is allowed to present. */
export async function loadAssignedTourIds(userId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from("tour_assignments")
    .select("tour_id")
    .eq("user_id", userId);
  return new Set((data ?? []).map((r: any) => r.tour_id));
}

/** Assign / unassign a single presenter to a tour. */
export async function assignTour(
  tourId: string,
  userId: string,
  assignedBy: string | null
): Promise<{ error?: string }> {
  const { error } = await supabase.from("tour_assignments").upsert(
    { tour_id: tourId, user_id: userId, assigned_by: assignedBy },
    { onConflict: "tour_id,user_id" }
  );
  if (error) return { error: error.message };
  return {};
}

export async function unassignTour(
  tourId: string,
  userId: string
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("tour_assignments")
    .delete()
    .match({ tour_id: tourId, user_id: userId });
  if (error) return { error: error.message };
  return {};
}

/** Bulk-assign a tour to a set of presenters (replaces existing set). */
export async function setTourAssignees(
  tourId: string,
  userIds: string[],
  assignedBy: string | null
): Promise<{ error?: string }> {
  // Diff: fetch current, delete removed, insert added.
  const current = await supabase
    .from("tour_assignments")
    .select("user_id")
    .eq("tour_id", tourId);
  const now = new Set(userIds);
  const before = new Set((current.data ?? []).map((r: any) => r.user_id));
  const toAdd = userIds.filter((u) => !before.has(u));
  const toRemove = Array.from(before).filter((u) => !now.has(u));
  if (toRemove.length > 0) {
    await supabase
      .from("tour_assignments")
      .delete()
      .eq("tour_id", tourId)
      .in("user_id", toRemove);
  }
  if (toAdd.length > 0) {
    await supabase.from("tour_assignments").insert(
      toAdd.map((u) => ({
        tour_id: tourId,
        user_id: u,
        assigned_by: assignedBy,
      }))
    );
  }
  return {};
}
