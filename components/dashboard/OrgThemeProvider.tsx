"use client";

/**
 * OrgThemeProvider — wraps a dashboard tree and applies the current
 * org's saved theme.
 *
 * How it scopes to one org:
 *   - It only ever fetches for the ORG the wrapping route already
 *     validated. It never reads any other org's theme, and it never
 *     mounts on the public tour viewer.
 *   - The theme is applied through inline CSS variables + a wrapper
 *     class, so nothing leaks outside the tree it wraps.
 *
 * The provider also injects the org's chosen Google Font stylesheet
 * into <head> once — removing it on unmount keeps the login screen or
 * public pages served by the same session unaffected.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  themeClassNames,
  themeToStyle,
  type OrgTheme,
} from "@/lib/orgTheme";

export default function OrgThemeProvider({
  orgId,
  children,
}: {
  orgId: string | null | undefined;
  children: React.ReactNode;
}) {
  const [theme, setTheme] = useState<OrgTheme | null>(null);

  // Fetch the org's theme once per orgId change.
  useEffect(() => {
    let cancelled = false;
    if (!orgId) {
      setTheme(null);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("orgs")
        .select("theme")
        .eq("id", orgId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        // A missing column (fresh install without the migration) or an
        // RLS block is a soft failure — dashboard just shows its stock
        // look. Never let a theming error break the app.
        // eslint-disable-next-line no-console
        console.warn("[OrgThemeProvider] theme fetch failed:", error.message);
        setTheme(null);
        return;
      }
      setTheme((data?.theme as OrgTheme | null) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  // Inject the Google Font stylesheet for the chosen family. Track it
  // by data-attribute so a font change swaps cleanly without stacking
  // several <link>s.
  useEffect(() => {
    const url = theme?.font_url;
    if (!theme?.enabled || !url) return;
    const existing = document.querySelector<HTMLLinkElement>(
      'link[data-vpv-org-font="1"]'
    );
    if (existing?.href === url) return;
    if (existing) existing.remove();
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    link.setAttribute("data-vpv-org-font", "1");
    document.head.appendChild(link);
    return () => {
      // Only remove OUR link — leave any other stylesheet alone.
      link.remove();
    };
  }, [theme?.font_url, theme?.enabled]);

  const style = themeToStyle(theme);
  const className = themeClassNames(theme);

  // While loading, render children with no wrapper class — the
  // dashboard appears in its stock look for a beat rather than
  // flashing to defaults and back.
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}
