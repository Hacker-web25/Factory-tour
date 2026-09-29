"use client";

/**
 * /team/analytics — the org_admin's Sales Team MIS dashboard.
 *
 * The whole page is the MIS: KPIs, leaderboard, four supporting
 * charts. No sidebar, no side panels — the dashboard fills the
 * screen. Access is gated to org_admin; everyone else is bounced.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMyProfile, type Profile } from "@/lib/auth";
import SalesTeamMIS from "@/components/dashboard/SalesTeamMIS";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function TeamAnalyticsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [ok, setOk] = useState<null | boolean>(null);

  useEffect(() => {
    (async () => {
      const p = await getMyProfile();
      if (!p) {
        router.replace("/login?next=/team/analytics");
        return;
      }
      if (!p.org_id) {
        router.replace("/setup");
        return;
      }
      // Only org_admin / owner see the analytics dashboard. Presenters
      // bounce back to their own workspace.
      if (p.role !== "org_admin" && p.role !== "owner") {
        router.replace("/");
        return;
      }
      setMe(p);
      setOk(true);
    })();
  }, [router]);

  if (ok !== true || !me?.org_id) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 text-slate-400 text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#f8fafc]">
      {/* Slim back-to-dashboard bar — the only chrome the page keeps. */}
      <div className="border-b border-slate-200 bg-white/70 backdrop-blur px-6 py-2.5 flex items-center">
        <Link
          href="/client"
          className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to dashboard
        </Link>
      </div>
      <SalesTeamMIS orgId={me.org_id} />
    </div>
  );
}
