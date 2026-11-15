/**
 * lib/industryProfiles.ts — "What does your factory produce?", answered in
 * the buyer's own words, turned into the areas worth showing.
 *
 * Step 1 asks the question as free text ("steel pipes", "medical
 * equipments", "namkeen", "kapda"). matchIndustries() works out which ONE
 * of the industries below they mean, quietly, without showing a guess on
 * step 1. Step 2 then opens with a "Picked for your factory" section built
 * from that industry's areas, and leaves out of "More areas" the shop
 * floors that do not belong to it (a food plant is not offered a foundry).
 *
 * Why one industry and not several: when we merged two or three guesses,
 * "steel pipes" became "steel pipes and metal melting" and the buyer saw
 * a melting shop they do not have. Narrow industries ("Steel pipes &
 * tubes" separate from "Steel melting & rolling") make one guess enough.
 *
 * The area lists come from the plant and infrastructure pages of real
 * Indian manufacturers and from plant set-up reports, checked industry by
 * industry in November 2026 — roughly 70 sources across these profiles.
 * Each list is in the order a buyer would walk the plant.
 *
 * Pure TypeScript, so the lead route matches the same way the page does,
 * and fast: the vocabulary is indexed once at load and a match is a few
 * hundred string comparisons.
 */

import {
  COMMON_AREAS,
  CURATED_PROCESS_PICKS,
  FACTORY_AREAS,
  SHOP_SPECIFIC_AREAS,
  areaById,
  processById,
} from "@/lib/factoryAreas";

export type IndustryProfile = {
  id: string;
  /** What the lead row and the team see, e.g. "Steel pipes & tubes". */
  label: string;
  /** Fits "your ___ factory" / "a ___ plant". */
  short: string;
  /** Words and phrases people type, lower case. Plurals, a one-letter typo
   *  (two in long words), a half-typed last word and US spellings are
   *  forgiven by the matcher, so list each word once. Words under four
   *  letters must be typed exactly. */
  keywords: string[];
  /** Recommended areas, in the order a buyer walks the plant. Ids from
   *  lib/factoryAreas.ts. The factory exterior is added in front. */
  areas: string[];
  processes: string[];
  /** A broad family profile ("Food processing", "Textiles"): it wins only
   *  when nothing more specific does. */
  generic?: boolean;
};

const P = (
  id: string,
  label: string,
  short: string,
  keywords: string[],
  areas: string[],
  processes: string[],
  generic = false
): IndustryProfile => ({ id, label, short, keywords, areas, processes, ...(generic ? { generic } : {}) });

