"use client";

/**
 * SubtitleOverlay — shows the subtitles of whatever audio/video is playing,
 * in the language the visitor picked.
 *
 * Multiple sources can play at once (ambient audio + a video popup, say).
 * Rule: the last URL that fired a `factour:audio-time` event wins. When a
 * source stops firing, whichever one still fires takes over on its next tick.
 *
 * Each player fires the event on timeupdate:
 *     window.dispatchEvent(new CustomEvent("factour:audio-time", {
 *       detail: { url, currentTime }
 *     }))
 *
 * Everything it needs comes from useT(): the subtitle look, the lines of an audio
 * file (fetched the first time it plays, and only if it has any) and the
 * translation of each line. A line with no translation yet is shown in the
 * language it was spoken in, never blank and never an error message.
 */

import { useEffect, useRef, useState } from "react";
import { useT, type LoadedTranscript } from "@/lib/TranslationContext";
import { lineAt } from "@/lib/language/segments";
import { backgroundCss } from "@/lib/language/settings";

// How long the overlay stays "alive" after the last time event: long enough to
// survive a brief pause, short enough that it goes away when the player closes.
const ACTIVITY_WINDOW_MS = 4000;

export default function SubtitleOverlay() {
  const { lang, tSub, transcriptFor, subtitleSettings: s } = useT();

  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<LoadedTranscript | null>(null);
  const [index, setIndex] = useState(-1);

  // Refs, so a time update never re-renders: React state changes only when the visible line changes.
  const transcriptRef = useRef<LoadedTranscript | null>(null);
  const activeUrlRef = useRef<string | null>(null);
  const lastEmitRef = useRef(0);
  const timeRef = useRef(0);

  // Listen for time events once for the overlay's whole life.
  useEffect(() => {
    function onTime(e: Event) {
      const d = (e as CustomEvent).detail as { url?: string; currentTime?: number } | undefined;
      if (!d || !d.url) return;
      lastEmitRef.current = Date.now();
      if (activeUrlRef.current !== d.url) {
        activeUrlRef.current = d.url;
        transcriptRef.current = null; // the old file's lines must not show against the new file's clock
        setTranscript(null);
        setIndex(-1);
        setActiveUrl(d.url);
      }
      if (typeof d.currentTime === "number" && Number.isFinite(d.currentTime)) {
        timeRef.current = d.currentTime;
        const tr = transcriptRef.current;
        if (tr) {
          const i = lineAt(tr.segments, d.currentTime);
          setIndex((prev) => (prev === i ? prev : i));
        }
      }
    }
    window.addEventListener("factour:audio-time", onTime as EventListener);
    return () => window.removeEventListener("factour:audio-time", onTime as EventListener);
  }, []);

  // Load the lines of the file that is playing.
  useEffect(() => {
    if (!activeUrl) return;
    let cancelled = false;
    transcriptFor(activeUrl).then((tr) => {
      if (cancelled || activeUrlRef.current !== activeUrl) return;
      transcriptRef.current = tr;
      setTranscript(tr);
      setIndex(tr ? lineAt(tr.segments, timeRef.current) : -1);
    });
    return () => {
      cancelled = true;
    };
  }, [activeUrl, transcriptFor]);

  // Playback stopped: do not leave the last line on screen.
  useEffect(() => {
    if (!activeUrl) return;
    const iv = window.setInterval(() => {
      if (Date.now() - lastEmitRef.current > ACTIVITY_WINDOW_MS) {
        activeUrlRef.current = null;
        transcriptRef.current = null;
        setActiveUrl(null);
        setTranscript(null);
        setIndex(-1);
      }
    }, 500);
    return () => window.clearInterval(iv);
  }, [activeUrl]);

  const line = transcript && index >= 0 ? transcript.segments[index] : null;
  if (!s.enabled || !transcript || !line) return null;

  const posStyle: React.CSSProperties = (() => {
    switch (s.position) {
      case "top-center":
        return { top: 24, left: "50%", transform: "translateX(-50%)", textAlign: "center" };
      case "bottom-left":
        return { bottom: 100, left: 24, textAlign: "left" };
      case "bottom-right":
        return { bottom: 100, right: 24, textAlign: "right" };
      default:
        return { bottom: 100, left: "50%", transform: "translateX(-50%)", textAlign: "center" };
    }
  })();

  return (
    <div
      role="status"
      aria-live="off"
      lang={lang}
      style={{
        position: "absolute",
        zIndex: 300,
        maxWidth: `${s.maxWidthPct}%`,
        padding: `${Math.round(s.fontSize * 0.35)}px ${Math.round(s.fontSize * 0.7)}px`,
        background: backgroundCss(s),
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
      {tSub(line.text, transcript.language)}
    </div>
  );
}
