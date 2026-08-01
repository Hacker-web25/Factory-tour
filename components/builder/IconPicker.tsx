"use client";

import { useEffect, useState } from "react";
import { ICON_LIBRARY } from "@/lib/iconLibrary";
import { supabase, publicUrl } from "@/lib/supabase";
import {
  listRecent,
  recordUpload,
  bumpUse,
  removeTracking,
  type RecentUpload,
} from "@/lib/recentUploads";
import { X, Upload, Clock, Trash2, ImagePlus } from "lucide-react";

type Tab = "recent" | "library" | "upload";

type Props = {
  tint: string;
  onClose: () => void;
  onPick: (val: {
    icon_key?: string | null;
    icon_url?: string | null;
  }) => void;
};

export default function IconPicker({ tint, onClose, onPick }: Props) {
  const [tab, setTab] = useState<Tab>("recent");
  const [uploading, setUploading] = useState(false);
  const [recent, setRecent] = useState<RecentUpload[] | null>(null);

  // Load recent list once on open
  useEffect(() => {
    listRecent().then(setRecent);
  }, []);

  // If Recent is empty on first load, jump the user to Upload so they see
  // useful UI immediately (still lets them switch back to Recent later).
  useEffect(() => {
    if (recent && recent.length === 0 && tab === "recent") {
      setTab("upload");
    }
  }, [recent]);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
      const path = `icons/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("panoramas")
        .upload(path, file);
      if (error) {
        alert(error.message);
        return;
      }
      const url = publicUrl(path);

      // Extract dimensions for the Recent grid preview
      const dim = await imageDims(file).catch(() => ({ width: 0, height: 0 }));

      // Record in the recent-uploads tracker (best-effort — non-blocking)
      recordUpload({
        storage_path: path,
        public_url: url,
        filename: file.name,
        mime: file.type,
        file_size: file.size,
        width: dim.width || undefined,
        height: dim.height || undefined,
      }).catch(() => {});

      onPick({ icon_url: url, icon_key: null });
      onClose();
    } finally {
      setUploading(false);
    }
  }

  function pickRecent(r: RecentUpload) {
    // Fire-and-forget bump — no reason to block the UI on it
    bumpUse(r.storage_path).catch(() => {});
    onPick({ icon_url: r.public_url, icon_key: null });
    onClose();
  }

  async function removeRecent(r: RecentUpload, e: React.MouseEvent) {
    e.stopPropagation();
    if (
      !confirm(
        "Remove from Recent? The file stays in storage (hotspots using it keep working)."
      )
    )
      return;
    await removeTracking(r.id);
    setRecent((prev) => prev?.filter((x) => x.id !== r.id) ?? null);
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/70 grid place-items-center z-50 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-panel border border-border rounded-lg w-[520px] max-w-full p-4 max-h-[85vh] flex flex-col shadow-panel"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Change image</h3>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-3 border-b border-border">
          <TabBtn
            active={tab === "recent"}
            onClick={() => setTab("recent")}
            icon={<Clock size={12} />}
          >
            Recent
            {recent && recent.length > 0 && (
              <span className="ml-1 text-3xs bg-accent/25 text-accent px-1 rounded">
                {recent.length}
              </span>
            )}
          </TabBtn>
          <TabBtn
            active={tab === "library"}
            onClick={() => setTab("library")}
            icon={<ImagePlus size={12} />}
          >
            Built-in
          </TabBtn>
          <TabBtn
            active={tab === "upload"}
            onClick={() => setTab("upload")}
            icon={<Upload size={12} />}
          >
            Upload
          </TabBtn>
        </div>

        {/* Recent */}
        {tab === "recent" && (
          <div className="flex-1 overflow-auto panel-scroll">
            {recent === null ? (
              <div className="text-xs text-neutral-500 py-8 text-center">
                Loading…
              </div>
            ) : recent.length === 0 ? (
              <EmptyRecent onSwitchToUpload={() => setTab("upload")} />
            ) : (
              <>
                <div className="grid grid-cols-4 gap-2">
                  {recent.map((r) => (
                    <RecentThumb
                      key={r.id}
                      recent={r}
                      onPick={() => pickRecent(r)}
                      onRemove={(e) => removeRecent(r, e)}
                    />
                  ))}
                </div>
                <div className="text-3xs text-neutral-500 mt-3">
                  Sorted by most used. Anything you never re-use eventually
                  drops off — cap is {40} images. Deleting from Recent
                  doesn&rsquo;t affect hotspots already using it.
                </div>
              </>
            )}
          </div>
        )}

        {/* Built-in Lucide library */}
        {tab === "library" && (
          <div className="grid grid-cols-6 gap-2 max-h-[380px] overflow-auto panel-scroll">
            {ICON_LIBRARY.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => {
                  onPick({ icon_key: key, icon_url: null });
                  onClose();
                }}
                title={label}
                className="aspect-square bg-panelSoft border border-border rounded grid place-items-center hover:border-accent transition-colors"
              >
                <Icon size={24} color={tint} />
              </button>
            ))}
          </div>
        )}

        {/* Fresh upload */}
        {tab === "upload" && (
          <label
            className={`block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              uploading
                ? "border-accent bg-accent/5"
                : "border-border hover:border-accent/60 hover:bg-panelSoft/40"
            }`}
          >
            <input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              onChange={(e) =>
                e.target.files?.[0] && handleUpload(e.target.files[0])
              }
            />
            <Upload size={28} className="mx-auto text-neutral-400 mb-2" />
            <div className="text-sm text-neutral-300">
              {uploading ? "Uploading…" : "Click to select an image"}
            </div>
            <div className="text-2xs text-neutral-500 mt-1">
              PNG, JPG, SVG or WebP. Best with a transparent background. Adds
              to Recent so you can reuse it later.
            </div>
          </label>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ UI atoms ------------------------------- */

function TabBtn({
  active,
  children,
  onClick,
  icon,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs flex items-center gap-1 relative transition-colors ${
        active
          ? "text-white"
          : "text-neutral-400 hover:text-white"
      }`}
    >
      {icon}
      {children}
      {active && (
        <span className="absolute left-1.5 right-1.5 bottom-0 h-[2px] bg-accent rounded-t" />
      )}
    </button>
  );
}

