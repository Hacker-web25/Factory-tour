/**
 * lib/buyNow.ts — the details the Buy now page collects beyond what the
 * assessment collects, and the rules that check them. Pure: no database, no
 * browser. The page uses it to guide the buyer; /api/billing/order uses the
 * SAME functions to check what actually arrives, because the browser is never
 * trusted (a modified page changes what it shows, never what is stored).
 *
 * Money is not in this file. A price comes from lib/pricing.ts only.
 *
 * What is stored with an order (billing_orders.buy_details):
 *   - who to call, and who will be at the plant on the day;
 *   - the shoot site, in parts, which may differ from the billing address;
 *   - when the buyer would like the shoot;
 *   - the consent the buyer gave, with the time.
 * The one-line shoot site also goes to billing_orders.shoot_address, because
 * Rule 46 of the CGST Rules asks for the address of delivery on the invoice
 * when it differs from the billing address (deliveryAddressFor below).
 */

import { canonicalIndianState } from "@/lib/indianStates";
import { GSTIN_STATE_BY_CODE } from "@/lib/gstin";

/* ───────────────────────────── when to shoot ───────────────────────────── */

export const SHOOT_WINDOWS = [
  { id: "asap", label: "As soon as possible" },
  { id: "two_weeks", label: "Within two weeks" },
  { id: "one_month", label: "Within a month" },
  { id: "from_date", label: "On or after a date I choose" },
] as const;
export type ShootWindowId = (typeof SHOOT_WINDOWS)[number]["id"];

export function isShootWindow(v: unknown): v is ShootWindowId {
  return SHOOT_WINDOWS.some((w) => w.id === v);
}

/* ─────────────────────────────── the details ───────────────────────────── */

export type ShootSite = {
  line: string;
  city: string;
  state: string;
  pincode: string;
  landmark: string;
};

export type BuyDetails = {
  v: 1;
  /** Who will be at the plant on the day (may be the buyer, may not). */
  siteContactName: string;
  siteContactPhone: string;
  shoot: ShootSite;
  window: ShootWindowId;
  /** YYYY-MM-DD, only with window "from_date". */
  fromDate: string;
  /** Filled by the server, never by the browser. */
  consent?: { termsAt: string; policiesUpdated: string; marketing: boolean };
};

export type DetailsResult =
  | { ok: true; details: BuyDetails; shootLine: string; shootCity: string }
  | { ok: false; error: string; message: string };

function clip(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** An Indian mobile or landline, digits only, 10 to 13 of them (with 91 or 0). */
export function cleanPhone(v: unknown): string {
  const raw = clip(v, 24);
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 10 || digits.length > 13) return "";
  return raw.startsWith("+") ? `+${digits}` : digits;
}

export function validPincode(v: string): boolean {
  return /^[1-9][0-9]{5}$/.test(v);
}

/** One line, the way an invoice prints an address. */
export function composeAddress(parts: { line: string; city: string; state?: string; pincode: string }): string {
  const tail = [parts.state, parts.pincode].filter(Boolean).join(" ");
  return [parts.line, parts.city, tail].filter(Boolean).join(", ").slice(0, 400);
}

const isoDay = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Check what the browser sent as `details`. Returns the cleaned details, or
 * the first thing wrong, in words a buyer can act on.
 *
 * `today` is passed in so the test is repeatable; the route passes the real date.
 */
