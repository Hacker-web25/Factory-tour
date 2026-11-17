# Home page scroll story

The home page (`/`) opens with the live 360° demo pinned on one side. As the visitor scrolls, the text beside it moves through five parts:

1. You are already investing in exhibitions and meeting buyers.
2. What's the cost of not giving buyers enough confidence to buy from you? This part has a small calculator (leads 100–5,000 over five years, typed or dragged; conversion 1–50%). It sends the same `calculator_used` event the Why VPV calculator used to send, so the calculator report keeps working.
3. Give international buyers the confidence to choose you.
4. Show your factory only to buyers. Keep competitors out.
5. How VPV helps: one answer each to parts 2–4, then the call to action.

* `src/story.ts`: markup, scroll logic and the calculator. It imports `lib/whyVpvCalc`, `lib/pricing` and `lib/analytics/client` from the app.
* `src/story.css`: styles. Esbuild inlines them into the bundle.
* The tour on the right changes scene with each part. `story.ts` tells `/experience` which part is showing (`postMessage`); `components/site/HeroExperience.tsx` swaps scenes, and `KUULA_STORY_SCENES` in `lib/site/experience.ts` lists them (one per part).
* Output: `public/home-story/story.js`.

The site bundle renders `<div id="home-story">` and, after it, `<div id="home-classic">` (the old hero only).
A loader in `lib/site/home.ts` mounts the story. If the script fails to load, the plain hero shows instead.

Rebuild after editing `src/`, or after changing `lib/whyVpvCalc.ts` / `lib/pricing.ts`:

```bash
cd scripts/home-story && npm install && npm run build
```
