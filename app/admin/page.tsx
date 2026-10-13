"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import TopBar from "@/components/TopBar";
import { getMyProfile, type Profile } from "@/lib/auth";
import {
  Building2,
  Users,
  Image as ImageIcon,
  Eye,
  BarChart3,
  Link as LinkIcon,
} from "lucide-react";

/**
 * Owner-only super-admin panel. Shows every organization on the platform
 * with headline metrics: team size (broken down by role), number of
 * tours, total views to date, unique visitors. Clicking an org drills
 * into its tours + team.
 *
 * Access is role-gated to `owner`. Everyone else gets a "not available"
 * screen. Promote yourself to owner via Supabase → Table Editor →
 * profiles → change role from 'org_admin' to 'owner' on your own row.
 */

type OrgRow = {
  id: string;
  name: string;
  created_at: string;
  admins: number;
  presenters: number;
  tours: number;
  views: number; // total scene_view events
  uniqueVisitors: number; // distinct viewer_fingerprint + presenter_user_id
};

export default function AdminPanelPage() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalTours, setTotalTours] = useState(0);
  const [totalEvents, setTotalEvents] = useState(0);

  useEffect(() => {
    (async () => {
      const p = await getMyProfile();
      if (!p) {
        router.push("/login?next=/admin");
        return;
      }
      setMe(p);
      if (p.role !== "owner") {
        setLoading(false);
        return;
      }
      await load();
      setLoading(false);
    })();
  }, [router]);

  async function load() {
    // Load orgs, profiles, tours, and events in parallel.
    const [
      { data: orgRows },
      { data: profileRows },
      { data: tourRows },
      { data: eventRows },
    ] = await Promise.all([
      supabase.from("organizations").select("*").order("created_at"),
      supabase.from("profiles").select("id, org_id, role"),
      supabase.from("tours").select("id, org_id"),
      supabase
        .from("tour_events")
        .select(
          "tour_id, event_type, viewer_fingerprint, presenter_user_id"
        )
        .limit(200000),
    ]);

    const profiles = (profileRows ?? []) as {
      id: string;
      org_id: string | null;
      role: string;
    }[];
    const tours = (tourRows ?? []) as { id: string; org_id: string | null }[];
    const events = (eventRows ?? []) as {
      tour_id: string;
      event_type: string;
      viewer_fingerprint: string | null;
      presenter_user_id: string | null;
    }[];

    // Tour → org lookup so we can attribute events without another query.
    const tourOrg = new Map<string, string | null>(
      tours.map((t) => [t.id, t.org_id])
    );

    const rows: OrgRow[] = ((orgRows ?? []) as {
      id: string;
      name: string;
      created_at: string;
    }[]).map((o) => {
      const orgProfiles = profiles.filter((p) => p.org_id === o.id);
      const admins = orgProfiles.filter((p) => p.role === "org_admin").length;
      const presenters = orgProfiles.filter(
        (p) => p.role === "presenter"
      ).length;
      const orgTours = tours.filter((t) => t.org_id === o.id).length;
      let views = 0;
      const visitors = new Set<string>();
      for (const e of events) {
        if (tourOrg.get(e.tour_id) !== o.id) continue;
        if (e.event_type === "scene_view") views++;
        const fp = e.viewer_fingerprint ?? e.presenter_user_id;
        if (fp) visitors.add(fp);
      }
      return {
        id: o.id,
        name: o.name,
        created_at: o.created_at,
        admins,
        presenters,
        tours: orgTours,
        views,
        uniqueVisitors: visitors.size,
      };
    });

    setOrgs(rows);
    setTotalUsers(profiles.length);
    setTotalTours(tours.length);
    setTotalEvents(events.length);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-neutral-500 grid place-items-center text-sm">
        Loading…
      </div>
    );
  }
  if (!me || me.role !== "owner") {
    return (
      <div className="min-h-screen text-white">
        <TopBar />
        <main className="max-w-2xl mx-auto px-6 py-10 text-center">
          <div className="text-lg font-semibold mb-2">Not available</div>
          <p className="text-sm text-neutral-400 mb-3">
            Only the site owner can access this panel.
          </p>
          <p className="text-[11px] text-neutral-500">
            To promote yourself: Supabase → Table Editor → <code>profiles</code>
            → change your row's <code>role</code> from{" "}
            <code>org_admin</code> to <code>owner</code>.
          </p>
        </main>
      </div>
    );
  }

  const totalViews = orgs.reduce((s, o) => s + o.views, 0);
  const totalVisitors = orgs.reduce((s, o) => s + o.uniqueVisitors, 0);

  return (
    <div className="min-h-screen text-white">
      <TopBar />
      <main className="max-w-6xl mx-auto px-6 py-6">
        <div className="mb-5">
          <div className="eyebrow mb-0.5">Owner</div>
          <h1 className="text-[22px] font-semibold leading-tight">
            Platform overview
          </h1>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-6">
          <Stat
            label="Orgs"
            value={orgs.length}
            icon={<Building2 size={14} />}
          />
          <Stat
            label="Users"
            value={totalUsers}
            icon={<Users size={14} />}
          />
          <Stat
            label="Tours"
            value={totalTours}
            icon={<ImageIcon size={14} />}
          />
          <Stat
            label="Views"
            value={totalViews.toLocaleString()}
            icon={<Eye size={14} />}
          />
          <Stat
            label="Unique visitors"
            value={totalVisitors.toLocaleString()}
            icon={<Users size={14} />}
          />
        </div>

        {orgs.length === 0 ? (
          <div className="border border-dashed border-border rounded p-10 text-center text-sm text-neutral-500">
            No organizations have signed up yet.
          </div>
        ) : (
          <div className="border border-border rounded overflow-hidden">
            <div className="grid grid-cols-[1.4fr_repeat(5,1fr)] gap-3 px-3 py-2 bg-panelSoft text-[11px] uppercase tracking-wider text-neutral-400">
              <div>Organization</div>
              <div>Admins</div>
              <div>Presenters</div>
              <div>Tours</div>
              <div>Views</div>
              <div>Unique visitors</div>
            </div>
            {orgs.map((o) => (
              <div
                key={o.id}
                className="grid grid-cols-[1.4fr_repeat(5,1fr)] gap-3 px-3 py-2.5 border-t border-border text-sm items-center hover:bg-white/[0.02]"
              >
                <div>
                  <div className="font-medium truncate">{o.name}</div>
                  <div className="text-[10px] text-neutral-500">
                    Since {new Date(o.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div>{o.admins}</div>
                <div>{o.presenters}</div>
                <div>{o.tours}</div>
                <div>{o.views.toLocaleString()}</div>
                <div className="flex items-center justify-between gap-2">
                  <span>{o.uniqueVisitors.toLocaleString()}</span>
                  <OrgActions orgId={o.id} />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 text-[11px] text-neutral-500">
          Metrics cover all events on record. Refresh the page to re-fetch.
        </div>
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-panelSoft border border-border rounded p-3">
      <div className="text-[10px] uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
        {icon} {label}
      </div>
      <div className="text-[18px] font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function OrgActions({ orgId }: { orgId: string }) {
  return (
    <div className="flex items-center gap-1">
      <Link
        href={`/admin/org/${orgId}`}
        className="text-neutral-400 hover:text-accent p-1"
        title="Open org detail"
      >
        <LinkIcon size={12} />
      </Link>
    </div>
  );
}
