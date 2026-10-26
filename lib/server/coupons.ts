/**
 * lib/server/coupons.ts — is this coupon code real, and can it still be used?
 *
 * Coupons live in public.coupons (supabase/coupons.sql), created by hand for
 * the people we want to give a discount to. This file only CHECKS a code;
 * lib/pricing.ts decides what it takes off, and the order route charges
 * that. Nothing the browser says about a discount is ever used.
 *
 * A use is a PAID order whose notes say "coupon <CODE>" (priceFor() writes
 * it in that fixed shape), so an abandoned or refunded checkout never uses
 * up a place. Two buyers redeeming the last use in the same minute can both
 * get it; for hand-given codes that is an acceptable edge.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Coupon } from "@/lib/pricing";

/** "  friends20 " → "FRIENDS20". Empty when it cannot be a code at all. */
export function normaliseCouponCode(value: unknown): string {
  if (typeof value !== "string") return "";
  const code = value.trim().toUpperCase().replace(/\s+/g, "");
  return /^[A-Z0-9][A-Z0-9_-]{2,23}$/.test(code) ? code : "";
}

export type CouponCheck =
  | { ok: true; coupon: Coupon }
  | { ok: false; reason: "invalid" | "expired" | "used_up" | "unavailable"; message: string };

const INVALID: CouponCheck = { ok: false, reason: "invalid", message: "That coupon code is not valid." };

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function checkCoupon(sb: SupabaseClient | null, raw: unknown): Promise<CouponCheck> {
  const code = normaliseCouponCode(raw);
  if (!code) return INVALID;
  if (!sb) return { ok: false, reason: "unavailable", message: "Coupons are not available right now." };

  const { data: row, error } = await sb
    .from("coupons")
    .select("code, percent_off, amount_off_inr, max_uses, expires_at, active")
    .eq("code", code)
    .maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[coupons] lookup failed:", error.message);
    return { ok: false, reason: "unavailable", message: "We could not check that code. Please try again." };
  }
  // A switched-off code reads exactly like one that never existed.
  if (!row || !row.active) return INVALID;
  if (row.expires_at && new Date(String(row.expires_at)).getTime() < Date.now()) {
    return { ok: false, reason: "expired", message: "That coupon code has expired." };
  }

  if (row.max_uses != null) {
    const { data: paid, error: e2 } = await sb
      .from("billing_orders")
      .select("notes")
      .eq("status", "paid")
      .eq("purpose", "basic_licence")
      .limit(5000);
    if (e2) return { ok: false, reason: "unavailable", message: "We could not check that code. Please try again." };
    const used = new RegExp(`(^|, )coupon ${escapeRe(code)}( \\(|,|$)`);
    const uses = (paid ?? []).filter((r: { notes: string | null }) => used.test(r.notes ?? "")).length;
    if (uses >= Number(row.max_uses)) {
      return { ok: false, reason: "used_up", message: "That coupon code has already been used." };
    }
  }

  const percent = row.percent_off == null ? null : Number(row.percent_off);
  const amount = row.amount_off_inr == null ? null : Number(row.amount_off_inr);
  if (percent == null && amount == null) return INVALID;
  return { ok: true, coupon: { code, percentOff: percent, amountOffInr: percent == null ? amount : null } };
}
