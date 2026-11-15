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
 * Areas and processes that belong to particular industries — a ring
 * spinning section, a tube mill, a frying line, a clean room. They are not
 * in the general grids above (a car-parts maker should not scroll past
 * "Weaving Shed"); they appear in the "Picked for your factory" section on
 * step 2 when the buyer's answer to "what does your factory make?" points
 * to that industry. See lib/industryProfiles.ts.
 *
 * The list was built from the plant and infrastructure pages of real
 * Indian manufacturers and from plant set-up reports, one industry at a
 * time (November 2026): the areas named there, in the words a buyer
 * would recognise on a visit.
 */
export const INDUSTRY_AREAS: CatalogueItem[] = [
  // ── Textiles ──────────────────────────────────────────────────────
  { id: "spinning-department", name: "Spinning Department", description: "Blow room, carding and ring frames", icon: "Wind" },
  { id: "blow-room-carding", name: "Blow Room & Carding", description: "Fibre opened, cleaned and carded", icon: "Wind" },
  { id: "drawing-combing", name: "Drawing, Combing & Simplex", description: "Slivers drawn, combed and roved", icon: "Waves" },
  { id: "ring-spinning", name: "Ring Spinning Section", description: "Ring frames spinning the yarn", icon: "RotateCw" },
  { id: "cone-winding", name: "Cone Winding (Autoconer)", description: "Yarn cleared and wound onto cones", icon: "Disc" },
  { id: "yarn-conditioning", name: "Yarn Conditioning & Packing", description: "Cones conditioned, checked and packed", icon: "Package" },
  { id: "ginning-hall", name: "Ginning Hall", description: "Gins separating lint from cotton seed", icon: "Wind" },
  { id: "bale-press", name: "Bale Pressing", description: "Lint pressed into bales", icon: "Package" },
  { id: "warping-sizing", name: "Warping & Sizing", description: "Beams prepared for the looms", icon: "Rows3" },
  { id: "weaving-shed", name: "Weaving Shed", description: "Looms turning yarn into fabric", icon: "Grid3x3" },
  { id: "knitting-section", name: "Knitting Section", description: "Circular and flat knitting machines", icon: "Shapes" },
  { id: "dyeing-processing-house", name: "Dyeing & Processing House", description: "Bleaching, dyeing and washing of fabric", icon: "Palette" },
  { id: "yarn-dyeing", name: "Yarn Dyeing", description: "Package or hank dyeing of yarn", icon: "Palette" },
  { id: "indigo-dyeing", name: "Indigo Dyeing Range", description: "Rope or slasher dyeing of denim yarn", icon: "Palette" },
  { id: "textile-printing", name: "Fabric Printing", description: "Rotary, flatbed or digital printing", icon: "Printer" },
  { id: "stenter-finishing", name: "Stenter & Finishing", description: "Fabric set, finished and heat-treated", icon: "Layers" },
  { id: "colour-lab", name: "Colour Matching Lab", description: "Shades matched and approved", icon: "Pipette" },
  { id: "fabric-inspection-area", name: "Fabric Inspection Area", description: "Fabric checked for faults before it moves on", icon: "ScanLine" },
  { id: "carpet-looms", name: "Carpet Looms & Tufting", description: "Hand-knotted, tufted or woven carpets", icon: "Grid3x3" },
  { id: "carpet-finishing", name: "Carpet Washing & Finishing", description: "Washing, shearing, binding and stretching", icon: "Waves" },
  { id: "foaming-line", name: "Foaming Line", description: "Foam blocks poured and cured", icon: "Layers" },
  // Garments, footwear and made-ups
  { id: "sampling-room", name: "Sampling Room", description: "Samples made for buyer approval", icon: "Shirt" },
  { id: "trims-store", name: "Trims & Accessories Store", description: "Buttons, zips, labels and tags", icon: "Tag" },
  { id: "cutting-section", name: "Cutting Section", description: "Material laid out and cut to pattern", icon: "Scissors" },
  { id: "stitching-floor", name: "Stitching Floor", description: "Sewing lines putting the product together", icon: "Shirt" },
  { id: "embroidery-printing", name: "Embroidery & Printing", description: "Embroidery machines and screen printing", icon: "Stamp" },
  { id: "garment-washing", name: "Garment Washing", description: "Washes and effects on finished garments", icon: "WashingMachine" },
  { id: "finishing-room", name: "Finishing Section", description: "Products pressed, trimmed, cleaned and checked", icon: "Sparkles" },
  { id: "skiving-prep", name: "Skiving & Preparation", description: "Edges skived and components prepared", icon: "Scissors" },
  { id: "lasting-section", name: "Lasting & Making", description: "Uppers lasted and soles attached", icon: "Footprints" },
  { id: "sole-moulding", name: "Sole Moulding", description: "PU, PVC, EVA or rubber soles moulded", icon: "Footprints" },
  { id: "beam-house", name: "Beam House", description: "Soaking, liming and fleshing of hides", icon: "Droplets" },
  { id: "tanning-drums", name: "Tanning Drums", description: "Hides tanned and dyed in drums", icon: "Cylinder" },
  { id: "splitting-shaving", name: "Splitting & Shaving", description: "Leather split and shaved to thickness", icon: "Scissors" },
  { id: "leather-finishing", name: "Leather Finishing", description: "Spraying, ironing and embossing", icon: "SprayCan" },
  { id: "converting-line", name: "Converting Line", description: "Machines forming pads, diapers or wipes", icon: "Workflow" },

  // ── Steel and metals ──────────────────────────────────────────────
  { id: "raw-material-yard", name: "Raw Material Yard", description: "Scrap, coal, logs, stone or bulk material in the open", icon: "Mountain" },
  { id: "melting-shop", name: "Melting Shop", description: "Furnaces melting metal", icon: "Flame" },
  { id: "continuous-caster", name: "Continuous Casting", description: "Molten steel cast into billets", icon: "Cylinder" },
  { id: "reheating-furnace", name: "Reheating Furnace", description: "Billets heated before rolling", icon: "Flame" },
  { id: "rolling-mill", name: "Rolling Mill", description: "Hot or cold rolling of steel", icon: "Cylinder" },
  { id: "cooling-bed", name: "Quenching & Cooling Bed", description: "Bars quenched, cooled and straightened", icon: "ThermometerSnowflake" },
  { id: "bundling-area", name: "Cutting, Bundling & Tagging", description: "Bars or pipes cut, counted, bundled and tagged", icon: "Boxes" },
  { id: "stock-yard", name: "Finished Stock Yard", description: "Pipes, bars, coils or slabs stacked for dispatch", icon: "SquareStack" },
  { id: "coil-yard", name: "Coil Storage Yard", description: "Steel coils received and stored", icon: "Disc" },
  { id: "slitting-line", name: "Slitting & Cut-to-Length", description: "Coils or reels slit and cut to size", icon: "Scissors" },
  { id: "tube-mill", name: "Tube Mill", description: "Strip formed and welded into pipe", icon: "Cylinder" },
  { id: "pipe-finishing", name: "Pipe Finishing", description: "Cutting, end facing, threading or socketing", icon: "Wrench" },
  { id: "hydro-testing", name: "Hydro & Pressure Testing", description: "Pipes, valves or vessels pressure-tested", icon: "Gauge" },
  { id: "ndt-lab", name: "NDT & Radiography", description: "Ultrasonic, X-ray and crack testing", icon: "ScanLine" },
  { id: "galvanizing-plant", name: "Galvanizing Plant", description: "Hot-dip zinc coating", icon: "Droplets" },
  { id: "pipe-coating", name: "Coating Line", description: "3LPE, epoxy or paint coating", icon: "Layers" },
  { id: "pickling-line", name: "Pickling Line", description: "Scale removed in acid before rolling or drawing", icon: "FlaskRound" },
  { id: "cold-rolling-mill", name: "Cold Rolling Mill", description: "Strip rolled to exact thickness", icon: "Cylinder" },
  { id: "annealing-furnace", name: "Annealing Furnace", description: "Coils or wire softened by heat", icon: "Thermometer" },
  { id: "roll-forming-line", name: "Roll Forming Line", description: "Sheets formed into roofing or profiles", icon: "Spline" },
  { id: "wire-drawing", name: "Wire Drawing", description: "Rod drawn down to wire", icon: "Cable" },
  { id: "stranding-section", name: "Stranding & Closing", description: "Wires twisted into strand, rope or conductor", icon: "Cable" },
  { id: "wire-products", name: "Wire Products Section", description: "Nails, mesh, barbed or binding wire made", icon: "Grid3x3" },
  { id: "extrusion-press", name: "Extrusion Press", description: "Billets pushed through dies into profiles", icon: "ArrowDownToLine" },
  { id: "die-shop", name: "Die Shop", description: "Dies made, corrected and maintained", icon: "Hammer" },
  { id: "ageing-oven", name: "Ageing Ovens", description: "Profiles aged for strength", icon: "Thermometer" },
  { id: "anodizing-plant", name: "Anodizing Plant", description: "Anodising and colouring of aluminium", icon: "Droplets" },
  // Foundry, casting and forging
  { id: "pattern-shop", name: "Pattern Shop", description: "Patterns and core boxes made", icon: "Shapes" },
  { id: "sand-plant", name: "Sand Plant", description: "Moulding sand prepared and tested", icon: "Mountain" },
  { id: "core-shop", name: "Core Shop", description: "Sand cores made for castings", icon: "Box" },
  { id: "moulding-section", name: "Moulding Section", description: "Sand moulds made ready for pouring", icon: "Box" },
  { id: "fettling-shop", name: "Fettling & Shot Blasting", description: "Castings trimmed, ground and blasted clean", icon: "Wind" },
  { id: "wax-room", name: "Wax Room", description: "Wax patterns made and assembled into trees", icon: "FlameKindling" },
  { id: "shell-room", name: "Shell Room", description: "Ceramic shells built by dipping", icon: "Layers" },
  { id: "die-casting-cell", name: "Die Casting Machines", description: "Pressure or gravity die casting cells", icon: "Factory" },
  { id: "billet-cutting", name: "Billet Cutting & Heating", description: "Bars cut and induction-heated", icon: "Zap" },
  { id: "forge-shop", name: "Forge Shop", description: "Hammers and presses forging hot metal", icon: "Hammer" },
  { id: "shot-blasting-area", name: "Shot Blasting", description: "Parts cleaned by shot blasting", icon: "Wind" },
  // Engineering
  { id: "press-shop", name: "Press Shop", description: "Power presses forming sheet metal", icon: "ArrowDownToLine" },
  { id: "sheet-metal-shop", name: "Sheet Metal Shop", description: "CNC punching, bending and forming", icon: "Frame" },
  { id: "profile-cutting", name: "Laser & Plasma Cutting", description: "Sheets and plates cut by CNC", icon: "Zap" },
  { id: "plate-rolling", name: "Plate Rolling & Bending", description: "Plates rolled into shells and cones", icon: "Cylinder" },
  { id: "heavy-fabrication-bay", name: "Heavy Fabrication Bay", description: "Large structures built under EOT cranes", icon: "Construction" },
  { id: "turning-section", name: "Turning Section", description: "CNC lathes, sliding heads and automats", icon: "RotateCw" },
  { id: "grinding-section", name: "Grinding Section", description: "Precision grinding to size and finish", icon: "Disc" },
  { id: "edm-section", name: "EDM & Wire Cut", description: "Spark erosion and wire cutting", icon: "Zap" },
  { id: "cold-heading", name: "Cold Heading", description: "Wire headed into bolts, screws and rivets", icon: "Bolt" },
  { id: "thread-rolling", name: "Thread Rolling", description: "Threads rolled onto blanks", icon: "RotateCw" },
  { id: "plating-line", name: "Plating & Surface Treatment", description: "Zinc, nickel, chrome or phosphate coating", icon: "Droplets" },
  { id: "sorting-inspection", name: "Sorting & Inspection", description: "Parts sorted and checked by machine or hand", icon: "ScanSearch" },
  { id: "heat-treatment-shop", name: "Heat Treatment Shop", description: "Furnaces hardening, tempering or stress relieving", icon: "Thermometer" },
  { id: "testing-bay", name: "Testing Bay", description: "Products run and tested before dispatch", icon: "Gauge" },
  { id: "metrology-room", name: "Metrology Room", description: "CMM and precision measuring instruments", icon: "Ruler" },
  { id: "body-shop", name: "Body Shop", description: "Vehicle bodies welded and built", icon: "Car" },
  { id: "laser-marking", name: "Laser Marking", description: "Codes, logos and lot numbers marked", icon: "ScanBarcode" },
  { id: "polishing-line", name: "Polishing Line", description: "Surfaces ground, polished and sized", icon: "Disc" },

  // ── Electrical and electronics ────────────────────────────────────
  { id: "component-store", name: "Component Store", description: "Reels and parts stored under control", icon: "Boxes" },
  { id: "esd-area", name: "ESD-Safe Assembly", description: "Static-protected benches and flooring", icon: "Microchip" },
  { id: "smt-line", name: "SMT Line", description: "Machines placing components on circuit boards", icon: "CircuitBoard" },
  { id: "tht-soldering", name: "Through-hole & Wave Soldering", description: "Manual insertion, wave and selective soldering", icon: "Zap" },
  { id: "burn-in-room", name: "Ageing & Burn-in Room", description: "Products run for hours before dispatch", icon: "Timer" },
  { id: "calibration-lab", name: "Calibration & Test Lab", description: "Instruments calibrated and products verified", icon: "SlidersHorizontal" },
  { id: "photometry-lab", name: "Photometry Lab", description: "Light output and colour measured", icon: "Lamp" },
  { id: "cutting-crimping", name: "Cutting & Crimping", description: "Wires cut, stripped and crimped", icon: "Scissors" },
  { id: "cable-extrusion", name: "Insulation & Sheathing", description: "Extruders insulating and sheathing cable", icon: "Cable" },
  { id: "armouring-section", name: "Armouring Section", description: "Steel wire or strip armour applied", icon: "Layers3" },
  { id: "hv-test-lab", name: "High Voltage Test Lab", description: "Routine and type tests at high voltage", icon: "Zap" },
  { id: "drum-yard", name: "Drum Yard", description: "Finished cable wound on drums", icon: "Disc" },
  { id: "winding-section", name: "Winding Section", description: "Coils for transformers and motors wound", icon: "Cable" },
  { id: "core-cutting", name: "Core Cutting & Stacking", description: "CRGO laminations cut and stacked", icon: "Layers3" },
  { id: "drying-oven", name: "Drying Oven", description: "Windings dried under vacuum or vapour phase", icon: "Heater" },
  { id: "tanking-oil-filling", name: "Tanking & Oil Filling", description: "Active part tanked and filled with oil", icon: "Droplet" },
  { id: "varnish-impregnation", name: "Varnish Impregnation", description: "Windings dipped and baked in varnish", icon: "Droplets" },
  { id: "panel-wiring", name: "Panel Assembly & Wiring", description: "Switchgear mounted, wired and labelled", icon: "Plug" },
  { id: "grid-casting", name: "Grid Casting", description: "Lead grids cast for battery plates", icon: "Grid3x3" },
  { id: "paste-mixing", name: "Oxide & Paste Mixing", description: "Lead oxide mixed into paste", icon: "Blend" },
  { id: "plate-pasting-curing", name: "Plate Pasting & Curing", description: "Plates pasted and cured", icon: "Layers" },
  { id: "formation-area", name: "Formation & Charging", description: "Batteries charged for the first time", icon: "BatteryCharging" },
  { id: "cell-testing", name: "Cell Testing & Grading", description: "Cells checked, graded and matched", icon: "Battery" },
  { id: "tabber-stringer", name: "Tabbing & Stringing", description: "Solar cells soldered into strings", icon: "Sun" },
  { id: "layup-laminator", name: "Lay-up & Lamination", description: "Strings laid up and laminated", icon: "Layers" },
  { id: "module-framing", name: "Framing & Junction Box", description: "Frames and junction boxes fitted", icon: "Frame" },
  { id: "module-testing", name: "EL & Sun Simulator Testing", description: "Every module flash-tested and imaged", icon: "Sun" },

  // ── Plastics and rubber ───────────────────────────────────────────
  { id: "compounding-section", name: "Compounding & Mixing", description: "Resin, additives and colour mixed", icon: "Blend" },
  { id: "moulding-shop", name: "Moulding Machine Hall", description: "Injection or blow moulding machines at work", icon: "Factory" },
  { id: "extrusion-line", name: "Extrusion Line", description: "Pipes, profiles, tape or film being extruded", icon: "Spline" },
  { id: "mould-store", name: "Mould Storage", description: "Moulds stored, tagged and maintained", icon: "Box" },
  { id: "lamination-section", name: "Lamination", description: "Films, foils or boards laminated", icon: "Layers" },
  { id: "pouch-making", name: "Pouch & Bag Making", description: "Pouches, bags and sacks converted", icon: "ShoppingBag" },
  { id: "rubber-mixing", name: "Rubber Mixing", description: "Kneaders and mixing mills compounding rubber", icon: "Blend" },
  { id: "rubber-moulding", name: "Rubber Moulding Presses", description: "Compression, transfer or injection moulding", icon: "Factory" },
  { id: "deflashing", name: "Deflashing & Trimming", description: "Flash removed and parts trimmed", icon: "Scissors" },
  { id: "calendering", name: "Calendering", description: "Rubber sheeted and coated onto fabric", icon: "Cylinder" },
  { id: "tyre-building", name: "Tyre Building", description: "Green tyres built up", icon: "CircleDot" },
  { id: "curing-presses", name: "Curing Presses", description: "Tyres or rubber parts cured", icon: "Flame" },
  { id: "shredding-washing", name: "Shredding & Washing", description: "Scrap shredded, washed and dried", icon: "Recycle" },

  // ── Pharma and healthcare ─────────────────────────────────────────
  { id: "dispensing-area", name: "Dispensing Area", description: "Materials weighed under a booth", icon: "Scale" },
  { id: "clean-room", name: "Clean Room", description: "Controlled, filtered area for sterile work", icon: "Shield" },
  { id: "granulation-compression", name: "Granulation & Compression", description: "Where powder becomes tablets", icon: "Pill" },
  { id: "tablet-coating", name: "Tablet Coating", description: "Tablets film- or sugar-coated", icon: "Pill" },
  { id: "capsule-section", name: "Capsule Section", description: "Capsules filled and polished", icon: "Pill" },
  { id: "liquid-orals", name: "Liquid Orals Section", description: "Syrups and suspensions made and filled", icon: "TestTube" },
  { id: "ointment-section", name: "Ointment & Cream Section", description: "Creams, gels and ointments made and tube-filled", icon: "Droplet" },
  { id: "aseptic-filling", name: "Aseptic Filling", description: "Vials or ampoules filled under Grade A", icon: "Syringe" },
  { id: "primary-packing", name: "Blister & Strip Packing", description: "Tablets and capsules packed", icon: "PackageCheck" },
  { id: "hvac-room", name: "HVAC & AHU Room", description: "Air handling for the clean areas", icon: "Fan" },
  { id: "microbiology-lab", name: "Microbiology Lab", description: "Sterility and microbial testing", icon: "Microscope" },
  { id: "sterilisation-area", name: "Sterilisation Area", description: "Autoclave, EtO or gamma sterilisation", icon: "Thermometer" },
  { id: "centrifuge-drying", name: "Centrifuge & Drying", description: "Product separated and dried", icon: "RotateCw" },
  { id: "solvent-recovery", name: "Solvent Recovery", description: "Solvents distilled and reused", icon: "Recycle" },
  { id: "pilot-plant", name: "Pilot Plant / Kilo Lab", description: "Small batches and scale-up", icon: "Beaker" },
  { id: "herb-store", name: "Raw Herb Store", description: "Herbs received, identified and stored", icon: "Leaf" },
  { id: "extraction-plant", name: "Extraction Plant", description: "Herbs or spices extracted and concentrated", icon: "TestTubes" },
  { id: "fermentation-vats", name: "Fermentation Area", description: "Asava, arishta, wash or cultures fermented", icon: "FlaskRound" },
  { id: "oil-ghrita-section", name: "Oil & Ghrita Section", description: "Medicated oils and ghee prepared", icon: "Droplet" },
  { id: "passivation-cleaning", name: "Passivation & Ultrasonic Cleaning", description: "Parts cleaned and passivated", icon: "Waves" },

  // ── Chemicals ─────────────────────────────────────────────────────
  { id: "reactor-plant", name: "Reactor Plant", description: "Reactors where each batch is made", icon: "FlaskRound" },
  { id: "distillation-unit", name: "Distillation Columns", description: "Products purified by distillation", icon: "Cylinder" },
  { id: "control-room", name: "Control Room (DCS)", description: "The plant run and monitored", icon: "Monitor" },
  { id: "tank-farm", name: "Tank Farm", description: "Bulk storage tanks for liquids", icon: "Cylinder" },
  { id: "drum-filling-area", name: "Filling Area", description: "Drums, cans or bags filled and sealed", icon: "Container" },
  { id: "premix-dispersion", name: "Pre-mix & Dispersion", description: "High-speed dispersers", icon: "Blend" },
  { id: "bead-mill", name: "Bead Mill Section", description: "Pigments ground to fineness", icon: "Disc" },
  { id: "formulation-plant", name: "Formulation Plant", description: "EC, SC, WP or granule formulations", icon: "Beaker" },
  { id: "granulation-plant", name: "Granulation Plant", description: "Fertiliser or feed granulated", icon: "Bean" },
  { id: "mixing-vessels", name: "Mixing & Manufacturing Vessels", description: "Batches mixed in jacketed vessels", icon: "CookingPot" },
  { id: "filling-line", name: "Filling & Capping Line", description: "Bottles, tubes, pouches or jars filled and sealed", icon: "CupSoda" },
  { id: "soap-plant", name: "Soap Plant", description: "Soap mixed, plodded and stamped", icon: "Bath" },
  { id: "spray-dryer", name: "Spray Drying Tower", description: "Liquids or slurries dried into powder", icon: "Wind" },
  { id: "bagging-plant", name: "Bagging Plant", description: "Bags filled, weighed and stitched", icon: "Package" },

  // ── Food and beverages ────────────────────────────────────────────
  { id: "hygiene-zone", name: "Hygiene Entry Zone", description: "Hand wash, changing and air curtain", icon: "Droplet" },
  { id: "processing-line", name: "Processing Line", description: "Where raw material becomes product", icon: "Workflow" },
  { id: "cold-storage", name: "Cold Storage", description: "Chilled and frozen storage", icon: "Snowflake" },
  { id: "storage-silos", name: "Storage Silos", description: "Grain, flour, seed, resin or cement in silos", icon: "Cylinder" },
  { id: "cleaning-sorting-area", name: "Cleaning & Sorting", description: "Raw material cleaned, graded and sorted", icon: "Filter" },
  { id: "dough-mixing", name: "Dough Mixing", description: "Dough or batter mixed and kneaded", icon: "Wheat" },
  { id: "frying-line", name: "Frying Line", description: "Continuous fryers", icon: "Flame" },
  { id: "seasoning-section", name: "Seasoning & Flavouring", description: "Seasoning applied and mixed", icon: "Soup" },
  { id: "forming-line", name: "Sheeting & Moulding Line", description: "Dough sheeted, cut or moulded", icon: "Cookie" },
  { id: "baking-oven", name: "Baking Oven", description: "Tunnel oven baking the product", icon: "Croissant" },
  { id: "cooling-tunnel", name: "Cooling Tunnel", description: "Products cooled before packing", icon: "Snowflake" },
  { id: "milk-reception", name: "Milk Reception & Chilling", description: "Milk tested, chilled and stored in silos", icon: "Milk" },
  { id: "pasteuriser-section", name: "Pasteurisation", description: "Product heated and held to make it safe", icon: "Thermometer" },
  { id: "cip-system", name: "CIP System", description: "Tanks and lines cleaned in place", icon: "Droplets" },
  { id: "ghee-butter-section", name: "Ghee & Butter Section", description: "Butter churned and ghee clarified", icon: "Droplet" },
  { id: "paneer-curd-section", name: "Paneer, Curd & Cheese", description: "Paneer pressed and curd set", icon: "Milk" },
  { id: "bottling-hall", name: "Bottling Hall", description: "Bottles rinsed, filled, capped and labelled", icon: "GlassWater" },
  { id: "syrup-room", name: "Syrup & Blending Room", description: "Syrups, concentrates and blends prepared", icon: "Citrus" },
  { id: "steam-sterilisation", name: "Steam Sterilisation", description: "Spices and herbs steam-sterilised", icon: "Thermometer" },
  { id: "grinding-mill", name: "Grinding Mill", description: "Pulverisers, chakkis and grinding lines", icon: "Cog" },
  { id: "blending-section", name: "Blending Section", description: "Powders mixed to recipe", icon: "Blend" },
  { id: "roasting-section", name: "Roasting Section", description: "Coffee, nuts, seeds or spices roasted", icon: "FlameKindling" },
  { id: "expeller-section", name: "Expeller Section", description: "Seeds pressed for oil", icon: "Droplet" },
  { id: "oil-refinery", name: "Oil Refinery", description: "Degumming, bleaching and deodorising", icon: "Droplets" },
  { id: "parboiling-plant", name: "Parboiling & Drying", description: "Paddy soaked, steamed and dried", icon: "Waves" },
  { id: "milling-plant", name: "Milling Plant", description: "Husking, splitting and polishing", icon: "Wheat" },
  { id: "colour-sorting", name: "Colour Sorting & Grading", description: "Grains, seeds or leaf sorted by colour and size", icon: "ScanLine" },
  { id: "roller-mill", name: "Roller Mill & Plansifters", description: "Wheat milled and sieved", icon: "Wheat" },
  { id: "chocolate-line", name: "Chocolate Refining & Conching", description: "Mass refined, conched and tempered", icon: "CakeSlice" },
  { id: "moulding-enrobing", name: "Moulding & Enrobing", description: "Products moulded or coated", icon: "Candy" },
  { id: "wrapping-section", name: "Wrapping & Flow Pack", description: "Pieces wrapped and packed", icon: "Gift" },
  { id: "chilled-receiving", name: "Chilled Receiving", description: "Raw material received and held on ice", icon: "ThermometerSnowflake" },
  { id: "pre-processing-hall", name: "Pre-processing Hall", description: "Peeling, cleaning, cutting and grading", icon: "Fish" },
  { id: "iqf-freezer", name: "IQF & Blast Freezing", description: "Products frozen fast", icon: "Snowflake" },
  { id: "ice-plant", name: "Flake Ice Plant", description: "Ice for chilling raw material", icon: "Snowflake" },
  { id: "pulping-section", name: "Pulping Section", description: "Fruit washed, crushed and pulped", icon: "Apple" },
  { id: "withering-section", name: "Withering Section", description: "Green leaf withered on troughs", icon: "Leaf" },
  { id: "rolling-ctc", name: "Rolling / CTC", description: "Leaf rolled, or cut, torn and curled", icon: "RotateCw" },
  { id: "fermenting-room", name: "Fermenting Room", description: "Leaf oxidised for colour and taste", icon: "Timer" },
  { id: "dryer-section", name: "Dryer Section", description: "Product dried to the right moisture", icon: "Heater" },
  { id: "tasting-room", name: "Tasting Room", description: "Batches tasted and graded", icon: "Coffee" },
  { id: "shelling-peeling", name: "Shelling & Peeling", description: "Nuts shelled, peeled and graded", icon: "Nut" },
  { id: "pellet-mill", name: "Pelleting Line", description: "Feed conditioned and pelleted", icon: "Bean" },

  // ── Packaging, paper and printing ─────────────────────────────────
  { id: "reel-store", name: "Paper Reel Store", description: "Paper reels received and stored", icon: "Scroll" },
  { id: "corrugation-plant", name: "Corrugation Plant", description: "Corrugated board made", icon: "Box" },
  { id: "pre-press", name: "Pre-press & Plate Making", description: "Artwork, proofs and plates", icon: "Newspaper" },
  { id: "printing-section", name: "Printing Section", description: "Printing presses and colour matching", icon: "Printer" },
  { id: "die-cutting-section", name: "Die Cutting & Creasing", description: "Sheets die-cut and creased", icon: "Scissors" },
  { id: "folder-gluer", name: "Folding, Gluing & Stitching", description: "Cartons and boxes folded and joined", icon: "Box" },
  { id: "pulping-plant", name: "Pulping & Stock Preparation", description: "Waste paper or pulp prepared", icon: "Recycle" },
  { id: "paper-machine", name: "Paper Machine", description: "Sheet formed, pressed and dried", icon: "Scroll" },

  // ── Wood and furniture ────────────────────────────────────────────
  { id: "timber-yard", name: "Timber Yard & Seasoning", description: "Timber stored and kiln-seasoned", icon: "TreePine" },
  { id: "panel-processing", name: "Panel Processing", description: "Boards cut, edge-banded and drilled", icon: "Armchair" },
  { id: "upholstery-section", name: "Upholstery Section", description: "Foam, fabric and leather fitted", icon: "Sofa" },
  { id: "handwork-section", name: "Hand Work & Carving", description: "Carving, inlay and hand finishing", icon: "Paintbrush" },
  { id: "peeling-section", name: "Peeling & Veneer", description: "Logs peeled into veneer", icon: "Axe" },
  { id: "hot-press", name: "Hot Press", description: "Plywood, boards or laminates pressed", icon: "SquareStack" },
  { id: "sanding-calibration", name: "Sanding & Calibration", description: "Boards sanded to exact thickness", icon: "Ruler" },
  { id: "impregnation-line", name: "Impregnation Line", description: "Décor paper resin-impregnated", icon: "Droplets" },
  { id: "cad-studio", name: "CAD Design Studio", description: "Designs drawn and 3D-modelled", icon: "Monitor" },
  { id: "showroom", name: "Showroom", description: "Products displayed for buyers", icon: "Store" },

  // ── Ceramics, glass and building materials ────────────────────────
  { id: "ball-mill-section", name: "Ball Mills & Slip House", description: "Raw materials ground wet into slip", icon: "Cylinder" },
  { id: "forming-press", name: "Hydraulic Press Section", description: "Powder or blanks pressed into shape", icon: "ArrowDownToLine" },
  { id: "glazing-line", name: "Glazing Line", description: "Glaze, design and digital print applied", icon: "SprayCan" },
  { id: "kiln-area", name: "Kiln", description: "Firing tiles, sanitaryware, pottery or bricks", icon: "Flame" },
  { id: "plaster-mould-shop", name: "Plaster Mould Shop", description: "Moulds made for slip casting", icon: "Shapes" },
  { id: "slip-casting", name: "Casting Section", description: "Slip cast into moulds", icon: "Bath" },
  { id: "crusher-plant", name: "Crushing Plant", description: "Rock or limestone crushed", icon: "Pickaxe" },
  { id: "rotary-kiln", name: "Rotary Kiln & Preheater", description: "Clinker burnt in the kiln", icon: "Flame" },
  { id: "batch-house", name: "Batch House", description: "Raw materials weighed and mixed", icon: "Scale" },
  { id: "glass-furnace", name: "Glass Furnace", description: "Batch melted into glass", icon: "Flame" },
  { id: "forming-machines", name: "Forming Machines", description: "Glass blown or pressed into shape", icon: "GlassWater" },
  { id: "annealing-lehr", name: "Annealing Lehr", description: "Glass cooled slowly to remove stress", icon: "Thermometer" },
  { id: "glass-processing", name: "Cutting & Toughening", description: "Flat glass cut, edged and toughened", icon: "Scissors" },
  { id: "gang-saw", name: "Block Cutting", description: "Gang saws and cutters slicing blocks", icon: "Pickaxe" },
  { id: "resin-line", name: "Resin & Epoxy Line", description: "Slabs resined and cured", icon: "Droplets" },
  { id: "batching-plant", name: "Batching & Mixing Plant", description: "Concrete or mix batched", icon: "Blend" },
  { id: "block-moulding", name: "Moulding & Casting", description: "Blocks, pavers or pipes cast", icon: "BrickWall" },
  { id: "curing-area", name: "Curing Area / Autoclave", description: "Products cured by steam or water", icon: "Thermometer" },

  // ── Jewellery and gems ────────────────────────────────────────────
  { id: "bench-work", name: "Bench Work", description: "Filing, soldering and assembly", icon: "Wrench" },
  { id: "polishing-setting", name: "Polishing & Setting", description: "Stones set and pieces polished", icon: "Gem" },
  { id: "strong-room", name: "Strong Room / Vault", description: "Secure storage of metal and stones", icon: "Shield" },
  { id: "diamond-planning", name: "Planning & Laser Sawing", description: "Rough planned, marked and sawn", icon: "Diamond" },
  { id: "diamond-polishing", name: "Diamond Polishing", description: "Facets cut and polished", icon: "Gem" },
  { id: "grading-lab", name: "Grading Lab", description: "Stones graded and certified", icon: "Microscope" },
  { id: "growing-reactors", name: "Growing Reactors", description: "CVD or HPHT diamond growing", icon: "Atom" },
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
  { id: "tube-welding", name: "Tube Forming and Welding", icon: "Cylinder" },
  { id: "wire-drawing-process", name: "Wire Drawing", icon: "Cable" },
  { id: "galvanizing", name: "Galvanizing", icon: "Droplets" },
  { id: "plating", name: "Plating", icon: "Droplets" },
  { id: "hydro-testing-process", name: "Hydro Testing", icon: "Gauge" },
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
  { id: "frying", name: "Frying", icon: "Flame" },
  { id: "baking", name: "Baking", icon: "Croissant" },
  { id: "pasteurising", name: "Pasteurising", icon: "Thermometer" },
  { id: "freezing", name: "Freezing", icon: "Snowflake" },
  { id: "milling-grinding", name: "Milling and Grinding", icon: "Wheat" },
  { id: "roasting", name: "Roasting", icon: "FlameKindling" },
  { id: "sorting-grading", name: "Sorting and Grading", icon: "Filter" },
  { id: "tanning", name: "Tanning", icon: "Droplet" },
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

/**
 * General areas that only make sense on certain kinds of shop floor. They
 * stay out of a matched industry's "More areas" list unless that industry
 * picked them itself — a food plant is never offered a foundry or a CNC
 * section. With no industry matched, every general area shows.
 */
export const SHOP_SPECIFIC_AREAS = [
  "cnc-machining-area",
  "foundry-casting-area",
  "welding-fabrication-area",
  "paint-coating-area",
  "tool-room",
  "assembly-area",
  "inspection-area",
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
/**
 * When we have no list for what a factory makes (step 1's answer matched no
 * industry), step 2 asks them to add their own areas and offers only these
 * few that every plant has, rather than the whole catalogue.
 */
export const COMMON_AREAS = [
  "factory-exterior",
  "manufacturing-production-area",
  "quality-control-area",
  "rm-warehouse",
  "fg-warehouse",
  "packaging-area",
  "loading-unloading-area",
  "dispatch-area",
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
