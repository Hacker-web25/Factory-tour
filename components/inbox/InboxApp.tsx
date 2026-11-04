/**
 * VPV Inbox — the shared mailbox for support@myvpv.com. Conversation list on
 * the left, the open conversation on the right (one at a time on a phone).
 * Refreshes itself every 30 seconds while the tab is visible.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { DEFAULT_SETTINGS, type InboxSettings as Settings } from "@/lib/inboxMail";
import { api, initialsOf, isOverdue, shortTime, ticketLabel, type Counts, type Me, type TeamMember, type Thread } from "./api";
import ThreadView from "./ThreadView";
import InboxSettings from "./InboxSettings";

const TABS: { key: Thread["status"]; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "waiting", label: "Waiting" },
  { key: "solved", label: "Solved" },
  { key: "spam", label: "Spam" },
];

export default function InboxApp() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [tab, setTab] = useState<Thread["status"]>("open");
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState("");
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [counts, setCounts] = useState<Counts>({ open: 0, waiting: 0, solved: 0, spam: 0, unread: 0 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [signedInAs, setSignedInAs] = useState("");

  const loadList = useCallback(async () => {
    const r = await api<{ threads: Thread[]; counts: Counts }>(`/api/inbox/threads?status=${tab}${mine ? "&mine=1" : ""}`);
    if (!r.ok) {
      setError({ status: r.status, message: r.message });
      return;
    }
    setError(null);
    setThreads(r.data.threads);
    setCounts(r.data.counts);
  }, [tab, mine]);

  // Who am I? Not signed in → the login page, then straight back here.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await getSession();
      if (!session) {
        router.push(`/login?next=${encodeURIComponent("/admin/inbox")}`);
        return;
      }
      if (cancelled) return;
      setSignedInAs(session.user.email ?? "");
      const r = await api<{ me: Me; settings: Settings; team: TeamMember[] }>("/api/inbox/settings");
      if (cancelled) return;
      if (!r.ok) return setError({ status: r.status, message: r.message });
      setMe(r.data.me);
      setSettings(r.data.settings);
      setTeam(r.data.team);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!me) return;
    setThreads(null);
    void loadList();
  }, [me, loadList]);

  useEffect(() => {
    if (!me) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void loadList();
    }, 30_000);
    return () => clearInterval(t);
  }, [me, loadList]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle || !threads) return threads;
    return threads.filter((t) => `${t.subject} ${t.customer_email} ${t.customer_name ?? ""} ${ticketLabel(t.ticket_no)}`.toLowerCase().includes(needle));
  }, [threads, q]);

  const current = threads?.find((t) => t.id === openId) ?? null;

  if (error && !me) {
    const denied = error.status === 403;
    return (
      <main className="grid min-h-screen place-items-center bg-vpv-canvas px-6 text-center">
        <div className="max-w-md">
          <h1 className="text-[22px] font-semibold text-vpv-ink">{denied ? "You do not have access to the inbox yet" : "The inbox could not open"}</h1>
          <p className="mt-2 text-[14px] text-vpv-muted">{error.message}</p>
          {denied && signedInAs && <p className="mt-2 text-[14px] text-vpv-muted">You are signed in as <strong>{signedInAs}</strong>. Ask the owner to add exactly this address.</p>}
        </div>
      </main>
    );
  }
  if (!me) return <main className="grid min-h-screen place-items-center bg-vpv-canvas text-[14px] text-vpv-muted">Opening the inbox…</main>;

  return (
    <main className="flex h-screen flex-col bg-vpv-canvas">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-vpv-line bg-white px-4 py-3 sm:px-6">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight text-vpv-ink">VPV Inbox</h1>
          <p className="text-[12.5px] text-vpv-muted">{settings.support_address} · signed in as {me.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => loadList()} className="rounded-full border border-vpv-line px-3 py-1.5 text-[13px] text-vpv-ink hover:bg-slate-50">Refresh</button>
          <button type="button" onClick={() => setShowSettings(true)} className="rounded-full border border-vpv-line px-3 py-1.5 text-[13px] text-vpv-ink hover:bg-slate-50">
            {me.isAdmin ? "Settings & team" : "Team"}
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[380px_1fr]">
        <aside className={`min-h-0 flex-col border-r border-vpv-line bg-white ${openId ? "hidden lg:flex" : "flex"}`}>
          <div className="flex gap-1 overflow-x-auto border-b border-vpv-line px-2 py-2" role="tablist" aria-label="Status">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => { setTab(t.key); setOpenId(null); }} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium ${tab === t.key ? "bg-vpv-tint text-vpv-navy" : "text-vpv-muted hover:bg-slate-100"}`}>
                {t.label} <span className="tabular-nums text-vpv-muted">{counts[t.key]}</span>
                {t.key === "open" && counts.unread > 0 && <span className="ml-1 rounded-full bg-vpv-blue px-1.5 text-[11px] text-white">{counts.unread} new</span>}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 border-b border-vpv-line px-3 py-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, e-mail, subject, VPV-1042" className="min-w-0 flex-1 rounded-lg border border-vpv-line px-3 py-1.5 text-[13.5px]" aria-label="Search" />
            <label className="flex items-center gap-1.5 whitespace-nowrap text-[13px] text-vpv-muted">
              <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Mine
            </label>
          </div>
          {error && <p className="m-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-800">{error.message}</p>}
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {!shown && <li className="px-4 py-6 text-[13.5px] text-vpv-muted">Loading…</li>}
            {shown && shown.length === 0 && (
              <li className="px-4 py-10 text-center text-[13.5px] text-vpv-muted">
                {q ? "Nothing matches that search." : tab === "open" ? "Nothing waiting for you. 🎉" : "Nothing here."}
              </li>
            )}
            {shown?.map((t) => {
              const overdue = isOverdue(t);
              return (
                <li key={t.id}>
                  <button type="button" onClick={() => setOpenId(t.id)} className={`block w-full border-b border-vpv-line px-4 py-3 text-left hover:bg-vpv-canvas ${openId === t.id ? "bg-vpv-tint/60" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`truncate text-[14px] ${t.unread ? "font-semibold text-vpv-ink" : "text-vpv-ink/90"}`}>
                        {t.unread && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-vpv-blue align-middle" aria-label="Unread" />}
                        {t.customer_name || t.customer_email}
                      </span>
                      <span className="shrink-0 text-[12px] text-vpv-muted">{shortTime(t.last_message_at)}</span>
                    </div>
                    <div className={`truncate text-[13.5px] ${t.unread ? "font-medium text-vpv-ink" : "text-vpv-muted"}`}>{t.subject || "(no subject)"}</div>
                    <div className="mt-1 flex items-center gap-2 text-[11.5px] text-vpv-muted">
                      <span>{ticketLabel(t.ticket_no)}</span>
                      {overdue && <span className="rounded bg-red-100 px-1.5 py-0.5 font-semibold text-red-700">Past promised time</span>}
                      {t.assignee_email && <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5" title={t.assignee_email}>{initialsOf(t.assignee_email)}</span>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <div className={`min-h-0 ${openId ? "block" : "hidden lg:block"}`}>
          {current ? (
            <ThreadView
              key={current.id}
              thread={current}
              me={me}
              team={team}
              onChanged={loadList}
              onBack={() => setOpenId(null)}
            />
          ) : (
            <div className="grid h-full place-items-center px-6 text-center text-[14px] text-vpv-muted">
              {openId ? "That conversation is in another tab. Pick a tab or clear the search." : "Choose a conversation to read it."}
            </div>
          )}
        </div>
      </div>

      {showSettings && (
        <InboxSettings me={me} settings={settings} team={team} onSaved={setSettings} onTeam={setTeam} onClose={() => setShowSettings(false)} />
      )}
    </main>
  );
}
