import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import IdleGuard from "@/components/IdleGuard";
import PolygonFullscreenViewer from "@/components/PolygonFullscreenViewer";
import OfflineBootstrap from "@/components/OfflineBootstrap";
import AccessGate from "@/components/billing/AccessGate";

// Match myvpv.com — Inter across the whole product.
const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://myvpv.com"),
  title: {
    default: "VPV — Virtual Plant Visit",
    template: "%s · VPV",
  },
  description:
    "Premium 360° virtual tours for factories and manufacturing sites. Walk your clients through your plant from anywhere, with per-scene narration, hotspots and secure share links.",
  applicationName: "VPV",
  keywords: [
    "virtual factory tour",
    "360 factory tour",
    "virtual plant visit",
    "factory virtual tour software",
    "manufacturing virtual tour",
    "immersive factory walkthrough",
    "virtual facility tour",
    "VR factory tour",
  ],
  authors: [{ name: "The Next Design", url: "https://thenextdesign.com" }],
  creator: "The Next Design",
  publisher: "The Next Design",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: "https://myvpv.com/",
    siteName: "VPV",
    title: "VPV — Virtual Plant Visit",
    description:
      "Premium 360° virtual tours for factories and manufacturing sites.",
    images: [
      {
        url: "https://myvpv.com/vpv-og.png",
        width: 1200,
        height: 630,
        alt: "VPV — Virtual Plant Visit",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "VPV — Virtual Plant Visit",
    description:
      "Premium 360° virtual tours for factories and manufacturing sites.",
    images: ["https://myvpv.com/vpv-og.png"],
  },
  icons: {
    icon: "https://myvpv.com/vpv-mark.png",
    apple: "https://myvpv.com/vpv-mark.png",
  },
  alternates: {
    canonical: "https://myvpv.com/",
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
        {/* The support-lapse ladder: a renewal pop-up on every click for 7 days
            after the support year ends, then a lock until renewed. Decided
            by the database; renders nothing for anyone in good standing. */}
        <AccessGate />
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