export function parseBuyDetails(raw: unknown, today: Date = new Date()): DetailsResult {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const site = (src.shoot && typeof src.shoot === "object" ? src.shoot : {}) as Record<string, unknown>;
  const bad = (error: string, message: string): DetailsResult => ({ ok: false, error, message });

  const line = clip(site.line, 160);
  const city = clip(site.city, 80);
  const pincode = clip(site.pincode, 10);
  const landmark = clip(site.landmark, 120);
  // Optional: a buyer may leave the state to be read from the city's PIN; the
  // route needs it only for the printed address, so it is canonicalised when given.
  const stateRaw = clip(site.state, 60);
  const state = stateRaw ? canonicalIndianState(stateRaw) ?? "" : "";
  if (stateRaw && !state) return bad("bad_shoot_state", "Please choose the state of the shoot site from the list.");

  if (line.length < 5) return bad("bad_shoot_address", "Please give the address of the plant where we should shoot (building, street or plot).");
  if (city.length < 2) return bad("bad_shoot_city", "Please tell us the city of the plant.");
  if (!validPincode(pincode)) return bad("bad_pincode", "That PIN code does not look right.");

  const siteContactName = clip(src.siteContactName, 80);
  const siteContactPhone = cleanPhone(src.siteContactPhone);
  if (siteContactName.length < 2) return bad("bad_site_contact", "Please name the person who will be at the plant on the day.");
  if (!siteContactPhone) return bad("bad_site_phone", "Please give that person's phone number (10 digits).");

  const window = src.window;
  if (!isShootWindow(window)) return bad("bad_window", "Please choose when you would like the shoot.");
  let fromDate = "";
  if (window === "from_date") {
    fromDate = clip(src.fromDate, 10);
    if (!isoDay.test(fromDate) || Number.isNaN(Date.parse(`${fromDate}T00:00:00Z`))) {
      return bad("bad_from_date", "Please choose the date you would like the shoot to start from.");
    }
    const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    // India is five and a half hours ahead of UTC: "today" there may already be tomorrow here.
    const ist = new Date(today.getTime() + 5.5 * 3_600_000);
    const picked = Date.parse(`${fromDate}T00:00:00Z`);
    if (picked < day(ist)) return bad("bad_from_date", "That date has already passed. Please choose a date from today.");
    if (picked > day(ist) + 366 * 86_400_000) return bad("bad_from_date", "Please choose a date within the next year.");
  }

  const shoot: ShootSite = { line, city, state, pincode, landmark };
  return {
    ok: true,
    details: { v: 1, siteContactName, siteContactPhone, shoot, window, fromDate },
    shootLine: composeAddress({ line: landmark ? `${line} (near ${landmark})` : line, city, state, pincode }),
    shootCity: city,
  };
}

/* ─────────────────────── the address of delivery ───────────────────────── */

/** Lower-case, letters and digits only: two spellings of one address compare equal. */
function squash(v: string | null | undefined): string {
  return (v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * The shoot site, for the invoice: Rule 46 asks for the address of delivery
 * "where the same is different from the place of supply". Returns null when
 * the shoot site is the billing address (so nothing extra is printed) and the
 * one-line site otherwise.
 *
 * Two addresses count as the same when one contains the other once spacing,
 * case and punctuation are ignored: the billing address carries the state and
 * a "(near …)" note does not, and neither should make a site look different.
 */
export function deliveryAddressFor(billing: string | null | undefined, shoot: string | null | undefined): string | null {
  const s = (shoot ?? "").trim();
  if (!s) return null;
  const a = squash(billing);
  const b = squash(s.replace(/\s*\(near [^)]*\)/i, ""));
  if (a && b && (a.includes(b) || b.includes(a))) return null;
  return s;
}

/* ───────────────────────────── the tax split ───────────────────────────── */

export type TaxSplit = {
  /** CGST + SGST inside the seller's state; IGST everywhere else. */
  kind: "intra" | "inter";
  rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  gst: number;
  total: number;
};

/**
 * The GST on a taxable amount, split the way the invoice will split it.
 * Mirrors billing_create_invoice (supabase/billing_hardening.sql): the buyer's
 * state is the place of supply, and equals the seller's state for CGST+SGST.
 * Works in paise, so the two halves add up to the tax exactly.
 */
export function taxSplit(taxableInr: number, buyerState: string, sellerState: string, rate = 0.18): TaxSplit {
  const taxablePaise = Math.round(taxableInr * 100);
  const gstPaise = Math.round(taxablePaise * rate);
  const intra = sellerState.trim() !== "" && sellerState.trim().toLowerCase() === buyerState.trim().toLowerCase();
  const half = Math.round(gstPaise / 2);
  return {
    kind: intra ? "intra" : "inter",
    rate,
    taxable: taxablePaise / 100,
    cgst: intra ? half / 100 : 0,
    sgst: intra ? (gstPaise - half) / 100 : 0,
    igst: intra ? 0 : gstPaise / 100,
    gst: gstPaise / 100,
    total: (taxablePaise + gstPaise) / 100,
  };
}

/* ─────────────── which state decides the tax (place of supply) ─────────── */

/**
 * The buyer's state for GST: the state inside a valid GSTIN when there is one
 * (a registered buyer's place of supply is the location on their GST
 * registration, whatever the browser says), else the state they chose.
 */
export function placeOfSupplyState(gstin: string, chosenState: string): string | null {
  const g = gstin.trim().toUpperCase();
  if (g.length === 15) {
    const fromGstin = GSTIN_STATE_BY_CODE[g.slice(0, 2)];
    if (fromGstin) return fromGstin;
  }
  return canonicalIndianState(chosenState) ?? null;
}
