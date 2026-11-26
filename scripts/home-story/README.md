# Home page scroll story

The home page (`/`) is a pinned scroll story. The text sits on the left and a picture or small animation sits on the right. As the visitor scrolls (wheel, touch, keys), it moves through seven parts. The live 360° demo is **not** on the home page any more: analytics from the QR, pamphlet and phone campaigns showed about 9 in 10 visitors left after 1–2 minutes of playing with it. The demo is still one click away (`/demo`, the header "Demo" link, and a link in part 6).

| # | id | Left | Right |
|---|----|------|-------|
| 1 | `problem` | You meet hundreds of buyers at exhibitions, worth crores, yet conversion is low | Exhibition photo with two chips |
| 2 | `trust` | Videos, brochures and video calls don't build enough trust | Three "trust" meters |
| 3 | `cost` | How much is it costing you? The calculator (leads 100–5,000 over five years; conversion 1–50%) | Table of four example factories: small, medium, large, mega. Clicking a row loads it into the calculator |
| 4 | `proof` | Mr. Anuj Anand's case study, two lines | His video in a compact card (autoplays muted, "Tap for sound"), the company-logo collage below, then a button to the case studies |
| 5 | `solution` | VPV, your virtual factory tour. Show it only to buyers, keep competitors out; the four feature slide | Buyer on a tablet, with "link opened" and "competitor blocked" chips |
| 6 | `how` | How it works | Three-step flow |
| 7 | `order` | Order now in 5 simple steps | The five steps and a button to `/plans` |

## Files

* `src/data.ts`: the numbers and words that are easy to change. No DOM and no CSS. `FACTORIES` (leads, order value in lakh, conversion), `PROOF` (YouTube id and the client's name), `CASE_STUDIES_BUTTON` (placeholder wording), `ORDER_STEPS` (word for word from the How it works guide, `scripts/hiw-guide/src/guide.ts`).
* `src/story.ts`: markup, scroll logic, the calculator, the video. It imports `lib/whyVpvCalc`, `lib/pricing` and `lib/analytics/client` from the app. The calculator and scroll mechanics are unchanged from the earlier story; `setActive` flips both the text part and the picture part.
* `src/story.css`: styles. Esbuild inlines them into the bundle. Motion is transform and opacity only, and only inside `prefers-reduced-motion: no-preference`.
* Output: `public/home-story/story.js`.
* Pictures: `public/img/home-expo-tablet*.webp` and `home-buyer-tablet*.webp`.

## Behaviour worth knowing

* **Table numbers are illustrative.** The table says so ("Illustrative examples"), and every figure is computed with the calculator's own formula, so a row and the calculator never disagree.
* **Video.** Browsers block autoplay with sound, so it starts muted and the "Tap for sound" button reloads it with `mute=0` from the current second. It plays only while part 4 is on screen. A transparent guard over the iframe lets the page keep scrolling over the video; a click unlocks the player and leaving it relocks.
* **Analytics.** `section_view` (once per part, `section: "home-<id>"`), `video_play`, and `calculator_used` (the same event the Why VPV calculator sends, so the calculator report keeps working). All three are in the allowlist in `lib/analytics/signals.ts`.
* **Phones.** The picture strip sits on top (38svh) and the text below; `fitPart()` shrinks the text or zooms the picture so each part fits.
* The old "international buyers" and "How VPV helps" parts were dropped from the story. They remain on `/why-vpv`.

The site bundle renders `<div id="home-story">` and, after it, `<div id="home-classic">` (the old hero only). A loader in `lib/site/home.ts` mounts the story. If the script fails to load, the plain hero shows instead.

Rebuild after editing `src/`, or after changing `lib/whyVpvCalc.ts` / `lib/pricing.ts`:

```bash
cd scripts/home-story && npm install && npm run build
```

`tests/billing/45-home-story.test.ts` guards the copy, the seven parts, the links and the numbers.
