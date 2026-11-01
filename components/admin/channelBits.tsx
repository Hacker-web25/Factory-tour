/**
 * Small pieces shared by the Channels dashboard pages: the owner-only data
 * hook, a number cell, and a campaign card. Kept here so the hub and the
 * channel pages read the same way.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getMyProfile, type Profile } from "@/lib/auth";
import type { FolderStat } from "@/lib/campaignFolders";

export const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
export const pctOf = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : undefined);
export const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

/** Signs in the owner, loads every campaign, and says why if it cannot. */
export function useOwnerCampaigns(nextPath: string) {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [folders, setFolders] = useState<FolderStat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [migration, setMigration] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/marketing/folders", {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      });
      const d = (await res.json()) as {
        ok?: boolean;
        folders?: FolderStat[];
        needsMigration?: boolean;
        hint?: string;
        message?: string;
      };
      if (!res.ok || !d.ok) {
        setError(d.message ?? "Could not load the campaigns.");
        return;
      }
      setMigration(d.needsMigration ? d.hint ?? "A migration is pending." : null);
      setFolders(d.folders ?? []);
      setError(null);
    } catch {
      setError("Could not reach the server.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getMyProfile();
      if (!p) {
        router.push(`/login?next=${encodeURIComponent(nextPath)}`);
        return;
      }
      if (cancelled) return;
      setMe(p);
      if (p.role !== "owner") return;
      await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [router, load, nextPath]);

  return { me, folders, error, migration, reload: load };
}

export function NotOwner() {
  return (
    <div className="grid min-h-screen place-items-center bg-vpv-canvas px-6 text-center">
      <div>
        <h1 className="text-[20px] font-semibold text-vpv-ink">Not available</h1>
        <p className="mt-2 text-[14px] text-vpv-muted">This page is for the platform owner.</p>
      </div>
    </div>
  );
}

export function Notice({ kind, children }: { kind: "warn" | "error"; children: React.ReactNode }) {
  const tone =
    kind === "warn"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : "border-red-300 bg-red-50 text-red-800";
  return <p className={`mt-5 rounded-xl border px-4 py-3 text-[13.5px] ${tone}`}>{children}</p>;
}

export function Cell({
  label,
  value,
  sub,
  strong,
  dim,
}: {
  label: string;
  value: string;
  sub?: string;
  strong?: boolean;
  dim?: boolean;
}) {
  return (
    <div>
      <div className="text-[11.5px] uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={`mt-0.5 tabular-nums ${
          strong ? "text-[19px] font-semibold text-vpv-ink" : "text-[17px] font-medium text-vpv-ink"
        } ${dim ? "opacity-45" : ""}`}
      >
        {value}
      </div>
      {sub && <div className="text-[11.5px] text-vpv-muted">{sub}</div>}
    </div>
  );
}

export function CampaignCard({ f }: { f: FolderStat }) {
  return (
    <Link
      href={`/admin/marketing/folders/${f.slug}`}
      className="block rounded-2xl border border-vpv-line bg-white p-5 shadow-sm transition hover:border-vpv-blue/50 hover:shadow sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[17px] font-semibold text-vpv-ink">{f.name}</h3>
          <p className="mt-0.5 text-[12.5px] text-vpv-muted">
            {[f.city, f.channel, f.distributedAt ? `out ${when(f.distributedAt)}` : null]
              .filter(Boolean)
              .join(" · ")}
            {!f.active && " · archived"}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[20px] font-semibold tabular-nums text-vpv-ink">
            {f.revenueInr > 0 ? inr(f.revenueInr) : "—"}
          </div>
          <div className="text-[12px] text-vpv-muted">{f.paid} paid</div>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 lg:grid-cols-6">
        <Cell label="People" value={String(f.codes)} />
        <Cell label="Opened" value={String(f.scannedCodes)} sub={pctOf(f.scannedCodes, f.codes)} strong />
        <Cell
          label="Visited site"
          value={String(f.visited)}
          sub={f.scannedCodes > f.visited ? `${f.scannedCodes - f.visited} never loaded` : pctOf(f.visited, f.codes)}
          strong
        />
        <Cell label="Left details" value={String(f.contacts)} sub="phone or e-mail" />
        <Cell label="Reached the bill" value={String(f.reachedBilling)} />
        <Cell label="Not opened" value={String(f.neverOpened)} dim={f.neverOpened === 0} />
      </div>
    </Link>
  );
}
