/**
 * lib/factoryAreas.ts — the areas and processes a buyer can pick on step 2
 * of the funnel.
 *
 * Carried over from the old marketing site's assessment, which showed every
 * area as a tile. That is the point of the list: a factory owner scrolling
 * past "Effluent Treatment Plant" or "Tool Room" realises those are places
 * their buyers ask about, and picks more of them than they would have
 * thought to type. Each selected area is one AOA; each selected process is
 * one process video.
 *
 * Pure data (icons are named, not imported) so the API route can check a
 * submitted id against the same list the browser rendered.
 */

export type CatalogueItem = {
  id: string;
  name: string;
  description?: string;
  /** A lucide-react icon name; mapped to a component in components/funnel. */
  icon: string;
};

export const FACTORY_AREAS: CatalogueItem[] = [
  // First everywhere: it is the first thing a buyer sees when they arrive.
  { id: "factory-exterior", name: "Factory Exterior", description: "Building, gate and premises", icon: "Building2" },
  { id: "manufacturing-production-area", name: "Manufacturing / Production Area", description: "Your main shop floor", icon: "Factory" },
  { id: "assembly-area", name: "Assembly Area", icon: "Cog" },
  { id: "cnc-machining-area", name: "CNC Machining Area", description: "Computer-controlled machining centres", icon: "Cpu" },
  { id: "quality-control-area", name: "Quality Control Area", description: "Quality checks and records", icon: "BadgeCheck" },
  { id: "laboratory", name: "Laboratory", description: "Testing of materials and products", icon: "FlaskConical" },
  { id: "inspection-area", name: "Inspection Area", description: "Checking parts against specifications", icon: "ScanSearch" },
  { id: "rm-warehouse", name: "Raw Material Warehouse", description: "Storage for incoming raw materials", icon: "Warehouse" },
  { id: "fg-warehouse", name: "Finished Goods Warehouse", description: "Completed products ready to sell", icon: "Package" },
  { id: "dispatch-area", name: "Dispatch Area", description: "Orders packed and ready to ship", icon: "Truck" },
  { id: "loading-unloading-area", name: "Loading and Unloading Area", description: "Truck bays for goods in and out", icon: "Forklift" },
  { id: "packaging-area", name: "Packaging Area", icon: "PackageOpen" },
  { id: "foundry-casting-area", name: "Foundry / Casting Area", description: "Metal melting and casting", icon: "Flame" },
  { id: "welding-fabrication-area", name: "Welding / Fabrication Area", icon: "Construction" },
  { id: "paint-coating-area", name: "Paint / Coating Area", description: "Painting, powder coating or plating", icon: "SprayCan" },
  { id: "tool-room", name: "Tool Room", description: "Where dies, moulds and tools are made", icon: "Hammer" },
  { id: "maintenance-workshop", name: "Maintenance Workshop", description: "Machine repair and upkeep", icon: "Wrench" },
  { id: "material-handling-area", name: "Material Handling Area", description: "Forklifts, cranes and conveyors", icon: "Move" },
  { id: "stores-inventory-area", name: "Stores / Inventory Area", description: "Spares, consumables and stock", icon: "Archive" },
  { id: "research-and-development", name: "Research and Development", description: "Product design and development", icon: "Lightbulb" },
  { id: "effluent-treatment-plant", name: "Effluent Treatment Plant", description: "ETP: treats wastewater before discharge", icon: "Droplets" },
  { id: "water-treatment-plant", name: "Water Treatment Plant", description: "WTP: water for process or drinking", icon: "Waves" },
  { id: "power-room-substation", name: "Power Room / Substation", description: "Panels, supply and DG sets", icon: "Zap" },
  { id: "utilities-area", name: "Utilities Area", description: "Compressors, chillers and boilers", icon: "Gauge" },
  { id: "fire-and-safety-area", name: "Fire and Safety Area", description: "Fire-fighting and safety stations", icon: "FireExtinguisher" },
  { id: "waste-management-area", name: "Waste Management Area", description: "Scrap and waste segregation", icon: "Recycle" },
  { id: "security-entry-gate", name: "Security / Entry Gate", icon: "ShieldCheck" },
  { id: "administration-office", name: "Administration Office", icon: "Building2" },
  { id: "training-area", name: "Training Area", icon: "GraduationCap" },
  { id: "canteen", name: "Canteen", icon: "UtensilsCrossed" },
];

