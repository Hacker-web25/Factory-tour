"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase, publicUrl } from "@/lib/supabase";
import type { Tour, Scene } from "@/lib/types";
import TopBar from "@/components/TopBar";
import {
  Plus,
  Search,
  Trash2,
  Eye,
  HardDrive,
  Image as ImageIcon,
  Upload as UploadIcon,
} from "lucide-react";
import { importTourFromFile } from "@/lib/backup";

type TourWithCover = Tour & { cover_path: string | null; scene_count: number };

export default function DashboardPage() {
  const [tours, setTours] = useState<TourWithCover[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");
  const [loading, setLoading] = useState(true);
  const [storageBytes, setStorageBytes] = useState<number>(0);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [creatingTour, setCreatingTour] = useState(false);

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
      // Prefer a user-uploaded thumbnail; fall back to first scene's panorama.
      const cover = t.thumbnail_path ?? scenes?.[0]?.image_path ?? null;
      list.push({ ...t, cover_path: cover, scene_count: scenes?.length ?? 0 });
    }
    setTours(list);

    // storage size (list files in bucket)
    const { data: files } = await supabase.storage
      .from("panoramas")
      .list("", { limit: 1000 });
    const bytes = (files ?? []).reduce(
      (s, f) => s + (f.metadata?.size ?? 0),
      0
    );
    setStorageBytes(bytes);
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
    const { error: updErr } = await supabase
      .from("tours")
      .update({ thumbnail_path: path })
      .eq("id", tourId);
    if (updErr) return alert(`Save failed: ${updErr.message}`);
    load();
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
      return true;
    });
  }, [tours, q, filter]);

  const recent = tours.slice(0, 4);

  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".factour"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportBackup(f);
                // reset so selecting the same file again re-triggers
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="flex items-center gap-1 bg-panelSoft border border-border text-neutral-200 px-3 py-2 rounded disabled:opacity-50"
              title="Restore a tour from a .factour backup file"
            >
              <UploadIcon size={16} />
              {importing ? "Restoring…" : "Import backup"}
            </button>
            <button
              onClick={() => setCreatingTour(true)}
              className="flex items-center gap-1 bg-accent text-black font-medium px-3 py-2 rounded"
            >
              <Plus size={16} /> New tour
            </button>
          </div>
        </div>

        {creatingTour && (
          <NewTourModal
            onCancel={() => setCreatingTour(false)}
            onCreate={(opts) => createTour(opts)}
          />
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <StatCard
            label="Tours"
            value={tours.length}
            icon={<ImageIcon size={18} />}
          />
          <StatCard
            label="Published"
            value={tours.filter((t) => t.published).length}
            icon={<Eye size={18} />}
          />
          <StatCard
            label="Storage used"
            value={formatBytes(storageBytes)}
            icon={<HardDrive size={18} />}
          />
        </div>

        {/* Recent uploads */}
        <section className="mb-6">
          <h2 className="text-sm uppercase text-neutral-400 mb-2">
            Recent uploads
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {recent.map((t) => (
              <Link
                key={t.id}
                href={`/tour/${t.id}/edit`}
                className="aspect-video bg-panelSoft rounded overflow-hidden border border-border relative group"
              >
                {t.cover_path ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={publicUrl(t.cover_path)}
                    alt={t.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full grid place-items-center text-neutral-500">
                    no image
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 text-xs truncate">
                  {t.title}
                </div>
              </Link>
            ))}
            {recent.length === 0 && (
              <div className="col-span-full text-neutral-500 text-sm">
                Upload something to see recent tours here.
              </div>
            )}
          </div>
        </section>

        {/* Filters */}
        <div className="flex gap-2 items-center mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search
              size={14}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search tours..."
              className="w-full bg-panelSoft border border-border rounded pl-7 pr-2 py-1.5 text-sm outline-none focus:border-accent"
            />
          </div>
          {(["all", "published", "draft"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded border ${
                filter === f
                  ? "bg-accent text-black border-accent"
                  : "border-border text-neutral-300"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Tour grid */}
        {loading ? (
          <div className="text-neutral-500">Loading…</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((t) => (
              <Link
                key={t.id}
                href={`/tour/${t.id}/edit`}
                className="bg-panelSoft border border-border rounded overflow-hidden hover:border-accent transition group/card block"
              >
                <div className="aspect-video bg-black relative group">
                  {t.cover_path ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={publicUrl(t.cover_path)}
                      alt={t.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-neutral-500">
                      no image
                    </div>
                  )}
                  <span
                    className={`absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded ${
                      t.published
                        ? "bg-accent text-black"
                        : "bg-neutral-700 text-neutral-200"
                    }`}
                  >
                    {t.published ? "PUBLISHED" : "DRAFT"}
                  </span>
                  {/* Thumbnail upload button (appears on hover, stops
                      the Link navigation via preventDefault) */}
                  <label
                    className="absolute top-2 left-2 flex items-center gap-1 bg-black/70 text-white text-[10px] px-2 py-1 rounded cursor-pointer opacity-0 group-hover:opacity-100 transition"
                    title={
                      t.thumbnail_path
                        ? "Replace thumbnail"
                        : "Upload a custom thumbnail"
                    }
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ImageIcon size={12} />
                    {t.thumbnail_path ? "Change" : "Set thumbnail"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadThumbnail(t.id, f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <div className="p-3 flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{t.title}</div>
                    <div className="text-xs text-neutral-500">
                      {t.scene_count} scene{t.scene_count === 1 ? "" : "s"} ·{" "}
                      {new Date(t.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      deleteTour(t.id);
                    }}
                    className="text-xs bg-neutral-800 hover:bg-red-900/40 px-2 py-1.5 rounded shrink-0"
                    title="Delete tour"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </Link>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full text-neutral-500 text-sm">
                No tours match.
              </div>
            )}
          </div>
        )}
      </main>
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
    <div className="bg-panelSoft border border-border rounded p-4 flex items-center gap-3">
      <div className="p-2 bg-panel rounded text-accent">{icon}</div>
      <div>
        <div className="text-xs text-neutral-400">{label}</div>
        <div className="text-lg font-semibold">{value}</div>
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
        className="bg-panel border border-border rounded-lg w-[600px] max-w-full p-6 max-h-[90vh] overflow-auto"
      >
        <h3 className="text-lg font-semibold mb-4">New tour</h3>

        <div className="space-y-4 mb-6">
          <div>
            <label className="text-xs uppercase text-neutral-400 block mb-1">
              Project title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Micron Wires & Polymer Pvt Ltd"
              autoFocus
              className="w-full bg-panelSoft border border-border rounded px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-xs uppercase text-neutral-400 block mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short description of the site, the client, or what this tour covers…"
              rows={3}
              className="w-full bg-panelSoft border border-border rounded px-3 py-2 text-sm outline-none focus:border-accent resize-none"
            />
          </div>
        </div>

        <div className="mb-2">
          <div className="text-xs uppercase text-neutral-400 mb-1">
            Reading direction
          </div>
          <p className="text-[11px] text-neutral-500 mb-3">
            Pick how panoramas are displayed. Applies to the whole tour and
            can&rsquo;t be changed later. Click a card to create the tour.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() =>
              onCreate({ title, description, mirrored: false })
            }
            className="text-left border border-border rounded-lg p-4 hover:border-accent hover:bg-accent/5 transition"
          >
            <div className="text-sm font-medium mb-1 flex items-center gap-2">
              Standard
              <span className="text-[10px] bg-accent text-black rounded px-1.5 py-0.5">
                recommended
              </span>
            </div>
            <div className="text-xs text-neutral-400 leading-relaxed">
              Text on signs, calendars, clocks and posters reads normally.
              Best for factory tours where you want everything to look
              real-world.
            </div>
          </button>
          <button
            onClick={() =>
              onCreate({ title, description, mirrored: true })
            }
            className="text-left border border-border rounded-lg p-4 hover:border-accent hover:bg-accent/5 transition"
          >
            <div className="text-sm font-medium mb-1">Mirrored</div>
            <div className="text-xs text-neutral-400 leading-relaxed">
              Uses the raw equirectangular rendering — the world appears
              horizontally flipped (text reads backwards). Only pick this if
              your source panoramas were captured mirrored.
            </div>
          </button>
        </div>

        <div className="flex justify-end mt-5">
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
