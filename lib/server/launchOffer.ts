/**
 * lib/server/launchOffer.ts — how many customers have taken the special
 * offer, and so whether it is still open.
 *
 * "Our first 30 customers" (50% off) and "our first 20" (the founding
 * offer) are printed on the site. This is
 * what makes it true: the order route asks here before pricing a plan, and
 * from the 51st paid site-plan order onwards the plan is charged at its
 * regular price. Nobody has to remember to switch the offer off.
 *
 * What counts as a customer: a billing_orders row that is PAID, stored as a
 * basic_licence, whose description names one of the site plans. Site
 * plans are stored as basic_licence on purpose (see lib/pricing.ts), so the
 * description is the only thing that tells them apart from a scene-ladder
 * licence. Refunded orders are not customers and do not use up a place.
 *
 * Reads the rows rather than asking Postgres for a count, because a few
 * hundred short rows is nothing and it keeps this to the query shapes every
 * other billing read already uses.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { LAUNCH_OFFER, foundingOfferOpen, launchOfferOpen, sitePlanFromNotes } from "@/lib/pricing";

export type OfferState = {
  /** 50% off (and ₹199 logins): the first 30. */
  open: boolean;
  /** A founding place (3 months free, free cab, free first period of
   *  support): the first 20. */
  founding: boolean;
  sold: number;
  remaining: number;
  limit: number;
  foundingRemaining: number;
  foundingLimit: number;
};

export async function launchOfferState(sb: SupabaseClient | null): Promise<OfferState> {
  const closed = (sold: number): OfferState => ({
    open: launchOfferOpen(sold),
    founding: foundingOfferOpen(sold),
    sold,
    remaining: Math.max(0, LAUNCH_OFFER.limit - sold),
    limit: LAUNCH_OFFER.limit,
    foundingRemaining: Math.max(0, LAUNCH_OFFER.foundingLimit - sold),
    foundingLimit: LAUNCH_OFFER.foundingLimit,
  });
  if (!LAUNCH_OFFER.active) return { ...closed(LAUNCH_OFFER.limit), open: false, founding: false };
  if (!sb) return closed(0);

  const { data, error } = await sb
    .from("billing_orders")
    .select("notes")
    .eq("status", "paid")
    .eq("purpose", "basic_licence")
    .limit(5000);

  if (error) {
    // Fail in the buyer's favour: a database hiccup must not quietly charge
    // somebody the regular price while the offer is still open. Logged so a
    // persistent failure is noticed.
    // eslint-disable-next-line no-console
    console.warn("[launchOffer] count failed, treating offer as open:", error.message);
    return closed(0);
  }
  // Every plan counts, the seven on sale and the four sold before them.
  const sold = (data ?? []).filter((r: { notes: string | null }) => sitePlanFromNotes(r.notes) !== null).length;
  return closed(sold);
}