export const FACTORY_PROCESSES: CatalogueItem[] = [
  { id: "assembly-process", name: "Assembly Process", icon: "Cog" },
  { id: "cnc-machining", name: "CNC Machining", icon: "Cpu" },
  { id: "turning-and-milling", name: "Turning and Milling", icon: "RotateCw" },
  { id: "drilling-and-boring", name: "Drilling and Boring", icon: "Drill" },
  { id: "cutting-and-shearing", name: "Cutting and Shearing", icon: "Scissors" },
  { id: "fabrication-and-welding", name: "Fabrication and Welding", icon: "Construction" },
  { id: "casting-process", name: "Casting Process", icon: "Flame" },
  { id: "injection-moulding", name: "Injection Moulding", icon: "Syringe" },
  { id: "heat-treatment", name: "Heat Treatment", icon: "Thermometer" },
  { id: "surface-treatment", name: "Surface Treatment", icon: "Layers" },
  { id: "painting-and-coating", name: "Painting and Coating", icon: "SprayCan" },
  { id: "finishing-and-polishing", name: "Finishing and Polishing", icon: "Sparkles" },
  { id: "tooling-and-die-making", name: "Tooling and Die Making", icon: "Hammer" },
  { id: "raw-material-inspection", name: "Raw Material Inspection", icon: "Search" },
  { id: "quality-inspection", name: "Quality Inspection", icon: "ScanSearch" },
  { id: "product-testing", name: "Product Testing", icon: "ClipboardCheck" },
  { id: "laboratory-testing", name: "Laboratory Testing", icon: "FlaskConical" },
  { id: "material-handling", name: "Material Handling", icon: "Forklift" },
  { id: "packaging-process", name: "Packaging Process", icon: "Package" },
];

/**
 * Areas and processes that belong to particular industries — a spinning
 * department, a clean room, a melting shop. They are not in the general
 * grids above (a car-parts maker should not scroll past "Weaving Shed");
 * they appear in the "Picked for your factory" section on step 2 when the
 * buyer's answer to "what does your factory make?" points to that
 * industry. See lib/industryProfiles.ts.
 */
export const INDUSTRY_AREAS: CatalogueItem[] = [
  // Textiles and garments
  { id: "spinning-department", name: "Spinning Department", description: "Blow room, carding and ring frames", icon: "Wind" },
  { id: "weaving-shed", name: "Weaving Shed", description: "Looms turning yarn into fabric", icon: "Grid3x3" },
  { id: "dyeing-processing-house", name: "Dyeing & Processing House", description: "Dyeing, printing and finishing of fabric", icon: "Palette" },
  { id: "knitting-section", name: "Knitting Section", description: "Circular and flat knitting machines", icon: "Shapes" },
  { id: "cutting-section", name: "Cutting Section", description: "Material laid out and cut to pattern", icon: "Scissors" },
  { id: "stitching-floor", name: "Stitching Floor", description: "Sewing lines putting the product together", icon: "Shirt" },
  { id: "fabric-inspection-area", name: "Fabric Inspection Area", description: "Fabric checked for faults before it moves on", icon: "ScanLine" },
  // Engineering and auto
  { id: "press-shop", name: "Press Shop", description: "Power presses forming sheet metal", icon: "ArrowDownToLine" },
  { id: "heat-treatment-shop", name: "Heat Treatment Shop", description: "Furnaces hardening and tempering parts", icon: "Thermometer" },
  { id: "testing-bay", name: "Testing Bay", description: "Products run and tested before dispatch", icon: "Gauge" },
  { id: "metrology-room", name: "Metrology Room", description: "CMM and precision measuring instruments", icon: "Ruler" },
  // Metals
  { id: "melting-shop", name: "Melting Shop", description: "Furnaces melting metal for casting", icon: "Flame" },
  { id: "moulding-section", name: "Moulding Section", description: "Sand moulds made ready for pouring", icon: "Box" },
  { id: "fettling-shop", name: "Fettling & Shot Blasting", description: "Castings cleaned, ground and blasted", icon: "Wind" },
  { id: "forge-shop", name: "Forge Shop", description: "Hammers and presses forging hot metal", icon: "Hammer" },
  { id: "rolling-mill", name: "Rolling Mill", description: "Hot or cold rolling of steel", icon: "Cylinder" },
  // Plastics and rubber
  { id: "moulding-shop", name: "Moulding Machine Hall", description: "Injection or blow moulding machines at work", icon: "Factory" },
  { id: "extrusion-line", name: "Extrusion Line", description: "Pipes, profiles or film being extruded", icon: "Spline" },
  { id: "mould-store", name: "Mould Storage", description: "Moulds stored, tagged and maintained", icon: "Box" },
  // Pharma and medical
  { id: "clean-room", name: "Clean Room", description: "Controlled, filtered area for sterile work", icon: "Shield" },
  { id: "granulation-compression", name: "Granulation & Compression", description: "Where powder becomes tablets", icon: "Pill" },
  { id: "microbiology-lab", name: "Microbiology Lab", description: "Sterility and microbial testing", icon: "Microscope" },
  { id: "sterilisation-area", name: "Sterilisation Area", description: "Autoclave or ETO sterilisation", icon: "Thermometer" },
  // Chemicals
  { id: "reactor-plant", name: "Reactor Plant", description: "Reactors where each batch is made", icon: "FlaskRound" },
  { id: "tank-farm", name: "Tank Farm", description: "Bulk storage tanks for liquids", icon: "Cylinder" },
  { id: "drum-filling-area", name: "Filling Area", description: "Drums, cans or bags filled and sealed", icon: "Container" },
  // Food
  { id: "processing-line", name: "Processing Line", description: "Where raw material becomes product", icon: "Workflow" },
  { id: "hygiene-zone", name: "Hygiene Entry Zone", description: "Hand wash, changing and air curtain", icon: "Droplet" },
  { id: "cold-storage", name: "Cold Storage", description: "Chilled and frozen storage", icon: "Snowflake" },
  // Electronics and electricals
  { id: "smt-line", name: "SMT Line", description: "Machines placing components on circuit boards", icon: "CircuitBoard" },
  { id: "winding-section", name: "Winding Section", description: "Coils and transformer windings", icon: "Cable" },
  // Packaging, wood, ceramics, jewellery
  { id: "printing-section", name: "Printing Section", description: "Printing presses and colour matching", icon: "Printer" },
  { id: "corrugation-plant", name: "Corrugation Plant", description: "Corrugated board and boxes made", icon: "Box" },
  { id: "panel-processing", name: "Panel Processing", description: "Boards cut, edge-banded and drilled", icon: "Armchair" },
  { id: "kiln-area", name: "Kiln", description: "Firing tiles, sanitaryware or bricks", icon: "Flame" },
  { id: "glazing-line", name: "Glazing Line", description: "Glaze and design applied", icon: "SprayCan" },
  { id: "polishing-setting", name: "Polishing & Setting", description: "Stones set and pieces polished", icon: "Gem" },
];

