# Design reference — the scene ladder pages

The marketing site on myvpv.com is now the single-page app in
`/public/static` (see `lib/site/pages.ts`). The pages below came before
it. They are **kept on purpose**, for two reasons.

## 1. They are the design reference

The scene calculator is the piece worth reusing. When the site is
rebuilt, these are the files to copy the behaviour from:

| What | Where |
|---|---|
| The slider itself, and the number that falls as you drag right | `components/billing/SceneCalculator.tsx` |
| The ladder table, the three-plan comparison, the pricing FAQ | `app/pricing/page.tsx` |
| The marginal price bands behind it | `SCENE_PRICE_LADDER` in `lib/pricing.ts` |
| The same idea applied to an upgrade | `components/billing/UpgradeChrome.tsx` |

What makes the slider work is that the **price per scene visibly falls**
as the pack grows, and that number is set in the largest type on the
page. The bands are marginal, not a flat rate: scene 1 costs ₹5,000,
scenes 2–3 are ₹4,000 each, and so on down to ₹1,999. Dragging right
always feels like a better deal, which is the whole point.

## 2. They are still live, and the Terms point at them

`/terms` names the Pricing page three times as where the current prices
are ("Current prices are on the Pricing page"). So `/pricing` cannot
simply be deleted or hidden — the Terms would be pointing at nothing.

`/pricing` and `/get-started` also remain the **working** way to buy a
Basic licence by the scene ladder, which is the path with real prices
behind it today.

## What to do when the plan prices are final

Right now there are two public price surfaces saying different things:

- `/plans` — the new site. VPV Confidence / Authority / Control, at
  ₹49,000 / ₹99,000 / ₹1,99,000, each shown with a "Placeholder price,
  to be confirmed" badge.
- `/pricing` — the scene ladder, ₹9,000 to ₹54,995, real and charged.

Once the plan prices are settled:

1. Set the real figures in `SITE_PLANS` in `lib/pricing.ts` and turn
   `PLACEHOLDER_PRICES` off. Until that flag is off, the order route
   refuses these plans on live Razorpay keys, so a placeholder can never
   reach a card.
2. Decide which page the Terms should point at, and edit `/terms` to
   match. If the plans become the only product, `/pricing` becomes a
   reference page: take it out of `COMPANY_LINKS` in
   `components/legal/nav.ts` and mark it `robots: noindex`.
3. Keep `SceneCalculator.tsx` either way. It is the design reference,
   and the scene ladder still prices every top-up.
