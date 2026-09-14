"use client";

/**
 * CollabAvatars — pill of stacked avatars showing who else is editing
 * this tour right now, filtered to those looking at the active scene.
 *
 * Renders nothing when nobody else is here — the editor stays clean
 * for solo work and lights up only when collab is actually happening.
 */

import { useEffect, useState } from "react";
import {
  loadEditorPeers,
  subscribeToPresence,
  type EditorPeer,
} from "@/lib/editorPresence";

type Props = {
  tourId: string;
  currentUserId: string;
  activeSceneId: string | null;
};

const COLORS = [
  "from-violet-500 to-fuchsia-500",
  "from-cyan-400 to-emerald-400",
  "from-amber-400 to-rose-400",
  "from-blue-500 to-sky-400",
  "from-emerald-500 to-lime-400",
];

function colorFor(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

function initials(peer: EditorPeer): string {
  const name = peer.full_name ?? peer.email.split("@")[0];
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function CollabAvatars({
  tourId,
  currentUserId,
  activeSceneId,
}: Props) {
  const [peers, setPeers] = useState<EditorPeer[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const rows = await loadEditorPeers(tourId, currentUserId);
      if (!cancelled) setPeers(rows);
    }
    refresh();
    const iv = window.setInterval(refresh, 15_000); // polling fallback
    const un = subscribeToPresence(refresh);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
      un();
    };
  }, [tourId, currentUserId]);

  if (peers.length === 0) return null;

  const onThisScene = peers.filter(
    (p) => activeSceneId && p.editing_scene_id === activeSceneId
  );

  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-white/[0.04] border border-white/10 backdrop-blur-md">
      <div className="flex -space-x-2">
        {peers.slice(0, 4).map((p) => {
          const activeHere =
            activeSceneId && p.editing_scene_id === activeSceneId;
          return (
            <div
              key={p.user_id}
              title={`${p.full_name ?? p.email}${
                activeHere ? " · on this scene" : ""
              }`}
              className={`relative w-6 h-6 rounded-full bg-gradient-to-br ${colorFor(
                p.user_id
              )} grid place-items-center text-[10px] font-semibold text-white ring-2 ring-black`}
            >
              {initials(p)}
              {activeHere && (
                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-black" />
              )}
            </div>
          );
        })}
        {peers.length > 4 && (
          <div className="w-6 h-6 rounded-full bg-white/10 grid place-items-center text-[9px] font-semibold text-white/80 ring-2 ring-black">
            +{peers.length - 4}
          </div>
        )}
      </div>
      <span className="text-[10.5px] text-white/70 font-medium pr-1 whitespace-nowrap">
        {onThisScene.length > 0
          ? `${onThisScene.length} on this scene`
          : `${peers.length} editing`}
      </span>
    </div>
  );
}