export const INDUSTRY_PROCESSES: CatalogueItem[] = [
  { id: "spinning", name: "Spinning", icon: "Wind" },
  { id: "weaving", name: "Weaving", icon: "Grid3x3" },
  { id: "dyeing", name: "Dyeing", icon: "Palette" },
  { id: "knitting", name: "Knitting", icon: "Shapes" },
  { id: "printing-process", name: "Printing", icon: "Printer" },
  { id: "stitching", name: "Stitching", icon: "Shirt" },
  { id: "press-stamping", name: "Pressing and Stamping", icon: "ArrowDownToLine" },
  { id: "melting-pouring", name: "Melting and Pouring", icon: "Flame" },
  { id: "sand-moulding", name: "Sand Moulding", icon: "Box" },
  { id: "forging", name: "Forging", icon: "Hammer" },
  { id: "shot-blasting", name: "Fettling and Shot Blasting", icon: "Wind" },
  { id: "rolling", name: "Rolling", icon: "Cylinder" },
  { id: "blow-moulding", name: "Blow Moulding", icon: "Fan" },
  { id: "extrusion", name: "Extrusion", icon: "Spline" },
  { id: "granulation", name: "Granulation", icon: "Blend" },
  { id: "tablet-compression", name: "Tablet Compression", icon: "Pill" },
  { id: "capsule-filling", name: "Capsule Filling", icon: "Pill" },
  { id: "blister-packing", name: "Blister Packing", icon: "Package" },
  { id: "batch-reaction", name: "Batch Reaction", icon: "FlaskRound" },
  { id: "blending-mixing", name: "Blending and Mixing", icon: "Blend" },
  { id: "filling-sealing", name: "Filling and Sealing", icon: "Container" },
  { id: "cleaning-sorting", name: "Cleaning and Sorting", icon: "Droplet" },
  { id: "cooking-processing", name: "Cooking and Processing", icon: "ChefHat" },
  { id: "smt-assembly", name: "SMT Assembly", icon: "CircuitBoard" },
  { id: "soldering", name: "Soldering", icon: "Zap" },
  { id: "coil-winding", name: "Coil Winding", icon: "Cable" },
  { id: "lamination", name: "Lamination", icon: "Layers" },
  { id: "die-cutting", name: "Die Cutting", icon: "Scissors" },
  { id: "edge-banding", name: "Edge Banding", icon: "Ruler" },
  { id: "glazing", name: "Glazing", icon: "SprayCan" },
  { id: "kiln-firing", name: "Kiln Firing", icon: "Flame" },
  { id: "sterilisation", name: "Sterilisation", icon: "Thermometer" },
  { id: "stone-setting", name: "Stone Setting", icon: "Gem" },
];

/** Every area and every process, general and industry-specific — what any
 *  lookup by id or by name must search. */
export const ALL_AREAS: CatalogueItem[] = [...FACTORY_AREAS, ...INDUSTRY_AREAS];
export const ALL_PROCESSES: CatalogueItem[] = [...FACTORY_PROCESSES, ...INDUSTRY_PROCESSES];

