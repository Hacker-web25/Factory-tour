/**
 * /admin/marketing — tracked links, and what each one actually produced.
 *
 * Make a code here, print it as a QR on the pamphlet, and this page tells
 * you whether that print run was worth repeating: scans, how many of those
 * people started the assessment, how many reached the bill, how many paid,
 * and how much money came back.
 *
 * Platform owner only.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getMyProfile, type Profile } from "@/lib/auth";
import type { CampaignStat, SourceStat } from "@/lib/campaignReport";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export default function AdminMarketingPage() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignStat[] | null>(null);
  const [sources, setSources] = useState<SourceStat[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New-code form.
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [destination, setDestination] = useState("/");
  const [medium, setMedium] = useState("qr");
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const token = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/marketing", {
        headers: { Authorization: `Bearer ${await token()}` },
      });
      const d = (await res.json()) as {
        ok?: boolean;
        campaigns?: CampaignStat[];
        sources?: SourceStat[];
        message?: string;
      };
      if (!res.ok || !d.ok) {
        setError(d.message ?? "Could not load the report.");
        return;
      }
      setCampaigns(d.campaigns ?? []);
      setSources(d.sources ?? []);
      setError(null);
    } catch {
      setError("Could not reach the server.");
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getMyProfile();
      if (!p) {
        router.push("/login?next=/admin/marketing");
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
  }, [router, load]);

  async function createCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    setMade(null);
    try {
      const res = await fetch("/api/admin/marketing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await token()}`,
        },
        body: JSON.stringify({ code, label, destination, medium, source: medium === "qr" ? "pamphlet" : medium }),
      });
      const d = (await res.json()) as { ok?: boolean; url?: string; message?: string };
      if (!res.ok || !d.ok) {
        setFormError(d.message ?? "Could not create that code.");
        return;
      }
      setMade(d.url ?? null);
      setCode("");
      setLabel("");
      await load();
    } catch {
      setFormError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(c: CampaignStat) {
    await fetch("/api/admin/marketing", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await token()}`,
      },
      body: JSON.stringify({ code: c.code, active: !c.active }),
    });
    await load();
  }

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

  return (
    <div className="min-h-screen bg-vpv-canvas text-vpv-ink">
      <div className="mx-auto max-w-6xl px-5 py-10">
        <Link href="/admin" className="text-[13px] text-slate-500 hover:text-vpv-blue">← Admin</Link>
        <h1 className="mt-3 text-[28px] font-semibold tracking-tight">Marketing</h1>
        <p className="mt-2 max-w-3xl text-[14.5px] leading-relaxed text-slate-600">
          Every tracked link, and what it produced. Make a code, print it as a QR on the pamphlet,
          and the row below fills in as people scan it. Scans are counted on our own server, so
          they count even when someone blocks Google Analytics.
        </p>

        <Link
          href="/admin/marketing/folders"
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-vpv-blue px-4 py-2 text-[13.5px] font-semibold text-white hover:opacity-90"
        >
          Campaigns: every person on each QR list, and their journey →
        </Link>
        <Link
          href="/admin/marketing/buyers"
          className="mt-5 ml-2 inline-flex items-center gap-2 rounded-full border border-vpv-line bg-white px-4 py-2 text-[13.5px] font-semibold text-vpv-blue hover:bg-vpv-tint"
        >
          Buyers: a personal QR for each person, and what each one did →
        </Link>
        <Link
          href="/admin/marketing/usage"
          className="mt-5 ml-2 inline-flex items-center gap-2 rounded-full border border-vpv-line bg-white px-4 py-2 text-[13.5px] font-semibold text-vpv-blue hover:bg-vpv-tint"
        >
          How customers will use VPV →
        </Link>

        {/* ── Make a code ─────────────────────────────────────────── */}
        <form
          onSubmit={createCode}
          className="mt-8 rounded-2xl border border-vpv-line bg-white p-5 sm:p-6"
        >
          <h2 className="text-[16px] font-semibold">New tracked link</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="text-[12.5px] font-medium text-slate-600">Code (goes in the QR)</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="GGN-OCT26"
                required
                className="mt-1 w-full rounded-xl border border-vpv-line px-3 py-2 text-[14px] uppercase outline-none focus:border-vpv-blue"
              />
            </label>
            <label className="block">
              <span className="text-[12.5px] font-medium text-slate-600">Name it</span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Gurugram pamphlet, Oct"
                required
                className="mt-1 w-full rounded-xl border border-vpv-line px-3 py-2 text-[14px] outline-none focus:border-vpv-blue"
              />
            </label>
            <label className="block">
              <span className="text-[12.5px] font-medium text-slate-600">Lands on</span>
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="/"
                className="mt-1 w-full rounded-xl border border-vpv-line px-3 py-2 text-[14px] outline-none focus:border-vpv-blue"
              />
            </label>
            <label className="block">
              <span className="text-[12.5px] font-medium text-slate-600">Kind</span>
              <select
                value={medium}
                onChange={(e) => setMedium(e.target.value)}
                className="mt-1 w-full rounded-xl border border-vpv-line bg-white px-3 py-2 text-[14px] outline-none focus:border-vpv-blue"
              >
                <option value="qr">QR on print</option>
                <option value="print">Printed URL</option>
                <option value="email">E-mail</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="social">Social post</option>
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-vpv-grad px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create link"}
            </button>
            {made && (
              <span className="text-[13px] text-slate-700">
                Print a QR of <strong className="font-semibold">{made}</strong>
              </span>
            )}
            {formError && <span className="text-[13px] text-red-700">{formError}</span>}
          </div>
        </form>

        {error && (
          <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-700">{error}</p>
        )}
        {!campaigns && !error && <p className="mt-6 text-[14px] text-slate-500">Loading…</p>}

        {/* ── Results ─────────────────────────────────────────────── */}
        {campaigns && campaigns.length > 0 && (
          <div className="mt-8 overflow-x-auto rounded-2xl border border-vpv-line bg-white">
            <table className="w-full text-left text-[14px]">
              <thead className="border-b border-vpv-line bg-vpv-canvas text-[12.5px] text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Link</th>
                  <th className="px-4 py-3 text-right font-medium">Scans</th>
                  <th className="px-4 py-3 text-right font-medium">People</th>
                  <th className="px-4 py-3 text-right font-medium">Enquiries</th>
                  <th className="px-4 py-3 text-right font-medium">Reached the bill</th>
                  <th className="px-4 py-3 text-right font-medium">Paid</th>
                  <th className="px-4 py-3 text-right font-medium">Revenue</th>
                  <th className="px-4 py-3 font-medium">On</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vpv-line">
                {campaigns.map((c) => (
                  <tr key={c.code}>
                    <td className="px-4 py-3">
                      <span className="font-medium">{c.label}</span>
                      <span className="mt-0.5 block font-mono text-[12px] text-slate-500">
                        myvpv.com/q/{c.code}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.scans}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.people}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.enquiries}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.reachedBilling}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{c.paid}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {c.revenueInr > 0 ? inr(c.revenueInr) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => void toggle(c)}
                        className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium ${
                          c.active
                            ? "bg-vpv-tint text-vpv-blue"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {c.active ? "On" : "Off"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {campaigns && campaigns.length === 0 && (
          <p className="mt-6 rounded-xl border border-vpv-line bg-white px-4 py-6 text-[14px] text-slate-600">
            No tracked links yet. Make one above, then print its QR on the pamphlet.
          </p>
        )}

        {/* ── Where everyone came from ────────────────────────────── */}
        {sources && sources.length > 0 && (
          <>
            <h2 className="mt-12 text-[20px] font-semibold tracking-tight">Where visitors came from</h2>
            <p className="mt-1.5 max-w-3xl text-[14px] text-slate-600">
              Everyone, not only the tracked links. &ldquo;ai_assistant&rdquo; means they arrived from
              ChatGPT, Perplexity, Gemini or Claude.
            </p>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-vpv-line bg-white">
              <table className="w-full text-left text-[14px]">
                <thead className="border-b border-vpv-line bg-vpv-canvas text-[12.5px] text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 font-medium">Kind</th>
                    <th className="px-4 py-3 text-right font-medium">People</th>
                    <th className="px-4 py-3 text-right font-medium">Enquiries</th>
                    <th className="px-4 py-3 text-right font-medium">Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-vpv-line">
                  {sources.slice(0, 25).map((s) => (
                    <tr key={`${s.source}-${s.medium}`}>
                      <td className="px-4 py-3 font-medium">{s.source}</td>
                      <td className="px-4 py-3 text-slate-600">{s.medium}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.people}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.enquiries}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{s.paid}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
