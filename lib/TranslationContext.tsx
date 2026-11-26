"use client";

/**
 * TranslationContext
 * ------------------
 * Wrap the viewer (or the editor) with <TranslationProvider tour scenes hotspots />
 * and every child can call `useT()`:
 *
 *   t(text)          translate a tour string, synchronously, from the loaded map
 *   tSub(text, from) translate one subtitle line spoken in language `from`
 *   transcriptFor(url)  the subtitle lines of an audio file (null if it has none)
 *   subtitleSettings, languages, lang / setLang, reload()
 *
 * Everything comes from /api/language (Cloudflare D1), never straight from Supabase.
 * Reading is cheap: one small call for the settings, one for the strings of the
 * language being viewed, and one per audio file that actually has subtitles.
 * Visitors never write anything and never trigger a translation.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Hotspot, Scene, Tour } from "@/lib/types";
import { detectVisitorLanguage, type LangCode } from "@/lib/i18n";
import { audioKey } from "@/lib/language/audioKey";
import { languageApi, type StoredConfig, type TranscriptRef } from "@/lib/language/client";
import { hashText } from "@/lib/language/hash";
import type { Segment } from "@/lib/language/segments";
import { DEFAULT_SUBTITLE_SETTINGS, resolveSettings, type SubtitleSettings } from "@/lib/language/settings";

export type LoadedTranscript = { segments: Segment[]; language: string };

type TranslationCtx = {
  /** Currently active language. Always non-null. */
  lang: LangCode;
  /** Change language — persists in the URL (?lang=xx) so link-sharing works. */
  setLang: (l: LangCode) => void;
  /** The language the tour was written in. */
  sourceLang: LangCode;
  /** Every language a visitor can pick: the source first, then the translations on offer. */
  languages: LangCode[];
  /** Only the extra languages (the source is implicit). */
  availableLanguages: LangCode[];
  /** Translate a tour string synchronously. Returns the source text on a miss. */
  t: (source: string | null | undefined) => string;
  /** Translate a subtitle line that was spoken in `from`. */
  tSub: (text: string | null | undefined, from: string) => string;
  /** The subtitles of an audio file, or null when it has none (no network call is made then). */
  transcriptFor: (audioUrl: string) => Promise<LoadedTranscript | null>;
  /** Do any of this tour's audio files have subtitles? */
  hasSubtitles: boolean;
  subtitleSettings: SubtitleSettings;
  /** True while the strings for the current language are being fetched. */
  loading: boolean;
  /** The settings have arrived (or failed). */
  ready: boolean;
  /** Fetch everything again — the editor calls this after changing languages or subtitles. */
  reload: () => void;
};

const Ctx = createContext<TranslationCtx | null>(null);

const IDENTITY: TranslationCtx = {
  lang: "en",
  setLang: () => {},
  sourceLang: "en",
  languages: ["en"],
  availableLanguages: [],
  t: (s) => s ?? "",
  tSub: (s) => s ?? "",
  transcriptFor: async () => null,
  hasSubtitles: false,
  subtitleSettings: DEFAULT_SUBTITLE_SETTINGS,
  loading: false,
  ready: true,
  reload: () => {},
};

export function useT(): TranslationCtx {
  // Provider not mounted — an identity implementation, so components that
  // use t() outside the viewer (e.g. editor previews) don't crash.
  return useContext(Ctx) ?? IDENTITY;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEDIA_BASE = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? "").trim();

