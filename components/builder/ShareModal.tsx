"use client";

import { useEffect, useState } from "react";
import type { Tour } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import QRCode from "react-qr-code";
import { X, Copy, RefreshCw, Lock, Download, EyeOff } from "lucide-react";

export default function ShareModal({
  tour,
  onClose,
}: {
  tour: Tour;
  onClose: () => void;
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const permanentUrl = `${origin}/tour/${tour.id}`;

  // Backfill visibility from legacy `published` if the migration hasn't run.
  const visibility: "private" | "unlisted" | "public" =
    (tour.visibility as "private" | "unlisted" | "public") ??
    (tour.published ? "public" : "private");

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/70 grid place-items-center z-50 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-panel border border-border rounded-lg w-[580px] max-w-full p-5 max-h-[90vh] overflow-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Share tour</h3>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {visibility === "private" && <PrivateNotice />}
        {visibility === "unlisted" && (
          <UnlistedShare tour={tour} permanentUrl={permanentUrl} />
        )}
        {visibility === "public" && (
          <PublicShare tour={tour} permanentUrl={permanentUrl} />
        )}
      </div>
    </div>
  );
}

/* -------------------------- Private ------------------------------------ */
function PrivateNotice() {
  return (
    <div className="text-center py-8">
      <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-neutral-800 grid place-items-center">
        <Lock size={22} className="text-neutral-400" />
      </div>
      <div className="text-sm font-medium mb-1">This tour is private</div>
      <p className="text-xs text-neutral-400 leading-relaxed max-w-sm mx-auto">
        Change visibility to <span className="text-amber-300">Unlisted</span>{" "}
        or <span className="text-emerald-300">Public</span> in the Preview
        panel to generate share links.
      </p>
    </div>
  );
}

