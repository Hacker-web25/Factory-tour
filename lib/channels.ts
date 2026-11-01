/**
 * lib/channels.ts — the sales and marketing channels, and how campaigns roll up into them.
 *
 * Every campaign (a "folder") already says how it reaches people: pamphlet,
 * tradeshow, courier, visit, email, whatsapp, other. A CHANNEL is the level
 * above that. It is what the owner thinks in: "QR & print", "Email", "Meta
 * ads". This file is the one list of channels, so the hub, the channel pages
 * and the tests cannot disagree about what exists.
 *
 * Pure: no database, no React.
 */

import type { FolderStat } from "@/lib/campaignFolders";

export const CHANNEL_IDS = ["qr", "email", "meta", "retargeting", "whatsapp", "more"] as const;
export type ChannelId = (typeof CHANNEL_IDS)[number];

/**
 * live        campaigns can be created and measured today
 * building    the page exists, the tracking behind it is the next piece of work
 * placeholder reserved so the dashboard has its final shape
 */
export type ChannelStatus = "live" | "building" | "placeholder";

export type ChannelDef = {
  id: ChannelId;
  title: string;
  /** One line under the title. */
  tagline: string;
  status: ChannelStatus;
  /** Campaign channels (FOLDER_CHANNELS) that belong here. Empty = not folder-backed yet. */
  folderChannels: readonly string[];
  /** Physical channels cost money per piece and cannot be recalled. */
  physical?: boolean;
  /** Where the card goes. */
  href: string;
  /** For channels that are not live: what the page will show, and what it needs. */
  willShow?: string[];
  needs?: string[];
};

export const CHANNELS: readonly ChannelDef[] = [
  {
    id: "qr",
    title: "QR & print",
    tagline: "Letters, pamphlets and trade-show cards, each with a personal QR.",
    status: "live",
    folderChannels: ["pamphlet", "tradeshow", "courier", "visit"],
    physical: true,
    href: "/admin/marketing/folders",
  },
  {
    id: "email",
    title: "Email (Zoho)",
    tagline: "Bulk email with a personal link per person. Opens stay in Zoho; the website journey is here.",
    status: "live",
    folderChannels: ["email"],
    href: "/admin/channels/email",
  },
  {
    id: "meta",
    title: "Instagram & Meta ads",
    tagline: "Reels and ads shown to your own list. Spend, reach, clicks and what visitors did.",
    status: "placeholder",
    folderChannels: [],
    href: "/admin/channels/meta",
    willShow: [
      "Spend, reach, clicks and cost per visitor for each ad campaign",
      "Visitors who arrived from an ad: pages read, time, how far they got",
      "Hot, warm and cold visitors from ads, and the return on every rupee spent",
    ],
    needs: [
      "The Meta Pixel and server-side events installed on the website",
      "Daily spend: a CSV from Ads Manager to start, the Meta API later",
      "Ad links that carry a campaign tag (utm_campaign)",
    ],
  },
  {
    id: "retargeting",
    title: "Retargeting",
    tagline: "Ads shown to people who already visited the website.",
    status: "placeholder",
    folderChannels: [],
    href: "/admin/channels/retargeting",
    willShow: [
      "How many website visitors Meta can show retargeting ads to",
      "Spend, reach and clicks on retargeting ads",
      "How many of those people came back and paid",
    ],
    needs: [
      "The Meta Pixel on the website (the same one as the Meta ads channel)",
      "A cookie-consent rule for the Pixel",
      "The visited-the-website audience created in Meta",
    ],
  },
  {
    id: "whatsapp",
    title: "WhatsApp",
    tagline: "Personal links sent by message.",
    status: "live",
    folderChannels: ["whatsapp"],
    href: "/admin/channels/whatsapp",
  },
  {
    id: "more",
    title: "More channels",
    tagline: "Google Ads, LinkedIn, partners and anything else you start using.",
    status: "placeholder",
    folderChannels: ["other"],
    href: "/admin/channels/more",
    willShow: [
      "One page per new channel, built the same way as the others",
      "Anything filed under “other” in a campaign shows here already",
    ],
    needs: ["Tell us the channel and how people reach the website from it"],
  },
] as const;

export function channelById(id: string): ChannelDef | null {
  return CHANNELS.find((c) => c.id === id) ?? null;
}

/** Which channel a campaign belongs to. Unknown channels fall into "more". */
export function channelOfFolder(folderChannel: string): ChannelId {
  for (const c of CHANNELS) if (c.folderChannels.includes(folderChannel)) return c.id;
  return "more";
}

export type ChannelTotals = {
  campaigns: number;
  /** People or pieces with a personal code. */
  people: number;
  opened: number;
  visited: number;
  /** Left a phone number or email on the website. */
  contacts: number;
  reachedBilling: number;
  paid: number;
  revenueInr: number;
};

export const EMPTY_TOTALS: ChannelTotals = {
  campaigns: 0,
  people: 0,
  opened: 0,
  visited: 0,
  contacts: 0,
  reachedBilling: 0,
  paid: 0,
  revenueInr: 0,
};

export function addToTotals(t: ChannelTotals, f: FolderStat): ChannelTotals {
  return {
    campaigns: t.campaigns + 1,
    people: t.people + f.codes,
    opened: t.opened + f.scannedCodes,
    visited: t.visited + f.visited,
    contacts: t.contacts + f.contacts,
    reachedBilling: t.reachedBilling + f.reachedBilling,
    paid: t.paid + f.paid,
    revenueInr: t.revenueInr + f.revenueInr,
  };
}

/** Archived campaigns stay out of the numbers on the dashboard. */
export function totalsByChannel(folders: FolderStat[]): Record<ChannelId, ChannelTotals> {
  const out = Object.fromEntries(CHANNEL_IDS.map((id) => [id, { ...EMPTY_TOTALS }])) as Record<
    ChannelId,
    ChannelTotals
  >;
  for (const f of folders) {
    if (!f.active) continue;
    const id = channelOfFolder(f.channel);
    out[id] = addToTotals(out[id], f);
  }
  return out;
}

export function sumTotals(all: Record<ChannelId, ChannelTotals>): ChannelTotals {
  return CHANNEL_IDS.reduce<ChannelTotals>(
    (acc, id) => ({
      campaigns: acc.campaigns + all[id].campaigns,
      people: acc.people + all[id].people,
      opened: acc.opened + all[id].opened,
      visited: acc.visited + all[id].visited,
      contacts: acc.contacts + all[id].contacts,
      reachedBilling: acc.reachedBilling + all[id].reachedBilling,
      paid: acc.paid + all[id].paid,
      revenueInr: acc.revenueInr + all[id].revenueInr,
    }),
    { ...EMPTY_TOTALS }
  );
}

/** The campaigns that belong to one channel, newest first as given. */
export function foldersOfChannel(folders: FolderStat[], id: ChannelId): FolderStat[] {
  return folders.filter((f) => channelOfFolder(f.channel) === id);
}
