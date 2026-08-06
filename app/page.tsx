"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, publicUrl } from "@/lib/supabase";
import type { Folder, Tour } from "@/lib/types";
import TopBar from "@/components/TopBar";
import {
  Plus,
  Search,
  Trash2,
  Eye,
  HardDrive,
  Image as ImageIcon,
  Upload as UploadIcon,
  Grid3x3,
  Rows3,
  BarChart3,
  Folder as FolderIcon,
  FolderPlus,
  Lock,
  MoreHorizontal,
  X,
  Pencil,
} from "lucide-react";
import { importTourFromFile } from "@/lib/backup";
import {
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  setFolderPassword,
  moveTourToFolder,
  isFolderUnlocked,
  unlockFolder,
  relockFolder,
} from "@/lib/folders";

type TourWithCover = Tour & { cover_path: string | null; scene_count: number };
type Layout = "grid" | "list";

export default function DashboardPage() {
  const [tours, setTours] = useState<TourWithCover[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");
  const [layout, setLayout] = useState<Layout>("grid");
  const [loading, setLoading] = useState(true);
  const [storageBytes, setStorageBytes] = useState<number>(0);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [creatingTour, setCreatingTour] = useState(false);

  // Folders — chip strip above the tour grid. "all" shows everything;
  // "unfiled" shows tours with folder_id === null; a folder id filters
  // to that folder. Password-protected folders require unlock to view.
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | "all" | "unfiled">(
    "all"
  );
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [unlockPromptFolder, setUnlockPromptFolder] = useState<Folder | null>(
    null
  );
  const [managingFolder, setManagingFolder] = useState<Folder | null>(null);
  // Tick this to force isFolderUnlocked() re-evaluation after unlock/relock.
  const [unlockTick, setUnlockTick] = useState(0);

  async function load() {
    setLoading(true);
    const { data: tourRows } = await supabase
      .from("tours")
      .select("*")
      .order("updated_at", { ascending: false });

    const list: TourWithCover[] = [];
    for (const t of (tourRows ?? []) as Tour[]) {
      const { data: scenes } = await supabase
        .from("scenes")
        .select("id, image_path")
        .eq("tour_id", t.id)
        .order("order_index");
      const cover = t.thumbnail_path ?? scenes?.[0]?.image_path ?? null;
      list.push({ ...t, cover_path: cover, scene_count: scenes?.length ?? 0 });
    }
    setTours(list);

    const { data: files } = await supabase.storage
      .from("panoramas")
      .list("", { limit: 1000 });
    const bytes = (files ?? []).reduce(
      (s, f) => s + (f.metadata?.size ?? 0),
      0
    );
    setStorageBytes(bytes);

    // Folders — swallow errors (missing table = folders feature unused).
    try {
      const folderRows = await listFolders();
      setFolders(folderRows);
    } catch (e) {
      console.warn("[folders] load skipped:", e);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createTour(opts: {
    title: string;
    description: string;
    mirrored: boolean;
  }) {
    const { data, error } = await supabase
      .from("tours")
      .insert({
        title: opts.title.trim() || "Untitled tour",
        description: opts.description.trim() || null,
        mirrored: opts.mirrored,
      })
      .select()
      .single();
    if (error) return alert(error.message);
    window.location.href = `/tour/${data.id}/edit`;
  }

  async function deleteTour(id: string) {
    if (!confirm("Delete this tour?")) return;
    await supabase.from("tours").delete().eq("id", id);
    load();
  }

  async function uploadThumbnail(tourId: string, file: File) {
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `thumbnails/${tourId}-${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("panoramas")
      .upload(path, file, { cacheControl: "3600", upsert: false });
    if (upErr) return alert(`Upload failed: ${upErr.message}`);
    // .select() after update confirms the row was actually written —
    // exposes silent RLS / missing-column failures instead of leaving
    // us guessing why the thumbnail reverts on refresh.
    const { data, error: updErr } = await supabase
      .from("tours")
      .update({ thumbnail_path: path })
      .eq("id", tourId)
      .select("id, thumbnail_path")
      .single();
    if (updErr) {
      console.error("[thumbnail save]", updErr);
      return alert(
        `Thumbnail save failed:\n\n${updErr.message}\n\n` +
          `If it mentions a missing column, re-run supabase/schema.sql.`
      );
    }
    console.log("[thumbnail save] persisted", data);
    load();
  }

  async function handleCreateFolder(name: string, password: string) {
    try {
      await createFolder(name, password || undefined);
      setCreatingFolder(false);
      load();
    } catch (e) {
      alert(
        `Folder create failed: ${(e as Error).message}\n\n` +
          `If it mentions a missing table, re-run supabase/schema.sql.`
      );
    }
  }

  async function handleRenameFolder(id: string, name: string) {
    await renameFolder(id, name);
    load();
  }

  async function handleDeleteFolder(id: string) {
    if (
      !confirm(
        "Delete this folder? Tours inside will be moved to Unfiled (not deleted)."
      )
    )
      return;
    await deleteFolder(id);
    if (activeFolderId === id) setActiveFolderId("all");
    setManagingFolder(null);
    load();
  }

  async function handleSetPassword(id: string, password: string | null) {
    await setFolderPassword(id, password);
    // If we just cleared the password, drop any stale unlock; if we just
    // set a new one, force a re-lock so the change takes effect immediately.
    const f = folders.find((x) => x.id === id);
    if (f) relockFolder(f);
    setUnlockTick((t) => t + 1);
    load();
  }

  async function handleMoveTourToFolder(
    tourId: string,
    folderId: string | null
  ) {
    // Snapshot for rollback if the DB update fails.
    const prev = tours;
    // Optimistic UI: update the tour's folder_id locally so the drag lands
    // instantly and the card visibly moves. No full page reload, no flicker.
    setTours((list) =>
      list.map((t) => (t.id === tourId ? { ...t, folder_id: folderId } : t))
    );
    try {
      await moveTourToFolder(tourId, folderId);
    } catch (e) {
      setTours(prev);
      alert(`Move failed: ${(e as Error).message}`);
    }
  }

  async function handleUnlock(folder: Folder, password: string) {
    const ok = await unlockFolder(folder, password);
    if (!ok) {
      alert("Wrong password.");
      return;
    }
    setUnlockPromptFolder(null);
    setActiveFolderId(folder.id);
    setUnlockTick((t) => t + 1);
  }

  async function handleImportBackup(file: File) {
    setImporting(true);
    try {
      const { tourId } = await importTourFromFile(file);
      window.location.href = `/tour/${tourId}/edit`;
    } catch (e) {
      alert(`Import failed: ${(e as Error).message}`);
      setImporting(false);
    }
  }

  const filtered = useMemo(() => {
    return tours.filter((t) => {
      if (filter === "published" && !t.published) return false;
      if (filter === "draft" && t.published) return false;
      if (q && !t.title.toLowerCase().includes(q.toLowerCase())) return false;
      if (activeFolderId === "all") {
        // Root view = "Unfiled" area. Tours inside any folder are hidden
        // (they only appear when the user opens that folder). This makes
        // drag-into-folder look like a move, not a copy.
        if (t.folder_id) return false;
      } else if (activeFolderId === "unfiled") {
        if (t.folder_id) return false;
      } else {
        if (t.folder_id !== activeFolderId) return false;
      }
      return true;
    });
  }, [tours, q, filter, activeFolderId]);

  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Sub-header row: title left, actions right */}
        <div className="flex items-end justify-between mb-5 gap-3 flex-wrap">
          <div>
            <div className="eyebrow mb-0.5">My tours</div>
            <h1 className="text-[22px] font-semibold leading-tight">
              Dashboard
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".factour"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportBackup(f);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="chip !py-1.5"
              title="Restore a tour from a .factour backup file"
            >
              <UploadIcon size={12} />
              {importing ? "Restoring…" : "Import backup"}
            </button>
            <button
              onClick={() => setCreatingTour(true)}
              className="flex items-center gap-1.5 bg-accent hover:bg-accentHover text-black font-medium px-3 py-1.5 rounded text-[12px] transition-colors"
            >
              <Plus size={14} /> New tour
            </button>
          </div>
        </div>

        {creatingTour && (
          <NewTourModal
            onCancel={() => setCreatingTour(false)}
            onCreate={(opts) => createTour(opts)}
          />
        )}

        {creatingFolder && (
          <NewFolderModal
            onCancel={() => setCreatingFolder(false)}
            onCreate={handleCreateFolder}
          />
        )}

        {managingFolder && (
          <ManageFolderModal
            folder={managingFolder}
            onClose={() => setManagingFolder(null)}
            onRename={handleRenameFolder}
            onDelete={handleDeleteFolder}
            onSetPassword={handleSetPassword}
            onRelock={(f) => {
              relockFolder(f);
              setUnlockTick((t) => t + 1);
            }}
          />
        )}

        {unlockPromptFolder && (
          <UnlockFolderModal
            folder={unlockPromptFolder}
            onCancel={() => setUnlockPromptFolder(null)}
            onUnlock={handleUnlock}
          />
        )}

        {/* Compact stat strip */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          <StatCard
            label="Tours"
            value={tours.length}
            icon={<ImageIcon size={14} />}
          />
          <StatCard
            label="Published"
            value={tours.filter((t) => t.published).length}
            icon={<Eye size={14} />}
          />
          <StatCard
            label="Storage used"
            value={formatBytes(storageBytes)}
            icon={<HardDrive size={14} />}
          />
        </div>

        {/* Breadcrumb (when inside a folder) */}
        {activeFolderId !== "all" && (
          <div
            className="flex items-center gap-2 mb-3 text-[12px] text-neutral-300"
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("text/tour-id")) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }
            }}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("text/tour-id");
              if (id) handleMoveTourToFolder(id, null);
            }}
          >
            <button
              onClick={() => setActiveFolderId("all")}
              className="chip !py-1.5 flex items-center gap-1"
              title="Back to all folders — drop a tour here to unfile it"
            >
              ← All folders
            </button>
            <PremiumFolderIcon className="w-5" />
            <span className="font-medium">
              {activeFolderId === "unfiled"
                ? "Unfiled"
                : folders.find((f) => f.id === activeFolderId)?.name ??
                  "Folder"}
            </span>
            {activeFolderId !== "unfiled" && (
              <button
                onClick={() => {
                  const f = folders.find((x) => x.id === activeFolderId);
                  if (f) setManagingFolder(f);
                }}
                className="text-neutral-500 hover:text-white ml-1"
                title="Manage folder"
              >
                <MoreHorizontal size={13} />
              </button>
            )}
          </div>
        )}

        {/* Toolbar: filter chips + search + layout toggle */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-1">
            {(["all", "published", "draft"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`chip ${filter === f ? "active" : ""}`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <div className="relative">
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search tours..."
              className="field !w-56 !pl-7"
            />
          </div>
          <div className="flex items-center border border-border rounded overflow-hidden bg-panelSoft">
            <button
              onClick={() => setLayout("grid")}
              className={`p-1.5 ${
                layout === "grid" ? "text-accent" : "text-neutral-400"
              }`}
              title="Grid view"
            >
              <Grid3x3 size={14} />
            </button>
            <button
              onClick={() => setLayout("list")}
              className={`p-1.5 ${
                layout === "list" ? "text-accent" : "text-neutral-400"
              }`}
              title="List view"
            >
              <Rows3 size={14} />
            </button>
          </div>
        </div>

        {/* Tour grid / list */}
        {loading ? (
          <div className="text-neutral-500 text-sm py-10 text-center">
            Loading…
          </div>
        ) : layout === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {/* Folder cards — only shown at the "all" root level */}
            {activeFolderId === "all" &&
              folders.map((f) => (
                <FolderCard
                  key={f.id}
                  folder={f}
                  tourCount={tours.filter((t) => t.folder_id === f.id).length}
                  onOpen={(id) => {
                    const folder = folders.find((x) => x.id === id);
                    if (folder && !isFolderUnlocked(folder)) {
                      setUnlockPromptFolder(folder);
                    } else {
                      setActiveFolderId(id);
                    }
                  }}
                  onManage={() => setManagingFolder(f)}
                  onDropTour={(tourId) => handleMoveTourToFolder(tourId, f.id)}
                />
              ))}
            {activeFolderId === "all" && (
              <NewFolderCard onClick={() => setCreatingFolder(true)} />
            )}
            {filtered.length === 0 && activeFolderId !== "all" ? (
              <div className="col-span-full">
                <EmptyState onNew={() => setCreatingTour(true)} />
              </div>
            ) : (
              filtered.map((t) => (
                <TourCard
                  key={t.id}
                  tour={t}
                  folders={folders}
                  onDelete={deleteTour}
                  onUploadThumb={uploadThumbnail}
                  onMoveToFolder={handleMoveTourToFolder}
                />
              ))
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            {activeFolderId === "all" &&
              folders.map((f) => (
                <FolderRow
                  key={f.id}
                  folder={f}
                  tourCount={tours.filter((t) => t.folder_id === f.id).length}
                  onOpen={(id) => {
                    const folder = folders.find((x) => x.id === id);
                    if (folder && !isFolderUnlocked(folder)) {
                      setUnlockPromptFolder(folder);
                    } else {
                      setActiveFolderId(id);
                    }
                  }}
                  onManage={() => setManagingFolder(f)}
                  onDropTour={(tourId) => handleMoveTourToFolder(tourId, f.id)}
                />
              ))}
            {filtered.length === 0 && activeFolderId !== "all" ? (
              <EmptyState onNew={() => setCreatingTour(true)} />
            ) : (
              filtered.map((t) => (
                <TourRow
                  key={t.id}
                  tour={t}
                  folders={folders}
                  onDelete={deleteTour}
                  onUploadThumb={uploadThumbnail}
                  onMoveToFolder={handleMoveTourToFolder}
                />
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}

/* --------------------------------- CARDS -------------------------------- */

function TourCard({
  tour,
  folders,
  onDelete,
  onUploadThumb,
  onMoveToFolder,
}: {
  tour: TourWithCover;
  folders: Folder[];
  onDelete: (id: string) => void;
  onUploadThumb: (id: string, f: File) => void;
  onMoveToFolder: (tourId: string, folderId: string | null) => void;
}) {
  const router = useRouter();
  const goToEdit = () => router.push(`/tour/${tour.id}/edit`);
  return (
    <div
      draggable
      onDragStart={(e) => {
        // Clear any browser-default URL payload — otherwise dropping on
        // Chrome's own drop zones (or the browser chrome) navigates or
        // opens a new tab, which felt like a "page reload".
        try {
          e.dataTransfer.clearData();
        } catch {}
        e.dataTransfer.setData("text/tour-id", tour.id);
        e.dataTransfer.setData("text/plain", tour.title);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="group block bg-panelSoft border border-border rounded overflow-hidden hover:border-accent/60 transition-colors cursor-grab active:cursor-grabbing"
    >
      <div
        onClick={goToEdit}
        className="aspect-video bg-black relative overflow-hidden cursor-pointer"
      >
        {tour.cover_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={publicUrl(tour.cover_path)}
            alt={tour.title}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-neutral-600 text-xs">
            no image
          </div>
        )}

        <span
          className={`absolute top-1.5 right-1.5 text-3xs px-1.5 py-0.5 rounded uppercase tracking-wider font-medium ${
            tour.published
              ? "bg-accent text-black"
              : "bg-black/60 text-neutral-300 border border-white/10"
          }`}
        >
          {tour.published ? "Public" : "Draft"}
        </span>

        <label
          className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-black/70 backdrop-blur-sm text-white text-3xs px-1.5 py-1 rounded cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
          title={tour.thumbnail_path ? "Replace thumbnail" : "Set thumbnail"}
          onClick={(e) => e.stopPropagation()}
        >
          <ImageIcon size={10} />
          {tour.thumbnail_path ? "Change" : "Thumb"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadThumb(tour.id, f);
              e.target.value = "";
            }}
          />
        </label>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent p-2 pt-6 pr-16">
          <div className="text-[13px] font-medium truncate">{tour.title}</div>
          <div className="text-3xs text-neutral-400 flex items-center gap-2">
            <span>
              {tour.scene_count} scene{tour.scene_count === 1 ? "" : "s"}
            </span>
            <span>·</span>
            <span>{new Date(tour.updated_at).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <MoveToFolderMenu
            tour={tour}
            folders={folders}
            onMove={onMoveToFolder}
          />
          <Link
            href={`/analytics/${tour.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-white/80 hover:text-accent p-1 rounded hover:bg-white/10"
            title="View analytics"
          >
            <BarChart3 size={12} />
          </Link>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete(tour.id);
            }}
            className="text-white/80 hover:text-red-400 p-1 rounded hover:bg-white/10"
            title="Delete tour"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

function TourRow({
  tour,
  folders,
  onDelete,
  onUploadThumb,
  onMoveToFolder,
}: {
  tour: TourWithCover;
  folders: Folder[];
  onDelete: (id: string) => void;
  onUploadThumb: (id: string, f: File) => void;
  onMoveToFolder: (tourId: string, folderId: string | null) => void;
}) {
  const router = useRouter();
  const goToEdit = () => router.push(`/tour/${tour.id}/edit`);
  return (
    <div
      draggable
      onDragStart={(e) => {
        try {
          e.dataTransfer.clearData();
        } catch {}
        e.dataTransfer.setData("text/tour-id", tour.id);
        e.dataTransfer.setData("text/plain", tour.title);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="flex items-center gap-3 bg-panelSoft border border-border rounded px-2 py-2 hover:border-accent/60 transition-colors group cursor-grab active:cursor-grabbing"
    >
      <div
        onClick={goToEdit}
        className="w-24 h-14 bg-black rounded overflow-hidden shrink-0 cursor-pointer"
      >
        {tour.cover_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={publicUrl(tour.cover_path)}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-neutral-600 text-3xs">
            no image
          </div>
        )}
      </div>
      <div
        onClick={goToEdit}
        className="min-w-0 flex-1 cursor-pointer"
      >
        <div className="text-[13px] font-medium truncate">{tour.title}</div>
        <div className="text-3xs text-neutral-500 flex items-center gap-2">
          <span>
            {tour.scene_count} scene{tour.scene_count === 1 ? "" : "s"}
          </span>
          <span>·</span>
          <span>{new Date(tour.updated_at).toLocaleDateString()}</span>
        </div>
      </div>
      <span
        className={`text-3xs px-1.5 py-0.5 rounded uppercase tracking-wider font-medium ${
          tour.published
            ? "bg-accent text-black"
            : "bg-neutral-800 text-neutral-300 border border-border"
        }`}
      >
        {tour.published ? "Public" : "Draft"}
      </span>
      <label
        className="chip cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
        title={tour.thumbnail_path ? "Replace thumbnail" : "Set thumbnail"}
      >
        <ImageIcon size={11} />
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUploadThumb(tour.id, f);
            e.target.value = "";
          }}
        />
      </label>
      <MoveToFolderMenu
        tour={tour}
        folders={folders}
        onMove={onMoveToFolder}
      />
      <Link
        href={`/analytics/${tour.id}`}
        onClick={(e) => e.stopPropagation()}
        className="text-neutral-500 hover:text-accent p-1 rounded"
        title="View analytics"
      >
        <BarChart3 size={12} />
      </Link>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDelete(tour.id);
        }}
        className="text-neutral-500 hover:text-red-400 p-1 rounded"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="border border-dashed border-border rounded-lg py-16 text-center bg-panelSoft/30">
      <ImageIcon size={28} className="mx-auto mb-2 text-neutral-600" />
      <div className="text-sm text-neutral-300 mb-1">No tours match.</div>
      <div className="text-xs text-neutral-500 mb-4">
        Create your first tour to get started.
      </div>
      <button
        onClick={onNew}
        className="inline-flex items-center gap-1.5 bg-accent hover:bg-accentHover text-black font-medium px-3 py-1.5 rounded text-xs transition-colors"
      >
        <Plus size={14} /> New tour
      </button>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-panelSoft border border-border rounded px-3 py-2.5 flex items-center gap-2.5">
      <div className="w-8 h-8 grid place-items-center rounded bg-black/40 text-accent">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-3xs uppercase tracking-wider text-neutral-500">
          {label}
        </div>
        <div className="text-[15px] font-semibold leading-tight">{value}</div>
      </div>
    </div>
  );
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/* ---------------------------- New tour modal ---------------------------- */

function NewTourModal({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (opts: {
    title: string;
    description: string;
    mirrored: boolean;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 bg-black/70 grid place-items-center z-50 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-panel border border-border rounded-lg w-[560px] max-w-full p-5 max-h-[90vh] overflow-auto shadow-panel"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-semibold">New tour</h3>
          <button
            onClick={onCancel}
            className="text-neutral-500 hover:text-white text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="space-y-3 mb-5">
          <div>
            <div className="eyebrow mb-1">Project title</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Micron Wires & Polymer Pvt Ltd"
              autoFocus
              className="field"
            />
          </div>
          <div>
            <div className="eyebrow mb-1">Description</div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short description of the site, the client, or what this tour covers…"
              rows={3}
              className="field resize-none"
            />
          </div>
        </div>

        <div className="mb-2">
          <div className="eyebrow mb-1">Reading direction</div>
          <p className="text-2xs text-neutral-500 mb-3">
            How panoramas are displayed. Can&rsquo;t be changed later. Click a
            card to create.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() =>
              onCreate({ title, description, mirrored: false })
            }
            className="text-left border border-border rounded-md p-3 hover:border-accent hover:bg-accent/5 transition-colors"
          >
            <div className="text-[13px] font-medium mb-1 flex items-center gap-1.5">
              Standard
              <span className="text-3xs bg-accent text-black rounded px-1.5 py-0.5 font-medium">
                recommended
              </span>
            </div>
            <div className="text-2xs text-neutral-400 leading-relaxed">
              Text on signs, calendars, clocks and posters reads normally. Best
              for factory tours.
            </div>
          </button>
          <button
            onClick={() =>
              onCreate({ title, description, mirrored: true })
            }
            className="text-left border border-border rounded-md p-3 hover:border-accent hover:bg-accent/5 transition-colors"
          >
            <div className="text-[13px] font-medium mb-1">Mirrored</div>
            <div className="text-2xs text-neutral-400 leading-relaxed">
              Uses raw equirectangular rendering — text reads backwards. Only
              pick this if source panoramas were captured mirrored.
            </div>
          </button>
        </div>

        <div className="flex justify-end mt-4">
          <button
            onClick={onCancel}
            className="text-xs text-neutral-400 hover:text-white"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- Folder components ------------------------- */

/** Premium 3D-ish folder icon rendered as pure SVG — no external asset.
 *  Layered back tab (darker) → front body (lighter with vertical gradient)
 *  → top glossy highlight → subtle bottom shadow. Deliberately matches the
 *  chunky Fluent / macOS finder look rather than a flat Lucide outline. */
function PremiumFolderIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 128 104"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="folderBack" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
        <linearGradient id="folderFront" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fcd34d" />
          <stop offset="55%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
        <linearGradient id="folderGloss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <filter id="folderShadow" x="-10%" y="-10%" width="120%" height="130%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2.5" />
          <feOffset dx="0" dy="3" result="off" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.55" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Back tab (darker, slightly taller than the front) */}
      <path
        d="M10 24
           Q10 14 20 14
           H48
           L58 26
           H108
           Q118 26 118 36
           V44
           H10 Z"
        fill="url(#folderBack)"
      />

      {/* Optional paper sheet peeking out from the top */}
      <rect
        x="26"
        y="30"
        width="76"
        height="10"
        rx="1.5"
        fill="#f8fafc"
        opacity="0.85"
      />
      <rect
        x="22"
        y="34"
        width="84"
        height="10"
        rx="1.5"
        fill="#e2e8f0"
        opacity="0.85"
      />

      {/* Front body */}
      <path
        d="M8 40
           Q8 34 14 34
           H114
           Q120 34 120 40
           V88
           Q120 96 112 96
           H16
           Q8 96 8 88 Z"
        fill="url(#folderFront)"
        filter="url(#folderShadow)"
      />

      {/* Top glossy highlight on the front body */}
      <path
        d="M8 40
           Q8 34 14 34
           H114
           Q120 34 120 40
           V52
           H8 Z"
        fill="url(#folderGloss)"
      />

      {/* Fine bottom rim (subtle darker line for depth) */}
      <path
        d="M12 92
           H116"
        stroke="#b45309"
        strokeOpacity="0.35"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Classic yellow folder tile shown alongside tour cards on the dashboard.
 *  Acts as a drop target — dragging a tour card onto it moves the tour
 *  into this folder. Clicking opens the folder view. */
function FolderCard({
  folder,
  tourCount,
  onOpen,
  onManage,
  onDropTour,
}: {
  folder: Folder;
  tourCount: number;
  onOpen: (id: string) => void;
  onManage: () => void;
  onDropTour: (tourId: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const locked = !!folder.password_hash;
  return (
    <div
      onClick={() => onOpen(folder.id)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("text/tour-id")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const id = e.dataTransfer.getData("text/tour-id");
        if (id) onDropTour(id);
      }}
      className={`group cursor-pointer bg-panelSoft border rounded overflow-hidden transition-colors ${
        dragOver
          ? "border-yellow-400 ring-2 ring-yellow-400/40"
          : "border-border hover:border-accent/60"
      }`}
    >
      <div className="aspect-video bg-gradient-to-b from-neutral-900 to-black relative grid place-items-center overflow-hidden">
        <PremiumFolderIcon className="w-[52%] drop-shadow-2xl" />
        {locked && (
          <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm border border-white/10 rounded-full p-1.5">
            <Lock size={12} className="text-yellow-300" />
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onManage();
          }}
          className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 backdrop-blur-sm border border-white/10 text-white p-1 rounded hover:text-accent"
          title="Manage folder"
        >
          <MoreHorizontal size={12} />
        </button>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2 pt-6">
          <div className="text-[13px] font-medium truncate">{folder.name}</div>
          <div className="text-3xs text-neutral-400">
            {tourCount} tour{tourCount === 1 ? "" : "s"}
          </div>
        </div>
      </div>
    </div>
  );
}

/** List-view variant of the folder tile — matches TourRow's rhythm. */
function FolderRow({
  folder,
  tourCount,
  onOpen,
  onManage,
  onDropTour,
}: {
  folder: Folder;
  tourCount: number;
  onOpen: (id: string) => void;
  onManage: () => void;
  onDropTour: (tourId: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const locked = !!folder.password_hash;
  return (
    <div
      onClick={() => onOpen(folder.id)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("text/tour-id")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const id = e.dataTransfer.getData("text/tour-id");
        if (id) onDropTour(id);
      }}
      className={`flex items-center gap-3 bg-panelSoft border rounded px-2 py-2 cursor-pointer transition-colors ${
        dragOver
          ? "border-yellow-400 ring-2 ring-yellow-400/30"
          : "border-border hover:border-accent/60"
      }`}
    >
      <div className="w-24 h-14 rounded overflow-hidden shrink-0 grid place-items-center bg-gradient-to-b from-neutral-900 to-black">
        <PremiumFolderIcon className="w-12" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium truncate flex items-center gap-1.5">
          {folder.name}
          {locked && <Lock size={11} className="text-yellow-400" />}
        </div>
        <div className="text-3xs text-neutral-500">
          Folder · {tourCount} tour{tourCount === 1 ? "" : "s"}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onManage();
        }}
        className="text-neutral-500 hover:text-accent p-1 rounded"
        title="Manage folder"
      >
        <MoreHorizontal size={12} />
      </button>
    </div>
  );
}

/** "+ New folder" placeholder tile at the end of the folder row. */
function NewFolderCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="aspect-video border border-dashed border-border hover:border-accent hover:bg-accent/5 rounded flex flex-col items-center justify-center gap-1.5 text-neutral-400 hover:text-accent transition-colors"
    >
      <FolderPlus size={22} />
      <span className="text-[12px] font-medium">New folder</span>
    </button>
  );
}

/* ------------------------------ Modals ---------------------------------- */


/** Small popover for moving a tour into (or out of) a folder. Rendered
 *  inside each tour card / row. Uses a controlled open state so the menu
 *  closes when the user clicks outside or picks an option. */
function MoveToFolderMenu({
  tour,
  folders,
  onMove,
}: {
  tour: TourWithCover;
  folders: Folder[];
  onMove: (tourId: string, folderId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="text-neutral-400 hover:text-accent p-1 rounded hover:bg-accent/10"
        title="Move to folder"
      >
        <FolderIcon size={12} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 min-w-[180px] bg-panel border border-border rounded shadow-panel py-1 text-[12px]">
          <div className="px-2 pt-1 pb-1 text-3xs uppercase tracking-wider text-neutral-500">
            Move to folder
          </div>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onMove(tour.id, null);
              setOpen(false);
            }}
            className={`w-full text-left px-2 py-1 hover:bg-white/5 flex items-center gap-2 ${
              !tour.folder_id ? "text-accent" : "text-neutral-200"
            }`}
          >
            <X size={11} className="opacity-60" />
            Unfiled
          </button>
          {folders.length === 0 ? (
            <div className="px-2 py-1.5 text-neutral-500 text-3xs">
              No folders yet — create one above.
            </div>
          ) : (
            folders.map((f) => (
              <button
                key={f.id}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onMove(tour.id, f.id);
                  setOpen(false);
                }}
                className={`w-full text-left px-2 py-1 hover:bg-white/5 flex items-center gap-2 truncate ${
                  tour.folder_id === f.id
                    ? "text-accent"
                    : "text-neutral-200"
                }`}
              >
                {f.password_hash ? (
                  <Lock size={11} className="opacity-70" />
                ) : (
                  <FolderIcon size={11} className="opacity-70" />
                )}
                <span className="truncate">{f.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function NewFolderModal({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (name: string, password: string) => void;
}) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 bg-black/70 grid place-items-center z-50 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-panel border border-border rounded-lg w-[420px] max-w-full p-5 shadow-panel"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-semibold flex items-center gap-2">
            <FolderPlus size={14} /> New folder
          </h3>
          <button
            onClick={onCancel}
            className="text-neutral-500 hover:text-white text-lg leading-none"
          >
            ×
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <div className="eyebrow mb-1">Folder name</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Client — Micron Wires"
              autoFocus
              className="field"
            />
          </div>
          <div>
            <div className="eyebrow mb-1">Password (optional)</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank for an open folder"
              className="field"
            />
            <p className="text-3xs text-neutral-500 mt-1">
              Password-protected folders hide their tours behind an unlock
              prompt. Casual protection only — not cryptographically secured.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="text-xs text-neutral-400 hover:text-white px-3 py-1.5"
          >
            Cancel
          </button>
          <button
            onClick={() => onCreate(name, password)}
            disabled={!name.trim()}
            className="bg-accent hover:bg-accentHover text-black text-xs font-medium px-3 py-1.5 rounded disabled:opacity-50"
          >
            Create folder
          </button>
        </div>
      </div>
    </div>
  );
}

function ManageFolderModal({
  folder,
  onClose,
  onRename,
  onDelete,
  onSetPassword,
  onRelock,
}: {
  folder: Folder;
  onClose: () => void;
  onRename: (id: string, name: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onSetPassword: (id: string, password: string | null) => Promise<void> | void;
  onRelock: (folder: Folder) => void;
}) {
  const [name, setName] = useState(folder.name);
  const [password, setPassword] = useState("");
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/70 grid place-items-center z-50 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-panel border border-border rounded-lg w-[420px] max-w-full p-5 shadow-panel"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-semibold flex items-center gap-2">
            <Pencil size={13} /> Manage folder
          </h3>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-white text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <div className="eyebrow mb-1">Name</div>
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="field"
              />
              <button
                onClick={async () => {
                  await onRename(folder.id, name);
                  onClose();
                }}
                disabled={!name.trim() || name === folder.name}
                className="chip !py-1.5 disabled:opacity-50"
              >
                Rename
              </button>
            </div>
          </div>

          <div>
            <div className="eyebrow mb-1">
              Password
              {folder.password_hash ? (
                <span className="ml-2 text-3xs text-yellow-400 normal-case tracking-normal">
                  currently protected
                </span>
              ) : (
                <span className="ml-2 text-3xs text-neutral-500 normal-case tracking-normal">
                  currently open
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  folder.password_hash ? "Set a new password" : "Set a password"
                }
                className="field"
              />
              <button
                onClick={async () => {
                  await onSetPassword(folder.id, password || null);
                  setPassword("");
                  onClose();
                }}
                disabled={!password}
                className="chip !py-1.5 disabled:opacity-50"
              >
                Set
              </button>
              {folder.password_hash && (
                <button
                  onClick={async () => {
                    if (!confirm("Remove password protection?")) return;
                    await onSetPassword(folder.id, null);
                    onClose();
                  }}
                  className="chip !py-1.5 text-yellow-400"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-5 pt-3 border-t border-border">
          <div className="flex items-center gap-3">
            <button
              onClick={() => onDelete(folder.id)}
              className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
            >
              <Trash2 size={11} /> Delete folder
            </button>
            {folder.password_hash && (
              <button
                onClick={() => {
                  onRelock(folder);
                  onClose();
                }}
                className="text-xs text-yellow-400 hover:text-yellow-300 flex items-center gap-1"
                title="Force this folder to prompt for password again"
              >
                <Lock size={11} /> Lock now
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-xs text-neutral-400 hover:text-white px-3 py-1.5"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function UnlockFolderModal({
  folder,
  onCancel,
  onUnlock,
}: {
  folder: Folder;
  onCancel: () => void;
  onUnlock: (folder: Folder, password: string) => Promise<void> | void;
}) {
  const [password, setPassword] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 bg-black/70 grid place-items-center z-50 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-panel border border-border rounded-lg w-[380px] max-w-full p-5 shadow-panel"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-semibold flex items-center gap-2">
            <Lock size={13} className="text-yellow-400" />
            Unlock &ldquo;{folder.name}&rdquo;
          </h3>
          <button
            onClick={onCancel}
            className="text-neutral-500 hover:text-white text-lg leading-none"
          >
            ×
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onUnlock(folder, password);
          }}
        >
          <div className="eyebrow mb-1">Folder password</div>
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field"
          />
          <p className="text-3xs text-neutral-500 mt-1">
            Unlock persists until you close this tab.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-neutral-400 hover:text-white px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!password}
              className="bg-accent hover:bg-accentHover text-black text-xs font-medium px-3 py-1.5 rounded disabled:opacity-50"
            >
              Unlock
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
