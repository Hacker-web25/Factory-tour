/**
 * One conversation: the messages, who has it, its status, and the box to
 * answer in. Incoming mail is shown as TEXT only (the server never sends us
 * its HTML), with the old message it quotes folded away.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { splitQuoted } from "@/lib/inboxMail";
import { api, initialsOf, isOverdue, longTime, ticketLabel, type Message, type Me, type TeamMember, type Thread } from "./api";

const STATUS_LABEL: Record<Thread["status"], string> = { open: "Open", waiting: "Waiting for customer", solved: "Solved", spam: "Spam" };

function Bubble({ m }: { m: Message }) {
  const [showQuote, setShowQuote] = useState(false);

  if (m.kind === "ack") {
    return (
      <div className="flex justify-center">
        <p className="rounded-full bg-white px-3 py-1 text-[12px] text-vpv-muted ring-1 ring-vpv-line">
          {m.delivery === "failed" ? "Automatic reply could not be sent" : "Automatic reply sent"} · {longTime(m.created_at)}
          {m.delivery === "failed" && m.error ? ` · ${m.error}` : ""}
        </p>
      </div>
    );
  }

  const isNote = m.kind === "note";
  const isOut = m.direction === "out";
  const { fresh, quoted } = isOut || isNote ? { fresh: m.text_body, quoted: "" } : splitQuoted(m.text_body);
  const who = isNote
    ? `Note by ${m.from_name || m.author_email}`
    : isOut
      ? `${m.author_email ?? "VPV Support"}`
      : `${m.from_name ? `${m.from_name} ` : ""}<${m.from_email}>`;

  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[92%] rounded-2xl px-4 py-3 text-[14px] leading-6 shadow-sm sm:max-w-[80%] ${
          isNote
            ? "border border-amber-300 bg-amber-50 text-amber-950"
            : isOut
              ? "bg-vpv-tint text-vpv-ink ring-1 ring-vpv-blue/20"
              : "bg-white text-vpv-ink ring-1 ring-vpv-line"
        }`}
      >
        <div className="mb-1 flex flex-wrap items-center gap-x-2 text-[12px] text-vpv-muted">
          <span className="font-medium text-vpv-ink/80">{who}</span>
          <span>{longTime(m.created_at)}</span>
          {isNote && <span className="rounded bg-amber-200 px-1.5 text-[10.5px] font-semibold uppercase text-amber-900">Internal</span>}
          {m.cc_emails?.length > 0 && <span>Cc {m.cc_emails.join(", ")}</span>}
          {m.delivery === "failed" && <span className="font-semibold text-red-600">Not sent{m.error ? `: ${m.error}` : ""}</span>}
        </div>
        <p className="whitespace-pre-wrap break-words">{fresh || "(empty message)"}</p>
        {quoted && (
          <>
            <button type="button" onClick={() => setShowQuote((v) => !v)} className="mt-2 rounded bg-slate-100 px-2 text-[12px] text-vpv-muted hover:bg-slate-200" aria-expanded={showQuote}>
              {showQuote ? "Hide earlier message" : "···"}
            </button>
            {showQuote && <p className="mt-2 whitespace-pre-wrap break-words border-l-2 border-vpv-line pl-3 text-[13px] text-vpv-muted">{quoted}</p>}
          </>
        )}
        {m.attachments?.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {m.attachments.map((a, i) => (
              <li key={i} className="rounded bg-slate-100 px-2 py-0.5 text-[12px] text-vpv-muted" title="Attachments are not stored in the inbox yet. Ask the sender to share a link, or open the e-mail in Resend.">
                📎 {a.filename}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function ThreadView({
  thread,
  me,
  team,
  onChanged,
  onBack,
}: {
  thread: Thread;
  me: Me;
  team: TeamMember[];
  onChanged: () => void;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [text, setText] = useState("");
  const [cc, setCc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [after, setAfter] = useState<"waiting" | "solved">("waiting");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const id = thread.id;

  const load = useCallback(async () => {
    const r = await api<{ messages: Message[] }>(`/api/inbox/threads/${id}`);
    if (!r.ok) {
      setLoadError(r.message);
      return;
    }
    setLoadError(null);
    setMessages(r.data.messages);
  }, [id]);

  // A different conversation: start clean, load it, and mark it read.
  useEffect(() => {
    setMessages(null);
    setText("");
    setCc("");
    setShowCc(false);
    setError(null);
    setMode("reply");
    setAfter("waiting");
    void load();
    if (thread.unread) void api(`/api/inbox/threads/${id}`, { method: "PATCH", body: { unread: false } }).then(onChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // New mail arrived while this conversation is open.
  useEffect(() => {
    if (messages) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.message_count, thread.last_message_at]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  async function patch(body: Record<string, unknown>) {
    setError(null);
    const r = await api(`/api/inbox/threads/${id}`, { method: "PATCH", body });
    if (!r.ok) setError(r.message);
    onChanged();
  }

  async function send() {
    if (busy || !text.trim()) return;
    setBusy(true);
    setError(null);
    const ccList = cc.split(/[,;\s]+/).filter(Boolean);
    const r = await api(`/api/inbox/threads/${id}/messages`, {
      method: "POST",
      body: mode === "note" ? { kind: "note", text } : { kind: "reply", text, cc: ccList, status: after },
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      void load();
      onChanged();
      return;
    }
    setText("");
    setCc("");
    await load();
    onChanged();
  }

  const overdue = isOverdue(thread);
  const customer = thread.customer_name ? `${thread.customer_name} <${thread.customer_email}>` : thread.customer_email;

  return (
    <section className="flex h-full min-h-0 flex-col bg-vpv-canvas">
      <header className="border-b border-vpv-line bg-white px-4 py-3 sm:px-5">
        <button type="button" onClick={onBack} className="mb-2 text-[13px] font-medium text-vpv-blue lg:hidden">
          ← All conversations
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-[17px] font-semibold text-vpv-ink">{thread.subject || "(no subject)"}</h2>
            <p className="mt-0.5 break-words text-[12.5px] text-vpv-muted">
              {ticketLabel(thread.ticket_no)} · {customer}
              {overdue && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold text-red-700">Past the promised time</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="assignee">Assigned to</label>
            <select id="assignee" value={thread.assignee_email ?? ""} onChange={(e) => patch({ assignee_email: e.target.value || null })} className="rounded-lg border border-vpv-line bg-white px-2 py-1.5 text-[13px]">
              <option value="">Unassigned</option>
              {team.map((t) => (
                <option key={t.email} value={t.email}>
                  {t.email === me.email ? "Me" : t.name}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="status">Status</label>
            <select id="status" value={thread.status} onChange={(e) => patch({ status: e.target.value })} className="rounded-lg border border-vpv-line bg-white px-2 py-1.5 text-[13px]">
              {(Object.keys(STATUS_LABEL) as Thread["status"][]).map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-5">
        {loadError && <p className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-[13.5px] text-red-800">{loadError}</p>}
        {!messages && !loadError && <p className="text-[13.5px] text-vpv-muted">Loading…</p>}
        {messages?.map((m) => <Bubble key={m.id} m={m} />)}
        <div ref={bottom} />
      </div>

      <footer className="border-t border-vpv-line bg-white px-3 py-3 sm:px-5">
        <div className="mb-2 flex gap-1" role="tablist" aria-label="Write">
          {(["reply", "note"] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className={`rounded-full px-3 py-1 text-[13px] font-medium ${mode === k ? (k === "note" ? "bg-amber-100 text-amber-900" : "bg-vpv-tint text-vpv-navy") : "text-vpv-muted hover:bg-slate-100"}`}>
              {k === "reply" ? "Reply to customer" : "Internal note"}
            </button>
          ))}
        </div>
        {mode === "reply" && (
          <p className="mb-2 text-[12px] text-vpv-muted">
            Sent from support@myvpv.com to {thread.customer_email}.{" "}
            {!showCc && <button type="button" className="font-medium text-vpv-blue underline underline-offset-2" onClick={() => setShowCc(true)}>Add Cc</button>}
          </p>
        )}
        {mode === "reply" && showCc && (
          <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Cc: one or more e-mail addresses" className="mb-2 w-full rounded-lg border border-vpv-line px-3 py-2 text-[13.5px]" aria-label="Cc" />
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void send();
          }}
          rows={5}
          placeholder={mode === "note" ? "Only your team will see this." : "Write your reply. Your signature is added for you."}
          className={`w-full resize-y rounded-xl border px-3 py-2 text-[14px] leading-6 outline-none focus:ring-2 ${mode === "note" ? "border-amber-300 bg-amber-50 focus:ring-amber-300" : "border-vpv-line focus:ring-vpv-blue/30"}`}
          aria-label={mode === "note" ? "Internal note" : "Reply"}
        />
        {error && <p className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-800" role="alert">{error}</p>}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {mode === "reply" ? (
            <label className="flex items-center gap-2 text-[13px] text-vpv-muted">
              After sending
              <select value={after} onChange={(e) => setAfter(e.target.value as "waiting" | "solved")} className="rounded-lg border border-vpv-line bg-white px-2 py-1 text-[13px]">
                <option value="waiting">Waiting for customer</option>
                <option value="solved">Solved</option>
              </select>
            </label>
          ) : (
            <span className="text-[12px] text-vpv-muted">Notes are never e-mailed.</span>
          )}
          <button type="button" onClick={send} disabled={busy || !text.trim()} className="rounded-full bg-vpv-blue px-5 py-2 text-[13.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {busy ? "Sending…" : mode === "note" ? "Save note" : "Send reply"}
          </button>
        </div>
        <p className="mt-1 text-right text-[11.5px] text-vpv-muted">Ctrl + Enter to send · {initialsOf(me.name)} {me.email}</p>
      </footer>
    </section>
  );
}
