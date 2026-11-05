"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The admin panel's colours, chosen once for every page under /admin.
 *
 * The site underneath is the dark editor theme (globals.css: dark colour
 * scheme, near-white text). The campaign, marketing, payments and inbox
 * pages are light pages made of white cards, and any heading, label or form
 * box on them that did not set its own colour inherited the dark theme:
 * near-white text on white, and dark grey input boxes. Giving them a light
 * theme here fixes all of those at the root instead of page by page. See
 * `.admin-light` in app/globals.css for what it sets.
 *
 * The admin home and the tours list are dark pages by design; they keep the
 * theme they were built in.
 */
const DARK_PAGES = ["/admin", "/admin/tours"];

export default function AdminTheme({ children }: { children: ReactNode }) {
  const path = (usePathname() ?? "").replace(/\/+$/, "") || "/";
  const dark = DARK_PAGES.some((p) => path === p || (p !== "/admin" && path.startsWith(`${p}/`)));
  if (dark) return <>{children}</>;
  return <div className="admin-light">{children}</div>;
}
