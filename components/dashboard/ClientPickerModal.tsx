"use client";

/**
 * ClientPickerModal — the dialog that appears when a salesperson
 * clicks Present, asking them which client this presentation is for.
 *
 * Single-select. Shows every active + moved-ahead client, with a
 * quick "+ new client" affordance and "skip / no client" option.
 * Emits the picked `Client` (or null) via `onPicked`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listClientsForPresenter,
  createClient,
  STATUS_LABELS,
  STATUS_COLORS,
  type Client,
} from "@/lib/clients";
import { Search, X, Plus, Play, Loader2, UserRound } from "lucide-react";

export default function ClientPickerModal({
  orgId,
  presenterId,
  tourTitle,
  onClose,
  onPicked,
}: {
  orgId: string;
  presenterId: string;
  tourTitle?: string;
  onClose: () => void;
  /** Called with the picked client, or null if the presenter chose
   *  "skip". Parent is expected to navigate to the tour URL with the
   *  right query string. */
  onPicked: (client: Client | null) => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listClientsForPresenter(presenterId);
      // Only offer clients that are still in play — hide closed/lost
      // so a stale row isn't picked by accident.
      setClients(rows.filter((c) => c.status === "active" || c.status === "moved_ahead"));
    } finally {
      setLoading(false);
    }
  }, [presenterId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && pickedId) {
        const c = clients.find((x) => x.id === pickedId);
        if (c) onPicked(c);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPicked, pickedId, clients]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.company ?? "").toLowerCase().includes(q)
    );
  }, [clients, query]);

  const quickAdd = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const c = await createClient({
        org_id: orgId,
        presenter_user_id: presenterId,
        name: newName.trim(),
        company: newCompany.trim() || null,
      });
      onPicked(c);
    } catch (e) {
      alert("Could not add client: " + (e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/55 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-vpv-line flex items-start">
          <div className="mr-auto">
            <h3 className="text-base font-semibold text-vpv-ink">Who is this for?</h3>
            <p className="text-xs text-vpv-muted mt-0.5">
              {tourTitle ? `Presenting "${tourTitle}".` : "Pick a client."} We'll count
              this presentation toward their pipeline.
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-vpv-tint text-vpv-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!showAdd ? (
          <>
            <div className="px-5 pt-4">
              <div className="relative">
                <Search className="w-4 h-4 text-vpv-muted absolute left-2.5 top-2" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search clients…"
                  className="w-full pl-8 pr-3 py-1.5 rounded-full border border-vpv-line bg-white text-sm focus:outline-none focus:border-vpv-blue"
                  autoFocus
                />
              </div>
            </div>
            <div className="px-5 py-3 max-h-[300px] overflow-y-auto">
              {loading ? (
                <div className="grid place-items-center py-8 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-6 text-vpv-muted text-sm">
                  {clients.length === 0
                    ? "No clients yet — add one below."
                    : "No matches."}
                </div>
              ) : (
                <ul className="space-y-1">
                  {filtered.map((c) => {
                    const color = STATUS_COLORS[c.status];
                    const picked = pickedId === c.id;
                    return (
                      <li key={c.id}>
                        <button
                          onClick={() => setPickedId(c.id)}
                          className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-colors ${
                            picked
                              ? "bg-vpv-tint ring-2 ring-vpv-blue/40"
                              : "hover:bg-vpv-canvas/60"
                          }`}
                        >
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 text-white text-[11px] font-bold grid place-items-center flex-shrink-0">
                            {initials(c.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-vpv-ink truncate">
                              {c.name}
                            </div>
                            <div className="text-[11px] text-vpv-muted truncate">
                              {c.company ?? "—"}
                            </div>
                          </div>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 ${color.bg} ${color.text}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
                            {STATUS_LABELS[c.status]}
                          </span>
                          {/* Single tick to confirm selection. */}
                          <span
                            className={`w-4 h-4 rounded-full border-2 flex-shrink-0 grid place-items-center transition-colors ${
                              picked
                                ? "border-vpv-blue bg-vpv-blue"
                                : "border-vpv-line"
                            }`}
                          >
                            {picked && (
                              <span className="w-1.5 h-1.5 rounded-full bg-white" />
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="px-5 pb-2">
              <button
                onClick={() => setShowAdd(true)}
                className="w-full py-2 rounded-lg border border-dashed border-vpv-line hover:border-vpv-blue text-sm text-vpv-blue flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Add new client
              </button>
            </div>
          </>
        ) : (
          <div className="px-5 py-4 space-y-3">
            <div>
              <label className="block text-[11px] text-vpv-muted mb-1 font-medium">
                Client name *
              </label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Rajesh Kumar"
                autoFocus
                className="w-full px-3 py-2 border border-vpv-line rounded-lg text-sm focus:border-vpv-blue outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] text-vpv-muted mb-1 font-medium">
                Company
              </label>
              <input
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
                placeholder="Acme Textiles"
                className="w-full px-3 py-2 border border-vpv-line rounded-lg text-sm focus:border-vpv-blue outline-none"
              />
            </div>
            <div className="text-[11px] text-vpv-muted">
              You can fill in more details later from the Clients tab.
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowAdd(false)}
                className="flex-1 py-2 rounded-lg border border-vpv-line text-sm text-vpv-muted"
              >
                Cancel
              </button>
              <button
                onClick={quickAdd}
                disabled={!newName.trim() || adding}
                className="flex-1 py-2 rounded-lg bg-vpv-grad text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {adding ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="w-4 h-4" /> Add & present
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {!showAdd && (
          <div className="px-5 py-3 border-t border-vpv-line flex items-center gap-2 bg-vpv-canvas/40">
            <button
              onClick={() => onPicked(null)}
              className="text-[11px] text-vpv-muted hover:text-vpv-ink mr-auto"
            >
              Skip — no client
            </button>
            <button
              onClick={() => {
                const c = clients.find((x) => x.id === pickedId);
                if (c) onPicked(c);
              }}
              disabled={!pickedId}
              className="px-4 py-1.5 rounded-md bg-vpv-grad text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              Start presenting
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}
