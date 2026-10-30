import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Live demo: walk through a real factory in 360° | MyVPV.com",
  description:
    "Try VPV yourself. Walk through a real Indian factory in 360°, exactly the way our customers' sales teams present it to buyers.",
  alternates: { canonical: "https://myvpv.com/demo" },
};

export default function DemoLayout({ children }: { children: ReactNode }) {
  return children;
}
