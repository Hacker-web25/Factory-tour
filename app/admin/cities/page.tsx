/**
 * /admin/cities — which cities enquiries and orders come from.
 *
 * The funnel only lists the cities we shoot in today; everyone else types
 * theirs. This page is how we decide where to go next: cities are sorted
 * by paid orders, then by how many reached the bill, then by enquiries.
 * Platform owner only.
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getMyProfile, type Profile } from "@/lib/auth";
import type { CityDemandRow } from "@/lib/cityDemand";

export default function AdminCitiesPage() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [rows, setRows] = useState<CityDemandRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getMyProfile();
      if (!p) {
        router.push("/login?next=/admin/cities");
        return;
      }
      if (cancelled) return;
      setMe(p);
      if (p.role !== "owner") return;
      try {
        const { data: sess } = await supabase.auth.getSession();
        const res = await fetch("/api/admin/funnel-cities", {
          headers: { Authorization: `Bearer ${sess.session?.access_token ?? ""}` },
        });
        const d = (await res.json()) as { ok?: boolean; rows?: CityDemandRow[]; message?: string };
        if (cancelled) return;
        if (!res.ok || !d.ok) setError(d.message ?? "Could not load the report.");
        else setRows(d.rows ?? []);
      } catch {
        if (!cancelled) setError("Could not reach the server.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (me && me.role !== "owner") {
    return (
      <div className="grid min-h-screen place-items-center bg-vpv-canvas px-6 text-center">
        <div>
          <h1 className="text-[20px] font-semibold text-vpv-ink">Not available</h1>
          <p className="mt-2 text-[14px] text-slate-600">This page is for the platform owner.</p>
        </div>
      </div>
    );
  }

  const outside = (rows ?? []).filter((r) => !r.inServiceArea);

  return (
    <div className="min-h-screen bg-vpv-canvas text-vpv-ink">
      <div className="mx-auto max-w-5xl px-5 py-10">
        <Link href="/admin" className="text-[13px] text-slate-500 hover:text-vpv-blue">← Admin</Link>
        <h1 className="mt-3 text-[28px] font-semibold tracking-tight">Demand by city</h1>
        <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-slate-600">
          Every company that started the pricing questions, by the factory city they gave. One company counts
          once per city, at the furthest step it reached.{" "}
          {rows && outside.length > 0 && (
            <>
              <strong className="font-semibold text-vpv-ink">{outside[0].city}</strong> is the busiest city outside
              the area we shoot in today.
            </>
          )}
        </p>

        {error && <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-700">{error}</p>}
        {!rows && !error && <p className="mt-6 text-[14px] text-slate-500">Loading…</p>}
        {rows && rows.length === 0 && (
          <p className="mt-6 rounded-xl border border-vpv-line bg-white px-4 py-6 text-[14px] text-slate-600">
            No enquiries yet. Cities appear here as soon as someone answers the first step.
          </p>
        )}

        {rows && rows.length > 0 && (
          <div className="mt-8 overflow-x-auto rounded-2xl border border-vpv-line bg-white">
            <table className="w-full text-left text-[14px]">
              <thead className="border-b border-vpv-line bg-vpv-canvas text-[12.5px] text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">City</th>
                  <th className="px-4 py-3 font-medium">Where we shoot</th>
                  <th className="px-4 py-3 text-right font-medium">Enquiries</th>
                  <th className="px-4 py-3 text-right font-medium">Saw a plan</th>
                  <th className="px-4 py-3 text-right font-medium">Reached the bill</th>
                  <th className="px-4 py-3 text-right font-medium">Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vpv-line">
                {rows.map((r) => (
                  <tr key={r.city}>
                    <td className="px-4 py-3">
                      <span className="font-medium">{r.city}</span>
                      {r.state && <span className="ml-2 text-[12.5px] text-slate-500">{r.state}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {r.inServiceArea ? (
                        <span className="rounded-full bg-vpv-tint px-2.5 py-0.5 text-[12px] font-medium text-vpv-blue">Yes</span>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[12px] font-medium text-amber-800">Not yet</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.enquiries}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.reachedPlan}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.reachedBilling}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{r.paid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
