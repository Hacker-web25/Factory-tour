/**
 * The public site header for the Next.js pages (/why-vpv, /about, the
 * assessment, the policies …). It renders the exact markup the marketing
 * single-page app gets from its shell — see lib/site/header.ts — so the
 * menu, look and scroll behaviour are the same on every page of myvpv.com.
 */

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  SITE_HEADER_CSS,
  SITE_HEADER_FONT_HREF,
  SITE_HEADER_SCRIPT,
  siteHeaderInner,
} from "@/lib/site/header";

export default function SiteHeader() {
  const path = usePathname() || "/";

  // The behaviour is one plain script shared with the static shell; install
  // it once per tab. It looks the header up on every event, so it keeps
  // working when React re-renders the header after a client navigation.
  useEffect(() => {
    if (document.getElementById("vpv-site-header-script")) return;
    const s = document.createElement("script");
    s.id = "vpv-site-header-script";
    s.textContent = SITE_HEADER_SCRIPT;
    document.body.appendChild(s);
  }, []);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={SITE_HEADER_FONT_HREF} />
      <style dangerouslySetInnerHTML={{ __html: SITE_HEADER_CSS }} />
      <header
        id="vpv-site-header"
        className="vh print:hidden"
        data-testid="vpv-site-header"
        dangerouslySetInnerHTML={{ __html: siteHeaderInner(path) }}
      />
    </>
  );
}
