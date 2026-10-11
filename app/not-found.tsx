/**
 * Global 404. Replaces Next's default so an attacker probing paths
 * sees a themed, information-free response (no stack hint about which
 * route layer threw).
 */

import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "32px 24px",
        background: "#0b1220",
        color: "#f8fafc",
        fontFamily:
          "ui-sans-serif, -apple-system, Segoe UI, Inter, sans-serif",
      }}
    >
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "#64748b",
            marginBottom: 8,
          }}
        >
          404
        </div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "-0.015em",
            margin: 0,
          }}
        >
          Page not found
        </h1>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.55,
            color: "#94a3b8",
            margin: "12px 0 24px",
          }}
        >
          The link you followed may be broken, or the page may have been
          removed.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-block",
            padding: "10px 18px",
            borderRadius: 10,
            background:
              "linear-gradient(135deg, #8b5cf6, #6366f1)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          Back to VPV
        </Link>
      </div>
    </div>
  );
}
