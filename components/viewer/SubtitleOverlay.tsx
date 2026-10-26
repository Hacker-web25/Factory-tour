"use client";

/**
 * SubtitleOverlay — displays live-translated subtitles for whatever
 * audio/video source is currently playing.
 *
 * Multiple sources can be playing at once (ambient audio + a video
 * popup, for instance). Rule: last URL that dispatched a
 * `factour:audio-time` event within the recent-activity window wins.
 * Cheap and correct — when a source stops emitting, whichever source
 * is still emitting naturally takes over next tick.
 *
 * Each player is responsible for firing the event on timeupdate:
 *     window.dispatchEvent(new CustomEvent("factour:audio-time", {
 *       detail: { url, currentTime }
 *     }))
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/TranslationContext";
import {
  loadTranslations,
  precomputeHashes,
  hashOfSync,
  translateAndCache,
} from "@/lib/i18n";
import { getCachedTranscript, type Segment } from "@/lib/whisperWorker";

type SubtitleSettings = {
  enabled: boolean;
  position: "bottom-center" | "top-center" | "bottom-left" | "bottom-right";
  fontSize: number;
  opacity: number;
  bgColor: string;
  textColor: string;
  maxWidthPct: number;
};

const DEFAULT_SETTINGS: SubtitleSettings = {
  enabled: true,
  position: "bottom-center",
  fontSize: 20,
  opacity: 0.85,
  bgColor: "rgba(0,0,0,0.7)",
  textColor: "#ffffff",
  maxWidthPct: 80,
};

// How long we keep the overlay "alive" after the last time event.
// Big enough to survive brief pauses, small enough that the subtitle
// eventually goes away when the user closes the player.
const ACTIVITY_WINDOW_MS = 4000;

export default function SubtitleOverlay({
  settings,
  tourId,
}: {
  settings?: Partial<SubtitleSettings> | null;
  tourId?: string;
}) {
  const s: SubtitleSettings = { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
  const { lang } = useT();
  // SubtitleOverlay maintains its OWN translation map (keyed by SHA-1
  // of the source segment text). The shared TranslationContext only
  // covers hotspot/scene text — subtitle segments come from Whisper
  // and are not in that map, so useT()'s t() would fall through to
  // source. This local map fixes that.
  const [segmentTranslations, setSegmentTranslations] = useState<
    Map<string, string>
  >(new Map());

  // We store the current playhead in a REF (not state) so time updates
  // don't trigger React re-renders. A separate lightweight loop reads
  // the ref, finds the active segment, and only calls setActiveSegment
  // when the segment actually changes. That takes DOM mutations from
  // ~5/sec down to ~1 every few seconds, which stops the browser
  // extension from producing thousands of spurious errors and improves
  // performance on the panorama Canvas.
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [activeSegment, setActiveSegment] = useState<Segment | null>(null);
  const currentTimeRef = useRef(0);
  const lastEmitRef = useRef<{ url: string; ts: number } | null>(null);
  const activeUrlRef = useRef<string | null>(null);

  // Transcript cache — one entry per URL we've seen this session.
  const transcriptCache = useRef<
    Map<string, { segments: Segment[]; language: string }>
  >(new Map());
  const [_bumpVersion, setBumpVersion] = useState(0);

  // Listen for audio time events globally.
  // NOTE: no deps — we want the listener attached exactly ONCE across
  // the SubtitleOverlay's lifetime. Previously deps=[activeUrl] caused
  // the listener to re-attach on every URL change, which occasionally
  // dropped in-flight events and made subtitles vanish.
  useEffect(() => {
    async function onTime(e: Event) {
      const detail = (e as CustomEvent).detail as
        | { url?: string; currentTime?: number }
        | undefined;
      if (!detail || !detail.url) return;
      lastEmitRef.current = { url: detail.url, ts: Date.now() };
      // Read latest active URL from a ref rather than closure so we
      // can compare correctly even after a state update in the same tick.
      if (activeUrlRef.current !== detail.url) {
        activeUrlRef.current = detail.url;
        setActiveUrl(detail.url);
        if (!transcriptCache.current.has(detail.url)) {
          try {
            const r = await getCachedTranscript(detail.url);
            if (r) {
              console.log(
                "[subtitles] transcript loaded",
                detail.url,
                r.segments.length,
                "segments"
              );
              // Log every segment so we can see the actual timestamps
              // Whisper produced. If they look wrong (e.g. NaN, negative,
              // or end < start) the subtitle lookup will always miss.
              for (const seg of r.segments) {
                console.log(
                  "  seg",
                  `[${seg.start?.toFixed(2)}-${seg.end?.toFixed(2)}]`,
                  JSON.stringify(seg.text)
                );
              }
              transcriptCache.current.set(detail.url, r);
              setBumpVersion((v) => v + 1);
            } else {
              console.warn("[subtitles] no transcript for", detail.url);
            }
          } catch (err) {
            console.warn("[subtitles] transcript fetch failed", err);
          }
        }
      }
      if (typeof detail.currentTime === "number") {
        // Ref-only update — no re-render. The segment-picker loop
        // below reads this and only touches React state when the
        // active segment actually changes.
        currentTimeRef.current = detail.currentTime;
      }
    }
    window.addEventListener("factour:audio-time", onTime as EventListener);
    return () =>
      window.removeEventListener(
        "factour:audio-time",
        onTime as EventListener
      );
  }, []);

  // If no events for a while, drop the active URL so no stale subtitle
  // is left on screen after audio pauses.
  useEffect(() => {
    if (!activeUrl) return;
    const iv = window.setInterval(() => {
      const last = lastEmitRef.current;
      if (!last || Date.now() - last.ts > ACTIVITY_WINDOW_MS * 3) {
        setActiveUrl(null);
      }
    }, 300);
    return () => window.clearInterval(iv);
  }, [activeUrl]);

  const transcript = activeUrl
    ? transcriptCache.current.get(activeUrl) ?? null
    : null;

  // Fetch translations for every segment text into the local map.
  // Runs when transcript arrives OR viewer switches language. If
  // missing rows are found we translate them via MyMemory and refresh.
  useEffect(() => {
    let cancelled = false;
    if (!transcript) {
      setSegmentTranslations(new Map());
      return;
    }
    const sourceLang = transcript.language ?? "en";
    if (lang === sourceLang) {
      setSegmentTranslations(new Map());
      return;
    }
    (async () => {
      const texts = transcript.segments.map((seg) => seg.text).filter(Boolean);
      await precomputeHashes(texts);
      if (cancelled) return;
      const cached = await loadTranslations(texts, lang);
      if (cancelled) return;
      setSegmentTranslations(cached);
      const missing = texts.filter((tx) => {
        const h = hashOfSync(tx);
        return !!h && !cached.has(h);
      });
      if (missing.length > 0 && tourId) {
        try {
          await translateAndCache({
            tourId,
            sourceTexts: missing,
            targetLang: lang,
            sourceLang,
          });
          if (cancelled) return;
          const refreshed = await loadTranslations(texts, lang);
          if (!cancelled) setSegmentTranslations(refreshed);
        } catch (e) {
          console.warn("[subtitles] auto-translate failed", e);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript, lang, tourId]);

  // Segment picker loop — runs 4×/sec, only calls setActiveSegment
  // when the answer is DIFFERENT from what's already showing. This
  // guarantees we never touch the DOM unless the visible subtitle
  // needs to change, dramatically cutting mutation traffic.
  useEffect(() => {
    if (!transcript || transcript.segments.length === 0) return;
    const iv = window.setInterval(() => {
      const currentTime = currentTimeRef.current;
      // First pass — strict range match.
      let next: Segment | null = null;
      for (const seg of transcript.segments) {
        if (currentTime >= seg.start && currentTime <= seg.end + 0.4) {
          next = seg;
          break;
        }
      }
      // Fallback — latest segment that started. Grace window is
      // dynamic: if there's a NEXT segment, only bridge until it
      // starts (small gap). If we're past the last segment, keep it
      // pinned for a big window (30s) so trailing audio still shows
      // the closing subtitle instead of going blank.
      if (!next) {
        let latestIdx = -1;
        for (let i = 0; i < transcript.segments.length; i++) {
          if (transcript.segments[i].start <= currentTime + 0.05) {
            latestIdx = i;
          } else {
            break;
          }
        }
        if (latestIdx >= 0) {
          const latest = transcript.segments[latestIdx];
          const nextSeg = transcript.segments[latestIdx + 1];
          const grace = nextSeg
            ? nextSeg.start - latest.end // small — until next starts
            : 30; // huge — no next segment, ride it to the end of audio
          if (currentTime <= latest.end + Math.max(0.5, grace)) {
            next = latest;
          }
        }
      }
      setActiveSegment((prev) => (prev === next ? prev : next));
    }, 250);
    return () => window.clearInterval(iv);
  }, [transcript]);
  const active = activeSegment;

  if (!s.enabled || !active) return null;

  const posStyle: React.CSSProperties = (() => {
    switch (s.position) {
      case "top-center":
        return {
          top: 24,
          left: "50%",
          transform: "translateX(-50%)",
          textAlign: "center",
        };
      case "bottom-left":
        return { bottom: 100, left: 24, textAlign: "left" };
      case "bottom-right":
        return { bottom: 100, right: 24, textAlign: "right" };
      default:
        return {
          bottom: 100,
          left: "50%",
          transform: "translateX(-50%)",
          textAlign: "center",
        };
    }
  })();

  // Use the local segment-translations map. Falls back to the source
  // text if no translation is cached yet (auto-translate happens in
  // background; result appears on next render after refresh).
  //
  // Also defensively reject any cached "translation" that's actually a
  // MyMemory API error string — earlier builds stored those verbatim
  // when the source_lang was invalid ('auto'), and they'd otherwise
  // render as gibberish subtitles until the cache row is wiped.
  const sourceLang = transcript?.language ?? "en";
  const isApiError = (s: string) =>
    /INVALID (SOURCE|TARGET) LANGUAGE/i.test(s) ||
    /IS AN INVALID/i.test(s);
  const cachedT = segmentTranslations.get(hashOfSync(active.text));
  const translated =
    lang === sourceLang || !cachedT || isApiError(cachedT)
      ? active.text
      : cachedT;

  return (
    <div
      style={{
        position: "absolute",
        zIndex: 300,
        maxWidth: `${s.maxWidthPct}%`,
        padding: `${Math.round(s.fontSize * 0.35)}px ${Math.round(
          s.fontSize * 0.7
        )}px`,
        background: s.bgColor,
        color: s.textColor,
        fontSize: s.fontSize,
        lineHeight: 1.4,
        borderRadius: 8,
        pointerEvents: "none",
        fontWeight: 500,
        boxShadow: "0 2px 12px rgba(0,0,0,0.35)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        ...posStyle,
      }}
    >
      {translated}
    </div>
  );
}
