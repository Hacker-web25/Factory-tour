"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import TopBar from "@/components/TopBar";
import { UploadCloud, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";
import type { Tour } from "@/lib/types";

type Item = {
  file: File;
  status: "queued" | "uploading" | "done" | "error";
  progress: number;
  message?: string;
  isPanorama: boolean;
  // Set once the scene has been created in the DB, so we can clean up if the
  // user later removes the item from the queue.
  scene_id?: string;
  image_path?: string;
};

export default function UploadPage() {
  const router = useRouter();
  const params = useSearchParams();
  const preselectedTourId = params.get("tour");

  const [tours, setTours] = useState<Tour[]>([]);
  const [tourId, setTourId] = useState<string>(preselectedTourId ?? "");
  const [items, setItems] = useState<Item[]>([]);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    supabase
      .from("tours")
      .select("*")
      .order("updated_at", { ascending: false })
      .then(({ data }) => {
        setTours((data ?? []) as Tour[]);
        if (!tourId && data && data.length) setTourId(data[0].id);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) =>
      ["image/jpeg", "image/png"].includes(f.type)
    );
    const analyzed: Item[] = [];
    for (const file of arr) {
      const dim = await imageDims(file);
      const isPanorama = Math.abs(dim.width / dim.height - 2) < 0.1;
      analyzed.push({
        file,
        status: "queued",
        progress: 0,
        isPanorama,
      });
    }
    setItems((s) => [...s, ...analyzed]);
  }, []);

  async function createNewTour() {
    const { data } = await supabase
      .from("tours")
      .insert({ title: "Untitled tour" })
      .select()
      .single();
    if (data) {
      setTours((s) => [data as Tour, ...s]);
      setTourId((data as Tour).id);
    }
  }

  async function uploadAll() {
    if (!tourId) return alert("Pick or create a tour first.");
    const { data: existing } = await supabase
      .from("scenes")
      .select("order_index")
      .eq("tour_id", tourId)
      .order("order_index", { ascending: false })
      .limit(1);
    let nextOrder = ((existing?.[0]?.order_index as number) ?? -1) + 1;

    for (let i = 0; i < items.length; i++) {
      if (items[i].status !== "queued") continue;
      updateItem(i, { status: "uploading", progress: 10 });
      const file = items[i].file;
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${tourId}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("panoramas")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) {
        updateItem(i, { status: "error", message: upErr.message });
        continue;
      }
      updateItem(i, { progress: 70 });

      const { data: newScene, error: sceneErr } = await supabase
        .from("scenes")
        .insert({
          tour_id: tourId,
          name: file.name.replace(/\.[^.]+$/, ""),
          image_path: path,
          order_index: nextOrder++,
        })
        .select()
        .single();
      if (sceneErr || !newScene) {
        updateItem(i, {
          status: "error",
          message: sceneErr?.message ?? "Insert failed",
        });
        continue;
      }
      updateItem(i, {
        status: "done",
        progress: 100,
        scene_id: newScene.id,
        image_path: path,
      });
    }

    await supabase
      .from("tours")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", tourId);
  }

  function updateItem(i: number, patch: Partial<Item>) {
    setItems((s) => s.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  const allDone =
    items.length > 0 && items.every((i) => i.status === "done");

  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-4">Upload panoramas</h1>

        {/* Tour picker */}
        <div className="mb-4 flex gap-2 items-center">
          <label className="text-sm text-neutral-400">Tour:</label>
          <select
            value={tourId}
            onChange={(e) => setTourId(e.target.value)}
            className="bg-panelSoft border border-border rounded px-2 py-1.5 text-sm flex-1"
          >
            {tours.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
            {tours.length === 0 && <option value="">-- no tours --</option>}
          </select>
          <button
            onClick={createNewTour}
            className="text-sm bg-neutral-800 border border-border rounded px-3 py-1.5"
          >
            + New tour
          </button>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
          className={`border-2 border-dashed rounded-lg p-10 text-center transition ${
            dragOver ? "border-accent bg-accent/5" : "border-border bg-panelSoft"
          }`}
        >
          <UploadCloud size={40} className="mx-auto mb-2 text-neutral-500" />
          <div className="text-sm text-neutral-300 mb-2">
            Drag & drop 360° JPG / PNG here
          </div>
          <label className="inline-block text-xs bg-accent text-black px-3 py-1.5 rounded cursor-pointer">
            or browse files
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={(e) => e.target.files && addFiles(e.target.files)}
            />
          </label>
          <div className="text-[11px] text-neutral-500 mt-2">
            Panorama detection: images with a 2:1 aspect ratio are marked as
            equirectangular.
          </div>
        </div>

        {/* Queue */}
        {items.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-neutral-400">
                {items.length} file(s) queued
              </div>
              <button
                onClick={uploadAll}
                disabled={items.every((i) => i.status !== "queued")}
                className="bg-accent text-black text-sm px-3 py-1.5 rounded disabled:opacity-40"
              >
                Upload all
              </button>
            </div>
            <ul className="space-y-2">
              {items.map((it, i) => (
                <li
                  key={i}
                  className="bg-panelSoft border border-border rounded p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{it.file.name}</div>
                      <div className="text-[11px] text-neutral-500 flex gap-2">
                        <span>{(it.file.size / 1024 / 1024).toFixed(1)} MB</span>
                        <span>·</span>
                        <span>
                          {it.isPanorama ? "panorama (2:1)" : "not 2:1 — may distort"}
                        </span>
                      </div>
                    </div>
                    {it.status === "done" && (
                      <CheckCircle2 size={18} className="text-accent" />
                    )}
                    {it.status === "error" && (
                      <AlertCircle size={18} className="text-red-400" />
                    )}
                    {it.status === "uploading" && (
                      <span className="text-xs text-neutral-400">
                        {it.progress}%
                      </span>
                    )}
                    {/* Delete: only allow when not mid-upload */}
                    {(it.status === "queued" ||
                      it.status === "error" ||
                      it.status === "done") && (
                      <button
                        onClick={async () => {
                          // If this item finished uploading, delete the
                          // created scene from the DB + storage so it
                          // doesn't linger in the tour.
                          if (it.status === "done" && it.scene_id) {
                            if (
                              !confirm(
                                "This will delete the uploaded scene from the tour. Continue?"
                              )
                            )
                              return;
                            await supabase
                              .from("scenes")
                              .delete()
                              .eq("id", it.scene_id);
                            if (it.image_path) {
                              await supabase.storage
                                .from("panoramas")
                                .remove([it.image_path]);
                            }
                          }
                          setItems((s) => s.filter((_, idx) => idx !== i));
                        }}
                        className="p-1.5 rounded hover:bg-red-500/15 text-red-400 hover:text-red-300"
                        title={
                          it.status === "done"
                            ? "Delete uploaded scene from tour"
                            : "Remove from queue"
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  {it.status === "uploading" && (
                    <div className="mt-2 h-1 bg-neutral-800 rounded overflow-hidden">
                      <div
                        className="h-full bg-accent transition-all"
                        style={{ width: `${it.progress}%` }}
                      />
                    </div>
                  )}
                  {it.message && (
                    <div className="text-[11px] text-red-400 mt-1">
                      {it.message}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {allDone && (
              <button
                onClick={() => router.push(`/tour/${tourId}/edit`)}
                className="mt-4 w-full bg-accent text-black py-2 rounded font-medium"
              >
                Open tour builder →
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function imageDims(file: File): Promise<{ width: number; height: number }> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res({ width: img.width, height: img.height });
    img.onerror = () => res({ width: 0, height: 0 });
    img.src = URL.createObjectURL(file);
  });
}