export const INDUSTRY_PROFILES: IndustryProfile[] = [
  /* ───────────── Textiles, garments and made-ups ───────────── */
  P("textiles", "Textiles", "textile",
    ["textile", "textile mill", "composite mill", "kapda", "kapde", "cloth", "cotton", "fibre", "polyester", "viscose", "silk", "wool", "woollen", "linen"],
    ["spinning-department", "weaving-shed", "knitting-section", "dyeing-processing-house", "fabric-inspection-area", "laboratory", "rm-warehouse", "fg-warehouse", "packaging-area", "effluent-treatment-plant"],
    ["spinning", "weaving", "knitting", "dyeing", "quality-inspection", "packaging-process"], true),
  P("spinning", "Spinning mill (yarn)", "spinning",
    ["yarn", "spinning", "spinning mill", "dhaga", "cotton yarn", "polyester yarn", "viscose yarn", "blended yarn", "open end", "oe yarn", "ring spun", "compact yarn", "vortex yarn", "slub yarn", "core spun", "sewing thread", "thread", "twisting", "doubling"],
    ["rm-warehouse", "blow-room-carding", "drawing-combing", "ring-spinning", "cone-winding", "yarn-conditioning", "laboratory", "quality-control-area", "utilities-area", "fg-warehouse", "dispatch-area"],
    ["spinning", "laboratory-testing", "quality-inspection", "material-handling", "packaging-process"]),
  P("ginning", "Cotton ginning & pressing", "ginning",
    ["ginning", "cotton ginning", "cotton bale", "kapas", "cotton seed", "lint", "linter", "ginning pressing"],
    ["raw-material-yard", "cleaning-sorting-area", "ginning-hall", "bale-press", "laboratory", "fg-warehouse", "fire-and-safety-area", "dispatch-area"],
    ["cleaning-sorting", "material-handling", "quality-inspection", "packaging-process"]),
  P("weaving", "Weaving & fabrics", "weaving",
    ["weaving", "fabric", "woven fabric", "loom", "power loom", "powerloom", "air jet", "airjet", "rapier", "water jet", "grey fabric", "greige", "shirting", "suiting", "jacquard", "dress material", "woven"],
    ["rm-warehouse", "warping-sizing", "weaving-shed", "fabric-inspection-area", "laboratory", "quality-control-area", "packaging-area", "utilities-area", "fg-warehouse", "dispatch-area"],
    ["weaving", "quality-inspection", "packaging-process", "material-handling"]),
  P("knitting", "Knitted fabrics", "knitting",
    ["knitting", "knit fabric", "knitted fabric", "circular knitting", "warp knitting", "single jersey", "interlock", "fleece fabric", "rib fabric", "lycra fabric"],
    ["rm-warehouse", "knitting-section", "fabric-inspection-area", "dyeing-processing-house", "stenter-finishing", "laboratory", "packaging-area", "fg-warehouse"],
    ["knitting", "dyeing", "quality-inspection", "packaging-process"]),
  P("processing", "Dyeing, printing & processing", "dyeing and processing",
    ["dyeing", "dye house", "dyeing house", "process house", "processing house", "fabric processing", "textile processing", "fabric printing", "textile printing", "rotary printing", "digital printing fabric", "bleaching", "yarn dyeing", "stenter", "mercerising", "sublimation", "job work dyeing"],
    ["rm-warehouse", "dyeing-processing-house", "yarn-dyeing", "textile-printing", "stenter-finishing", "colour-lab", "laboratory", "fabric-inspection-area", "packaging-area", "fg-warehouse", "effluent-treatment-plant", "utilities-area"],
    ["dyeing", "printing-process", "laboratory-testing", "quality-inspection", "packaging-process"]),
  P("home-textiles", "Home textiles", "home textiles",
    ["home textile", "home furnishing", "towel", "terry towel", "bedsheet", "bed sheet", "bed linen", "bedspread", "quilt", "blanket", "curtain", "cushion", "table linen", "pillow cover", "kitchen linen", "napkin", "comforter", "duvet", "bath linen"],
    ["weaving-shed", "dyeing-processing-house", "fabric-inspection-area", "cutting-section", "stitching-floor", "finishing-room", "quality-control-area", "packaging-area", "fg-warehouse", "effluent-treatment-plant"],
    ["weaving", "dyeing", "stitching", "quality-inspection", "packaging-process"]),
  P("denim", "Denim fabric", "denim",
    ["denim", "denim fabric", "indigo", "denim mill"],
    ["ring-spinning", "warping-sizing", "indigo-dyeing", "weaving-shed", "stenter-finishing", "fabric-inspection-area", "laboratory", "packaging-area", "fg-warehouse", "effluent-treatment-plant"],
    ["dyeing", "weaving", "quality-inspection", "packaging-process"]),
  P("carpets", "Carpets & rugs", "carpet",
    ["carpet", "rug", "durrie", "dhurrie", "hand knotted", "hand tufted", "tufted", "kilim", "floor covering", "bath mat", "doormat", "coir", "coir mat", "mat"],
    ["rm-warehouse", "yarn-dyeing", "carpet-looms", "carpet-finishing", "quality-control-area", "packaging-area", "fg-warehouse", "showroom"],
    ["dyeing", "weaving", "quality-inspection", "packaging-process"]),
  P("jute", "Jute products", "jute",
    ["jute", "hessian", "gunny", "jute bag", "burlap", "sutli", "jute yarn"],
    ["rm-warehouse", "spinning-department", "weaving-shed", "finishing-room", "cutting-section", "stitching-floor", "quality-control-area", "bagging-plant", "fg-warehouse"],
    ["spinning", "weaving", "stitching", "quality-inspection", "packaging-process"]),
  P("garments", "Garments & apparel", "garment",
    ["garment", "apparel", "clothing", "readymade", "export house", "stitching", "tailoring", "shirt", "trouser", "jeans", "kurti", "kurta", "saree", "sportswear", "uniform", "kidswear", "jacket", "dress", "fashion", "woven garment", "ladieswear", "menswear", "workwear", "lehenga", "blazer", "ethnic wear", "embroidery"],
    ["rm-warehouse", "fabric-inspection-area", "trims-store", "sampling-room", "cutting-section", "stitching-floor", "embroidery-printing", "garment-washing", "finishing-room", "quality-control-area", "packaging-area", "fg-warehouse"],
    ["cutting-and-shearing", "stitching", "printing-process", "quality-inspection", "packaging-process"]),
  P("knitwear", "Knitwear & hosiery", "knitwear",
    ["knitwear", "hosiery", "tshirt", "t shirt", "polo", "innerwear", "sock", "sweater", "sweatshirt", "hoodie", "tracksuit", "track suit", "thermal wear", "vest", "lingerie", "legging", "knit garment", "knitted garment"],
    ["knitting-section", "fabric-inspection-area", "trims-store", "cutting-section", "stitching-floor", "embroidery-printing", "finishing-room", "quality-control-area", "packaging-area", "fg-warehouse"],
    ["knitting", "cutting-and-shearing", "stitching", "printing-process", "quality-inspection", "packaging-process"]),
  P("woven-sacks", "PP woven sacks & FIBC bags", "woven sack",
    ["woven sack", "pp woven", "woven bag", "fibc", "jumbo bag", "bulk bag", "pp bag", "hdpe bag", "tarpaulin", "leno bag", "raffia"],
    ["rm-warehouse", "extrusion-line", "weaving-shed", "lamination-section", "printing-section", "cutting-section", "stitching-floor", "laboratory", "quality-control-area", "packaging-area", "fg-warehouse"],
    ["extrusion", "weaving", "lamination", "printing-process", "stitching", "quality-inspection"]),
  P("nonwoven", "Nonwoven & technical textiles", "nonwoven",
    ["nonwoven", "non woven", "spunbond", "meltblown", "geotextile", "technical textile", "needle punch", "spunlace", "felt"],
    ["rm-warehouse", "extrusion-line", "slitting-line", "lamination-section", "laboratory", "quality-control-area", "packaging-area", "fg-warehouse"],
    ["extrusion", "lamination", "quality-inspection", "packaging-process"]),
  P("hygiene-products", "Sanitary pads, diapers & wipes", "hygiene products",
    ["sanitary pad", "sanitary napkin", "diaper", "baby diaper", "adult diaper", "wet wipe", "wipe", "panty liner", "underpad"],
    ["rm-warehouse", "hygiene-zone", "converting-line", "laboratory", "quality-control-area", "packaging-area", "fg-warehouse", "dispatch-area"],
    ["assembly-process", "quality-inspection", "packaging-process"]),
  P("foam-mattress", "Foam & mattresses", "mattress",
    ["foam", "mattress", "pu foam", "epe foam", "coir mattress", "spring mattress", "foam sheet", "pillow", "bedding"],
    ["rm-warehouse", "foaming-line", "cutting-section", "stitching-floor", "quality-control-area", "laboratory", "packaging-area", "fg-warehouse", "showroom"],
    ["blending-mixing", "cutting-and-shearing", "stitching", "quality-inspection", "packaging-process"]),

  /* ───────────── Steel and metals ───────────── */
  P("steel-plant", "Steel melting & rolling (billets, TMT)", "steel",
    ["steel", "steel plant", "steel melting", "melting shop", "sms", "billet", "ingot", "sponge iron", "dri", "induction furnace", "arc furnace", "tmt", "tmt bar", "rebar", "saria", "sariya", "rolling mill", "re rolling", "rerolling", "structural steel", "wire rod", "ms angle", "ms channel", "girder", "steel bar", "pig iron", "ferro alloy", "mini steel", "loha"],
    ["raw-material-yard", "melting-shop", "continuous-caster", "reheating-furnace", "rolling-mill", "cooling-bed", "bundling-area", "laboratory", "material-handling-area", "stock-yard", "power-room-substation", "dispatch-area"],
    ["melting-pouring", "rolling", "cutting-and-shearing", "heat-treatment", "laboratory-testing", "material-handling"]),
  P("steel-pipes", "Steel pipes & tubes", "steel pipe",
    ["steel", "pipe", "tube", "steel pipe", "steel tube", "ms pipe", "gi pipe", "erw", "erw pipe", "erw tube", "ss pipe", "stainless pipe", "stainless steel pipe", "stainless steel tube", "seamless", "seamless pipe", "seamless tube", "hollow section", "square pipe", "rectangular pipe", "boiler tube", "precision tube", "cdw tube", "spiral pipe", "saw pipe", "lsaw", "galvanised pipe", "api pipe", "line pipe", "scaffolding pipe", "conduit pipe", "pipe mill", "tube mill"],
    ["coil-yard", "slitting-line", "tube-mill", "pipe-finishing", "hydro-testing", "ndt-lab", "galvanizing-plant", "pipe-coating", "laboratory", "bundling-area", "stock-yard", "dispatch-area"],
    ["tube-welding", "cutting-and-shearing", "hydro-testing-process", "galvanizing", "quality-inspection", "laboratory-testing", "material-handling"]),
  P("pipe-fittings", "Pipe fittings & flanges", "pipe fittings",
    ["flange", "pipe fitting", "forged fitting", "elbow", "reducer", "butt weld fitting", "buttweld", "socket weld", "olet", "forged flange"],
    ["rm-warehouse", "billet-cutting", "forge-shop", "cnc-machining-area", "heat-treatment-shop", "shot-blasting-area", "ndt-lab", "laboratory", "laser-marking", "quality-control-area", "packaging-area", "dispatch-area"],
    ["forging", "cnc-machining", "heat-treatment", "quality-inspection", "laboratory-testing", "packaging-process"]),
  P("steel-flat", "Steel sheets, coils & roofing", "steel sheet",
    ["steel", "stainless", "steel sheet", "steel coil", "ss sheet", "stainless steel sheet", "stainless steel coil", "ss coil", "cold rolled", "crca", "cr coil", "hr coil", "gp sheet", "gc sheet", "roofing sheet", "roofing", "colour coated", "ppgi", "galvalume", "ss strip", "steel strip", "patta", "patti", "slitting", "cut to length"],
    ["coil-yard", "pickling-line", "cold-rolling-mill", "annealing-furnace", "slitting-line", "polishing-line", "galvanizing-plant", "roll-forming-line", "laboratory", "quality-control-area", "packaging-area", "stock-yard", "dispatch-area"],
    ["rolling", "cutting-and-shearing", "heat-treatment", "surface-treatment", "quality-inspection", "packaging-process"]),
  P("kitchenware", "Kitchenware & utensils", "kitchenware",
    ["utensil", "kitchenware", "cookware", "pressure cooker", "non stick", "nonstick", "steel utensil", "ss utensil", "tableware", "cutlery", "kitchen tool", "bartan", "tawa", "kadai", "dinner set", "casserole", "tiffin", "lunch box", "hotelware", "aluminium utensil", "copper utensil"],
    ["rm-warehouse", "press-shop", "welding-fabrication-area", "polishing-line", "paint-coating-area", "assembly-area", "quality-control-area", "testing-bay", "packaging-area", "fg-warehouse", "showroom"],
    ["press-stamping", "fabrication-and-welding", "finishing-and-polishing", "painting-and-coating", "quality-inspection", "packaging-process"]),
  P("wire", "Steel wire & wire products", "wire",
    ["steel wire", "ms wire", "gi wire", "binding wire", "barbed wire", "wire rope", "wire mesh", "chain link", "nail", "wire nail", "welding electrode", "electrode", "hb wire", "spring steel wire", "pc strand", "wire drawing", "stay wire", "fencing wire"],
    ["raw-material-yard", "pickling-line", "wire-drawing", "annealing-furnace", "galvanizing-plant", "stranding-section", "wire-products", "laboratory", "quality-control-area", "packaging-area", "fg-warehouse", "dispatch-area"],
    ["wire-drawing-process", "heat-treatment", "galvanizing", "quality-inspection", "laboratory-testing", "packaging-process"]),
  P("aluminium", "Aluminium extrusions & profiles", "aluminium extrusion",
    ["aluminium", "aluminium profile", "aluminium section", "aluminium extrusion", "extrusion", "aluminium window", "aluminium door", "anodised", "anodising", "aluminium ladder", "upvc window", "upvc door", "window", "facade", "curtain wall", "aluminium formwork"],
    ["rm-warehouse", "extrusion-press", "die-shop", "ageing-oven", "anodizing-plant", "paint-coating-area", "cnc-machining-area", "laboratory", "quality-control-area", "packaging-area", "fg-warehouse", "dispatch-area"],
    ["extrusion", "heat-treatment", "surface-treatment", "painting-and-coating", "cnc-machining", "quality-inspection", "packaging-process"]),
  P("precision-parts", "Precision turned & machined parts", "precision parts",
    ["brass", "brass part", "brass component", "copper part", "turned part", "turned component", "cnc turned", "machined component", "machined part", "precision component", "precision part", "precision machining", "cnc machining", "vmc machining", "cnc job work", "machining job work", "job work", "aerospace", "defence", "insert", "precision engineering"],
    ["rm-warehouse", "turning-section", "cnc-machining-area", "forge-shop", "sorting-inspection", "plating-line", "metrology-room", "quality-control-area", "tool-room", "packaging-area", "fg-warehouse", "dispatch-area"],
    ["turning-and-milling", "cnc-machining", "drilling-and-boring", "plating", "quality-inspection", "packaging-process"]),
  P("foundry", "Foundry & castings", "foundry",
    ["foundry", "casting", "iron", "loha dhalai", "cast iron", "ci casting", "sg iron", "ductile", "grey iron", "steel casting", "sand casting", "shell moulding", "aluminium casting", "gravity casting", "dhalai", "valve body", "pump body", "manhole", "alloy steel casting", "bronze casting", "non ferrous casting", "metal casting"],
    ["pattern-shop", "sand-plant", "core-shop", "moulding-section", "melting-shop", "fettling-shop", "heat-treatment-shop", "cnc-machining-area", "laboratory", "ndt-lab", "quality-control-area", "fg-warehouse", "dispatch-area"],
    ["melting-pouring", "sand-moulding", "casting-process", "shot-blasting", "heat-treatment", "cnc-machining", "quality-inspection", "laboratory-testing"]),
  P("investment-casting", "Investment casting", "investment casting",
    ["investment casting", "lost wax", "precision casting", "investment cast"],
    ["tool-room", "wax-room", "shell-room", "melting-shop", "fettling-shop", "heat-treatment-shop", "cnc-machining-area", "laboratory", "ndt-lab", "quality-control-area", "fg-warehouse"],
    ["casting-process", "melting-pouring", "shot-blasting", "heat-treatment", "cnc-machining", "quality-inspection"]),
  P("die-casting", "Die casting", "die casting",
    ["die casting", "pressure die casting", "pdc", "hpdc", "gravity die casting", "zinc die casting", "aluminium die casting", "zamak"],
    ["tool-room", "melting-shop", "die-casting-cell", "fettling-shop", "shot-blasting-area", "cnc-machining-area", "testing-bay", "paint-coating-area", "laboratory", "quality-control-area", "packaging-area", "fg-warehouse"],
    ["casting-process", "shot-blasting", "cnc-machining", "painting-and-coating", "quality-inspection", "packaging-process"]),
  P("forging", "Forgings", "forging",
    ["forging", "forged", "forge", "closed die", "open die", "hot forging", "ring rolling", "upset forging", "crankshaft", "forged component"],
    ["rm-warehouse", "billet-cutting", "die-shop", "forge-shop", "heat-treatment-shop", "shot-blasting-area", "cnc-machining-area", "ndt-lab", "metrology-room", "laboratory", "quality-control-area", "dispatch-area"],
    ["forging", "heat-treatment", "shot-blasting", "cnc-machining", "quality-inspection", "laboratory-testing"]),
  P("fasteners", "Fasteners", "fastener",
    ["fastener", "bolt", "nut bolt", "screw", "rivet", "washer", "stud", "anchor bolt", "self tapping", "hex bolt", "allen bolt", "u bolt", "foundation bolt", "cold forging", "spring", "coil spring"],
    ["rm-warehouse", "wire-drawing", "cold-heading", "thread-rolling", "heat-treatment-shop", "plating-line", "sorting-inspection", "laboratory", "quality-control-area", "packaging-area", "fg-warehouse", "dispatch-area"],
    ["wire-drawing-process", "forging", "heat-treatment", "plating", "quality-inspection", "packaging-process"]),
  P("sheet-metal", "Sheet metal fabrication & racks", "sheet metal",
    ["sheet metal", "sheet metal fabrication", "laser cutting", "cnc bending", "press brake", "enclosure", "metal enclosure", "electrical enclosure", "server rack", "storage rack", "racking", "slotted angle", "shelving", "industrial rack", "laser cut", "cable tray", "metal", "duct", "ducting", "hvac", "air handling unit", "metal product"],
    ["rm-warehouse", "profile-cutting", "sheet-metal-shop", "welding-fabrication-area", "paint-coating-area", "assembly-area", "quality-control-area", "packaging-area", "fg-warehouse", "dispatch-area"],
    ["cutting-and-shearing", "press-stamping", "fabrication-and-welding", "painting-and-coating", "assembly-process", "quality-inspection"]),
  P("heavy-fabrication", "Heavy fabrication & process equipment", "fabrication",
    ["fabrication", "fabricated", "fabricator", "structural fabrication", "steel structure", "peb", "pre engineered building", "pressure vessel", "boiler", "heat exchanger", "storage tank", "ss tank", "process equipment", "chimney", "ms structure", "industrial shed", "skid", "tower", "tank", "gas cylinder", "cylinder", "fire extinguisher", "silo"],
    ["rm-warehouse", "profile-cutting", "plate-rolling", "heavy-fabrication-bay", "welding-fabrication-area", "cnc-machining-area", "heat-treatment-shop", "ndt-lab", "hydro-testing", "shot-blasting-area", "paint-coating-area", "stock-yard", "dispatch-area"],
    ["cutting-and-shearing", "fabrication-and-welding", "heat-treatment", "hydro-testing-process", "painting-and-coating", "quality-inspection"]),

  /* ───────────── Engineering and vehicles ───────────── */
  P("auto", "Auto components", "auto components",
    ["auto", "automobile", "automotive", "auto part", "auto component", "car part", "vehicle part", "oem", "tier 1", "gear", "shaft", "brake", "clutch", "piston", "radiator", "exhaust", "spare part", "spare", "suspension", "axle", "sheet metal part", "auto ancillary", "two wheeler part", "tractor part", "brake pad", "brake shoe", "silencer", "bush", "auto spare", "engine", "engine part", "engine component"],
    ["press-shop", "welding-fabrication-area", "cnc-machining-area", "heat-treatment-shop", "paint-coating-area", "assembly-area", "tool-room", "metrology-room", "testing-bay", "quality-control-area", "fg-warehouse", "dispatch-area"],
    ["press-stamping", "fabrication-and-welding", "cnc-machining", "turning-and-milling", "heat-treatment", "painting-and-coating", "assembly-process", "quality-inspection"]),
  P("vehicles", "Vehicles & EVs (assembly)", "vehicle",
    ["electric vehicle", "ev", "e rickshaw", "erickshaw", "scooter", "motorcycle", "two wheeler", "three wheeler", "tractor", "bus", "truck", "trailer", "bicycle", "cycle", "e bike", "golf cart", "vehicle manufacturer", "car manufacturer", "bus body", "tipper", "ambulance"],
    ["rm-warehouse", "press-shop", "body-shop", "welding-fabrication-area", "paint-coating-area", "assembly-area", "testing-bay", "quality-control-area", "stores-inventory-area", "research-and-development", "stock-yard", "dispatch-area"],
    ["press-stamping", "fabrication-and-welding", "painting-and-coating", "assembly-process", "product-testing", "quality-inspection"]),
  P("pumps-valves", "Pumps & valves", "pump and valve",
    ["pump", "valve", "ball valve", "gate valve", "butterfly valve", "check valve", "control valve", "industrial valve", "solenoid valve", "safety valve", "submersible", "submersible pump", "monoblock", "centrifugal pump", "motor pump", "borewell pump", "impeller"],
    ["rm-warehouse", "cnc-machining-area", "assembly-area", "testing-bay", "hydro-testing", "paint-coating-area", "quality-control-area", "stores-inventory-area", "packaging-area", "fg-warehouse", "dispatch-area"],
    ["cnc-machining", "turning-and-milling", "assembly-process", "hydro-testing-process", "product-testing", "painting-and-coating", "quality-inspection"]),
  P("machinery", "Industrial machinery", "machinery",
    ["machine", "machinery", "special purpose machine", "spm", "machine tool", "lathe", "cnc machine", "packaging machine", "food machine", "textile machinery", "printing machine", "compressor", "gearbox", "conveyor", "crane", "hoist", "material handling equipment", "hydraulic", "pneumatic", "hydraulic press", "hydraulic cylinder", "industrial equipment", "equipment", "engineering", "engineering good", "plant machinery", "blower", "chiller", "cooling tower", "crusher", "dryer", "elevator", "lift", "escalator", "ro plant", "ro system", "water treatment", "kitchen equipment", "commercial kitchen"],
    ["rm-warehouse", "cnc-machining-area", "welding-fabrication-area", "grinding-section", "assembly-area", "testing-bay", "paint-coating-area", "tool-room", "metrology-room", "quality-control-area", "stores-inventory-area", "research-and-development", "dispatch-area"],
    ["cutting-and-shearing", "fabrication-and-welding", "cnc-machining", "drilling-and-boring", "assembly-process", "product-testing", "painting-and-coating"], true),
  P("agri-machinery", "Agricultural machinery & implements", "farm equipment",
    ["agricultural machinery", "agricultural equipment", "agri equipment", "farm equipment", "implement", "rotavator", "rotary tiller", "cultivator", "harrow", "seed drill", "thresher", "harvester", "plough", "power tiller", "sprayer", "reaper", "chaff cutter", "tractor trolley"],
    ["rm-warehouse", "profile-cutting", "press-shop", "welding-fabrication-area", "cnc-machining-area", "heat-treatment-shop", "paint-coating-area", "assembly-area", "testing-bay", "quality-control-area", "stock-yard", "dispatch-area"],
    ["cutting-and-shearing", "press-stamping", "fabrication-and-welding", "heat-treatment", "painting-and-coating", "assembly-process"]),
  P("tools", "Hand tools & cutting tools", "tools",
    ["tool", "hand tool", "spanner", "wrench", "plier", "screwdriver", "cutting tool", "drill bit", "carbide tool", "saw blade", "power tool", "garden tool", "measuring tool", "chisel", "hammer"],
    ["rm-warehouse", "forge-shop", "cnc-machining-area", "heat-treatment-shop", "grinding-section", "plating-line", "laser-marking", "quality-control-area", "packaging-area", "fg-warehouse", "dispatch-area"],
    ["forging", "cnc-machining", "heat-treatment", "plating", "finishing-and-polishing", "quality-inspection", "packaging-process"]),
  P("bearings", "Bearings", "bearing",
    ["bearing", "ball bearing", "roller bearing", "taper bearing", "bearing housing", "plummer block"],
    ["rm-warehouse", "turning-section", "heat-treatment-shop", "grinding-section", "assembly-area", "metrology-room", "laboratory", "quality-control-area", "packaging-area", "fg-warehouse"],
    ["turning-and-milling", "heat-treatment", "finishing-and-polishing", "assembly-process", "quality-inspection"]),
  P("moulds-dies", "Moulds, dies & tooling", "tool room",
    ["mould", "die", "press tool", "injection mould", "die maker", "mould maker", "tool and die", "tooling", "jig", "fixture", "blow mould", "die casting die"],
    ["cad-studio", "cnc-machining-area", "edm-section", "grinding-section", "tool-room", "heat-treatment-shop", "metrology-room", "assembly-area", "testing-bay", "quality-control-area", "dispatch-area"],
    ["cnc-machining", "tooling-and-die-making", "heat-treatment", "finishing-and-polishing", "quality-inspection"]),

  /* ───────────── Electrical and electronics ───────────── */
  P("electronics", "Electronics & PCB assembly", "electronics",
    ["electronic", "pcb", "pcba", "smt", "circuit", "circuit board", "ems", "electronic assembly", "electronic component", "box build", "control card", "power supply", "smps", "charger", "adapter", "inverter", "ups", "set top box", "iot device", "electronic product", "controller", "drone", "ev charger", "television", "led tv", "mobile", "mobile phone", "mobile accessories", "phone", "earphone", "headphone", "speaker", "power bank", "cctv", "camera", "smart device", "electronics"],
    ["component-store", "esd-area", "smt-line", "tht-soldering", "assembly-area", "testing-bay", "burn-in-room", "quality-control-area", "research-and-development", "packaging-area", "fg-warehouse", "dispatch-area"],
    ["smt-assembly", "soldering", "assembly-process", "product-testing", "quality-inspection", "packaging-process"]),
  P("cables", "Wires & cables", "cable",
    ["cable", "wire", "electric wire", "house wire", "power cable", "control cable", "instrumentation cable", "flexible cable", "copper wire", "aluminium conductor", "conductor", "acsr", "aerial bunched", "submersible cable", "solar cable", "coaxial", "lan cable", "optical fibre", "fibre optic", "copper", "enamelled wire", "winding wire"],
    ["rm-warehouse", "wire-drawing", "annealing-furnace", "stranding-section", "cable-extrusion", "armouring-section", "hv-test-lab", "laboratory", "quality-control-area", "drum-yard", "packaging-area", "dispatch-area"],
    ["wire-drawing-process", "extrusion", "laboratory-testing", "product-testing", "quality-inspection", "packaging-process"]),
  P("wire-harness", "Wire harnesses & cable assemblies", "wire harness",
    ["wire harness", "harness", "cable assembly", "wiring harness", "crimping", "connector"],
    ["component-store", "cutting-crimping", "assembly-area", "testing-bay", "quality-control-area", "packaging-area", "fg-warehouse", "dispatch-area"],
    ["cutting-and-shearing", "assembly-process", "product-testing", "quality-inspection"]),
  P("transformers", "Transformers & stabilisers", "transformer",
    ["transformer", "distribution transformer", "power transformer", "dry type transformer", "current transformer", "isolation transformer", "furnace transformer", "servo stabiliser", "stabiliser", "voltage stabiliser"],
    ["rm-warehouse", "core-cutting", "winding-section", "welding-fabrication-area", "drying-oven", "assembly-area", "tanking-oil-filling", "hv-test-lab", "paint-coating-area", "quality-control-area", "stock-yard", "dispatch-area"],
    ["coil-winding", "assembly-process", "product-testing", "painting-and-coating", "quality-inspection"]),
  P("motors", "Electric motors & generators", "motor",
    ["motor", "electric motor", "induction motor", "bldc", "dc motor", "geared motor", "gear motor", "alternator", "generator", "genset", "dg set", "servo motor", "stepper motor", "dynamo"],
    ["rm-warehouse", "press-shop", "die-casting-cell", "cnc-machining-area", "winding-section", "varnish-impregnation", "assembly-area", "testing-bay", "paint-coating-area", "quality-control-area", "packaging-area", "fg-warehouse"],
    ["press-stamping", "coil-winding", "cnc-machining", "assembly-process", "product-testing", "painting-and-coating"]),
  P("switchgear", "Switchgear, panels & electrical accessories", "panel",
    ["panel", "control panel", "electrical panel", "lt panel", "ht panel", "mcc panel", "pcc panel", "apfc", "plc panel", "distribution board", "db box", "switchgear", "switch", "mcb", "rccb", "mccb", "busbar", "bus duct", "feeder pillar", "vcb", "changeover", "starter", "electrical accessories", "modular switch", "socket", "electrical", "electrical equipment", "electric", "wiring device", "fuse"],
    ["rm-warehouse", "sheet-metal-shop", "welding-fabrication-area", "paint-coating-area", "panel-wiring", "assembly-area", "hv-test-lab", "testing-bay", "quality-control-area", "packaging-area", "dispatch-area"],
    ["cutting-and-shearing", "press-stamping", "painting-and-coating", "assembly-process", "product-testing", "quality-inspection"]),
  P("lighting", "LED lighting", "lighting",
    ["led", "lighting", "light", "led light", "led bulb", "street light", "flood light", "luminaire", "panel light", "tube light", "down light", "lamp", "led driver", "decorative light", "solar light", "led strip"],
    ["component-store", "smt-line", "esd-area", "assembly-area", "burn-in-room", "photometry-lab", "testing-bay", "quality-control-area", "research-and-development", "packaging-area", "fg-warehouse", "dispatch-area"],
    ["smt-assembly", "soldering", "assembly-process", "product-testing", "quality-inspection", "packaging-process"]),
  P("lead-acid-battery", "Batteries (lead acid)", "battery",
    ["battery", "lead acid", "inverter battery", "tubular battery", "automotive battery", "smf battery", "vrla", "battery plate", "e rickshaw battery"],
    ["rm-warehouse", "grid-casting", "paste-mixing", "plate-pasting-curing", "assembly-area", "formation-area", "testing-bay", "laboratory", "quality-control-area", "effluent-treatment-plant", "fg-warehouse", "dispatch-area"],
    ["casting-process", "assembly-process", "product-testing", "quality-inspection", "packaging-process"]),
  P("lithium-battery", "Lithium battery packs", "lithium battery",
    ["lithium", "li ion", "lithium ion", "lifepo4", "lfp", "battery pack", "ev battery", "bms", "energy storage", "ess"],
    ["component-store", "cell-testing", "esd-area", "assembly-area", "testing-bay", "burn-in-room", "quality-control-area", "fire-and-safety-area", "research-and-development", "packaging-area", "fg-warehouse"],
    ["assembly-process", "soldering", "product-testing", "quality-inspection", "packaging-process"]),
  P("solar", "Solar panels", "solar",
    ["solar", "solar panel", "solar module", "pv module", "photovoltaic", "solar cell", "topcon", "mono perc", "bifacial"],
    ["rm-warehouse", "cell-testing", "tabber-stringer", "layup-laminator", "module-framing", "module-testing", "laboratory", "quality-control-area", "packaging-area", "fg-warehouse", "dispatch-area"],
    ["assembly-process", "product-testing", "quality-inspection", "packaging-process"]),
  P("appliances", "Home appliances & fans", "appliance",
    ["appliance", "home appliance", "fan", "ceiling fan", "table fan", "exhaust fan", "cooler", "air cooler", "water heater", "geyser", "mixer grinder", "electric iron", "induction cooktop", "kettle", "water purifier", "air conditioner", "refrigerator", "washing machine", "gas stove", "room heater", "kitchen appliance", "toaster", "hair dryer", "trimmer"],
    ["rm-warehouse", "press-shop", "moulding-shop", "die-casting-cell", "winding-section", "paint-coating-area", "assembly-area", "testing-bay", "quality-control-area", "packaging-area", "fg-warehouse", "dispatch-area"],
    ["press-stamping", "injection-moulding", "coil-winding", "painting-and-coating", "assembly-process", "product-testing"]),
  P("instruments", "Instruments, meters & sensors", "instruments",
    ["instrument", "measuring instrument", "meter", "energy meter", "flow meter", "gauge", "pressure gauge", "sensor", "transmitter", "temperature controller", "thermocouple", "weighing scale", "weighing machine", "lab instrument", "laboratory equipment", "analyzer", "test equipment", "scientific instrument"],
    ["component-store", "esd-area", "smt-line", "cnc-machining-area", "assembly-area", "calibration-lab", "testing-bay", "burn-in-room", "quality-control-area", "research-and-development", "packaging-area", "fg-warehouse"],
    ["smt-assembly", "assembly-process", "product-testing", "quality-inspection", "packaging-process"]),

  /* ───────────── Plastics and rubber ───────────── */
  P("plastics", "Plastics", "plastics",
    ["plastic", "polymer", "pvc", "hdpe", "ldpe", "pp", "abs", "nylon", "acrylic", "polycarbonate", "plastic product", "polythene", "polyethylene", "polypropylene", "granule", "masterbatch", "plastic compound", "thermoforming"],
    ["rm-warehouse", "moulding-shop", "extrusion-line", "tool-room", "mould-store", "quality-control-area", "laboratory", "packaging-area", "fg-warehouse"],
    ["injection-moulding", "extrusion", "blow-moulding", "raw-material-inspection", "quality-inspection", "packaging-process"], true),
  P("injection-moulding", "Injection moulded parts", "injection moulding",
    ["injection moulding", "injection moulded", "plastic moulding", "moulding", "moulded", "plastic moulded", "plastic component", "plastic part", "moulded component", "moulded furniture", "plastic chair", "household plastic", "plastic container", "crate", "bucket", "caps and closures", "closure", "plastic household", "helmet", "plastic furniture", "dustbin", "household item"],
    ["rm-warehouse", "moulding-shop", "tool-room", "mould-store", "assembly-area", "printing-section", "quality-control-area", "laboratory", "packaging-area", "utilities-area", "fg-warehouse"],
    ["injection-moulding", "tooling-and-die-making", "raw-material-inspection", "assembly-process", "quality-inspection", "packaging-process"]),
  P("plastic-pipes", "Plastic pipes & fittings", "plastic pipe",
    ["pipe", "plastic pipe", "pvc pipe", "upvc pipe", "cpvc pipe", "hdpe pipe", "swr pipe", "column pipe", "casing pipe", "garden pipe", "pvc fitting", "upvc", "cpvc", "drip irrigation", "sprinkler", "duct pipe", "plb duct", "conduit", "water tank", "plastic tank"],
    ["storage-silos", "compounding-section", "extrusion-line", "moulding-shop", "pipe-finishing", "laboratory", "quality-control-area", "stock-yard", "dispatch-area"],
    ["extrusion", "injection-moulding", "raw-material-inspection", "quality-inspection", "laboratory-testing", "material-handling"]),
  P("pet-bottles", "PET preforms & bottles", "bottle",
    ["pet", "preform", "pet bottle", "pet jar", "bottle", "plastic bottle", "blow moulding", "hdpe bottle", "pharma bottle", "jar", "pet preform"],
    ["rm-warehouse", "moulding-shop", "tool-room", "mould-store", "quality-control-area", "laboratory", "packaging-area", "utilities-area", "fg-warehouse", "dispatch-area"],
    ["injection-moulding", "blow-moulding", "quality-inspection", "packaging-process"]),
  P("flexible-packaging", "Flexible packaging, films & tapes", "flexible packaging",
    ["flexible packaging", "film", "plastic film", "bopp", "bopp film", "shrink film", "stretch film", "laminated pouch", "pouch", "standup pouch", "zipper pouch", "printed roll", "polythene bag", "carry bag", "garbage bag", "cling film", "metallised film", "packaging film", "rotogravure", "aluminium foil", "foil", "tape", "adhesive tape", "bopp tape", "masking tape", "packaging"],
    ["rm-warehouse", "extrusion-line", "printing-section", "lamination-section", "slitting-line", "pouch-making", "laboratory", "quality-control-area", "packaging-area", "fg-warehouse", "dispatch-area"],
    ["extrusion", "printing-process", "lamination", "cutting-and-shearing", "quality-inspection", "packaging-process"]),
  P("rubber", "Rubber products", "rubber",
    ["rubber", "gasket", "seal", "o ring", "oring", "silicone", "rubber part", "rubber moulded", "rubber sheet", "rubber hose", "hose", "bellow", "rubber roller", "grommet", "anti vibration", "epdm", "nbr", "rubber mat", "rubber compound", "latex", "conveyor belt", "v belt", "transmission belt"],
    ["rm-warehouse", "rubber-mixing", "rubber-moulding", "extrusion-line", "deflashing", "tool-room", "laboratory", "quality-control-area", "packaging-area", "fg-warehouse"],
    ["blending-mixing", "injection-moulding", "extrusion", "finishing-and-polishing", "quality-inspection", "laboratory-testing"]),
  P("tyres", "Tyres, tubes & retreading", "tyre",
    ["tyre", "tyre retreading", "retread", "tread rubber", "inner tube", "tyre tube", "solid tyre", "otr tyre"],
    ["rm-warehouse", "rubber-mixing", "calendering", "extrusion-line", "tyre-building", "curing-presses", "testing-bay", "laboratory", "quality-control-area", "fg-warehouse", "dispatch-area"],
    ["blending-mixing", "extrusion", "product-testing", "quality-inspection", "laboratory-testing"]),
  P("recycling", "Recycling (plastic, metal, e-waste)", "recycling",
    ["recycling", "recycled", "recycler", "scrap", "e waste", "plastic recycling", "metal scrap", "battery recycling", "waste management", "pet flake", "rpet", "reprocessed granule"],
    ["raw-material-yard", "cleaning-sorting-area", "shredding-washing", "extrusion-line", "melting-shop", "laboratory", "quality-control-area", "bagging-plant", "fg-warehouse", "effluent-treatment-plant", "dispatch-area"],
    ["cleaning-sorting", "extrusion", "quality-inspection", "material-handling", "packaging-process"]),

  /* ───────────── Pharma and healthcare ───────────── */
  P("pharma", "Pharmaceuticals (formulations)", "pharma",
    ["pharma", "pharmaceutical", "medicine", "drug", "tablet", "capsule", "syrup", "formulation", "oral liquid", "ointment", "dawai", "dawa", "softgel", "sachet", "dry syrup", "cough syrup", "gmp", "who gmp", "third party manufacturing", "pcd pharma", "veterinary medicine", "oral solid"],
    ["rm-warehouse", "dispensing-area", "granulation-compression", "tablet-coating", "capsule-section", "liquid-orals", "ointment-section", "primary-packing", "packaging-area", "laboratory", "microbiology-lab", "water-treatment-plant", "hvac-room", "fg-warehouse"],
    ["granulation", "tablet-compression", "capsule-filling", "blister-packing", "laboratory-testing", "quality-inspection"]),
  P("injectables", "Injectables & sterile products", "injectables",
    ["injectable", "vial", "ampoule", "eye drop", "iv fluid", "large volume parenteral", "lvp", "svp", "prefilled syringe", "lyophilised", "sterile product", "sterile injectable"],
    ["rm-warehouse", "dispensing-area", "clean-room", "aseptic-filling", "sterilisation-area", "inspection-area", "packaging-area", "laboratory", "microbiology-lab", "water-treatment-plant", "hvac-room", "fg-warehouse"],
    ["filling-sealing", "sterilisation", "laboratory-testing", "quality-inspection", "packaging-process"]),
  P("api", "APIs, bulk drugs & intermediates", "API",
    ["api", "bulk drug", "active pharmaceutical", "pharma intermediate", "drug intermediate", "intermediate", "fine chemical", "cdmo", "crams", "custom synthesis"],
    ["rm-warehouse", "reactor-plant", "centrifuge-drying", "clean-room", "solvent-recovery", "tank-farm", "pilot-plant", "laboratory", "effluent-treatment-plant", "utilities-area", "fire-and-safety-area", "fg-warehouse"],
    ["batch-reaction", "laboratory-testing", "quality-inspection", "packaging-process"]),
  P("ayurvedic", "Ayurvedic, herbal & nutraceutical", "ayurvedic",
    ["ayurvedic", "ayurveda", "herbal", "nutraceutical", "supplement", "dietary supplement", "health supplement", "protein powder", "whey protein", "churna", "herbal extract", "plant extract", "unani", "homeopathy", "homoeopathic", "siddha", "food supplement", "vitamin", "herbal oil", "asava", "arishta", "chyawanprash", "ayurvedic medicine", "herbal medicine", "homeopathic medicine", "ayurvedic tablet", "herbal capsule"],
    ["herb-store", "cleaning-sorting-area", "grinding-mill", "extraction-plant", "fermentation-vats", "oil-ghrita-section", "granulation-compression", "capsule-section", "liquid-orals", "laboratory", "packaging-area", "fg-warehouse"],
    ["blending-mixing", "granulation", "tablet-compression", "capsule-filling", "filling-sealing", "laboratory-testing"]),
  P("medical-disposables", "Medical disposables & consumables", "medical disposables",
    ["medical disposable", "disposable", "syringe", "catheter", "cannula", "iv set", "infusion set", "blood bag", "urine bag", "surgical glove", "glove", "mask", "face mask", "bandage", "gauze", "surgical dressing", "surgical consumable", "medical consumable", "suture", "blood collection tube", "vacutainer", "absorbent cotton", "medical glove", "examination glove", "surgical mask", "medical mask"],
    ["rm-warehouse", "moulding-shop", "extrusion-line", "clean-room", "assembly-area", "sterilisation-area", "microbiology-lab", "laboratory", "quality-control-area", "packaging-area", "fg-warehouse"],
    ["injection-moulding", "extrusion", "assembly-process", "sterilisation", "product-testing", "packaging-process"]),
  P("medical-equipment", "Medical equipment & devices", "medical equipment",
    ["medical", "medical equipment", "medical device", "patient monitor", "ventilator", "ecg", "x ray", "xray", "ultrasound", "infusion pump", "hospital equipment", "diagnostic equipment", "diagnostic device", "oxygen concentrator", "nebuliser", "bp monitor", "pulse oximeter", "oximeter", "dental equipment", "surgical light", "medical electronics", "hearing aid", "physiotherapy equipment", "dialysis"],
    ["component-store", "esd-area", "smt-line", "cnc-machining-area", "assembly-area", "calibration-lab", "burn-in-room", "testing-bay", "quality-control-area", "research-and-development", "packaging-area", "fg-warehouse"],
    ["smt-assembly", "assembly-process", "product-testing", "quality-inspection", "packaging-process"]),
  P("hospital-furniture", "Hospital furniture & mobility aids", "hospital furniture",
    ["hospital bed", "hospital furniture", "wheelchair", "stretcher", "ot table", "operation table", "patient trolley", "walker", "medical trolley"],
    ["rm-warehouse", "sheet-metal-shop", "welding-fabrication-area", "paint-coating-area", "assembly-area", "testing-bay", "quality-control-area", "packaging-area", "fg-warehouse", "dispatch-area"],
    ["cutting-and-shearing", "fabrication-and-welding", "painting-and-coating", "assembly-process", "product-testing"]),
  P("implants-instruments", "Orthopaedic implants & surgical instruments", "implant and instrument",
    ["implant", "orthopaedic", "orthopaedic implant", "surgical instrument", "dental instrument", "dental implant", "bone screw", "bone plate", "spinal implant", "trauma implant", "forceps", "surgical scissor", "beauty instrument", "veterinary instrument"],
    ["rm-warehouse", "cnc-machining-area", "forge-shop", "heat-treatment-shop", "grinding-section", "polishing-line", "passivation-cleaning", "laser-marking", "metrology-room", "clean-room", "sterilisation-area", "quality-control-area", "packaging-area"],
    ["cnc-machining", "forging", "heat-treatment", "finishing-and-polishing", "sterilisation", "quality-inspection", "packaging-process"]),

  /* ───────────── Chemicals ───────────── */
  P("chemicals", "Chemicals & specialty chemicals", "chemical",
    ["chemical", "specialty chemical", "speciality chemical", "industrial chemical", "acid", "solvent", "resin", "adhesive", "glue", "textile chemical", "construction chemical", "water treatment chemical", "rubber chemical", "additive", "catalyst", "pigment", "dye", "dyestuff", "dye intermediate", "emulsion", "polymer emulsion", "silicate", "sulphate", "chloride", "caustic", "guar gum"],
    ["rm-warehouse", "tank-farm", "reactor-plant", "distillation-unit", "centrifuge-drying", "control-room", "pilot-plant", "laboratory", "drum-filling-area", "effluent-treatment-plant", "fire-and-safety-area", "utilities-area", "fg-warehouse"],
    ["batch-reaction", "blending-mixing", "filling-sealing", "laboratory-testing", "quality-inspection", "packaging-process"], true),
  P("paints", "Paints, coatings & inks", "paint",
    ["paint", "coating", "primer", "enamel", "varnish", "lacquer", "printing ink", "ink", "thinner", "distemper", "wood finish", "industrial paint", "decorative paint", "epoxy coating", "floor coating", "powder coating powder", "emulsion paint"],
    ["rm-warehouse", "reactor-plant", "premix-dispersion", "bead-mill", "mixing-vessels", "colour-lab", "drum-filling-area", "laboratory", "tank-farm", "fire-and-safety-area", "fg-warehouse", "dispatch-area"],
    ["blending-mixing", "batch-reaction", "filling-sealing", "laboratory-testing", "quality-inspection", "packaging-process"]),
  P("agrochemicals", "Agrochemicals & pesticides", "agrochemical",
    ["agrochemical", "pesticide", "insecticide", "herbicide", "fungicide", "weedicide", "crop protection", "plant growth regulator", "bio pesticide", "biopesticide", "plant protection", "technical grade"],
    ["rm-warehouse", "reactor-plant", "formulation-plant", "drum-filling-area", "filling-line", "laboratory", "tank-farm", "effluent-treatment-plant", "fire-and-safety-area", "fg-warehouse", "dispatch-area"],
    ["batch-reaction", "blending-mixing", "filling-sealing", "laboratory-testing", "quality-inspection", "packaging-process"]),
  P("fertilisers", "Fertilisers & organic manure", "fertiliser",
    ["fertiliser", "npk", "urea", "dap", "organic manure", "manure", "bio fertiliser", "biofertiliser", "micronutrient", "water soluble fertiliser", "ssp", "compost", "vermicompost", "soil conditioner", "organic fertiliser"],
    ["rm-warehouse", "granulation-plant", "dryer-section", "blending-section", "bagging-plant", "laboratory", "quality-control-area", "material-handling-area", "fg-warehouse", "dispatch-area"],
    ["blending-mixing", "packaging-process", "laboratory-testing", "quality-inspection", "material-handling"]),
  P("cosmetics", "Cosmetics & personal care", "cosmetics",
    ["cosmetic", "personal care", "shampoo", "cream", "lotion", "face wash", "facewash", "hair oil", "skin care", "skincare", "hair care", "perfume", "fragrance", "deodorant", "nail polish", "lipstick", "kajal", "beauty product", "toothpaste", "hand wash", "handwash", "sanitiser", "body wash", "herbal cosmetic", "serum", "attar", "hair dye", "hair colour"],
    ["rm-warehouse", "dispensing-area", "mixing-vessels", "filling-line", "hygiene-zone", "laboratory", "microbiology-lab", "water-treatment-plant", "packaging-area", "research-and-development", "fg-warehouse", "dispatch-area"],
    ["blending-mixing", "filling-sealing", "laboratory-testing", "quality-inspection", "packaging-process"]),
  P("soaps-detergents", "Soaps, detergents & cleaners", "soap and detergent",
    ["soap", "detergent", "washing powder", "detergent cake", "dish wash", "dishwash", "toilet cleaner", "floor cleaner", "phenyl", "liquid detergent", "laundry", "cleaning product", "housekeeping chemical", "glass cleaner"],
    ["rm-warehouse", "soap-plant", "mixing-vessels", "spray-dryer", "blending-section", "filling-line", "laboratory", "packaging-area", "fg-warehouse", "dispatch-area"],
    ["blending-mixing", "filling-sealing", "laboratory-testing", "quality-inspection", "packaging-process"]),
  P("lubricants", "Lubricants & industrial oils", "lubricant",
    ["lubricant", "lube oil", "engine oil", "grease", "gear oil", "hydraulic oil", "transformer oil", "cutting oil", "base oil", "white oil", "coolant", "brake fluid", "petroleum", "rubber process oil"],
    ["tank-farm", "mixing-vessels", "filling-line", "drum-filling-area", "laboratory", "rm-warehouse", "fire-and-safety-area", "fg-warehouse", "dispatch-area"],
    ["blending-mixing", "filling-sealing", "laboratory-testing", "quality-inspection", "packaging-process"]),

  /* ───────────── Food and beverages ───────────── */
  P("food", "Food processing", "food",
    ["food", "food processing", "food product", "processed food", "ready to eat", "ready to cook", "instant food", "packaged food", "noodle", "pasta", "vermicelli", "papad", "breakfast cereal", "cereal", "corn flake", "honey", "food ingredient", "instant mix", "premix", "soup"],
    ["rm-warehouse", "hygiene-zone", "processing-line", "cold-storage", "laboratory", "microbiology-lab", "packaging-area", "fg-warehouse", "water-treatment-plant", "dispatch-area"],
    ["cleaning-sorting", "cooking-processing", "filling-sealing", "packaging-process", "laboratory-testing", "quality-inspection"], true),
  P("snacks", "Snacks, namkeen & sweets", "snacks",
    ["snack", "namkeen", "namkin", "bhujia", "chip", "potato chip", "wafer", "extruded snack", "puff", "farsan", "mithai", "sweet", "indian sweet", "khakhra", "makhana", "roasted snack", "fryum", "snack pellet", "chakli", "sev", "mixture"],
    ["rm-warehouse", "cleaning-sorting-area", "hygiene-zone", "dough-mixing", "frying-line", "seasoning-section", "processing-line", "packaging-area", "laboratory", "fg-warehouse", "dispatch-area"],
    ["cleaning-sorting", "frying", "cooking-processing", "packaging-process", "laboratory-testing", "quality-inspection"]),
  P("bakery", "Bakery & biscuits", "bakery",
    ["bakery", "biscuit", "cookie", "bread", "cake", "rusk", "toast", "cream biscuit", "cracker", "bun", "pav", "muffin", "baked", "pastry", "croissant", "pizza base", "khari"],
    ["storage-silos", "rm-warehouse", "hygiene-zone", "dough-mixing", "forming-line", "baking-oven", "cooling-tunnel", "packaging-area", "laboratory", "fg-warehouse", "dispatch-area"],
    ["blending-mixing", "baking", "packaging-process", "laboratory-testing", "quality-inspection"]),
  P("dairy", "Dairy", "dairy",
    ["dairy", "milk", "ghee", "paneer", "cheese", "butter", "curd", "dahi", "yoghurt", "lassi", "ice cream", "milk powder", "skimmed milk", "khoa", "mawa", "flavoured milk", "buttermilk", "chaas", "fresh cream", "dairy product"],
    ["milk-reception", "pasteuriser-section", "cip-system", "ghee-butter-section", "paneer-curd-section", "filling-line", "spray-dryer", "cold-storage", "laboratory", "hygiene-zone", "effluent-treatment-plant", "utilities-area", "dispatch-area"],
    ["pasteurising", "cooking-processing", "filling-sealing", "packaging-process", "laboratory-testing", "quality-inspection"]),
  P("fruit-veg", "Fruit & vegetable processing", "fruit and vegetable",
    ["fruit", "vegetable", "fruit pulp", "mango pulp", "tomato paste", "ketchup", "sauce", "jam", "pickle", "achar", "fruit juice", "juice", "concentrate", "puree", "dehydrated vegetable", "canned", "canning", "potato flake", "aloe vera", "squash", "chutney", "murabba"],
    ["cleaning-sorting-area", "pulping-section", "processing-line", "pasteuriser-section", "filling-line", "iqf-freezer", "cold-storage", "laboratory", "hygiene-zone", "packaging-area", "fg-warehouse", "effluent-treatment-plant"],
    ["cleaning-sorting", "cooking-processing", "pasteurising", "filling-sealing", "laboratory-testing", "quality-inspection"]),
  P("beverages", "Beverages & packaged water", "beverage",
    ["beverage", "drink", "soft drink", "packaged water", "packaged drinking water", "mineral water", "drinking water", "water", "soda", "carbonated", "energy drink", "bottling plant", "aerated drink", "jeera soda", "sharbat", "coconut water", "alkaline water"],
    ["water-treatment-plant", "syrup-room", "cip-system", "moulding-shop", "bottling-hall", "laboratory", "microbiology-lab", "hygiene-zone", "packaging-area", "fg-warehouse", "dispatch-area"],
    ["filling-sealing", "blending-mixing", "laboratory-testing", "quality-inspection", "packaging-process"]),
  P("distillery", "Breweries & distilleries", "distillery",
    ["distillery", "brewery", "liquor", "whisky", "rum", "vodka", "beer", "wine", "winery", "ethanol", "extra neutral alcohol", "ena", "malt", "country liquor", "imfl", "alcohol"],
    ["storage-silos", "grinding-mill", "fermentation-vats", "distillation-unit", "tank-farm", "blending-section", "bottling-hall", "laboratory", "effluent-treatment-plant", "utilities-area", "fg-warehouse"],
    ["blending-mixing", "filling-sealing", "laboratory-testing", "quality-inspection", "packaging-process"]),
  P("spices", "Spices & masalas", "spice",
    ["spice", "masala", "chilli", "turmeric", "haldi", "cumin", "jeera", "coriander", "dhania", "black pepper", "pepper", "cardamom", "garam masala", "spice powder", "whole spice", "seed spice", "fennel", "saunf", "curry powder", "ginger powder", "hing", "asafoetida", "oleoresin", "dehydrated onion", "dehydrated garlic"],
    ["rm-warehouse", "cleaning-sorting-area", "steam-sterilisation", "roasting-section", "grinding-mill", "blending-section", "cold-storage", "laboratory", "microbiology-lab", "hygiene-zone", "packaging-area", "fg-warehouse"],
    ["cleaning-sorting", "milling-grinding", "blending-mixing", "packaging-process", "laboratory-testing", "quality-inspection"]),
  P("edible-oil", "Edible oil", "edible oil",
    ["edible oil", "oil", "oil mill", "mustard oil", "groundnut oil", "sunflower oil", "soybean oil", "soya oil", "cottonseed oil", "rice bran oil", "coconut oil", "sesame oil", "til oil", "palm oil", "cold pressed", "kachi ghani", "refined oil", "oil refinery", "solvent extraction", "oil cake", "de oiled cake", "vanaspati", "castor oil", "expeller"],
    ["storage-silos", "cleaning-sorting-area", "expeller-section", "oil-refinery", "tank-farm", "filling-line", "laboratory", "packaging-area", "utilities-area", "fg-warehouse", "dispatch-area"],
    ["cleaning-sorting", "milling-grinding", "filling-sealing", "laboratory-testing", "quality-inspection", "packaging-process"]),
  P("grain-milling", "Rice, pulses & grains", "rice and grain",
    ["rice", "basmati", "rice mill", "paddy", "non basmati", "parboiled", "dal", "pulse", "lentil", "chana", "toor dal", "moong", "urad", "millet", "food grain", "grain", "sortex", "agri commodity", "sorghum", "jowar", "bajra", "maize", "corn", "soybean", "sesame seed", "oil seed", "seed", "seed processing"],
    ["storage-silos", "rm-warehouse", "cleaning-sorting-area", "parboiling-plant", "dryer-section", "milling-plant", "colour-sorting", "bagging-plant", "laboratory", "fg-warehouse", "dispatch-area"],
    ["cleaning-sorting", "milling-grinding", "sorting-grading", "packaging-process", "laboratory-testing", "quality-inspection"]),
  P("flour-mill", "Flour & atta mills", "flour mill",
    ["flour", "atta", "maida", "suji", "sooji", "rava", "semolina", "besan", "chakki atta", "flour mill", "roller flour mill", "wheat", "multigrain atta", "dalia"],
    ["storage-silos", "cleaning-sorting-area", "roller-mill", "grinding-mill", "bagging-plant", "laboratory", "hygiene-zone", "rm-warehouse", "fg-warehouse", "dispatch-area"],
    ["cleaning-sorting", "milling-grinding", "packaging-process", "laboratory-testing", "quality-inspection"]),
  P("confectionery", "Confectionery & chocolate", "confectionery",
    ["confectionery", "chocolate", "candy", "toffee", "lollipop", "chewing gum", "jelly", "gummy", "hard boiled", "eclair", "cocoa", "chocolate compound", "marshmallow", "lozenge", "sugar candy"],
    ["rm-warehouse", "hygiene-zone", "mixing-vessels", "chocolate-line", "moulding-enrobing", "cooling-tunnel", "wrapping-section", "packaging-area", "cold-storage", "laboratory", "fg-warehouse"],
    ["cooking-processing", "blending-mixing", "packaging-process", "laboratory-testing", "quality-inspection"]),
  P("frozen-seafood", "Seafood, meat & frozen foods", "frozen food",
    ["seafood", "shrimp", "prawn", "fish", "frozen fish", "meat", "poultry", "chicken", "mutton", "buffalo meat", "frozen food", "frozen", "frozen vegetable", "iqf", "frozen snack", "frozen paratha", "surimi", "squid", "marine product", "processed meat", "sausage", "slaughterhouse", "abattoir", "egg powder"],
    ["chilled-receiving", "pre-processing-hall", "processing-line", "iqf-freezer", "cold-storage", "ice-plant", "hygiene-zone", "laboratory", "packaging-area", "effluent-treatment-plant", "utilities-area", "dispatch-area"],
    ["cleaning-sorting", "cooking-processing", "freezing", "packaging-process", "laboratory-testing", "quality-inspection"]),
  P("tea-coffee", "Tea & coffee", "tea and coffee",
    ["tea", "tea garden", "tea estate", "ctc tea", "green tea", "orthodox tea", "herbal tea", "coffee", "coffee roasting", "instant coffee", "coffee bean", "filter coffee", "chai", "tea blending", "tea packing"],
    ["withering-section", "rolling-ctc", "fermenting-room", "dryer-section", "colour-sorting", "roasting-section", "blending-section", "tasting-room", "laboratory", "packaging-area", "fg-warehouse", "dispatch-area"],
    ["roasting", "sorting-grading", "blending-mixing", "packaging-process", "quality-inspection"]),
  P("nuts-dry-fruits", "Dry fruits, nuts & seeds", "dry fruit",
    ["cashew", "almond", "dry fruit", "dryfruit", "walnut", "pistachio", "raisin", "kishmish", "peanut", "groundnut", "roasted peanut", "cashew kernel"],
    ["rm-warehouse", "cleaning-sorting-area", "roasting-section", "shelling-peeling", "dryer-section", "colour-sorting", "hygiene-zone", "packaging-area", "cold-storage", "laboratory", "fg-warehouse"],
    ["cleaning-sorting", "roasting", "sorting-grading", "packaging-process", "quality-inspection"]),
  P("animal-feed", "Animal, poultry & pet feed", "feed",
    ["animal feed", "cattle feed", "poultry feed", "fish feed", "pet food", "dog food", "shrimp feed", "aqua feed", "mineral mixture", "feed supplement", "pashu aahar", "feed mill"],
    ["storage-silos", "rm-warehouse", "grinding-mill", "blending-section", "pellet-mill", "dryer-section", "bagging-plant", "laboratory", "fg-warehouse", "dispatch-area"],
    ["milling-grinding", "blending-mixing", "packaging-process", "laboratory-testing", "quality-inspection"]),
  P("sugar", "Sugar & jaggery", "sugar",
    ["sugar", "jaggery", "gur", "sugar mill", "khandsari", "cane"],
    ["raw-material-yard", "grinding-mill", "processing-line", "centrifuge-drying", "dryer-section", "bagging-plant", "laboratory", "utilities-area", "effluent-treatment-plant", "fg-warehouse"],
    ["milling-grinding", "cooking-processing", "packaging-process", "laboratory-testing", "quality-inspection"]),

  /* ───────────── Packaging, paper and printing ───────────── */
  P("corrugated", "Corrugated boxes", "corrugated box",
    ["corrugated", "corrugation", "corrugated box", "carton", "box", "shipping box", "master carton", "brown box", "3 ply", "5 ply", "7 ply", "packaging"],
    ["reel-store", "corrugation-plant", "printing-section", "die-cutting-section", "folder-gluer", "quality-control-area", "laboratory", "material-handling-area", "fg-warehouse", "dispatch-area"],
    ["printing-process", "die-cutting", "packaging-process", "quality-inspection", "material-handling"]),
  P("printing-cartons", "Printing & mono cartons", "printing and packaging",
    ["printing", "printer", "offset printing", "mono carton", "monocarton", "printed carton", "duplex board", "paper box", "rigid box", "folding carton", "packaging box", "printing press", "commercial printing", "brochure", "book printing", "catalogue", "packaging material", "paper bag", "paper cup", "paper plate", "notebook", "packaging", "stationery", "diary", "calendar", "envelope", "file folder"],
    ["rm-warehouse", "pre-press", "printing-section", "lamination-section", "die-cutting-section", "folder-gluer", "colour-lab", "quality-control-area", "fg-warehouse", "dispatch-area"],
    ["printing-process", "lamination", "die-cutting", "quality-inspection", "packaging-process"]),
  P("labels", "Labels & stickers", "label",
    ["label", "sticker", "self adhesive label", "barcode label", "woven label", "hang tag", "shrink sleeve", "holographic", "hologram", "printed label", "label printing"],
    ["rm-warehouse", "pre-press", "printing-section", "die-cutting-section", "slitting-line", "inspection-area", "quality-control-area", "fg-warehouse", "dispatch-area"],
    ["printing-process", "die-cutting", "lamination", "quality-inspection", "packaging-process"]),
  P("paper", "Paper & paperboard mills", "paper mill",
    ["paper", "paper mill", "kraft", "kraft paper", "paperboard", "duplex paper", "writing paper", "printing paper", "newsprint", "tissue paper", "tissue", "craft paper", "waste paper", "paper roll", "a4 paper", "paper pulp", "pulp"],
    ["raw-material-yard", "pulping-plant", "paper-machine", "slitting-line", "laboratory", "quality-control-area", "effluent-treatment-plant", "power-room-substation", "utilities-area", "fg-warehouse", "dispatch-area"],
    ["cutting-and-shearing", "quality-inspection", "laboratory-testing", "material-handling"]),

  /* ───────────── Wood and furniture ───────────── */
  P("furniture", "Furniture & interiors", "furniture",
    ["furniture", "wooden furniture", "office furniture", "modular furniture", "modular kitchen", "wardrobe", "chair", "sofa", "table", "solid wood", "sheesham", "mango wood", "teak", "wood", "wooden", "home furniture", "school furniture", "hotel furniture", "outdoor furniture", "cane furniture", "bamboo furniture", "interior fit out", "joinery", "door", "wooden door", "bed", "cot", "bunk bed", "double bed", "dining table", "bamboo", "rattan", "cabinet", "shoe rack", "tv unit"],
    ["timber-yard", "rm-warehouse", "panel-processing", "cnc-machining-area", "handwork-section", "assembly-area", "paint-coating-area", "upholstery-section", "quality-control-area", "packaging-area", "showroom", "fg-warehouse"],
    ["cutting-and-shearing", "edge-banding", "cnc-machining", "finishing-and-polishing", "assembly-process", "packaging-process"]),
  P("metal-furniture", "Metal furniture & storage", "metal furniture",
    ["metal furniture", "steel furniture", "almirah", "steel almirah", "locker", "filing cabinet", "steel cupboard", "mobile compactor", "compactor", "steel bed", "workbench", "school desk"],
    ["rm-warehouse", "sheet-metal-shop", "press-shop", "welding-fabrication-area", "paint-coating-area", "plating-line", "upholstery-section", "assembly-area", "quality-control-area", "packaging-area", "fg-warehouse", "showroom"],
    ["press-stamping", "fabrication-and-welding", "painting-and-coating", "assembly-process", "quality-inspection"]),
  P("plywood", "Plywood, boards & laminates", "plywood",
    ["plywood", "ply", "block board", "blockboard", "flush door", "mdf", "hdf", "particle board", "veneer", "laminate", "decorative laminate", "hpl", "sunmica", "wpc board", "marine ply", "film faced", "shuttering ply", "door skin", "pre laminated"],
    ["raw-material-yard", "peeling-section", "dryer-section", "hot-press", "sanding-calibration", "impregnation-line", "laboratory", "quality-control-area", "utilities-area", "fg-warehouse", "dispatch-area"],
    ["cutting-and-shearing", "lamination", "finishing-and-polishing", "quality-inspection", "laboratory-testing"]),

  /* ───────────── Ceramics, glass and building materials ───────────── */
  P("tiles", "Ceramic & vitrified tiles", "tile",
    ["tile", "ceramic tile", "vitrified tile", "gvt", "pgvt", "wall tile", "floor tile", "porcelain tile", "porcelain slab", "digital tile", "parking tile", "roof tile"],
    ["raw-material-yard", "ball-mill-section", "spray-dryer", "forming-press", "glazing-line", "kiln-area", "polishing-line", "inspection-area", "laboratory", "packaging-area", "fg-warehouse", "showroom", "dispatch-area"],
    ["press-stamping", "glazing", "kiln-firing", "finishing-and-polishing", "quality-inspection", "packaging-process"]),
  P("sanitaryware", "Ceramic sanitaryware", "sanitaryware",
    ["sanitaryware", "sanitary ware", "sanitary", "wash basin", "basin", "water closet", "wc", "toilet", "commode", "urinal", "ceramic sanitary"],
    ["raw-material-yard", "ball-mill-section", "plaster-mould-shop", "slip-casting", "dryer-section", "glazing-line", "kiln-area", "inspection-area", "laboratory", "packaging-area", "fg-warehouse", "showroom"],
    ["casting-process", "glazing", "kiln-firing", "quality-inspection", "packaging-process"]),
  P("hardware", "Locks, hinges & builders' hardware", "hardware",
    ["hardware", "builder hardware", "architectural hardware", "door hardware", "furniture hardware", "lock", "padlock", "door lock", "hinge", "door handle", "handle", "tower bolt", "door closer", "drawer channel", "telescopic channel", "door stopper", "kitchen hardware", "glass fitting"],
    ["rm-warehouse", "press-shop", "die-casting-cell", "cnc-machining-area", "polishing-line", "plating-line", "assembly-area", "testing-bay", "quality-control-area", "packaging-area", "fg-warehouse", "dispatch-area"],
    ["press-stamping", "casting-process", "cnc-machining", "finishing-and-polishing", "plating", "assembly-process", "quality-inspection"]),
  P("bath-fittings", "Bath fittings & faucets", "bath fittings",
    ["faucet", "tap", "cp fitting", "bath fitting", "bathroom fitting", "shower", "brass fitting", "bathroom accessories", "sanitary fitting"],
    ["rm-warehouse", "forge-shop", "foundry-casting-area", "cnc-machining-area", "polishing-line", "plating-line", "assembly-area", "testing-bay", "quality-control-area", "packaging-area", "fg-warehouse", "showroom"],
    ["forging", "cnc-machining", "finishing-and-polishing", "plating", "assembly-process", "product-testing"]),
  P("ceramics", "Ceramics, pottery & refractories", "ceramics",
    ["ceramic", "pottery", "crockery", "bone china", "porcelain", "stoneware", "terracotta", "refractory", "fire brick", "castable", "insulator", "ceramic insulator"],
    ["raw-material-yard", "ball-mill-section", "forming-press", "plaster-mould-shop", "dryer-section", "glazing-line", "kiln-area", "inspection-area", "laboratory", "packaging-area", "fg-warehouse"],
    ["press-stamping", "glazing", "kiln-firing", "quality-inspection", "packaging-process"]),
  P("cement", "Cement, putty & dry mix", "cement",
    ["cement", "clinker", "opc", "ppc", "cement plant", "grinding unit", "white cement", "wall putty", "putty", "tile adhesive", "dry mix", "gypsum", "gypsum plaster", "plaster"],
    ["raw-material-yard", "crusher-plant", "grinding-mill", "rotary-kiln", "storage-silos", "blending-section", "bagging-plant", "control-room", "laboratory", "power-room-substation", "material-handling-area", "dispatch-area"],
    ["milling-grinding", "blending-mixing", "kiln-firing", "laboratory-testing", "packaging-process", "material-handling"]),
  P("glass", "Glass & glassware", "glass",
    ["glass", "glassware", "glass bottle", "toughened glass", "tempered glass", "float glass", "laminated glass", "glass container", "glass jar", "borosilicate", "decorative glass", "mirror", "glass bangle"],
    ["batch-house", "glass-furnace", "forming-machines", "annealing-lehr", "glass-processing", "inspection-area", "printing-section", "laboratory", "packaging-area", "fg-warehouse", "dispatch-area"],
    ["melting-pouring", "heat-treatment", "quality-inspection", "packaging-process"]),
  P("stone", "Granite, marble & quartz", "stone",
    ["granite", "marble", "quartz", "natural stone", "stone", "sandstone", "slate", "kota stone", "quartz slab", "engineered stone", "stone slab", "monument", "cobble", "kitchen top", "countertop"],
    ["raw-material-yard", "gang-saw", "resin-line", "polishing-line", "cutting-section", "inspection-area", "quality-control-area", "stock-yard", "packaging-area", "showroom", "dispatch-area"],
    ["cutting-and-shearing", "finishing-and-polishing", "quality-inspection", "packaging-process", "material-handling"]),
  P("concrete-products", "Blocks, bricks & concrete products", "building materials",
    ["aac", "aac block", "fly ash brick", "fly ash", "brick", "concrete block", "paver", "paver block", "interlocking", "kerb stone", "rcc pipe", "hume pipe", "precast", "ready mix", "rmc", "ready mix concrete", "concrete product", "solid block", "hollow block", "clc block", "cement brick", "red brick", "building material", "stone crusher", "aggregate", "m sand"],
    ["raw-material-yard", "crusher-plant", "batching-plant", "block-moulding", "curing-area", "cutting-section", "laboratory", "quality-control-area", "material-handling-area", "stock-yard", "dispatch-area"],
    ["blending-mixing", "casting-process", "quality-inspection", "laboratory-testing", "material-handling"]),

  /* ───────────── Leather and footwear ───────────── */
  P("leather-goods", "Leather goods & bags", "leather goods",
    ["leather", "leather bag", "leather goods", "belt", "wallet", "purse", "handbag", "bag", "backpack", "luggage", "travel bag", "laptop bag", "leather garment", "saddlery", "leather glove"],
    ["rm-warehouse", "cutting-section", "skiving-prep", "stitching-floor", "finishing-room", "sampling-room", "quality-control-area", "packaging-area", "fg-warehouse", "showroom"],
    ["cutting-and-shearing", "stitching", "finishing-and-polishing", "quality-inspection", "packaging-process"]),
  P("footwear", "Footwear", "footwear",
    ["leather", "footwear", "shoe", "chappal", "sandal", "slipper", "boot", "safety shoe", "sneaker", "sports shoe", "school shoe", "juti", "mojari", "kolhapuri", "eva slipper", "pu sole", "sole", "shoe upper", "hawai chappal", "flip flop"],
    ["rm-warehouse", "cutting-section", "skiving-prep", "stitching-floor", "lasting-section", "sole-moulding", "finishing-room", "quality-control-area", "laboratory", "packaging-area", "fg-warehouse", "dispatch-area"],
    ["cutting-and-shearing", "stitching", "injection-moulding", "assembly-process", "finishing-and-polishing", "quality-inspection"]),
  P("tannery", "Leather tanning", "tannery",
    ["leather", "tannery", "tanning", "finished leather", "hide", "wet blue", "crust leather", "cow leather", "buffalo leather", "goat leather", "sheep leather"],
    ["rm-warehouse", "beam-house", "tanning-drums", "splitting-shaving", "dryer-section", "leather-finishing", "inspection-area", "laboratory", "effluent-treatment-plant", "fg-warehouse"],
    ["tanning", "dyeing", "finishing-and-polishing", "quality-inspection", "laboratory-testing"]),

  /* ───────────── Jewellery and gems ───────────── */
  P("jewellery", "Gold & silver jewellery", "jewellery",
    ["jewellery", "gold", "silver", "ornament", "kundan", "bangle", "gold jewellery", "silver jewellery", "imitation jewellery", "fashion jewellery", "artificial jewellery", "necklace", "earring", "temple jewellery", "polki", "meenakari", "platinum", "gold chain", "silver article"],
    ["cad-studio", "wax-room", "foundry-casting-area", "bench-work", "polishing-setting", "plating-line", "quality-control-area", "strong-room", "security-entry-gate", "showroom", "packaging-area"],
    ["casting-process", "stone-setting", "finishing-and-polishing", "plating", "quality-inspection"]),
  P("diamonds", "Diamonds & gemstones", "diamond",
    ["diamond", "cut and polished", "polished diamond", "lab grown", "lab grown diamond", "lgd", "cvd", "hpht", "gem", "gemstone", "precious stone", "semi precious", "ratna", "rough diamond"],
    ["diamond-planning", "diamond-polishing", "growing-reactors", "grading-lab", "quality-control-area", "strong-room", "security-entry-gate", "research-and-development"],
    ["finishing-and-polishing", "quality-inspection"]),

  /* ───────────── Crafts, toys and sports ───────────── */
  P("handicrafts", "Handicrafts & home décor", "handicrafts",
    ["handicraft", "decor", "home decor", "artware", "art ware", "candle", "incense", "agarbatti", "dhoop", "brassware", "brass handicraft", "metal handicraft", "wooden handicraft", "marble handicraft", "gift", "corporate gift", "craft", "christmas decoration", "festive decor", "pooja item", "idol", "murti", "statue", "wall decor", "photo frame", "artificial flower", "umbrella", "home furnishing accessory", "pottery item", "lamp shade"],
    ["rm-warehouse", "handwork-section", "manufacturing-production-area", "paint-coating-area", "polishing-line", "finishing-room", "quality-control-area", "sampling-room", "packaging-area", "fg-warehouse", "showroom"],
    ["finishing-and-polishing", "painting-and-coating", "quality-inspection", "packaging-process"]),
  P("toys", "Toys & games", "toy",
    ["toy", "soft toy", "plush", "educational toy", "board game", "puzzle", "doll", "ride on", "wooden toy", "plastic toy", "stem toy"],
    ["rm-warehouse", "moulding-shop", "tool-room", "paint-coating-area", "stitching-floor", "assembly-area", "testing-bay", "quality-control-area", "packaging-area", "fg-warehouse", "showroom"],
    ["injection-moulding", "painting-and-coating", "stitching", "assembly-process", "product-testing", "packaging-process"]),
  P("sports-goods", "Sports goods & fitness equipment", "sports goods",
    ["sports good", "sports equipment", "cricket", "cricket bat", "football", "gym equipment", "fitness", "fitness equipment", "dumbbell", "treadmill", "yoga mat", "badminton", "racket", "hockey stick", "boxing", "sports ball"],
    ["rm-warehouse", "cutting-section", "stitching-floor", "moulding-shop", "handwork-section", "welding-fabrication-area", "paint-coating-area", "assembly-area", "testing-bay", "quality-control-area", "packaging-area", "fg-warehouse"],
    ["cutting-and-shearing", "stitching", "injection-moulding", "fabrication-and-welding", "assembly-process", "quality-inspection"]),
];

