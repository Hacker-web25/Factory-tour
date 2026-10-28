/** @type {import('next').NextConfig} */

// Every path the marketing single-page app owns. Shared with
// lib/site/pages.ts, which fails the build if the two disagree.
const { SITE_PATHS } = require("./lib/site/paths");

// The exact Supabase host of THIS project (e.g. abcd1234.supabase.co), taken from the same env var
// the app itself uses. A wildcard like *.supabase.co would let a script-injection bug load code
// from, or send data to, ANY Supabase project in the world - including an attacker's free one.
// If the variable is missing or unparsable (e.g. a bare local build) we fall back to the wildcard
// rather than break the site.
let SUPABASE_HOST = "*.supabase.co";
try {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const h = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host;
    if (h && /^[a-z0-9.-]+$/i.test(h)) SUPABASE_HOST = h;
  }
} catch {
  /* keep the wildcard */
}

// Swap the wildcard in the policy below for this project's exact host (no-op if we could not
// work it out). The directives stay plain quoted strings on purpose: tests/billing/18 reads them
// straight from this file to make sure the analytics tags are never accidentally blocked.
const pinSupabaseHost = (directive) => directive.split("*.supabase.co").join(SUPABASE_HOST);

/**
 * Site-wide security headers. These apply to every response — the
 * middleware adds a few more on auth-sensitive paths (no-store cache,
 * strict referrer).
 *
 * CSP is explicit about every outbound origin we actually use:
 *   - Supabase (project + wss realtime)
 *   - YouTube iframes + thumbnails
 *   - Google Fonts
 *   - Resend (for the email alert API)
 *   - Our own CDN (myvpv.com for the logo mark + OG image)
 *
 * `frame-ancestors` is set to self + *.myvpv.com so clients can embed
 * their share-pages on their OWN sites but no attacker can iframe the
 * dashboard for click-jacking.
 */
const securityHeaders = [
  // Enforce HTTPS forever — browsers never try HTTP after first visit.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Lock down ambient APIs we don't use. Camera + mic kept open for
  // the presenter recorder; screen capture kept for the presenter
  // workflow; geolocation is kept for OUR pages only because
  // lib/presentationSession.ts records where a sales meeting took place
  // (the browser still asks the presenter first; embedded third-party
  // frames can never ask). usb is not used anywhere.
  {
    key: "Permissions-Policy",
    value: [
      "geolocation=(self)",
      "camera=(self)",
      "microphone=(self)",
      "payment=(self \"https://checkout.razorpay.com\")",
      "usb=()",
      "autoplay=(self)",
      "display-capture=(self)",
      "accelerometer=()",
      "gyroscope=()",
      "magnetometer=()",
      "midi=()",
      "serial=()",
      "fullscreen=(self)",
    ].join(", "),
  },
  // Opt out of the legacy XSS auditor (it causes more problems than
  // it solves, and modern Chrome has removed it anyway).
  { key: "X-XSS-Protection", value: "0" },
  // Belt-and-braces frame protection in addition to CSP's
  // frame-ancestors. X-Frame-Options doesn't understand wildcards, so
  // SAMEORIGIN covers the dashboard; CSP handles the embed case.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Belt-and-braces for Edge DNS prefetch
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // CORP — same-site resources only unless we say otherwise. Keeps our
  // JS bundles from being pulled by other origins.
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
  // COOP — isolate our window from any pop-ups a hostile origin opens.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Analytics: Google Analytics 4 and Microsoft Clarity, per each
      // vendor's own CSP guide. Without these the browser blocks both tags
      // silently and the dashboards stay empty.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.supabase.co https://www.youtube.com https://s.ytimg.com https://checkout.razorpay.com https://*.googletagmanager.com https://*.clarity.ms",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https://*.supabase.co https://myvpv.com https://img.youtube.com https://*.ytimg.com https://cdn.razorpay.com https://*.google-analytics.com https://*.googletagmanager.com https://*.clarity.ms https://c.bing.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://www.youtube.com https://api.bigdatacloud.net https://api.razorpay.com https://lumberjack.razorpay.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.clarity.ms https://c.bing.com",
      "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://*.supabase.co https://api.razorpay.com https://checkout.razorpay.com",
      "media-src 'self' blob: https://*.supabase.co",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self' https://*.myvpv.com",
      "upgrade-insecure-requests",
    ].map(pinSupabaseHost).join("; "),
  },
];

