/**
 * /admin/channels/email — every e-mail campaign, and how each one is doing.
 *
 * An e-mail campaign is made by uploading a list of addresses (Excel or CSV),
 * not by the QR-code form, so it has its own "New e-mail campaign" page. Zoho
 * says who OPENED the e-mail; VPV says who then CLICKED, read and bought.
 *
 * Platform owner only.
 */

"use client";

import Link from "next/link";
import { foldersOfChannel, totalsByChannel } from "@/lib/channels";
import { Cell, NotOwner, Notice, inr, pctOf, useOwnerCampaigns, when } from "@/components/admin/channelBits";

export default function EmailChannelPage() {
  const { me, folders, error, migration } = useOwnerCampaigns("/admin/channels/email");
  if (me && me.role !== "owner") return <NotOwner />;

  const mine = folders ? foldersOfChannel(folders, "email") : [];
  const t = folders ? totalsByChannel(folders).email : null;

  return (
    <main className="min-h-screen bg-vpv-canvas px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin/channels" className="text-[13px] font-medium text-vpv-blue underline underline-offset-2">
          ← Channels
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold tracking-tight">Email (Zoho)</h1>
            <p className="mt-1 max-w-2xl text-[14px] text-vpv-muted">
              Upload a list, get one tracked link per person, send through Zoho. Zoho tells you who opened
              the e-mail; this page tells you who then visited the website, what they read and how
              interested they are.
            </p>
          </div>
          <Link
            href="/admin/channels/email/new"
            className="rounded-full bg-vpv-blue px-5 py-2.5 text-[13.5px] font-semibold text-white hover:opacity-90"
          >
            New e-mail campaign
          </Link>
        </div>

        {migration && <Notice kind="warn">{migration}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}

        {t && t.campaigns > 0 && (
          <section className="mt-7 rounded-2xl border border-vpv-line bg-white p-5 shadow-sm sm:p-6">
            <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 lg:grid-cols-7">
              <Cell label="Campaigns" value={String(t.campaigns)} />
              <Cell label="Recipients" value={String(t.people)} />
              <Cell label="Clicked" value={String(t.opened)} sub={pctOf(t.opened, t.people)} strong />
              <Cell label="Visited site" value={String(t.visited)} sub={pctOf(t.visited, t.people)} strong />
              <Cell label="Left details" value={String(t.contacts)} />
              <Cell label="Reached the bill" value={String(t.reachedBilling)} />
              <Cell label="Paid" value={String(t.paid)} sub={t.revenueInr ? inr(t.revenueInr) : undefined} strong />
            </div>
          </section>
        )}

        {folders === null && !error && <p className="mt-8 text-[14px] text-vpv-muted">Loading…</p>}

        {folders && mine.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-vpv-line bg-white p-8 text-center">
            <p className="text-[15px] font-medium text-vpv-ink">No e-mail campaigns yet.</p>
            <p className="mx-auto mt-2 max-w-lg text-[13.5px] text-vpv-muted">
              Start one with an Excel or CSV file of e-mail addresses. You can add a shared coupon that
              ends after a few days, and download the file to import into Zoho.
            </p>
            <Link
              href="/admin/channels/email/new"
              className="mt-4 inline-block rounded-full bg-vpv-blue px-5 py-2.5 text-[13.5px] font-semibold text-white"
            >
              New e-mail campaign
            </Link>
          </div>
        )}

        {mine.length > 0 && (
          <div className="mt-8 grid gap-4">
            {mine.map((f) => (
              <Link
                key={f.id}
                href={`/admin/channels/email/${f.slug}`}
                className="block rounded-2xl border border-vpv-line bg-white p-5 shadow-sm transition hover:border-vpv-blue/50 hover:shadow sm:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[17px] font-semibold text-vpv-ink">{f.name}</h3>
                    <p className="mt-0.5 text-[12.5px] text-vpv-muted">
                      {f.distributedAt ? `sent ${when(f.distributedAt)}` : "not sent yet"}
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
                <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-5">
                  <Cell label="Recipients" value={String(f.codes)} />
                  <Cell label="Clicked" value={String(f.scannedCodes)} sub={pctOf(f.scannedCodes, f.codes)} strong />
                  <Cell label="Visited site" value={String(f.visited)} sub={pctOf(f.visited, f.codes)} strong />
                  <Cell label="Left details" value={String(f.contacts)} />
                  <Cell label="Reached the bill" value={String(f.reachedBilling)} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