const BY_ID = new Map(INDUSTRY_PROFILES.map((p) => [p.id, p]));
export function profileById(id: string): IndustryProfile | undefined {
  return BY_ID.get(id);
}

/* ───────────────────────── Matching ─────────────────────────────── */

/** Words that say nothing about what a plant makes. */
const STOPWORD_TEXT =
  
    "a an and or of for the in on at to with by from we our us is are am be all any every other etc " +
    "make makes made making maker makers manufacture manufactures manufactured manufacturing manufacturer manufacturers " +
    "produce produces producing producer producers production product products item items goods " +
    "factory factories plant plants unit units company companies firm industries industry industrial " +
    "pvt private ltd limited llp co corp corporation enterprise enterprises group india indian " +
    "export exports exporter exporters exporting import importer supplier suppliers trading trader traders " +
    "type types kind kinds range various different quality best high premium customised custom " +
    "related allied based like such also";

/** US and other spellings people type, mapped to the ones we list. */
const VARIANTS: Record<string, string> = {
  mold: "mould", molding: "moulding", molded: "moulded", molds: "mould", moldings: "moulding",
  jewelry: "jewellery", jewellry: "jewellery", jwellery: "jewellery", aluminum: "aluminium",
  fertilizer: "fertiliser", biofertilizer: "biofertiliser", fiber: "fibre", color: "colour", colored: "coloured",
  galvanized: "galvanised", galvanizing: "galvanising", anodized: "anodised", anodizing: "anodising",
  sanitizer: "sanitiser", stabilizer: "stabiliser", yogurt: "yoghurt", tire: "tyre", tires: "tyre",
  gray: "grey", chili: "chilli", whiskey: "whisky", defense: "defence", orthopedic: "orthopaedic",
  pediatric: "paediatric", organized: "organised", metalized: "metallised", metallized: "metallised",
  lyophilized: "lyophilised", nebulizer: "nebuliser", analyser: "analyzer", mercerizing: "mercerising",
  catalog: "catalogue", pharmaceuticals: "pharmaceutical",
};

