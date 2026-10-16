"use client";

/**
 * /[slug]/owner/tours/[tourId]/text-edit — the MD-side text editor.
 *
 * Same editing MODEL as the production editor — a live 360 view, click
 * the hotspot you want, edit it in the side panel, switch scenes on the
 * rail — but stripped to text only and dressed in the website's light
 * theme instead of the dark builder chrome.
 *
 * What the MD can change:
 *   Tour     — title, description
 *   Scene    — name, description
 *   Hotspot  — label, info title, info body, PDF name
 *
 * What they deliberately cannot do here: move a hotspot, change an
 * icon, upload an image, add or delete anything. Hotspots are
 * selectable but not draggable (we pass `editable` for the selection
 * highlight and simply never pass `onHotspotDrag`).
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase, publicUrl } from "@/lib/supabase";
import { getMyProfile, type Profile } from "@/lib/auth";
import { orgBySlug } from "@/lib/orgSlug";
import type { Hotspot, Scene, Tour } from "@/lib/types";
import { resolveHotspotFx } from "@/lib/types";
import PanoramaViewer from "@/components/panorama/PanoramaViewer";
import FlatViewer from "@/components/panorama/FlatViewer";
import VpvLogo from "@/components/dashboard/VpvLogo";
import {
  Save,
  ArrowLeft,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertCircle,
  MousePointerClick,
  Layers,
  Type as TypeIcon,
  MapPin,
} from "lucide-react";

type Tab = "tour" | "scene" | "hotspot";

export default function TourTextEditPage() {
  const params = useParams<{ slug: string; tourId: string }>();
  const router = useRouter();

  const [tour, setTour] = useState<Tour | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(
    null
  );
  const [tab, setTab] = useState<Tab>("tour");

  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dirty, setDirty] = useState<Record<string, string | null>>({});

  /* ───────────────────────────── load ───────────────────────────── */

  const load = useCallback(async () => {
    setLoading(true);
    const p: Profile | null = await getMyProfile();
    if (!p) {
      router.replace("/login");
      return;
    }
    if (p.role !== "org_admin" && p.role !== "owner") {
      router.replace("/");
      return;
    }
    const org = await orgBySlug(params.slug);
    if (!org || (p.role !== "owner" && org.id !== p.org_id)) {
      router.replace("/");
      return;
    }

    const { data: t } = await supabase
      .from("tours")
      .select("*")
      .eq("id", params.tourId)
      .maybeSingle();
    const tourRow = t as Tour | null;
    if (!tourRow || (p.role !== "owner" && (tourRow as unknown as { org_id?: string }).org_id !== p.org_id)) {
      setFatal("Tour not found, or you do not have permission to open it.");
      setLoading(false);
      return;
    }

    const { data: s } = await supabase
      .from("scenes")
      .select("*")
      .eq("tour_id", tourRow.id)
      .order("order_index");
    const sceneRows = (s ?? []) as Scene[];

    const sceneIds = sceneRows.map((x) => x.id);
    const { data: h } = sceneIds.length
      ? await supabase.from("hotspots").select("*").in("scene_id", sceneIds)
      : { data: [] as Hotspot[] };

    setTour(tourRow);
    setScenes(sceneRows);
    setHotspots((h ?? []) as Hotspot[]);
    setActiveSceneId(sceneRows[0]?.id ?? null);
    setSelectedHotspotId(null);
    setDirty({});
    setLoading(false);
  }, [params.slug, params.tourId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ─────────────────────────── derived ──────────────────────────── */

  const activeScene = useMemo(
    () => scenes.find((s) => s.id === activeSceneId) ?? null,
    [scenes, activeSceneId]
  );

  const sceneHotspots = useMemo(() => {
    if (!activeScene) return [];
    const own = hotspots.filter((h) => h.scene_id === activeScene.id);
    // Master hotspots repeat across scenes, exactly as the viewer shows them.
    const masters = hotspots.filter(
      (h) =>
        h.is_master &&
        h.scene_id !== activeScene.id &&
        (!h.master_scene_ids ||
          h.master_scene_ids.length === 0 ||
          h.master_scene_ids.includes(activeScene.id))
    );
    return [...own, ...masters];
  }, [hotspots, activeScene]);

  const selectedHotspot = useMemo(
    () => hotspots.find((h) => h.id === selectedHotspotId) ?? null,
    [hotspots, selectedHotspotId]
  );

  const scenesLookup = useMemo(() => {
    const m = new Map<string, { name: string; thumbnailUrl: string | null }>();
    for (const s of scenes) {
      m.set(s.id, {
        name: s.name,
        thumbnailUrl: publicUrl(s.thumbnail_path ?? s.image_path),
      });
    }
    return m;
  }, [scenes]);

  const dirtyCount = Object.keys(dirty).length;

  /* ──────────────────────────── edits ───────────────────────────── */

  const edit = (
    kind: "tour" | "scene" | "hotspot",
    id: string,
    field: string,
    value: string
  ) => {
    const trimmed = value.length === 0 ? null : value;
    if (kind === "tour") {
      setTour((prev) =>
        prev ? ({ ...prev, [field]: trimmed } as Tour) : prev
      );
    } else if (kind === "scene") {
      setScenes((prev) =>
        prev.map((s) => (s.id === id ? ({ ...s, [field]: trimmed } as Scene) : s))
      );
    } else {
      setHotspots((prev) =>
        prev.map((h) =>
          h.id === id ? ({ ...h, [field]: trimmed } as Hotspot) : h
        )
      );
    }
    setDirty((prev) => ({ ...prev, [`${kind}:${id}:${field}`]: trimmed }));
    setSavedAt(null);
  };

  async function save() {
    if (!dirtyCount || saving) return;
    setSaving(true);
    setSaveErr(null);
    const tourUpd: Record<string, string | null> = {};
    const sceneUpd: Record<string, Record<string, string | null>> = {};
    const hsUpd: Record<string, Record<string, string | null>> = {};
    for (const [key, val] of Object.entries(dirty)) {
      const [kind, id, field] = key.split(":");
      if (kind === "tour") tourUpd[field] = val;
      else if (kind === "scene") (sceneUpd[id] ||= {})[field] = val;
      else (hsUpd[id] ||= {})[field] = val;
    }
    try {
      if (tour && Object.keys(tourUpd).length) {
        const { error } = await supabase
          .from("tours")
          .update(tourUpd)
          .eq("id", tour.id);
        if (error) throw error;
      }
      for (const [id, patch] of Object.entries(sceneUpd)) {
        const { error } = await supabase.from("scenes").update(patch).eq("id", id);
        if (error) throw error;
      }
      for (const [id, patch] of Object.entries(hsUpd)) {
        const { error } = await supabase.from("hotspots").update(patch).eq("id", id);
        if (error) throw error;
      }
      setDirty({});
      setSavedAt(Date.now());
    } catch (e) {
      setSaveErr(
        (e as Error)?.message || "We couldn't save your changes. Try again."
      );
    } finally {
      setSaving(false);
    }
  }

  // Cmd/Ctrl-S saves, like every editor the MD has ever used.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirtyCount, saving, dirty, tour]);

  // Warn before losing unsaved edits.
  useEffect(() => {
    if (!dirtyCount) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirtyCount]);

  /* ──────────────────────────── render ──────────────────────────── */

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-vpv-canvas">
        <Loader2 className="w-5 h-5 animate-spin text-vpv-blue" />
      </div>
    );
  }

  if (fatal || !tour) {
    return (
      <div className="min-h-screen grid place-items-center bg-vpv-canvas px-4">
        <div className="max-w-md text-center">
          <AlertCircle className="w-8 h-8 mx-auto text-rose-500" />
          <p className="mt-3 text-slate-700">{fatal}</p>
          <Link
            href={`/${params.slug}/owner`}
            className="mt-5 inline-flex items-center gap-2 text-vpv-blue"
          >
            <ArrowLeft size={14} /> Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-vpv-canvas overflow-hidden">
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header className="shrink-0 bg-white border-b border-vpv-line">
        <div className="px-4 sm:px-6 h-16 flex items-center gap-3">
          <Link
            href={`/${params.slug}/owner`}
            className="p-2 rounded-md hover:bg-vpv-tint text-vpv-muted"
            title="Back to dashboard"
          >
            <ArrowLeft size={16} />
          </Link>
          <VpvLogo height={22} />
          <div className="hidden sm:block w-px h-5 bg-vpv-line" />
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-vpv-ink truncate">
              Edit tour text
            </div>
            <div className="text-[11px] text-vpv-muted truncate">
              {scenes.length} scene{scenes.length === 1 ? "" : "s"} ·{" "}
              {hotspots.length} hotspot{hotspots.length === 1 ? "" : "s"}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {savedAt && !dirtyCount && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-[12px] text-emerald-700">
                <CheckCircle2 size={13} /> Saved
              </span>
            )}
            {saveErr && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-[12px] text-rose-600 max-w-[220px] truncate">
                <AlertCircle size={13} /> {saveErr}
              </span>
            )}
            <Link
              href={`/tour/${tour.id}?preview=1`}
              target="_blank"
              rel="noopener"
              className="hidden sm:inline-flex items-center gap-1.5 text-[12.5px] text-vpv-blue hover:underline"
            >
              <ExternalLink size={13} /> Preview
            </Link>
            <button
              type="button"
              onClick={() => void save()}
              disabled={!dirtyCount || saving}
              className="h-9 px-4 rounded-full bg-vpv-grad text-white text-[13px] font-semibold shadow-[0_8px_22px_-10px_rgba(20,104,216,0.6)] disabled:opacity-40 inline-flex items-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 size={13} className="animate-spin" /> Saving
                </>
              ) : (
                <>
                  <Save size={13} />
                  {dirtyCount ? `Save ${dirtyCount}` : "Saved"}
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ── Body: viewer + side panel ───────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* Viewer column */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <div className="relative flex-1 min-h-[260px] bg-slate-900">
            {activeScene ? (
              activeScene.is_flat ? (
                <FlatViewer
                  imageUrl={publicUrl(activeScene.image_path)}
                  adjustments={activeScene.image_adjustments ?? null}
                  hotspots={sceneHotspots}
                  hotspotFx={resolveHotspotFx(tour)}
                  scenesLookup={scenesLookup}
                  onHotspotClick={(h) => {
                    setSelectedHotspotId(h.id);
                    setTab("hotspot");
                  }}
                />
              ) : (
                <PanoramaViewer
                  imageUrl={publicUrl(activeScene.image_path)}
                  adjustments={activeScene.image_adjustments ?? null}
                  hotspotFx={resolveHotspotFx(tour)}
                  hotspots={sceneHotspots}
                  /* Selectable, but NOT draggable: we never pass
                     onHotspotDrag, so the drag handler bails out. */
                  editable
                  selectedHotspotId={selectedHotspotId}
                  mirrored={tour.mirrored ?? false}
                  hideStitching={activeScene.hide_stitching ?? false}
                  hideTripod={activeScene.hide_tripod ?? false}
                  tripodSize={activeScene.tripod_size ?? 30}
                  scenesLookup={scenesLookup}
                  nadirImageUrl={
                    tour.nadir_image_path
                      ? publicUrl(tour.nadir_image_path)
                      : null
                  }
                  nadirSize={tour.nadir_size ?? 25}
                  pitchMin={activeScene.pitch_min}
                  pitchMax={activeScene.pitch_max}
                  yawMin={activeScene.yaw_min}
                  yawMax={activeScene.yaw_max}
                  levelCorrection={activeScene.level_correction ?? 0}
                  zoomMinFov={activeScene.zoom_min_fov ?? 30}
                  zoomMaxFov={activeScene.zoom_max_fov ?? 90}
                  zoomInitialFov={activeScene.zoom_initial_fov ?? 75}
                  zoomSensitivity={activeScene.zoom_sensitivity ?? 1}
                  initialYaw={activeScene.initial_yaw}
                  initialPitch={activeScene.initial_pitch}
                  onHotspotClick={(h) => {
                    setSelectedHotspotId(h.id);
                    setTab("hotspot");
                  }}
                />
              )
            ) : (
              <div className="h-full grid place-items-center text-white/50 text-[13px]">
                This tour has no scenes.
              </div>
            )}

            {/* Floating hint — the whole interaction in one line. */}
            <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2">
              <div className="flex items-center gap-2 rounded-full bg-white/90 backdrop-blur border border-white/70 px-3.5 py-1.5 text-[12px] text-slate-700 shadow-[0_8px_22px_-10px_rgba(11,61,145,0.35)]">
                <MousePointerClick size={13} className="text-vpv-blue" />
                Click a hotspot to edit its text. Drag to look around.
              </div>
            </div>
          </div>

          {/* Scene rail */}
          {scenes.length > 0 && (
            <div className="shrink-0 bg-white border-t border-vpv-line px-3 py-2.5">
              <div className="flex items-center gap-2 overflow-x-auto">
                {scenes.map((s, i) => {
                  const active = s.id === activeScene?.id;
                  const count = hotspots.filter(
                    (h) => h.scene_id === s.id
                  ).length;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setActiveSceneId(s.id);
                        setSelectedHotspotId(null);
                        setTab("scene");
                      }}
                      className={`shrink-0 w-[132px] text-left rounded-lg border overflow-hidden transition-all ${
                        active
                          ? "border-vpv-blue ring-2 ring-vpv-blue/25"
                          : "border-vpv-line hover:border-vpv-blue/40"
                      }`}
                      title={s.name || `Scene ${i + 1}`}
                    >
                      <div className="aspect-[16/10] bg-slate-200 relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={
                            publicUrl(s.thumbnail_path ?? s.image_path) ?? ""
                          }
                          alt=""
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute top-1 left-1 w-5 h-5 rounded-md bg-white/90 text-[10px] font-semibold text-vpv-navy grid place-items-center">
                          {i + 1}
                        </span>
                      </div>
                      <div className="px-2 py-1.5 bg-white">
                        <div className="text-[11.5px] font-medium text-vpv-ink truncate">
                          {s.name || "Untitled scene"}
                        </div>
                        <div className="text-[10px] text-vpv-muted">
                          {count} hotspot{count === 1 ? "" : "s"}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Side panel ───────────────────────────────────────── */}
        <aside className="shrink-0 w-full lg:w-[380px] bg-white border-t lg:border-t-0 lg:border-l border-vpv-line flex flex-col min-h-0">
          {/* Tabs */}
          <div className="shrink-0 px-3 pt-3">
            <div className="grid grid-cols-3 gap-1 rounded-full bg-vpv-canvas border border-vpv-line p-1">
              {([
                { id: "tour" as const, label: "Tour", icon: Layers },
                { id: "scene" as const, label: "Scene", icon: MapPin },
                { id: "hotspot" as const, label: "Hotspot", icon: TypeIcon },
              ]).map((t) => {
                const Icon = t.icon;
                const on = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`h-8 rounded-full text-[12.5px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors ${
                      on
                        ? "bg-white text-vpv-ink shadow-sm"
                        : "text-vpv-muted hover:text-vpv-ink"
                    }`}
                  >
                    <Icon size={12} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
            {tab === "tour" && (
              <>
                <PanelHeading
                  title="The tour"
                  hint="Shown on your dashboard and at the top of the viewer."
                />
                <TextField
                  label="Title"
                  placeholder="Tour title"
                  value={tour.title ?? ""}
                  onChange={(v) => edit("tour", tour.id, "title", v)}
                />
                <TextArea
                  label="Description"
                  placeholder="A short line about this tour."
                  value={tour.description ?? ""}
                  onChange={(v) => edit("tour", tour.id, "description", v)}
                />
              </>
            )}

            {tab === "scene" &&
              (activeScene ? (
                <>
                  <PanelHeading
                    title={`Scene ${
                      scenes.findIndex((s) => s.id === activeScene.id) + 1
                    }`}
                    hint="Shown in the scene menu and the pinned rail."
                  />
                  <TextField
                    label="Name"
                    placeholder="e.g. Receiving bay"
                    value={activeScene.name ?? ""}
                    onChange={(v) => edit("scene", activeScene.id, "name", v)}
                  />
                  <TextArea
                    label="Description"
                    placeholder="A short line about this scene."
                    value={activeScene.description ?? ""}
                    onChange={(v) =>
                      edit("scene", activeScene.id, "description", v)
                    }
                  />
                  <HotspotJumpList
                    hotspots={sceneHotspots}
                    selectedId={selectedHotspotId}
                    onPick={(id) => {
                      setSelectedHotspotId(id);
                      setTab("hotspot");
                    }}
                  />
                </>
              ) : (
                <Empty text="No scene selected." />
              ))}

            {tab === "hotspot" &&
              (selectedHotspot ? (
                <HotspotFields
                  hs={selectedHotspot}
                  onEdit={(field, v) =>
                    edit("hotspot", selectedHotspot.id, field, v)
                  }
                />
              ) : (
                <>
                  <Empty
                    text="Click a hotspot in the view to edit its text."
                    icon
                  />
                  <HotspotJumpList
                    hotspots={sceneHotspots}
                    selectedId={null}
                    onPick={(id) => setSelectedHotspotId(id)}
                  />
                </>
              ))}
          </div>

          {/* Footer note */}
          <div className="shrink-0 border-t border-vpv-line px-4 py-3">
            <p className="text-[11.5px] leading-snug text-vpv-muted">
              Text only. Images, hotspot positions and icons stay exactly as
              they are. Nothing changes for your sales team until you save.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ─────────────────────────── building blocks ─────────────────────── */

function PanelHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <div className="text-[11.5px] uppercase tracking-[0.1em] font-semibold text-vpv-muted">
        {title}
      </div>
      {hint && (
        <p className="text-[11.5px] text-vpv-muted/80 mt-1 leading-snug">
          {hint}
        </p>
      )}
    </div>
  );
}

function Empty({ text, icon }: { text: string; icon?: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-vpv-line bg-vpv-canvas/50 px-4 py-8 text-center">
      {icon && (
        <MousePointerClick className="w-5 h-5 mx-auto text-vpv-muted/60 mb-2" />
      )}
      <p className="text-[12.5px] text-vpv-muted">{text}</p>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="text-[12px] font-medium text-vpv-ink mb-1">{label}</div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 px-3 rounded-lg border border-vpv-line focus:border-vpv-blue focus:ring-2 focus:ring-vpv-blue/20 outline-none text-[14px] bg-white text-vpv-ink placeholder:text-slate-400"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block">
      <div className="text-[12px] font-medium text-vpv-ink mb-1">{label}</div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full px-3 py-2 rounded-lg border border-vpv-line focus:border-vpv-blue focus:ring-2 focus:ring-vpv-blue/20 outline-none text-[14px] bg-white text-vpv-ink placeholder:text-slate-400 leading-relaxed resize-y"
      />
    </label>
  );
}

function hotspotTypeLabel(type: string): string {
  const map: Record<string, string> = {
    info: "Info card",
    video: "Video",
    image: "Image",
    pdf: "PDF",
    audio: "Audio",
    url: "Link",
    nav: "Navigation",
    person: "Person",
    polygon: "Area outline",
    text: "Text",
    icon: "Icon",
  };
  return map[type] ?? "Hotspot";
}

/** A quick list of the scene's hotspots, so the MD can reach one that is
 *  behind them in the 360 without hunting for it. */
function HotspotJumpList({
  hotspots,
  selectedId,
  onPick,
}: {
  hotspots: Hotspot[];
  selectedId: string | null;
  onPick: (id: string) => void;
}) {
  if (hotspots.length === 0) {
    return (
      <div className="pt-1">
        <PanelHeading title="Hotspots in this scene" />
        <p className="text-[12.5px] text-vpv-muted mt-2">
          This scene has no hotspots.
        </p>
      </div>
    );
  }
  return (
    <div className="pt-1">
      <PanelHeading title={`Hotspots in this scene (${hotspots.length})`} />
      <div className="mt-2 rounded-xl border border-vpv-line overflow-hidden">
        {hotspots.map((h, i) => {
          const on = h.id === selectedId;
          return (
            <button
              key={h.id}
              type="button"
              onClick={() => onPick(h.id)}
              className={`w-full text-left px-3 py-2 border-b border-vpv-line last:border-b-0 transition-colors ${
                on ? "bg-vpv-tint/60" : "hover:bg-vpv-canvas/60"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 shrink-0 rounded-md bg-white border border-vpv-line text-[10px] font-semibold text-vpv-muted grid place-items-center">
                  {i + 1}
                </span>
                <span className="text-[13px] text-vpv-ink truncate flex-1">
                  {h.label || h.info_title || hotspotTypeLabel(h.type)}
                </span>
                <span className="text-[10.5px] text-vpv-muted shrink-0">
                  {hotspotTypeLabel(h.type)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HotspotFields({
  hs,
  onEdit,
}: {
  hs: Hotspot;
  onEdit: (field: string, v: string) => void;
}) {
  const showInfo =
    hs.type === "info" || hs.info_title != null || hs.info_body != null;
  const showPdf = hs.type === "pdf" || hs.pdf_name != null;
  return (
    <>
      <PanelHeading
        title={hotspotTypeLabel(hs.type)}
        hint="Position, icon and link are set in the full editor — only the words are editable here."
      />
      <TextField
        label="Label"
        placeholder="Short label shown on the hotspot"
        value={hs.label ?? ""}
        onChange={(v) => onEdit("label", v)}
      />
      {showInfo && (
        <>
          <TextField
            label="Info title"
            placeholder="Title at the top of the popup"
            value={hs.info_title ?? ""}
            onChange={(v) => onEdit("info_title", v)}
          />
          <TextArea
            label="Info body"
            placeholder="The text inside the popup"
            value={hs.info_body ?? ""}
            onChange={(v) => onEdit("info_body", v)}
            rows={5}
          />
        </>
      )}
      {showPdf && (
        <TextField
          label="PDF name"
          placeholder="How the PDF is labelled in the viewer"
          value={hs.pdf_name ?? ""}
          onChange={(v) => onEdit("pdf_name", v)}
        />
      )}
    </>
  );
}
