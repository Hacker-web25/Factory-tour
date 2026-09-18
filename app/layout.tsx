import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import IdleGuard from "@/components/IdleGuard";
import PolygonFullscreenViewer from "@/components/PolygonFullscreenViewer";
import OfflineBootstrap from "@/components/OfflineBootstrap";

// Match myvpv.com — Inter across the whole product.
const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VPV — Virtual Plant Visit",
  description: "Real Factories. Real Confidence. 360° virtual tours for factories & manufacturing sites.",
  icons: {
    icon: "https://myvpv.com/vpv-mark.png",
    apple: "https://myvpv.com/vpv-mark.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">

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