function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "castings" → "casting", "batteries" → "battery", "boxes" → "box". */
function singular(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(sses|xes|ches|shes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && !w.endsWith("is")) return w.slice(0, -1);
  return w;
}

/** One canonical form per word: spelling variant, then singular. */
function canon(w: string): string {
  const v = VARIANTS[w] ?? w;
  return VARIANTS[singular(v)] ?? singular(v);
}

const STOPWORDS = new Set(STOPWORD_TEXT.split(" ").flatMap((w) => [w, canon(w)]));

function words(text: string): string[] {
  const norm = normalise(text);
  if (!norm) return [];
  return norm
    .split(" ")
    .map(canon)
    .filter((w) => w && !STOPWORDS.has(w));
}

/**
 * The typed words with how much each counts. Words after "for" name the
 * customer, not the product ("castings for pumps", "parts for tractors"),
 * so they count half.
 */
function typedWords(text: string): { word: string; weight: number }[] {
  const norm = normalise(text);
  if (!norm) return [];
  let weight = 1;
  const out: { word: string; weight: number }[] = [];
  for (const raw of norm.split(" ")) {
    if (raw === "for") {
      weight = 0.5;
      continue;
    }
    const w = canon(raw);
    if (w && !STOPWORDS.has(w)) out.push({ word: w, weight });
  }
  return out;
}

