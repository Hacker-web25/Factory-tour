"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Scene, Tour } from "@/lib/types";
import TourPlayer from "@/components/viewer/TourPlayer";
import {
  bumpViewCount,
  checkPassword,
  getViewerEmail,
  getViewerFingerprint,
  loadByToken,
  setViewerEmail,
  type ShareLink,
} from "@/lib/shareLinks";
import { setAttribution } from "@/lib/analytics";

/**
 * Public viewer route (`/v/[token]`).
 *
 * Flow:
 *  1. Load the link. If missing / revoked / expired / view-limit-hit,
 *     show a friendly block screen.
 *  2. If `password_hash` is set — show a password prompt first.
 *  3. If `require_email` is on — collect the visitor's email before
 *     starting (captured leads).
 *  4. Load the tour + scenes. Set attribution (viewer_fingerprint +
 *     optional viewer_email) so every event tags the visitor. Bump
 *     view_count. Render the tour.
 */
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
      // Pre-authorise if no password + no email required.
      if (!res.link.password_hash) setPasswordOk(true);
      if (!res.link.require_email || getViewerEmail()) setEmailOk(true);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Step 4 — once gates pass, load tour and set attribution.
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
      bumpViewCount(link.id);
      setTour(t as Tour);
      setScenes((s ?? []) as Scene[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [link, passwordOk, emailOk]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-black text-neutral-500 text-sm">
        Loading…
      </div>
    );
  }
  if (blocked) {
    return (
      <div className="min-h-screen grid place-items-center bg-black text-white p-6">
        <div className="max-w-sm text-center">
          <div className="text-lg font-semibold mb-2">Not available</div>
          <div className="text-sm text-neutral-400">{blocked}</div>
        </div>
      </div>
    );
  }
  if (link && !passwordOk) {
    return (
      <PasswordGate
        link={link}
        onPass={() => setPasswordOk(true)}
      />
    );
  }
  if (link && !emailOk) {
    return <EmailGate onSubmit={(email) => {
      setViewerEmail(email);
      setEmailOk(true);
    }} />;
  }
  if (tour) {
    return (
      <div className="h-screen w-screen bg-black">
        <TourPlayer tour={tour} scenes={scenes} />
      </div>
    );
  }
  return (
    <div className="min-h-screen grid place-items-center bg-black text-neutral-500 text-sm">
      Loading tour…
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
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await checkPassword(link, password);
    setBusy(false);
    if (!ok) {
      setError("Wrong password.");
      return;
    }
    onPass();
  }
  return (
    <div className="min-h-screen grid place-items-center bg-black text-white p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-panel border border-border rounded-lg p-6 shadow-panel"
      >
        <h1 className="text-base font-semibold mb-1">Password required</h1>
        <p className="text-xs text-neutral-500 mb-4">
          Enter the password to view this tour.
        </p>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          className="field w-full mb-3"
        />
        {error && (
          <div className="text-xs text-red-400 mb-3">{error}</div>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-accent hover:bg-accentHover text-black font-medium py-2 rounded disabled:opacity-50"
        >
          {busy ? "Checking…" : "Continue"}
        </button>
      </form>
    </div>
  );
}

function EmailGate({ onSubmit }: { onSubmit: (email: string) => void }) {
  const [email, setEmail] = useState("");
  return (
    <div className="min-h-screen grid place-items-center bg-black text-white p-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) onSubmit(email.trim().toLowerCase());
        }}
        className="w-full max-w-sm bg-panel border border-border rounded-lg p-6 shadow-panel"
      >
        <h1 className="text-base font-semibold mb-1">Almost there</h1>
        <p className="text-xs text-neutral-500 mb-4">
          Enter your email to view this tour.
        </p>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoFocus
          className="field w-full mb-3"
        />
        <button
          type="submit"
          className="w-full bg-accent hover:bg-accentHover text-black font-medium py-2 rounded"
        >
          Continue
        </button>
        <p className="text-[10px] text-neutral-500 mt-3 text-center">
          Your email is only shared with the tour owner.
        </p>
      </form>
    </div>
  );
}
