/**
 * lib/logistics.ts — what the factory shoot costs to travel to.
 *
 * The crew travels from Gurgaon. What that costs depends entirely on where
 * the factory is, so the buyer's CITY — not a two-way "NCR or not" guess —
 * is what prices the travel line on the bill.
 *
 * Every figure here comes from the logistics tier sheet. Five tiers, 150
 * listed cities, and one honest fallback for a city that is not on the
 * list. Like lib/pricing.ts this file is pure TypeScript with no React and
 * no browser APIs, so the server can price travel without trusting
 * anything the browser claims.
 *
 * ┌─ READ THIS BEFORE QUOTING TIER 5 ─────────────────────────────────┐
 * │ Tier 5 is 134 of the 150 cities. Its charge covers ONLY the        │
 * │ Gurgaon-to-Delhi-airport transfers. The client books and pays the  │
 * │ flights, arranges the destination airport-to-factory transport and │
 * │ provides accommodation if the shoot needs an overnight. So the     │
 * │ tier charge is NOT the buyer's full travel cost, and any screen    │
 * │ that shows it must say what is still theirs to arrange — see       │
 * │ `clientArranges` on each tier and `TIER_DISCLOSURE` below.         │
 * └───────────────────────────────────────────────────────────────────┘
 *
 * TO CHANGE A TIER OR A CITY: edit the tables below and redeploy. The
 * amounts are whole rupees and EXCLUDE GST, exactly like lib/pricing.ts.
 */

/* ═══════════════════════ Tiers ═════════════════════════════════════ */

export type LogisticsTier = 1 | 2 | 3 | 4 | 5;

export type TierSpec = {
  tier: LogisticsTier;
  /** Short label for the bill line. */
  label: string;
  /** What we charge, GST excluded. */
  amountInr: number;
  /** How the crew gets there — shown under the bill line. */
  mode: string;
  /** What the CLIENT still has to arrange and pay for themselves. Empty
   *  array means the charge covers everything. */
  clientArranges: string[];
  /** Which places this tier covers, for the quote footnote. */
  policy: string;
};

export const LOGISTICS_TIERS: Record<LogisticsTier, TierSpec> = {
  1: {
    tier: 1,
    label: "NCR & nearby",
    amountInr: 4_000,
    mode: "Road, same-day return",
    clientArranges: [],
    policy:
      "Gurugram, Manesar, Faridabad, Sonipat, Kundli, Rai Industrial Area and other locations generally within 50-70 km. We confirm the factory address.",
  },
  2: {
    tier: 2,
    label: "Extended NCR",
    amountInr: 5_000,
    mode: "Road, same-day return",
    clientArranges: [],
    policy:
      "Kharkhoda and similar extended-local routes. We confirm the exact factory address.",
  },
  3: {
    tier: 3,
    label: "Train route",
    amountInr: 6_000,
    mode: "Train, both ways",
    clientArranges: ["Station-to-factory transfers, both ways"],
    policy:
      "Ambala and Ludhiana. Includes the crew's train travel to and from the destination station.",
  },
  4: {
    tier: 4,
    label: "Long-distance road",
    amountInr: 15_000,
    mode: "Road / cab, both ways",
    clientArranges: [],
    policy:
      "Jaipur, Chandigarh, Baddi and selected road routes, subject to feasibility. We confirm whether an overnight is needed.",
  },
  5: {
    tier: 5,
    label: "Air travel",
    amountInr: 2_000,
    mode: "Airport transfers only (Gurgaon office to Delhi airport)",
    clientArranges: [
      "The crew's flights, booked and paid by you on dates we agree together",
      "Destination airport-to-factory transport and local travel",
    ],
    policy:
      "Covers the Gurgaon office to Delhi departure airport transfer. You book the flights directly and arrange local transport at your end.",
  },
};

export const LOGISTICS_TIER_ORDER: LogisticsTier[] = [1, 2, 3, 4, 5];

export function isLogisticsTier(v: unknown): v is LogisticsTier {
  return v === 1 || v === 2 || v === 3 || v === 4 || v === 5;
}

/* ═══════════════════════ Shared rules ══════════════════════════════ */

/**
 * Every shoot day beyond the first. Charged with the order, because the
 * number of areas and videos the buyer picks is what decides how many
 * days the shoot needs — see shootDaysFor() in lib/pricing.ts.
 */
