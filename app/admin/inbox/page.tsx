/**
 * /admin/inbox — the shared team mailbox for support@myvpv.com.
 *
 * The platform owner and the people the owner adds (Settings & team) can read
 * and answer. They sign in with their own VPV login; nobody needs the hosting
 * or mail-server password.
 */

import type { Metadata } from "next";
import InboxApp from "@/components/inbox/InboxApp";

export const metadata: Metadata = { title: "VPV Inbox", robots: { index: false, follow: false } };

export default function InboxPage() {
  return <InboxApp />;
}