const AREA_BY_ID = new Map(ALL_AREAS.map((a) => [a.id, a]));
const PROCESS_BY_ID = new Map(ALL_PROCESSES.map((p) => [p.id, p]));

export function areaById(id: string): CatalogueItem | undefined {
  return AREA_BY_ID.get(id);
}
export function processById(id: string): CatalogueItem | undefined {
  return PROCESS_BY_ID.get(id);
}

/** Names for the ids we know, plus the buyer's own typed entries, capped —
 *  what the lead row stores so a rep can see what they asked for. */
export function describeSelection(
  ids: unknown,
  custom: unknown,
  kind: "area" | "process"
): string[] {
  const by = kind === "area" ? AREA_BY_ID : PROCESS_BY_ID;
  const known = Array.isArray(ids)
    ? ids.filter((x): x is string => typeof x === "string" && by.has(x)).map((x) => by.get(x)!.name)
    : [];
  const typed = Array.isArray(custom)
    ? custom
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim().slice(0, 60))
        .filter(Boolean)
    : [];
  return [...new Set([...known, ...typed])].slice(0, 80);
}

/* ───────────────────────── Gold stars ────────────────────────────── */

/**
 * Which tiles get a gold star on step 2.
 *
 * Two phases, and the label always says which one it is, so the star never
 * claims more than is true:
 *
 *   • "Must-show" — until POPULAR_MIN_FILLS different companies have filled
 *     the page, the stars mark OUR recommendations: the areas and processes
 *     buyers most often ask to see. That is a claim about our advice, which
 *     is true from day one.
 *   • "Popular pick" — once enough companies have answered, the stars move
 *     to what they actually picked most. Calling a tile popular before
 *     anyone has picked it would be a made-up statistic.
 *
 * The switch is automatic: /api/funnel/popular counts the picks stored on
 * funnel_leads and answers with whichever phase applies.
 */
export const POPULAR_MIN_FILLS = 10;
export const POPULAR_TOP_AREAS = 6;
export const POPULAR_TOP_PROCESSES = 4;
/** A tile must have been picked by at least this share of companies to be
 *  called popular, so a near-empty sample cannot crown a one-off choice. */
export const POPULAR_MIN_SHARE = 0.3;

export const CURATED_AREA_PICKS = [
  "factory-exterior",
  "manufacturing-production-area",
  "quality-control-area",
  "laboratory",
  "assembly-area",
  "fg-warehouse",
  "cnc-machining-area",
];
export const CURATED_PROCESS_PICKS = [
  "cnc-machining",
  "assembly-process",
  "quality-inspection",
  "product-testing",
];

export type StarPhase = "curated" | "popular";

export const STAR_COPY: Record<StarPhase, { badge: string; legend: string }> = {
  curated: {
    badge: "Must-show",
    legend: "Buyers usually ask to see these, so we recommend them.",
  },
  popular: {
    badge: "Popular pick",
    legend: "Chosen by most factories so far.",
  },
};

/**
 * Rank the picks from stored leads. Pure, so it is tested without a
 * database. Each row is one company's named areas and processes; rows are
 * de-duplicated by e-mail first so one person filling the page ten times
 * counts once.
 */
export function rankPopular(
  rows: { email: string | null; areas: string[] | null; processes: string[] | null }[]
): { phase: StarPhase; fills: number; areaIds: string[]; processIds: string[] } {
  const byCompany = new Map<string, { areas: string[]; processes: string[] }>();
  rows.forEach((r, i) => {
    if (!r.areas || r.areas.length === 0) return;
    const key = (r.email ?? "").trim().toLowerCase() || `anon-${i}`;
    byCompany.set(key, { areas: r.areas, processes: r.processes ?? [] });
  });
  const fills = byCompany.size;
  if (fills < POPULAR_MIN_FILLS) {
    return { phase: "curated", fills, areaIds: CURATED_AREA_PICKS, processIds: CURATED_PROCESS_PICKS };
  }

  const top = (catalogue: CatalogueItem[], pick: (v: { areas: string[]; processes: string[] }) => string[], n: number) => {
    const idByName = new Map(catalogue.map((c) => [c.name, c.id]));
    const counts = new Map<string, number>();
    for (const v of byCompany.values()) {
      for (const name of new Set(pick(v))) {
        const id = idByName.get(name);
        if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .filter(([, c]) => c / fills >= POPULAR_MIN_SHARE)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, n)
      .map(([id]) => id);
  };

  return {
    phase: "popular",
    fills,
    areaIds: top(ALL_AREAS, (v) => v.areas, POPULAR_TOP_AREAS),
    processIds: top(ALL_PROCESSES, (v) => v.processes, POPULAR_TOP_PROCESSES),
  };
}
