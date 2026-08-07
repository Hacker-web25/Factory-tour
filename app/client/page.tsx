"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase, publicUrl } from "@/lib/supabase";
import type { Tour } from "@/lib/types";
import {
  getMyProfile,
  signOut,
  type Profile,
  type Organization,
} from "@/lib/auth";
import {
  BarChart3,
  Share2,
  Users,
  LogOut,
  Play,
  Eye,
} from "lucide-react";

/**
 * /client — view-only dashboard for org_admin. Zero editing. Everything
 * is about running the business: see your tours, share them, watch the
 * analytics, manage your team.
 *
 * Owner also has access (superuser). Presenters are redirected out.
 */

type TourCard = Tour & { cover_path: string | null; scene_count: number };

export default function ClientDashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [org, setOrg] = useState<Organization | null>(null);
  const [tours, setTours] = useState<TourCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const p = await getMyProfile();
      if (!p) {
        router.replace("/login?next=/client");
        return;
      }
      if (p.role === "presenter") {
        router.replace("/presenter");
        return;
      }
      setMe(p);

      if (p.org_id) {
        const { data: o } = await supabase
          .from("organizations")
          .select("*")
          .eq("id", p.org_id)
          .maybeSingle();
        if (o) setOrg(o as Organization);
      }

      // Owner sees all tours; org_admin sees only their org's tours.
      const q = supabase
        .from("tours")
        .select("*")
        .order("updated_at", { ascending: false });
      const { data: rows } =
        p.role === "owner"
          ? await q
          : p.org_id
            ? await q.eq("org_id", p.org_id)
            : { data: [] as Tour[] };

      const list: TourCard[] = [];
      for (const t of (rows ?? []) as Tour[]) {
        const { data: scenes } = await supabase
          .from("scenes")
          .select("id, image_path")
          .eq("tour_id", t.id)
          .order("order_index");
        const cover = t.thumbnail_path ?? scenes?.[0]?.image_path ?? null;
        list.push({
          ...t,
          cover_path: cover,
          scene_count: scenes?.length ?? 0,
        });
      }
      setTours(list);
      setLoading(false);
    })();
  }, [router]);

  async function onSignOut() {
    await signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-neutral-500 grid place-items-center text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white">
      <header className="border-b border-border bg-panel">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-neutral-500">
              {org?.name ?? "Your organization"}
            </div>
            <div className="text-[13px] text-neutral-300 truncate">
              {me?.full_name || me?.email}
            </div>
          </div>
          <Link
            href="/team"
            className="chip !py-1.5 flex items-center gap-1"
          >
            <Users size={12} /> Team
          </Link>
          <button
            onClick={onSignOut}
            className="chip !py-1.5 flex items-center gap-1"
          >
            <LogOut size={12} /> Sign out
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="mb-5">
          <div className="eyebrow mb-0.5">Your tours</div>
          <h1 className="text-[22px] font-semibold leading-tight">
            {tours.length} tour{tours.length === 1 ? "" : "s"}
          </h1>
        </div>

        {tours.length === 0 ? (
          <div className="border border-dashed border-border rounded p-10 text-center">
            <div className="text-sm mb-1">No tours yet.</div>
            <p className="text-xs text-neutral-500">
              Your tour will appear here once your account manager attaches
              it to your organization.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {tours.map((t) => (
              <ClientTourCard key={t.id} tour={t} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function ClientTourCard({ tour }: { tour: TourCard }) {
  return (
    <div className="group bg-panelSoft border border-border rounded overflow-hidden hover:border-accent/60 transition-colors">
      <div className="aspect-video bg-black relative overflow-hidden">
        {tour.cover_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={publicUrl(tour.cover_path) ?? ""}
            alt={tour.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-neutral-600 text-xs">
            no image
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2 pt-6">
          <div className="text-[13px] font-medium truncate">{tour.title}</div>
          <div className="text-3xs text-neutral-400 flex items-center gap-2">
            <span>
              {tour.scene_count} scene{tour.scene_count === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 border-t border-border">
        <Link
          href={`/tour/${tour.id}?preview=1`}
          className="py-2 flex items-center justify-center gap-1 text-[11px] text-neutral-300 hover:bg-accent/10 hover:text-accent transition-colors"
          title="Preview the tour"
        >
          <Play size={11} /> Preview
        </Link>
        <Link
          href={`/tour/${tour.id}/share`}
          className="py-2 flex items-center justify-center gap-1 text-[11px] text-neutral-300 hover:bg-accent/10 hover:text-accent transition-colors border-l border-border"
          title="Share links"
        >
          <Share2 size={11} /> Share
        </Link>
        <Link
          href={`/analytics/${tour.id}`}
          className="py-2 flex items-center justify-center gap-1 text-[11px] text-neutral-300 hover:bg-accent/10 hover:text-accent transition-colors border-l border-border"
          title="Analytics"
        >
          <BarChart3 size={11} /> Analytics
        </Link>
      </div>
    </div>
  );
}