export const ADDITIONAL_SHOOT_DAY_INR = 20_000;

/**
 * Accommodation is always the client's, in every tier, whenever the shoot
 * needs an overnight. Said once here so no screen has to invent wording.
 */
export const ACCOMMODATION_RULE =
  "If the shoot needs an overnight stay, you arrange and pay for suitable accommodation for the crew.";

/** Printed wherever a tier charge is shown, so the buyer is never
 *  surprised by a cost that was never on the bill. */
export const TIER_DISCLOSURE =
  "This is our travel charge. Anything listed as arranged by you is not part of this bill.";

/** The sheet's own wording for a city we have not priced. */
export const UNLISTED_CITY_NOTE =
  "City not listed? We will confirm your VPV travel arrangement with you before the shoot.";

/* ═══════════════════════ The 150 cities ════════════════════════════ */

export type CitySpec = {
  city: string;
  state: string;
  tier: LogisticsTier;
  /** What the hub is known for. Shown as a hint under the picker. */
  sectors: string;
};

/** Alphabetical, so the dropdown can render it without sorting. */
export const LOGISTICS_CITIES: CitySpec[] = [
  { city: "Adityapur", state: "Jharkhand", tier: 5, sectors: "Auto components, machinery, fabrication" },
  { city: "Agra", state: "Uttar Pradesh", tier: 5, sectors: "Footwear, leather, engineering" },
  { city: "Ahilyanagar (Ahmednagar)", state: "Maharashtra", tier: 5, sectors: "Auto components, agricultural machinery" },
  { city: "Ahmedabad", state: "Gujarat", tier: 5, sectors: "Textiles, pharma, engineering, chemicals" },
  { city: "Aligarh", state: "Uttar Pradesh", tier: 5, sectors: "Locks, hardware, metal products" },
  { city: "Alwar", state: "Rajasthan", tier: 5, sectors: "Automobiles, engineering, electricals" },
  { city: "Ambala", state: "Haryana", tier: 3, sectors: "Scientific instruments, engineering" },
  { city: "Ambattur", state: "Tamil Nadu", tier: 5, sectors: "Engineering, electricals, auto components" },
  { city: "Amravati", state: "Maharashtra", tier: 5, sectors: "Textiles, cotton processing" },
  { city: "Amritsar", state: "Punjab", tier: 5, sectors: "Textiles, food processing, engineering" },
  { city: "Anand", state: "Gujarat", tier: 5, sectors: "Dairy, food processing, engineering" },
  { city: "Angul", state: "Odisha", tier: 5, sectors: "Aluminium, steel, industrial equipment" },
  { city: "Ankleshwar", state: "Gujarat", tier: 5, sectors: "Chemicals, pharma" },
  { city: "Asansol", state: "West Bengal", tier: 5, sectors: "Steel, metals, engineering" },
  { city: "Baddi", state: "Himachal Pradesh", tier: 4, sectors: "Pharmaceuticals, consumer products" },
  { city: "Ballari", state: "Karnataka", tier: 5, sectors: "Steel, metals, fabrication" },
  { city: "Batala", state: "Punjab", tier: 5, sectors: "Machine tools, castings, engineering" },
  { city: "Belagavi", state: "Karnataka", tier: 5, sectors: "Foundries, castings, aerospace components" },
  { city: "Bengaluru", state: "Karnataka", tier: 5, sectors: "Electronics, aerospace, engineering" },
  { city: "Bhagalpur", state: "Bihar", tier: 5, sectors: "Silk textiles, garments, food processing" },
  { city: "Bharuch", state: "Gujarat", tier: 5, sectors: "Chemicals, pharmaceuticals" },
  { city: "Bhavnagar", state: "Gujarat", tier: 5, sectors: "Ship recycling, engineering, salt" },
  { city: "Bhilai", state: "Chhattisgarh", tier: 5, sectors: "Steel, heavy engineering, machinery" },
  { city: "Bhilwara", state: "Rajasthan", tier: 5, sectors: "Textiles, yarn, fabrics" },
  { city: "Bhiwadi", state: "Rajasthan", tier: 1, sectors: "Automobiles, electronics, machinery" },
  { city: "Bhiwandi", state: "Maharashtra", tier: 5, sectors: "Textiles, packaging, light manufacturing" },
  { city: "Bhopal", state: "Madhya Pradesh", tier: 5, sectors: "Electricals, engineering, industrial equipment" },
  { city: "Bhubaneswar", state: "Odisha", tier: 5, sectors: "Electronics, food processing, engineering" },
  { city: "Bilaspur", state: "Chhattisgarh", tier: 5, sectors: "Cement, engineering, food processing" },
  { city: "Bokaro", state: "Jharkhand", tier: 5, sectors: "Steel, industrial fabrication" },
  { city: "Chakan", state: "Maharashtra", tier: 5, sectors: "Automobiles, engineering, auto components" },
  { city: "Chennai", state: "Tamil Nadu", tier: 5, sectors: "Automobiles, electronics, engineering" },
  { city: "Chhatrapati Sambhajinagar", state: "Maharashtra", tier: 5, sectors: "Automobiles, engineering, pharmaceuticals" },
  { city: "Coimbatore", state: "Tamil Nadu", tier: 5, sectors: "Pumps, motors, machinery, foundries" },
  { city: "Dahej", state: "Gujarat", tier: 5, sectors: "Chemicals, petrochemicals" },
  { city: "Davanagere", state: "Karnataka", tier: 5, sectors: "Textiles, food processing" },
  { city: "Dewas", state: "Madhya Pradesh", tier: 5, sectors: "Pharmaceuticals, engineering, food products" },
  { city: "Dharuhera", state: "Haryana", tier: 1, sectors: "Automobiles, auto components" },
  { city: "Dharwad", state: "Karnataka", tier: 5, sectors: "Engineering, automobiles" },
  { city: "Dindigul", state: "Tamil Nadu", tier: 5, sectors: "Textiles, leather, food processing" },
  { city: "Durgapur", state: "West Bengal", tier: 5, sectors: "Steel, heavy engineering, chemicals" },
  { city: "Erode", state: "Tamil Nadu", tier: 5, sectors: "Textiles, food processing" },
  { city: "Faridabad", state: "Haryana", tier: 1, sectors: "Engineering, machinery, auto components" },
  { city: "Firozabad", state: "Uttar Pradesh", tier: 5, sectors: "Glassware, glass products" },
  { city: "Gandhinagar", state: "Gujarat", tier: 5, sectors: "Electronics, engineering, pharma" },
  { city: "Ghaziabad", state: "Uttar Pradesh", tier: 1, sectors: "Engineering, machinery, metals" },
  { city: "Goa / Verna", state: "Goa", tier: 5, sectors: "Goa" },
  { city: "Gorakhpur", state: "Uttar Pradesh", tier: 5, sectors: "Chemicals, plastics, food processing" },
  { city: "Greater Noida", state: "Uttar Pradesh", tier: 1, sectors: "Electronics, automobiles, appliances" },
  { city: "Guntur", state: "Andhra Pradesh", tier: 5, sectors: "Textiles, food processing, tobacco" },
  { city: "Gurugram", state: "Haryana", tier: 1, sectors: "Automobiles, electronics, industrial equipment" },
  { city: "Guwahati", state: "Assam", tier: 5, sectors: "Assam" },
  { city: "Gwalior", state: "Madhya Pradesh", tier: 5, sectors: "Chemicals, textiles, food processing" },
  { city: "Haldia", state: "West Bengal", tier: 5, sectors: "Petrochemicals, chemicals, processing" },
  { city: "Halol", state: "Gujarat", tier: 5, sectors: "Automobiles, engineering" },
  { city: "Haridwar", state: "Uttarakhand", tier: 4, sectors: "Automobiles, pharmaceuticals, engineering" },
  { city: "Hoshiarpur", state: "Punjab", tier: 5, sectors: "Auto components, agricultural machinery" },
  { city: "Hosur", state: "Tamil Nadu", tier: 5, sectors: "Automobiles, electronics, engineering" },
  { city: "Howrah", state: "West Bengal", tier: 5, sectors: "Foundries, castings, fabrication" },
  { city: "Hubballi", state: "Karnataka", tier: 5, sectors: "Engineering, foundries, machinery" },
  { city: "Hyderabad", state: "Telangana", tier: 5, sectors: "Pharmaceuticals, electronics, engineering" },
  { city: "Ichalkaranji", state: "Maharashtra", tier: 5, sectors: "Textiles, powerloom products" },
  { city: "Indore", state: "Madhya Pradesh", tier: 5, sectors: "Pharmaceuticals, engineering, food processing" },
  { city: "Jabalpur", state: "Madhya Pradesh", tier: 5, sectors: "Defence equipment, engineering" },
  { city: "Jaipur", state: "Rajasthan", tier: 4, sectors: "Gems, jewellery, engineering, textiles" },
  { city: "Jalandhar", state: "Punjab", tier: 5, sectors: "Sports goods, rubber products, engineering" },
  { city: "Jalgaon", state: "Maharashtra", tier: 5, sectors: "Food processing, plastics, engineering" },
  { city: "Jammu", state: "Jammu & Kashmir", tier: 5, sectors: "Jammu & Kashmir" },
  { city: "Jamnagar", state: "Gujarat", tier: 5, sectors: "Brass parts, engineering, petrochemicals" },
  { city: "Jamshedpur", state: "Jharkhand", tier: 5, sectors: "Steel, automobiles, engineering" },
  { city: "Jharsuguda", state: "Odisha", tier: 5, sectors: "Aluminium, metals, industrial products" },
  { city: "Jodhpur", state: "Rajasthan", tier: 5, sectors: "Furniture, handicrafts, engineering" },
  { city: "Junagadh", state: "Gujarat", tier: 5, sectors: "Food processing, agricultural products" },
  { city: "Kakinada", state: "Andhra Pradesh", tier: 5, sectors: "Food processing, chemicals, paper" },
  { city: "Kalol", state: "Gujarat", tier: 5, sectors: "Engineering, chemicals" },
  { city: "Kanpur", state: "Uttar Pradesh", tier: 5, sectors: "Leather, textiles, engineering" },
  { city: "Karur", state: "Tamil Nadu", tier: 5, sectors: "Home textiles, furnishings" },
  { city: "Kashipur", state: "Uttarakhand", tier: 5, sectors: "Paper, chemicals, food processing" },
  { city: "Kochi", state: "Kerala", tier: 5, sectors: "Kerala" },
  { city: "Kolhapur", state: "Maharashtra", tier: 5, sectors: "Foundries, castings, auto components" },
  { city: "Kolkata", state: "West Bengal", tier: 5, sectors: "Engineering, electricals, industrial products" },
  { city: "Kota", state: "Rajasthan", tier: 5, sectors: "Chemicals, engineering, textiles" },
  { city: "Kurnool", state: "Andhra Pradesh", tier: 5, sectors: "Cement, food processing, engineering" },
  { city: "Kutch / Mundra", state: "Gujarat", tier: 5, sectors: "Engineering, salt, metals, processing" },
  { city: "Lucknow", state: "Uttar Pradesh", tier: 5, sectors: "Engineering, defence manufacturing" },
  { city: "Ludhiana", state: "Punjab", tier: 3, sectors: "Bicycles, auto parts, textiles, machinery" },
  { city: "Madurai", state: "Tamil Nadu", tier: 5, sectors: "Engineering, textiles, food processing" },
  { city: "Mandi Gobindgarh", state: "Punjab", tier: 5, sectors: "Steel, rolling mills, metal products" },
  { city: "Mandideep", state: "Madhya Pradesh", tier: 5, sectors: "Pharmaceuticals, electricals, engineering" },
  { city: "Manesar", state: "Haryana", tier: 1, sectors: "Automobiles, auto components" },
  { city: "Mangaluru", state: "Karnataka", tier: 5, sectors: "Chemicals, petrochemicals, food processing" },
  { city: "Medchal", state: "Telangana", tier: 5, sectors: "Engineering, plastics, pharmaceuticals" },
  { city: "Meerut", state: "Uttar Pradesh", tier: 5, sectors: "Sports goods, engineering" },
  { city: "Mehsana", state: "Gujarat", tier: 5, sectors: "Engineering, dairy, auto components" },
  { city: "Mohali", state: "Punjab", tier: 5, sectors: "Electronics, pharmaceuticals, engineering" },
  { city: "Moradabad", state: "Uttar Pradesh", tier: 5, sectors: "Metalware, handicrafts" },
  { city: "Morbi", state: "Gujarat", tier: 5, sectors: "Ceramics, tiles, sanitaryware" },
  { city: "Mumbai", state: "Maharashtra", tier: 5, sectors: "Pharmaceuticals, chemicals, consumer products" },
  { city: "Muzaffarpur", state: "Bihar", tier: 5, sectors: "Food processing, textiles, agro-industries" },
  { city: "Mysuru", state: "Karnataka", tier: 5, sectors: "Engineering, automotive, food processing" },
  { city: "Nagpur", state: "Maharashtra", tier: 5, sectors: "Engineering, food processing, metals" },
  { city: "Nashik", state: "Maharashtra", tier: 5, sectors: "Auto components, engineering, electricals" },
  { city: "Noida", state: "Uttar Pradesh", tier: 1, sectors: "Electronics, electricals, consumer products" },
  { city: "Pali", state: "Rajasthan", tier: 5, sectors: "Textiles, dyeing, processing" },
  { city: "Panipat", state: "Haryana", tier: 1, sectors: "Textiles, home furnishings, chemicals" },
  { city: "Parwanoo", state: "Himachal Pradesh", tier: 5, sectors: "Engineering, electricals, packaging" },
  { city: "Patancheru", state: "Telangana", tier: 5, sectors: "Chemicals, pharma, industrial products" },
  { city: "Patna", state: "Bihar", tier: 5, sectors: "Food processing, pharmaceuticals, light manufacturing" },
  { city: "Peenya", state: "Karnataka", tier: 5, sectors: "Machinery, electricals, industrial components" },
  { city: "Pimpri-Chinchwad", state: "Maharashtra", tier: 5, sectors: "Automobiles, machinery, industrial components" },
  { city: "Pithampur", state: "Madhya Pradesh", tier: 5, sectors: "Automobiles, machinery, engineering" },
  { city: "Pune", state: "Maharashtra", tier: 5, sectors: "Automobiles, engineering, electronics" },
  { city: "Raigarh", state: "Chhattisgarh", tier: 5, sectors: "Steel, metals, power-related equipment" },
  { city: "Raipur", state: "Chhattisgarh", tier: 5, sectors: "Steel, fabrication, engineering" },
  { city: "Rajkot", state: "Gujarat", tier: 5, sectors: "Auto parts, machine tools, foundries" },
  { city: "Ranchi", state: "Jharkhand", tier: 5, sectors: "Heavy engineering, machinery" },
  { city: "Rewari", state: "Haryana", tier: 1, sectors: "Automobiles, industrial components" },
  { city: "Rourkela", state: "Odisha", tier: 5, sectors: "Steel, heavy engineering, fabrication" },
  { city: "Rudrapur", state: "Uttarakhand", tier: 5, sectors: "Automobiles, electronics, consumer products" },
  { city: "Salem", state: "Tamil Nadu", tier: 5, sectors: "Steel, textiles, engineering" },
  { city: "Sanand", state: "Gujarat", tier: 5, sectors: "Automobiles, electronics" },
  { city: "Sangareddy", state: "Telangana", tier: 5, sectors: "Engineering, electronics, manufacturing" },
  { city: "Sangli", state: "Maharashtra", tier: 5, sectors: "Food processing, engineering, textiles" },
  { city: "Satara", state: "Maharashtra", tier: 5, sectors: "Automobiles, engineering, food processing" },
  { city: "Siliguri", state: "West Bengal", tier: 5, sectors: "Food processing, packaging, light manufacturing" },
  { city: "Sivakasi", state: "Tamil Nadu", tier: 5, sectors: "Printing, packaging, paper products" },
  { city: "Solan", state: "Himachal Pradesh", tier: 5, sectors: "Pharmaceuticals, food processing" },
  { city: "Solapur", state: "Maharashtra", tier: 5, sectors: "Textiles, garments, engineering" },
  { city: "Sonipat", state: "Haryana", tier: 1, sectors: "Engineering, food processing, packaging" },
  { city: "Sri City", state: "Andhra Pradesh", tier: 5, sectors: "Electronics, automobiles, consumer goods" },
  { city: "Sriperumbudur", state: "Tamil Nadu", tier: 5, sectors: "Electronics, automobiles" },
  { city: "Surat", state: "Gujarat", tier: 5, sectors: "Textiles, diamonds, chemicals" },
  { city: "Thane", state: "Maharashtra", tier: 5, sectors: "Chemicals, engineering, plastics" },
  { city: "Thiruvananthapuram", state: "Kerala", tier: 5, sectors: "Kerala" },
  { city: "Tiruchirappalli", state: "Tamil Nadu", tier: 5, sectors: "Heavy engineering, fabrication" },
  { city: "Tirunelveli", state: "Tamil Nadu", tier: 5, sectors: "Food processing, engineering" },
  { city: "Tirupati", state: "Andhra Pradesh", tier: 5, sectors: "Electronics, electricals, manufacturing" },
  { city: "Tiruppur", state: "Tamil Nadu", tier: 5, sectors: "Garments, textiles" },
  { city: "Tumakuru", state: "Karnataka", tier: 5, sectors: "Engineering, machinery, food processing" },
  { city: "Udaipur", state: "Rajasthan", tier: 5, sectors: "Minerals, chemicals, engineering" },
  { city: "Vadodara", state: "Gujarat", tier: 5, sectors: "Engineering, electricals, chemicals" },
  { city: "Valsad", state: "Gujarat", tier: 5, sectors: "Chemicals, textiles, pharmaceuticals" },
  { city: "Vapi", state: "Gujarat", tier: 5, sectors: "Chemicals, paper, packaging" },
  { city: "Varanasi", state: "Uttar Pradesh", tier: 5, sectors: "Textiles, silk, manufacturing" },
  { city: "Vellore", state: "Tamil Nadu", tier: 5, sectors: "Leather, footwear, engineering" },
  { city: "Vijayawada", state: "Andhra Pradesh", tier: 5, sectors: "Engineering, auto components, food processing" },
  { city: "Visakhapatnam", state: "Andhra Pradesh", tier: 5, sectors: "Steel, pharmaceuticals, shipbuilding" },
  { city: "Warangal", state: "Telangana", tier: 5, sectors: "Textiles, food processing, engineering" },
  { city: "Yamunanagar", state: "Haryana", tier: 5, sectors: "Plywood, paper, machinery" },
  { city: "Zaheerabad", state: "Telangana", tier: 5, sectors: "Automobiles, agricultural machinery" },
];

