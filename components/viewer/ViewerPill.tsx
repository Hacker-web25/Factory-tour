"use client";

/**
 * ViewerPill — the single glass control pill that de-clutters the viewer.
 *
 * It replaces the old scattered auto-tour / sound / reset-zoom / language
 * buttons with ONE floating pill (bottom-right by default) that expands
 * upward on hover. When collapsed it's just a discreet round chip; when
 * hovered it fans out into individual actions.
 *
 * Actions surfaced:
 *   • Reset zoom
 *   • Auto-tour play / pause  (only when > 1 scene)
 *   • Language               (only when tour has > 1 language)
 *   • Audio mute / unmute    (only when the tour has audio/subtitles)
 *
 * All buttons use the VPV brand glass style — semi-transparent white with
 * backdrop-blur, navy text, brand-blue hover. Purely presentational: every
 * action comes in as a prop so the parent stays in charge of state.
 */

import { useEffect, useRef, useState } from "react";
import {
  ZoomIn,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Globe2,
  MoreHorizontal,
  Check,
  Maximize2,
  Minimize2,
  Eye,
  EyeOff,
} from "lucide-react";
import { useT } from "@/lib/TranslationContext";
import { langMeta } from "@/lib/i18n";

export type ViewerPillProps = {
  onResetZoom?: () => void;
  autoTour?: {
    playing: boolean;
    onToggle: () => void;
  } | null;
  audio?: {
    muted: boolean;
    onToggle: () => void;
  } | null;
  /** Hide / show the bottom scene-thumbnail strip. Omit if there's no
   *  strip to hide (single-scene tour). */
  stripVisibility?: {
    hidden: boolean;
    onToggle: () => void;
  } | null;
};

export default function ViewerPill({
  onResetZoom,
  autoTour,
  audio,
  stripVisibility,
}: ViewerPillProps) {
  // Fullscreen state is fully self-managed — the pill listens to the
  // document's fullscreen events so the button label stays truthful even
  // if the user hits Esc.
  const [isFs, setIsFs] = useState(
    () =>
      typeof document !== "undefined" &&
      !!document.fullscreenElement
  );
  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const toggleFullscreen = () => {
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen();
      }
    } catch {
      /* silently ignore — some browsers block outside user activation */
    }
  };
  const [open, setOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { lang, setLang, availableLanguages } = useT();

  // Close popovers on outside click.
  useEffect(() => {
    if (!open && !langOpen) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setLangOpen(false);
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, langOpen]);

  const allLangs = Array.from(new Set(["en", ...availableLanguages]));
  const showLang = allLangs.length > 1;
  const current = langMeta(lang);

  return (
    <div
      ref={wrapRef}
      className="absolute bottom-4 right-4 z-30 select-none"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        setOpen(false);
        setLangOpen(false);
      }}
    >
      {/* Expanded action rail — fans out ABOVE the trigger when hovered. */}
      <div
        className="flex flex-col items-end gap-1.5 mb-1.5 transition-all duration-200"
        style={{
          opacity: open ? 1 : 0,
          transform: open ? "translateY(0)" : "translateY(8px)",
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {audio && (
          <ActionBtn
            title={audio.muted ? "Turn sound on" : "Mute sound"}
            onClick={audio.onToggle}
            icon={audio.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            label={audio.muted ? "Sound off" : "Sound"}
            accent={audio.muted}
          />
        )}
        {showLang && (
          <div className="relative">
            <ActionBtn
              title="Change language"
              onClick={() => setLangOpen((v) => !v)}
              icon={<Globe2 size={14} />}
              label={current.nativeName}
              accent={langOpen}
            />
            {langOpen && (
              <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 min-w-[180px] max-h-[280px] overflow-y-auto rounded-xl bg-white/85 backdrop-blur-xl border border-white/60 shadow-[0_12px_40px_-12px_rgba(11,61,145,0.35)] p-1">
                {allLangs.map((code) => {
                  const m = langMeta(code);
                  const active = code === lang;
                  return (
                    <button
                      key={code}
                      onClick={() => {
                        setLang(code);
                        setLangOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-[12px] text-left ${
                        active
                          ? "bg-vpv-blue/15 text-vpv-navy font-semibold"
                          : "text-vpv-ink hover:bg-vpv-tint"
                      }`}
                    >
                      <span>{m.nativeName}</span>
                      {active ? (
                        <Check size={11} className="text-vpv-blue" />
                      ) : (
                        <span className="text-[10px] text-vpv-muted">
                          {m.code.toUpperCase()}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {autoTour && (
          <ActionBtn
            title={autoTour.playing ? "Pause walkthrough" : "Start walkthrough"}
            onClick={autoTour.onToggle}
            icon={
              autoTour.playing ? <Pause size={14} /> : <Play size={14} />
            }
            label={autoTour.playing ? "Pause" : "Auto-tour"}
            accent={autoTour.playing}
          />
        )}
        {onResetZoom && (
          <ActionBtn
            title="Reset zoom"
            onClick={onResetZoom}
            icon={<ZoomIn size={14} />}
            label="Reset zoom"
          />
        )}
        {stripVisibility && (
          <ActionBtn
            title={
              stripVisibility.hidden
                ? "Show scene strip"
                : "Hide scene strip"
            }
            onClick={stripVisibility.onToggle}
            icon={
              stripVisibility.hidden ? (
                <Eye size={14} />
              ) : (
                <EyeOff size={14} />
              )
            }
            label={stripVisibility.hidden ? "Show strip" : "Hide strip"}
            accent={stripVisibility.hidden}
          />
        )}
        <ActionBtn
          title={isFs ? "Exit fullscreen" : "Enter fullscreen"}
          onClick={toggleFullscreen}
          icon={
            isFs ? <Minimize2 size={14} /> : <Maximize2 size={14} />
          }
          label={isFs ? "Exit fullscreen" : "Fullscreen"}
          accent={isFs}
        />
      </div>

      {/* The trigger chip — always visible. Rotates the dots subtly when
          the pill is open so users get feedback that hover is captured. */}
      <button
        aria-label="Viewer controls"
        className="h-10 w-10 rounded-full grid place-items-center bg-white/85 hover:bg-white border border-white/70 backdrop-blur-xl text-vpv-navy shadow-[0_10px_30px_-10px_rgba(11,61,145,0.4)] transition-transform"
        style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
      >
        <MoreHorizontal size={16} />
      </button>
    </div>
  );
}

function ActionBtn({
  title,
  onClick,
  icon,
  label,
  accent,
}: {
  title: string;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-full border backdrop-blur-xl text-[12px] font-medium transition-colors ${
        accent
          ? "bg-vpv-navy text-white border-vpv-navy"
          : "bg-white/85 hover:bg-white text-vpv-navy border-white/70"
      } shadow-[0_8px_22px_-10px_rgba(11,61,145,0.35)]`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
