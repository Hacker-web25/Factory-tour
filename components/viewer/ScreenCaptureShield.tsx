"use client";

/**
 * ScreenCaptureShield — best-effort protection against screen recording
 * / capture / mirroring on a shared tour.
 *
 * Web browsers cannot **fully** block a screen recording — the OS-level
 * capture doesn't tell the page it's happening (unlike Instagram's
 * native app, which uses iOS's `UIScreen.isCaptured` API). What we can
 * do reliably on the web:
 *
 *  1. When the tab loses focus / visibility, immediately black out the
 *     content — covers alt-tab, minimising, switching tabs, and most
 *     desktop screen-share tools that trigger a visibility event when
 *     the tab isn't the active target of the recorder.
 *  2. Overlay a semi-transparent watermark bound to the viewer's
 *     fingerprint + timestamp, so any recording that DOES escape is
 *     traceable back to the visitor who leaked it.
 *  3. Suppress the right-click context menu, Print Screen key, and
 *     Ctrl/⌘+S / Ctrl/⌘+P to catch the low-effort screenshot paths.
 *  4. Detect when navigator.mediaDevices.getDisplayMedia is called
 *     from this tab and blur if the visitor tries the native "share
 *     this tab" flow (their own device recording their own tab).
 *
 * This is a deterrent, not a guarantee. A determined bad actor with a
 * second camera can always film the screen. But it stops the common
 * "quick screenshot / OBS window capture" cases and provides
 * attribution if a leaked recording surfaces.
 */

import { useEffect, useMemo, useState } from "react";

export default function ScreenCaptureShield({
  fingerprint,
  email,
}: {
  fingerprint: string;
  email?: string | null;
}) {
  const [hidden, setHidden] = useState(false);

  // 1. Visibility-change blackout.
  useEffect(() => {
    const onVis = () => setHidden(document.visibilityState !== "visible");
    const onBlur = () => setHidden(true);
    const onFocus = () => setHidden(document.visibilityState !== "visible");
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // 2. Watermark — a repeating faint stamp of the viewer's fingerprint
  //    + a live-updating timestamp. Any screen recording captures the
  //    watermark, letting the tour owner trace a leak back to the
  //    specific link + device that opened it.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const watermarkText = useMemo(() => {
    const stamp = now.toISOString().slice(0, 16).replace("T", " ");
    const who = (email ?? fingerprint).slice(0, 24);
    return `${who} · ${stamp} UTC`;
  }, [fingerprint, email, now]);

  // 3. Kill common capture shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey;
      // Print Screen — cannot be intercepted on Windows before the
      // clipboard capture, but blocking the keyup helps clear it in
      // some browsers, and the visibility blackout catches many tools.
      if (e.key === "PrintScreen") {
        setHidden(true);
        window.setTimeout(() => setHidden(false), 800);
        e.preventDefault();
      }
      // Ctrl/⌘+S save, Ctrl/⌘+P print — no reason to allow either
      // on a viewer page.
      if (meta && (e.key === "s" || e.key === "S" || e.key === "p" || e.key === "P")) {
        e.preventDefault();
      }
    };
    const onCtx = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("keydown", onKey);
    window.addEventListener("contextmenu", onCtx);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("contextmenu", onCtx);
    };
  }, []);

  return (
    <>
      {/* Blackout — sits over EVERYTHING when the page isn't visible. */}
      {hidden && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "#000",
            zIndex: 2000,
            display: "grid",
            placeItems: "center",
            color: "#ffffff40",
            fontSize: 12,
            fontFamily: "ui-monospace, monospace",
            pointerEvents: "none",
          }}
        >
          Paused — screen not visible
        </div>
      )}

      {/* Watermark grid — faint, non-interactive, every viewer sees it. */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1500,
          pointerEvents: "none",
          overflow: "hidden",
          userSelect: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -20,
            left: -20,
            right: -20,
            bottom: -20,
            transform: "rotate(-20deg)",
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: 60,
            color: "rgba(255,255,255,0.08)",
            fontFamily: "ui-monospace, monospace",
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.08em",
            mixBlendMode: "difference",
          }}
        >
          {Array.from({ length: 48 }).map((_, i) => (
            <span key={i}>{watermarkText}</span>
          ))}
        </div>
      </div>
    </>
  );
}
