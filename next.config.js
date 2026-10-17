/** @type {import('next').NextConfig} */

// Every path the marketing single-page app owns. Shared with
// lib/site/pages.ts, which fails the build if the two disagree.
const { SITE_PATHS } = require("./lib/site/paths");

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
  // workflow; geolocation + payment + usb are not used anywhere.
  {
    key: "Permissions-Policy",
    value: [
      "geolocation=()",
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
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.supabase.co https://www.youtube.com https://s.ytimg.com https://checkout.razorpay.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https://*.supabase.co https://myvpv.com https://img.youtube.com https://*.ytimg.com https://cdn.razorpay.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.resend.com https://www.youtube.com https://api.bigdatacloud.net https://generativelanguage.googleapis.com https://integrate.api.nvidia.com https://api.razorpay.com https://lumberjack.razorpay.com",
      "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://*.supabase.co https://api.razorpay.com https://checkout.razorpay.com",
      "media-src 'self' blob: https://*.supabase.co",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self' https://*.myvpv.com",
      "upgrade-insecure-requests",
    ].join("; "),
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
      { protocol: "https", hostname: "**.supabase.co" },
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

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      // Later rule wins for the same header, so the marketing pages get
      // the embed-friendly set while everything else keeps the strict one.
      ...SITE_PATHS.map((path) => ({ source: path, headers: siteHeaders })),
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
