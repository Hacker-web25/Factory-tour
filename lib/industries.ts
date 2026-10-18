/**
 * lib/industries.ts — the industries a factory can tell us it works in.
 *
 * Asked on the first step of the VPV funnel, because it is the single most
 * useful thing to know before a rep rings the lead back: it says what the
 * plant actually makes, which decides what a buyer would want to see
 * inside the tour.
 *
 * Kept alphabetical so the dropdown renders without sorting, and
 * deliberately broad — a buyer who cannot find their trade picks
 * OTHER_INDUSTRY and types it, and what they type is stored verbatim. A
 * value that keeps turning up in that free-text column belongs in this
 * list; add it here rather than asking the rep to remember it.
 *
 * Pure TypeScript, no React, so the API route can validate against the
 * same list the browser rendered.
 */

/** Shown last in the dropdown; picking it reveals a free-text box. */
export const OTHER_INDUSTRY = "Other (please specify)";

export const INDUSTRIES: string[] = [
  "Aerospace & defence components",
  "Agricultural equipment & implements",
  "Agrochemicals & fertilisers",
  "Air conditioning & refrigeration",
  "Aluminium & non-ferrous metals",
  "Animal feed & nutrition",
  "Auto components & ancillaries",
  "Automobiles & commercial vehicles",
  "Bakery & confectionery",
  "Batteries & energy storage",
  "Bearings & power transmission",
  "Bicycles & two-wheelers",
  "Biotechnology & life sciences",
  "Boilers & pressure vessels",
  "Bricks, blocks & AAC",
  "Building materials & hardware",
  "Cables & wires",
  "Cement & concrete products",
  "Ceramics, tiles & sanitaryware",
  "Chemicals (bulk & speciality)",
  "Cold storage & warehousing",
  "Composites & FRP products",
  "Construction & infrastructure",
  "Consumer durables & appliances",
  "Cosmetics & personal care",
  "Cutting tools & abrasives",
  "Dairy & milk processing",
  "Diamond, gems & jewellery",
  "Die casting & forging",
  "Edible oils & fats",
  "Electrical equipment & switchgear",
  "Electronics & PCB assembly",
  "Elevators & escalators",
  "Engineering, procurement & construction",
  "Fasteners & fabricated metal",
  "Flexible packaging & films",
  "Flour mills & grain processing",
  "Food processing & ready-to-eat",
  "Footwear & leather goods",
  "Foundry & castings",
  "Furniture & modular interiors",
  "Glass & glassware",
  "Handicrafts & home décor",
  "Heavy machinery & earthmoving",
  "Hydraulics & pneumatics",
  "Industrial automation & robotics",
  "Industrial gases",
  "Instrumentation & control systems",
  "Iron & steel",
  "Lighting & LED",
  "Logistics & supply chain",
  "Lubricants & greases",
  "Machine tools",
  "Marine & shipbuilding",
  "Medical devices & disposables",
  "Metal finishing & electroplating",
  "Mining & minerals",
  "Motors, pumps & compressors",
  "Nutraceuticals & supplements",
  "Oil & gas equipment",
  "Packaging (rigid & corrugated)",
  "Paints, coatings & adhesives",
  "Paper & pulp",
  "Petrochemicals & refining",
  "Pharmaceuticals & formulations",
  "Pipes, tubes & fittings",
  "Plastics & polymer processing",
  "Plywood, laminates & panels",
  "Power generation & transmission",
  "Printing & labels",
  "Railway components & rolling stock",
  "Renewable energy & solar",
  "Rubber & tyres",
  "Sheet metal & precision stamping",
  "Spices & condiments",
  "Sports goods & fitness equipment",
  "Sugar & distillery",
  "Surgical instruments",
  "Tea, coffee & plantation",
  "Textile machinery",
  "Textiles, yarn & fabric",
  "Tobacco & allied products",
  "Toys & games",
  "Valves & flow control",
  "Water treatment & ETP",
  "Welding & joining",
  "Wind energy components",
  "Wires, ropes & mesh",
  "Wood & timber processing",
  "Writing instruments & stationery",
];

/** The dropdown's options, with the escape hatch pinned to the bottom. */
export const INDUSTRY_OPTIONS: string[] = [...INDUSTRIES, OTHER_INDUSTRY];

/**
 * What we store for an industry the buyer chose or typed.
 *
 * A listed industry is stored by its exact label. Anything else is kept as
 * the buyer's own words, trimmed and capped, so the column stays readable
 * in /admin and a rep sees what the person actually said.
 */
export function canonicalIndustry(
  selected: unknown,
  other: unknown
): string | null {
  const sel = typeof selected === "string" ? selected.trim() : "";
  if (sel && sel !== OTHER_INDUSTRY && INDUSTRIES.includes(sel)) return sel;
  const typed = typeof other === "string" ? other.trim().slice(0, 80) : "";
  if (typed) return typed;
  // A bare "Other" with nothing typed tells us nothing, so it is not stored.
  return null;
}
