"use client";

/**
 * Global error boundary.
 *
 * Next.js serves this when any route in the app throws during render.
 * Keeps the UX graceful (versus a stark Vercel 500 page) and gives the
 * user a one-click retry.
 *
 * The error itself is logged to the browser console. In production we
 * swallow details from the UI so an attacker can't learn stack-trace
 * paths from a prod deploy.
 */

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[route-error]", error);
  }, [error]);

  const isProd = process.env.NODE_ENV === "production";

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
          Something broke
        </div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "-0.015em",
            margin: 0,
          }}
        >
          This page didn&apos;t render
        </h1>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.55,
            color: "#94a3b8",
            margin: "12px 0 24px",
          }}
        >
          We&apos;ve logged the error. Try again — most of the time a
          reload is enough. If not, our team is already looking.
        </p>

        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            onClick={reset}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              background:
                "linear-gradient(135deg, #8b5cf6, #6366f1)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 500,
              border: "none",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <a
            href="/"
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.06)",
              color: "#f8fafc",
              fontSize: 13,
              fontWeight: 500,
              border: "1px solid rgba(255,255,255,0.1)",
              textDecoration: "none",
            }}
          >
            Home
          </a>
        </div>

        {!isProd && error.message && (
          <pre
            style={{
              marginTop: 24,
              padding: 14,
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              borderRadius: 10,
              fontSize: 11,
              fontFamily: "ui-monospace, monospace",
              textAlign: "left",
              color: "#fca5a5",
              overflow: "auto",
              maxHeight: 200,
              whiteSpace: "pre-wrap",
            }}
          >
            {error.message}
            {error.digest ? `\n\ndigest: ${error.digest}` : ""}
          </pre>
        )}
      </div>
    </div>
  );
}
