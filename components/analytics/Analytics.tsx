/**
 * components/analytics/Analytics.tsx — Google Analytics 4, Microsoft
 * Clarity, and our own page-view tracking, mounted once in the root layout.
 *
 * Nothing is written into the page until the IDs exist in Vercel, so this
 * is safe to ship before the accounts are created: no script tag, no
 * request, no cookie, nothing for a visitor to object to.
 *
 * The scripts mount after hydration, in an effect, for two reasons. It
 * keeps them off the critical path (they never delay first paint), and it
 * lets a visitor who opted out never load them at all — rather than
 * loading them and asking them politely to ignore the visitor, which is
 * what a consent-mode-only setup actually does.
 *
 *   NEXT_PUBLIC_GA_ID        G-XXXXXXXXXX
 *   NEXT_PUBLIC_CLARITY_ID   xxxxxxxxxx
 */

"use client";

import { Suspense, useEffect, useState } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import {
  CLARITY_PROJECT_ID,
  GA_MEASUREMENT_ID,
  clarityConfigured,
  gaConfigured,
} from "@/lib/analytics/config";
import { captureAttribution, hasOptedOut, track } from "@/lib/analytics/client";

/**
 * One page_view per route change. In the App Router a navigation does not
 * reload the document, so without this only the first page of a visit
 * would ever be counted — and the funnel is six pages long.
 *
 * useSearchParams suspends during static rendering, hence the boundary
 * around it in the parent.
 */
function PageViews() {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    captureAttribution();
    track("page_view");
    // Google needs telling too: its automatic page_view only fires on load.
    try {
      const g = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
      if (typeof g === "function" && gaConfigured) {
        g("event", "page_view", {
          page_path: pathname + (search?.toString() ? `?${search}` : ""),
          page_location: window.location.href,
          page_title: document.title,
        });
      }
    } catch {
      /* GA blocked */
    }
  }, [pathname, search]);

  return null;
}

export default function Analytics() {
  // false during SSR and the first client render, so the markup matches.
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    setAllowed(!hasOptedOut());
  }, []);

  return (
    <>
      {allowed && gaConfigured && (
        <>
          <Script
            id="ga4-src"
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments)}
window.gtag=gtag;
gtag('js',new Date());
gtag('config','${GA_MEASUREMENT_ID}',{send_page_view:false,anonymize_ip:true});`}
          </Script>
        </>
      )}

      {allowed && clarityConfigured && (
        <Script id="clarity" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","${CLARITY_PROJECT_ID}");`}
        </Script>
      )}

      <Suspense fallback={null}>
        <PageViews />
      </Suspense>
    </>
  );
}
