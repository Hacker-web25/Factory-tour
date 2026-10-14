/**
 * The states and union territories a GST invoice can be addressed to.
 *
 * The spelling here is what the invoice SQL compares against the state in
 * lib/company.ts to decide CGST+SGST (same state) versus IGST (different
 * state), so the order route canonicalises whatever the browser sent to
 * one of these exact strings. A blank or unknown state is refused rather
 * than quietly producing an IGST invoice for a customer who should have
 * received CGST+SGST.
 */

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand",
  "Karnataka", "Kerala", "Ladakh", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan",
  "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
  "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Lakshadweep", "Other / outside India",
] as const;

/** Returns the canonical spelling, or null when the value is not a known state. */
export function canonicalIndianState(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;
  return INDIAN_STATES.find((s) => s.toLowerCase() === v) ?? null;
}
