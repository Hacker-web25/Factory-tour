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
  { id: "factory-exterior", name: "Factory Exterior", description: "Building, gate and premises", icon: "Building2" },
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

const AREA_BY_ID = new Map(FACTORY_AREAS.map((a) => [a.id, a]));
const PROCESS_BY_ID = new Map(FACTORY_PROCESSES.map((p) => [p.id, p]));

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
    areaIds: top(FACTORY_AREAS, (v) => v.areas, POPULAR_TOP_AREAS),
    processIds: top(FACTORY_PROCESSES, (v) => v.processes, POPULAR_TOP_PROCESSES),
  };
}
