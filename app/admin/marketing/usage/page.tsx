/**
 * /admin/marketing/usage — how paying customers said they will use VPV.
 *
 * Every customer answers one question on the page after payment: "How do
 * you plan to use your virtual plant visit?" This page counts the answers
 * (real customers only) and lists each one, so positioning and marketing can
 * follow what buyers actually do with it.
 *
 * Platform owner only.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getMyProfile, type Profile } from "@/lib/auth";
import { usageTitle } from "@/lib/purchaseUsage";

type Count = { id: string; title: string; count: number };
type Row = {
  orderId: string;
  company: string;
  name: string;
  email: string;
  amountPaise: number;
  paidAt: string | null;
  test: boolean;
  uses: string[];
  other: string | null;
  answeredAt: string;
};

const inr = (paise: number) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default function UsagePage() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [counts, setCounts] = useState<Count[]>([]);
  const [answered, setAnswered] = useState(0);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/usage", {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      });
      const d = (await res.json()) as {
        ok?: boolean;
        counts?: Count[];
        answered?: number;
        rows?: Row[];
        needsMigration?: boolean;
        message?: string;
      };
      if (!res.ok || !d.ok) {
        setError(d.message ?? "Could not load the answers.");
        return;
      }
      setCounts(d.counts ?? []);
      setAnswered(d.answered ?? 0);
      setRows(d.rows ?? []);
      setNeedsMigration(Boolean(d.needsMigration));
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
        router.push("/login?next=/admin/marketing/usage");
        return;
      }
      if (cancelled) return;
      setMe(p);
      if (p.role === "owner") await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [router, load]);

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

  const max = Math.max(1, ...counts.map((c) => c.count));

  return (
    <div className="min-h-screen bg-vpv-canvas text-vpv-ink">
      <div className="mx-auto max-w-5xl px-5 py-10">
        <Link href="/admin/marketing" className="text-[13px] text-slate-500 hover:text-vpv-blue">
          ← Marketing
        </Link>
        <h1 className="mt-3 text-[28px] font-semibold tracking-tight">How customers will use VPV</h1>
        <p className="mt-2 max-w-3xl text-[14.5px] leading-relaxed text-slate-600">
          Every customer answers this on the page after payment, and cannot skip it. The bars count
          real customers only. Test orders are listed below, marked “Test”.
        </p>

        {needsMigration && (
          <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-[14px] text-amber-800">
            Run <code className="font-mono">supabase/purchase_usage.sql</code> in the Supabase SQL editor to start
            saving answers.
          </p>
        )}
        {error && <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-[14px] text-red-700">{error}</p>}

        <section className="mt-8 rounded-2xl border border-vpv-line bg-white p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-[16px] font-semibold">What they chose</h2>
            <p className="text-[13px] text-slate-500">
              {answered} {answered === 1 ? "customer" : "customers"} answered · pick all that apply
            </p>
          </div>
          <ul className="mt-5 space-y-3">
            {counts.map((c) => (
              <li key={c.id}>
                <div className="flex items-baseline justify-between gap-3 text-[14px]">
                  <span>{c.title}</span>
                  <span className="tabular-nums font-semibold">
                    {c.count}
                    {answered > 0 && (
                      <span className="ml-1.5 font-normal text-slate-500">
                        ({Math.round((c.count / answered) * 100)}%)
                      </span>
                    )}
                  </span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-vpv-tint">
                  <div className="h-2 rounded-full bg-vpv-blue" style={{ width: `${(c.count / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6 rounded-2xl border border-vpv-line bg-white">
          <h2 className="border-b border-vpv-line px-5 py-4 text-[16px] font-semibold sm:px-6">Each answer</h2>
          {rows === null ? (
            <p className="px-5 py-6 text-[14px] text-slate-500 sm:px-6">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="px-5 py-6 text-[14px] text-slate-500 sm:px-6">No answers yet.</p>
          ) : (
            <ul className="divide-y divide-vpv-line">
              {rows.map((r) => (
                <li key={r.orderId} className="px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold">
                      {r.company}
                      {r.test && (
                        <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11.5px] font-semibold text-amber-700">
                          Test
                        </span>
                      )}
                    </p>
                    <p className="text-[12.5px] text-slate-500">
                      {inr(r.amountPaise)} · paid {when(r.paidAt)}
                    </p>
                  </div>
                  <p className="text-[13px] text-slate-500">
                    {r.name} · {r.email}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.uses.map((u) => (
                      <span key={u} className="rounded-full bg-vpv-tint px-2.5 py-1 text-[12.5px] font-medium text-vpv-blue">
                        {usageTitle(u)}
                      </span>
                    ))}
                  </div>
                  {r.other && (
                    <p className="mt-2 rounded-lg bg-vpv-canvas px-3 py-2 text-[13.5px] text-slate-700">“{r.other}”</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
