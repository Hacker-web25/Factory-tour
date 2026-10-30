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

/** The fallback: the site's existing Kuula demo collection, opened on its
 *  first real scene, with Kuula's own thumbnails and branding off so our
 *  frame is the only chrome. No auto-advance (`autop`): it would cycle the
 *  visitor back round to the index page. */
export const KUULA_DEMO_URL =
  `https://kuula.co/share/${KUULA_FIRST_SCENE}/collection/7cprp?logo=-1&info=0&fs=0&vr=0&sd=1&autorotate=0.6&thumbs=0&inst=0`;

export function experienceSource(): { kind: "vpv" | "kuula"; src: string } {
  const id = DEMO_TOUR_ID.trim();
  if (/^[0-9a-f-]{36}$/i.test(id)) return { kind: "vpv", src: `/embed/${id}?autoplay=1` };
  return { kind: "kuula", src: KUULA_DEMO_URL };
}