/** Edit distance with transpositions, giving up past `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = new Array<number>(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}

/* The index, built once. */
type Indexed = { profile: IndustryProfile; order: number; words: Set<string>; phrases: string[][] };

const INDEXED: Indexed[] = INDUSTRY_PROFILES.map((profile, order) => {
  const single = new Set<string>();
  const phrases: string[][] = [];
  for (const kw of profile.keywords) {
    const w = words(kw);
    if (w.length === 1) single.add(w[0]);
    else if (w.length > 1) phrases.push(w);
  }
  return { profile, order, words: single, phrases };
});

/** In how many profiles a single word appears: a word every metal trade
 *  uses ("steel") counts for less than one only a single trade uses. */
const WORD_DF = new Map<string, number>();
const PHRASE_DF = new Map<string, number>();
const VOCAB = new Set<string>();
for (const ix of INDEXED) {
  for (const w of ix.words) {
    WORD_DF.set(w, (WORD_DF.get(w) ?? 0) + 1);
    VOCAB.add(w);
  }
  for (const ph of ix.phrases) {
    const key = ph.join(" ");
    PHRASE_DF.set(key, (PHRASE_DF.get(key) ?? 0) + 1);
    for (const w of ph) VOCAB.add(w);
  }
}
const VOCAB_LIST = [...VOCAB];

