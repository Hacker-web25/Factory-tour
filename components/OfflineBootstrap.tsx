"use client";

/**
 * Mounted once from RootLayout. Registers the service worker on first
 * load and starts the offline write flusher so any queued analytics
 * events get pushed out as soon as the network comes back.
 *
 * Scope rules
 * -----------
 * Offline mode is a customer feature — it exists so a sales presenter
 * (or org admin previewing) can keep working when the network drops.
 *
 * We deliberately DO NOT register the service worker on the internal
 * tour-editor routes (`/tour/*`, `/admin/*`, `/`). Reasons:
 *   • The editor writes constantly; a stale cached shell could show
 *     the wrong build to whoever is building the tour.
 *   • Superowner routes handle cross-org data — no need to trap it in
 *     a per-browser cache.
 *
 * Renders nothing — pure side effect.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { registerServiceWorker } from "@/lib/offlineCache";
import { installOfflineFlusher } from "@/lib/offlineQueue";

/** Routes where the SW should NEVER register.
 *
 * `/tour/{id}/edit` is where the tour EDITOR lives, BUT it's also where
 * PREVIEW mode lives (`?preview=1`) — the presenter's actual "run the
 * tour" URL. So we cannot blanket-block /tour/*. We block only the
 * unambiguously-superadmin routes (root cross-org editor, admin panel,
 * analytics dashboards). Everything else registers so the SW can
 * intercept media requests and serve them from cache when offline. */
function isSuperadminRoute(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname.startsWith("/admin")) return true;
  if (pathname.startsWith("/analytics")) return true;
  return false;
}

/** Detect whether we're on the tour editor in NON-preview mode. In that
 *  narrow case, don't run the offline write flusher (nothing to sync);
 *  but we STILL register the SW so navigating into preview mode from
 *  the same tab works offline without a hard refresh. */
function isEditorEditMode(pathname: string): boolean {
  if (!pathname.startsWith("/tour/")) return false;
  if (typeof window === "undefined") return true;
  const q = window.location.search;
  if (q.includes("preview=1")) return false;
  if (q.includes("present=1")) return false;
  return true;
}

export default function OfflineBootstrap() {
  const pathname = usePathname();
  useEffect(() => {
    const p = pathname ?? "/";
    // Don't touch the superowner cross-org dashboards at all.
    if (isSuperadminRoute(p)) return;
    // Everywhere else — including /tour/*/edit?preview=1 — register
    // the SW so media requests get cached and served offline.
    registerServiceWorker();
    // Flusher only makes sense on presenter/customer surfaces, not
    // while the owner is editing a tour.
    if (isEditorEditMode(p)) return;
    const teardown = installOfflineFlusher();
    return () => teardown();
  }, [pathname]);
  return null;
}
