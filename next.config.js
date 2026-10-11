/** @type {import('next').NextConfig} */

/**
 * Security headers applied to every response. Keeps the viewer
 * iframe-embeddable only from allowed origins (so clients CAN embed
 * share pages on their own sites, but a hostile page can't frame the
 * dashboard for click-jacking). CSP is permissive enough for Supabase,
 * YouTube embeds, Google Fonts and the VPV mark CDN.
 */
const securityHeaders = [
  // Enforce HTTPS forever (first-visit excepted) — the browser will
  // never attempt HTTP after this.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // No MIME-sniffing — content-type is the only truth.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak the exact path to the referred site.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Lock down ambient browser APIs we don't use. Camera + mic kept
  // open for the presenter recorder.
  {
    key: "Permissions-Policy",
    value: "geolocation=(), camera=(self), microphone=(self), payment=(), usb=()",
  },
  // Prevent legacy XSS auditors from doing more harm than good.
  { key: "X-XSS-Protection", value: "0" },
  // Not CSP, but a safety net for the gates — only our own domains,
  // Supabase, YouTube iframe, Google Fonts, and inline data: images
  // (QR, logos). Tighten further if you're not using inline scripts
  // in third-party widgets.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.supabase.co https://www.youtube.com https://s.ytimg.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https://*.supabase.co https://myvpv.com https://img.youtube.com https://*.ytimg.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.resend.com https://www.youtube.com",
      "frame-src 'self' https://www.youtube.com https://*.supabase.co",
      "media-src 'self' blob: https://*.supabase.co",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self' https://*.myvpv.com",
    ].join("; "),
  },
];

const nextConfig = {
  // Don't advertise Next.js version in the x-powered-by header.
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "myvpv.com" },
      { protocol: "https", hostname: "img.youtube.com" },
    ],
  },
  transpilePackages: ["three"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
