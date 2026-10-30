/**
 * lib/site/demo.ts — what /demo shows.
 *
 * /demo is the public "try it yourself" page: a whole real factory tour in
 * the same viewer our customers' salespeople present with.
 *
 * ┌─ TO SHOW A DIFFERENT TOUR ─────────────────────────────────────────┐
 * │ Set NEXT_PUBLIC_DEMO_PAGE_TOUR_ID (and, if its first scenes are an  │
 * │ index/cover page, NEXT_PUBLIC_DEMO_PAGE_START_SCENE) in Vercel, or  │
 * │ change the defaults below. The tour must be PUBLIC and published,   │
 * │ and its workspace active, or the page shows "unavailable".          │
 * └─────────────────────────────────────────────────────────────────────┘
 */

/** VEE TEE AUTO (ViR) — public, 72 scenes, 270+ hotspots. */
export const DEMO_PAGE_TOUR_ID: string =
  process.env.NEXT_PUBLIC_DEMO_PAGE_TOUR_ID || "4dec91f2-4b49-457a-a8ab-7dea082ff486";

/** The first real scene (the factory gate). The tour's first two scenes are
 *  index pages; the demo opens past them, straight into the factory. */
export const DEMO_PAGE_START_SCENE: string | null =
  process.env.NEXT_PUBLIC_DEMO_PAGE_START_SCENE ||
  (DEMO_PAGE_TOUR_ID === "4dec91f2-4b49-457a-a8ab-7dea082ff486" ? "52d03b3f-28cf-40ae-8098-1f9fb4758485" : null);
