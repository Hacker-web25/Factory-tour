"use client";

/**
 * ClientsTab — the salesperson's pipeline management screen.
 *
 * List / add / edit clients, mark them as Moved Ahead or Deal Closed,
 * see per-client presentation count + total viewing time. Filters by
 * pipeline stage. Every write is scoped by RLS to the current user's
 * own clients.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listClientsForPresenter,
  createClient,
  updateClient,
  deleteClient,
  markClientClosed,
  markClientMovedAhead,
  markClientLost,
  loadStatsForClients,
  STATUS_LABELS,
  STATUS_COLORS,
  type Client,
  type ClientStatus,
  type ClientStats,
} from "@/lib/clients";
import {
  Plus,
  Search,
  MoreVertical,
  Phone,
  Mail,
  X,
  Check,
  Handshake,
  ArrowUpRight,
  Trash2,
  Edit3,
  Play,
  Clock,
  Loader2,
} from "lucide-react";

type Props = {
  orgId: string;
  presenterId: string;
  /** Called when the presenter wants to start a presentation for a
   *  specific client — the parent decides which tour to open and
   *  navigates to `/tour/{id}?presenter={uid}&client={clientId}`. */
  onPresentToClient?: (client: Client) => void;
};

export default function ClientsTab({ orgId, presenterId, onPresentToClient }: Props) {
  const [clients, setClients] = useState<Client[]>([]);
  const [stats, setStats] = useState<Map<string, ClientStats>>(new Map());
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ClientStatus | "all">("all");
  const [editing, setEditing] = useState<Client | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listClientsForPresenter(presenterId);
      setClients(list);
      if (list.length > 0) {
        const s = await loadStatsForClients(list.map((c) => c.id));
        setStats(s);
      } else {
        setStats(new Map());
      }
    } finally {
      setLoading(false);
    }
  }, [presenterId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter((c) => {
      if (filter !== "all" && c.status !== filter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.company ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [clients, query, filter]);

  const totalByStatus = useMemo(() => {
    const t: Record<ClientStatus | "all", number> = {
      all: clients.length,
      active: 0,
      moved_ahead: 0,
      closed: 0,
      lost: 0,
    };
    for (const c of clients) t[c.status] += 1;
    return t;
  }, [clients]);

  return (
    <div className="bg-white border border-vpv-line rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-vpv-line flex items-center gap-3 flex-wrap">
        <div className="mr-auto">
          <h2 className="text-[16px] font-semibold text-vpv-ink">My Clients</h2>
          <p className="text-xs text-vpv-muted mt-0.5">
            Track every prospect you're pitching to and their pipeline stage.
          </p>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-vpv-muted absolute left-2.5 top-2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients…"
            className="pl-8 pr-3 py-1.5 rounded-full border border-vpv-line bg-white text-sm focus:outline-none focus:border-vpv-blue"
          />
        </div>
        <button
          onClick={() => setCreating(true)}
          className="text-[12px] text-white bg-vpv-grad hover:opacity-90 px-3.5 py-1.5 rounded-full flex items-center gap-1.5 font-medium shadow-[0_8px_24px_-8px_rgba(20,104,216,0.55)]"
        >
          <Plus size={12} /> Add client
        </button>
      </div>

      {/* Filter chips */}
      <div className="px-5 py-3 border-b border-vpv-line flex gap-2 flex-wrap bg-vpv-canvas/40">
        {(["all", "active", "moved_ahead", "closed", "lost"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === k
                ? "bg-vpv-navy text-white"
                : "bg-white border border-vpv-line text-vpv-muted hover:text-vpv-ink"
            }`}
          >
            {k === "all" ? "All" : STATUS_LABELS[k]}
            <span className="ml-1.5 opacity-70">{totalByStatus[k]}</span>
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="grid place-items-center py-20 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-vpv-muted">
          <div className="text-sm mb-1">
            {clients.length === 0
              ? "No clients yet."
              : "No clients match this filter."}
          </div>
          {clients.length === 0 && (
            <button
              onClick={() => setCreating(true)}
              className="text-xs text-vpv-blue hover:underline"
            >
              Add your first client
            </button>
          )}
        </div>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.12em] text-vpv-muted border-b border-vpv-line bg-vpv-canvas/40">
              <th className="text-left px-5 py-2.5 font-medium">Client</th>
              <th className="text-left px-3 py-2.5 font-medium">Company</th>
              <th className="text-left px-3 py-2.5 font-medium">Stage</th>
              <th className="text-left px-3 py-2.5 font-medium">Presentations</th>
              <th className="text-left px-3 py-2.5 font-medium">Viewing time</th>
              <th className="text-left px-3 py-2.5 font-medium">Last presented</th>
              <th className="text-right px-5 py-2.5 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const s = stats.get(c.id);
              const color = STATUS_COLORS[c.status];
              return (
                <tr
                  key={c.id}
                  className="border-b border-vpv-line last:border-0 hover:bg-vpv-canvas/40"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 text-white text-[11px] font-bold grid place-items-center">
                        {initials(c.name)}
                      </div>
                      <div>
                        <div className="font-medium text-vpv-ink">{c.name}</div>
                        {(c.email || c.phone) && (
                          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-vpv-muted">
                            {c.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {c.email}
                              </span>
                            )}
                            {c.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {c.phone}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-vpv-ink">{c.company ?? "—"}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${color.bg} ${color.text}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
                      {STATUS_LABELS[c.status]}
                    </span>
                  </td>
                  <td className="px-3 py-3 tabular-nums text-vpv-ink">
                    {s?.presentationCount ?? 0}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-vpv-muted">
                    {formatDur(s?.totalSeconds ?? 0)}
                  </td>
                  <td className="px-3 py-3 text-vpv-muted text-xs">
                    {s?.lastPresentedAt ? relativeDate(s.lastPresentedAt) : "—"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <ClientRowActions
                      client={c}
                      onPresent={() => onPresentToClient?.(c)}
                      onMarkMovedAhead={async () => {
                        await markClientMovedAhead(c.id);
                        refresh();
                      }}
                      onMarkClosed={async () => {
                        await markClientClosed(c.id);
                        refresh();
                      }}
                      onMarkLost={async () => {
                        await markClientLost(c.id);
                        refresh();
                      }}
                      onEdit={() => setEditing(c)}
                      onDelete={async () => {
                        if (!confirm(`Delete "${c.name}"? This can't be undone.`))
                          return;
                        await deleteClient(c.id);
                        refresh();
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {(creating || editing) && (
        <ClientEditorModal
          initial={editing ?? undefined}
          orgId={orgId}
          presenterId={presenterId}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

/* ---------- Row actions ---------------------------------------------- */

function ClientRowActions({
  client,
  onPresent,
  onMarkMovedAhead,
  onMarkClosed,
  onMarkLost,
  onEdit,
  onDelete,
}: {
  client: Client;
  onPresent: () => void;
  onMarkMovedAhead: () => void;
  onMarkClosed: () => void;
  onMarkLost: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="flex items-center justify-end gap-1.5">
      {/* Quick pipeline actions — the two the user asked for. */}
      {client.status !== "closed" && client.status !== "lost" && (
        <>
          {client.status === "active" && (
            <button
              onClick={onMarkMovedAhead}
              className="text-[11px] px-2 py-1 rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
              title="Move ahead — real interaction, part of dealing has happened"
            >
              <ArrowUpRight className="w-3 h-3 inline mr-0.5" />
              Moved ahead
            </button>
          )}
          <button
            onClick={onMarkClosed}
            className="text-[11px] px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
            title="Deal closed — sale successful"
          >
            <Handshake className="w-3 h-3 inline mr-0.5" />
            Closed
          </button>
        </>
      )}
      <button
        onClick={onPresent}
        className="text-[11px] px-2 py-1 rounded-md bg-vpv-navy text-white hover:opacity-90"
        title="Start a presentation for this client"
      >
        <Play className="w-3 h-3 inline mr-0.5" />
        Present
      </button>
      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="p-1 rounded hover:bg-vpv-tint text-vpv-muted"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute right-0 top-full mt-1 z-20 w-40 bg-white border border-vpv-line rounded-lg shadow-lg py-1 text-xs">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onEdit();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-vpv-tint flex items-center gap-2"
              >
                <Edit3 className="w-3 h-3" /> Edit
              </button>
              {client.status !== "lost" && client.status !== "closed" && (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onMarkLost();
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-vpv-tint flex items-center gap-2 text-rose-600"
                >
                  <X className="w-3 h-3" /> Mark lost
                </button>
              )}
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-vpv-tint flex items-center gap-2 text-rose-600"
              >
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Add / edit modal ---------------------------------------- */

function ClientEditorModal({
  initial,
  orgId,
  presenterId,
  onClose,
  onSaved,
}: {
  initial?: Client;
  orgId: string;
  presenterId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    company: initial?.company ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    industry: initial?.industry ?? "",
    notes: initial?.notes ?? "",
    estimated_value: initial?.estimated_value?.toString() ?? "",
    next_follow_up_at: initial?.next_follow_up_at?.slice(0, 10) ?? "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const patch = {
        name: form.name.trim(),
        company: form.company.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        industry: form.industry.trim() || null,
        notes: form.notes.trim() || null,
        estimated_value: form.estimated_value ? Number(form.estimated_value) : null,
        next_follow_up_at: form.next_follow_up_at
          ? new Date(form.next_follow_up_at).toISOString()
          : null,
      };
      if (initial) {
        await updateClient(initial.id, patch);
      } else {
        await createClient({
          org_id: orgId,
          presenter_user_id: presenterId,
          ...patch,
        });
      }
      onSaved();
    } catch (e) {
      alert("Save failed: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-vpv-line flex items-center">
          <h3 className="text-base font-semibold text-vpv-ink mr-auto">
            {initial ? "Edit client" : "Add client"}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-vpv-tint text-vpv-muted">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 grid grid-cols-2 gap-3">
          <Field label="Name *" wide>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input"
              placeholder="Rajesh Kumar"
              autoFocus
            />
          </Field>
          <Field label="Company">
            <input
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              className="input"
              placeholder="Acme Textiles"
            />
          </Field>
          <Field label="Industry">
            <input
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
              className="input"
              placeholder="Textiles"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="input"
              placeholder="rajesh@acme.com"
            />
          </Field>
          <Field label="Phone">
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="input"
              placeholder="+91 …"
            />
          </Field>
          <Field label="Estimated deal value">
            <input
              type="number"
              value={form.estimated_value}
              onChange={(e) => setForm({ ...form, estimated_value: e.target.value })}
              className="input"
              placeholder="100000"
            />
          </Field>
          <Field label="Next follow-up date">
            <input
              type="date"
              value={form.next_follow_up_at}
              onChange={(e) => setForm({ ...form, next_follow_up_at: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Notes" wide>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="input"
              placeholder="Interested in production line automation; follow up next Tuesday…"
            />
          </Field>
        </div>
        <div className="px-5 py-3 border-t border-vpv-line flex items-center justify-end gap-2 bg-vpv-canvas/40">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm text-vpv-muted hover:text-vpv-ink"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !form.name.trim()}
            className="px-4 py-1.5 rounded-md text-sm bg-vpv-grad text-white font-medium disabled:opacity-50 flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            {saving ? "Saving…" : "Save client"}
          </button>
        </div>
      </div>
      <style jsx>{`
        .input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          outline: none;
          transition: border-color 120ms;
        }
        .input:focus {
          border-color: #19b8f2;
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <label className="block text-[11px] text-vpv-muted mb-1 font-medium">{label}</label>
      {children}
    </div>
  );
}

/* ---------- helpers -------------------------------------------------- */

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function formatDur(sec: number): string {
  if (sec === 0) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ${(sec % 60).toString().padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / (24 * 3600 * 1000));
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return new Date(iso).toLocaleDateString("en", { day: "numeric", month: "short" });
}
