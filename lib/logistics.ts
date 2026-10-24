/**
 * lib/logistics.ts — where we shoot, and what the crew's travel costs.
 *
 * Today the crew travels BY CAB ONLY, from our Gurugram office, out and back
 * the same day. There is no air or train travel, no airport transfer and
 * nothing for the buyer to book: one flat cab charge covers the trip, and it
 * is on the bill before they pay.
 *
 * That means we only shoot in the cities a cab can reach in a day
 * (SERVICE_AREAS). Anyone else can still go through the assessment and see
 * their plan and price, but they cannot pay yet: every screen tells them we
 * are coming to their city soon, and the city they typed is stored on the
 * lead so /admin/cities shows where to go next.
 *
 * The 150-city table below is kept only to RECOGNISE what people type ("gurgaon"
 * is Gurugram, "Ludhiana" is in Punjab) for the demand report and the GST
 * place of supply. It does not price anything.
 *
 * Like lib/pricing.ts this file is pure TypeScript with no React and no
 * browser APIs, so the server prices travel without trusting the browser.
 * Amounts are whole rupees and EXCLUDE GST.
 */

/* ═══════════════════════ The cab ═══════════════════════════════════ */

export const CAB_TRAVEL = {
  label: "Cab travel",
  /** What we charge for the crew's cab, out and back, GST excluded. */
  // TEMPORARY LIVE-PAYMENT TEST: must be 4_000. Change back and push again after the test.
  amountInr: 1,
  mode: "By cab from our Gurugram office, there and back the same day",
} as const;

/**
 * Every shoot day beyond the first. Not charged today (see
 * CHARGE_ADDITIONAL_SHOOT_DAY in lib/pricing.ts), kept so the rule exists
 * in one place if it is ever switched on.
 */
export const ADDITIONAL_SHOOT_DAY_INR = 20_000;

/* ═══════════════════════ The 150 cities ════════════════════════════ */

export type CitySpec = {
  city: string;
  state: string;
  /** What the hub is known for. */
  sectors: string;
};

