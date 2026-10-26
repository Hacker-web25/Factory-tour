/**
 * lib/server/salesSeats.ts — the Sales Team logins a workspace renews each year.
 * SERVER ONLY.
 *
 * Read separately from the rest of the organisation row, and forgivingly: a
 * database where supabase/sales_seats.sql has not been run yet answers "no
 * logins" instead of breaking a renewal or a reminder.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function orgSalesSeats(
  sb: SupabaseClient,
  orgId: string | null | undefined
): Promise<{ seats: number; seatInr: number }> {
  if (!orgId) return { seats: 0, seatInr: 0 };
  try {
    const { data, error } = await sb
      .from("organizations")
      .select("sales_seats, sales_seat_inr")
      .eq("id", orgId)
      .maybeSingle();
    if (error || !data) return { seats: 0, seatInr: 0 };
    const seats = Math.max(0, Math.round(Number(data.sales_seats ?? 0)) || 0);
    const seatInr = Math.max(0, Math.round(Number(data.sales_seat_inr ?? 0)) || 0);
    return { seats, seatInr };
  } catch {
    return { seats: 0, seatInr: 0 };
  }
}
