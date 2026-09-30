"use client";

/**
 * /v/[token] — the public viewer route with liquid-glass gating.
 *
 *   1. Load link. If missing / revoked / expired / view-limit or
 *      device-limit hit, show a liquid-glass "blocked" screen.
 *   2. If password_hash — glass password prompt.
 *   3. If require_email — glass email prompt.
 *   4. Load tour + scenes. Set attribution, bump view count,
 *      recordLinkOpen (last_opened_at). Mount TourPlayer with the
 *      ScreenCaptureShield overlay.
 *
 * Every gate + the tour itself sit on top of the tour's org theme
 * (via OrgThemeProvider fetched by tour_id → org_id), so a customised
 * dashboard palette carries through to the visitor's password screen.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Scene, Tour } from "@/lib/types";
import TourPlayer from "@/components/viewer/TourPlayer";
import ScreenCaptureShield from "@/components/viewer/ScreenCaptureShield";
import OrgThemeProvider from "@/components/dashboard/OrgThemeProvider";
import {
  checkPassword,
  getViewerEmail,
  getViewerFingerprint,
  loadByToken,
  recordLinkOpen,
  setViewerEmail,
  type ShareLink,
} from "@/lib/shareLinks";
import { setAttribution } from "@/lib/analytics";
import { Lock, Mail, ShieldAlert, Loader2 } from "lucide-react";

export default function ViewerPage() {
  const params = useParams();
  const token = String(params?.token ?? "");

  const [link, setLink] = useState<ShareLink | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [passwordOk, setPasswordOk] = useState(false);
  const [emailOk, setEmailOk] = useState(false);
  const [tour, setTour] = useState<Tour | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);

  // Step 1 — load link.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await loadByToken(token);
      if (cancelled) return;
      if (!res) {
        setBlocked("Link not found.");
        setLoading(false);
        return;
      }
      if (res.blocked) {
        setBlocked(res.blocked);
        setLink(res.link);
        setLoading(false);
        return;
      }
      if (res.link.kind !== "viewer") {
        setBlocked("This link isn't a public viewer link.");
        setLoading(false);
        return;
      }
      setLink(res.link);
      if (!res.link.password_hash) setPasswordOk(true);
      if (!res.link.require_email || getViewerEmail()) setEmailOk(true);
      setLoading(false);
      // Pull org_id off the tour so we can theme the gates too.
      const { data: t } = await supabase
        .from("tours")
        .select("org_id")
        .eq("id", res.link.tour_id)
        .maybeSingle();
      if (!cancelled) setOrgId((t as { org_id: string | null } | null)?.org_id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Step 4 — once gates pass, load tour + attribution.
  useEffect(() => {
    if (!link || !passwordOk || !emailOk) return;
    let cancelled = false;
    (async () => {
      const [{ data: t }, { data: s }] = await Promise.all([
        supabase.from("tours").select("*").eq("id", link.tour_id).single(),
        supabase
          .from("scenes")
          .select("*")
          .eq("tour_id", link.tour_id)
          .order("order_index"),
      ]);
      if (cancelled) return;
      if (!t) {
        setBlocked("Tour not found.");
        return;
      }
      setAttribution({
        share_link_id: link.id,
        viewer_fingerprint: getViewerFingerprint(),
        viewer_email: getViewerEmail(),
      });
      recordLinkOpen(link);
      setTour(t as Tour);
      setScenes((s ?? []) as Scene[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [link, passwordOk, emailOk]);

  // Loading state.
  if (loading) {
    return (
      <GateShell orgId={orgId}>
        <div className="grid place-items-center py-12 text-white/70 text-sm">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      </GateShell>
    );
  }

  // Blocked (link missing / revoked / expired / limits hit).
  if (blocked) {
    return (
      <GateShell orgId={orgId}>
        <GatePanel
          icon={<ShieldAlert style={{ width: 28, height: 28 }} />}
          title="Not available"
          sub={blocked}
        />
      </GateShell>
    );
  }

  if (link && !passwordOk) {
    return (
      <GateShell orgId={orgId}>
        <PasswordGate link={link} onPass={() => setPasswordOk(true)} />
      </GateShell>
    );
  }
  if (link && !emailOk) {
    return (
      <GateShell orgId={orgId}>
        <EmailGate
          onSubmit={(email) => {
            setViewerEmail(email);
            setEmailOk(true);
          }}
        />
      </GateShell>
    );
  }
  if (tour) {
    return (
      <OrgThemeProvider orgId={orgId}>
        <div className="h-screen w-screen bg-black relative">
          <TourPlayer tour={tour} scenes={scenes} />
          {/* Screen-capture protection — always on for shared links. */}
          <ScreenCaptureShield
            fingerprint={getViewerFingerprint()}
            email={getViewerEmail()}
          />
        </div>
      </OrgThemeProvider>
    );
  }
  return (
    <GateShell orgId={orgId}>
      <div className="grid place-items-center py-12 text-white/70 text-sm">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    </GateShell>
  );
}

