"use client";

import { useEffect, useState } from "react";
import { ICON_LIBRARY } from "@/lib/iconLibrary";
import { supabase, publicUrl } from "@/lib/supabase";
import {
  listRecent,
  recordUpload,
  bumpUse,
  removeTracking,
  setPinned,
  type RecentUpload,
} from "@/lib/recentUploads";
import {
  X,
  Upload,
  Clock,
  Trash2,
  ImagePlus,
  Star,
  Folder as FolderIcon,
  FolderPlus,
  ChevronLeft,
  MoreVertical,
} from "lucide-react";
import {
  listAssetFolders,
  createAssetFolder,
  renameAssetFolder,
  deleteAssetFolder,
  moveUploadToFolder,
  type AssetFolder,
} from "@/lib/assetFolders";

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
  const [folders, setFolders] = useState<AssetFolder[]>([]);
  // null = root, otherwise the folder we're browsing inside.
  const [activeFolder, setActiveFolder] = useState<AssetFolder | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // Load recent list + folders on open
  useEffect(() => {
    listRecent().then(setRecent);
    listAssetFolders(null).then(setFolders);
  }, []);

  // Filter the recent list to the active folder (or root).
  const visibleRecent = (recent ?? []).filter((r) =>
    activeFolder ? r.folder_id === activeFolder.id : !r.folder_id
  );
  const foldersInHere = folders.filter((f) =>
    activeFolder ? f.parent_id === activeFolder.id : !f.parent_id
  );

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    const res = await createAssetFolder(null, name, activeFolder?.id ?? null);
    if (res.folder) setFolders((f) => [...f, res.folder!]);
    setNewFolderName("");
    setCreatingFolder(false);
  }

  async function handleMoveUpload(uploadId: string, folderId: string | null) {
    await moveUploadToFolder(uploadId, folderId);
    setRecent((prev) =>
      prev
        ? prev.map((r) =>
            r.id === uploadId ? { ...r, folder_id: folderId } : r
          )
        : prev
    );
  }

  async function handleDeleteFolder(folder: AssetFolder) {
    if (
      !confirm(
        `Delete folder "${folder.name}"? Assets inside will move to the root — not deleted.`
      )
    )
      return;
    await deleteAssetFolder(folder.id);
    setFolders((list) => list.filter((f) => f.id !== folder.id));
    // Bump any recent items that were in this folder back to root
    setRecent((prev) =>
      prev
        ? prev.map((r) =>
            r.folder_id === folder.id ? { ...r, folder_id: null } : r
          )
        : prev
    );
    if (activeFolder?.id === folder.id) setActiveFolder(null);
  }

  // If Recent AND folders are both empty on first load, jump to Upload.
  // With folders present we always stay on Recent so the user sees
  // their organization structure right away.
  useEffect(() => {
    if (
      recent &&
      recent.length === 0 &&
      folders.length === 0 &&
      tab === "recent"
    ) {
      setTab("upload");
    }
  }, [recent, folders, tab]);

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
    if (r.pinned) {
      alert(
        "This icon is saved (pinned). Un-pin it first — the star badge in the top-left of the tile — then remove."
      );
      return;
    }
    if (
      !confirm(
        "Remove from Recent? The file stays in storage (hotspots using it keep working)."
      )
    )
      return;
    await removeTracking(r.id);
    setRecent((prev) => prev?.filter((x) => x.id !== r.id) ?? null);
  }

  // Pin / unpin — the "save this icon forever" toggle. Pinned uploads
  // are exempt from the MAX_RECENT eviction and float to the top of
  // the Recent grid. Cross-project because it's just a DB flag.
  async function togglePinned(r: RecentUpload, e: React.MouseEvent) {
    e.stopPropagation();
    const next = !r.pinned;
    // Optimistic UI: flip the flag locally, re-sort so pinned floats
    // to the front. Any error rolls the local list back.
    setRecent((prev) =>
      prev
        ? [...prev.map((x) => (x.id === r.id ? { ...x, pinned: next } : x))]
            .sort((a, b) => {
              const pa = a.pinned ? 1 : 0;
              const pb = b.pinned ? 1 : 0;
              if (pa !== pb) return pb - pa;
              return b.use_count - a.use_count;
            })
        : prev
    );
    try {
      await setPinned(r.id, next);
    } catch (err) {
      // Revert UI + tell the user (usually the migration message).
      setRecent((prev) =>
        prev
          ? prev.map((x) =>
              x.id === r.id ? { ...x, pinned: r.pinned } : x
            )
          : prev
      );
      alert((err as Error).message);
    }
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
            {/* Breadcrumb + create-folder */}
            <div className="flex items-center justify-between gap-2 mb-2">
              {activeFolder ? (
                <button
                  onClick={() => setActiveFolder(null)}
                  className="text-[11px] text-accent hover:underline flex items-center gap-1"
                >
                  <ChevronLeft size={11} /> All assets
                </button>
              ) : (
                <div className="text-[10.5px] uppercase tracking-wider text-neutral-500">
                  {folders.length > 0 ? "Folders + assets" : "Assets"}
                </div>
              )}
              <button
                onClick={() => setCreatingFolder(true)}
                className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1"
                title="Create a folder to organize icons"
              >
                <FolderPlus size={11} /> New folder
              </button>
            </div>

            {creatingFolder && (
              <div className="flex items-center gap-2 mb-2 bg-panelSoft/60 border border-border rounded px-2 py-1.5">
                <FolderIcon size={12} className="text-amber-400" />
                <input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateFolder();
                    if (e.key === "Escape") {
                      setCreatingFolder(false);
                      setNewFolderName("");
                    }
                  }}
                  autoFocus
                  placeholder="Folder name (e.g. Aditya D., Apex, VeeTee)"
                  className="flex-1 bg-transparent text-[12px] outline-none text-white"
                />
                <button
                  onClick={handleCreateFolder}
                  className="text-[11px] text-black bg-accent px-2 py-0.5 rounded font-medium"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setCreatingFolder(false);
                    setNewFolderName("");
                  }}
                  className="text-[11px] text-neutral-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Folder chips (visible at this level) */}
            {foldersInHere.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mb-3">
                {foldersInHere.map((f) => (
                  <FolderTile
                    key={f.id}
                    folder={f}
                    count={
                      (recent ?? []).filter((r) => r.folder_id === f.id).length
                    }
                    onOpen={() => setActiveFolder(f)}
                    onDelete={() => handleDeleteFolder(f)}
                    onDropUpload={(uploadId) =>
                      handleMoveUpload(uploadId, f.id)
                    }
                  />
                ))}
              </div>
            )}

            {recent === null ? (
              <div className="text-xs text-neutral-500 py-8 text-center">
                Loading…
              </div>
            ) : visibleRecent.length === 0 && foldersInHere.length === 0 ? (
              <EmptyRecent onSwitchToUpload={() => setTab("upload")} />
            ) : (
              <>
                <div className="grid grid-cols-4 gap-2">
                  {visibleRecent.map((r) => (
                    <RecentThumb
                      key={r.id}
                      recent={r}
                      folders={folders}
                      onPick={() => pickRecent(r)}
                      onRemove={(e) => removeRecent(r, e)}
                      onTogglePinned={(e) => togglePinned(r, e)}
                      onMove={(folderId) => handleMoveUpload(r.id, folderId)}
                    />
                  ))}
                </div>
                <div className="text-3xs text-neutral-500 mt-3">
                  <div className="mb-1">
                    <Star
                      size={9}
                      className="inline text-accent -mt-0.5 mr-1"
                      fill="currentColor"
                    />
                    Click the star to save an icon forever — pinned icons
                    stay across every project and never get pushed out by
                    the {40}-image cap.
                  </div>
                  Sorted: pinned first, then most used. Un-pinned images you
                  never re-use eventually drop off. Deleting doesn&rsquo;t
                  affect hotspots already using an icon.
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
  folders,
  onPick,
  onRemove,
  onTogglePinned,
  onMove,
}: {
  recent: RecentUpload;
  folders: AssetFolder[];
  onPick: () => void;
  onRemove: (e: React.MouseEvent) => void;
  onTogglePinned: (e: React.MouseEvent) => void;
  onMove: (folderId: string | null) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pinned = !!recent.pinned;
  return (
    <button
      onClick={onPick}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/factour-upload-id", recent.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      title={`${recent.filename ?? "image"} · used ${recent.use_count}× ${
        pinned ? "· saved forever" : ""
      }`}
      className={`aspect-square bg-panelSoft border rounded overflow-hidden transition-colors relative group cursor-grab active:cursor-grabbing ${
        pinned ? "border-accent/70" : "border-border hover:border-accent"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={recent.public_url}
        alt=""
        className="w-full h-full object-contain p-1.5"
        loading="lazy"
      />
      {/* Pin / save-forever toggle — top-left. Always visible when
          pinned (as a state indicator); appears on hover otherwise so
          the grid stays clean. */}
      <button
        onClick={onTogglePinned}
        title={
          pinned
            ? "Un-pin — allow this icon to be pushed out of Recent"
            : "Save forever — pin this icon so it never gets removed"
        }
        className={`absolute top-0.5 left-0.5 p-1 rounded transition-opacity ${
          pinned
            ? "bg-accent/85 text-black opacity-100"
            : "bg-black/70 text-neutral-300 hover:text-accent opacity-0 group-hover:opacity-100"
        }`}
      >
        <Star size={10} fill={pinned ? "currentColor" : "none"} />
      </button>
      {recent.use_count > 1 && (
        <span
          className={`absolute ${
            pinned ? "top-0.5 left-6" : "bottom-0.5 left-0.5"
          } bg-accent/85 text-black text-3xs font-semibold px-1 rounded`}
        >
          {recent.use_count}×
        </span>
      )}
      {/* Move-to-folder popover — ⋮ button, opens a small folder list.
          Clicking "Root" un-files the asset. */}
      <div
        className="absolute top-0.5 right-6 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          title="Move to folder"
          className="p-0.5 rounded bg-black/70 text-neutral-300 hover:text-accent"
        >
          <MoreVertical size={10} />
        </button>
        {menuOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 top-full mt-1 z-30 min-w-[140px] bg-panel border border-border rounded shadow-panel py-1 text-[11px]"
          >
            <div className="px-2 py-1 text-[9.5px] uppercase tracking-wider text-neutral-500">
              Move to
            </div>
            <button
              onClick={() => {
                onMove(null);
                setMenuOpen(false);
              }}
              className={`w-full text-left px-2 py-1 hover:bg-white/5 flex items-center gap-1.5 ${
                !recent.folder_id ? "text-accent" : "text-neutral-200"
              }`}
            >
              <FolderIcon size={10} className="opacity-60" /> Root (no folder)
            </button>
            {folders.length === 0 ? (
              <div className="px-2 py-1.5 text-neutral-500 text-3xs">
                No folders yet — create one from the header.
              </div>
            ) : (
              folders.map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    onMove(f.id);
                    setMenuOpen(false);
                  }}
                  className={`w-full text-left px-2 py-1 hover:bg-white/5 flex items-center gap-1.5 truncate ${
                    recent.folder_id === f.id
                      ? "text-accent"
                      : "text-neutral-200"
                  }`}
                >
                  <FolderIcon size={10} className="opacity-70 text-amber-400" />
                  <span className="truncate">{f.name}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
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

/** Folder tile in the Recent grid — click to enter, drop asset to file. */
function FolderTile({
  folder,
  count,
  onOpen,
  onDelete,
  onDropUpload,
}: {
  folder: AssetFolder;
  count: number;
  onOpen: () => void;
  onDelete: () => void;
  onDropUpload: (uploadId: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <button
      onClick={onOpen}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("text/factour-upload-id")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const id = e.dataTransfer.getData("text/factour-upload-id");
        if (id) onDropUpload(id);
      }}
      className={`aspect-square rounded border grid place-items-center relative group transition-colors ${
        dragOver
          ? "border-amber-400 bg-amber-500/10"
          : "border-border bg-panelSoft hover:border-accent"
      }`}
      title={folder.name}
    >
      <FolderIcon size={28} className="text-amber-400" />
      <div className="text-[10.5px] font-medium text-neutral-300 truncate max-w-[90%] mt-1">
        {folder.name}
      </div>
      <div className="text-[9px] text-neutral-500">
        {count} {count === 1 ? "item" : "items"}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete folder"
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
