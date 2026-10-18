/**
 * Every path the marketing single-page app owns.
 *
 * Plain JavaScript, not TypeScript, because next.config.js has to
 * require() it: next.config.js is read by Node before any TypeScript in
 * this project is compiled. lib/site/pages.ts imports the same list and
 * asserts that its own page records cover it exactly, so the two cannot
 * drift apart without the build failing.
 *
 * next.config.js uses it to grant the embed-friendly CSP and
 * Permissions-Policy (the site frames a Kuula demo tour and YouTube
 * testimonials) to these paths and no others.
 *
 * The /assessment paths are deliberately absent: the funnel is now real
 * app pages under app/assessment/, not screens of the single-page app.
 */

const SITE_PATHS = [
  "/",
  "/how-it-works",
  "/plans",
  "/case-studies",
  "/faq",
  "/booking",
  "/order-confirmation",
];

module.exports = { SITE_PATHS };
