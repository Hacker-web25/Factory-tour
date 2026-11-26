"use client";

/**
 * TranslationsSection — editor panel in the Photo tab.
 *
 *  - the language the tour is written in
 *  - the extra languages offered to visitors, each with a clear "complete / N to translate" status
 *  - add a language (translates the whole tour first, then offers it), translate what is missing,
 *    redo machine translations (never the ones a person corrected), remove a language
 *  - a review table to read and correct any translation; corrected ones are never overwritten
 *
 * All language data lives in the language service (Cloudflare), not in the tour's database.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Tour } from "@/lib/types";
import { SUPPORTED_LANGUAGES, collectTourTexts, langMeta } from "@/lib/i18n";
import { LanguageApiError, languageApi, type StoredConfig, type TranscriptRef, type TranslationRowView } from "@/lib/language/client";
import { hashText } from "@/lib/language/hash";
import { describeRun, linesBySpokenLanguage, missingTexts, translateEverything } from "@/lib/language/translateAll";
import { useT } from "@/lib/TranslationContext";

type Loaded = {
  config: StoredConfig;
  transcripts: TranscriptRef[];
  /** every translatable word of the tour */
  labels: string[];
  /** every subtitle line, with the language it was spoken in */
  spoken: { language: string; segments: { text: string }[] }[];
  /** per offered language: how many texts still have no translation */
  missing: Record<string, number>;
  /** per offered language: how many were corrected by hand */
  reviewed: Record<string, number>;
};

const PAGE = 25;

function messageOf(e: unknown): string {
  if (e instanceof LanguageApiError) return e.message;
  return (e as Error)?.message || "Something went wrong. Try again.";
}

