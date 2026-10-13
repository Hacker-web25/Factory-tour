"use client";

/**
 * TranslationsSection — editor UI in the Photo tab.
 *
 * Shows which languages the tour has been translated into, lets the
 * owner add more languages, and translates all tour text in one go
 * (walking scenes + hotspots on the client, calling MyMemory, and
 * upserting into the `translations` cache table).
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Hotspot, Scene, Tour } from "@/lib/types";
import {
  SUPPORTED_LANGUAGES,
  collectTourTexts,
  langMeta,
  markLanguageAvailable,
  translateAndCache,
  unmarkLanguageAvailable,
  type LangCode,
} from "@/lib/i18n";

export default function TranslationsSection({
  tour,
  onTourChange,
}: {
  tour: Tour & { available_languages?: string[] | null };
  onTourChange: (patch: Partial<Tour>) => void;
}) {
  const available = ((tour.available_languages as LangCode[] | null) ??
    []) as LangCode[];

  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<LangCode | null>(null);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [lastMsg, setLastMsg] = useState<string | null>(null);

  async function collectAllTexts(): Promise<string[]> {
    // Fetch scenes + hotspots for the tour so we can walk every string.
    const [{ data: sc }, { data: hs }] = await Promise.all([
      supabase.from("scenes").select("name").eq("tour_id", tour.id),
      supabase
        .from("hotspots")
        .select("label, info_title, info_body, pdf_name")
        .in(
          "scene_id",
          (
            await supabase.from("scenes").select("id").eq("tour_id", tour.id)
          ).data?.map((s) => (s as any).id) ?? []
        ),
    ]);
    return collectTourTexts(
      tour,
      (sc as Pick<Scene, "name">[]) ?? [],
      (hs as Pick<Hotspot, "label" | "info_title" | "info_body" | "pdf_name">[]) ??
        []
    );
  }

  async function translateTo(target: LangCode) {
    setBusy(target);
    setProgress({ done: 0, total: 0 });
    setLastMsg(null);
    try {
      const texts = await collectAllTexts();
      if (texts.length === 0) {
        setLastMsg("Nothing to translate yet — add some text first.");
        return;
      }
      setProgress({ done: 0, total: texts.length });
      const result = await translateAndCache({
        tourId: tour.id,
        sourceTexts: texts,
        targetLang: target,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      await markLanguageAvailable(tour.id, target);
      onTourChange({
        available_languages: Array.from(new Set([...available, target])),
      } as Partial<Tour>);
      setLastMsg(
        result.translated > 0
          ? `Translated ${result.translated} strings to ${langMeta(target).name}.`
          : `${langMeta(target).name} already up to date.`
      );
    } catch (e: any) {
      console.error("[translations] failed:", e);
      setLastMsg(`Failed: ${e?.message ?? "unknown error"}`);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function removeLang(target: LangCode) {
    if (
      !window.confirm(
        `Remove ${langMeta(target).name}? Visitors won't be able to switch to it. Cached translations stay in the database.`
      )
    )
      return;
    await unmarkLanguageAvailable(tour.id, target);
    onTourChange({
      available_languages: available.filter((l) => l !== target),
    } as Partial<Tour>);
  }

  // Languages NOT yet added.
  const notYet = SUPPORTED_LANGUAGES.filter(
    (l) => l.code !== "en" && !available.includes(l.code)
  );

  return (
    <div>
      <div className="text-xs uppercase text-neutral-400 mb-2">
        Translations
      </div>

      {/* Available language badges */}
      <div className="flex flex-wrap gap-1 mb-2">
        <span className="inline-flex items-center gap-1 text-[11px] bg-panelSoft border border-border rounded px-2 py-1">
          {langMeta("en").nativeName}
          <span className="text-neutral-500">· source</span>
        </span>
        {available.map((code) => (
          <span
            key={code}
            className="inline-flex items-center gap-1 text-[11px] bg-panelSoft border border-border rounded px-2 py-1"
          >
            {langMeta(code).nativeName}
            <button
              onClick={() => removeLang(code)}
              className="text-red-400 hover:text-red-300 ml-1 -mr-1 px-1"
              title="Remove language"
            >
              ×
            </button>
            <button
              onClick={() => translateTo(code)}
              disabled={busy === code}
              className="text-blue-400 hover:text-blue-300 ml-1 -mr-1 px-1"
              title="Re-translate (fills in any new strings)"
            >
              ↻
            </button>
          </span>
        ))}
      </div>

      {/* Add language dropdown */}
      <div className="flex gap-1.5">
        <button
          onClick={() => setPicking((v) => !v)}
          className="flex-1 text-xs bg-panelSoft border border-border rounded py-1.5 hover:bg-panelSoft/70"
        >
          {picking ? "Cancel" : "+ Add language"}
        </button>
      </div>

      {picking && (
        <div className="mt-2 max-h-48 overflow-y-auto border border-border rounded bg-panelSoft">
          {notYet.length === 0 && (
            <div className="text-[11px] text-neutral-500 p-2">
              All supported languages already added.
            </div>
          )}
          {notYet.map((l) => (
            <button
              key={l.code}
              onClick={async () => {
                setPicking(false);
                await translateTo(l.code);
              }}
              className="w-full text-left text-xs px-3 py-2 hover:bg-panel border-b border-border last:border-b-0 flex justify-between items-center"
            >
              <span>{l.nativeName}</span>
              <span className="text-neutral-500 text-[10px]">
                {l.name} · {l.code.toUpperCase()}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Progress bar */}
      {busy && progress && (
        <div className="mt-2">
          <div className="text-[11px] text-neutral-400 mb-1">
            Translating to {langMeta(busy).name}: {progress.done} / {progress.total}
          </div>
          <div className="w-full h-1 bg-panelSoft rounded overflow-hidden">
            <div
              className="h-full bg-accent transition-all"
              style={{
                width:
                  progress.total > 0
                    ? `${(progress.done / progress.total) * 100}%`
                    : "0%",
              }}
            />
          </div>
        </div>
      )}

      {lastMsg && !busy && (
        <div className="mt-2 text-[11px] text-neutral-400">{lastMsg}</div>
      )}
    </div>
  );
}
