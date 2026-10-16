"use client";

/**
 * /[slug]/owner/tours/[tourId]/text-edit — the MD-side text editor.
 *
 * One of the few places this app renders a dedicated editing UI for a
 * non-technical user: an MD who wants to tweak wording on a duplicated
 * tour before sending it to a specific client. There is no image
 * upload, no hotspot placement, no 360 preview — just plain text
 * boxes, in VPV's light brand, with one Save button.
 *
 * Fields the MD can edit:
 *   • Tour         — title, description
 *   • Each scene   — name, description
 *   • Each hotspot — label, info_title, info_body, pdf_name
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getMyProfile, type Profile } from "@/lib/auth";
import { orgBySlug } from "@/lib/orgSlug";
import VpvLogo from "@/components/dashboard/VpvLogo";
import {
  Save,
  ArrowLeft,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Image as ImageIcon,
  Target,
} from "lucide-react";

type TourRow = {
  id: string;
  title: string;
  description: string | null;
  org_id: string | null;
  source_tour_id: string | null;
};
type SceneRow = {
  id: string;
  tour_id: string;
  name: string;
  description: string | null;
  order_index: number;
};
type HotspotRow = {
  id: string;
  scene_id: string;
  type: string;
  label: string | null;
  info_title: string | null;
  info_body: string | null;
  pdf_name: string | null;
};

export default function TourTextEditPage() {
  const params = useParams<{ slug: string; tourId: string }>();
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [tour, setTour] = useState<TourRow | null>(null);
  const [scenes, setScenes] = useState<SceneRow[]>([]);
  const [hotspotsByScene, setHotspotsByScene] = useState<
    Record<string, HotspotRow[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // Flat dirty set of {kind, id, field, value} edits.
  const [dirty, setDirty] = useState<Record<string, string | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const p = await getMyProfile();
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

    const { data: t, error: tErr } = await supabase
      .from("tours")
      .select("id, title, description, org_id, source_tour_id")
      .eq("id", params.tourId)
      .maybeSingle();
    if (tErr || !t) {
      setErr("Tour not found, or you do not have permission to open it.");
      setLoading(false);
      return;
    }
    if (p.role !== "owner" && (t as TourRow).org_id !== p.org_id) {
      setErr("Tour not found, or you do not have permission to open it.");
      setLoading(false);
      return;
    }
    const row = t as TourRow;

    const { data: s } = await supabase
      .from("scenes")
      .select("id, tour_id, name, description, order_index")
      .eq("tour_id", row.id)
      .order("order_index");
    const sceneRows = (s ?? []) as SceneRow[];

    const sceneIds = sceneRows.map((x) => x.id);
    const { data: h } = sceneIds.length
      ? await supabase
          .from("hotspots")
          .select("id, scene_id, type, label, info_title, info_body, pdf_name")
          .in("scene_id", sceneIds)
      : { data: [] as HotspotRow[] };
    const map: Record<string, HotspotRow[]> = {};
    for (const row2 of (h ?? []) as HotspotRow[]) {
      (map[row2.scene_id] ||= []).push(row2);
    }

    setMe(p);
    setTour(row);
    setScenes(sceneRows);
    setHotspotsByScene(map);
    setDirty({});
    setLoading(false);
  }, [params.slug, params.tourId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirtyCount = Object.keys(dirty).length;

  const edit = (
    kind: "tour" | "scene" | "hotspot",
    id: string,
    field: string,
    value: string
  ) => {
    const key = `${kind}:${id}:${field}`;
    const v = value;
    const trimmed = v.length === 0 ? null : v;
    // Local update so the input stays controlled.
    if (kind === "tour") {
      setTour((prev) => (prev ? { ...prev, [field]: trimmed } : prev));
    } else if (kind === "scene") {
      setScenes((prev) =>
        prev.map((s) => (s.id === id ? { ...s, [field]: trimmed } : s))
      );
    } else {
      setHotspotsByScene((prev) => {
        const next: Record<string, HotspotRow[]> = {};
        for (const [sid, arr] of Object.entries(prev)) {
          next[sid] = arr.map((hs) =>
            hs.id === id ? { ...hs, [field]: trimmed } : hs
          );
        }
        return next;
      });
    }
    setDirty((prev) => ({ ...prev, [key]: trimmed }));
    setSavedAt(null);
  };

  async function save() {
    if (!dirtyCount || saving) return;
    setSaving(true);
    setErr(null);
    // Collect updates per table/id.
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
        const { error } = await supabase
          .from("scenes")
          .update(patch)
          .eq("id", id);
        if (error) throw error;
      }
      for (const [id, patch] of Object.entries(hsUpd)) {
        const { error } = await supabase
          .from("hotspots")
          .update(patch)
          .eq("id", id);
        if (error) throw error;
      }
      setDirty({});
      setSavedAt(Date.now());
    } catch (e) {
      setErr(
        (e as Error)?.message ||
          "We couldn't save your changes. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  const totalHotspots = useMemo(
    () =>
      Object.values(hotspotsByScene).reduce((n, arr) => n + arr.length, 0),
    [hotspotsByScene]
  );

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-vpv-canvas">
        <Loader2 className="w-5 h-5 animate-spin text-vpv-blue" />
      </div>
    );
  }

  if (err && !tour) {
    return (
      <div className="min-h-screen grid place-items-center bg-vpv-canvas px-4">
        <div className="max-w-md text-center">
          <AlertCircle className="w-8 h-8 mx-auto text-rose-500" />
          <p className="mt-3 text-slate-700">{err}</p>
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

  if (!tour) return null;

  return (
    <div className="min-h-screen bg-vpv-canvas">
      {/* Sticky top bar — matches the light VPV brand theme. */}
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-vpv-line">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
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
              {totalHotspots} hotspot{totalHotspots === 1 ? "" : "s"}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
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

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Help card */}
        <div className="rounded-2xl bg-white border border-vpv-line p-5 flex items-start gap-3 shadow-[0_1px_2px_rgba(11,61,145,0.04),0_10px_30px_-18px_rgba(11,61,145,0.14)]">
          <div className="w-9 h-9 rounded-lg bg-vpv-tint text-vpv-blue grid place-items-center shrink-0">
            <Target size={16} />
          </div>
          <div>
            <div className="text-[14px] font-semibold text-vpv-ink">
              Text-only editing
            </div>
            <p className="text-[12.5px] text-vpv-muted mt-0.5 leading-snug">
              Edit tour wording, scene names and hotspot text here. Images,
              hotspot placement and other visuals stay the same. Save when
              you are done — nothing changes for the sales team until you
              save.
            </p>
            {savedAt && !dirtyCount && (
              <div className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
                <CheckCircle2 size={11} /> Saved
              </div>
            )}
            {err && (
              <div className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-2.5 py-0.5">
                <AlertCircle size={11} /> {err}
              </div>
            )}
          </div>
        </div>

        {/* Tour-level */}
        <section className="rounded-2xl bg-white border border-vpv-line shadow-[0_1px_2px_rgba(11,61,145,0.04),0_10px_30px_-18px_rgba(11,61,145,0.14)]">
          <div className="px-5 py-4 border-b border-vpv-line">
            <div className="text-[11.5px] uppercase tracking-[0.1em] font-semibold text-vpv-muted">
              The tour
            </div>
          </div>
          <div className="p-5 space-y-4">
            <TextField
              label="Title"
              placeholder="Tour title"
              value={tour.title || ""}
              onChange={(v) => edit("tour", tour.id, "title", v)}
            />
            <TextArea
              label="Description"
              placeholder="A short line about this tour — shown on the dashboard."
              value={tour.description || ""}
              onChange={(v) => edit("tour", tour.id, "description", v)}
            />
          </div>
        </section>

        {/* Scenes */}
        {scenes.length === 0 ? (
          <div className="rounded-2xl bg-white border border-dashed border-vpv-line p-8 text-center text-vpv-muted text-[13px]">
            This tour has no scenes.
          </div>
        ) : (
          scenes.map((sc, idx) => {
            const hs = hotspotsByScene[sc.id] ?? [];
            return (
              <section
                key={sc.id}
                className="rounded-2xl bg-white border border-vpv-line shadow-[0_1px_2px_rgba(11,61,145,0.04),0_10px_30px_-18px_rgba(11,61,145,0.14)]"
              >
                <div className="px-5 py-4 border-b border-vpv-line flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-vpv-tint text-vpv-navy grid place-items-center text-[12px] font-semibold">
                    {idx + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11.5px] uppercase tracking-[0.1em] font-semibold text-vpv-muted">
                      Scene
                    </div>
                    <div className="text-[14px] font-semibold text-vpv-ink truncate">
                      {sc.name || "Untitled scene"}
                    </div>
                  </div>
                  <div className="ml-auto inline-flex items-center gap-1 text-[11px] text-vpv-muted">
                    <MapPin size={11} /> {hs.length} hotspot
                    {hs.length === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="p-5 space-y-4">
                  <TextField
                    label="Name"
                    placeholder="e.g. Receiving bay"
                    value={sc.name || ""}
                    onChange={(v) => edit("scene", sc.id, "name", v)}
                  />
                  <TextArea
                    label="Description"
                    placeholder="A short line about this scene — shown under the scene name."
                    value={sc.description || ""}
                    onChange={(v) =>
                      edit("scene", sc.id, "description", v)
                    }
                  />

                  {/* Hotspots */}
                  {hs.length > 0 && (
                    <div className="pt-2 space-y-3">
                      <div className="text-[11.5px] uppercase tracking-[0.1em] font-semibold text-vpv-muted">
                        Hotspots in this scene
                      </div>
                      <div className="space-y-3">
                        {hs.map((h, hidx) => (
                          <HotspotCard
                            key={h.id}
                            index={hidx + 1}
                            hs={h}
                            onEdit={(field, v) =>
                              edit("hotspot", h.id, field, v)
                            }
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            );
          })
        )}

        {/* Save CTA at bottom too, for very long tours */}
        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirtyCount || saving}
            className="h-10 px-5 rounded-full bg-vpv-grad text-white text-[13.5px] font-semibold shadow-[0_10px_26px_-10px_rgba(20,104,216,0.6)] disabled:opacity-40 inline-flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Saving
              </>
            ) : (
              <>
                <Save size={14} />
                {dirtyCount
                  ? `Save ${dirtyCount} change${dirtyCount === 1 ? "" : "s"}`
                  : "All saved"}
              </>
            )}
          </button>
        </div>
      </main>
    </div>
  );
}

/* ─────────────────────────── building blocks ─────────────────────── */

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
        className="w-full h-10 px-3 rounded-lg border border-vpv-line focus:border-vpv-blue focus:ring-2 focus:ring-vpv-blue/20 outline-none text-[14px] bg-white"
      />
    </label>
  );
}

