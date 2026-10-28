"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Scene, Tour } from "@/lib/types";
import TourPlayer from "@/components/viewer/TourPlayer";
import { loadOfflineTour } from "@/lib/offlineTourData";
import { getMyProfile } from "@/lib/auth";
import { setAttribution } from "@/lib/analytics";
import { getViewerFingerprint } from "@/lib/shareLinks";
import {
  clearViewContext,
  recallGrant,
  rememberGrant,
  setViewContext,
} from "@/lib/viewContext";

type Status =
  | "loading"
  | "ok"
  | "not_found"
  | "private"
  | "used"
  | "expired"
  | "password"
  | "locked";

export default function PublicTourPage() {
  const { id } = useParams<{ id: string }>();
  const [tour, setTour] = useState<Tour | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  // Optional ?scene= in the URL — used by cross-tour nav hotspots to
  // land the visitor on the specific scene the author pointed at.
  const [initialSceneId, setInitialSceneId] = useState<string | null>(null);
  // session expiry: absolute wall-clock ms when the current view should be cut off
  const expiryRef = useRef<number | null>(null);

  async function load() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const sceneParam = params.get("scene");
    if (sceneParam) setInitialSceneId(sceneParam);
    // Editor preview: when the owner clicks "Open" in the builder we append
    // ?preview=1 so they can review their own draft without hitting the
    // private / unlisted / password gates. Anyone else who navigates here
    // still gets the normal access flow.
    const isEditorPreview = params.get("preview") === "1";

    // Tell the database which tour is being opened (and, if the visitor already entered the password in
    // this tab, the proof of it). An "unlisted" tour is shown only to a request that names it.
    clearViewContext();
    setViewContext({ tourId: id, fp: getViewerFingerprint() });
    const savedGrant = recallGrant(`tour:${id}`);
    if (savedGrant) setViewContext({ tourGrant: savedGrant });

    // Presenter attribution — the sales dashboard's "Present" button
    // opens `/tour/{id}?presenter=<user_id>`. Wire that into the
    // analytics attribution context so every scene_view / hotspot_click
    // / session_start event gets stamped with the presenter's id →
    // dashboards can compute per-presenter stats.
    const presenterParam = params.get("presenter");
    if (presenterParam) {
      setAttribution({ presenter_user_id: presenterParam });
    } else {
      // Fallback: if the viewer is signed in (org_admin previewing, or
      // presenter opened tour by URL bar), attribute to them.
      try {
        const p = await getMyProfile();
        if (p) setAttribution({ presenter_user_id: p.id });
      } catch {}
    }

    // 1) Fetch tour — with an offline-snapshot fallback. If the network
    //    fails (presenter is on-site with no wifi) or Supabase returns
    //    nothing, we fall back to the localStorage snapshot saved by
    //    "Download for offline" earlier. This makes the entire tour
    //    playable end-to-end from cached data.
    let t: any = null;
    let usingOfflineSnapshot = false;
    try {
      const res = await supabase
        .from("tours")
        .select("*")
        .eq("id", id)
        .single();
      t = res.data;
    } catch {
      // network error swallowed — fall through to snapshot
    }
    if (!t) {
      const snap = loadOfflineTour(id);
      if (snap) {
        t = snap.tour;
        usingOfflineSnapshot = true;
        console.info("[offline] serving tour from local snapshot");
      }
    }
    if (!t) {
      // A password-protected unlisted tour is hidden from the database until the password is entered, so
      // the row can't be read yet. Ask the database whether that is why.
      try {
        const gate = await supabase.rpc("tour_gate_info", { p_tour: id });
        const info = gate.data as { needs_password?: boolean; title?: string | null } | null;
        if (info?.needs_password) {
          setTour({ id, title: info.title ?? "" } as Tour);
          setStatus("password");
          return;
        }
      } catch {
        // gate lookup failed — fall through to "not found"
      }
      setStatus("not_found");
      return;
    }

    // Derive visibility (backfill if not set)
    const visibility =
      t.visibility ?? (t.published ? "public" : "private");

    // 2) Access — editor preview short-circuits every gate. Also let
    //    any authenticated member of the tour's org through: presenters
    //    and org_admins need to open "private" tours to present them.
    //    Superowner (that's you, NITIN) always bypasses. And when the
    //    presenter is OFFLINE (network unreachable), fall back to
    //    "there's a locally-cached auth session" as the bypass signal
    //    so pre-downloaded tours keep playing.
    let internalBypass = false;
    try {
      const profile = await getMyProfile();
      if (profile) {
        if (profile.role === "owner") internalBypass = true;
        else if (t.org_id && profile.org_id === t.org_id) internalBypass = true;
      }
    } catch {
      // profile lookup failed (likely offline) — check for cached session.
      try {
        const { data: sess } = await supabase.auth.getSession();
        if (sess.session) internalBypass = true;
      } catch {}
    }
    if (!isEditorPreview && !internalBypass) {
      if (visibility === "private") {
        setStatus("private");
        return;
      }

      if (visibility === "unlisted") {
        // Password check
        // The database only returns a password-protected unlisted tour once the password was proven
        // (a grant). A database without Phase 3b still returns the row, so ask for the password then.
        if (t.unlisted_password && !savedGrant) {
          setTour(t as Tour);
          setStatus("password");
          return;
        }
      }
    }

    // Public / already-authorised unlisted / public with token
    if (token) {
      // The database consumes the one-time link (atomically, on the server).
      const consumed = await supabase.rpc("consume_one_time_link", {
        p_tour: id,
        p_token: token,
      });
      if (!consumed.error && consumed.data) {
        const r = consumed.data as {
          status: string;
          session_minutes?: number | null;
          expires_at?: string;
        };
        if (r.status === "missing" || r.status === "used") {
          setStatus("used");
          return;
        }
        if (r.status === "expired" || r.status === "session_over") {
          setStatus("expired");
          return;
        }
        if (r.status === "consumed" && r.session_minutes) {
          expiryRef.current = Date.now() + r.session_minutes * 60_000;
        }
        if (r.status === "in_session" && r.expires_at) {
          expiryRef.current = new Date(r.expires_at).getTime();
        }
      } else {
        // Database without Phase 3a: the old browser-side check.
        const { data: link } = await supabase
          .from("share_links")
          .select("*")
          .eq("tour_id", id)
          .eq("token", token)
          .maybeSingle();
        if (!link) {
          setStatus("used");
          return;
        }
        if (!link.used) {
          await supabase
            .from("share_links")
            .update({ used: true, used_at: new Date().toISOString() })
            .eq("id", link.id);
          if (link.session_minutes) {
            expiryRef.current = Date.now() + link.session_minutes * 60_000;
          }
        } else {
          if (!link.session_minutes || !link.used_at) {
            setStatus("used");
            return;
          }
          const expiresAt =
            new Date(link.used_at).getTime() + link.session_minutes * 60_000;
          if (Date.now() >= expiresAt) {
            setStatus("expired");
            return;
          }
          expiryRef.current = expiresAt;
        }
      }
    }

    setTour(t as Tour);

    // Scenes — call `public_tour_scenes(tour_id)` instead of selecting
    // directly from the scenes table. That RPC applies the plan gate
    // server-side: BASIC-plan tours return only the first N scenes to
    // non-insiders, PRO/ULTRA (and any org member) see everything. A
    // tampered client can't bypass it, because the plan + membership
    // check runs inside the function with its own credentials.
    //
    // Same offline-fallback pattern as before — if online fetch fails
    // or returns nothing, fall back to the locally saved snapshot.
    let sceneRows: Scene[] = [];
    if (!usingOfflineSnapshot) {
      try {
        const res = await supabase.rpc("public_tour_scenes", { p_tour_id: id });
        sceneRows = (res.data ?? []) as Scene[];
        if (sceneRows.length === 0) {
          // Empty could mean "no scenes yet" or "workspace locked". Ask, so a
          // locked tour says so — and never falls back to a cached copy.
          const lk = await supabase.rpc("tour_is_locked", { p_tour_id: id });
          if (lk.data === true) {
            setStatus("locked");
            return;
          }
        }
      } catch {
        // fall through to snapshot
      }
    }
    if (sceneRows.length === 0) {
      const snap = loadOfflineTour(id);
      if (snap) {
        sceneRows = snap.scenes;
        console.info(
          "[offline] serving scenes from local snapshot:",
          sceneRows.length
        );
      }
    }
    setScenes(sceneRows);
    setStatus("ok");
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Kick the viewer out when the session expires (leaves tab open past the window)
  useEffect(() => {
    if (status !== "ok" || !expiryRef.current) return;
    const check = () => {
      if (expiryRef.current && Date.now() >= expiryRef.current) {
        setStatus("expired");
      }
    };
    const t = setInterval(check, 15_000);
    return () => clearInterval(t);
  }, [status]);

  async function submitPassword() {
    if (!tour) return;
    // The database checks the password (and refuses after too many wrong tries) and answers with a
    // proof that is sent with every later request.
    const r = await supabase.rpc("tour_unlock", { p_tour: id, p_password: passwordInput });
    if (!r.error && r.data) {
      const res = r.data as { ok: boolean; grant?: string; error?: string };
      if (res.ok && res.grant) {
        rememberGrant(`tour:${id}`, res.grant);
        setPasswordError("");
        setStatus("loading");
        await load();
      } else {
        setPasswordError(
          res.error === "locked"
            ? "Too many wrong attempts. Please wait a few minutes and try again."
            : "Incorrect password."
        );
      }
      return;
    }
    // Database without Phase 3a: compare in the browser, as before.
    if (tour.unlisted_password && passwordInput === tour.unlisted_password) {
      rememberGrant(`tour:${id}`, "legacy");
      setPasswordError("");
      setStatus("loading");
      await load();
    } else {
      setPasswordError("Incorrect password.");
    }
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen grid place-items-center text-neutral-500">
        Loading…
      </div>
    );
  }
  if (status === "not_found") {
    return (
      <Message
        title="Tour not found"
        body="Double-check the link — this tour doesn't exist."
      />
    );
  }
  if (status === "locked") {
    return (
      <Message
        title="This tour is temporarily unavailable"
        body="Its owner's VPV workspace needs to be renewed. Please contact them."
      />
    );
  }
  if (status === "private") {
    return (
      <Message
        title="This tour is private"
        body="The owner hasn't shared it yet."
      />
    );
  }
  if (status === "used") {
    return (
      <Message
        title="Link expired"
        body="This one-time link has already been used. Ask the tour owner to send a fresh one."
      />
    );
  }
  if (status === "expired") {
    return (
      <Message
        title="Session ended"
        body="Your viewing window has ended. Ask the tour owner for a new link."
      />
    );
  }
  if (status === "password") {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="max-w-sm w-full text-center">
          <div className="text-lg font-semibold mb-2">
            {tour?.title || "Password required"}
          </div>
          <div className="text-sm text-neutral-400 mb-4">
            Enter the password to view this tour.
          </div>
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => {
              setPasswordInput(e.target.value);
              setPasswordError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitPassword();
            }}
            autoFocus
            placeholder="Password"
            className="w-full bg-panelSoft border border-border rounded px-3 py-2 text-sm mb-2"
          />
          {passwordError && (
            <div className="text-xs text-red-400 mb-2">{passwordError}</div>
          )}
          <button
            onClick={submitPassword}
            className="w-full bg-accent text-black font-medium py-2 rounded"
          >
            Enter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen">
      {tour && (
        <TourPlayer
          tour={tour}
          scenes={scenes}
          initialSceneId={initialSceneId}
        />
      )}
    </div>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="max-w-sm text-center">
        <div className="text-lg font-semibold mb-2">{title}</div>
        <div className="text-sm text-neutral-400">{body}</div>
      </div>
    </div>
  );
}
