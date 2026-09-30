"use client";

/**
 * BrandedQRCode — renders an SVG QR with an optional VPV logo mark
 * in the centre, plus helpers to copy the QR to the clipboard as PNG
 * or download it as a file. Uses `react-qr-code` with error-correction
 * level "H" (30% recovery) so the centre logo doesn't break scanning.
 *
 * The logo overlay is a plain <img> positioned absolutely over the SVG,
 * sized to ~22% of the QR box. Behind the logo we lay a small white
 * disc so the QR modules directly under the mark stay legible after
 * scanning cameras average.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "react-qr-code";
import { Copy, Download, Check, Loader2 } from "lucide-react";

type Props = {
  value: string;
  size?: number;
  /** URL of the centre mark. Pass "" or null to render a plain QR. */
  logoUrl?: string | null;
  /** Fill colour of the QR modules. Default #0f172a — slate 900. */
  fgColor?: string;
  /** Background. Use "transparent" for a see-through QR. Default #ffffff. */
  bgColor?: string;
};

export default function BrandedQRCode({
  value,
  size = 220,
  logoUrl,
  fgColor = "#0f172a",
  bgColor = "#ffffff",
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<null | "copy" | "download">(null);
  // Track whether the logo image actually loaded — if not, we don't
  // render its container so the QR doesn't have a broken-image square
  // in the middle. The canvas rasterisation also skips the logo
  // gracefully via its own try/catch.
  const [logoOk, setLogoOk] = useState(false);
  useEffect(() => {
    if (!logoUrl) {
      setLogoOk(false);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => !cancelled && setLogoOk(true);
    img.onerror = () => !cancelled && setLogoOk(false);
    img.src = logoUrl;
    return () => {
      cancelled = true;
    };
  }, [logoUrl]);

  /** Rasterise the QR wrapper (SVG + logo) to a PNG dataURL. */
  const toPng = useCallback(async (): Promise<string | null> => {
    const el = wrapRef.current;
    if (!el) return null;
    const svgEl = el.querySelector("svg");
    if (!svgEl) return null;

    // 1. Serialise the SVG.
    const svgText = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);

    // 2. Load it into an Image so we can draw it to a canvas at any DPR.
    const dpr = Math.max(2, window.devicePixelRatio || 1);
    const canvas = document.createElement("canvas");
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(svgUrl);
      return null;
    }

    // Solid background — otherwise transparent QRs go dark on save.
    if (bgColor !== "transparent") {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const qrImg = await loadImage(svgUrl);
    ctx.drawImage(qrImg, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(svgUrl);

    // 3. Overlay the logo (if any) — same white disc + logo sizing as
    //    the visual DOM, so the rasterised file matches what the user sees.
    if (logoUrl) {
      try {
        const logo = await loadImage(logoUrl, /* crossOrigin */ true);
        const logoSide = size * 0.22 * dpr;
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const padSide = logoSide * 1.24;
        // White disc behind the logo.
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(cx, cy, padSide / 2, 0, Math.PI * 2);
        ctx.fill();
        // Logo itself.
        ctx.drawImage(
          logo,
          cx - logoSide / 2,
          cy - logoSide / 2,
          logoSide,
          logoSide
        );
      } catch {
        /* logo failed to load (CORS etc.) — carry on without it */
      }
    }

    return canvas.toDataURL("image/png");
  }, [size, bgColor, logoUrl]);

  const onCopy = async () => {
    setBusy("copy");
    try {
      const dataUrl = await toPng();
      if (!dataUrl) return;
      const blob = await (await fetch(dataUrl)).blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      alert("Could not copy — your browser may not allow clipboard image copy.");
    } finally {
      setBusy(null);
    }
  };

  const onDownload = async () => {
    setBusy("download");
    try {
      const dataUrl = await toPng();
      if (!dataUrl) return;
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `vpv-share-qr-${Date.now()}.png`;
      a.click();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* QR + logo overlay */}
      <div
        ref={wrapRef}
        className="relative rounded-2xl p-4 vpv-qr-frame"
        style={{
          background: bgColor === "transparent" ? "transparent" : bgColor,
          width: size + 32,
          height: size + 32,
          boxShadow:
            bgColor === "transparent"
              ? "none"
              : "0 20px 40px -20px rgba(15,23,42,0.35), 0 0 0 1px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.9)",
        }}
      >
        <QRCode
          value={value}
          size={size}
          level="H"
          fgColor={fgColor}
          bgColor={bgColor === "transparent" ? "#ffffff00" : bgColor}
          style={{ display: "block" }}
        />
        {logoUrl && logoOk && (
          <div
            className="absolute grid place-items-center"
            style={{
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: size * 0.26,
              height: size * 0.26,
              background: "#ffffff",
              borderRadius: 14,
              boxShadow: "0 4px 12px -2px rgba(15,23,42,0.25), 0 0 0 4px #ffffff",
              padding: size * 0.03,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt=""
              draggable={false}
              crossOrigin="anonymous"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
              }}
            />
          </div>
        )}
      </div>

      {/* Copy / download actions */}
      <div className="flex gap-2">
        <button
          onClick={onCopy}
          disabled={busy !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          {busy === "copy" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-500" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
          {copied ? "Copied" : "Copy QR"}
        </button>
        <button
          onClick={onDownload}
          disabled={busy !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 disabled:opacity-50"
        >
          {busy === "download" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          Download PNG
        </button>
      </div>
    </div>
  );
}

/** Promise-wrapped Image load. */
function loadImage(src: string, crossOrigin = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
