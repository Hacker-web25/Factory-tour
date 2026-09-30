// components/dashboard/ChangePassword.tsx
"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ChangePassword() {
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 10) {
      setMsg("Use at least 10 characters.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    setMsg(error ? error.message : "Password updated.");
    if (!error) setNext("");
  };

  return (
    <form onSubmit={submit} className="vpv-glass-panel" style={{ padding: 24, maxWidth: 380 }}>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Change password</h3>
      <p style={{ fontSize: 12, color: "#64748b", margin: "6px 0 14px" }}>
        Use at least 10 characters. You'll stay signed in.
      </p>
      <input
        type="password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        placeholder="New password"
        autoComplete="new-password"
        className="vpv-input"
        style={{ width: "100%" }}
      />
      <button
        type="submit"
        disabled={busy || !next}
        className="vpv-btn vpv-btn--primary"
        style={{ width: "100%", marginTop: 10, justifyContent: "center" }}
      >
        {busy ? "Updating…" : "Update password"}
      </button>
      {msg && (
        <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("Password updated") ? "#16a34a" : "#dc2626" }}>
          {msg}
        </div>
      )}
    </form>
  );
}