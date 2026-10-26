/**
 * /dashboard — the platform owner's tour dashboard.
 *
 * Signed-out visitors are sent to /login; anyone who is not the owner is
 * sent on to their own workspace (all handled inside OwnerHome). The
 * public front page of myvpv.com is served from app/route.ts.
 */

import type { Metadata } from "next";
import OwnerHome from "@/components/dashboard/OwnerHome";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default function DashboardPage() {
  return <OwnerHome />;
}