export function TranslationProvider({
  tour,
  children,
}: {
  tour: Pick<Tour, "id" | "title" | "description">;
  /** Accepted for the existing call sites; the strings are found by the translations themselves, not collected here. */
  scenes?: Pick<Scene, "name" | "description">[];
  hotspots?: Pick<Hotspot, "label" | "info_title" | "info_body" | "pdf_name">[];
  children: React.ReactNode;
}) {
  const [config, setConfig] = useState<StoredConfig | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptRef[]>([]);
  const [ready, setReady] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  // null until the visitor picks one (or the first load picks it for them)
  const [langState, setLangState] = useState<LangCode | null>(null);
  const firstLoad = useRef(true);

  const sourceLang = config?.default_language || "en";
  const availableLanguages = useMemo(() => (config?.available_languages ?? []).filter((l) => l !== sourceLang), [config, sourceLang]);
  const languages = useMemo(() => [sourceLang, ...availableLanguages], [sourceLang, availableLanguages]);
  const subtitleSettings = useMemo(() => resolveSettings(config?.subtitle_settings), [config]);

  // 1. The tour's language settings and which audio has subtitles.
  useEffect(() => {
    if (!UUID.test(tour.id)) {
      // demo / offline tours have no language data
      setReady(true);
      return;
    }
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await languageApi.config(tour.id, ctrl.signal);
        if (ctrl.signal.aborted) return;
        setConfig(res.config);
        setTranscripts(res.transcripts);
        if (firstLoad.current) {
          firstLoad.current = false;
          const offered = [res.config.default_language || "en", ...res.config.available_languages];
          const qp = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("lang") : null;
          let stored: string | null = null;
          try {
            stored = typeof window !== "undefined" ? window.localStorage.getItem("factour:lang") : null;
          } catch {
            /* storage blocked */
          }
          const pick = qp && offered.includes(qp) ? qp : stored && offered.includes(stored) ? stored : detectVisitorLanguage(offered);
          setLangState(offered.includes(pick) ? pick : offered[0]);
        }
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") console.warn("[language] settings not available:", (e as Error)?.message);
      } finally {
        if (!ctrl.signal.aborted) setReady(true);
      }
    })();
    return () => ctrl.abort();
  }, [tour.id, reloadToken]);

  // A language that was removed in the editor must not stay selected.
  const lang: LangCode = langState && (langState === sourceLang || availableLanguages.includes(langState)) ? langState : sourceLang;

  // 2. The strings for the language being viewed. Also needed in the source language
  //    when some audio was spoken in another language (its subtitles are translated into it).
  const needMap = ready && !!config && (lang !== sourceLang || transcripts.some((tr) => tr.language !== lang));
  const [translations, setTranslations] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!needMap || !UUID.test(tour.id)) {
      setTranslations(new Map());
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    languageApi
      .translations(tour.id, lang, ctrl.signal)
      .then((map) => {
        if (!ctrl.signal.aborted) setTranslations(new Map(Object.entries(map)));
      })
      .catch((e) => {
        if ((e as Error)?.name !== "AbortError") console.warn("[language] translations not available:", (e as Error)?.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [needMap, tour.id, lang, reloadToken]);

  const setLang = useCallback(
    (l: LangCode) => {
      setLangState(l);
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem("factour:lang", l);
      } catch {
        /* storage blocked */
      }
      // Reflect in the URL so link-shares carry the language.
      const url = new URL(window.location.href);
      if (l === sourceLang) url.searchParams.delete("lang");
      else url.searchParams.set("lang", l);
      window.history.replaceState({}, "", url.toString());
    },
    [sourceLang]
  );

  const t = useCallback(
    (source: string | null | undefined): string => {
      if (!source) return "";
      if (lang === sourceLang) return source;
      return translations.get(hashText(source)) ?? source;
    },
    [translations, lang, sourceLang]
  );

  const tSub = useCallback(
    (text: string | null | undefined, from: string): string => {
      if (!text) return "";
      if (from === lang) return text;
      return translations.get(hashText(text)) ?? text;
    },
    [translations, lang]
  );

  // 3. Subtitles of one audio file, fetched the first time it plays — and only if it has any.
  const knownKeys = useMemo(() => new Map(transcripts.map((tr) => [tr.key, tr])), [transcripts]);
  const cache = useRef<Map<string, Promise<LoadedTranscript | null>>>(new Map());
  useEffect(() => {
    cache.current = new Map();
  }, [tour.id, reloadToken]);

  const transcriptFor = useCallback(
    (audioUrl: string): Promise<LoadedTranscript | null> => {
      const key = audioKey(audioUrl, { mediaBase: MEDIA_BASE });
      if (!knownKeys.has(key)) return Promise.resolve(null);
      let p = cache.current.get(key);
      if (!p) {
        p = languageApi
          .transcript(tour.id, key)
          .then((tr) => (tr && tr.segments.length > 0 ? { segments: tr.segments, language: tr.language } : null))
          .catch((e) => {
            console.warn("[language] subtitles not available:", (e as Error)?.message);
            cache.current.delete(key); // let the next play try again
            return null;
          });
        cache.current.set(key, p);
      }
      return p;
    },
    [knownKeys, tour.id]
  );

  const hasSubtitles = transcripts.length > 0 && subtitleSettings.enabled;
  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  const value = useMemo<TranslationCtx>(
    () => ({ lang, setLang, sourceLang, languages, availableLanguages, t, tSub, transcriptFor, hasSubtitles, subtitleSettings, loading, ready, reload }),
    [lang, setLang, sourceLang, languages, availableLanguages, t, tSub, transcriptFor, hasSubtitles, subtitleSettings, loading, ready, reload]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
