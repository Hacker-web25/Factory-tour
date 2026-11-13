# Home page scroll story

The home page (`/`) opens with the live 360° demo pinned on one side. As the visitor scrolls, the text beside it moves through five parts:

1. You are already investing in exhibitions and meeting buyers.
2. Converting only 3% of your leads? This part has a small calculator. It sends the same `calculator_used` event the Why VPV calculator used to send, so the calculator report keeps working.
3. Want to show your factory to international clients?
4. Don't want to share your factory with your competition?
5. How VPV helps: one answer each to parts 2–4, then the call to action.

* `src/story.ts`: markup, scroll logic and the calculator. It imports `lib/whyVpvCalc`, `lib/pricing` and `lib/analytics/client` from the app.
* `src/story.css`: styles. Esbuild inlines them into the bundle.
* Output: `public/home-story/story.js`.

The site bundle renders `<div id="home-story">` and, after it, `<div id="home-classic">` (the old hero only).
A loader in `lib/site/home.ts` mounts the story. If the script fails to load, the plain hero shows instead.

Rebuild after editing `src/`, or after changing `lib/whyVpvCalc.ts` / `lib/pricing.ts`:

```bash
cd scripts/home-story && npm install && npm run build
```
