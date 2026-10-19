/**
 * lib/industryProfiles.ts — "What does your factory make?", answered in
 * the buyer's own words, turned into the areas and processes worth showing.
 *
 * Step 1 used to make people find their trade in a 90-item dropdown, and
 * most gave up. Now they type ("cotton yarn", "auto parts", "tablets and
 * capsules", "kapda") and matchIndustries() works out which of the
 * profiles below they mean. Step 2 then opens with a "Picked for your
 * factory" section built from those profiles, so the first things a
 * buyer of steel castings is shown are the melting shop and the fettling
 * shop — not the canteen.
 *
 * The profiles are grounded in what buyers and their auditors actually
 * walk through on a supplier visit: the production floor, the quality
 * lab, the tool or mould shop, material stores and packing and dispatch
 * for engineering buyers; hygiene zoning and cold chain for food; clean
 * rooms and QC microbiology for pharma. Add a profile, or a keyword, here
 * and both steps follow.
 *
 * Pure TypeScript, so the lead route matches the same way the page does.
 */

import { CURATED_AREA_PICKS, CURATED_PROCESS_PICKS, areaById, processById } from "@/lib/factoryAreas";

export type IndustryProfile = {
  id: string;
  /** Shown on the chips under the input. */
  label: string;
  /** Fits "your ___ factory" / "a ___ plant". */
  short: string;
  /** Words people type. Lower case. A phrase (with a space) must appear
   *  whole; a word may be matched by its plural, a prefix while typing, or
   *  a one-letter typo. Words under four letters must match exactly. */
  keywords: string[];
  /** Recommended areas and processes, most important first. Ids from
   *  lib/factoryAreas.ts — general or industry-specific. */
  areas: string[];
  processes: string[];
};