/** What a typed word could mean, with how sure we are (1 = typed exactly). */
type Candidate = { word: string; q: number };

function candidatesFor(token: string, isLast: boolean): Candidate[] {
  if (VOCAB.has(token)) return [{ word: token, q: 1 }];
  if (token.length < 4) return [];

  // A one-letter typo, or two in a long word: "castngs", "medcal", "equipmnt".
  const pick = (max: number, q: number) => {
    let best = max + 1;
    let out: string[] = [];
    for (const v of VOCAB_LIST) {
      if (v.length < 4) continue;
      const d = editDistance(token, v, max);
      if (d < best) {
        best = d;
        out = [v];
      } else if (d === best) out.push(v);
    }
    return best <= max ? out.map((word) => ({ word, q })) : [];
  };
  const typo1 = pick(1, 0.85);
  if (typo1.length) return typo1;

  // The same word with another ending: "printed" ~ printing, "forged" ~ forging.
  const stem: Candidate[] = [];
  for (const v of VOCAB_LIST) {
    let k = 0;
    while (k < v.length && k < token.length && v[k] === token[k]) k++;
    if (k >= 5 && token.length - k <= 3 && v.length - k <= 3) stem.push({ word: v, q: 0.8 });
  }
  if (stem.length && stem.length <= 4) return stem;

  if (token.length >= 8) {
    const typo2 = pick(2, 0.7);
    if (typo2.length && typo2.length <= 3) return typo2;
  }

  // Still typing the last word: "texti" → textile.
  if (isLast || token.length >= 5) {
    const pre = VOCAB_LIST.filter((v) => v.length > token.length && v.startsWith(token));
    if (pre.length && pre.length <= 6) return pre.map((word) => ({ word, q: 0.6 }));
  }
  return [];
}

