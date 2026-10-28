/**
 * /admin/marketing/buyers — what each person did after scanning THEIR QR.
 *
 * Paste a list of buyers, get a code and a link for each, put the links into
 * the QR tool, print. When a buyer scans theirs this page shows whether they
 * opened it, what they read, how long they stayed, and how far they got, so
 * the follow-up call can open with the thing they were reading.
 *
 * Platform owner only.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getMyProfile, type Profile } from "@/lib/auth";
import {
  formatDuration,
  type BuyerStat,
  type BuyerSummary,
  type Interest,
  type JourneyItem,
} from "@/lib/buyerReport";

type Batch = { name: string; count: number };
type MadeRow = { name: string; company: string | null; code: string; url: string };

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
    : "—";

const BADGE: Record<Interest, { text: string; cls: string }> = {
  hot: { text: "Hot", cls: "bg-red-50 text-red-700" },
  warm: { text: "Warm", cls: "bg-amber-50 text-amber-700" },
  opened: { text: "Opened", cls: "bg-vpv-tint text-vpv-blue" },
  not_opened: { text: "Not opened", cls: "bg-slate-100 text-slate-500" },
};

const STAGE_TEXT: Record<string, string> = {
  info: "Started the assessment",
  scope: "Described the factory",
  security: "Chose security options",
  plan: "Chose a plan",
  sales: "Spoke to sales",
  billing: "Reached the bill",
  paid: "Paid",
};

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "batch";

export default function BuyersPage() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batch, setBatch] = useState("");
  const [rows, setRows] = useState<BuyerStat[] | null>(null);
  const [summary, setSummary] = useState<BuyerSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Open row and its timeline.
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [journey, setJourney] = useState<JourneyItem[] | null>(null);
  const [journeyError, setJourneyError] = useState<string | null>(null);

  // New-list form.
  const [showForm, setShowForm] = useState(false);
  const [text, setText] = useState("");
  const [campaign, setCampaign] = useState("");
  // Which print run this batch belongs to. Filing it under one is what makes
  // the folder report possible: the run owns how many pieces were printed,
  // and every rate there is measured against that number.
  const [folderSlug, setFolderSlug] = useState("");
  const [folders, setFolders] = useState<{ slug: string; name: string }[]>([]);
  const [prefix, setPrefix] = useState("");
  const [destination, setDestination] = useState("/");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [made, setMade] = useState<{ rows: MadeRow[]; csv: string; campaign: string; overflow: number } | null>(null);

  const token = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  }, []);

  const load = useCallback(
    async (which: string) => {
      try {
        const qs = which ? `?batch=${encodeURIComponent(which)}` : "";
        const res = await fetch(`/api/admin/marketing/buyers${qs}`, {
          headers: { Authorization: `Bearer ${await token()}` },
        });
        const d = (await res.json()) as {
          ok?: boolean;
          batches?: Batch[];
          rows?: BuyerStat[];
          summary?: BuyerSummary;
          message?: string;
        };
        if (!res.ok || !d.ok) {
          setError(d.message ?? "Could not load the report.");
          return;
        }
        setBatches(d.batches ?? []);
        try {
          const fr = await fetch("/api/admin/marketing/folders", {
            headers: { Authorization: `Bearer ${await token()}` },
          });
          const fd = (await fr.json()) as { folders?: { slug: string; name: string }[] };
          setFolders(fd.folders ?? []);
        } catch {
          /* the picker simply stays empty */
        }
        setRows(d.rows ?? []);
        setSummary(d.summary ?? null);
        setError(null);
      } catch {
        setError("Could not reach the server.");
      }
    },
    [token]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getMyProfile();
      if (!p) {
        router.push("/login?next=/admin/marketing/buyers");
        return;
      }
      if (cancelled) return;
      setMe(p);
      if (p.role !== "owner") return;
      await load("");
    })();
    return () => {
      cancelled = true;
    };
  }, [router, load]);

  async function pickBatch(name: string) {
    setBatch(name);
    setRows(null);
    setOpenCode(null);
    await load(name);
  }

  async function toggleRow(code: string) {
    if (openCode === code) {
      setOpenCode(null);
      return;
    }
    setOpenCode(code);
    setJourney(null);
    setJourneyError(null);
    try {
      const res = await fetch(`/api/admin/marketing/buyers?code=${encodeURIComponent(code)}`, {
        headers: { Authorization: `Bearer ${await token()}` },
      });
      const d = (await res.json()) as { ok?: boolean; journey?: JourneyItem[]; message?: string };
      if (!res.ok || !d.ok) {
        setJourneyError(d.message ?? "Could not load this visit.");
        return;
      }
      setJourney(d.journey ?? []);
    } catch {
      setJourneyError("Could not reach the server.");
    }
  }

  async function makeCodes(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    setMade(null);
    try {
      const res = await fetch("/api/admin/marketing/people", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ text, campaign, prefix, destination, folderSlug }),
      });
      const d = (await res.json()) as {
        ok?: boolean;
        rows?: MadeRow[];
        csv?: string;
        overflow?: number;
        campaign?: string;
        message?: string;
      };
      if (!res.ok || !d.ok) {
        setFormError(d.message ?? "Could not make those codes.");
        return;
      }
      setMade({ rows: d.rows ?? [], csv: d.csv ?? "", campaign: d.campaign ?? campaign, overflow: d.overflow ?? 0 });
      setText("");
      await load(batch);
    } catch {
      setFormError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  function downloadCsv() {
    if (!made) return;
    const blob = new Blob([made.csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slug(made.campaign)}-codes.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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

  const tile = (label: string, value: string, hint?: string) => (
    <div className="rounded-2xl border border-vpv-line bg-white p-4">
      <p className="text-[12.5px] text-slate-500">{label}</p>
      <p className="mt-1 text-[24px] font-semibold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-[12px] text-slate-500">{hint}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-vpv-canvas text-vpv-ink">
      <div className="mx-auto max-w-6xl px-5 py-10">
        <Link href="/admin/marketing" className="text-[13px] text-slate-500 hover:text-vpv-blue">← Marketing</Link>
        <h1 className="mt-3 text-[28px] font-semibold tracking-tight">Buyers</h1>
        <p className="mt-2 max-w-3xl text-[14.5px] leading-relaxed text-slate-600">
          One personal QR per buyer. Paste your list, take the links into your QR tool, and this page
          shows who opened theirs, what they read, how long they stayed and how far they got.
          Opening is counted on our own server; time and reading depth come from the page, so someone
          who chose &ldquo;Decline&rdquo; on the cookie notice shows as opened with no time.
        </p>

        {/* ── Make codes ──────────────────────────────────────────── */}
        <div className="mt-8 rounded-2xl border border-vpv-line bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[16px] font-semibold">Make a personal code for each buyer</h2>
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="rounded-full border border-vpv-line px-4 py-1.5 text-[13px] font-semibold text-slate-700 hover:bg-vpv-canvas"
            >
              {showForm ? "Close" : "New list"}
            </button>
          </div>

          {showForm && (
            <form onSubmit={makeCodes} className="mt-4">
              <label className="block">
                <span className="text-[12.5px] font-medium text-slate-600">
                  Buyers, one per line: name, then the company (optional)
                </span>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={7}
                  required
                  placeholder={"Aryan, Acme Pumps\nMeera Shah, Shah Castings\nR. Kulkarni"}
                  className="mt-1 w-full rounded-xl border border-vpv-line bg-white px-3 py-2 font-mono text-[13px] outline-none focus:border-vpv-blue"
                />
              </label>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <label className="block">
                  <span className="text-[12.5px] font-medium text-slate-600">Print run</span>
                  <select
                    value={folderSlug}
                    onChange={(e) => setFolderSlug(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-vpv-line bg-white px-3 py-2 text-[14px] outline-none focus:border-vpv-blue"
                  >
                    <option value="">— name the batch myself —</option>
                    {folders.map((f) => (
                      <option key={f.slug} value={f.slug}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[11.5px] text-slate-500">
                    {folderSlug ? (
                      <>Filed under this run, so its scan rate counts these pieces.</>
                    ) : (
                      <>
                        No run?{" "}
                        <Link href="/admin/marketing/folders" className="text-vpv-blue underline">
                          Create one
                        </Link>{" "}
                        — without it there is no printed count to measure against.
                      </>
                    )}
                  </span>
                </label>
                {!folderSlug && (
                  <label className="block">
                    <span className="text-[12.5px] font-medium text-slate-600">Name this batch</span>
                    <input
                      value={campaign}
                      onChange={(e) => setCampaign(e.target.value)}
                      placeholder="Gurugram, Oct 26"
                      required
                      className="mt-1 w-full rounded-xl border border-vpv-line bg-white px-3 py-2 text-[14px] outline-none focus:border-vpv-blue"
                    />
                  </label>
                )}
                <label className="block">
                  <span className="text-[12.5px] font-medium text-slate-600">Code starts with (optional)</span>
                  <input
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                    placeholder="GGN"
                    maxLength={10}
                    className="mt-1 w-full rounded-xl border border-vpv-line bg-white px-3 py-2 text-[14px] uppercase outline-none focus:border-vpv-blue"
                  />
                </label>
                <label className="block">
                  <span className="text-[12.5px] font-medium text-slate-600">Lands on</span>
                  <input
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="/"
                    className="mt-1 w-full rounded-xl border border-vpv-line bg-white px-3 py-2 text-[14px] outline-none focus:border-vpv-blue"
                  />
                </label>
              </div>
              <p className="mt-3 text-[12.5px] text-slate-500">
                Codes are random (for example GGN-7K3QX9) and never contain a name, because the code is
                shared with Google and Microsoft so recordings can be filtered by it. Names stay in this
                database only.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-full bg-vpv-grad px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Making…" : "Make codes"}
                </button>
                {formError && <span className="text-[13px] text-red-700">{formError}</span>}
              </div>
            </form>
          )}

          {made && (
            <div className="mt-5 rounded-xl border border-vpv-line bg-vpv-canvas p-4">
              <p className="text-[14px] font-semibold">
                {made.rows.length} code{made.rows.length === 1 ? "" : "s"} made for &ldquo;{made.campaign}&rdquo;
              </p>
              {made.overflow > 0 && (
                <p className="mt-1 text-[13px] text-amber-700">
                  {made.overflow} more line{made.overflow === 1 ? " was" : "s were"} left out: a batch holds
                  2,000 people. Paste the rest as a second batch.
                </p>
              )}
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">
                Download the file and give each person&rsquo;s <strong>link</strong> to your QR tool as the
                address their QR opens. Keep this file: it is the only list that connects a code to a name
                outside this database.
              </p>
              <button
                type="button"
                onClick={downloadCsv}
                className="mt-3 rounded-full bg-vpv-grad px-5 py-2 text-[13.5px] font-semibold text-white"
              >
                Download CSV (name, company, code, link)
              </button>
              <ul className="mt-3 max-h-44 overflow-auto font-mono text-[12px] text-slate-600">
                {made.rows.slice(0, 50).map((r) => (
                  <li key={r.code}>
                    {r.name}
                    {r.company ? ` · ${r.company}` : ""} → {r.url}
                  </li>
                ))}
                {made.rows.length > 50 && <li>…and {made.rows.length - 50} more, all in the file</li>}
              </ul>
            </div>
          )}
        </div>

        {error && (
          <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-700">{error}</p>
        )}

        {/* ── Batch picker ────────────────────────────────────────── */}
        {batches.length > 0 && (
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <label className="text-[13px] font-medium text-slate-600" htmlFor="batch">Batch</label>
            <select
              id="batch"
              value={batch}
              onChange={(e) => void pickBatch(e.target.value)}
              className="rounded-xl border border-vpv-line bg-white px-3 py-2 text-[14px] outline-none focus:border-vpv-blue"
            >
              <option value="">All batches ({batches.reduce((n, b) => n + b.count, 0)})</option>
              {batches.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name} ({b.count})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void load(batch)}
              className="rounded-full border border-vpv-line px-4 py-1.5 text-[13px] font-semibold text-slate-700 hover:bg-white"
            >
              Refresh
            </button>
          </div>
        )}

        {!rows && !error && <p className="mt-6 text-[14px] text-slate-500">Loading…</p>}

        {/* ── Summary ─────────────────────────────────────────────── */}
        {summary && rows && rows.length > 0 && (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {tile("Buyers", String(summary.people))}
              {tile("Opened", `${summary.opened}`, `${summary.openedPct}% of buyers`)}
              {tile("Warm or hot", String(summary.warm), "read, or started the assessment")}
              {tile("Hot", String(summary.hot), "chose a plan or paid")}
              {tile("Paid", String(summary.paid), summary.revenueInr > 0 ? inr(summary.revenueInr) : undefined)}
              {tile("Average stay", formatDuration(summary.avgSeconds), "of those with time recorded")}
            </div>

            {summary.topPages.length > 0 && (
              <div className="mt-4 rounded-2xl border border-vpv-line bg-white p-5">
                <h2 className="text-[15px] font-semibold">What held their attention</h2>
                <p className="mt-1 text-[13px] text-slate-600">
                  Total time all these buyers spent on each page. This is what they are curious about, so lead with it.
                </p>
                <ul className="mt-3 space-y-2">
                  {summary.topPages.map((p) => {
                    const max = summary.topPages[0]!.seconds || 1;
                    return (
                      <li key={p.path} className="text-[13.5px]">
                        <div className="flex justify-between gap-3">
                          <span className="font-medium">{p.label}</span>
                          <span className="tabular-nums text-slate-600">
                            {formatDuration(p.seconds)} · {p.people} {p.people === 1 ? "person" : "people"}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-vpv-blue" style={{ width: `${Math.max(4, (p.seconds / max) * 100)}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        )}

        {/* ── Table ───────────────────────────────────────────────── */}
        {rows && rows.length > 0 && (
          <div className="mt-6 overflow-x-auto rounded-2xl border border-vpv-line bg-white">
            <table className="w-full text-left text-[14px]">
              <thead className="border-b border-vpv-line bg-vpv-canvas text-[12.5px] text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Buyer</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">First opened</th>
                  <th className="px-4 py-3 text-right font-medium">Visits</th>
                  <th className="px-4 py-3 text-right font-medium">Time on site</th>
                  <th className="px-4 py-3 font-medium">Spent longest on</th>
                  <th className="px-4 py-3 font-medium">Got as far as</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vpv-line">
                {rows.map((r) => {
                  const open = openCode === r.code;
                  return (
                    <RowBlock key={r.code} r={r} open={open} onToggle={() => void toggleRow(r.code)} journey={open ? journey : null} journeyError={open ? journeyError : null} />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {rows && rows.length === 0 && !error && (
          <p className="mt-6 rounded-xl border border-vpv-line bg-white px-4 py-6 text-[14px] text-slate-600">
            No personal codes yet. Choose &ldquo;New list&rdquo; above, paste your buyers, and make their codes.
          </p>
        )}
      </div>
    </div>
  );
}

function RowBlock({
  r,
  open,
  onToggle,
  journey,
  journeyError,
}: {
  r: BuyerStat;
  open: boolean;
  onToggle: () => void;
  journey: JourneyItem[] | null;
  journeyError: string | null;
}) {
  const badge = BADGE[r.interest];
  return (
    <>
      <tr className="cursor-pointer hover:bg-vpv-canvas/60" onClick={onToggle}>
        <td className="px-4 py-3">
          <span className="font-medium">{r.name}</span>
          {r.company && <span className="text-slate-500"> · {r.company}</span>}
          <span className="mt-0.5 block font-mono text-[12px] text-slate-500">{r.code}</span>
        </td>
        <td className="px-4 py-3">
          <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium ${badge.cls}`}>{badge.text}</span>
        </td>
        <td className="px-4 py-3 text-slate-600">{when(r.firstOpenedAt)}</td>
        <td className="px-4 py-3 text-right tabular-nums">{r.visits || "—"}</td>
        <td className="px-4 py-3 text-right tabular-nums">{formatDuration(r.activeSeconds)}</td>
        <td className="px-4 py-3 text-slate-700">
          {r.topPage ? (
            <>
              {r.topPage.label}
              {r.topPage.seconds > 0 && <span className="text-slate-500"> · {formatDuration(r.topPage.seconds)}</span>}
            </>
          ) : (
            "—"
          )}
        </td>
        <td className="px-4 py-3 text-slate-700">
          {r.paid ? "Paid" : r.stage ? (STAGE_TEXT[r.stage] ?? r.stage) : "—"}
        </td>
      </tr>
      {open && (
        <tr className="bg-vpv-canvas/50">
          <td colSpan={7} className="px-4 py-4">
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">Their visit</h3>
                {journeyError && <p className="mt-2 text-[13px] text-red-700">{journeyError}</p>}
                {!journey && !journeyError && <p className="mt-2 text-[13px] text-slate-500">Loading…</p>}
                {journey && journey.length === 0 && (
                  <p className="mt-2 text-[13px] text-slate-600">
                    {r.scans > 0
                      ? "They scanned the code, but no page activity was recorded. They may have chosen Decline, or left before the page loaded."
                      : "Nothing yet."}
                  </p>
                )}
                {journey && journey.length > 0 && (
                  <ol className="mt-2 space-y-1.5 text-[13.5px]">
                    {journey.map((j, i) => (
                      <li key={i} className="flex flex-wrap gap-x-3">
                        <span className="w-28 shrink-0 text-slate-500">{when(j.at)}</span>
                        <span className={j.kind === "step" ? "font-semibold text-vpv-blue" : "font-medium"}>{j.label}</span>
                        {j.seconds != null && <span className="text-slate-600">stayed {formatDuration(j.seconds)}</span>}
                        {j.scroll != null && j.scroll > 0 && <span className="text-slate-500">read {j.scroll}%</span>}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <div>
                <h3 className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">Who they are</h3>
                {r.lead ? (
                  <dl className="mt-2 grid grid-cols-[7rem_1fr] gap-y-1 text-[13.5px]">
                    {([
                      ["Name", r.lead.name],
                      ["Company", r.lead.company],
                      ["Phone", r.lead.phone],
                      ["E-mail", r.lead.email],
                      ["Industry", r.lead.industry],
                      ["Factory city", r.lead.factoryCity],
                      ["Plan", r.lead.plan],
                      ["Quoted", r.lead.quotedInr != null ? inr(r.lead.quotedInr) : null],
                    ] as [string, string | null][])
                      .filter(([, v]) => v)
                      .map(([k, v]) => (
                        <div key={k} className="contents">
                          <dt className="text-slate-500">{k}</dt>
                          <dd className="font-medium">{v}</dd>
                        </div>
                      ))}
                  </dl>
                ) : (
                  <p className="mt-2 text-[13px] text-slate-600">
                    They have not filled in the assessment, so we only know what they looked at
                    {r.city ? ` (from ${r.city})` : ""}.
                  </p>
                )}
                {r.pages.length > 0 && (
                  <>
                    <h3 className="mt-5 text-[13px] font-semibold uppercase tracking-wide text-slate-500">Pages, by time spent</h3>
                    <ul className="mt-2 space-y-1 text-[13.5px]">
                      {r.pages.map((p) => (
                        <li key={p.path} className="flex justify-between gap-3">
                          <span>{p.label}</span>
                          <span className="tabular-nums text-slate-600">
                            {p.seconds > 0 ? formatDuration(p.seconds) : "—"}
                            {p.scroll > 0 ? ` · read ${p.scroll}%` : ""}
                            {p.views > 1 ? ` · ${p.views} visits` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
