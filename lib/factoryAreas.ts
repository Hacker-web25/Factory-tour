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