export type IndustryMatch = {
  /** The one industry we think they mean, as a list for older callers
   *  (empty when nothing matched). */
  profiles: IndustryProfile[];
  profile: IndustryProfile | null;
  /** Recommended areas, factory exterior first. With no match, the few
   *  areas every plant has (step 2 then asks them to add their own). */
  areaIds: string[];
  processIds: string[];
  /** General areas to offer under "More areas": everything not already
   *  picked, minus shop floors this industry does not have. Empty with no
   *  match: a long list we cannot vouch for only reads as random. */
  moreAreaIds: string[];
  matched: boolean;
};

const FIRST_AREA = "factory-exterior";
/** "food processing machinery", "dairy equipment": they make the machines.
 *  Unless the industry's own phrase includes the word ("medical
 *  equipment", "washing machine"), a profile that only matched the trade
 *  being served drops below the machinery profiles. */
const MACHINE_WORDS = new Set(["machine", "machinery", "equipment"]);
const MACHINE_PROFILES = new Set(["machinery", "agri-machinery", "moulds-dies"]);
const SERVED_TRADE_WEIGHT = 0.2;
const MIN_SCORE = 1.2;
const GENERIC_WEIGHT = 0.8;

/** Score every profile for a typed answer; best first. Exported for tests. */
export function scoreIndustries(text: unknown, excluded: string[] = []): { id: string; score: number }[] {
  const typed = typeof text === "string" ? typedWords(text.slice(0, 200)) : [];
  if (typed.length === 0) return [];
  const cands = typed.map((t, i) => candidatesFor(t.word, i === typed.length - 1));
  const weightAt = (i: number) => typed[i].weight;
  const machineAt = cands.map((cs) => cs.some((c) => MACHINE_WORDS.has(c.word)));
  const mentionsMachines = machineAt.some(Boolean);

  const scored = INDEXED.filter((ix) => !excluded.includes(ix.profile.id)).map((ix) => {
    let score = 0;
    let hits = 0;
    let first = Infinity;
    // Each typed word counts once per profile, at its best meaning.
    cands.forEach((cs, i) => {
      let best = 0;
      for (const c of cs) {
        if (!ix.words.has(c.word)) continue;
        const w =
          (c.q * 3 * weightAt(i)) / Math.sqrt(WORD_DF.get(c.word) ?? 1) / (cs.length > 1 ? Math.sqrt(cs.length) : 1);
        if (w > best) best = w;
      }
      if (best > 0) {
        hits++;
        first = Math.min(first, i);
      }
      score += best;
    });
    // A phrase typed whole ("steel pipe", "medical equipment") is the
    // strongest signal there is.
    let machinePhrase = false;
    for (const ph of ix.phrases) {
      for (let i = 0; i + ph.length <= cands.length; i++) {
        let q = 1;
        let ok = true;
        for (let j = 0; j < ph.length; j++) {
          const c = cands[i + j].find((x) => x.word === ph[j]);
          if (!c) {
            ok = false;
            break;
          }
          q = Math.min(q, c.q * weightAt(i + j));
        }
        if (ok) {
          score += (4 * ph.length * q) / Math.sqrt(PHRASE_DF.get(ph.join(" ")) ?? 1);
          hits++;
          first = Math.min(first, i);
          if (ph.some((w) => MACHINE_WORDS.has(w))) machinePhrase = true;
          break;
        }
      }
    }
    if (ix.profile.generic) score *= GENERIC_WEIGHT;
    if (mentionsMachines && !machinePhrase && !MACHINE_PROFILES.has(ix.profile.id)) score *= SERVED_TRADE_WEIGHT;
    return { ix, score, hits, first };
  });

  return scored
    .filter((x) => x.score > 0)
    // Ties: more words matched, then the word typed first (in "ayurvedic
    // tablets" the first word says which kind), then list order.
    .sort((a, b) => b.score - a.score || b.hits - a.hits || a.first - b.first || a.ix.order - b.ix.order)
    .map((x) => ({ id: x.ix.profile.id, score: Math.round(x.score * 100) / 100 }));
}

