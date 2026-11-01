/**
 * /admin/channels/<channel> — one channel's campaigns, or a reserved page for
 * a channel that is not built yet.
 *
 * Live channels (email, WhatsApp) list their campaigns with the same numbers
 * as every other channel. QR & print keeps its own page, so that id sends you
 * to the campaigns list. Placeholder channels say what they will show and what
 * they need, so nothing here pretends to be tracking data it is not.
 *
 * Platform owner only.
 */

"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { channelById, foldersOfChannel, totalsByChannel } from "@/lib/channels";
import {
  CampaignCard,
  Cell,
  NotOwner,
  Notice,
  inr,
  pctOf,
  useOwnerCampaigns,
} from "@/components/admin/channelBits";

export default function ChannelPage() {
  const params = useParams<{ channel: string }>();
  const router = useRouter();
  const channel = channelById(params.channel ?? "");
  const { me, folders, error, migration } = useOwnerCampaigns(`/admin/channels/${params.channel}`);

  useEffect(() => {
    if (channel?.id === "qr") router.replace("/admin/marketing/folders");
  }, [channel, router]);

  if (me && me.role !== "owner") return <NotOwner />;

  if (!channel) {
    return (
      <main className="grid min-h-screen place-items-center bg-vpv-canvas px-6 text-center">
        <div>
          <h1 className="text-[20px] font-semibold text-vpv-ink">No such channel</h1>
          <Link href="/admin/channels" className="mt-3 inline-block text-[14px] text-vpv-blue underline">
            ← Channels
          </Link>
        </div>
      </main>
    );
  }

  const mine = folders ? foldersOfChannel(folders, channel.id) : [];
  const t = folders ? totalsByChannel(folders)[channel.id] : null;
  const newCampaignHref = `/admin/marketing/folders?new=${channel.folderChannels[0] ?? "other"}`;

  return (
    <main className="min-h-screen bg-vpv-canvas px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin/channels" className="text-[13px] font-medium text-vpv-blue underline underline-offset-2">
          ← Channels
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold tracking-tight">{channel.title}</h1>
            <p className="mt-1 max-w-2xl text-[14px] text-vpv-muted">{channel.tagline}</p>
          </div>
          {channel.status === "live" && (
            <Link
              href={newCampaignHref}
              className="rounded-full bg-vpv-blue px-5 py-2.5 text-[13.5px] font-semibold text-white hover:opacity-90"
            >
              New campaign
            </Link>
          )}
        </div>

        {migration && <Notice kind="warn">{migration}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}

        {channel.status === "live" && (
          <>
            {t && t.campaigns > 0 && (
              <section className="mt-7 rounded-2xl border border-vpv-line bg-white p-5 shadow-sm sm:p-6">
                <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 lg:grid-cols-7">
                  <Cell label="Campaigns" value={String(t.campaigns)} />
                  <Cell label="People" value={String(t.people)} />
                  <Cell label="Opened" value={String(t.opened)} sub={pctOf(t.opened, t.people)} strong />
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
                <p className="text-[15px] font-medium text-vpv-ink">No {channel.title} campaigns yet.</p>
                <p className="mx-auto mt-2 max-w-lg text-[13.5px] text-vpv-muted">
                  Create a campaign for this channel, then make one personal link per person on the{" "}
                  <Link href="/admin/marketing/buyers" className="text-vpv-blue underline">
                    Buyers
                  </Link>{" "}
                  page and put each person&rsquo;s own link in their message. Everything they do on the
                  website after clicking is tied to them here.
                </p>
              </div>
            )}

            {mine.length > 0 && (
              <div className="mt-8 grid gap-4">
                {mine.map((f) => (
                  <CampaignCard key={f.id} f={f} />
                ))}
              </div>
            )}
          </>
        )}

        {channel.status !== "live" && (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <section className="rounded-2xl border border-dashed border-vpv-line bg-white p-5 sm:p-6">
              <h2 className="text-[15px] font-semibold">What this page will show</h2>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13.5px] text-vpv-muted">
                {(channel.willShow ?? []).map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </section>
            <section className="rounded-2xl border border-dashed border-vpv-line bg-white p-5 sm:p-6">
              <h2 className="text-[15px] font-semibold">What it needs first</h2>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13.5px] text-vpv-muted">
                {(channel.needs ?? []).map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </section>
            {mine.length > 0 && (
              <div className="grid gap-4 md:col-span-2">
                {mine.map((f) => (
                  <CampaignCard key={f.id} f={f} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
