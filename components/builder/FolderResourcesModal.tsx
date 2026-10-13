"use client";

import { useEffect, useState } from "react";
import {
  loadFolderResources,
  type FolderResource,
} from "@/lib/folderResources";
import {
  X,
  Image as ImageIcon,
  Video,
  FileAudio,
  FileText,
  Copy as CopyIcon,
  ExternalLink,
} from "lucide-react";

type Tab = "all" | "image" | "video" | "audio" | "pdf" | "icon";

/** Full-screen resource browser. Groups every media URL found across every
 *  tour in a folder so a factory owner can quickly re-use assets between
 *  related tours (a client's Site A tour and Site B tour, say). */
export default function FolderResourcesModal({
  folderId,
  folderName,
  onClose,
}: {
  folderId: string;
  folderName: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<FolderResource[] | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadFolderResources(folderId).then((r) => {
      if (!cancelled) setItems(r);
    });
    return () => {
      cancelled = true;
    };
  }, [folderId]);

  const filtered = (items ?? []).filter((r) => {
    if (tab !== "all" && r.kind !== tab) return false;
    if (q) {
      const hay = [
        r.name,
        r.hotspotLabel,
        r.sceneName,
        r.tourTitle,
        r.url,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url).catch(() => {});
  }

  const counts: Record<Tab, number> = {
    all: items?.length ?? 0,
    image: items?.filter((r) => r.kind === "image").length ?? 0,
    video: items?.filter((r) => r.kind === "video").length ?? 0,
    audio: items?.filter((r) => r.kind === "audio").length ?? 0,
    pdf: items?.filter((r) => r.kind === "pdf").length ?? 0,
    icon: items?.filter((r) => r.kind === "icon").length ?? 0,
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/80 grid place-items-center p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-panel border border-border rounded-lg w-[min(1100px,95vw)] h-[85vh] flex flex-col overflow-hidden shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-neutral-400">
              Folder resources
            </div>
            <div className="text-[15px] font-semibold">{folderName}</div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2 px-4 py-2 border-b border-border flex-wrap">
          {(
            ["all", "image", "video", "audio", "pdf", "icon"] as Tab[]
          ).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`chip !py-1 ${tab === t ? "active" : ""}`}
            >
              {t} <span className="opacity-60 ml-1">{counts[t]}</span>
            </button>
          ))}
          <div className="flex-1" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="field !w-56"
          />
        </div>

        <div className="flex-1 overflow-y-auto panel-scroll p-4">
          {items === null ? (
            <div className="text-neutral-500 text-sm text-center py-10">
              Loading resources…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-neutral-500 text-sm text-center py-10">
              {items.length === 0
                ? "No media used across this folder yet."
                : "No matches."}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filtered.map((r, i) => (
                <ResourceCard
                  key={r.url + i}
                  r={r}
                  onCopy={() => copyUrl(r.url)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResourceCard({
  r,
  onCopy,
}: {
  r: FolderResource;
  onCopy: () => void;
}) {
  const Icon =
    r.kind === "video"
      ? Video
      : r.kind === "audio"
      ? FileAudio
      : r.kind === "pdf"
      ? FileText
      : ImageIcon;

  return (
    <div className="bg-panelSoft border border-border rounded overflow-hidden group">
      <div className="aspect-video bg-black/50 relative grid place-items-center">
        {(r.kind === "image" || r.kind === "icon") && r.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={r.url}
            alt=""
            className="w-full h-full object-contain"
          />
        ) : (
          <Icon size={28} className="text-neutral-400" />
        )}
        <div className="absolute top-1.5 left-1.5 text-[10px] uppercase tracking-wider bg-black/70 border border-white/10 rounded px-1.5 py-0.5">
          {r.kind}
        </div>
      </div>
      <div className="p-2 space-y-1">
        <div className="text-[12px] font-medium truncate">
          {r.name || r.hotspotLabel || r.url.split("/").pop()}
        </div>
        <div className="text-[10px] text-neutral-500 truncate">
          {r.tourTitle}
          {r.sceneName ? " · " + r.sceneName : ""}
        </div>
        <div className="flex items-center gap-1 pt-1">
          <button
            onClick={onCopy}
            className="flex-1 chip !py-1 justify-center"
            title="Copy URL to clipboard"
          >
            <CopyIcon size={11} /> Copy URL
          </button>
          <a
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="chip !py-1"
            title="Open in new tab"
          >
            <ExternalLink size={11} />
          </a>
        </div>
      </div>
    </div>
  );
}