function TextArea({
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
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full px-3 py-2 rounded-lg border border-vpv-line focus:border-vpv-blue focus:ring-2 focus:ring-vpv-blue/20 outline-none text-[14px] bg-white leading-relaxed resize-y"
      />
    </label>
  );
}

function HotspotCard({
  index,
  hs,
  onEdit,
}: {
  index: number;
  hs: HotspotRow;
  onEdit: (field: string, v: string) => void;
}) {
  const typeNice =
    hs.type === "info"
      ? "Info card"
      : hs.type === "video"
        ? "Video"
        : hs.type === "image"
          ? "Image"
          : hs.type === "pdf"
            ? "PDF"
            : hs.type === "audio"
              ? "Audio"
              : hs.type === "url"
                ? "Link"
                : hs.type === "nav"
                  ? "Navigation"
                  : hs.type === "person"
                    ? "Person"
                    : hs.type === "polygon"
                      ? "Area outline"
                      : hs.type === "text"
                        ? "Text"
                        : "Hotspot";

  return (
    <div className="rounded-xl border border-vpv-line bg-vpv-canvas/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-md bg-white border border-vpv-line text-vpv-muted text-[11px] font-semibold grid place-items-center">
          {index}
        </div>
        <div className="text-[12px] font-medium text-vpv-ink">{typeNice}</div>
        <span className="text-[11px] text-vpv-muted">
          · position, icon and link are edited in the full editor
        </span>
      </div>
      <div className="space-y-3">
        <TextField
          label="Label"
          placeholder="Short label shown on the hotspot"
          value={hs.label || ""}
          onChange={(v) => onEdit("label", v)}
        />
        {(hs.type === "info" || hs.info_title || hs.info_body) && (
          <>
            <TextField
              label="Info title"
              placeholder="Title at the top of the info popup"
              value={hs.info_title || ""}
              onChange={(v) => onEdit("info_title", v)}
            />
            <TextArea
              label="Info body"
              placeholder="The text inside the info popup"
              value={hs.info_body || ""}
              onChange={(v) => onEdit("info_body", v)}
            />
          </>
        )}
        {(hs.type === "pdf" || hs.pdf_name) && (
          <TextField
            label="PDF name"
            placeholder="How the PDF is labelled in the viewer"
            value={hs.pdf_name || ""}
            onChange={(v) => onEdit("pdf_name", v)}
          />
        )}
      </div>
    </div>
  );
}
