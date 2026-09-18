"use client";

/**
 * NotificationsBell — the working bell in the dashboard top bar.
 *
 * Shows high-signal notifications only: a sales member started presenting,
 * and meeting reminders / meeting-started. Unread count is tracked per
 * browser (localStorage "last seen"). Refreshes on a 60s poll AND in
 * real-time when a new session_start row lands in tour_events.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Play, CalendarClock, CalendarCheck, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  loadNotifications,
  getLastSeen,
  markAllSeen,
  type AppNotification,
} from "@/lib/notifications";

export default function NotificationsBell({
  orgId,
  currentUserId,
}: {
  orgId: string;
  currentUserId?: string;
}) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    try {
      const rows = await loadNotifications(orgId);
      setItems(rows);
    } catch {
      /* silent — bell just stays as-is */
    }
  }

  useEffect(() => {
    setLastSeen(getLastSeen());
    refresh();
    // Poll every 60s so meeting countdowns stay fresh.
    const iv = window.setInterval(refresh, 60_000);
    // Realtime: any new session_start → refresh immediately.
    const ch = supabase
      .channel(`notif-${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tour_events",
          filter: "event_type=eq.session_start",
        },
        () => refresh()
      )
      .subscribe();
    return () => {
      window.clearInterval(iv);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const unread = items.filter((n) => +new Date(n.at) > lastSeen).length;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      // Opening clears the unread badge.
      markAllSeen();
      setLastSeen(Date.now());
    }
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={toggle}
        className="relative w-10 h-10 rounded-full border border-vpv-line bg-white grid place-items-center text-vpv-muted hover:text-vpv-blue hover:border-vpv-blue/40 transition-all"
        title="Notifications"
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-vpv-blue text-white text-[10px] font-semibold grid place-items-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[340px] max-w-[90vw] rounded-2xl border border-vpv-line bg-white shadow-[0_20px_60px_-16px_rgba(11,61,145,0.3)] overflow-hidden z-20">
          <div className="px-4 py-3 border-b border-vpv-line flex items-center justify-between">
            <div className="text-[13px] font-semibold text-vpv-ink">
              Notifications
            </div>
            <div className="text-[11px] text-vpv-muted">
              {items.length === 0 ? "All clear" : `${items.length} recent`}
            </div>
          </div>

          <div className="max-h-[380px] overflow-y-auto panel-scroll">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Check size={22} className="mx-auto text-vpv-blue/40 mb-2" />
                <div className="text-[12.5px] text-vpv-ink">You're all caught up</div>
                <div className="text-[11px] text-vpv-muted mt-0.5">
                  We'll ping you when a presenter goes live or a meeting is due.
                </div>
              </div>
            ) : (
              items.map((n) => <Row key={n.id} n={n} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ n }: { n: AppNotification }) {
  const { icon, ring } = iconFor(n.kind);
  const inner = (
    <div className="px-4 py-3 flex items-start gap-3 hover:bg-vpv-tint/40 transition-colors">
      <div
        className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${ring}`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-medium text-vpv-ink leading-snug">
          {n.title}
        </div>
        <div className="text-[11.5px] text-vpv-muted truncate">{n.body}</div>
        <div className="text-[10.5px] text-vpv-muted/80 mt-0.5">
          {relative(n.at)}
        </div>
      </div>
    </div>
  );
  return n.href ? (
    <Link href={n.href} className="block border-b border-vpv-line last:border-0">
      {inner}
    </Link>
  ) : (
    <div className="border-b border-vpv-line last:border-0">{inner}</div>
  );
}

function iconFor(kind: AppNotification["kind"]) {
  if (kind === "presenting") {
    return {
      icon: <Play size={14} className="text-vpv-blue" />,
      ring: "bg-vpv-blue/10",
    };
  }
  if (kind === "meeting_soon") {
    return {
      icon: <CalendarClock size={14} className="text-vpv-cyan" />,
      ring: "bg-vpv-cyan/10",
    };
  }
  return {
    icon: <CalendarCheck size={14} className="text-emerald-600" />,
    ring: "bg-emerald-500/10",
  };
}

function relative(iso: string): string {
  const s = Math.floor((Date.now() - +new Date(iso)) / 1000);
  if (s < 0) {
    const mins = Math.round(-s / 60);
    return mins <= 0 ? "now" : `in ${mins}m`;
  }
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
