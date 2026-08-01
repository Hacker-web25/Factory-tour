"use client";

// Uses useSearchParams — must live inside a Suspense boundary to satisfy the
// Next.js 14 App Router prerender rules.
export const dynamic = "force-dynamic";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import TopBar from "@/components/TopBar";
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Plus,
} from "lucide-react";
import type { Tour } from "@/lib/types";

type Item = {
  file: File;
  status: "queued" | "uploading" | "done" | "error";
  progress: number;
  message?: string;
  isPanorama: boolean;
  isFlat: boolean;
  scene_id?: string;
  image_path?: string;
};

export default function UploadPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <UploadPage />
    </Suspense>
  );
}

function UploadPage() {
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
        isFlat: !isPanorama,
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
          is_flat: items[i].isFlat,
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
  const queuedCount = items.filter((i) => i.status === "queued").length;

  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-5">
          <div className="eyebrow mb-0.5">Add scenes</div>
          <h1 className="text-[22px] font-semibold leading-tight">
            Upload panoramas
          </h1>
        </div>

        {/* Tour chip picker */}
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <span className="eyebrow">Tour</span>
          <select
            value={tourId}
            onChange={(e) => setTourId(e.target.value)}
            className="field !w-auto min-w-[220px]"
          >
            {tours.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
            {tours.length === 0 && <option value="">— no tours yet —</option>}
          </select>
          <button onClick={createNewTour} className="chip">
            <Plus size={11} /> New tour
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
          className={`border-2 border-dashed rounded-lg p-16 text-center transition-colors ${
            dragOver
              ? "border-accent bg-accent/5"
              : "border-border bg-panelSoft/40 hover:bg-panelSoft/70"
          }`}
        >
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-panelSoft border border-border grid place-items-center">
            <UploadCloud size={26} className="text-neutral-400" />
          </div>
          <div className="text-[14px] text-neutral-200 mb-1 font-medium">
            Drag &amp; drop 360° JPG / PNG
          </div>
          <div className="text-xs text-neutral-500 mb-4">
            or click to browse — batch upload supported
          </div>
          <label className="inline-flex items-center gap-1.5 bg-accent hover:bg-accentHover text-black font-medium px-3 py-1.5 rounded text-xs cursor-pointer transition-colors">
            <UploadCloud size={13} />
            Browse files
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={(e) => e.target.files && addFiles(e.target.files)}
            />
          </label>
          <div className="text-3xs text-neutral-600 mt-4">
            Panorama detection: 2:1 aspect ratio → equirectangular.
          </div>
        </div>

        {/* Queue */}
        {items.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-neutral-400">
                {items.length} file{items.length === 1 ? "" : "s"} queued
              </div>
              <button
                onClick={uploadAll}
                disabled={queuedCount === 0}
                className="bg-accent hover:bg-accentHover text-black text-xs font-medium px-3 py-1.5 rounded disabled:opacity-40 transition-colors"
              >
                Upload {queuedCount > 0 ? `${queuedCount} ` : ""}file
                {queuedCount === 1 ? "" : "s"}
              </button>
            </div>
            <ul className="space-y-1.5">
              {items.map((it, i) => (
                <li
                  key={i}
                  className="bg-panelSoft border border-border rounded px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] truncate">
                        {it.file.name}
                      </div>
                      <div className="text-3xs text-neutral-500 flex gap-2 items-center">
                        <span>
                          {(it.file.size / 1024 / 1024).toFixed(1)} MB
                        </span>
                        <span>·</span>
                        <span
                          className={
                            it.isPanorama ? "text-accent" : "text-neutral-500"
                          }
                        >
                          {it.isPanorama ? "panorama (2:1)" : "not 2:1"}
                        </span>
                        {it.status === "queued" && (
                          <label className="flex items-center gap-1 ml-2 cursor-pointer text-neutral-400">
                            <input
                              type="checkbox"
                              checked={it.isFlat}
                              onChange={(e) =>
                                updateItem(i, { isFlat: e.target.checked })
                              }
                            />
                            Flat photo
                          </label>
                        )}
                      </div>
                    </div>
                    {it.status === "done" && (
                      <CheckCircle2 size={16} className="text-accent" />
                    )}
                    {it.status === "error" && (
                      <AlertCircle size={16} className="text-red-400" />
                    )}
                    {it.status === "uploading" && (
                      <span className="text-2xs text-neutral-400">
                        {it.progress}%
                      </span>
                    )}
                    {(it.status === "queued" ||
                      it.status === "error" ||
                      it.status === "done") && (
                      <button
                        onClick={async () => {
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
                        className="p-1 rounded hover:bg-red-500/15 text-neutral-500 hover:text-red-400"
                        title={
                          it.status === "done"
                            ? "Delete uploaded scene from tour"
                            : "Remove from queue"
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  {it.status === "uploading" && (
                    <div className="mt-2 h-0.5 bg-neutral-800 rounded overflow-hidden">
                      <div
                        className="h-full bg-accent transition-all"
                        style={{ width: `${it.progress}%` }}
                      />
                    </div>
                  )}
                  {it.message && (
                    <div className="text-3xs text-red-400 mt-1">
                      {it.message}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {allDone && (
              <button
                onClick={() => router.push(`/tour/${tourId}/edit`)}
                className="mt-4 w-full bg-accent hover:bg-accentHover text-black py-2.5 rounded font-medium text-sm transition-colors"
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