/**
 * What a typed answer most likely means: ONE industry, or none.
 *
 * Typos, plurals, US spellings and a half-typed last word are corrected
 * against the keyword vocabulary first ("stell pipes", "medcal
 * equipments", "texti"). Then every profile is scored: a whole phrase
 * outweighs single words, and a word many industries share counts for
 * less than one that only a single industry uses. Broad family profiles
 * ("Food processing") only win when nothing narrower does.
 *
 * `excluded` is kept for answers saved before step 1 stopped showing its
 * guess; new answers pass none.
 */
export function matchIndustries(text: unknown, excluded: string[] = []): IndustryMatch {
  const ranked = scoreIndustries(text, excluded);
  const top = ranked[0];
  const profile = top && top.score >= MIN_SCORE ? profileById(top.id) ?? null : null;

  if (!profile) {
    return {
      profiles: [],
      profile: null,
      areaIds: COMMON_AREAS,
      processIds: CURATED_PROCESS_PICKS,
      moreAreaIds: [],
      matched: false,
    };
  }

  const areaIds = [
    FIRST_AREA,
    ...[...new Set(profile.areas)].filter((id) => id !== FIRST_AREA && areaById(id)),
  ];
  const processIds = [...new Set(profile.processes)].filter((id) => processById(id));
  const moreAreaIds = FACTORY_AREAS.map((a) => a.id).filter(
    (id) => !areaIds.includes(id) && !SHOP_SPECIFIC_AREAS.includes(id)
  );
  return { profiles: [profile], profile, areaIds, processIds, moreAreaIds, matched: true };
}

/** "textile", or "" — fits "your ___ factory". */
export function shortLabels(profiles: IndustryProfile[]): string {
  const s = profiles.map((p) => p.short);
  if (s.length <= 1) return s[0] ?? "";
  return `${s.slice(0, -1).join(", ")} and ${s[s.length - 1]}`;
}
