"use client";

/**
 * LanguagePicker — floating language dropdown for the tour viewer.
 * Shows only when the tour has more than one language.
 */

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/TranslationContext";
import { langMeta } from "@/lib/i18n";

export default function LanguagePicker({
  position = "top-right",
}: {
  position?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
}) {
  const { lang, setLang, availableLanguages, loading } = useT();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Source lang ("en") is always available; combine with owner-added langs.
  const all = Array.from(new Set(["en", ...availableLanguages]));
  if (all.length < 2) return null; // nothing to switch between

  const pos: React.CSSProperties = {
    position: "absolute",
    zIndex: 400,
    ...(position.includes("top") ? { top: 12 } : { bottom: 12 }),
    ...(position.includes("right") ? { right: 12 } : { left: 12 }),
  };

  const current = langMeta(lang);

  return (
    <div ref={wrapRef} style={pos}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={buttonStyle}
        title="Change language"
      >
        <span style={{ fontSize: 14 }}>🌐</span>
        <span style={{ fontSize: 12, fontWeight: 500 }}>
          {current.nativeName}
        </span>
        {loading && (
          <span style={{ fontSize: 10, opacity: 0.7 }}>·</span>
        )}
        <span style={{ opacity: 0.6, fontSize: 10 }}>▾</span>
      </button>

      {open && (
        <div style={menuStyle}>
          {all.map((code) => {
            const m = langMeta(code);
            const active = code === lang;
            return (
              <button
                key={code}
                onClick={() => {
                  setLang(code);
                  setOpen(false);
                }}
                style={{
                  ...itemStyle,
                  background: active ? "rgba(59,130,246,0.25)" : "transparent",
                  fontWeight: active ? 600 : 400,
                }}
              >
                <span>{m.nativeName}</span>
                <span style={{ opacity: 0.5, fontSize: 10 }}>
                  {m.code.toUpperCase()}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  background: "rgba(15, 15, 20, 0.75)",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 6,
  cursor: "pointer",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
};

const menuStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  right: 0,
  minWidth: 180,
  maxHeight: 320,
  overflowY: "auto",
  background: "rgba(15, 15, 20, 0.95)",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 6,
  padding: 4,
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
};

const itemStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  width: "100%",
  padding: "8px 12px",
  color: "#fff",
  border: "none",
  cursor: "pointer",
  fontSize: 13,
  textAlign: "left" as const,
  borderRadius: 4,
};
