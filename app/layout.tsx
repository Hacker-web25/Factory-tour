import "./globals.css";
import type { Metadata } from "next";
import IdleGuard from "@/components/IdleGuard";
import PolygonFullscreenViewer from "@/components/PolygonFullscreenViewer";
import OfflineBootstrap from "@/components/OfflineBootstrap";

export const metadata: Metadata = {
  title: "Factory Tour",
  description: "360° virtual tours for factories & manufacturing sites",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* Runs once, keeps the user signed in across reloads but signs
            them out after 15 days of no activity. */}
        <IdleGuard />
        {/* Registers the service worker so tours the presenter has
            "prepared for offline" run from cache when the network is
            gone. Also flushes any queued analytics writes on reconnect. */}
        <OfflineBootstrap />
        {/* Global listener for polygon media fullscreen requests.
            Mounted here so it works everywhere — editor Preview mode,
            the tour viewer, presenter route, and public viewer links. */}
        <PolygonFullscreenViewer />
        {children}
      </body>
    </html>
  );
}
