"use client";

/**
 * TranslationContext
 * ------------------
 * Wrap the viewer with <TranslationProvider tour scenes hotspots /> and
 * every child can call `useT()` to translate a string synchronously.
 *
 * Design goals:
 * - Sync `t(str)` — safe in React render paths.
 * - Precompute all source-string hashes on mount so lookups are O(1).
 * - Ship one Supabase query per language change; cache in a Map.
 * - Fall back to the source string when a translation is missing.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Hotspot, Scene, Tour } from "@/lib/types";
import {
  collectTourTexts,
  detectVisitorLanguage,
  hashOfSync,
  loadTranslations,
  precomputeHashes,
  translateAndCache,
  type LangCode,
} from "@/lib/i18n";

type TranslationCtx = {
  /** Currently active language. Always non-null. */
  lang: LangCode;
  /** Change language — persists in URL (?lang=xx) so link-sharing works. */
  setLang: (l: LangCode) => void;
  /** Languages the tour has been translated into (source is implicit). */
  availableLanguages: LangCode[];
  /** Translate a string synchronously. Returns source on miss. */
  t: (source: string | null | undefined) => string;
  /** True while translations are being fetched for the current lang. */
  loading: boolean;
};

const Ctx = createContext<TranslationCtx | null>(null);

export function useT(): TranslationCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Provider not mounted — return an identity implementation so components
    // that use t() outside the viewer (e.g. editor previews) don't crash.
    return {
      lang: "en",
      setLang: () => {},
      availableLanguages: [],
      t: (s) => s ?? "",
      loading: false,
    };
  }
  return ctx;
}

export function TranslationProvider({
  tour,
  scenes,
  hotspots,
  children,
}: {
  tour: Pick<Tour, "id" | "title" | "description"> & {
    available_languages?: string[] | null;
    default_language?: string | null;
  };
  scenes: Pick<Scene, "name">[];
  hotspots: Pick<Hotspot, "label" | "info_title" | "info_body" | "pdf_name">[];
  children: React.ReactNode;
}) {
  const sourceLang = (tour.default_language as LangCode) || "en";
  const availableLanguages = useMemo(
    () => (tour.available_languages as LangCode[] | null) ?? [],
    [tour.available_languages]
  );

  // Pick initial language: ?lang=xx > localStorage > auto-detect > source
  const [lang, setLangState] = useState<LangCode>(() => {
    if (typeof window === "undefined") return sourceLang;
    const qp = new URLSearchParams(window.location.search).get("lang");
    if (qp && (qp === sourceLang || availableLanguages.includes(qp))) return qp;
    const stored = window.localStorage.getItem("factour:lang");
    if (stored && (stored === sourceLang || availableLanguages.includes(stored))) {
      return stored;
    }
    return detectVisitorLanguage([sourceLang, ...availableLanguages]);
  });

  const [translations, setTranslations] = useState<Map<string, string>>(
    new Map()
  );
  const [loading, setLoading] = useState(false);

  // Precompute hashes for every source string once. Subsequent renders
  // read them synchronously via hashOfSync.
  const allTexts = useMemo(
    () => collectTourTexts(tour, scenes, hotspots),
    [tour, scenes, hotspots]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await precomputeHashes(allTexts);
      if (cancelled) return;
      if (lang === sourceLang) {
        setTranslations(new Map());
        return;
      }
      setLoading(true);
      const map = await loadTranslations(allTexts, lang);
      if (cancelled) return;
      setTranslations(map);
      setLoading(false);

      // Background auto-translate: whenever the owner adds or edits a
      // string AFTER their last translation pass, the cache is missing
      // an entry for the new hash. Instead of forcing them to click the
      // ↻ button in the editor, we detect gaps here and quietly fill
      // them in via MyMemory, then refresh the map so the strings snap
      // from source-language fallback to the real translation. Users
      // may see one flash of English → target on first view.
      const missing = allTexts.filter((tx) => {
        const h = hashOfSync(tx);
        return !!h && !map.has(h);
      });
      if (missing.length > 0 && tour.id) {
        try {
          await translateAndCache({
            tourId: tour.id,
            sourceTexts: missing,
            targetLang: lang,
            sourceLang,
          });
          if (cancelled) return;
          const refreshed = await loadTranslations(allTexts, lang);
          if (!cancelled) setTranslations(refreshed);
        } catch (e) {
          console.warn("[i18n] background auto-translate failed:", e);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allTexts, lang, sourceLang, tour.id]);

  const setLang = useCallback(
    (l: LangCode) => {
      setLangState(l);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("factour:lang", l);
        // Reflect in URL so link-shares carry the language.
        const url = new URL(window.location.href);
        if (l === sourceLang) url.searchParams.delete("lang");
        else url.searchParams.set("lang", l);
        window.history.replaceState({}, "", url.toString());
      }
    },
    [sourceLang]
  );

  const t = useCallback(
    (source: string | null | undefined): string => {
      if (!source) return "";
      if (lang === sourceLang) return source;
      const h = hashOfSync(source);
      if (!h) return source;
      return translations.get(h) ?? source;
    },
    [translations, lang, sourceLang]
  );

  return (
    <Ctx.Provider
      value={{ lang, setLang, availableLanguages, t, loading }}
    >
      {children}
    </Ctx.Provider>
  );
}
