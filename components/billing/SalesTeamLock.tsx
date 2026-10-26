"use client";

/**
 * SalesTeamLock — what the MD sees on the Sales Team pages when the company
 * has not bought Sales Team logins: the page itself, dimmed behind glass,
 * and one card saying what it would show them, with the way to buy logins.
 *
 * Renders nothing while loading, for the platform owner, and for any
 * workspace that has logins.
 */

import { ArrowRight, LayoutDashboard, MapPin, Presentation, TrendingUp, Users } from "lucide-react";
import { useEntitlements } from "@/lib/useEntitlements";
import { LAUNCH_OFFER, SALES_TEAM, inr, seatPrice } from "@/lib/pricing";

const WHAT_YOU_GET = [
  { icon: LayoutDashboard, text: "Your whole sales team on one screen" },
  { icon: MapPin, text: "When and where every meeting started" },
  { icon: Users, text: "Every client, every meeting, in one place" },
  { icon: TrendingUp, text: "How far each deal has moved" },
  { icon: Presentation, text: "The same approved VPV, shown the same way" },
];

export default function SalesTeamLock() {
  const ent = useEntitlements();
  if (!ent.ready || ent.access("sales_team").state !== "locked") return null;
  const isAdmin = ent.facts.role === "org_admin";
  return (
    <div
      className="absolute inset-0 z-40 flex items-start justify-center bg-white/55 px-5 pt-24 backdrop-blur-[6px]"
      data-vpv-sales-lock
    >
      <div className="w-full max-w-lg rounded-3xl border border-vpv-line bg-white p-8 shadow-[0_30px_80px_-30px_rgba(11,61,145,0.45)]">
        <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-vpv-blue">Sales Team</div>
        <h2 className="mt-1 text-[24px] font-semibold tracking-tight text-vpv-ink">
          See every meeting your team holds
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-slate-600">
          Give each salesperson a login and this page fills with their presentations, their clients and their
          deals — without asking anyone for a report.
        </p>
        <ul className="mt-5 space-y-2.5">
          {WHAT_YOU_GET.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-[14px] text-slate-700">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-vpv-tint text-vpv-blue">
                <Icon size={16} />
              </span>
              {text}
            </li>
          ))}
        </ul>
        <p className="mt-5 text-[13px] text-slate-500">
          {inr(seatPrice())} per salesperson a year
          {LAUNCH_OFFER.active ? ` (normally ${inr(SALES_TEAM.regularInr)})` : ""} + GST.
        </p>
        {isAdmin ? (
          <a
            href="/billing/upgrade#logins"
            className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-full bg-vpv-grad py-3 text-[14.5px] font-semibold text-white hover:opacity-95"
          >
            Add Sales Team logins <ArrowRight size={15} />
          </a>
        ) : (
          <p className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-[13px] text-slate-600">
            Please ask your organisation&apos;s admin to add Sales Team logins.
          </p>
        )}
      </div>
    </div>
  );
}