export const INDUSTRY_PROFILES: IndustryProfile[] = [
  {
    id: "textiles",
    label: "Textiles, yarn & fabric",
    short: "textile",
    keywords: [
      "textile", "yarn", "fabric", "cloth", "spinning", "weaving", "knitting", "knit", "knitwear", "hosiery",
      "denim", "cotton", "polyester", "viscose", "silk", "wool", "woollen", "jute", "towel", "bedsheet",
      "home textile", "home furnishing", "carpet", "rug", "dyeing", "dye house", "processing house", "mill",
      "kapda", "kapde", "dhaga", "thread", "loom", "power loom", "terry", "linen",
    ],
    areas: [
      "spinning-department", "weaving-shed", "knitting-section", "dyeing-processing-house", "fabric-inspection-area",
      "laboratory", "rm-warehouse", "fg-warehouse", "effluent-treatment-plant", "packaging-area",
    ],
    processes: ["spinning", "weaving", "knitting", "dyeing", "printing-process", "quality-inspection", "packaging-process"],
  },
  {
    id: "garments",
    label: "Garments & apparel",
    short: "garment",
    keywords: [
      "garment", "apparel", "clothing", "readymade", "export house", "stitching", "tailoring", "shirt", "tshirt",
      "t shirt", "trouser", "jeans", "kurti", "kurta", "saree", "sportswear", "uniform", "innerwear", "kidswear",
      "jacket", "dress", "fashion",
    ],
    areas: [
      "fabric-inspection-area", "cutting-section", "stitching-floor", "quality-control-area", "packaging-area",
      "rm-warehouse", "fg-warehouse", "dispatch-area",
    ],
    processes: ["cutting-and-shearing", "stitching", "printing-process", "quality-inspection", "packaging-process"],
  },
  {
    id: "auto",
    label: "Auto components & automobiles",
    short: "auto components",
    keywords: [
      "auto", "automobile", "automotive", "auto parts", "auto component", "car", "vehicle", "two wheeler",
      "tractor", "truck", "oem", "tier 1", "gear", "shaft", "brake", "clutch", "piston", "radiator",
      "exhaust", "spare parts", "spares", "engine", "suspension", "axle", "sheet metal parts",
    ],
    areas: [
      "cnc-machining-area", "press-shop", "heat-treatment-shop", "assembly-area", "metrology-room",
      "quality-control-area", "tool-room", "paint-coating-area", "fg-warehouse", "dispatch-area",
    ],
    processes: [
      "cnc-machining", "turning-and-milling", "press-stamping", "fabrication-and-welding", "heat-treatment",
      "assembly-process", "quality-inspection", "painting-and-coating",
    ],
  },
  {
    id: "foundry",
    label: "Foundry, castings & forgings",
    short: "foundry",
    keywords: [
      "foundry", "casting", "cast iron", "ci casting", "sg iron", "ductile", "die casting", "pressure die casting",
      "investment casting", "aluminium casting", "gravity casting", "forging", "forged", "forge", "loha", "dhalai",
      "valve body", "pump body", "manhole",
    ],
    areas: [
      "melting-shop", "moulding-section", "fettling-shop", "forge-shop", "heat-treatment-shop",
      "cnc-machining-area", "laboratory", "quality-control-area", "fg-warehouse",
    ],
    processes: [
      "melting-pouring", "sand-moulding", "casting-process", "forging", "shot-blasting", "heat-treatment",
      "cnc-machining", "quality-inspection",
    ],
  },
  {
    id: "steel",
    label: "Steel, pipes & metal processing",
    short: "steel",
    keywords: [
      "steel", "stainless", "ss", "ms", "mild steel", "tmt", "rolling mill", "rolling", "pipe", "tube", "sheet",
      "coil", "wire", "wire rod", "structural", "metal", "alloy", "copper", "brass", "aluminium", "aluminum",
      "billet", "ingot", "angle", "channel",
    ],
    areas: [
      "melting-shop", "rolling-mill", "heat-treatment-shop", "cutting-section", "laboratory",
      "quality-control-area", "material-handling-area", "fg-warehouse", "dispatch-area",
    ],
    processes: [
      "melting-pouring", "rolling", "cutting-and-shearing", "heat-treatment", "surface-treatment",
      "quality-inspection", "material-handling",
    ],
  },
  {
    id: "plastics",
    label: "Plastics, rubber & polymers",
    short: "plastics",
    keywords: [
      "plastic", "polymer", "injection moulding", "injection molding", "moulding", "molding", "moulded", "molded",
      "blow moulding", "extrusion", "pvc", "hdpe", "ldpe", "pp", "pet", "preform", "bottle", "container",
      "pipe", "film", "rubber", "tyre", "tire", "gasket", "seal", "o ring", "silicone", "foam",
      "thermoforming", "granules", "masterbatch", "polythene",
    ],
    areas: [
      "moulding-shop", "extrusion-line", "tool-room", "mould-store", "rm-warehouse", "quality-control-area",
      "laboratory", "packaging-area", "fg-warehouse",
    ],
    processes: [
      "injection-moulding", "blow-moulding", "extrusion", "tooling-and-die-making", "raw-material-inspection",
      "quality-inspection", "product-testing", "packaging-process",
    ],
  },
  {
    id: "pharma",
    label: "Pharmaceuticals & nutraceuticals",
    short: "pharma",
    keywords: [
      "pharma", "pharmaceutical", "medicine", "drug", "tablet", "capsule", "syrup", "injectable", "api",
      "bulk drug", "formulation", "ointment", "ayurvedic", "ayurveda", "herbal", "nutraceutical", "supplement",
      "dawai", "dawa", "vaccine", "gmp", "who gmp", "softgel", "sachet", "oral liquid",
    ],
    areas: [
      "clean-room", "granulation-compression", "microbiology-lab", "laboratory", "rm-warehouse", "packaging-area",
      "water-treatment-plant", "utilities-area", "fg-warehouse",
    ],
    processes: [
      "granulation", "tablet-compression", "capsule-filling", "blister-packing", "laboratory-testing",
      "quality-inspection",
    ],
  },
  {
    id: "medical",
    label: "Medical devices & surgical",
    short: "medical devices",
    keywords: [
      "medical device", "medical", "surgical", "syringe", "catheter", "implant", "orthopaedic", "orthopedic",
      "disposable", "diagnostic", "hospital", "glove", "mask", "bandage", "iv set", "cannula",
    ],
    areas: [
      "clean-room", "moulding-shop", "assembly-area", "sterilisation-area", "microbiology-lab",
      "quality-control-area", "packaging-area",
    ],
    processes: ["injection-moulding", "assembly-process", "sterilisation", "product-testing", "packaging-process"],
  },
  {
    id: "chemicals",
    label: "Chemicals, paints & coatings",
    short: "chemical",
    keywords: [
      "chemical", "specialty chemical", "paint", "coating", "ink", "dye", "dyestuff", "pigment", "resin",
      "adhesive", "glue", "solvent", "fertiliser", "fertilizer", "agrochemical", "pesticide", "insecticide",
      "lubricant", "grease", "detergent", "soap", "cosmetic", "shampoo", "cream", "acid", "polymer emulsion",
    ],
    areas: [
      "reactor-plant", "tank-farm", "laboratory", "drum-filling-area", "rm-warehouse", "utilities-area",
      "effluent-treatment-plant", "fire-and-safety-area", "fg-warehouse",
    ],
    processes: [
      "batch-reaction", "blending-mixing", "filling-sealing", "laboratory-testing", "quality-inspection",
      "packaging-process",
    ],
  },
  {
    id: "food",
    label: "Food, dairy & beverages",
    short: "food",
    keywords: [
      "food", "snack", "namkeen", "sweet", "mithai", "confectionery", "chocolate", "biscuit", "cookie", "bakery",
      "bread", "cake", "dairy", "milk", "ghee", "paneer", "cheese", "ice cream", "beverage", "juice", "drink",
      "packaged water", "mineral water", "spice", "masala", "edible oil", "mustard oil", "oil mill", "flour",
      "atta", "rice", "dal", "pulses", "sugar", "tea", "coffee", "pickle", "achar", "frozen", "meat", "poultry",
      "seafood", "ready to eat", "noodles", "pasta", "honey", "jam", "sauce",
    ],
    areas: [
      "hygiene-zone", "processing-line", "cold-storage", "laboratory", "rm-warehouse", "packaging-area",
      "fg-warehouse", "water-treatment-plant",
    ],
    processes: [
      "cleaning-sorting", "cooking-processing", "filling-sealing", "packaging-process", "laboratory-testing",
      "quality-inspection",
    ],
  },
  {
    id: "electronics",
    label: "Electronics & electricals",
    short: "electronics",
    keywords: [
      "electronic", "pcb", "smt", "circuit", "electrical", "switch", "switchgear", "panel", "mcb", "cable",
      "wire harness", "harness", "transformer", "motor", "led", "lighting", "light", "fan", "battery",
      "inverter", "charger", "meter", "solar panel", "appliance", "speaker", "sensor", "relay",
    ],
    areas: [
      "smt-line", "assembly-area", "winding-section", "testing-bay", "quality-control-area",
      "stores-inventory-area", "packaging-area", "fg-warehouse",
    ],
    processes: [
      "smt-assembly", "soldering", "coil-winding", "assembly-process", "product-testing", "quality-inspection",
      "packaging-process",
    ],
  },
  {
    id: "machinery",
    label: "Machinery & engineering",
    short: "engineering",
    keywords: [
      "machine", "machinery", "engineering", "pump", "valve", "compressor", "boiler", "fabrication",
      "fabricated", "sheet metal", "fastener", "bolt", "nut", "screw", "hydraulic", "pneumatic", "gearbox",
      "conveyor", "crane", "tool", "cutting tool", "equipment", "precision", "component", "spm", "bearing",
      "spring", "heat exchanger", "tank",
    ],
    areas: [
      "welding-fabrication-area", "cnc-machining-area", "assembly-area", "testing-bay", "paint-coating-area",
      "tool-room", "quality-control-area", "stores-inventory-area", "dispatch-area",
    ],
    processes: [
      "cutting-and-shearing", "fabrication-and-welding", "cnc-machining", "drilling-and-boring",
      "assembly-process", "product-testing", "painting-and-coating",
    ],
  },
  {
    id: "packaging",
    label: "Packaging, paper & printing",
    short: "packaging",
    keywords: [
      "packaging", "packing material", "corrugated", "corrugation", "carton", "box", "paper", "paperboard",
      "printing", "printer", "label", "sticker", "pouch", "flexible packaging", "laminated", "bag",
      "monocarton", "duplex", "kraft", "tape",
    ],
    areas: [
      "printing-section", "corrugation-plant", "cutting-section", "packaging-area", "rm-warehouse",
      "quality-control-area", "fg-warehouse",
    ],
    processes: ["printing-process", "lamination", "die-cutting", "packaging-process", "quality-inspection"],
  },
  {
    id: "furniture",
    label: "Furniture, wood & interiors",
    short: "furniture",
    keywords: [
      "furniture", "wood", "wooden", "plywood", "ply", "mdf", "particle board", "door", "modular", "kitchen",
      "wardrobe", "chair", "sofa", "table", "office furniture", "timber", "veneer", "laminate",
    ],
    areas: [
      "panel-processing", "cnc-machining-area", "assembly-area", "paint-coating-area", "rm-warehouse",
      "fg-warehouse",
    ],
    processes: [
      "cutting-and-shearing", "edge-banding", "cnc-machining", "finishing-and-polishing", "assembly-process",
      "packaging-process",
    ],
  },
  {
    id: "ceramics",
    label: "Ceramics, glass & building materials",
    short: "building materials",
    keywords: [
      "ceramic", "tile", "sanitary", "sanitaryware", "glass", "glassware", "cement", "concrete", "brick",
      "block", "aac", "marble", "granite", "stone", "paver", "roofing", "gypsum", "putty", "pottery", "quartz",
    ],
    areas: [
      "kiln-area", "press-shop", "glazing-line", "quality-control-area", "laboratory", "packaging-area",
      "fg-warehouse",
    ],
    processes: ["press-stamping", "glazing", "kiln-firing", "quality-inspection", "packaging-process"],
  },
  {
    id: "leather",
    label: "Leather & footwear",
    short: "footwear",
    keywords: [
      "leather", "footwear", "shoe", "chappal", "sandal", "slipper", "tannery", "belt", "wallet",
      "leather bag", "sole", "boot",
    ],
    areas: ["cutting-section", "stitching-floor", "assembly-area", "quality-control-area", "fg-warehouse"],
    processes: ["cutting-and-shearing", "stitching", "assembly-process", "finishing-and-polishing", "quality-inspection"],
  },
  {
    id: "jewellery",
    label: "Gems & jewellery",
    short: "jewellery",
    keywords: ["jewellery", "jewelry", "gold", "silver", "diamond", "gem", "ornament", "kundan", "bangle"],
    areas: [
      "research-and-development", "foundry-casting-area", "polishing-setting", "quality-control-area",
      "security-entry-gate",
    ],
    processes: ["casting-process", "stone-setting", "finishing-and-polishing", "quality-inspection"],
  },
  {
    id: "handicrafts",
    label: "Handicrafts & home décor",
    short: "handicrafts",
    keywords: [
      "handicraft", "decor", "home decor", "artware", "candle", "incense", "agarbatti", "brassware", "gift",
      "toy", "craft",
    ],
    areas: ["manufacturing-production-area", "paint-coating-area", "quality-control-area", "packaging-area", "fg-warehouse"],
    processes: ["finishing-and-polishing", "painting-and-coating", "quality-inspection", "packaging-process"],
  },
];

