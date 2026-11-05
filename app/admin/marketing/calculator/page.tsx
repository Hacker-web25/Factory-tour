/**
 * /admin/marketing/calculator — who used the /why-vpv calculator, and how big
 * their business is by the numbers THEY typed.
 *
 * The calculator saves a visitor's numbers a moment after they stop moving a
 * slider. Here they are ranked biggest first, with a name and company when we
 * know them (a personal QR code, or an enquiry they filled in later).
 *
 * Platform owner only.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getMyProfile, type Profile } from "@/lib/auth";
import { inrLakhs } from "@/lib/pricing";
import { formatSeconds } from "@/lib/interest";
import { stageLabel } from "@/lib/analytics/signals";
import type { CalcRow, CalcSummary } from "@/lib/calculatorReport";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
];

export default function CalculatorReportPage() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [days, setDays] = useState(90);
  const [rows, setRows] = useState<CalcRow[] | null>(null);
  const [summary, setSummary] = useState<CalcSummary | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: number) => {
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/marketing/calculator?days=${d}`, {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      });
      const body = (await res.json()) as {
        ok?: boolean;
        rows?: CalcRow[];
        summary?: CalcSummary;
        truncated?: boolean;
        message?: string;
      };
      if (!res.ok || !body.ok) {
        setError(body.message ?? "Could not load the report.");
        return;
      }
      setRows(body.rows ?? []);
      setSummary(body.summary ?? null);
      setTruncated(!!body.truncated);
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
        router.push("/login?next=/admin/marketing/calculator");
        return;
      }
      if (cancelled) return;
      setMe(p);
      if (p.role !== "owner") return;
      await load(days);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, load, days]);

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

  const tile = (label: string, value: string, hint?: string) => (
    <div className="rounded-2xl border border-vpv-line bg-white p-4">
      <p className="text-[12.5px] text-slate-500">{label}</p>
      <p className="mt-1 text-[24px] font-semibold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-[12px] text-slate-500">{hint}</p>}
    </div>
  );
  const maxBand = Math.max(1, ...(summary?.bands.map((b) => b.count) ?? [1]));

  return (
    <div className="min-h-screen bg-vpv-canvas text-vpv-ink">
      <div className="mx-auto max-w-6xl px-5 py-10">
        <Link href="/admin/marketing" className="text-[13px] text-slate-500 hover:text-vpv-blue">← Marketing</Link>
        <h1 className="mt-3 text-[28px] font-semibold tracking-tight">Why VPV calculator</h1>
        <p className="mt-2 max-w-3xl text-[14.5px] leading-relaxed text-slate-600">
          Everyone who moved the sliders on <b>myvpv.com/why-vpv</b>, biggest first. The numbers save
          themselves a moment after a visitor stops moving a slider, so each row shows where they ended up.
          The size is the yearly business they typed in (leads × business per lead): how big they say
          their business is, not a checked figure. Visitors who declined measurement on the cookie
          notice do not appear.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`rounded-full px-4 py-1.5 text-[13px] font-semibold ${
                days === r.days ? "bg-vpv-blue text-white" : "border border-vpv-line bg-white text-slate-700 hover:bg-vpv-tint"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {error && <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-[13.5px] text-red-700">{error}</p>}
        {!rows && !error && <p className="mt-6 text-[14px] text-slate-500">Loading…</p>}

        {summary && (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {tile("Visitors who used it", String(summary.visitors))}
              {tile("We know who", String(summary.identified), "from a personal QR or an enquiry")}
              {tile("Typical size", summary.visitors ? inrLakhs(summary.medianOpportunity) : "—", "the middle visitor, a year")}
              {tile("All together", summary.visitors ? inrLakhs(summary.totalOpportunity) : "—", "business they typed in, a year")}
            </div>

            <div className="mt-4 rounded-2xl border border-vpv-line bg-white p-5">
              <h2 className="text-[15px] font-semibold">By size</h2>
              <div className="mt-3 space-y-2">
                {summary.bands.map((b) => (
                  <div key={b.key} className="flex items-center gap-3 text-[13.5px]">
                    <span className="w-44 shrink-0 text-slate-600">{b.label}</span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-vpv-blue" style={{ width: `${(b.count / maxBand) * 100}%` }} />
                    </div>
                    <span className="w-8 text-right tabular-nums">{b.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {rows && rows.length === 0 && (
          <p className="mt-6 rounded-2xl border border-vpv-line bg-white px-5 py-6 text-[14px] text-slate-600">
            Nobody has moved the sliders in this period yet. The first row appears about two seconds
            after a visitor stops moving one.
          </p>
        )}

        {rows && rows.length > 0 && (
          <div className="mt-6 overflow-x-auto rounded-2xl border border-vpv-line bg-white">
            <table className="w-full min-w-[860px] text-left text-[13.5px]">
              <thead className="border-b border-vpv-line bg-vpv-canvas text-[12px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Who</th>
                  <th className="px-4 py-3">Size, a year</th>
                  <th className="px-4 py-3">Their numbers</th>
                  <th className="px-4 py-3">VPV could win back</th>
                  <th className="px-4 py-3">Played</th>
                  <th className="px-4 py-3">Last here</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.visitorId} className="border-b border-vpv-line/60 align-top last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-semibold">{r.name ?? "Anonymous visitor"}</p>
                      {r.company && <p className="text-slate-600">{r.company}</p>}
                      {(r.phone || r.email) && <p className="text-[12.5px] text-slate-500">{[r.phone, r.email].filter(Boolean).join(" · ")}</p>}
                      <p className="mt-0.5 text-[12px] text-slate-500">
                        {[r.city, r.source, r.stage ? stageLabel(r.stage) : null].filter(Boolean).join(" · ") || "No other details"}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums">{inrLakhs(r.opportunity)}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {r.inputs.leads.toLocaleString("en-IN")} leads × {inrLakhs(r.inputs.valueLakh * 1_00_000)}
                      <br />
                      <span className="text-slate-500">converting {r.inputs.conv}%, lift {r.inputs.lift} pts</span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{inrLakhs(r.recovered)}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {r.saves} {r.saves === 1 ? "save" : "saves"}
                      {r.playedSeconds > 0 && <span className="text-slate-500"> · {formatSeconds(r.playedSeconds)}</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{when(r.lastAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {truncated && <p className="mt-3 text-[12.5px] text-slate-500">Showing the biggest 500.</p>}
      </div>
    </div>
  );
}
