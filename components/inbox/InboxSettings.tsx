/**
 * Inbox settings: the automatic reply (wording, on/off, how fast we promise to
 * answer, in which office hours), the signature on every reply, and who is on
 * the team. Inbox admins change the first three; only the platform owner
 * changes the team.
 */

"use client";

import { useState } from "react";
import { buildAck, dueFor, type InboxSettings as Settings } from "@/lib/inboxMail";
import { api, type Me, type TeamMember } from "./api";

const DAYS = [
  [1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [0, "Sun"],
] as const;

const field = "w-full rounded-lg border border-vpv-line bg-white px-3 py-2 text-[14px] outline-none focus:ring-2 focus:ring-vpv-blue/30 disabled:bg-slate-50";

export default function InboxSettings({
  me,
  settings,
  team,
  onSaved,
  onTeam,
  onClose,
}: {
  me: Me;
  settings: Settings;
  team: TeamMember[];
  onSaved: (s: Settings) => void;
  onTeam: (t: TeamMember[]) => void;
  onClose: () => void;
}) {
  const [s, setS] = useState<Settings>(settings);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [nEmail, setNEmail] = useState("");
  const [nName, setNName] = useState("");
  const [nRole, setNRole] = useState<"agent" | "admin">("agent");
  const [teamMsg, setTeamMsg] = useState<string | null>(null);
  const can = me.isAdmin;

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }));

  async function save() {
    setSaving(true);
    setMsg(null);
    const { support_address: _ignored, ...body } = s;
    void _ignored;
    const r = await api<{ settings: Settings }>("/api/inbox/settings", { method: "PUT", body });
    setSaving(false);
    if (!r.ok) return setMsg({ kind: "err", text: r.message });
    setS(r.data.settings);
    onSaved(r.data.settings);
    setMsg({ kind: "ok", text: "Saved. New messages use these settings." });
  }

  async function addMember() {
    setTeamMsg(null);
    const r = await api<{ team: TeamMember[] }>("/api/inbox/members", { method: "POST", body: { email: nEmail, name: nName, role: nRole } });
    if (!r.ok) return setTeamMsg(r.message);
    onTeam(r.data.team);
    setNEmail("");
    setNName("");
  }

  async function removeMember(email: string) {
    if (!window.confirm(`Remove ${email} from the inbox? Their conversations become unassigned.`)) return;
    setTeamMsg(null);
    const r = await api<{ team: TeamMember[] }>("/api/inbox/members", { method: "DELETE", body: { email } });
    if (!r.ok) return setTeamMsg(r.message);
    onTeam(r.data.team);
  }

  // A live preview, built by the same function that writes the real thing.
  const now = new Date();
  let preview = "";
  try {
    const due = dueFor(now, s);
    preview = buildAck(s, { name: "Asha Rao", ticketNo: 1042, subject: "Do you shoot plants in Pune?", due, now }).text;
  } catch {
    preview = "";
  }

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-900/40 px-3 py-6 sm:px-6" role="dialog" aria-modal="true" aria-label="Inbox settings">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-5 shadow-xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[22px] font-semibold text-vpv-ink">Inbox settings</h2>
            <p className="mt-1 text-[13.5px] text-vpv-muted">Mail to {s.support_address} lands in the inbox. Everyone below signs in with their VPV login, never the hosting panel.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-1 text-[13px] text-vpv-muted hover:bg-slate-100">Close</button>
        </div>

        <h3 className="mt-6 text-[15px] font-semibold text-vpv-ink">Automatic reply</h3>
        {!can && <p className="mt-1 text-[13px] text-vpv-muted">Only inbox admins can change this.</p>}
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-[14px] sm:col-span-2">
            <input type="checkbox" checked={s.ack_enabled} disabled={!can} onChange={(e) => set("ack_enabled", e.target.checked)} />
            Send an automatic acknowledgement to new senders
          </label>
          <label className="block text-[13px] font-medium text-vpv-ink sm:col-span-2">
            Message
            <textarea className={`${field} mt-1 font-normal leading-6`} rows={7} disabled={!can} value={s.ack_body} onChange={(e) => set("ack_body", e.target.value)} />
            <span className="mt-1 block text-[12px] font-normal text-vpv-muted">Placeholders: {"{name}"} (first name), {"{ticket}"} (VPV-1042), {"{eta}"} (for example &ldquo;today by 2:00 PM IST&rdquo;).</span>
          </label>
          <label className="block text-[13px] font-medium text-vpv-ink">
            We promise a reply within (working hours)
            <input type="number" min={1} max={240} className={`${field} mt-1`} disabled={!can} value={s.reply_target_hours} onChange={(e) => set("reply_target_hours", Number(e.target.value))} />
          </label>
          <label className="block text-[13px] font-medium text-vpv-ink">
            Sender name
            <input className={`${field} mt-1`} disabled={!can} value={s.from_name} onChange={(e) => set("from_name", e.target.value)} />
          </label>
          <label className="block text-[13px] font-medium text-vpv-ink">
            Office opens (hour, 0–23)
            <input type="number" min={0} max={23} className={`${field} mt-1`} disabled={!can} value={s.office_start_hour} onChange={(e) => set("office_start_hour", Number(e.target.value))} />
          </label>
          <label className="block text-[13px] font-medium text-vpv-ink">
            Office closes (hour, 1–24)
            <input type="number" min={1} max={24} className={`${field} mt-1`} disabled={!can} value={s.office_end_hour} onChange={(e) => set("office_end_hour", Number(e.target.value))} />
          </label>
          <fieldset className="sm:col-span-2">
            <legend className="text-[13px] font-medium text-vpv-ink">Working days</legend>
            <div className="mt-1 flex flex-wrap gap-3">
              {DAYS.map(([n, label]) => (
                <label key={n} className="flex items-center gap-1.5 text-[13.5px]">
                  <input type="checkbox" disabled={!can} checked={s.office_days.includes(n)} onChange={(e) => set("office_days", e.target.checked ? [...s.office_days, n].sort() : s.office_days.filter((d) => d !== n))} />
                  {label}
                </label>
              ))}
            </div>
            <p className="mt-1 text-[12px] text-vpv-muted">Times are India time (IST). The promised time skips closed hours and days, so we never promise a reply at midnight.</p>
          </fieldset>
          <label className="block text-[13px] font-medium text-vpv-ink sm:col-span-2">
            Signature on every reply
            <textarea className={`${field} mt-1 font-normal`} rows={3} disabled={!can} value={s.signature} onChange={(e) => set("signature", e.target.value)} />
          </label>
        </div>

        {preview && (
          <div className="mt-4 rounded-xl bg-vpv-canvas p-4">
            <div className="text-[11.5px] font-semibold uppercase tracking-wide text-vpv-muted">What a sender receives, right now</div>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-[13.5px] leading-6 text-vpv-ink">{preview}</pre>
          </div>
        )}

        {msg && <p role="status" className={`mt-4 rounded-lg border px-3 py-2 text-[13px] ${msg.kind === "ok" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-red-300 bg-red-50 text-red-800"}`}>{msg.text}</p>}
        {can && (
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={save} disabled={saving} className="rounded-full bg-vpv-blue px-6 py-2.5 text-[13.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        )}

        <h3 className="mt-8 text-[15px] font-semibold text-vpv-ink">Team</h3>
        <ul className="mt-3 divide-y divide-vpv-line rounded-xl border border-vpv-line">
          {team.map((t) => (
            <li key={t.email} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[14px]">
              <span>
                <span className="font-medium text-vpv-ink">{t.name}</span> <span className="text-vpv-muted">{t.email}</span>
              </span>
              <span className="flex items-center gap-3 text-[12.5px] text-vpv-muted">
                {t.role === "owner" ? "Owner" : t.role === "admin" ? "Admin" : "Agent"}
                {me.isOwner && t.role !== "owner" && (
                  <button type="button" onClick={() => removeMember(t.email)} className="text-red-600 hover:underline">Remove</button>
                )}
              </span>
            </li>
          ))}
        </ul>
        {me.isOwner ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-[1.4fr_1fr_auto_auto]">
            <input className={field} type="email" placeholder="their e-mail (as they sign in)" value={nEmail} onChange={(e) => setNEmail(e.target.value)} aria-label="E-mail" />
            <input className={field} placeholder="name" value={nName} onChange={(e) => setNName(e.target.value)} aria-label="Name" />
            <select className={field} value={nRole} onChange={(e) => setNRole(e.target.value as "agent" | "admin")} aria-label="Role">
              <option value="agent">Agent</option>
              <option value="admin">Admin</option>
            </select>
            <button type="button" onClick={addMember} disabled={!nEmail.trim()} className="rounded-full bg-vpv-navy px-5 py-2 text-[13.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50">Add</button>
          </div>
        ) : (
          <p className="mt-2 text-[12.5px] text-vpv-muted">Only the platform owner adds or removes people.</p>
        )}
        {teamMsg && <p className="mt-2 text-[13px] text-red-700" role="alert">{teamMsg}</p>}
        <p className="mt-3 text-[12.5px] text-vpv-muted">
          A new person signs in at myvpv.com/login with Google or their VPV e-mail (the address above), then opens myvpv.com/admin/inbox. Agents read and answer; admins can also edit the automatic reply.
        </p>
      </div>
    </div>
  );
}