/* ---------- Liquid-glass shell used by every gate screen ------------ */

function GateShell({
  orgId,
  children,
}: {
  orgId: string | null;
  children: React.ReactNode;
}) {
  return (
    <OrgThemeProvider orgId={orgId}>
      <div
        className="min-h-screen w-full grid place-items-center p-6"
        style={{
          /* Aurora backdrop — same visual family as the share modal so
             the viewer sees a themed continuation, not a blank page. */
          background:
            "radial-gradient(60% 60% at 20% 30%, rgba(59,130,246,0.35), transparent 65%)," +
            "radial-gradient(50% 60% at 80% 70%, rgba(147,51,234,0.28), transparent 65%)," +
            "linear-gradient(135deg, #0b1220 0%, #131a35 50%, #1e1b4b 100%)",
        }}
      >
        {children}
      </div>
    </OrgThemeProvider>
  );
}

function GatePanel({
  icon,
  title,
  sub,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="vpv-glass-panel" style={{ maxWidth: 420, width: "100%" }}>
      <div style={{ padding: "32px 28px", textAlign: "center" }}>
        {icon && (
          <div
            style={{
              width: 56,
              height: 56,
              margin: "0 auto 16px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.6)",
              display: "grid",
              placeItems: "center",
              color: "#0f172a",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9), 0 10px 24px -8px rgba(15,23,42,0.25)",
            }}
          >
            {icon}
          </div>
        )}
        <h1
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "#0f172a",
            margin: 0,
            letterSpacing: "-0.015em",
          }}
        >
          {title}
        </h1>
        {sub && (
          <p
            style={{
              fontSize: 13,
              color: "#475569",
              margin: "8px 0 20px",
              lineHeight: 1.55,
            }}
          >
            {sub}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}

function PasswordGate({
  link,
  onPass,
}: {
  link: ShareLink;
  onPass: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await checkPassword(link, password);
    setBusy(false);
    if (!ok) {
      setError("Wrong password.");
      return;
    }
    onPass();
  };
  return (
    <GatePanel
      icon={<Lock style={{ width: 24, height: 24 }} />}
      title="Password required"
      sub="Enter the password to view this tour."
    >
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          placeholder="••••••••"
          className="vpv-input"
          style={{ textAlign: "center", fontSize: 14, letterSpacing: "0.06em" }}
        />
        {error && (
          <div
            style={{
              fontSize: 12,
              color: "#dc2626",
              background: "rgba(254, 226, 226, 0.7)",
              padding: "6px 10px",
              borderRadius: 8,
              backdropFilter: "blur(6px)",
            }}
          >
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={busy}
          className="vpv-btn vpv-btn--primary"
          style={{ width: "100%", justifyContent: "center", padding: "10px 16px" }}
        >
          {busy ? <Loader2 style={{ width: 14, height: 14 }} className="vpv-spin" /> : null}
          {busy ? "Checking…" : "Continue"}
        </button>
      </form>
    </GatePanel>
  );
}

function EmailGate({ onSubmit }: { onSubmit: (email: string) => void }) {
  const [email, setEmail] = useState("");
  return (
    <GatePanel
      icon={<Mail style={{ width: 24, height: 24 }} />}
      title="Almost there"
      sub="Enter your email to view this tour. It's only shared with the tour owner."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) onSubmit(email.trim().toLowerCase());
        }}
        style={{ display: "flex", flexDirection: "column", gap: 10 }}
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoFocus
          className="vpv-input"
          style={{ textAlign: "center", fontSize: 14 }}
        />
        <button
          type="submit"
          className="vpv-btn vpv-btn--primary"
          style={{ width: "100%", justifyContent: "center", padding: "10px 16px" }}
        >
          Continue
        </button>
      </form>
    </GatePanel>
  );
}