/* -------------------------- Unlisted ----------------------------------- */
function UnlistedShare({
  tour,
  permanentUrl,
}: {
  tour: Tour;
  permanentUrl: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded p-3">
        <EyeOff size={16} className="text-amber-300 mt-0.5" />
        <div className="text-xs text-amber-200 leading-relaxed">
          <span className="font-medium">Unlisted mode.</span> Anyone with this
          link can view the tour
          {tour.unlisted_password
            ? " after entering the password below."
            : "."}{" "}
          Not listed anywhere publicly.
        </div>
      </div>

      <LinkRow label="Unlisted link" value={permanentUrl} />

      {tour.unlisted_password && (
        <div>
          <div className="text-xs uppercase text-neutral-400 mb-1">
            Password
          </div>
          <CopyBar value={tour.unlisted_password} />
          <div className="text-[11px] text-neutral-500 mt-1">
            Share both the link and password with your team.
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------- Public share -------------------------------- */
type SessionOpt = { label: string; value: number | null };
const SESSION_OPTIONS: SessionOpt[] = [
  { label: "Single view (default)", value: null },
  { label: "15 minutes", value: 15 },
  { label: "30 minutes", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "4 hours", value: 240 },
  { label: "24 hours", value: 1440 },
];

function PublicShare({
  tour,
  permanentUrl,
}: {
  tour: Tour;
  permanentUrl: string;
}) {
  const [oneTimeUrl, setOneTimeUrl] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [sessionMinutes, setSessionMinutes] = useState<number | null>(null);

  async function generateOneTime(sessionMin: number | null) {
    setRegenerating(true);
    try {
      // Invalidate every previous unused token for this tour.
      const { error: killErr } = await supabase
        .from("share_links")
        .update({ used: true, used_at: new Date().toISOString() })
        .eq("tour_id", tour.id)
        .eq("used", false);
      if (killErr) console.warn("kill err", killErr.message);

      // Mint a fresh token.
      const token = crypto
        .randomUUID()
        .replace(/-/g, "")
        .slice(0, 20);
      const { error } = await supabase.from("share_links").insert({
        tour_id: tour.id,
        token,
        session_minutes: sessionMin,
      });
      if (error) {
        alert(error.message);
        return;
      }
      setOneTimeUrl(`${permanentUrl}?token=${token}`);
    } finally {
      setRegenerating(false);
    }
  }

  // Generate once on modal open.
  useEffect(() => {
    generateOneTime(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.id]);

  // Whenever the user changes the session length, re-mint so the new token
  // carries the chosen session_minutes.
  function handleSessionChange(v: number | null) {
    setSessionMinutes(v);
    generateOneTime(v);
  }

  return (
    <div className="space-y-5">
      <LinkRow
        label="Public link"
        hint="Anyone with this link can view the tour any time."
        value={permanentUrl}
      />

      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs uppercase text-neutral-400">
            One-time link
          </div>
          <button
            onClick={() => generateOneTime(sessionMinutes)}
            disabled={regenerating}
            className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 disabled:opacity-50"
            title="Invalidate the current one and mint a fresh token"
          >
            <RefreshCw
              size={11}
              className={regenerating ? "animate-spin" : ""}
            />
            Regenerate
          </button>
        </div>
        <div className="text-[11px] text-neutral-500 mb-2">
          {sessionMinutes
            ? `Works for one session — the viewer has ${describeMinutes(
                sessionMinutes
              )} from first click before it expires.`
            : "Works for exactly one visit. After first view it expires — hit Regenerate for a fresh one."}
        </div>

        <div className="flex items-center gap-2 mb-2">
          <label className="text-[11px] text-neutral-400">Session:</label>
          <select
            value={sessionMinutes ?? ""}
            onChange={(e) =>
              handleSessionChange(
                e.target.value === "" ? null : parseInt(e.target.value)
              )
            }
            className="bg-panelSoft border border-border rounded px-2 py-1 text-xs flex-1"
          >
            {SESSION_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value ?? ""}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {oneTimeUrl ? (
          <CopyBar value={oneTimeUrl} />
        ) : (
          <div className="text-xs text-neutral-500 italic">
            {regenerating ? "Generating…" : "No link yet."}
          </div>
        )}
      </div>

      <div>
        <div className="text-xs uppercase text-neutral-400 mb-2">QR code</div>
        <div className="flex items-start gap-4">
          <div className="bg-white p-3 rounded">
            <QRCode value={permanentUrl} size={140} />
          </div>
          <div className="flex-1 text-[11px] text-neutral-500 leading-relaxed">
            <p>
              Points to the <span className="text-white">public link</span> —
              scan it with any phone camera. Great for printing next to a
              physical location.
            </p>
            <button
              onClick={() => downloadQrPng()}
              className="mt-2 flex items-center gap-1 text-xs bg-panelSoft border border-border px-2 py-1 rounded hover:bg-neutral-800"
            >
              <Download size={12} /> Download PNG
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------- helpers ------------------------------------ */

function LinkRow({
  label,
  hint,
  value,
}: {
  label: string;
  hint?: string;
  value: string;
}) {
  return (
    <div>
      <div className="text-xs uppercase text-neutral-400 mb-1">{label}</div>
      {hint && (
        <div className="text-[11px] text-neutral-500 mb-1">{hint}</div>
      )}
      <CopyBar value={value} />
    </div>
  );
}

function CopyBar({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={value}
        onFocus={(e) => e.target.select()}
        className="flex-1 bg-panelSoft border border-border rounded px-2 py-1.5 text-xs font-mono"
      />
      <button
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="text-xs bg-accent text-black px-3 rounded flex items-center gap-1"
      >
        <Copy size={12} /> {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function describeMinutes(m: number): string {
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.round(m / 60);
  return `${h} hour${h === 1 ? "" : "s"}`;
}

function downloadQrPng() {
  const svg = document.querySelector<SVGSVGElement>(".bg-white > svg");
  if (!svg) return;
  const xml = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "tour-qr.png";
      a.click();
      URL.revokeObjectURL(a.href);
    });
  };
  img.src =
    "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
}
