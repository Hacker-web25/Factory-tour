/**
 * lib/site/demo.ts — what /demo shows.
 *
 * /demo is the public "try it yourself" page: a real factory tour in the
 * same viewer our customers' salespeople present with.
 *
 * It is a SHORT, light cut of the tour: twelve hand-picked scenes, named,
 * in walking order, with no index pages. Their panoramas are pre-shrunk
 * copies served by this site (public/demo/vee-tee/): ~1.1 MB each at
 * 6144 px for computers, ~0.6 MB at 4096 px for phones, plus 10 KB
 * thumbnails for the scene strip. The full tour's originals are 6528 px
 * JPEGs of 1.2–2.3 MB each, and the strip used to fetch all 72 of them.
 * Serving the copies from the site also keeps demo traffic off the
 * Supabase storage allowance.
 *
 * To change the scenes: add/remove rows below and put the matching files in
 * public/demo/vee-tee/ (see scripts in the PR that added this). Hotspots and
 * information icons come live from the tour; navigation hotspots that point
 * at a scene not in this list are hidden by the player automatically.
 */

/** VEE TEE AUTO (ViR) — public tour. */
export const DEMO_PAGE_TOUR_ID = "4dec91f2-4b49-457a-a8ab-7dea082ff486";

export type DemoScene = { id: string; name: string; file: string };

/** The demo's scenes, in the order a buyer would walk them. */
export const DEMO_SCENES: DemoScene[] = [
  { id: "52d03b3f-28cf-40ae-8098-1f9fb4758485", name: "Factory gate", file: "02" },
  { id: "2050b7aa-b6f7-41e6-b4a1-220dc6f0a9b6", name: "Entrance", file: "03" },
  { id: "4b3fee0d-9885-4d9e-a63c-b9c68b5ee3fb", name: "CNC machining", file: "31" },
  { id: "80b4566f-6bd6-4035-a02f-0646843c4c57", name: "Vertical machining centre", file: "34" },
  { id: "4096b43a-a54a-4ef9-b2b2-7e143fd731e1", name: "Heat treatment", file: "40" },
  { id: "aa102739-96cc-4b79-8fff-6c676464a8c2", name: "Automatic phosphate plant", file: "25" },
  { id: "64cc9506-7eb6-45d5-a360-5080e1d98a88", name: "Paint shop", file: "23" },
  { id: "c1f37524-514e-43b3-be99-89781a8df91f", name: "Assembly area", file: "20" },
  { id: "8e031b8c-90cd-4ff9-8c71-0838f1018652", name: "Laboratory", file: "54" },
  { id: "63d835d0-fa46-4c97-97d4-95761e203fad", name: "Store", file: "48" },
  { id: "3a7dfece-499c-4d9e-946f-48d05d38d15c", name: "Warehouse", file: "70" },
  { id: "a3f2da5e-7d29-4886-b7b0-a6d29716e9b5", name: "Core team", file: "12" },
];

const DIR = "/demo/vee-tee";

/** Phones and small tablets get the 4096 px copy: half the download, and
 *  it fits every phone GPU's texture limit. Computers get 6144 px. */
export function demoPanoramaPath(file: string, small: boolean): string {
  return `${DIR}/${file}-${small ? "4k" : "6k"}.webp`;
}

export function demoThumbPath(file: string): string {
  return `${DIR}/${file}-thumb.webp`;
}
