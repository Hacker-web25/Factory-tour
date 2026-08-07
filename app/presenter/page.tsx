"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase, publicUrl } from "@/lib/supabase";
import type { Tour } from "@/lib/types";
import { getMyProfile, signOut, type Profile } from "@/lib/auth";
import { LogOut, Play, Copy as CopyIcon } from "lucide-react";
import type { ShareLink } from "@/lib/shareLinks";

/**
 * /presenter — home for the presenter role. Lists every presenter link
 * they've been given. Each row shows the tour cover + a "Present" button
 * that opens their unique attributed URL. No editing, no analytics for
 * other people — just what they need to walk into a meeting and demo.
 */

type Row = {
  link: ShareLink;
  tour: Tour;
  coverPath: string | null;
};

export default function PresenterHomePage() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const p = await getMyProfile();
      if (!p) {
        router.replace("/login?next=/presenter");
        return;
      }
      if (p.role === "owner") {
        router.replace("/");
        return;
      }
      if (p.role === "org_admin") {
        router.replace("/client");
        return;
      }
      setMe(p);

      // Fetch every presenter link owned by this user, then hydrate with
      // the tour + cover for each. Small N — no batching needed.
      const { data: links } = await supabase
        .from("share_links")
        .select("*")
        .eq("owner_user_id", p.id)
        .eq("kind", "presenter")
        .is("revoked_at", null);

      const rowList: Row[] = [];
      for (const l of ((links ?? []) as ShareLink[])) {
        const { data: t } = await supabase
          .from("tours")
          .select("*")
          .eq("id", l.tour_id)
          .maybeSingle();
        if (!t) continue;
        const tour = t as Tour;
        const { data: scenes } = await supabase
          .from("scenes")
          .select("image_path")
          .eq("tour_id", tour.id)
          .order("order_index")
          .limit(1);
        const cover =
          tour.thumbnail_path ??
          (scenes && scenes[0]
            ? (scenes[0] as { image_path: string }).image_path
            : null);
        rowList.push({ link: l, tour, coverPath: cover });
      }
      setRows(rowList);
      setLoading(false);
    })();
  }, [router]);

  async function onSignOut() {
    await signOut();
    router.push("/login");
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin;

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
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-neutral-500">
              Presenter
            </div>
            <div className="text-[13px] text-neutral-300 truncate">
              {me?.full_name || me?.email}
            </div>
          </div>
          <button
            onClick={onSignOut}
            className="chip !py-1.5 flex items-center gap-1"
          >
            <LogOut size={12} /> Sign out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        <div className="mb-5">
          <div className="eyebrow mb-0.5">Your tours</div>
          <h1 className="text-[22px] font-semibold leading-tight">
            {rows.length} tour{rows.length === 1 ? "" : "s"} you can present
          </h1>
        </div>

        {rows.length === 0 ? (
          <div className="border border-dashed border-border rounded p-10 text-center text-sm text-neutral-500">
            No presenter links assigned to you yet. Ask your admin to
            create one for you.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map(({ link, tour, coverPath }) => {
              const url = `${origin}/present/${link.token}`;
              return (
                <div
                  key={link.id}
                  className="flex items-center gap-3 bg-panelSoft border border-border rounded p-2"
                >
                  <div className="w-28 h-16 bg-black rounded overflow-hidden shrink-0">
                    {coverPath ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={publicUrl(coverPath) ?? ""}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium truncate">
                      {tour.title}
                    </div>
                    <div className="text-[11px] text-neutral-500 truncate">
                      {url}
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      navigator.clipboard.writeText(url).catch(() => {})
                    }
                    className="chip !py-1"
                    title="Copy your presenter URL"
                  >
                    <CopyIcon size={11} /> Copy
                  </button>
                  <Link
                    href={`/present/${link.token}`}
                    className="bg-accent hover:bg-accentHover text-black text-[12px] font-medium px-3 py-1.5 rounded flex items-center gap-1"
                  >
                    <Play size={12} /> Present
                  </Link>
                </div>
              );
            })}
          </div>
        )}

        <div className="text-[11px] text-neutral-500 mt-6">
          Every session you present is attributed to you. Your admin can
          see your activity in analytics; other presenters can't.
        </div>
      </main>
    </div>
  );
}
