"use client";

/**
 * AI Analysis drawer (ULTRA) — opens from a presentation in the MIS list.
 *
 *   Recording      the meeting audio (always visible when it exists)
 *   Conversation   "Transcribe" → speaker-separated dialogue,
 *                  Customer vs Sales Person, click a line to jump the audio
 *   AI analysis    coaching report: summary, score per criterion, what the
 *                  customer wants / is interested in / worried about, what
 *                  went well / wrong, missed points, next actions
 *   Tour journey   which plant areas were shown, for how long, in order
 *
 * Heavy lifting runs server-side in /api/ai/transcribe and /api/ai/analyze.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// AlertTriangle is used by the ErrorBanner — kept named with the rest below.
import {
  X,
  Sparkles,
  Lock,
  Loader2,
  Mic,
  MessageSquare,
  Map as MapIcon,
  MapPin,
  CalendarDays,
  Clock,
  User,
  RefreshCw,
  ArrowLeftRight,
  ThumbsUp,
  ThumbsDown,
  Target,
  AlertTriangle,
  Lightbulb,
  ListChecks,
  Flame,
  Copy,
  Check,
  Quote,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  AiRequestError,
  requestAnalysis,
  requestTranscript,
  saveSpeakerMap,
} from "@/lib/presentationAi";
import {
  computeMetrics,
  guessSpeakerMap,
  scoreBand,
  type Dialogue,
  type PresentationAiReport,
  type SpeakerMap,
  type SpeakerRole,
} from "@/lib/ai/presentationAiTypes";
import type { TeamOverview } from "@/lib/salesAnalytics";
import type { PresentationRow } from "@/components/dashboard/mis/presentationRows";
import { fmtDuration } from "@/components/dashboard/mis/PresentationsList";

type Tab = "conversation" | "analysis" | "journey";

const BTN_AI =
  "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 shadow-sm hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed";

export type AiRowUpdate = Partial<Pick<PresentationRow, "aiScore" | "hasDialogue" | "aiStatus">>;

export default function AiAnalysisDrawer({
  row,
  thumbnail,
  clientLabel,
  plan,
  overview,
  onClose,
  onUpdate,
}: {
  row: PresentationRow;
  thumbnail: string | null;
  clientLabel: string | null;
  plan: "pro" | "ultra";
  overview: TeamOverview;
  onClose: () => void;
  onUpdate: (sessionId: string, patch: AiRowUpdate) => void;
}) {
  const [tab, setTab] = useState<Tab>("conversation");
  const [loading, setLoading] = useState(true);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [dialogue, setDialogue] = useState<Dialogue | null>(null);
  const [speakerMap, setSpeakerMap] = useState<SpeakerMap>({});
  const [report, setReport] = useState<PresentationAiReport | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorHint, setErrorHint] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const aliveRef = useRef(true);

  const locked = plan !== "ultra";

  /* ---- Load the saved AI state for this session ---------------------- */
  useEffect(() => {
    aliveRef.current = true;
    (async () => {
      const { data } = await supabase
        .from("presentation_sessions")
        .select("audio_path, ai_transcript_status, ai_dialogue, ai_speaker_map, ai_analysis")
        .eq("session_id", row.sessionId)
        .maybeSingle();
      if (!aliveRef.current) return;
      const r = (data ?? {}) as {
        audio_path?: string | null;
        ai_transcript_status?: string | null;
        ai_dialogue?: Dialogue | null;
        ai_speaker_map?: SpeakerMap | null;
        ai_analysis?: PresentationAiReport | null;
      };
      const path = r.audio_path ?? row.audioPath;
      if (path) setAudioUrl(await recordingSrc(path));
      if (r.ai_dialogue?.turns?.length) {
        setDialogue(r.ai_dialogue);
        setSpeakerMap(r.ai_speaker_map ?? guessSpeakerMap(r.ai_dialogue.turns));
      }
      if (r.ai_analysis) {
        setReport(r.ai_analysis);
        setTab("analysis");
      }
      setLoading(false);
    })();
    return () => {
      aliveRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.sessionId]);

  /* ---- Esc closes, page behind doesn't scroll ------------------------ */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  /* ---- Elapsed timer while a job runs -------------------------------- */
  useEffect(() => {
    if (!transcribing && !analyzing) return;
    setElapsed(0);
    const t = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [transcribing, analyzing]);

  /* ---- Transcribe (synchronous — Gemini or heuristic) ---------------- */
  const startTranscribe = useCallback(
    async (force: boolean) => {
      setError(null);
      setErrorHint(null);
      setTranscribing(true);
      onUpdate(row.sessionId, { aiStatus: "processing" });
      try {
        const res = await requestTranscript(row.sessionId, force);
        if (!aliveRef.current) return;
        setDialogue(res.dialogue);
        setSpeakerMap(res.speakerMap);
        if (res.notice) setNotice(res.notice);
        if (force) setReport(null);
        onUpdate(row.sessionId, {
          aiStatus: "completed",
          hasDialogue: true,
          ...(force ? { aiScore: null } : {}),
        });
      } catch (e) {
        if (!aliveRef.current) return;
        setError(messageOf(e));
        setErrorHint(hintOf(e));
        onUpdate(row.sessionId, { aiStatus: "error" });
      } finally {
        if (aliveRef.current) setTranscribing(false);
      }
    },
    [row.sessionId, onUpdate]
  );

  /* ---- Analyze -------------------------------------------------------- */
  async function startAnalyze(force: boolean) {
    setError(null);
    setErrorHint(null);
    setAnalyzing(true);
    try {
      const res = await requestAnalysis(row.sessionId, force);
      if (!aliveRef.current) return;
      setReport(res.report);
      if (res.speakerMap) setSpeakerMap(res.speakerMap);
      if (res.notice) setNotice(res.notice);
      onUpdate(row.sessionId, { aiScore: res.report.overall_score });
      setTab("analysis");
    } catch (e) {
      if (aliveRef.current) {
        setError(messageOf(e));
        setErrorHint(hintOf(e));
      }
    } finally {
      if (aliveRef.current) setAnalyzing(false);
    }
  }

  function dismissNotice() {
    setNotice(null);
  }
  function dismissError() {
    setError(null);
    setErrorHint(null);
  }

  /* ---- Speaker role correction --------------------------------------- */
  async function setRole(label: string, role: SpeakerRole) {
    const next: SpeakerMap = { ...speakerMap, [label]: role };
    // With two speakers, flipping one flips the other.
    const labels = Object.keys(next);
    if (labels.length === 2 && role === "salesperson") {
      for (const l of labels) if (l !== label) next[l] = "customer";
    }
    if (labels.length === 2 && role === "customer") {
      for (const l of labels) if (l !== label) next[l] = "salesperson";
    }
    setSpeakerMap(next);
    const nextReport =
      report && dialogue ? { ...report, metrics: computeMetrics(dialogue.turns, next) } : report;
    if (nextReport !== report) setReport(nextReport);
    try {
      await saveSpeakerMap(row.sessionId, next, nextReport);
    } catch (e) {
      setError(messageOf(e));
    }
  }

  function seek(ms: number) {
    const a = audioRef.current;
    if (!a || !ms) return;
    a.currentTime = ms / 1000;
    a.play().catch(() => {});
  }

  const journey = useMemo(() => buildJourney(row.sessionId, overview), [row.sessionId, overview]);
  const recorded = !!row.audioPath || row.hasTranscript;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="AI analysis">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />

      <div className="relative h-full w-full max-w-3xl bg-[#f8fafc] shadow-2xl flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-5 py-4">
          <div className="flex items-start gap-4">
            <div className="hidden sm:block w-28 h-16 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0">
              {thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbnail} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10.5px] uppercase tracking-wider font-semibold text-violet-600 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> AI meeting analysis
              </div>
              <h2 className="text-lg font-semibold text-slate-900 truncate">{row.tourTitle}</h2>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-slate-500">
                <span className="flex items-center gap-1"><User className="w-3 h-3" />{row.presenterName}</span>
                <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />{fmtWhen(row.startMs)}</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{fmtDuration(row.durationSec)}</span>
                {(row.place || row.country) && (
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{row.place || row.country}</span>
                )}
                {clientLabel && <span>for <span className="font-medium text-slate-700">{clientLabel}</span></span>}
              </div>
            </div>
            {report && <ScorePill score={report.overall_score} />}
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>

          {audioUrl && (
            <div className="mt-3 flex items-center gap-2">
              <Mic className="w-4 h-4 text-slate-400 flex-shrink-0" />
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio ref={audioRef} src={audioUrl} controls preload="metadata" className="w-full h-9" />
            </div>
          )}

          <nav className="mt-3 flex gap-1 -mb-4" role="tablist">
            {(
              [
                ["conversation", "Conversation", MessageSquare],
                ["analysis", "AI analysis", Sparkles],
                ["journey", "Tour journey", MapIcon],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-medium border-b-2 transition-colors ${
                  tab === key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </nav>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-5">
          {error && (
            <ErrorBanner message={error} hint={errorHint} onDismiss={dismissError} />
          )}
          {!error && notice && (
            <NoticeBanner message={notice} onDismiss={dismissNotice} />
          )}

          {loading ? (
            <div className="grid place-items-center py-24 text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : tab === "journey" ? (
            <JourneyView journey={journey} />
          ) : locked ? (
            <UltraUpsell />
          ) : tab === "conversation" ? (
            <ConversationView
              recorded={recorded}
              hasAudio={!!row.audioPath}
              dialogue={dialogue}
              speakerMap={speakerMap}
              transcribing={transcribing}
              elapsed={elapsed}
              onTranscribe={() => startTranscribe(false)}
              onRetranscribe={() => startTranscribe(true)}
              onSetRole={setRole}
              onSeek={seek}
              onAnalyze={() => startAnalyze(false)}
              hasReport={!!report}
              analyzing={analyzing}
            />
          ) : (
            <AnalysisView
              dialogue={dialogue}
              report={report}
              analyzing={analyzing}
              transcribing={transcribing}
              recorded={recorded}
              elapsed={elapsed}
              onTranscribe={() => { setTab("conversation"); startTranscribe(false); }}
              onAnalyze={() => startAnalyze(false)}
              onReanalyze={() => startAnalyze(true)}
              meta={{ presenter: row.presenterName, tour: row.tourTitle, when: fmtWhen(row.startMs) }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ====================================================================== */
/* Conversation                                                            */
/* ====================================================================== */

function ConversationView(props: {
  recorded: boolean;
  hasAudio: boolean;
  dialogue: Dialogue | null;
  speakerMap: SpeakerMap;
  transcribing: boolean;
  elapsed: number;
  onTranscribe: () => void;
  onRetranscribe: () => void;
  onSetRole: (label: string, role: SpeakerRole) => void;
  onSeek: (ms: number) => void;
  onAnalyze: () => void;
  hasReport: boolean;
  analyzing: boolean;
}) {
  const { dialogue, speakerMap } = props;

  if (props.transcribing) {
    return (
      <Working
        title="Splitting the conversation…"
        body="Labelling who said what — Customer vs Sales Person. Usually under 15 seconds."
        elapsed={props.elapsed}
      />
    );
  }

  if (!dialogue) {
    if (!props.recorded) {
      return (
        <Empty
          icon={<Mic className="w-5 h-5" />}
          title="This meeting wasn't recorded"
          body="Turn on Auto-record in Team settings. Every presentation after that is recorded on the salesperson's device and can be analysed here."
        />
      );
    }
    return (
      <Empty
        icon={<MessageSquare className="w-5 h-5" />}
        title="Split the conversation"
        body="We'll split the transcript into Customer and Sales Person turns so you can see who said what. Uses AI when enabled, with a rule-based fallback otherwise — either way, it's free and runs instantly."
        action={
          <button onClick={props.onTranscribe} className={BTN_AI}>
            <Sparkles className="w-4 h-4" /> Split conversation
          </button>
        }
      />
    );
  }

  const labels = Array.from(new Set(dialogue.turns.map((t) => t.speaker)));
  const metrics = computeMetrics(dialogue.turns, speakerMap);
  const customerIdx = new Map<string, number>();
  labels.filter((l) => speakerMap[l] !== "salesperson").forEach((l, i) => customerIdx.set(l, i + 1));
  const multiCustomer = customerIdx.size > 1;
  const nameFor = (label: string) =>
    speakerMap[label] === "salesperson"
      ? "Sales Person"
      : multiCustomer ? `Customer ${customerIdx.get(label)}` : "Customer";

  return (
    <div>
      {/* Talk ratio + controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between text-[11.5px] font-medium mb-1.5">
          <span className="text-blue-700">Sales Person {metrics.sales_talk_pct}%</span>
          <span className="text-slate-500">talk time</span>
          <span className="text-amber-700">Customer {metrics.customer_talk_pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-amber-200 overflow-hidden">
          <div className="h-full bg-blue-500" style={{ width: `${metrics.sales_talk_pct}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11.5px] text-slate-500">
          <span>{metrics.turns} turns · {metrics.sales_questions} questions asked by sales · {metrics.customer_questions} by customer</span>
          {dialogue.language && <span className="px-1.5 py-0.5 rounded bg-slate-100 uppercase">{dialogue.language}</span>}
          <SourceChip source={dialogue.source} />
        </div>

        {labels.length >= 2 && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2 text-[11.5px]">
            <span className="text-slate-500 flex items-center gap-1"><ArrowLeftRight className="w-3 h-3" /> Wrong labels?</span>
            {labels.map((l) => (
              <label key={l} className="flex items-center gap-1 text-slate-600">
                Voice {l}:
                <select
                  value={speakerMap[l] ?? "customer"}
                  onChange={(e) => props.onSetRole(l, e.target.value as SpeakerRole)}
                  className="border border-slate-200 rounded px-1 py-0.5 bg-white"
                >
                  <option value="salesperson">Sales Person</option>
                  <option value="customer">Customer</option>
                </select>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Dialogue */}
      <ol className="space-y-2.5">
        {dialogue.turns.map((t, i) => {
          const sales = speakerMap[t.speaker] === "salesperson";
          return (
            <li key={i} className={`flex ${sales ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 ${sales ? "bg-blue-600 text-white rounded-br-md" : "bg-white border border-slate-200 text-slate-800 rounded-bl-md"}`}>
                <div className={`flex items-center gap-2 text-[10.5px] font-semibold mb-0.5 ${sales ? "text-blue-100" : "text-amber-700"}`}>
                  {nameFor(t.speaker)}
                  {t.start_ms > 0 || i === 0 ? (
                    <button
                      onClick={() => props.onSeek(t.start_ms)}
                      className={`font-normal tabular-nums hover:underline ${sales ? "text-blue-200" : "text-slate-400"}`}
                      title="Play from here"
                    >
                      {fmtTs(t.start_ms)}
                    </button>
                  ) : null}
                </div>
                <div className="text-[13px] leading-relaxed whitespace-pre-wrap">{t.text}</div>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <button onClick={props.onRetranscribe} className="text-[11.5px] text-slate-500 hover:text-slate-800 flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Transcribe again
        </button>
        {!props.hasReport && (
          <button onClick={props.onAnalyze} disabled={props.analyzing} className={BTN_AI}>
            {props.analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {props.analyzing ? "Analysing…" : "Run AI analysis"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ====================================================================== */
/* Analysis report                                                         */
/* ====================================================================== */

function AnalysisView(props: {
  dialogue: Dialogue | null;
  report: PresentationAiReport | null;
  analyzing: boolean;
  transcribing: boolean;
  recorded: boolean;
  elapsed: number;
  onTranscribe: () => void;
  onAnalyze: () => void;
  onReanalyze: () => void;
  meta: { presenter: string; tour: string; when: string };
}) {
  const { report } = props;

  if (props.analyzing) {
    return (
      <Working
        title="Analysing the meeting…"
        body="Reading the whole conversation and the plant areas shown, then scoring it against 8 sales criteria. Usually 10–30 seconds — a rule-based fallback runs instantly if the AI is unavailable."
        elapsed={props.elapsed}
      />
    );
  }

  if (!report) {
    if (!props.dialogue) {
      return (
        <Empty
          icon={<Sparkles className="w-5 h-5" />}
          title="Transcribe first"
          body={props.recorded ? "The analysis reads the Customer / Sales Person conversation, so we need the transcript first." : "This meeting wasn't recorded, so there's nothing to analyse."}
          action={props.recorded ? (
            <button onClick={props.onTranscribe} disabled={props.transcribing} className={BTN_AI}>
              <MessageSquare className="w-4 h-4" /> Transcribe conversation
            </button>
          ) : undefined}
        />
      );
    }
    return (
      <Empty
        icon={<Sparkles className="w-5 h-5" />}
        title="Ready to analyse"
        body="Get a score out of 100, what the customer wants, their interests and concerns, what went well and wrong, what was missed, and how to improve."
        action={
          <button onClick={props.onAnalyze} className={BTN_AI}>
            <Sparkles className="w-4 h-4" /> Run AI analysis
          </button>
        }
      />
    );
  }

  const band = scoreBand(report.overall_score);
  const m = report.metrics;

  return (
    <div className="space-y-4">
      {/* Score + summary */}
      <Card>
        {report.is_fallback && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
            This review was generated by VPV's free rule-based analyser (no AI key configured yet). It's useful for a quick read but shallower than the AI version — ask the VPV admin to add an NVIDIA or Gemini API key for the full report.
          </div>
        )}
        <div className="flex flex-wrap items-start gap-5">
          <ScoreRing score={report.overall_score} band={band} />
          <div className="flex-1 min-w-[240px]">
            <div className="flex items-center gap-2 mb-1.5">
              <DealChip temp={report.deal_temperature} />
              <span className="text-[11.5px] text-slate-500">{report.deal_reason}</span>
            </div>
            <p className="text-[13.5px] leading-relaxed text-slate-700">{report.summary}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MiniStat label="Sales talk time" value={`${m.sales_talk_pct}%`} hint={m.sales_talk_pct > 70 ? "Talked too much" : m.sales_talk_pct < 35 ? "Let customer lead" : "Balanced"} />
          <MiniStat label="Questions by sales" value={String(m.sales_questions)} />
          <MiniStat label="Questions by customer" value={String(m.customer_questions)} />
          <MiniStat label="Longest monologue" value={fmtDuration(m.longest_sales_monologue_sec)} />
        </div>
      </Card>

      {/* Criteria */}
      <Card title="Score breakdown" icon={<Target className="w-3.5 h-3.5" />}>
        <div className="space-y-3">
          {report.criteria.map((c) => (
            <div key={c.key}>
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="font-medium text-slate-800">{c.name}</span>
                <span className="tabular-nums font-semibold text-slate-700">{c.score}/10</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 mt-1 overflow-hidden">
                <div className={`h-full rounded-full ${barTone(c.score)}`} style={{ width: `${c.score * 10}%` }} />
              </div>
              {c.comment && <p className="text-[11.5px] text-slate-500 mt-1 leading-snug">{c.comment}</p>}
            </div>
          ))}
        </div>
      </Card>

      {/* Customer */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="What the customer wants" icon={<ListChecks className="w-3.5 h-3.5" />}>
          <BulletList items={report.customer_wants} empty="No specific requirements were stated." />
        </Card>
        <Card title="Customer interest" icon={<Flame className="w-3.5 h-3.5" />}>
          {report.customer_interests.length === 0 ? <Muted>No clear interest signals.</Muted> : (
            <ul className="space-y-2.5">
              {report.customer_interests.map((x, i) => (
                <li key={i}>
                  <div className="flex items-center gap-2 text-[12.5px] font-medium text-slate-800">
                    <LevelDot level={x.strength} /> {x.interest}
                  </div>
                  <Evidence text={x.evidence} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Customer issues & concerns" icon={<AlertTriangle className="w-3.5 h-3.5" />} tone="warn">
        {report.customer_issues.length === 0 ? <Muted>No objections or concerns were raised.</Muted> : (
          <ul className="space-y-3">
            {report.customer_issues.map((x, i) => (
              <li key={i} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center gap-2 text-[12.5px] font-semibold text-slate-800">
                  <SeverityChip level={x.severity} /> {x.issue}
                </div>
                <Evidence text={x.evidence} />
                {x.how_to_address && (
                  <p className="mt-1.5 text-[12px] text-slate-700"><span className="font-semibold text-emerald-700">How to address: </span>{x.how_to_address}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Salesperson */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="What went well" icon={<ThumbsUp className="w-3.5 h-3.5" />} tone="good">
          <PointList items={report.went_well} empty="Nothing stood out." mark="✓" markTone="text-emerald-500" />
        </Card>
        <Card title="What went wrong" icon={<ThumbsDown className="w-3.5 h-3.5" />} tone="bad">
          <PointList items={report.went_wrong} empty="No major mistakes." mark="✗" markTone="text-rose-500" />
        </Card>
      </div>

      <Card title="Should have talked about" icon={<Lightbulb className="w-3.5 h-3.5" />}>
        {report.missed_points.length === 0 ? <Muted>Nothing important was missed.</Muted> : (
          <ul className="space-y-3">
            {report.missed_points.map((x, i) => (
              <li key={i}>
                <div className="text-[12.5px] font-semibold text-slate-800">{x.topic}</div>
                <div className="text-[12px] text-slate-500">{x.why_it_matters}</div>
                {x.suggested_line && (
                  <div className="mt-1.5 flex gap-1.5 rounded-lg bg-blue-50 border border-blue-100 px-2.5 py-1.5 text-[12px] text-blue-900">
                    <Quote className="w-3 h-3 mt-0.5 flex-shrink-0 text-blue-400" />
                    <span>{x.suggested_line}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Next actions" icon={<ListChecks className="w-3.5 h-3.5" />}>
          {report.next_actions.length === 0 ? <Muted>No follow-ups suggested.</Muted> : (
            <ul className="space-y-1.5">
              {report.next_actions.map((x, i) => (
                <li key={i} className="flex items-start gap-2 text-[12.5px] text-slate-700">
                  <span className="mt-0.5 w-3.5 h-3.5 rounded border border-slate-300 flex-shrink-0" />
                  <span className="flex-1">{x.action}</span>
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">{x.owner === "manager" ? "Manager" : "Sales"}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Coaching tips" icon={<Lightbulb className="w-3.5 h-3.5" />}>
          <BulletList items={report.coaching_tips} empty="No tips." />
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-[11px] text-slate-400">
        <span>AI-generated from the recording — verify important details before acting on them.</span>
        <div className="flex items-center gap-3">
          <CopyReport report={report} meta={props.meta} />
          <button onClick={props.onReanalyze} className="flex items-center gap-1 text-slate-500 hover:text-slate-800">
            <RefreshCw className="w-3 h-3" /> Re-analyse
          </button>
        </div>
      </div>
    </div>
  );
}

/* ====================================================================== */
/* Tour journey                                                            */
/* ====================================================================== */

type Journey = {
  visits: { sceneId: string; name: string; seconds: number; atMs: number }[];
  hotspots: { label: string; count: number }[];
};

function buildJourney(sessionId: string, ov: TeamOverview): Journey {
  const ev = ov.allEvents
    .filter((e) => e.session_id === sessionId)
    .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  const start = ev.length ? +new Date(ev[0].created_at) : 0;
  const visits: Journey["visits"] = [];
  const hs = new Map<string, number>();
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    if (e.event_type === "scene_view" && e.scene_id) {
      const next = ev[i + 1];
      const secs = next ? Math.max(0, Math.round((+new Date(next.created_at) - +new Date(e.created_at)) / 1000)) : 0;
      const last = visits[visits.length - 1];
      if (last && last.sceneId === e.scene_id) last.seconds += secs;
      else
        visits.push({
          sceneId: e.scene_id,
          name: ov.scenesById.get(e.scene_id)?.name || "Untitled area",
          seconds: secs,
          atMs: +new Date(e.created_at) - start,
        });
    } else if (e.event_type === "hotspot_click" && e.hotspot_id) {
      const label = ov.hotspotsById.get(e.hotspot_id) || "Info point";
      hs.set(label, (hs.get(label) ?? 0) + 1);
    }
  }
  return {
    visits,
    hotspots: Array.from(hs.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
  };
}

function JourneyView({ journey }: { journey: Journey }) {
  if (journey.visits.length === 0) {
    return <Empty icon={<MapIcon className="w-5 h-5" />} title="No tour activity recorded" body="We didn't receive scene-view events for this meeting." />;
  }
  const max = Math.max(1, ...journey.visits.map((v) => v.seconds));
  return (
    <div className="space-y-4">
      <Card title={`Areas shown, in order (${journey.visits.length})`} icon={<MapIcon className="w-3.5 h-3.5" />}>
        <ol className="space-y-2">
          {journey.visits.map((v, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="w-10 text-[10.5px] tabular-nums text-slate-400">{fmtTs(v.atMs)}</span>
              <span className="w-40 sm:w-56 text-[12.5px] text-slate-800 truncate" title={v.name}>{v.name}</span>
              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-blue-400 rounded-full" style={{ width: `${(v.seconds / max) * 100}%` }} />
              </div>
              <span className="w-14 text-right text-[11.5px] tabular-nums text-slate-600">{fmtDuration(v.seconds)}</span>
            </li>
          ))}
        </ol>
      </Card>
      {journey.hotspots.length > 0 && (
        <Card title="Info points opened" icon={<Target className="w-3.5 h-3.5" />}>
          <div className="flex flex-wrap gap-1.5">
            {journey.hotspots.map((h) => (
              <span key={h.label} className="text-[12px] px-2 py-1 rounded-md bg-slate-100 text-slate-700">
                {h.label}{h.count > 1 ? ` ×${h.count}` : ""}
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ====================================================================== */
/* Atoms                                                                   */
/* ====================================================================== */

function UltraUpsell() {
  return (
    <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-blue-50 p-6">
      <div className="flex items-center gap-2 text-violet-700 font-semibold text-sm">
        <Lock className="w-4 h-4" /> ULTRA feature
      </div>
      <h3 className="mt-2 text-lg font-semibold text-slate-900">See exactly what happened in every meeting</h3>
      <ul className="mt-3 space-y-1.5 text-[13px] text-slate-700">
        <li>• Speaker-separated transcript — what the customer said vs. what your salesperson said</li>
        <li>• AI score out of 100 across 8 sales criteria</li>
        <li>• Customer interests, concerns and requirements, with quotes</li>
        <li>• What went well, what went wrong, what was missed — and what to say next time</li>
        <li>• Suggested next actions for the salesperson and manager</li>
      </ul>
      <p className="mt-4 text-[12.5px] text-slate-500">
        The recording and tour journey are available on your current plan. Contact VPV to upgrade to ULTRA.
      </p>
    </div>
  );
}

function Card({
  title,
  icon,
  tone,
  children,
}: {
  title?: string;
  icon?: React.ReactNode;
  tone?: "good" | "bad" | "warn";
  children: React.ReactNode;
}) {
  const color =
    tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-rose-600" : tone === "warn" ? "text-amber-600" : "text-slate-500";
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      {title && (
        <h4 className={`text-[10.5px] uppercase tracking-wider font-semibold mb-2.5 flex items-center gap-1.5 ${color}`}>
          {icon} {title}
        </h4>
      )}
      {children}
    </section>
  );
}

function Working({ title, body, elapsed }: { title: string; body: string; elapsed: number }) {
  return (
    <div className="text-center py-16 px-6">
      <Loader2 className="w-7 h-7 animate-spin text-violet-500 mx-auto" />
      <div className="mt-3 text-[15px] font-semibold text-slate-800">{title}</div>
      <p className="mt-1 text-[12.5px] text-slate-500 max-w-md mx-auto">{body}</p>
      <div className="mt-2 text-[11px] tabular-nums text-slate-400">{fmtTs(elapsed * 1000)} elapsed</div>
    </div>
  );
}

function Empty({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="text-center py-14 px-6">
      <div className="w-11 h-11 rounded-full bg-violet-100 text-violet-600 grid place-items-center mx-auto">{icon}</div>
      <div className="mt-3 text-[15px] font-semibold text-slate-800">{title}</div>
      <p className="mt-1 text-[12.5px] text-slate-500 max-w-md mx-auto">{body}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

function ScorePill({ score }: { score: number }) {
  return (
    <div className={`flex-shrink-0 rounded-xl px-3 py-1.5 text-center text-white ${ringBg(score)}`}>
      <div className="text-[9px] uppercase tracking-wider opacity-85">AI score</div>
      <div className="text-xl font-bold leading-none tabular-nums">{score}</div>
    </div>
  );
}

function ScoreRing({ score, band }: { score: number; band: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const stroke =
    score >= 80 ? "#10b981" : score >= 65 ? "#3b82f6" : score >= 45 ? "#f59e0b" : "#f43f5e";
  return (
    <div className="flex flex-col items-center">
      <svg width="88" height="88" viewBox="0 0 88 88" aria-label={`AI score ${score} of 100`}>
        <circle cx="44" cy="44" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle
          cx="44" cy="44" r={r} fill="none" stroke={stroke} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 44 44)"
        />
        <text x="44" y="49" textAnchor="middle" fontSize="22" fontWeight="700" fill="#0f172a">{score}</text>
      </svg>
      <div className="text-[11px] font-semibold text-slate-600 -mt-0.5">{band}</div>
    </div>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-2">
      <div className="text-[9.5px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-[15px] font-semibold tabular-nums text-slate-800">{value}</div>
      {hint && <div className="text-[10px] text-slate-500">{hint}</div>}
    </div>
  );
}

function DealChip({ temp }: { temp: "hot" | "warm" | "cold" }) {
  const tone = temp === "hot" ? "bg-rose-100 text-rose-700" : temp === "warm" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-700";
  return <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold uppercase tracking-wide ${tone}`}>{temp} lead</span>;
}

function LevelDot({ level }: { level: "high" | "medium" | "low" }) {
  const c = level === "high" ? "bg-emerald-500" : level === "medium" ? "bg-amber-400" : "bg-slate-300";
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c}`} title={`${level} interest`} />;
}

function SeverityChip({ level }: { level: "high" | "medium" | "low" }) {
  const c = level === "high" ? "bg-rose-100 text-rose-700" : level === "medium" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600";
  return <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase ${c}`}>{level}</span>;
}

function Evidence({ text }: { text: string }) {
  if (!text) return null;
  return <p className="mt-0.5 text-[11.5px] text-slate-500 italic border-l-2 border-slate-200 pl-2">“{text}”</p>;
}

function PointList({ items, empty, mark, markTone }: { items: { point: string; evidence: string }[]; empty: string; mark: string; markTone: string }) {
  if (items.length === 0) return <Muted>{empty}</Muted>;
  return (
    <ul className="space-y-2.5">
      {items.map((x, i) => (
        <li key={i}>
          <div className="flex items-start gap-1.5 text-[12.5px] text-slate-800">
            <span className={`${markTone} font-bold`}>{mark}</span>
            <span>{x.point}</span>
          </div>
          <Evidence text={x.evidence} />
        </li>
      ))}
    </ul>
  );
}

function BulletList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <Muted>{empty}</Muted>;
  return (
    <ul className="space-y-1.5">
      {items.map((x, i) => (
        <li key={i} className="flex items-start gap-1.5 text-[12.5px] text-slate-700">
          <span className="text-slate-400">•</span>
          <span>{x}</span>
        </li>
      ))}
    </ul>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] text-slate-400">{children}</p>;
}

function CopyReport({ report, meta }: { report: PresentationAiReport; meta: { presenter: string; tour: string; when: string } }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const lines = [
      `VPV meeting analysis — ${meta.tour}`,
      `${meta.presenter} · ${meta.when}`,
      `Score: ${report.overall_score}/100 (${scoreBand(report.overall_score)}) · ${report.deal_temperature.toUpperCase()} lead`,
      "",
      report.summary,
      "",
      "Customer wants:", ...report.customer_wants.map((x) => `- ${x}`),
      "",
      "Concerns:", ...report.customer_issues.map((x) => `- ${x.issue} → ${x.how_to_address}`),
      "",
      "Went well:", ...report.went_well.map((x) => `- ${x.point}`),
      "",
      "Went wrong:", ...report.went_wrong.map((x) => `- ${x.point}`),
      "",
      "Should have talked about:", ...report.missed_points.map((x) => `- ${x.topic}`),
      "",
      "Next actions:", ...report.next_actions.map((x) => `- ${x.action}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* intentional — clipboard blocked; nothing else to do */
    }
  }
  return (
    <button onClick={copy} className="flex items-center gap-1 text-slate-500 hover:text-slate-800">
      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy summary"}
    </button>
  );
}

/* ---------- helpers ---------------------------------------------------- */

function messageOf(e: unknown): string {
  if (e instanceof AiRequestError) return e.message;
  return "Something went wrong. Please try again.";
}
function hintOf(e: unknown): string | null {
  return e instanceof AiRequestError ? e.hint ?? null : null;
}

/* ---------- Notice + error banners ------------------------------------- */

function NoticeBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 flex items-start gap-2 text-[12.5px] text-blue-800">
      <Sparkles className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} className="text-blue-600/70 hover:text-blue-900" aria-label="Dismiss notice">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function ErrorBanner({
  message,
  hint,
  onDismiss,
}: {
  message: string;
  hint: string | null;
  onDismiss: () => void;
}) {
  // Short, specific nudges for the common recoverable states, instead
  // of a raw stack of error text that leaves the admin stuck.
  const cta =
    hint === "transcript_missing"
      ? "Open Team settings → turn on Auto-record, then ask the salesperson to present again from Chrome or Edge."
      : null;
  return (
    <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 flex items-start gap-2 text-[12.5px] text-rose-800">
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <div>{message}</div>
        {cta && <div className="mt-1 text-rose-700/90">{cta}</div>}
      </div>
      <button onClick={onDismiss} className="text-rose-600/70 hover:text-rose-900" aria-label="Dismiss error">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function SourceChip({ source }: { source: Dialogue["source"] }) {
  if (source === "assemblyai")
    return <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700" title="Voice-based speaker separation">voice-separated</span>;
  if (source === "nvidia" || source === "gemini")
    return <span className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-700" title={`Speakers inferred by ${source === "nvidia" ? "NVIDIA" : "Gemini"}`}>AI-split</span>;
  // "heuristic" and the legacy "text-inferred" are both approximate.
  return (
    <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700" title="Split by rule-based matcher — correct any wrong labels below">
      approximate speakers
    </span>
  );
}

function fmtTs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

function fmtWhen(ms: number): string {
  return new Date(ms).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function barTone(score: number): string {
  if (score >= 8) return "bg-emerald-500";
  if (score >= 6) return "bg-blue-500";
  if (score >= 4) return "bg-amber-400";
  return "bg-rose-400";
}

function ringBg(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 65) return "bg-blue-600";
  if (score >= 45) return "bg-amber-500";
  return "bg-rose-500";
}

/** The bucket is private: signed URL only (no public-URL fallback). */
async function recordingSrc(path: string): Promise<string | null> {
  const signed = await supabase.storage.from("recordings").createSignedUrl(path, 3600);
  return signed.data?.signedUrl ?? null;
}