/**
 * The marketing site embeds a Kuula demo tour and YouTube testimonials,
 * and it does so on several of its pages — not just the front page.
 * Those pages, and only those pages, get the extra frame permissions;
 * every dashboard and viewer path keeps the strict set above.
 */
const SITE_EMBEDS =
  '"https://kuula.co" "https://www.youtube.com" "https://www.youtube-nocookie.com"';
const siteHeaders = securityHeaders.map((h) => {
  if (h.key === "Content-Security-Policy") {
    const value = h.value.replace("frame-src 'self'", "frame-src 'self' https://kuula.co");
    if (value === h.value) throw new Error("CSP frame-src anchor not found");
    return { ...h, value };
  }
  if (h.key === "Permissions-Policy") {
    let value = h.value;
    for (const [from, to] of [
      ["accelerometer=()", `accelerometer=(self ${SITE_EMBEDS})`],
      ["gyroscope=()", `gyroscope=(self ${SITE_EMBEDS})`],
      ["magnetometer=()", `magnetometer=(self ${SITE_EMBEDS})`],
      ["fullscreen=(self)", `fullscreen=(self ${SITE_EMBEDS})`],
      ["autoplay=(self)", `autoplay=(self ${SITE_EMBEDS})`],
    ]) {
      if (!value.includes(from)) throw new Error(`Permissions-Policy anchor not found: ${from}`);
      value = value.replace(from, to);
    }
    return { ...h, value };
  }
  return h;
});

const nextConfig = {
  // Don't advertise Next.js version in x-powered-by.
  poweredByHeader: false,
  reactStrictMode: true,
  // Compiler-level minification + dead-code elimination
  compiler: {
    removeConsole: process.env.NODE_ENV === "production"
      ? { exclude: ["error", "warn"] }
      : false,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: SUPABASE_HOST === "*.supabase.co" ? "**.supabase.co" : SUPABASE_HOST },
      { protocol: "https", hostname: "myvpv.com" },
      { protocol: "https", hostname: "img.youtube.com" },
    ],
    // Clamp DoS vectors on the Image optimisation endpoint.
    minimumCacheTTL: 60,
    dangerouslyAllowSVG: false,
  },
  transpilePackages: ["three"],

  // Per-API body size limits — anything bigger than this is refused
  // before the handler is invoked. Larger uploads go through signed
  // URLs direct to Supabase Storage, not through our server.
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },

  /**
   * Retired paths, sent somewhere real.
   *   /pricing  — the old scene-ladder page. The three plans on /plans are the
   *               one public price list now; app/pricing/page.tsx is kept as
   *               the design reference for the scene slider (docs/DESIGN-REFERENCE.md).
   *   /assessment/processes, /assessment/price — steps of the old site's
   *               assessment, replaced by the funnel under app/assessment/.
   * Temporary (307) on purpose, so any of them can be brought back.
   */
  async redirects() {
    return [
      { source: "/pricing", destination: "/plans", permanent: false },
      { source: "/assessment/processes", destination: "/assessment/scope", permanent: false },
      { source: "/assessment/price", destination: "/assessment/plan", permanent: false },
    ];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      // Later rule wins for the same header, so the marketing pages get
      // the embed-friendly set while everything else keeps the strict one.
      ...SITE_PATHS.map((path) => ({ source: path, headers: siteHeaders })),
      // The homepage hero frames /experience, which frames the 360° tour —
      // so it needs the site's embed permissions too.
      { source: "/experience", headers: siteHeaders },
      // API endpoints: short-circuit any proxy cache.
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
          // CORS: allow only our own subdomains. If the request is from
          // a different origin, the browser blocks it. API routes that
          // need a different CORS policy can override per-route.
          { key: "Access-Control-Allow-Origin", value: "https://myvpv.com" },
          { key: "Vary", value: "Origin" },
        ],
      },
      // Static assets can cache aggressively.
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