/* ═══════════════════════ Lookup ════════════════════════════════════ */

/** Lower-cased, punctuation-free, single-spaced — so "New  Delhi." and
 *  "new delhi" are the same key. */
export function cityKey(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BY_KEY = new Map<string, CitySpec>(
  LOGISTICS_CITIES.map((c) => [cityKey(c.city), c])
);

/** The listed city, or null when we have not priced it. */
export function findCity(value: unknown): CitySpec | null {
  const k = cityKey(value);
  if (!k) return null;
  return BY_KEY.get(k) ?? null;
}

export type LogisticsQuote = {
  /** What the buyer typed or picked, cleaned up. */
  city: string;
  /** Null when the city is not on our list. */
  matched: CitySpec | null;
  tier: LogisticsTier;
  spec: TierSpec;
  /** The travel charge on the bill, GST excluded. */
  amountInr: number;
  /**
   * True when the city is not on our list. We still quote a number, but
   * every screen must say we confirm the arrangement before the shoot —
   * and a rep should ring them.
   */
  needsConfirmation: boolean;
};

/**
 * Price the travel to a city.
 *
 * An unlisted city is quoted at TIER 5, which is the honest default: a
 * city we have not mapped is, in practice, somewhere we fly to. It is
 * flagged `needsConfirmation` so the buyer is told we will confirm the
 * arrangement, rather than being quietly charged a guess.
 *
 * This is the authority. The browser shows what it returns; the order
 * route calls it again to set the amount actually charged.
 */
export function logisticsFor(value: unknown): LogisticsQuote {
  const typed = typeof value === "string" ? value.trim().slice(0, 80) : "";
  const matched = findCity(typed);
  const tier: LogisticsTier = matched ? matched.tier : 5;
  const spec = LOGISTICS_TIERS[tier];
  return {
    city: matched ? matched.city : typed,
    matched,
    tier,
    spec,
    amountInr: spec.amountInr,
    needsConfirmation: matched === null,
  };
}

/** Grouped by state, for a dropdown with headings. */
export function citiesByState(): { state: string; cities: CitySpec[] }[] {
  const map = new Map<string, CitySpec[]>();
  for (const c of LOGISTICS_CITIES) {
    const list = map.get(c.state);
    if (list) list.push(c);
    else map.set(c.state, [c]);
  }
  return [...map.entries()]
    .map(([state, cities]) => ({ state, cities }))
    .sort((a, b) => a.state.localeCompare(b.state));
}
