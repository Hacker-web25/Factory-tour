/**
 * Reading what the marketing site already knows about a buyer.
 *
 * The site (the single-page app in /public/static) keeps the whole
 * assessment in ONE localStorage key on this same origin. When a visitor
 * reaches the payment step it sends them to /checkout, and this module
 * is how /checkout picks up what they already typed instead of asking
 * for it a second time.
 *
 * Everything here is UNTRUSTED. It decides what to show and what to
 * pre-fill — never a price. The amount is set by the server from
 * lib/pricing.ts, so a visitor who edits this storage by hand changes
 * what they see, not what they are charged.
 *
 * The shape is the site's, not ours: if a future build of the site
 * renames a field, the worst case is an empty form, never a wrong one.
 */

import { canonicalIndianState } from "@/lib/indianStates";
import { isSitePlanId, isTravelZone, type SitePlanId, type TravelZone } from "@/lib/pricing";

/** The site's one storage key. */
export const SITE_STATE_KEY = "myvpv:phase1:v1";

export type Handoff = {
  planId: SitePlanId | null;
  travel: TravelZone | null;
  buyer: {
    name: string;
    email: string;
    phone: string;
    company: string;
    gstin: string;
    address: string;
    state: string;
  };
};

const EMPTY: Handoff = {
  planId: null,
  travel: null,
  buyer: { name: "", email: "", phone: "", company: "", gstin: "", address: "", state: "" },
};

function str(v: unknown, max = 400): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/**
 * Read the site's saved assessment. `search` is the current query
 * string, which wins over storage so a link can carry the choice
 * explicitly (and so the flow still works with storage disabled).
 */
export function readHandoff(search?: string): Handoff {
  let planId: SitePlanId | null = null;
  let travel: TravelZone | null = null;
  const buyer = { ...EMPTY.buyer };

  if (search) {
    const q = new URLSearchParams(search);
    const p = q.get("plan");
    const t = q.get("travel");
    if (isSitePlanId(p)) planId = p;
    if (isTravelZone(t)) travel = t;
  }

  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(SITE_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const a = (parsed.assessment ?? {}) as Record<string, unknown>;
      const c = (parsed.checkout ?? {}) as Record<string, unknown>;

      if (!planId && isSitePlanId(a.selectedPlanId)) planId = a.selectedPlanId;
      if (!travel && isTravelZone(a.travel)) travel = a.travel;

      buyer.name = str(c.contactName, 120);
      buyer.email = str(c.email, 254).toLowerCase();
      buyer.phone = str(c.mobile, 20);
      buyer.company = str(c.companyName, 160);
      buyer.gstin = str(c.gstin, 40).toUpperCase();
      // The site asks for "city, state" as one free-text line. Keep it as
      // the address, and only pre-select the state dropdown when the text
      // actually names a state we recognise — a wrong guess here would
      // put the wrong GST split on a real invoice.
      const cityState = str(c.cityState, 200);
      buyer.address = cityState;
      buyer.state = stateWithin(cityState) ?? "";
    }
  } catch {
    // Private mode, blocked storage, or anything else: fall back to an
    // empty form rather than failing the page.
  }

  return { planId, travel, buyer };
}

/**
 * Pull a state out of a free-text "city, state" line.
 *
 * Only an exact state name counts, whether it is the whole line or one
 * comma-separated part of it ("Gurgaon, Haryana" → "Haryana"). Anything
 * else returns null and the buyer picks the state themselves, because
 * the state decides CGST+SGST versus IGST on a real invoice and a guess
 * there is worse than an empty field.
 */
function stateWithin(text: string): string | null {
  const whole = canonicalIndianState(text);
  if (whole) return whole;
  for (const part of text.split(",")) {
    const hit = canonicalIndianState(part.trim());
    if (hit) return hit;
  }
  return null;
}