/** Alphabetical. Recognises typed cities; prices nothing. */
export const LOGISTICS_CITIES: CitySpec[] = [
  { city: "Adityapur", state: "Jharkhand", sectors: "Auto components, machinery, fabrication" },
  { city: "Agra", state: "Uttar Pradesh", sectors: "Footwear, leather, engineering" },
  { city: "Ahilyanagar (Ahmednagar)", state: "Maharashtra", sectors: "Auto components, agricultural machinery" },
  { city: "Ahmedabad", state: "Gujarat", sectors: "Textiles, pharma, engineering, chemicals" },
  { city: "Aligarh", state: "Uttar Pradesh", sectors: "Locks, hardware, metal products" },
  { city: "Alwar", state: "Rajasthan", sectors: "Automobiles, engineering, electricals" },
  { city: "Ambala", state: "Haryana", sectors: "Scientific instruments, engineering" },
  { city: "Ambattur", state: "Tamil Nadu", sectors: "Engineering, electricals, auto components" },
  { city: "Amravati", state: "Maharashtra", sectors: "Textiles, cotton processing" },
  { city: "Amritsar", state: "Punjab", sectors: "Textiles, food processing, engineering" },
  { city: "Anand", state: "Gujarat", sectors: "Dairy, food processing, engineering" },
  { city: "Angul", state: "Odisha", sectors: "Aluminium, steel, industrial equipment" },
  { city: "Ankleshwar", state: "Gujarat", sectors: "Chemicals, pharma" },
  { city: "Asansol", state: "West Bengal", sectors: "Steel, metals, engineering" },
  { city: "Baddi", state: "Himachal Pradesh", sectors: "Pharmaceuticals, consumer products" },
  { city: "Ballari", state: "Karnataka", sectors: "Steel, metals, fabrication" },
  { city: "Batala", state: "Punjab", sectors: "Machine tools, castings, engineering" },
  { city: "Belagavi", state: "Karnataka", sectors: "Foundries, castings, aerospace components" },
  { city: "Bengaluru", state: "Karnataka", sectors: "Electronics, aerospace, engineering" },
  { city: "Bhagalpur", state: "Bihar", sectors: "Silk textiles, garments, food processing" },
  { city: "Bharuch", state: "Gujarat", sectors: "Chemicals, pharmaceuticals" },
  { city: "Bhavnagar", state: "Gujarat", sectors: "Ship recycling, engineering, salt" },
  { city: "Bhilai", state: "Chhattisgarh", sectors: "Steel, heavy engineering, machinery" },
  { city: "Bhilwara", state: "Rajasthan", sectors: "Textiles, yarn, fabrics" },
  { city: "Bhiwadi", state: "Rajasthan", sectors: "Automobiles, electronics, machinery" },
  { city: "Bhiwandi", state: "Maharashtra", sectors: "Textiles, packaging, light manufacturing" },
  { city: "Bhopal", state: "Madhya Pradesh", sectors: "Electricals, engineering, industrial equipment" },
  { city: "Bhubaneswar", state: "Odisha", sectors: "Electronics, food processing, engineering" },
  { city: "Bilaspur", state: "Chhattisgarh", sectors: "Cement, engineering, food processing" },
  { city: "Bokaro", state: "Jharkhand", sectors: "Steel, industrial fabrication" },
  { city: "Chakan", state: "Maharashtra", sectors: "Automobiles, engineering, auto components" },
  { city: "Chennai", state: "Tamil Nadu", sectors: "Automobiles, electronics, engineering" },
  { city: "Chhatrapati Sambhajinagar", state: "Maharashtra", sectors: "Automobiles, engineering, pharmaceuticals" },
  { city: "Coimbatore", state: "Tamil Nadu", sectors: "Pumps, motors, machinery, foundries" },
  { city: "Dahej", state: "Gujarat", sectors: "Chemicals, petrochemicals" },
  { city: "Davanagere", state: "Karnataka", sectors: "Textiles, food processing" },
  { city: "Dewas", state: "Madhya Pradesh", sectors: "Pharmaceuticals, engineering, food products" },
  // Not in the original sheet; added as the NCR road rate it plainly is.
  { city: "Delhi", state: "Delhi", sectors: "Engineering, garments, electricals, printing" },
  { city: "Dharuhera", state: "Haryana", sectors: "Automobiles, auto components" },
  { city: "Dharwad", state: "Karnataka", sectors: "Engineering, automobiles" },
  { city: "Dindigul", state: "Tamil Nadu", sectors: "Textiles, leather, food processing" },
  { city: "Durgapur", state: "West Bengal", sectors: "Steel, heavy engineering, chemicals" },
  { city: "Erode", state: "Tamil Nadu", sectors: "Textiles, food processing" },
  { city: "Faridabad", state: "Haryana", sectors: "Engineering, machinery, auto components" },
  { city: "Firozabad", state: "Uttar Pradesh", sectors: "Glassware, glass products" },
  { city: "Gandhinagar", state: "Gujarat", sectors: "Electronics, engineering, pharma" },
  { city: "Ghaziabad", state: "Uttar Pradesh", sectors: "Engineering, machinery, metals" },
  { city: "Goa / Verna", state: "Goa", sectors: "Goa" },
  { city: "Gorakhpur", state: "Uttar Pradesh", sectors: "Chemicals, plastics, food processing" },
  { city: "Greater Noida", state: "Uttar Pradesh", sectors: "Electronics, automobiles, appliances" },
  { city: "Guntur", state: "Andhra Pradesh", sectors: "Textiles, food processing, tobacco" },
  { city: "Gurugram", state: "Haryana", sectors: "Automobiles, electronics, industrial equipment" },
  { city: "Guwahati", state: "Assam", sectors: "Assam" },
  { city: "Gwalior", state: "Madhya Pradesh", sectors: "Chemicals, textiles, food processing" },
  { city: "Haldia", state: "West Bengal", sectors: "Petrochemicals, chemicals, processing" },
  { city: "Halol", state: "Gujarat", sectors: "Automobiles, engineering" },
  { city: "Haridwar", state: "Uttarakhand", sectors: "Automobiles, pharmaceuticals, engineering" },
  { city: "Hoshiarpur", state: "Punjab", sectors: "Auto components, agricultural machinery" },
  { city: "Hosur", state: "Tamil Nadu", sectors: "Automobiles, electronics, engineering" },
  { city: "Howrah", state: "West Bengal", sectors: "Foundries, castings, fabrication" },
  { city: "Hubballi", state: "Karnataka", sectors: "Engineering, foundries, machinery" },
  { city: "Hyderabad", state: "Telangana", sectors: "Pharmaceuticals, electronics, engineering" },
  { city: "Ichalkaranji", state: "Maharashtra", sectors: "Textiles, powerloom products" },
  { city: "Indore", state: "Madhya Pradesh", sectors: "Pharmaceuticals, engineering, food processing" },
  { city: "Jabalpur", state: "Madhya Pradesh", sectors: "Defence equipment, engineering" },
  { city: "Jaipur", state: "Rajasthan", sectors: "Gems, jewellery, engineering, textiles" },
  { city: "Jalandhar", state: "Punjab", sectors: "Sports goods, rubber products, engineering" },
  { city: "Jalgaon", state: "Maharashtra", sectors: "Food processing, plastics, engineering" },
  { city: "Jammu", state: "Jammu & Kashmir", sectors: "Jammu & Kashmir" },
  { city: "Jamnagar", state: "Gujarat", sectors: "Brass parts, engineering, petrochemicals" },
  { city: "Jamshedpur", state: "Jharkhand", sectors: "Steel, automobiles, engineering" },
  { city: "Jharsuguda", state: "Odisha", sectors: "Aluminium, metals, industrial products" },
  { city: "Jodhpur", state: "Rajasthan", sectors: "Furniture, handicrafts, engineering" },
  { city: "Junagadh", state: "Gujarat", sectors: "Food processing, agricultural products" },
  { city: "Kakinada", state: "Andhra Pradesh", sectors: "Food processing, chemicals, paper" },
  { city: "Kalol", state: "Gujarat", sectors: "Engineering, chemicals" },
  { city: "Kanpur", state: "Uttar Pradesh", sectors: "Leather, textiles, engineering" },
  { city: "Karur", state: "Tamil Nadu", sectors: "Home textiles, furnishings" },
  { city: "Kashipur", state: "Uttarakhand", sectors: "Paper, chemicals, food processing" },
  { city: "Kochi", state: "Kerala", sectors: "Kerala" },
  { city: "Kolhapur", state: "Maharashtra", sectors: "Foundries, castings, auto components" },
  { city: "Kolkata", state: "West Bengal", sectors: "Engineering, electricals, industrial products" },
  { city: "Kota", state: "Rajasthan", sectors: "Chemicals, engineering, textiles" },
  { city: "Kurnool", state: "Andhra Pradesh", sectors: "Cement, food processing, engineering" },
  { city: "Kutch / Mundra", state: "Gujarat", sectors: "Engineering, salt, metals, processing" },
  { city: "Lucknow", state: "Uttar Pradesh", sectors: "Engineering, defence manufacturing" },
  { city: "Ludhiana", state: "Punjab", sectors: "Bicycles, auto parts, textiles, machinery" },
  { city: "Madurai", state: "Tamil Nadu", sectors: "Engineering, textiles, food processing" },
  { city: "Mandi Gobindgarh", state: "Punjab", sectors: "Steel, rolling mills, metal products" },
  { city: "Mandideep", state: "Madhya Pradesh", sectors: "Pharmaceuticals, electricals, engineering" },
  { city: "Manesar", state: "Haryana", sectors: "Automobiles, auto components" },
  { city: "Mangaluru", state: "Karnataka", sectors: "Chemicals, petrochemicals, food processing" },
  { city: "Medchal", state: "Telangana", sectors: "Engineering, plastics, pharmaceuticals" },
  { city: "Meerut", state: "Uttar Pradesh", sectors: "Sports goods, engineering" },
  { city: "Mehsana", state: "Gujarat", sectors: "Engineering, dairy, auto components" },
  { city: "Mohali", state: "Punjab", sectors: "Electronics, pharmaceuticals, engineering" },
  { city: "Moradabad", state: "Uttar Pradesh", sectors: "Metalware, handicrafts" },
  { city: "Morbi", state: "Gujarat", sectors: "Ceramics, tiles, sanitaryware" },
  { city: "Mumbai", state: "Maharashtra", sectors: "Pharmaceuticals, chemicals, consumer products" },
  { city: "Muzaffarpur", state: "Bihar", sectors: "Food processing, textiles, agro-industries" },
  { city: "Mysuru", state: "Karnataka", sectors: "Engineering, automotive, food processing" },
  { city: "Nagpur", state: "Maharashtra", sectors: "Engineering, food processing, metals" },
  { city: "Nashik", state: "Maharashtra", sectors: "Auto components, engineering, electricals" },
  { city: "Noida", state: "Uttar Pradesh", sectors: "Electronics, electricals, consumer products" },
  { city: "Pali", state: "Rajasthan", sectors: "Textiles, dyeing, processing" },
  { city: "Panipat", state: "Haryana", sectors: "Textiles, home furnishings, chemicals" },
  { city: "Parwanoo", state: "Himachal Pradesh", sectors: "Engineering, electricals, packaging" },
  { city: "Patancheru", state: "Telangana", sectors: "Chemicals, pharma, industrial products" },
  { city: "Patna", state: "Bihar", sectors: "Food processing, pharmaceuticals, light manufacturing" },
  { city: "Peenya", state: "Karnataka", sectors: "Machinery, electricals, industrial components" },
  { city: "Pimpri-Chinchwad", state: "Maharashtra", sectors: "Automobiles, machinery, industrial components" },
  { city: "Pithampur", state: "Madhya Pradesh", sectors: "Automobiles, machinery, engineering" },
  { city: "Pune", state: "Maharashtra", sectors: "Automobiles, engineering, electronics" },
  { city: "Raigarh", state: "Chhattisgarh", sectors: "Steel, metals, power-related equipment" },
  { city: "Raipur", state: "Chhattisgarh", sectors: "Steel, fabrication, engineering" },
  { city: "Rajkot", state: "Gujarat", sectors: "Auto parts, machine tools, foundries" },
  { city: "Ranchi", state: "Jharkhand", sectors: "Heavy engineering, machinery" },
  { city: "Rewari", state: "Haryana", sectors: "Automobiles, industrial components" },
  { city: "Rourkela", state: "Odisha", sectors: "Steel, heavy engineering, fabrication" },
  { city: "Rudrapur", state: "Uttarakhand", sectors: "Automobiles, electronics, consumer products" },
  { city: "Salem", state: "Tamil Nadu", sectors: "Steel, textiles, engineering" },
  { city: "Sanand", state: "Gujarat", sectors: "Automobiles, electronics" },
  { city: "Sangareddy", state: "Telangana", sectors: "Engineering, electronics, manufacturing" },
  { city: "Sangli", state: "Maharashtra", sectors: "Food processing, engineering, textiles" },
  { city: "Satara", state: "Maharashtra", sectors: "Automobiles, engineering, food processing" },
  { city: "Siliguri", state: "West Bengal", sectors: "Food processing, packaging, light manufacturing" },
  { city: "Sivakasi", state: "Tamil Nadu", sectors: "Printing, packaging, paper products" },
  { city: "Solan", state: "Himachal Pradesh", sectors: "Pharmaceuticals, food processing" },
  { city: "Solapur", state: "Maharashtra", sectors: "Textiles, garments, engineering" },
  { city: "Sonipat", state: "Haryana", sectors: "Engineering, food processing, packaging" },
  { city: "Sri City", state: "Andhra Pradesh", sectors: "Electronics, automobiles, consumer goods" },
  { city: "Sriperumbudur", state: "Tamil Nadu", sectors: "Electronics, automobiles" },
  { city: "Surat", state: "Gujarat", sectors: "Textiles, diamonds, chemicals" },
  { city: "Thane", state: "Maharashtra", sectors: "Chemicals, engineering, plastics" },
  { city: "Thiruvananthapuram", state: "Kerala", sectors: "Kerala" },
  { city: "Tiruchirappalli", state: "Tamil Nadu", sectors: "Heavy engineering, fabrication" },
  { city: "Tirunelveli", state: "Tamil Nadu", sectors: "Food processing, engineering" },
  { city: "Tirupati", state: "Andhra Pradesh", sectors: "Electronics, electricals, manufacturing" },
  { city: "Tiruppur", state: "Tamil Nadu", sectors: "Garments, textiles" },
  { city: "Tumakuru", state: "Karnataka", sectors: "Engineering, machinery, food processing" },
  { city: "Udaipur", state: "Rajasthan", sectors: "Minerals, chemicals, engineering" },
  { city: "Vadodara", state: "Gujarat", sectors: "Engineering, electricals, chemicals" },
  { city: "Valsad", state: "Gujarat", sectors: "Chemicals, textiles, pharmaceuticals" },
  { city: "Vapi", state: "Gujarat", sectors: "Chemicals, paper, packaging" },
  { city: "Varanasi", state: "Uttar Pradesh", sectors: "Textiles, silk, manufacturing" },
  { city: "Vellore", state: "Tamil Nadu", sectors: "Leather, footwear, engineering" },
  { city: "Vijayawada", state: "Andhra Pradesh", sectors: "Engineering, auto components, food processing" },
  { city: "Visakhapatnam", state: "Andhra Pradesh", sectors: "Steel, pharmaceuticals, shipbuilding" },
  { city: "Warangal", state: "Telangana", sectors: "Textiles, food processing, engineering" },
  { city: "Yamunanagar", state: "Haryana", sectors: "Plywood, paper, machinery" },
  { city: "Zaheerabad", state: "Telangana", sectors: "Automobiles, agricultural machinery" },
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

/** Other names people type for the same place. */
const CITY_ALIASES: Record<string, string> = {
  gurgaon: "Gurugram",
  "new delhi": "Delhi",
  "delhi ncr": "Delhi",
  "gr noida": "Greater Noida",
  "greater noida west": "Greater Noida",
  "noida extension": "Greater Noida",
};

/** The listed city, or null when we have not priced it. */
export function findCity(value: unknown): CitySpec | null {
  const k = cityKey(value);
  if (!k) return null;
  const alias = CITY_ALIASES[k];
  return BY_KEY.get(alias ? cityKey(alias) : k) ?? null;
}

/* ═══════════════════════ Where we shoot today ══════════════════════ */

/** The cities the dropdown offers, and the only ones we can take an order
 *  for today. */
export const SERVICE_AREAS: { group: string; cities: string[] }[] = [
  { group: "Haryana", cities: ["Gurugram", "Manesar"] },
  { group: "Delhi NCR", cities: ["Delhi", "Noida", "Greater Noida", "Ghaziabad"] },
];

const SERVICE_KEYS = new Set(SERVICE_AREAS.flatMap((g) => g.cities.map(cityKey)));

export function isServiceCity(value: unknown): boolean {
  const c = findCity(value);
  return c !== null && SERVICE_KEYS.has(cityKey(c.city));
}

/** "Delhi, Noida, Greater Noida, Ghaziabad, Gurugram and Manesar". */
export const SERVICE_CITY_LIST = (() => {
  const all = SERVICE_AREAS.flatMap((g) => g.cities);
  return `${all.slice(0, -1).join(", ")} and ${all[all.length - 1]}`;
})();

/** Printed under the city picker. */
export const SERVICE_AREA_NOTE = `We shoot in ${SERVICE_CITY_LIST} today. Somewhere else? Type your city: we are coming to new cities soon, and the ones we hear from most come first.`;

/** The golden line for a city we do not shoot in yet. */
export function comingSoonTitle(city: string): string {
  const c = city.trim();
  return c ? `VPV is coming to ${c} very soon` : "VPV is coming to your city very soon";
}
export const COMING_SOON_BODY =
  "We are not shooting there just yet. You can still see your plan and its price, and we will be in touch the moment we start in your city.";

export type LogisticsQuote = {
  /** What the buyer typed or picked, cleaned up. */
  city: string;
  /** Null when the city is not on our list at all. */
  matched: CitySpec | null;
  /** True for the cities we shoot in today. Only these can be ordered. */
  inServiceArea: boolean;
  /** The cab charge on the bill, GST excluded; 0 outside the service area. */
  amountInr: number;
  mode: string;
};

/**
 * Price the travel to a city.
 *
 * This is the authority. The browser shows what it returns; the order route
 * calls it again, and refuses an order for a city outside the service area.
 */
export function logisticsFor(value: unknown): LogisticsQuote {
  const typed = typeof value === "string" ? value.trim().slice(0, 80) : "";
  const matched = findCity(typed);
  const inServiceArea = matched !== null && SERVICE_KEYS.has(cityKey(matched.city));
  return {
    city: matched ? matched.city : typed,
    matched,
    inServiceArea,
    amountInr: inServiceArea ? CAB_TRAVEL.amountInr : 0,
    mode: CAB_TRAVEL.mode,
  };
}
