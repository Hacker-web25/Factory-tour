"use client";

/**
 * ShareTourModal — the "how do I share this tour?" dialog.
 *
 * On open, the modal doesn't create anything yet — the presenter first
 * chooses their options (time expiry, one-time use, kind = link or QR)
 * then hits Generate. That creates a fresh `share_links` row and the
 * modal switches to display mode with the URL + QR + copy affordances.
 *
 * Everything is portalled to document.body so the org's dashboard
 * theme (dark canvas, coloured surfaces) never leaks into the modal.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { createViewerLink, type ShareLink } from "@/lib/shareLinks";
import BrandedQRCode from "./BrandedQRCode";
import {
  Link2,
  QrCode,
  Copy,
  Check,
  X,
  Clock,
  Zap,
  Loader2,
  ArrowLeft,
  Sparkles,
  Lock,
  Eye,
  EyeOff,
  Shuffle,
} from "lucide-react";

const EXIT_MS = 200;

type TimePreset = { label: string; minutes: number | null };
const PRESETS: TimePreset[] = [
  { label: "Unlimited", minutes: null },
  { label: "15 min", minutes: 15 },
  { label: "1 hour", minutes: 60 },
  { label: "24 hours", minutes: 60 * 24 },
  { label: "7 days", minutes: 60 * 24 * 7 },
];

type Kind = "link" | "qr";

export default function ShareTourModal({
  tourId,
  tourTitle,
  onClose,
}: {
  tourId: string;
  tourTitle: string;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);

  // Options
  const [kind, setKind] = useState<Kind>("link");
  const [presetIdx, setPresetIdx] = useState<number>(0); // Unlimited
  const [customUnit, setCustomUnit] = useState<"min" | "hr" | "day">("hr");
  const [customValue, setCustomValue] = useState<string>("");
  const [oneTime, setOneTime] = useState(false);
  const [passwordOn, setPasswordOn] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [transparentQR, setTransparentQR] = useState(false);
  const [withLogo, setWithLogo] = useState(true);

  // Result
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState<ShareLink | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const requestClose = useCallback(() => {
    setClosing(true);
    window.setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && requestClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);

  // Resolve the chosen expiry into a Date | null.
  const expiresAt: Date | null = useMemo(() => {
    const preset = PRESETS[presetIdx];
    let mins: number | null = preset.minutes;
    if (customValue.trim() !== "") {
      const n = Number(customValue);
      if (Number.isFinite(n) && n > 0) {
        mins = n * (customUnit === "min" ? 1 : customUnit === "hr" ? 60 : 60 * 24);
      }
    }
    if (mins == null) return null;
    return new Date(Date.now() + mins * 60 * 1000);
  }, [presetIdx, customUnit, customValue]);

  const expiresLabel = useMemo(() => {
    if (!expiresAt) return "Never expires";
    const diffMin = Math.round((expiresAt.getTime() - Date.now()) / 60000);
    if (diffMin < 60) return `Expires in ${diffMin} min`;
    if (diffMin < 60 * 24) return `Expires in ${Math.round(diffMin / 60)}h`;
    return `Expires in ${Math.round(diffMin / (60 * 24))}d`;
  }, [expiresAt]);

  const generate = async () => {
    // Guard: password enabled but blank — treat as user error, don't
    // silently create an unprotected link.
    if (passwordOn && !password.trim()) {
      alert("Enter a password (or turn off password protection).");
      return;
    }
    setCreating(true);
    try {
      const created = await createViewerLink({
        tourId,
        label: `${kind === "qr" ? "QR" : "Link"} · ${expiresLabel}${oneTime ? " · one-time" : ""}${passwordOn ? " · locked" : ""}`,
        expiresAt,
        viewLimit: oneTime ? 1 : null,
        password: passwordOn ? password.trim() : undefined,
      });
      if (created) setLink(created);
    } finally {
      setCreating(false);
    }
  };

  /** Generate a memorable-but-strong random password (like "juniper-42"). */
  const suggestPassword = () => {
    const words = [
      "juniper", "cobalt", "harbor", "mango", "quartz", "spruce",
      "opal", "willow", "amber", "sable", "hazel", "cedar",
      "azure", "coral", "linen", "onyx", "sage", "cypress",
    ];
    const w = words[Math.floor(Math.random() * words.length)];
    const n = Math.floor(Math.random() * 90) + 10;
    setPassword(`${w}-${n}`);
    setShowPassword(true);
  };

  const reset = () => {
    setLink(null);
    setCopiedUrl(false);
  };

  const shareUrl = useMemo(() => {
    if (!link) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/v/${link.token}`;
  }, [link]);

  const copyUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 1600);
    } catch {
      /* noop */
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
        className="vpv-modal-panel vpv-modal-md"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="vpv-modal-header">
          {link && (
            <button
              onClick={reset}
              className="vpv-modal-close"
              style={{ marginRight: 8 }}
              aria-label="Back to options"
            >
              <ArrowLeft style={{ width: 16, height: 16 }} />
            </button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 className="vpv-modal-title">Share tour</h3>
            <p className="vpv-modal-sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {tourTitle}
            </p>
          </div>
          <button className="vpv-modal-close" onClick={requestClose} aria-label="Close">
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* --- Options step --- */}
        {!link && (
          <>
            <div className="vpv-modal-body" style={{ paddingTop: 12 }}>
              {/* Kind selector */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
                <KindTile
                  active={kind === "link"}
                  onClick={() => setKind("link")}
                  icon={<Link2 style={{ width: 20, height: 20 }} />}
                  title="Share link"
                  sub="Send a URL"
                />
                <KindTile
                  active={kind === "qr"}
                  onClick={() => setKind("qr")}
                  icon={<QrCode style={{ width: 20, height: 20 }} />}
                  title="QR code"
                  sub="Scan on any phone"
                />
              </div>

              {/* Time preset chips */}
              <div style={{ marginBottom: 14 }}>
                <label className="vpv-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Clock style={{ width: 12, height: 12 }} /> Valid for
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {PRESETS.map((p, i) => {
                    const active = presetIdx === i && !customValue.trim();
                    return (
                      <button
                        key={p.label}
                        onClick={() => {
                          setPresetIdx(i);
                          setCustomValue("");
                        }}
                        className={`vpv-chip ${
                          active
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                        }`}
                        style={{
                          padding: "5px 12px",
                          borderRadius: 999,
                          border: "1px solid",
                          fontSize: 12,
                          fontWeight: 500,
                        }}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                {/* Custom time row */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
                  <span style={{ fontSize: 11, color: "#64748b" }}>Or custom:</span>
                  <input
                    type="number"
                    min={1}
                    placeholder="30"
                    value={customValue}
                    onChange={(e) => setCustomValue(e.target.value)}
                    className="vpv-input"
                    style={{ width: 80, padding: "5px 10px", fontSize: 13 }}
                  />
                  <select
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value as "min" | "hr" | "day")}
                    className="vpv-input"
                    style={{ width: 90, padding: "5px 10px", fontSize: 13 }}
                  >
                    <option value="min">minutes</option>
                    <option value="hr">hours</option>
                    <option value="day">days</option>
                  </select>
                  <span
                    style={{
                      fontSize: 11,
                      color: expiresAt ? "#16a34a" : "#64748b",
                      marginLeft: "auto",
                      fontWeight: 500,
                    }}
                  >
                    {expiresLabel}
                  </span>
                </div>
              </div>

              {/* One-time toggle */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: 12,
                  background: oneTime ? "#fef3c7" : "#f8fafc",
                  border: `1px solid ${oneTime ? "#fcd34d" : "#e2e8f0"}`,
                  borderRadius: 10,
                  marginBottom: 14,
                  transition: "background 220ms, border-color 220ms",
                }}
              >
                <Zap
                  style={{
                    width: 16,
                    height: 16,
                    color: oneTime ? "#d97706" : "#94a3b8",
                    marginTop: 2,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#0f172a" }}>
                    One-time use
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2, lineHeight: 1.5 }}>
                    Link works exactly once. Any further attempt (even by the
                    same person, from any device) shows an "expired" screen.
                    Combines with the time limit above.
                  </div>
                </div>
                <button
                  onClick={() => setOneTime((v) => !v)}
                  className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors ${
                    oneTime ? "bg-amber-500" : "bg-slate-300"
                  }`}
                  aria-pressed={oneTime}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 bg-white rounded-full transition-transform ${
                      oneTime ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>

              {/* Password protection */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  padding: 12,
                  background: passwordOn ? "#f0f9ff" : "#f8fafc",
                  border: `1px solid ${passwordOn ? "#7dd3fc" : "#e2e8f0"}`,
                  borderRadius: 10,
                  marginBottom: 14,
                  transition: "background 220ms, border-color 220ms",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <Lock
                    style={{
                      width: 16,
                      height: 16,
                      color: passwordOn ? "#0284c7" : "#94a3b8",
                      marginTop: 2,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#0f172a" }}>
                      Password protect
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2, lineHeight: 1.5 }}>
                      Visitors must enter the password before the tour opens.
                      Combines with the time + one-time limits.
                    </div>
                  </div>
                  <button
                    onClick={() => setPasswordOn((v) => !v)}
                    className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors ${
                      passwordOn ? "bg-sky-500" : "bg-slate-300"
                    }`}
                    aria-pressed={passwordOn}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 bg-white rounded-full transition-transform ${
                        passwordOn ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>

                {passwordOn && (
                  <div className="vpv-fade-up" style={{ display: "flex", gap: 6 }}>
                    <div style={{ position: "relative", flex: 1 }}>
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        className="vpv-input"
                        style={{ paddingRight: 34, fontFamily: showPassword ? "ui-monospace, SFMono-Regular, monospace" : undefined }}
                        autoFocus
                      />
                      <button
                        onClick={() => setShowPassword((v) => !v)}
                        style={{
                          position: "absolute",
                          right: 6,
                          top: "50%",
                          transform: "translateY(-50%)",
                          padding: 4,
                          border: 0,
                          background: "transparent",
                          cursor: "pointer",
                          color: "#64748b",
                          display: "grid",
                          placeItems: "center",
                        }}
                        title={showPassword ? "Hide" : "Show"}
                        type="button"
                      >
                        {showPassword ? (
                          <EyeOff style={{ width: 14, height: 14 }} />
                        ) : (
                          <Eye style={{ width: 14, height: 14 }} />
                        )}
                      </button>
                    </div>
                    <button
                      onClick={suggestPassword}
                      className="vpv-btn vpv-btn--ghost"
                      style={{ padding: "6px 10px", fontSize: 12 }}
                      title="Generate a memorable password"
                      type="button"
                    >
                      <Shuffle style={{ width: 12, height: 12 }} />
                      Suggest
                    </button>
                  </div>
                )}
              </div>

              {/* QR-only options */}
              {kind === "qr" && (
                <div
                  className="vpv-fade-up"
                  style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 6 }}
                >
                  <ToggleLine
                    label="Transparent background"
                    hint="Overlay the QR on printed or coloured material."
                    checked={transparentQR}
                    onChange={setTransparentQR}
                  />
                  <ToggleLine
                    label="Show VPV logo in centre"
                    hint="Uses high error-correction so scanning still works."
                    checked={withLogo}
                    onChange={setWithLogo}
                  />
                </div>
              )}
            </div>

            <div className="vpv-modal-footer">
              <button onClick={requestClose} className="vpv-btn vpv-btn--text">
                Cancel
              </button>
              <button
                onClick={generate}
                disabled={creating}
                className="vpv-btn vpv-btn--primary"
              >
                {creating ? (
                  <Loader2 style={{ width: 14, height: 14 }} className="vpv-spin" />
                ) : (
                  <Sparkles style={{ width: 14, height: 14 }} />
                )}
                Generate {kind === "qr" ? "QR code" : "link"}
              </button>
            </div>
          </>
        )}

        {/* --- Result step --- */}
        {link && (
          <div className="vpv-modal-body vpv-fade-up">
            {/* Summary strip */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: 10,
                marginBottom: 16,
              }}
            >
              <Check style={{ width: 16, height: 16, color: "#16a34a", flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 12, color: "#166534" }}>
                <strong>Generated.</strong> {expiresLabel}
                {oneTime && " · one-time"}
                {passwordOn && " · password required"}.
              </div>
            </div>

            {/* Password reminder — the plaintext isn't stored on the
                server (only its hash), so this is the one moment the
                sender can copy it. */}
            {passwordOn && password && (
              <div
                style={{
                  padding: "10px 12px",
                  background: "#f0f9ff",
                  border: "1px solid #7dd3fc",
                  borderRadius: 10,
                  marginBottom: 16,
                }}
              >
                <div style={{ fontSize: 11, color: "#075985", fontWeight: 500, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                  <Lock style={{ width: 12, height: 12 }} />
                  Share the password too — visitors need it to open the tour.
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    readOnly
                    value={password}
                    onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
                    className="vpv-input"
                    style={{ flex: 1, fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 13 }}
                  />
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(password);
                      } catch {}
                    }}
                    className="vpv-btn vpv-btn--ghost"
                    style={{ padding: "6px 12px", flexShrink: 0 }}
                  >
                    <Copy style={{ width: 14, height: 14 }} />
                    Copy
                  </button>
                </div>
              </div>
            )}

            {/* URL row (always shown) */}
            <div style={{ marginBottom: kind === "qr" ? 18 : 0 }}>
              <label className="vpv-label">Share URL</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  readOnly
                  value={shareUrl}
                  onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
                  className="vpv-input"
                  style={{ flex: 1, fontSize: 12 }}
                />
                <button
                  onClick={copyUrl}
                  className="vpv-btn vpv-btn--primary"
                  style={{ padding: "6px 12px", flexShrink: 0 }}
                >
                  {copiedUrl ? (
                    <Check style={{ width: 14, height: 14 }} />
                  ) : (
                    <Copy style={{ width: 14, height: 14 }} />
                  )}
                  {copiedUrl ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            {/* QR itself */}
            {kind === "qr" && (
              <div style={{ display: "grid", placeItems: "center" }}>
                <BrandedQRCode
                  value={shareUrl}
                  size={220}
                  logoUrl={withLogo ? "/vpv-mark.png" : null}
                  bgColor={transparentQR ? "transparent" : "#ffffff"}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

/* ---------- Little bits --------------------------------------------- */

function KindTile({
  active,
  onClick,
  icon,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: 14,
        borderRadius: 12,
        border: `2px solid ${active ? "#1468d8" : "#e2e8f0"}`,
        background: active ? "#eff6ff" : "#ffffff",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 6,
        cursor: "pointer",
        transition: "all 200ms cubic-bezier(0.16, 1, 0.3, 1)",
        transform: active ? "scale(1.02)" : "scale(1)",
      }}
    >
      <span style={{ color: active ? "#1468d8" : "#64748b" }}>{icon}</span>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{title}</div>
      <div style={{ fontSize: 11, color: "#64748b" }}>{sub}</div>
    </button>
  );
}

function ToggleLine({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 12px",
        background: "#f8fafc",
        borderRadius: 8,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: "#0f172a" }}>{label}</div>
        {hint && <div style={{ fontSize: 10.5, color: "#94a3b8" }}>{hint}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors ${
          checked ? "bg-cyan-500" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 bg-white rounded-full transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
