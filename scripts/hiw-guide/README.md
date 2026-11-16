# How it works page

`/how-it-works` explains the whole of VPV on one page, in plain words:

1. **The 5 steps**: who does what (the customer does steps 1 and 2 online; our team does 3 to 5) and how long each takes.
2. **What you get**: every deliverable, each tagged with the plans that include it.
3. **Your part**: what we need from the customer, and what they never have to do.
4. **After you go live**: sharing, presenting, updating, and how renewal works.
5. **What it costs**: every charge in one line each.

It deliberately does not repeat the other pages: benefits are on Why VPV, the plan-by-plan table is on Plans, questions are on FAQ.

* `src/guide.ts`: markup and the small scroll behaviour (reveal on scroll, the sticky "on this page" bar). Every price comes from `lib/pricing.ts` and the service cities from `lib/logistics.ts`, so the page always matches the bill. The one hand-set number is the ₹500 rescheduling fee (`RESCHEDULE_INR`).
* `src/guide.css`: styles, inlined into the bundle by esbuild. Animations only run when the visitor has not asked for reduced motion.
* Output: `public/hiw-guide/guide.js`.

The site bundle renders `<div id="hiw-tour">`, then `#hiw-classic` (old hero and five step cards) and `#hiw-after` ("Before the shoot"). A loader in `lib/site/home.ts` hides those two and mounts the guide into `#hiw-tour`. If the script fails to load, the old blocks show instead.

Rebuild after editing `src/`, or after changing `lib/pricing.ts` / `lib/logistics.ts`:

```bash
cd scripts/hiw-guide && npm install && npm run build
```

This page replaced the 3D walkthrough that lived in `scripts/hiw-tour` / `public/hiw-tour` (removed 16 Nov 2026; see git history).
