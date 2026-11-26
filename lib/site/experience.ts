/**
 * lib/site/experience.ts — what the homepage's live hero shows.
 *
 * The homepage hero is not a photo of the product any more; it IS the
 * product. app/experience/ renders a live 360° factory tour inside a
 * presentation frame, and the marketing site frames that page in its hero.
 *
 * ┌─ SET THIS TO YOUR BEST TOUR ──────────────────────────────────────┐
 * │ DEMO_TOUR_ID is the VPV tour the hero plays, in our own viewer —   │
 * │ the real top bar, scene strip and hotspots a buyer gets. Copy the  │
 * │ id from /admin/tours (or the tour's URL, /tour/<id>), and set it   │
 * │ here or as NEXT_PUBLIC_DEMO_TOUR_ID in Vercel. The tour must be    │
 * │ public and its workspace active, or the hero shows nothing.        │
 * │                                                                    │
 * │ Until it is set, the hero plays the Kuula demo the site has always │
 * │ used further down the page, so it is never empty.                  │
 * └────────────────────────────────────────────────────────────────────┘
 */

export const DEMO_TOUR_ID: string = process.env.NEXT_PUBLIC_DEMO_TOUR_ID ?? "";

/** The first real scene of the demo collection ("Entrance"). The
 *  collection's own first post is an index/cover image; opening on it made
 *  every visitor wait for a picture and then click in. Starting here puts
 *  them inside the factory, looking around, the moment it loads. */
export const KUULA_FIRST_SCENE = "5dmM7";

/** One scene of the fallback: the site's existing Kuula demo collection,
 *  with Kuula's own thumbnails and branding off so our frame is the only
 *  chrome. No auto-advance (`autop`): it would cycle the visitor back round
 *  to the index page. */
export const kuulaSceneUrl = (code: string): string =>
  `https://kuula.co/share/${code}/collection/7cprp?logo=-1&info=0&fs=0&vr=0&sd=1&autorotate=0.6&thumbs=0&inst=0`;

/** The fallback, opened on its first real scene. */
export const KUULA_DEMO_URL = kuulaSceneUrl(KUULA_FIRST_SCENE);

/** Scenes the /experience page cycles through, in this order
 *  NOTE (Nov 2026): the homepage story no longer shows this live demo or posts
 *  scenes here. Its seven parts use pictures and a short video instead (see
 *  scripts/home-story/README.md). Only the /experience page and
 *  components/site/HeroExperience.tsx still read this list; nothing on the
 *  homepage depends on it. `code` is the scene's id in the Kuula collection. */
export const KUULA_STORY_SCENES: { code: string; name: string }[] = [
  { code: KUULA_FIRST_SCENE, name: "Entrance" },
  { code: "5dmTG", name: "Quality control" },
  { code: "5Twl3", name: "Aerial" },
  { code: "5dmT0", name: "Plasma machine" },
  { code: "5dmHs", name: "Awards" },
];

export function experienceSource(): { kind: "vpv" | "kuula"; src: string } {
  const id = DEMO_TOUR_ID.trim();
  if (/^[0-9a-f-]{36}$/i.test(id)) return { kind: "vpv", src: `/embed/${id}?autoplay=1` };
  return { kind: "kuula", src: KUULA_DEMO_URL };
}
