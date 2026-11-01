/**
 * /admin/channels — every way people reach the website, in one place.
 *
 * The goal of every channel is the same: get the right person onto the
 * website, then see how interested they are. So each channel is shown in the
 * same shape (campaigns, people, opened, visited, left details, reached the
 * bill, paid), and the totals add up across all of them.
 *
 * QR & print is a physical channel and stays here with its own journeys.
 * Channels that are not built yet are reserved cards, so the dashboard
 * already has its final shape.
 *
 * Platform owner only.
 */

"use client";

import Link from "next/link";
import { INTEREST_LABELS, INTEREST_MEANING } from "@/lib/interest";
import { CHANNELS, sumTotals, totalsByChannel, type ChannelDef } from "@/lib/channels";
import { Cell, NotOwner, Notice, inr, pctOf, useOwnerCampaigns } from "@/components/admin/channelBits";

const STATUS_LABEL: Record<ChannelDef["status"], string> = {
  live: "Live",
  building: "Being built",
  placeholder: "Coming",
};

export default function ChannelsHubPage() {
  const { me, folders, error, migration } = useOwnerCampaigns("/admin/channels");

  if (me && me.role !== "owner") return <NotOwner />;

  const byChannel = folders ? totalsByChannel(folders) : null;
  const all = byChannel ? sumTotals(byChannel) : null;

  return (
    <main className="min-h-screen bg-vpv-canvas px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin" className="text-[13px] font-medium text-vpv-blue underline underline-offset-2">
          ← Admin
        </Link>
        <h1 className="mt-3 text-[28px] font-semibold tracking-tight">Channels</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-vpv-muted">
          Every way people reach the website, side by side. Each channel asks the same questions: how
          many did we reach, how many opened the website, how interested are they, and who should be
          called today.
        </p>

        {migration && <Notice kind="warn">{migration}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}

        {all && (
          <section className="mt-7 rounded-2xl border border-vpv-line bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">All channels</h2>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 lg:grid-cols-7">
              <Cell label="Campaigns" value={String(all.campaigns)} />
              <Cell label="People" value={String(all.people)} />
              <Cell label="Opened" value={String(all.opened)} sub={pctOf(all.opened, all.people)} strong />
              <Cell label="Visited site" value={String(all.visited)} sub={pctOf(all.visited, all.people)} strong />
              <Cell label="Left details" value={String(all.contacts)} />
              <Cell label="Reached the bill" value={String(all.reachedBilling)} />
              <Cell label="Paid" value={String(all.paid)} sub={all.revenueInr ? inr(all.revenueInr) : undefined} strong />
            </div>
          </section>
        )}

        {folders === null && !error && <p className="mt-8 text-[14px] text-vpv-muted">Loading…</p>}

        <div className="mt-7 grid gap-4 md:grid-cols-2">
          {CHANNELS.map((c) => {
            const t = byChannel?.[c.id];
            const hasData = !!t && t.campaigns > 0;
            return (
              <Link
                key={c.id}
                href={c.href}
                className={`block rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow sm:p-6 ${
                  c.status === "placeholder" && !hasData
                    ? "border-dashed border-vpv-line hover:border-slate-400"
                    : "border-vpv-line hover:border-vpv-blue/50"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[17px] font-semibold text-vpv-ink">{c.title}</h2>
                    <p className="mt-1 text-[13px] leading-relaxed text-vpv-muted">{c.tagline}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      c.status === "live"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {c.physical ? "Physical · " : ""}
                    {STATUS_LABEL[c.status]}
                  </span>
                </div>

                {hasData && t ? (
                  <div className="mt-5 grid grid-cols-3 gap-x-4 gap-y-4 sm:grid-cols-4">
                    <Cell label="Campaigns" value={String(t.campaigns)} />
                    <Cell label="People" value={String(t.people)} />
                    <Cell label="Opened" value={String(t.opened)} sub={pctOf(t.opened, t.people)} strong />
                    <Cell label="Visited" value={String(t.visited)} sub={pctOf(t.visited, t.people)} strong />
                    <Cell label="Left details" value={String(t.contacts)} />
                    <Cell label="Bill" value={String(t.reachedBilling)} />
                    <Cell label="Paid" value={String(t.paid)} />
                    <Cell label="Revenue" value={t.revenueInr ? inr(t.revenueInr) : "—"} />
                  </div>
                ) : (
                  <p className="mt-5 text-[13px] text-slate-500">
                    {c.status === "live"
                      ? "No campaigns yet. Open this channel to start one."
                      : "Reserved. Open it to see what it will track."}
                  </p>
                )}
              </Link>
            );
          })}
        </div>

        <section className="mt-9 rounded-2xl border border-vpv-line bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-[16px] font-semibold">How a person becomes Hot, Warm or Cold</h2>
          <p className="mt-1 max-w-3xl text-[13.5px] text-vpv-muted">
            No single number decides it. Several things are weighed together, and the reasons are shown
            beside every person so you can disagree with them.
          </p>
          <div className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {(["customer", "hot", "warm", "curious", "glanced", "unopened"] as const).map((l) => (
              <p key={l} className="text-[13.5px]">
                <span className="font-semibold text-vpv-ink">{INTEREST_LABELS[l]}.</span>{" "}
                <span className="text-vpv-muted">{INTEREST_MEANING[l]}</span>
              </p>
            ))}
          </div>
          <p className="mt-4 text-[13px] text-vpv-muted">
            Weighed together: time on site, pages read, how far they scrolled, clicks, demo and video
            views, time on the price, FAQ questions opened, return visits, and the strongest steps
            (phone or email left, a plan chosen, the bill reached). Cold means Curious, Glanced or Not
            opened.
          </p>
        </section>
      </div>
    </main>
  );
}
