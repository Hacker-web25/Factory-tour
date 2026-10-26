"use client";

/**
 * AccountInfo — read-only card showing who's signed in.
 *
 * Pulls the current user's name (from auth.users.raw_user_meta_data.name,
 * set at customer creation) and email. Email is not editable here: an
 * email change on Supabase Auth requires a confirmation flow, so we
 * keep it out of the settings surface for now.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { User } from "lucide-react";

export default function AccountInfo() {
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (u) {
        setName(
          (u.user_metadata?.name as string | undefined) ??
            (u.user_metadata?.full_name as string | undefined) ??
            ""
        );
        setEmail(u.email ?? "");
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div
      className="vpv-glass-panel"
      style={{
        padding: 20,
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 999,
          background: "rgba(255,255,255,0.6)",
          display: "grid",
          placeItems: "center",
          color: "#0f172a",
          flexShrink: 0,
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.9), 0 6px 16px -6px rgba(15,23,42,0.2)",
        }}
      >
        <User style={{ width: 20, height: 20 }} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--vpv-ink, #0f172a)",
            lineHeight: 1.3,
          }}
        >
          {loading ? "…" : name || "Owner"}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--vpv-ink-muted, #64748b)",
            marginTop: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {loading ? "" : email}
        </div>
      </div>
    </div>
  );
}
