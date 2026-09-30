"use client";

/**
 * /visitors — the org_admin's Visitors screen. Same VisitorsTab used
 * by the sales page, but scoped to EVERY tour in the org (not just the
 * ones a single presenter has been assigned).
 *
 * Access: org_admin, owner, and presenters. Presenters see only tours
 * they own (RLS filters `.from("tours").select("*").eq(...)`
 * automatically); org_admin + owner see the whole org's list.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getMyProfile, type Profile } from "@/lib/auth";
import VisitorsTab from "@/components/dashboard/VisitorsTab";
import VpvLogo from "@/components/dashboard/VpvLogo";
import { ArrowLeft, Loader2 } from "lucide-react";

type TourRow = { id: string; title: string };

export default function VisitorsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [tours, setTours] = useState<TourRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const p = await getMyProfile();
      if (!p) {
        router.replace("/login?next=/visitors");
        return;
      }
      if (!p.org_id) {
        router.replace("/setup");
        return;
      }
      setMe(p);
      // Every tour in the org. RLS also blocks anything outside their org.
      const { data } = await supabase
        .from("tours")
        .select("id, title")
        .eq("org_id", p.org_id)
        .order("created_at", { ascending: false });
      setTours((data ?? []).filter((t: any) => t.title) as TourRow[]);
      setLoading(false);
    })();
  }, [router]);

  if (loading || !me) {
    return (
      <div className="min-h-screen grid place-items-center bg-vpv-canvas text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-vpv-canvas text-vpv-ink">
      {/* Slim back bar — the only chrome. */}
      <div className="border-b border-vpv-line bg-white/70 backdrop-blur px-6 py-2.5 flex items-center gap-4">
        <Link
          href="/client"
          className="flex items-center gap-1.5 text-xs text-vpv-muted hover:text-vpv-ink"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to dashboard
        </Link>
        <div className="mx-auto">
          <VpvLogo />
        </div>
        <div className="w-24" />
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Visitors</h1>
          <p className="text-sm text-vpv-muted mt-1">
            Share any tour with a client via a secure link or QR code. Every
            link tracks views, respects its expiry, and can be revoked at any
            time.
          </p>
        </div>
        <VisitorsTab
          tours={tours}
          presenterId={me.id}
        />
      </div>
    </div>
  );
}