function RecentThumb({
  recent,
  onPick,
  onRemove,
}: {
  recent: RecentUpload;
  onPick: () => void;
  onRemove: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onPick}
      title={`${recent.filename ?? "image"} · used ${recent.use_count}×`}
      className="aspect-square bg-panelSoft border border-border rounded overflow-hidden hover:border-accent transition-colors relative group"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={recent.public_url}
        alt=""
        className="w-full h-full object-contain p-1.5"
        loading="lazy"
      />
      {recent.use_count > 1 && (
        <span className="absolute top-0.5 left-0.5 bg-accent/85 text-black text-3xs font-semibold px-1 rounded">
          {recent.use_count}×
        </span>
      )}
      <button
        onClick={onRemove}
        title="Remove from Recent"
        className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/70 text-neutral-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Trash2 size={10} />
      </button>
    </button>
  );
}

function EmptyRecent({
  onSwitchToUpload,
}: {
  onSwitchToUpload: () => void;
}) {
  return (
    <div className="text-center py-10">
      <Clock size={26} className="mx-auto mb-2 text-neutral-600" />
      <div className="text-sm text-neutral-300 mb-1">No recent uploads yet</div>
      <div className="text-2xs text-neutral-500 mb-3">
        Every image you upload lands here so you can reuse it across tours.
      </div>
      <button
        onClick={onSwitchToUpload}
        className="inline-flex items-center gap-1.5 bg-accent hover:bg-accentHover text-black text-xs font-medium px-3 py-1.5 rounded transition-colors"
      >
        <Upload size={12} /> Upload first image
      </button>
    </div>
  );
}

/* ---------------------------- image dims helper ------------------------- */

function imageDims(file: File): Promise<{ width: number; height: number }> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      res({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      rej(new Error("dim failed"));
    };
    img.src = URL.createObjectURL(file);
  });
}