export default function TranslationsSection({ tour }: { tour: Tour }) {
  const { reload } = useT();
  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // what is running, for the progress line
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [filter, setFilter] = useState("");
  const [reviewLang, setReviewLang] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const loadToken = useRef(0);
  const tourTitle = tour.title;
  const tourDescription = tour.description;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
  }, []);

  /** The tour's current words, language settings and subtitle lines — always read fresh. */
  const readTourData = useCallback(async () => {
    const [cfg, scenesRes] = await Promise.all([languageApi.config(tour.id), supabase.from("scenes").select("id, name, description").eq("tour_id", tour.id)]);
    if (scenesRes.error) throw new Error("Could not read the tour's scenes. Try again.");
    const scenes = (scenesRes.data ?? []) as { id: string; name: string; description: string | null }[];
    const hotspotsRes = scenes.length
      ? await supabase
          .from("hotspots")
          .select("label, info_title, info_body, pdf_name")
          .in(
            "scene_id",
            scenes.map((s) => s.id)
          )
      : { data: [] as never[], error: null };
    if (hotspotsRes.error) throw new Error("Could not read the tour's hotspots. Try again.");
    const labels = collectTourTexts({ title: tourTitle, description: tourDescription }, scenes, (hotspotsRes.data ?? []) as never[]);

    const spoken: Loaded["spoken"] = [];
    for (const tr of cfg.transcripts) {
      const full = await languageApi.transcript(tour.id, tr.key);
      if (full && full.segments.length > 0) spoken.push({ language: full.language, segments: full.segments });
    }
    return { config: cfg.config, transcripts: cfg.transcripts, labels, spoken };
  }, [tour.id, tourTitle, tourDescription]);

  /** Read everything the panel shows. Safe to call again after any change. */
  const load = useCallback(async () => {
    const token = ++loadToken.current;
    try {
      const base = await readTourData();
      const offeredNow = base.config.available_languages.filter((l) => l !== base.config.default_language);
      const missing: Record<string, number> = {};
      const reviewed: Record<string, number> = {};
      for (const lang of offeredNow) {
        const rows = await languageApi.translationRows(tour.id, lang);
        const have = new Set(rows.map((r) => r.h));
        reviewed[lang] = rows.filter((r) => r.reviewed).length;
        const lines = Array.from(linesBySpokenLanguage(base.spoken.filter((s) => s.language !== lang)).values()).flat();
        missing[lang] = missingTexts([...base.labels, ...lines], have).length;
      }
      if (!mounted.current || token !== loadToken.current) return;
      setData({ ...base, missing, reviewed });
      setLoadError(null);
    } catch (e) {
      if (!mounted.current || token !== loadToken.current) return;
      setLoadError(messageOf(e));
    }
  }, [readTourData, tour.id]);

  // Load on open, and again when the tour's own words change (not on every other edit in the editor).
  useEffect(() => {
    load();
  }, [load]);

  // The subtitles panel announces when it has added or changed subtitles.
  useEffect(() => {
    const again = () => load();
    window.addEventListener("factour:language-changed", again);
    return () => window.removeEventListener("factour:language-changed", again);
  }, [load]);

  const defaultLang = data?.config.default_language ?? "en";
  const offered = useMemo(() => (data?.config.available_languages ?? []).filter((l) => l !== defaultLang), [data, defaultLang]);

  async function run(label: string, job: (signal: AbortSignal) => Promise<void>) {
    if (busy) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(label);
    setProgress({ done: 0, total: 0 });
    setMessage(null);
    try {
      await job(ctrl.signal);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") setMessage("Stopped. Anything already translated has been saved.");
      else setMessage(messageOf(e));
    } finally {
      if (mounted.current) {
        setBusy(null);
        setProgress(null);
      }
      abortRef.current = null;
      if (mounted.current) {
        await load();
        reload();
      }
    }
  }

  function translate(lang: string, mode: "missing" | "all", addAfter: boolean) {
    const name = langMeta(lang).name;
    return run(`Translating into ${name}`, async (signal) => {
      // Words may have been added or changed since the panel opened: read them again now.
      const fresh = await readTourData();
      const result = await translateEverything({
        tourId: tour.id,
        lang,
        sourceLang: fresh.config.default_language,
        labels: fresh.labels,
        transcripts: fresh.transcripts,
        tourTitle,
        mode,
        api: languageApi,
        signal,
        onProgress: (done, total) => mounted.current && setProgress({ done, total }),
      });
      const usable = result.labels.translated + result.labels.skipped + result.labels.skippedReviewed + result.subtitles.translated + result.subtitles.skipped + result.subtitles.skippedReviewed;
      if (addAfter) {
        if (usable === 0) {
          setMessage(`${name} was not added: nothing could be translated. ${describeRun(name, result)}`);
          return;
        }
        await languageApi.saveConfig(tour.id, { add_languages: [lang] });
      }
      setMessage(describeRun(name, result));
    });
  }

  function changeDefault(next: string) {
    if (!data || next === defaultLang) return;
    const ok = window.confirm(
      `Set ${langMeta(next).name} as the language this tour is written in?\n\n` +
        `Use this only if the text you typed is in ${langMeta(next).name}. Visitors who speak it will see your text as written. ` +
        `Translations already made are kept — if they were made from the wrong language, press “Redo all” on each language afterwards.`
    );
    if (!ok) return;
    return run("Saving", async () => {
      await languageApi.saveConfig(tour.id, { default_language: next });
      setMessage(`The tour is now marked as written in ${langMeta(next).name}.`);
    });
  }

  function remove(lang: string) {
    const ok = window.confirm(
      `Remove ${langMeta(lang).name}?\n\nVisitors will no longer be able to choose it, and all its translations — including any you corrected — will be deleted. This cannot be undone.`
    );
    if (!ok) return;
    if (reviewLang === lang) setReviewLang(null);
    return run("Removing", async () => {
      await languageApi.removeLanguage(tour.id, lang);
      setMessage(`${langMeta(lang).name} was removed.`);
    });
  }

  const notYet = SUPPORTED_LANGUAGES.filter((l) => l.code !== defaultLang && !offered.includes(l.code)).filter((l) => {
    const q = filter.trim().toLowerCase();
    return !q || l.name.toLowerCase().includes(q) || l.nativeName.toLowerCase().includes(q) || l.code.toLowerCase().includes(q);
  });

  if (loadError && !data) {
    return (
      <div>
        <div className="text-xs uppercase text-neutral-400 mb-2">Translations</div>
        <div className="text-[11px] text-amber-300 border border-amber-500/30 bg-amber-500/10 rounded p-2">{loadError}</div>
        <button onClick={load} className="mt-2 text-[11px] text-neutral-400 hover:text-neutral-200">
          ↻ Try again
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <div>
        <div className="text-xs uppercase text-neutral-400 mb-2">Translations</div>
        <div className="text-[11px] text-neutral-500">Loading…</div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs uppercase text-neutral-400 mb-2">Translations</div>

      {/* The language the tour is written in */}
      <label className="block text-[11px] text-neutral-400 mb-2">
        This tour is written in
        <select
          value={defaultLang}
          onChange={(e) => changeDefault(e.target.value)}
          disabled={!!busy}
          className="w-full bg-panelSoft border border-border rounded px-1.5 py-1 text-xs mt-0.5 disabled:opacity-50"
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.nativeName} ({l.name})
            </option>
          ))}
        </select>
      </label>

      {/* Languages on offer */}
      {offered.length === 0 ? (
        <div className="text-[11px] text-neutral-500 border border-dashed border-border rounded p-3 text-center mb-2">
          Visitors see the tour in {langMeta(defaultLang).name} only. Add a language to let them switch.
        </div>
      ) : (
        <div className="space-y-1.5 mb-2">
          {offered.map((code) => {
            const gap = data.missing[code] ?? 0;
            const isOpen = reviewLang === code;
            return (
              <div key={code} className="border border-border rounded bg-panelSoft p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs text-neutral-200 truncate">
                      {langMeta(code).nativeName} <span className="text-neutral-500 text-[10px]">{langMeta(code).name}</span>
                    </div>
                    <div className={`text-[10px] mt-0.5 ${gap === 0 ? "text-emerald-400" : "text-amber-300"}`}>
                      {gap === 0 ? "✓ Complete" : `${gap} text${gap === 1 ? "" : "s"} still to translate`}
                      {(data.reviewed[code] ?? 0) > 0 && <span className="text-neutral-500"> · {data.reviewed[code]} corrected by you</span>}
                    </div>
                  </div>
                  <button onClick={() => remove(code)} disabled={!!busy} className="text-red-400 hover:text-red-300 px-1 text-sm disabled:opacity-40" title={`Remove ${langMeta(code).name}`}>
                    ×
                  </button>
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {gap > 0 && (
                    <button onClick={() => translate(code, "missing", false)} disabled={!!busy} className="text-[10px] bg-accent text-black font-medium rounded px-2 py-1 disabled:opacity-40">
                      Translate missing
                    </button>
                  )}
                  <button
                    onClick={() => setReviewLang(isOpen ? null : code)}
                    className="text-[10px] bg-panel border border-border rounded px-2 py-1 hover:border-neutral-500"
                  >
                    {isOpen ? "Close review" : "Review & edit"}
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Redo every machine translation into ${langMeta(code).name}? Texts you corrected by hand are kept.`)) translate(code, "all", false);
                    }}
                    disabled={!!busy}
                    className="text-[10px] bg-panel border border-border rounded px-2 py-1 hover:border-neutral-500 disabled:opacity-40"
                  >
                    Redo all
                  </button>
                </div>
                {isOpen && <ReviewTable tourId={tour.id} lang={code} labels={data.labels} spoken={data.spoken} onChanged={load} />}
              </div>
            );
          })}
        </div>
      )}

      {/* Add a language */}
      <button
        onClick={() => setPicking((v) => !v)}
        disabled={!!busy}
        className="w-full text-xs bg-panelSoft border border-border rounded py-1.5 hover:bg-panelSoft/70 disabled:opacity-40"
      >
        {picking ? "Cancel" : "+ Add language"}
      </button>
      {picking && (
        <div className="mt-2 border border-border rounded bg-panelSoft">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search languages…"
            className="w-full bg-transparent border-b border-border px-2 py-1.5 text-xs text-neutral-200 outline-none"
          />
          <div className="max-h-48 overflow-y-auto">
            {notYet.length === 0 && <div className="text-[11px] text-neutral-500 p-2">No language matches.</div>}
            {notYet.map((l) => (
              <button
                key={l.code}
                onClick={() => {
                  setPicking(false);
                  setFilter("");
                  translate(l.code, "missing", true);
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
          <div className="text-[10px] text-neutral-500 px-2 py-1.5 border-t border-border">
            Picking a language translates the whole tour (and any subtitles) first, then offers it to visitors.
          </div>
        </div>
      )}

      {/* Progress */}
      {busy && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1">
            <span>
              {busy}
              {progress && progress.total > 0 ? `: ${progress.done} / ${progress.total}` : "…"}
            </span>
            <button onClick={() => abortRef.current?.abort()} className="text-neutral-400 hover:text-neutral-200 underline">
              Stop
            </button>
          </div>
          <div className="w-full h-1 bg-panelSoft rounded overflow-hidden">
            <div className="h-full bg-accent transition-all" style={{ width: progress && progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : "0%" }} />
          </div>
        </div>
      )}

      {message && !busy && <div className="mt-2 text-[11px] text-neutral-300 leading-relaxed">{message}</div>}
      {!busy && offered.length > 0 && (
        <button onClick={load} className="mt-2 w-full text-[10px] text-neutral-400 hover:text-neutral-200" title="Look at the tour again, e.g. after adding hotspots">
          ↻ Check for new text
        </button>
      )}
      {loadError && data && !busy && <div className="mt-2 text-[11px] text-amber-300">{loadError}</div>}
    </div>
  );
}

/* ───────────────────────────── review table ───────────────────────────── */

function ReviewTable({
  tourId,
  lang,
  labels,
  spoken,
  onChanged,
}: {
  tourId: string;
  lang: string;
  labels: string[];
  spoken: { language: string; segments: { text: string }[] }[];
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<TranslationRowView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [showUnused, setShowUnused] = useState(false);
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    let alive = true;
    setRows(null);
    setError(null);
    languageApi
      .translationRows(tourId, lang)
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setError(messageOf(e)));
    return () => {
      alive = false;
    };
  }, [tourId, lang]);

  // Which source texts the tour still uses (words, and lines of audio spoken in another language).
  const used = useMemo(() => {
    const set = new Set<string>(labels.map(hashText));
    for (const s of spoken) if (s.language !== lang) for (const seg of s.segments) if (seg.text.trim()) set.add(hashText(seg.text));
    return set;
  }, [labels, spoken, lang]);

  const order = useMemo(() => new Map(labels.map((t, i) => [hashText(t), i])), [labels]);

  const visible = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (!showUnused && !used.has(r.h)) return false;
      if (onlyOpen && r.reviewed) return false;
      if (q && !r.source.toLowerCase().includes(q) && !r.text.toLowerCase().includes(q)) return false;
      return true;
    });
    // the tour's own words first, in the order they appear; then subtitle lines
    return list.sort((a, b) => (order.get(a.h) ?? 1e9) - (order.get(b.h) ?? 1e9));
  }, [rows, search, onlyOpen, showUnused, used, order]);

  async function save(row: TranslationRowView) {
    const text = (drafts[row.h] ?? row.text).trim();
    if (!text) {
      setError("A translation cannot be empty.");
      return;
    }
    setSaving(row.h);
    setError(null);
    try {
      await languageApi.saveTranslations(tourId, lang, [{ source: row.source, text }]);
      setRows((rs) => (rs ?? []).map((r) => (r.h === row.h ? { ...r, text, engine: "manual", reviewed: true } : r)));
      setDrafts((d) => {
        const next = { ...d };
        delete next[row.h];
        return next;
      });
      onChanged();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setSaving(null);
    }
  }

  if (error && !rows) return <div className="mt-2 text-[11px] text-amber-300">{error}</div>;
  if (!rows) return <div className="mt-2 text-[11px] text-neutral-500">Loading translations…</div>;

  return (
    <div className="mt-2 border-t border-border pt-2">
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setShown(PAGE);
          }}
          placeholder="Search…"
          className="flex-1 min-w-[6rem] bg-panel border border-border rounded px-1.5 py-1 text-[11px] text-neutral-200 outline-none"
        />
        <label className="flex items-center gap-1 text-[10px] text-neutral-400">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
          Not yet checked
        </label>
        <label className="flex items-center gap-1 text-[10px] text-neutral-400" title="Translations of text that was later changed or removed">
          <input type="checkbox" checked={showUnused} onChange={(e) => setShowUnused(e.target.checked)} />
          Unused too
        </label>
      </div>
      {error && <div className="text-[11px] text-amber-300 mb-1">{error}</div>}
      {visible.length === 0 && <div className="text-[11px] text-neutral-500 py-2">Nothing to show.</div>}
      <div className="space-y-1.5 max-h-96 overflow-y-auto pr-0.5">
        {visible.slice(0, shown).map((r) => {
          const draft = drafts[r.h];
          const dirty = draft !== undefined && draft !== r.text;
          return (
            <div key={r.h} className="bg-panel border border-border rounded p-1.5">
              <div className="text-[10px] text-neutral-500 whitespace-pre-wrap break-words line-clamp-3" title={r.source}>
                {r.source}
              </div>
              <textarea
                value={draft ?? r.text}
                onChange={(e) => setDrafts((d) => ({ ...d, [r.h]: e.target.value }))}
                rows={Math.min(5, Math.max(1, Math.ceil((draft ?? r.text).length / 36)))}
                className="w-full mt-1 bg-panelSoft border border-border rounded px-1.5 py-1 text-xs outline-none resize-y"
                dir="auto"
              />
              <div className="flex items-center justify-between mt-1">
                <span className={`text-[10px] ${r.reviewed ? "text-emerald-400" : "text-neutral-500"}`}>
                  {r.reviewed ? "✓ checked by you" : `machine (${r.engine})`}
                  {!used.has(r.h) && <span className="text-amber-300"> · unused</span>}
                </span>
                {dirty && (
                  <span className="flex gap-1">
                    <button
                      onClick={() =>
                        setDrafts((d) => {
                          const next = { ...d };
                          delete next[r.h];
                          return next;
                        })
                      }
                      className="text-[10px] text-neutral-400 hover:text-neutral-200 px-1"
                    >
                      Undo
                    </button>
                    <button onClick={() => save(r)} disabled={saving === r.h} className="text-[10px] bg-accent text-black font-medium rounded px-2 py-0.5 disabled:opacity-50">
                      {saving === r.h ? "Saving…" : "Save"}
                    </button>
                  </span>
                )}
                {!dirty && !r.reviewed && (
                  <button onClick={() => save(r)} disabled={saving === r.h} className="text-[10px] text-neutral-400 hover:text-neutral-200 underline disabled:opacity-50" title="Mark this translation as checked so it is never overwritten">
                    {saving === r.h ? "Saving…" : "Mark as checked"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {visible.length > shown && (
        <button onClick={() => setShown((n) => n + PAGE)} className="w-full text-[10px] text-neutral-400 hover:text-neutral-200 mt-1.5">
          Show {Math.min(PAGE, visible.length - shown)} more ({visible.length - shown} left)
        </button>
      )}
    </div>
  );
}
