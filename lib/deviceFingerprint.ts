"use client";

/**
 * Stable per-browser-profile device fingerprint, kept in localStorage.
 *
 * This is the SAME fingerprint pattern used by the viewer side for
 * analytics — a UUID minted on first visit and reused forever after.
 * It is NOT a canvas / webgl fingerprint and makes no attempt to
 * dedupe the same person across browsers: it is a device SLOT token,
 * not an identity. One Chrome profile = one slot.
 */
export function getDeviceFingerprint(): string {
  if (typeof window === "undefined") return "";
  const KEY = "vpv_device_fp";
  let fp: string | null = null;
  try {
    fp = localStorage.getItem(KEY);
  } catch {
    /* localStorage disabled — fingerprint can't persist. */
  }
  if (!fp) {
    const uuid =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) +
          Math.random().toString(36).slice(2);
    fp = `${uuid}-${Date.now().toString(36)}`;
    try {
      localStorage.setItem(KEY, fp);
    } catch {
      /* ignore — the caller will get a non-persistent fp */
    }
  }
  return fp;
}

/** Short user-agent token for the active_sessions audit — browser +
 *  OS family, not the full UA string, so the row is human-readable. */
export function shortUserAgent(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  const browser =
    /Edg\/\d/.test(ua) ? "Edge"
    : /Chrome\/\d/.test(ua) ? "Chrome"
    : /Firefox\/\d/.test(ua) ? "Firefox"
    : /Safari\/\d/.test(ua) ? "Safari"
    : "Browser";
  const os =
    /Windows/.test(ua) ? "Windows"
    : /Mac OS X/.test(ua) ? "macOS"
    : /Android/.test(ua) ? "Android"
    : /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Linux/.test(ua) ? "Linux"
    : "Device";
  return `${browser} on ${os}`;
}