const BY_ID = new Map(INDUSTRY_PROFILES.map((p) => [p.id, p]));
export function profileById(id: string): IndustryProfile | undefined {
  return BY_ID.get(id);
}

/* ───────────────────────── Matching ─────────────────────────────── */

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "castings" → "casting", "batteries" → "battery", "boxes" → "box". */
function singular(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(sses|xes|ches|shes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/** Edit distance, but gives up past 1 — all we need is "one typo or not". */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * How strongly one typed word matches one keyword: 3 exact, 2 close, 0 no.
 * `whole` says the word was meant as this keyword (exact, a longer form,
 * or a one-letter typo) rather than merely being the start of it — only a
 * whole-word match may bring in a second industry.
 */
function wordScore(token: string, keyword: string): { score: number; whole: boolean } {
  const t = singular(token);
  const k = singular(keyword);
  if (token === keyword || t === k) return { score: 3, whole: true };
  if (k.length < 4 || t.length < 4) return { score: 0, whole: false };
  // A longer form with a short ending ("moulded" ← mould, "dyeing" ← dye),
  // but not a different word that happens to start the same way
  // ("fabrication" is not "fabric").
  if (t.startsWith(k) && t.length - k.length <= 3) return { score: 2, whole: true };
  // A one-letter typo ("castngs" → casting).
  if (k.length >= 5 && withinOneEdit(t, k)) return { score: 2, whole: true };
  // Still typing ("texti" → textile).
  if (k.startsWith(t)) return { score: 2, whole: false };
  return { score: 0, whole: false };
}

/** A profile's score, and which typed words it matched outright — used to
 *  tell a genuine second industry from one that only shares a word. */
function scoreProfile(
  norm: string,
  tokens: string[],
  profile: IndustryProfile
): { score: number; wholeHits: Set<string> } {
  const padded = ` ${norm} `;
  let score = 0;
  const wholeHits = new Set<string>();
  const best = new Map<number, number>();
  const whole = new Set<number>();
  for (const kw of profile.keywords) {
    if (kw.includes(" ")) {
      if (padded.includes(` ${kw} `)) {
        score += 4;
        for (const w of kw.split(" ")) wholeHits.add(w);
      }
      continue;
    }
    tokens.forEach((t, i) => {
      const m = wordScore(t, kw);
      if (m.score > (best.get(i) ?? 0)) best.set(i, m.score);
      if (m.whole) whole.add(i);
    });
  }
  for (const [i, s] of best) {
    score += s;
    if (whole.has(i)) wholeHits.add(tokens[i]);
  }
  return { score, wholeHits };
}

export type IndustryMatch = {
  profiles: IndustryProfile[];
  /** Recommended areas and processes, merged across the matched profiles,
   *  most important first. Falls back to our general picks when nothing
   *  matched, so step 2 always has a starting point. */
  areaIds: string[];
  processIds: string[];
  matched: boolean;
};

const MAX_AREAS = 12;
const MAX_PROCESSES = 8;

/**
 * What a typed answer most likely means.
 *
 * Every profile is scored; the best is kept, and so is any other that
 * scores at least 60% of it (so "plastic pipes" is plastics, not steel,
 * while "pipes" alone could be either). At most three profiles, and the
 * buyer can remove any of them with `excluded`.
 */
export function matchIndustries(text: unknown, excluded: string[] = []): IndustryMatch {
  const norm = typeof text === "string" ? normalise(text.slice(0, 200)) : "";
  const tokens = norm ? norm.split(" ") : [];
  const scored = INDUSTRY_PROFILES.filter((p) => !excluded.includes(p.id))
    .map((p) => ({ p, ...(tokens.length ? scoreProfile(norm, tokens, p) : { score: 0, wholeHits: new Set<string>() }) }))
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score);

  // The best match always counts. Another counts only if it TIES with it
  // ("pipes": steel or plastics, we cannot tell) or matched a whole word the
  // best one did not ("cotton yarn and garments": garments is its own
  // word). So "plastic pipes" stays plastics, and a half-typed prefix never
  // drags in a second industry ("fabric" is not "fabrication").
  const first = scored[0];
  const profiles = scored
    .filter(
      (x, i) =>
        i === 0 ||
        x.score === first.score ||
        [...x.wholeHits].some((w) => !first.wholeHits.has(w))
    )
    .slice(0, 3)
    .map((x) => x.p);

  if (profiles.length === 0) {
    return { profiles: [], areaIds: CURATED_AREA_PICKS, processIds: CURATED_PROCESS_PICKS, matched: false };
  }

  // Interleave so a second profile's top items are not pushed off the end.
  const merge = (lists: string[][], cap: number, exists: (id: string) => boolean) => {
    const out: string[] = [];
    const longest = Math.max(...lists.map((l) => l.length));
    for (let i = 0; i < longest && out.length < cap; i++) {
      for (const l of lists) {
        const id = l[i];
        if (id && exists(id) && !out.includes(id) && out.length < cap) out.push(id);
      }
    }
    return out;
  };

  return {
    profiles,
    areaIds: merge(profiles.map((p) => p.areas), MAX_AREAS, (id) => Boolean(areaById(id))),
    processIds: merge(profiles.map((p) => p.processes), MAX_PROCESSES, (id) => Boolean(processById(id))),
    matched: true,
  };
}

/** "textile", "textile and garment", "textile, garment and plastics". */
export function shortLabels(profiles: IndustryProfile[]): string {
  const s = profiles.map((p) => p.short);
  if (s.length <= 1) return s[0] ?? "";
  return `${s.slice(0, -1).join(", ")} and ${s[s.length - 1]}`;
}
