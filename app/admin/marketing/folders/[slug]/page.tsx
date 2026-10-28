/**
 * /admin/marketing/folders/<slug> — one campaign, and every person in it.
 *
 * The main thing on this page is the list of people the QR codes were printed
 * for, in the order the letters were printed. For each one, on the right:
 *
 *   • when they opened it, or a dash if they never did;
 *   • a dot — green if the website loaded for them, red if it did not;
 *   • how far they got, how long they stayed, how interested they look;
 *   • how to reach them, once they have told us.
 *
 * Click a person for the whole journey. The other tabs answer the questions
 * that are about the campaign rather than one person: where people drop off,
 * what they asked, what they opened it on, and which cards never arrived.
 *
 * Platform owner only.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getMyProfile, type Profile } from "@/lib/auth";
import { formatDuration } from "@/lib/buyerReport";
import { deviceLabel } from "@/lib/analytics/userAgent";
import {
  DELIVERY_LABELS,
  OUTREACH_LABELS,
  type DeliveryState,
  type FolderDetail,
  type FolderPerson,
  type OutreachState,
} from "@/lib/campaignFolders";
import {
  ROSTER_FILTERS,
  ROSTER_FILTER_LABELS,
  ROSTER_SORT_LABELS,
  ago,
  filterRoster,
  interestCounts,
  istDateTime,
  istToday,
  matchesFilter,
  openedAt,
  rosterCsv,
  sortRoster,
  telHref,
  type RosterFilter,
  type RosterSort,
} from "@/lib/campaignView";
import { Empty, InterestChip, NotOwner, Panel, Stat, Tab, VisitedDot } from "@/components/admin/campaign/parts";

const PAGE_SIZE = 200;

export default function CampaignPage({ params }: { params: { slug: string } }) {
  const router = useRouter();
  const slug = params.slug;
  const [me, setMe] = useState<Profile | null>(null);
  const [d, setD] = useState<FolderDetail | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"people" | "insights" | "pages" | "delivery">("people");
  const [filter, setFilter] = useState<RosterFilter>("all");
  const [sort, setSort] = useState<RosterSort>("print");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [printed, setPrinted] = useState("");
  const [savingPrinted, setSavingPrinted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const token = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/marketing/folders/${encodeURIComponent(slug)}`, {
        headers: { Authorization: `Bearer ${await token()}` },
      });
      const body = (await res.json()) as {
        ok?: boolean;
        detail?: FolderDetail;
        truncated?: boolean;
        message?: string;
      };
      if (!res.ok || !body.ok || !body.detail) {
        setError(body.message ?? "Could not load this campaign.");
        return;
      }
      setD(body.detail);
      setTruncated(!!body.truncated);
      setPrinted(body.detail.folder.printed_count === null ? "" : String(body.detail.folder.printed_count));
      setError(null);
    } catch {
      setError("Could not reach the server.");
    }
  }, [slug, token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getMyProfile();
      if (!p) {
        router.push(`/login?next=/admin/marketing/folders/${slug}`);
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
  }, [router, load, slug]);

  // A new filter or search starts from the top of the list.
  useEffect(() => setShown(PAGE_SIZE), [filter, sort, query]);

  const today = useMemo(() => istToday(), []);

  const roster = d?.roster ?? [];
  const visible = useMemo(
    () => sortRoster(filterRoster(roster, filter, query, today), sort),
    [roster, filter, query, sort, today]
  );
  const counts = useMemo(() => {
    const c = {} as Record<RosterFilter, number>;
    for (const f of ROSTER_FILTERS) c[f] = roster.filter((p) => matchesFilter(p, f, today)).length;
    return c;
  }, [roster, today]);

  async function savePrinted() {
    setSavingPrinted(true);
    try {
      await fetch(`/api/admin/marketing/folders/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ printedCount: printed === "" ? null : printed }),
      });
      await load();
    } finally {
      setSavingPrinted(false);
    }
  }

  async function markDelivery(state: DeliveryState, codes?: string[]) {
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/marketing/folders/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ delivery: codes ? { state, codes } : { state, all: true } }),
      });
      const body = (await res.json()) as { ok?: boolean; message?: string; codesUpdated?: number };
      if (!res.ok || !body.ok) {
        setNotice(body.message ?? "Could not save that.");
        return;
      }
      setNotice(`${body.codesUpdated ?? 0} marked “${DELIVERY_LABELS[state]}”.`);
      await load();
    } catch {
      setNotice("Could not reach the server.");
    }
  }

  function exportCsv() {
    const blob = new Blob([rosterCsv(visible)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (me && me.role !== "owner") return <NotOwner />;

  if (error) {
    return (
      <main className="min-h-screen bg-vpv-canvas px-5 py-10">
        <div className="mx-auto max-w-3xl">
          <Link href="/admin/marketing/folders" className="text-[13px] font-medium text-vpv-blue underline">
            ← Campaigns
          </Link>
          <p className="mt-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-[13.5px] text-red-800">
            {error}
          </p>
        </div>
      </main>
    );
  }

  if (!d) {
    return (
      <main className="min-h-screen bg-vpv-canvas px-5 py-10">
        <p className="mx-auto max-w-3xl text-[14px] text-vpv-muted">Loading…</p>
      </main>
    );
  }

  const f = d.folder;
  const s = d.stat;
  const top = d.funnel[0]?.count ?? 1;
  const levels = interestCounts(roster);
  const nothingYet = s.scans === 0 && s.botScans === 0 && s.visited === 0;
  const stuck = counts.stuck;

  return (
    <main className="min-h-screen bg-vpv-canvas px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-[1400px]">
        <Link href="/admin/marketing/folders" className="text-[13px] font-medium text-vpv-blue underline underline-offset-2">
          ← Campaigns
        </Link>

        <h1 className="mt-3 text-[28px] font-semibold tracking-tight">{f.name}</h1>
        <p className="mt-1 text-[13.5px] text-vpv-muted">
          {[f.city, f.state, f.channel, f.distributed_at ? `handed out ${f.distributed_at}` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>

        {/* ── the numbers worth reading first ─────────────────────────── */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="People" value={String(roster.length)} sub={f.printed_count !== null ? `${f.printed_count} printed` : undefined} />
          <Stat
            label="Opened"
            value={String(s.scannedCodes)}
            sub={roster.length ? `${Math.round((s.scannedCodes / roster.length) * 100)}% of people` : undefined}
            tone={s.scannedCodes ? "good" : undefined}
          />
          <Stat
            label="Visited site"
            value={String(s.visited)}
            sub={stuck ? `${stuck} opened, never loaded` : undefined}
            tone={s.visited ? "good" : undefined}
          />
          <Stat label="Call today" value={String(counts.hot)} sub="hot, not yet closed" tone={counts.hot ? "bad" : undefined} />
          <Stat label="Left details" value={String(counts.contact)} sub="phone or e-mail" />
          <Stat label="Paid" value={String(s.paid)} sub={s.revenueInr ? `₹${s.revenueInr.toLocaleString("en-IN")}` : undefined} tone={s.paid ? "good" : undefined} />
        </div>

        {truncated && (
          <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
            This campaign has more activity than one page can load. The numbers are a lower bound.
          </p>
        )}

        {nothingYet && (
          <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-900">
            Nothing has been recorded for this campaign yet, so every dot below is red. If cards have
            already been scanned, the QR code is probably not reaching us: it must forward to{" "}
            <span className="font-mono">myvpv.com/q/&lt;code&gt;</span> for a scan to be counted.
          </p>
        )}

        {d.headlines.length > 0 && (
          <ul className="mt-5 space-y-2 rounded-2xl border border-vpv-line bg-white p-5 shadow-sm sm:p-6">
            {d.headlines.map((h, i) => (
              <li key={i} className="flex gap-2.5 text-[14.5px] leading-relaxed text-vpv-ink">
                <span aria-hidden className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-vpv-blue" />
                {h}
              </li>
            ))}
          </ul>
        )}

        {f.printed_count === null && (
          <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-5">
            <p className="text-[14px] font-medium text-amber-900">How many pieces were printed?</p>
            <p className="mt-1 text-[13px] text-amber-800">
              Until this is recorded there is no scan rate. Nothing below is guessed from the number
              of people on the list.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                value={printed}
                onChange={(e) => setPrinted(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                placeholder="220"
                className="w-32 rounded-lg border border-amber-300 px-3 py-2 text-[14px] tabular-nums"
              />
              <button
                type="button"
                onClick={savePrinted}
                disabled={savingPrinted || printed === ""}
                className="rounded-full bg-amber-900 px-5 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {savingPrinted ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}

        {/* ── tabs ────────────────────────────────────────────────────── */}
        <div className="mt-8 flex flex-wrap gap-2 border-b border-vpv-line">
          <Tab on={tab === "people"} onClick={() => setTab("people")}>
            People ({roster.length})
          </Tab>
          <Tab on={tab === "insights"} onClick={() => setTab("insights")}>
            Where they drop off
          </Tab>
          <Tab on={tab === "pages"} onClick={() => setTab("pages")}>
            Pages ({d.pages.length})
          </Tab>
          <Tab on={tab === "delivery"} onClick={() => setTab("delivery")}>
            Delivery ({d.neverOpened.length} not opened)
          </Tab>
        </div>

        {/* ───────────────────────── people ───────────────────────────── */}
        {tab === "people" && (
          <div className="mt-5">
            <div className="flex flex-wrap items-center gap-2">
              {ROSTER_FILTERS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(k)}
                  className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium ${
                    filter === k
                      ? "border-vpv-blue bg-vpv-blue text-white"
                      : "border-vpv-line bg-white text-vpv-ink hover:bg-vpv-canvas"
                  }`}
                >
                  {ROSTER_FILTER_LABELS[k]} <span className="tabular-nums opacity-70">{counts[k]}</span>
                </button>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, company, phone, e-mail or code"
                className="min-w-[260px] flex-1 rounded-lg border border-vpv-line bg-white px-3 py-2 text-[13.5px]"
              />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as RosterSort)}
                className="rounded-lg border border-vpv-line bg-white px-3 py-2 text-[13.5px]"
              >
                {(Object.keys(ROSTER_SORT_LABELS) as RosterSort[]).map((k) => (
                  <option key={k} value={k}>
                    {ROSTER_SORT_LABELS[k]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={exportCsv}
                disabled={!visible.length}
                className="rounded-full border border-vpv-line bg-white px-4 py-2 text-[12.5px] font-semibold text-vpv-ink hover:bg-vpv-canvas disabled:opacity-50"
              >
                Download CSV ({visible.length})
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-vpv-muted">
              {levels
                .filter((l) => l.people > 0)
                .map((l) => (
                  <span key={l.level} className="inline-flex items-center gap-1.5">
                    <InterestChip level={l.level} /> <span className="tabular-nums">{l.people}</span>
                  </span>
                ))}
            </div>

            {visible.length === 0 ? (
              <div className="mt-4">
                <Empty>
                  {roster.length === 0
                    ? "No one is on this campaign's list yet."
                    : "No one matches that filter."}
                </Empty>
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-2xl border border-vpv-line bg-white shadow-sm">
                <table className="w-full min-w-[1040px] text-left text-[13.5px]">
                  <thead className="border-b border-vpv-line bg-vpv-canvas text-[12px] text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">#</th>
                      <th className="px-4 py-3 font-medium">Person</th>
                      <th className="px-4 py-3 font-medium">Opened</th>
                      <th className="px-4 py-3 font-medium">Website</th>
                      <th className="px-4 py-3 font-medium">Got as far as</th>
                      <th className="px-4 py-3 text-right font-medium">Time on site</th>
                      <th className="px-4 py-3 font-medium">Interest</th>
                      <th className="px-4 py-3 font-medium">Contact</th>
                      <th className="px-4 py-3 font-medium">Follow-up</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.slice(0, shown).map((p) => (
                      <PersonRow
                        key={p.code}
                        p={p}
                        href={`/admin/marketing/folders/${encodeURIComponent(slug)}/people/${encodeURIComponent(p.code)}`}
                        onOpen={(href) => router.push(href)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {visible.length > shown && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => setShown((n) => n + PAGE_SIZE)}
                  className="rounded-full border border-vpv-line bg-white px-5 py-2 text-[13px] font-semibold text-vpv-ink hover:bg-vpv-canvas"
                >
                  Show {Math.min(PAGE_SIZE, visible.length - shown)} more of {visible.length - shown}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ───────────────────────── insights ─────────────────────────── */}
        {tab === "insights" && (
          <div className="mt-5 space-y-6">
            <section className="rounded-2xl border border-vpv-line bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-[19px] font-semibold tracking-tight">From the press to the money</h2>
              <p className="mt-1 text-[13px] text-vpv-muted">
                Each bar is a share of what was printed. The percentage on the right is how many of
                the step above made it to this one.
              </p>

              <ol className="mt-5 space-y-2.5">
                {d.funnel.map((step) => (
                  <li key={step.key}>
                    <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                      <span className={step.biggestLoss ? "font-semibold text-vpv-ink" : "text-vpv-ink"}>
                        {step.label}
                      </span>
                      <span className="flex-none tabular-nums text-vpv-muted">
                        <span className="font-semibold text-vpv-ink">{step.count}</span>
                        {step.ofPreviousPct !== null && <> · {step.ofPreviousPct}%</>}
                      </span>
                    </div>
                    <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${step.biggestLoss ? "bg-amber-500" : "bg-vpv-blue"}`}
                        style={{ width: `${top > 0 ? Math.max(1.5, (step.count / top) * 100) : 0}%` }}
                      />
                    </div>
                    {step.note && <p className="mt-1.5 text-[12.5px] font-medium text-amber-700">{step.note}</p>}
                  </li>
                ))}
              </ol>
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="What they asked" hint="Questions opened on the page. These are the objections to answer on the call.">
                {d.objections.length === 0 ? (
                  <Empty>Nobody has opened a question yet.</Empty>
                ) : (
                  <ul className="divide-y divide-vpv-line">
                    {d.objections.map((o) => (
                      <li key={o.question} className="flex items-baseline justify-between gap-3 py-2.5">
                        <span className="text-[13.5px] text-vpv-ink">{o.question}</span>
                        <span className="flex-none text-[13px] tabular-nums text-vpv-muted">{o.people}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title="What they opened it on" hint="A computer on a pamphlet code usually means the card was passed on.">
                {d.devices.length === 0 ? (
                  <Empty>No opens recorded yet.</Empty>
                ) : (
                  <ul className="divide-y divide-vpv-line">
                    {d.devices.map((x) => (
                      <li key={x.device} className="flex items-baseline justify-between gap-3 py-2.5">
                        <span className="text-[13.5px] text-vpv-ink">{deviceLabel(x.device)}</span>
                        <span className="flex-none text-[13px] tabular-nums text-vpv-muted">{x.people}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </div>
        )}

        {/* ───────────────────────── pages ────────────────────────────── */}
        {tab === "pages" && (
          <div className="mt-5">
            {d.pages.length === 0 ? (
              <Empty>No pages viewed yet.</Empty>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-vpv-line bg-white shadow-sm">
                <table className="w-full text-left text-[13.5px]">
                  <thead className="border-b border-vpv-line bg-vpv-canvas text-[12px] text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Page</th>
                      <th className="px-4 py-3 text-right font-medium">Views</th>
                      <th className="px-4 py-3 text-right font-medium">Time spent</th>
                      <th className="px-4 py-3 text-right font-medium">Read down to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.pages.map((p) => (
                      <tr key={p.path} className="border-b border-vpv-line last:border-0">
                        <td className="px-4 py-2.5 text-vpv-ink">{p.label}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{p.views}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatDuration(p.seconds)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-vpv-muted">
                          {p.scroll ? `${p.scroll}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ───────────────────────── delivery ─────────────────────────── */}
        {tab === "delivery" && (
          <div className="mt-5">
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-vpv-line bg-white p-4">
              <p className="flex-1 text-[13px] text-vpv-muted">
                A piece only counts as having reached a desk once somebody records it. Marking them
                keeps the numbers honest — a card still in the box is not a card that was ignored.
              </p>
              <button
                type="button"
                onClick={() => markDelivery("delivered")}
                className="flex-none rounded-full border border-vpv-line px-4 py-2 text-[12.5px] font-semibold text-vpv-ink hover:bg-vpv-canvas"
              >
                Mark all delivered
              </button>
            </div>
            {notice && <p className="mb-4 text-[13px] text-vpv-muted">{notice}</p>}

            {d.neverOpened.length === 0 ? (
              <Empty>Every card in this campaign has been opened. That is unusually good.</Empty>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-vpv-line bg-white shadow-sm">
                <table className="w-full text-left text-[13.5px]">
                  <thead className="border-b border-vpv-line bg-vpv-canvas text-[12px] text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">#</th>
                      <th className="px-4 py-3 font-medium">Printed for</th>
                      <th className="px-4 py-3 font-medium">Code</th>
                      <th className="px-4 py-3 font-medium">Phone</th>
                      <th className="px-4 py-3 font-medium">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.neverOpened.map((p) => (
                      <tr key={p.code} className="border-b border-vpv-line last:border-0">
                        <td className="px-4 py-2.5 tabular-nums text-vpv-muted">{p.printSeq ?? "—"}</td>
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/admin/marketing/folders/${encodeURIComponent(slug)}/people/${encodeURIComponent(p.code)}`}
                            className="font-medium text-vpv-ink hover:underline"
                          >
                            {p.name ?? "—"}
                          </Link>
                          {p.company && <span className="text-vpv-muted"> · {p.company}</span>}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[12.5px] text-vpv-muted">{p.code}</td>
                        <td className="px-4 py-2.5 text-vpv-muted">{p.contact.phone ?? "—"}</td>
                        <td className="px-4 py-2.5 text-vpv-muted">
                          {DELIVERY_LABELS[p.deliveryState as DeliveryState] ?? p.deliveryState}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

/* ─────────────────────────────── one row ────────────────────────────────── */

function PersonRow({ p, href, onOpen }: { p: FolderPerson; href: string; onOpen: (href: string) => void }) {
  const opened = openedAt(p);
  const phone = p.contact.phone;
  const tel = telHref(phone);
  const out = OUTREACH_LABELS[p.outreach.state as OutreachState] ?? p.outreach.state;

  return (
    <tr
      onClick={() => onOpen(href)}
      className="cursor-pointer border-b border-vpv-line align-top last:border-0 hover:bg-vpv-canvas"
    >
      <td className="px-4 py-3 tabular-nums text-vpv-muted">{p.printSeq ?? "—"}</td>

      <td className="px-4 py-3">
        <Link
          href={href}
          onClick={(e) => e.stopPropagation()}
          className="font-medium text-vpv-ink hover:underline"
        >
          {p.contact.name ?? p.name ?? p.code}
        </Link>
        {p.paid && (
          <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            paid
          </span>
        )}
        {(p.contact.company ?? p.company) && (
          <div className="text-[12.5px] text-vpv-muted">{p.contact.company ?? p.company}</div>
        )}
      </td>

      <td className="whitespace-nowrap px-4 py-3">
        {opened ? (
          <>
            <div className="text-vpv-ink">{istDateTime(opened)}</div>
            <div className="text-[11.5px] text-vpv-muted">
              {ago(opened)}
              {p.scans > 1 ? ` · scanned ${p.scans}×` : ""}
            </div>
          </>
        ) : (
          <span className="text-vpv-muted" aria-label="Not opened">
            —
          </span>
        )}
      </td>

      <td className="whitespace-nowrap px-4 py-3">
        <VisitedDot visited={p.visited} opened={p.opened} />
      </td>

      <td className="px-4 py-3 text-[13px]">
        {p.opened ? p.stageLabel : <span className="text-vpv-muted">—</span>}
      </td>

      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
        {p.activeSeconds > 0 ? formatDuration(p.activeSeconds) : <span className="text-vpv-muted">—</span>}
      </td>

      <td className="px-4 py-3">
        <InterestChip level={p.interest} score={p.interestScore} />
      </td>

      <td className="px-4 py-3 text-[12.5px]">
        {phone || p.contact.email ? (
          <div className="space-y-0.5">
            {phone &&
              (tel ? (
                <a href={tel} onClick={(e) => e.stopPropagation()} className="block text-vpv-blue underline underline-offset-2">
                  {phone}
                </a>
              ) : (
                <span className="block text-vpv-ink">{phone}</span>
              ))}
            {p.contact.email && <span className="block break-all text-vpv-ink">{p.contact.email}</span>}
            {p.contact.source === "form" && <span className="text-[11px] text-emerald-700">filled the website form</span>}
          </div>
        ) : (
          <span className="text-vpv-muted">—</span>
        )}
      </td>

      <td className="px-4 py-3 text-[12.5px]">
        <span className={p.outreach.state === "new" ? "text-vpv-muted" : "text-vpv-ink"}>{out}</span>
        {p.outreach.followUpOn && <div className="text-[11.5px] text-vpv-muted">call back {p.outreach.followUpOn}</div>}
      </td>
    </tr>
  );
}
