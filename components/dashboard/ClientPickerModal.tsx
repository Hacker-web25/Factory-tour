"use client";

/**
 * ClientPickerModal — the dialog that appears when a salesperson
 * clicks Present, asking them which client this presentation is for.
 *
 * Single-select. Rendered as a portal to document.body so the org's
 * dashboard theme (dark canvas / colored surfaces) never bleeds into
 * it. Uses inline styles for the surfaces so the CSS overrides that
 * remap `bg-white` etc. can't touch it.
 *
 * Motion:
 *  - Scrim fades in over 220ms.
 *  - Panel enters with a subtle lift+scale on a spring curve
 *    (~380ms) then settles. Exit reverses it.
 *  - Rows stagger in with a 24ms cascade on mount.
 *  - Each row springs on selection.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  listClientsForPresenter,
  createClient,
  STATUS_LABELS,
  STATUS_COLORS,
  type Client,
} from "@/lib/clients";
import { Search, X, Plus, Play, Loader2 } from "lucide-react";

const EXIT_MS = 200;

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
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const requestClose = useCallback(() => {
    setClosing(true);
    window.setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listClientsForPresenter(presenterId);
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
      if (e.key === "Escape") requestClose();
      if (e.key === "Enter" && pickedId) {
        const c = clients.find((x) => x.id === pickedId);
        if (c) onPicked(c);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose, onPicked, pickedId, clients]);

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

  if (typeof document === "undefined") return null;

  const isOpen = mounted && !closing;
  const content = (
    <div
      className={`vpv-modal-portal ${isOpen ? "is-open" : ""} ${closing ? "is-closing" : ""}`}
      onClick={requestClose}
    >
      <div className="vpv-modal-scrim" />
      <div
        className="vpv-modal-panel vpv-modal-sm"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="vpv-modal-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 className="vpv-modal-title">Who is this for?</h3>
            <p className="vpv-modal-sub">
              {tourTitle ? `Presenting "${tourTitle}".` : "Pick a client."} We'll
              count this presentation toward their pipeline.
            </p>
          </div>
          <button className="vpv-modal-close" onClick={requestClose} aria-label="Close">
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {!showAdd ? (
          <>
            <div style={{ padding: "16px 20px 0" }}>
              <div style={{ position: "relative" }}>
                <Search
                  style={{
                    width: 16,
                    height: 16,
                    color: "#94a3b8",
                    position: "absolute",
                    left: 10,
                    top: 9,
                  }}
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search clients…"
                  autoFocus
                  className="vpv-input vpv-input--search"
                />
              </div>
            </div>
            <div className="vpv-modal-body" style={{ maxHeight: 320 }}>
              {loading ? (
                <div className="vpv-empty">
                  <Loader2 style={{ width: 20, height: 20 }} className="vpv-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="vpv-empty">
                  {clients.length === 0
                    ? "No clients yet — add one below."
                    : "No matches."}
                </div>
              ) : (
                <ul className="vpv-client-list">
                  {filtered.map((c, i) => {
                    const color = STATUS_COLORS[c.status];
                    const picked = pickedId === c.id;
                    return (
                      <li
                        key={c.id}
                        className="vpv-fade-up"
                        style={{ animationDelay: `${i * 24}ms` }}
                      >
                        <button
                          onClick={() => setPickedId(c.id)}
                          className={`vpv-client-row ${picked ? "is-picked" : ""}`}
                        >
                          <div className="vpv-avatar">{initials(c.name)}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="vpv-client-name">{c.name}</div>
                            <div className="vpv-client-sub">{c.company ?? "—"}</div>
                          </div>
                          <span
                            className={`vpv-status-pill ${color.bg} ${color.text}`}
                          >
                            <span className={`vpv-status-dot ${color.dot}`} />
                            {STATUS_LABELS[c.status]}
                          </span>
                          <span
                            className={`vpv-radio ${picked ? "is-picked" : ""}`}
                            aria-hidden
                          >
                            {picked && <span className="vpv-radio-dot" />}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div style={{ padding: "0 20px 8px" }}>
              <button className="vpv-add-btn" onClick={() => setShowAdd(true)}>
                <Plus style={{ width: 16, height: 16 }} /> Add new client
              </button>
            </div>
          </>
        ) : (
          <div style={{ padding: "16px 20px" }} className="vpv-fade-up">
            <div style={{ marginBottom: 12 }}>
              <label className="vpv-label">Client name *</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Rajesh Kumar"
                autoFocus
                className="vpv-input"
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="vpv-label">Company</label>
              <input
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
                placeholder="Acme Textiles"
                className="vpv-input"
              />
            </div>
            <div className="vpv-hint">You can fill in more details later.</div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                onClick={() => setShowAdd(false)}
                className="vpv-btn vpv-btn--ghost"
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                onClick={quickAdd}
                disabled={!newName.trim() || adding}
                className="vpv-btn vpv-btn--primary"
                style={{ flex: 1 }}
              >
                {adding ? (
                  <Loader2 style={{ width: 16, height: 16 }} className="vpv-spin" />
                ) : (
                  <>
                    <Plus style={{ width: 16, height: 16 }} /> Add & present
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {!showAdd && (
          <div className="vpv-modal-footer">
            <button
              onClick={() => onPicked(null)}
              className="vpv-btn vpv-btn--text"
              style={{ marginRight: "auto" }}
            >
              Skip — no client
            </button>
            <button
              onClick={() => {
                const c = clients.find((x) => x.id === pickedId);
                if (c) onPicked(c);
              }}
              disabled={!pickedId}
              className="vpv-btn vpv-btn--primary"
            >
              <Play style={{ width: 14, height: 14 }} />
              Start presenting
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}
