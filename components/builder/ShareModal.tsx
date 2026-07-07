"use client";

import { useEffect, useState } from "react";
import type { Tour } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import QRCode from "react-qr-code";
import { X, Copy, RefreshCw, Lock, Download } from "lucide-react";

export default function ShareModal({
  tour,
  onClose,
}: {
  tour: Tour;
  onClose: () => void;
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const permanentUrl = `${origin}/tour/${tour.id}`;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/70 grid place-items-center z-50 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-panel border border-border rounded-lg w-[560px] max-w-full p-5 max-h-[90vh] overflow-auto"
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

        {tour.published ? (
          <PublicShare tour={tour} permanentUrl={permanentUrl} />
        ) : (
          <PrivateNotice />
        )}
      </div>
    </div>
  );
}

/* -------------------------- Private notice ------------------------------ */

function PrivateNotice() {
  return (
    <div className="text-center py-8">
      <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-neutral-800 grid place-items-center">
        <Lock size={22} className="text-neutral-400" />
      </div>
      <div className="text-sm font-medium mb-1">This tour is private</div>
      <p className="text-xs text-neutral-400 leading-relaxed max-w-sm mx-auto">
        Share links can only be generated for public tours. Open the Preview
        panel on the right and toggle the <span className="text-emerald-400">Public</span> button, then reopen Share.
      </p>
    </div>
  );
}

/* --------------------------- Public share ------------------------------- */

function PublicShare({
  tour,
  permanentUrl,
}: {
  tour: Tour;
  permanentUrl: string;
}) {
  const [oneTimeUrl, setOneTimeUrl] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  async function generateOneTime() {
    setRegenerating(true);
    try {
      // Invalidate any previous outstanding tokens for this tour so only the
      // newest one is live at a time.
      await supabase
        .from("share_links")
        .update({ used: true })
        .eq("tour_id", tour.id)
        .eq("used", false);

      const token = crypto
        .randomUUID()
        .replace(/-/g, "")
        .slice(0, 20);
      const { error } = await supabase
        .from("share_links")
        .insert({ tour_id: tour.id, token });
      if (error) {
        alert(error.message);
        return;
      }
      setOneTimeUrl(`${permanentUrl}?token=${token}`);
    } finally {
      setRegenerating(false);
    }
  }

  // Auto-generate on open
  useEffect(() => {
    generateOneTime();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.id]);

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
            onClick={generateOneTime}
            disabled={regenerating}
            className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 disabled:opacity-50"
            title="Invalidate this link and create a fresh one"
          >
            <RefreshCw
              size={11}
              className={regenerating ? "animate-spin" : ""}
            />
            Regenerate
          </button>
        </div>
        <div className="text-[11px] text-neutral-500 mb-1">
          Works for exactly one visit. After the first view it expires — hit
          Regenerate to make a new one.
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
              scan it with any phone camera to open the tour. Great for
              printing next to a physical location.
            </p>
            <button
              onClick={() => downloadQrPng(permanentUrl)}
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

/* --------------------------- helpers ------------------------------------ */

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

/** Render the given URL to a PNG (canvas) and trigger a download. */
function downloadQrPng(url: string) {
  // Grab the SVG rendered by react-qr-code from the DOM, rasterize to canvas.
  const svg = document.querySelector<SVGSVGElement>(
    ".bg-white > svg"
  );
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
    "data:image/svg+xml;base64," +
    btoa(unescape(encodeURIComponent(xml)));
  // Silence unused-var warning
  void url;
}
