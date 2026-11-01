/**
 * Delete a campaign, safely.
 *
 * Deleting by mistake is expensive: the personal codes and their scan history
 * go for good, and a QR already printed or an e-mail already sent can no
 * longer be matched to a person. So the button stays grey until the campaign's
 * name has been typed, and the dialog says exactly what goes and what stays.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export function DeleteCampaignDialog({
  name,
  slug,
  people,
  scanned,
  paid,
  onClose,
  onDeleted,
}: {
  name: string;
  slug: string;
  people: number;
  scanned: number;
  paid: number;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const matches = typed.trim() === name.trim();

  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function remove() {
    if (!matches || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/marketing/folders/${encodeURIComponent(slug)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ confirm: typed.trim() }),
      });
      const d = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !d.ok) {
        setError(d.message ?? "Could not delete this campaign.");
        return;
      }
      onDeleted();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="delete-title" className="text-[18px] font-semibold text-red-700">
          Delete “{name}”?
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-slate-700">This cannot be undone. It permanently deletes:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[13.5px] text-slate-700">
          <li>
            the campaign and its <strong>{people.toLocaleString("en-IN")}</strong> personal {people === 1 ? "code" : "codes"}
          </li>
          <li>
            their scan history ({scanned.toLocaleString("en-IN")} {scanned === 1 ? "person" : "people"} had opened it)
          </li>
          <li>any e-mail results loaded from Zoho</li>
        </ul>
        <p className="mt-3 text-[13.5px] leading-relaxed text-slate-700">
          <strong>Not deleted:</strong> website visitors, enquiries, orders and payments
          {paid > 0 ? ` (${paid} paid ${paid === 1 ? "customer" : "customers"} stay)` : ""}, and any coupon. A link or
          QR from this campaign will still open the website, but is no longer tied to a person.
        </p>

        <label className="mt-4 block text-[13px] font-medium text-slate-800" htmlFor="delete-confirm">
          Type <span className="rounded bg-slate-100 px-1 font-mono">{name}</span> to confirm
        </label>
        <input
          id="delete-confirm"
          ref={input}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void remove();
          }}
          autoComplete="off"
          className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-[14px] outline-none focus:border-red-500"
        />
        {error && <p className="mt-3 text-[13px] text-red-700">{error}</p>}

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full border border-slate-300 px-5 py-2 text-[13.5px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={!matches || busy}
            className="rounded-full bg-red-600 px-5 py-2 text-[13.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Deleting…" : "Delete forever"}
          </button>
        </div>
      </div>
    </div>
  );
}
