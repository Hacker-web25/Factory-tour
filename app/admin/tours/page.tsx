"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase, publicUrl } from "@/lib/supabase";
import type { Tour } from "@/lib/types";
import TopBar from "@/components/TopBar";
import {
  getMyProfile,
  type Organization,
  type Profile,
} from "@/lib/auth";

/**
 * /admin/tours — owner-only tour-to-org assignment page.
 * One row per tour with an inline org dropdown that updates
 * tours.org_id immediately. Also shows the current org so you can see
 * what's assigned at a glance.
 */

type Row = Tour & { cover_path: string | null };

export default function AdminToursPage() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [tours, setTours] = useState<Row[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const p = await getMyProfile();
      if (!p) return router.replace("/login?next=/admin/tours");
      setMe(p);
      if (p.role !== "owner") {
        setLoading(false);
        return;
      }
      const [{ data: t }, { data: o }] = await Promise.all([
        supabase
          .from("tours")
          .select("*")
          .order("updated_at", { ascending: false }),
        supabase.from("organizations").select("*").order("name"),
      ]);
      // Grab a cover for each tour — first scene's image path is fine.
      const rows: Row[] = [];
      for (const tour of ((t ?? []) as Tour[])) {
        const { data: s } = await supabase
          .from("scenes")
          .select("image_path")
          .eq("tour_id", tour.id)
          .order("order_index")
          .limit(1);
        rows.push({
          ...tour,
          cover_path:
            tour.thumbnail_path ??
            (s && s[0] ? (s[0] as { image_path: string }).image_path : null),
        });
      }
      setTours(rows);
      setOrgs((o ?? []) as Organization[]);
      setLoading(false);
    })();
  }, [router]);

  async function assign(tourId: string, orgId: string | null) {
    // Optimistic — flip in state, then persist.
    setTours((list) =>
      list.map((t) => (t.id === tourId ? { ...t, org_id: orgId } : t))
    );
    const { error } = await supabase
      .from("tours")
      .update({ org_id: orgId })
      .eq("id", tourId);
    if (error) alert("Assign failed: " + error.message);
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
          <p className="text-sm text-neutral-400">
            Only the site owner can assign tours to organizations.
          </p>
        </main>
      </div>
    );
  }

  const filtered = tours.filter((t) =>
    q ? t.title.toLowerCase().includes(q.toLowerCase()) : true
  );

  return (
    <div className="min-h-screen text-white">
      <TopBar />
      <main className="max-w-4xl mx-auto px-6 py-6">
        <div className="flex items-end justify-between mb-5 gap-3">
          <div>
            <div className="eyebrow mb-0.5">Owner</div>
            <h1 className="text-[22px] font-semibold leading-tight">
              Assign tours to organizations
            </h1>
            <p className="text-xs text-neutral-500 mt-1">
              Pick an organization for each tour. The tour then appears on
              that org's client dashboard.
            </p>
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tours…"
            className="field !w-56"
          />
        </div>

        {orgs.length === 0 ? (
          <div className="border border-dashed border-border rounded p-6 text-sm text-neutral-500 mb-4">
            No organizations exist yet. Ask a client to sign up first, or
            create one from the <Link href="/admin" className="text-accent">Admin</Link>{" "}
            page.
          </div>
        ) : null}

        {filtered.length === 0 ? (
          <div className="border border-dashed border-border rounded p-8 text-center text-sm text-neutral-500">
            {q ? "No tours match your search." : "No tours yet."}
          </div>
        ) : (
          <div className="space-y-1.5">
            {filtered.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 bg-panelSoft border border-border rounded px-3 py-2"
              >
                <div className="w-20 h-12 bg-black rounded overflow-hidden shrink-0">
                  {t.cover_path ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={publicUrl(t.cover_path) ?? ""}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate">
                    {t.title}
                  </div>
                  <div className="text-[10px] text-neutral-500 truncate">
                    {t.id}
                  </div>
                </div>
                <select
                  value={t.org_id ?? ""}
                  onChange={(e) =>
                    assign(t.id, e.target.value === "" ? null : e.target.value)
                  }
                  className="bg-panelSoft border border-border rounded px-2 py-1.5 text-xs min-w-[180px]"
                >
                  <option value="">— Unassigned —</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <Link
                  href={`/tour/${t.id}/edit`}
                  className="chip !py-1"
                  title="Open in editor"
                >
                  Edit
                </Link>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
