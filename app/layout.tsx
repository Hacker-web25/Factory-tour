import "./globals.css";
import type { Metadata } from "next";

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
      <body>{children}</body>
    </html>
  );
}
