"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Scene, Tour } from "@/lib/types";
import TourPlayer from "@/components/viewer/TourPlayer";

type Status =
  | "loading"
  | "ok"
  | "not_found"
  | "private"
  | "used"
  | "expired"
  | "password";

export default function PublicTourPage() {
  const { id } = useParams<{ id: string }>();
  const [tour, setTour] = useState<Tour | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  // session expiry: absolute wall-clock ms when the current view should be cut off
  const expiryRef = useRef<number | null>(null);

  async function load() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    // Editor preview: when the owner clicks "Open" in the builder we append
    // ?preview=1 so they can review their own draft without hitting the
    // private / unlisted / password gates. Anyone else who navigates here
    // still gets the normal access flow.
    const isEditorPreview = params.get("preview") === "1";

    // 1) Fetch tour
    const { data: t } = await supabase
      .from("tours")
      .select("*")
      .eq("id", id)
      .single();
    if (!t) {
      setStatus("not_found");
      return;
    }

    // Derive visibility (backfill if not set)
    const visibility =
      t.visibility ?? (t.published ? "public" : "private");

    // 2) Access — editor preview short-circuits every gate.
    if (!isEditorPreview) {
      if (visibility === "private") {
        setStatus("private");
        return;
      }

      if (visibility === "unlisted") {
        // Password check
        if (t.unlisted_password) {
          // Was it already entered in this session?
          const saved = sessionStorage.getItem(`tour-pw-${id}`);
          if (saved !== t.unlisted_password) {
            setTour(t as Tour);
            setStatus("password");
            return;
          }
        }
      }
    }

    // Public / already-authorised unlisted / public with token
    if (token) {
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

      // Not yet consumed: consume + stamp time
      if (!link.used) {
        await supabase
          .from("share_links")
          .update({ used: true, used_at: new Date().toISOString() })
          .eq("id", link.id);
        if (link.session_minutes) {
          expiryRef.current = Date.now() + link.session_minutes * 60_000;
        }
      } else {
        // Already used — session-scoped links may still be within their window
        if (!link.session_minutes || !link.used_at) {
          setStatus("used");
          return;
        }
        const usedMs = new Date(link.used_at).getTime();
        const expiresAt = usedMs + link.session_minutes * 60_000;
        if (Date.now() >= expiresAt) {
          setStatus("expired");
          return;
        }
        expiryRef.current = expiresAt;
      }
    }

    setTour(t as Tour);

    const { data: s } = await supabase
      .from("scenes")
      .select("*")
      .eq("tour_id", id)
      .order("order_index");
    setScenes((s ?? []) as Scene[]);
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
    if (passwordInput === tour.unlisted_password) {
      sessionStorage.setItem(`tour-pw-${id}`, passwordInput);
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
      {tour && <TourPlayer tour={tour} scenes={scenes} />}
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
