"use client";

/**
 * /team/analytics/session/[id] — the deep AI-analysis page for a single
 * presentation session.
 *
 * Route is org_admin only. Opens from the "AI Analysis" button that appears
 * on a session ONLY when a transcript / recording actually exists — so
 * clicking it always leads to real content.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getMyProfile, type Profile } from "@/lib/auth";
import {
  recordingUrl,
  type PresentationSession,
} from "@/lib/presentationSession";
import {
  analyzeTranscript,
  type PresentationAnalysis,
} from "@/lib/presentationInsights";
import VpvLogo from "@/components/dashboard/VpvLogo";
import {
  ChevronLeft,
  Loader2,
  MapPin,
  Volume2,
  Mic,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Gauge,
  MessageSquare,
  IndianRupee,
  ThumbsUp,
  ShieldAlert,
} from "lucide-react";

export default function SessionAnalysisPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [ps, setPs] = useState<PresentationSession | null>(null);
  const [presenterName, setPresenterName] = useState<string>("");
  const [tourTitle, setTourTitle] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const p = await getMyProfile();
      if (!p) {
        router.replace("/login?next=/team/analytics");
        return;
      }
      if (p.role !== "org_admin" && p.role !== "owner") {
        router.replace("/");
        return;
      }
      setMe(p);

      const { data } = await supabase
        .from("presentation_sessions")
        .select("*")
        .eq("session_id", id)
        .maybeSingle();
      const row = (data ?? null) as PresentationSession | null;
      setPs(row);

      if (row?.presenter_user_id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", row.presenter_user_id)
          .maybeSingle();
        if (prof)
          setPresenterName(
            (prof as any).full_name ||
              ((prof as any).email as string).split("@")[0]
          );
      }
      if (row?.tour_id) {
        const { data: tour } = await supabase
          .from("tours")
          .select("title")
          .eq("id", row.tour_id)
          .maybeSingle();
        if (tour) setTourTitle((tour as any).title);
      }
      setLoading(false);
    })();
  }, [id, router]);

  const analysis: PresentationAnalysis | null = useMemo(() => {
    if (!ps?.transcript || !ps.duration_sec) return null;
    return analyzeTranscript(ps.transcript, ps.duration_sec);
  }, [ps?.transcript, ps?.duration_sec]);

  const audio = ps ? recordingUrl(ps.audio_path) : null;

  if (loading || !me) {
    return (
      <div className="min-h-screen bg-vpv-canvas grid place-items-center">
        <Loader2 size={20} className="animate-spin text-vpv-blue/60" />
      </div>
    );
  }

  if (!ps) {
    return (
      <Shell>
        <div className="max-w-3xl mx-auto pt-16 px-8 text-center">
          <div className="text-[15px] text-vpv-ink">Session not found.</div>
          <Link
            href="/team/analytics"
            className="text-[12px] text-vpv-blue hover:text-vpv-navy mt-2 inline-block"
          >
            ← Back to analytics
          </Link>
        </div>
      </Shell>
    );
  }

  const startedAt = new Date(ps.started_at);
  const timeStr = startedAt.toLocaleString([], {
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Shell>
      <main className="max-w-5xl mx-auto px-8 pt-8 pb-16">
        <Link
          href="/team/analytics"
          className="text-[11px] text-vpv-muted hover:text-vpv-blue flex items-center gap-1 mb-2"
        >
          <ChevronLeft size={11} /> Back to analytics
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-vpv-blue font-semibold flex items-center gap-1.5">
              <Sparkles size={12} /> AI analysis
            </div>
            <h1 className="text-[28px] font-semibold tracking-tight text-vpv-ink">
              {tourTitle || "Presentation"}
            </h1>
            <div className="text-[13px] text-vpv-muted mt-1">
              {presenterName ? `${presenterName} · ` : ""}
              {timeStr}
              {ps.duration_sec ? ` · ${fmtDur(ps.duration_sec)}` : ""}
            </div>
          </div>
          {analysis && <ScoreBadge analysis={analysis} />}
        </div>

        {/* Location + audio player */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-5">
          {(ps.place || (ps.lat != null && ps.lng != null)) && (
            <Card>
              <SectionHeader icon={<MapPin size={12} />} label="Location" />
              <div className="text-[13px] text-vpv-ink">
                {ps.place ||
                  `${ps.lat!.toFixed(4)}, ${ps.lng!.toFixed(4)}`}
              </div>
              {ps.lat != null && ps.lng != null && (
                <a
                  href={`https://www.google.com/maps?q=${ps.lat},${ps.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11.5px] text-vpv-blue hover:text-vpv-navy font-medium mt-1 inline-block"
                >
                  View on map ↗
                </a>
              )}
            </Card>
          )}
          {audio && (
            <Card>
              <SectionHeader icon={<Volume2 size={12} />} label="Recording" />
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio src={audio} controls className="w-full h-9" />
            </Card>
          )}
        </div>

        {!analysis && (
          <Card className="mt-5">
            <div className="flex items-center gap-2 text-[12.5px] text-vpv-muted">
              <Mic size={14} className="text-vpv-blue" />
              We captured the audio but no transcript yet — live speech-to-text
              needs Chrome or Edge on the presenter's device. The recording is
              playable above, and detailed AI insights will appear here as soon
              as a transcribed session lands.
            </div>
          </Card>
        )}

        {analysis && (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
              <Kpi label="Words" value={analysis.wordCount.toLocaleString()} />
              <Kpi
                label="Pace"
                value={`${analysis.wordsPerMinute} wpm`}
                sub={paceLabel(analysis.wordsPerMinute)}
              />
              <Kpi
                label="Filler words"
                value={String(analysis.fillerCount)}
                sub={`${analysis.fillerRate}/100 words`}
              />
              <Kpi
                label="Questions asked"
                value={String(analysis.questionCount)}
                sub={
                  analysis.questionCount === 0
                    ? "None — try more Qs"
                    : "Good engagement"
                }
              />
            </div>

            {/* Strengths / improvements */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-5">
              <Card>
                <SectionHeader
                  icon={<TrendingUp size={12} />}
                  label="What went well"
                  tone="positive"
                />
                {analysis.strengths.length === 0 ? (
                  <div className="text-[12px] text-vpv-muted">
                    Not enough signal to flag strengths on this one.
                  </div>
                ) : (
                  <ul className="space-y-1 text-[12.5px] text-vpv-ink">
                    {analysis.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-emerald-500 mt-0.5">✓</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card>
                <SectionHeader
                  icon={<TrendingDown size={12} />}
                  label="Where to improve"
                  tone="warning"
                />
                {analysis.improvements.length === 0 ? (
                  <div className="text-[12px] text-vpv-muted">
                    Nothing obvious to flag — solid session.
                  </div>
                ) : (
                  <ul className="space-y-1 text-[12.5px] text-vpv-ink">
                    {analysis.improvements.map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-amber-500 mt-0.5">→</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            {/* Coverage checklist */}
            <Card className="mt-5">
              <SectionHeader
                icon={<Gauge size={12} />}
                label={`Pitch coverage — ${analysis.coverage.filter((c) => c.covered).length}/${analysis.coverage.length}`}
              />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                {analysis.coverage.map((c) => (
                  <div
                    key={c.key}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] ${
                      c.covered
                        ? "border-vpv-blue/40 bg-vpv-tint"
                        : "border-vpv-line bg-vpv-canvas"
                    }`}
                  >
                    <span
                      className={
                        c.covered
                          ? "text-emerald-500"
                          : "text-vpv-muted/60"
                      }
                    >
                      {c.covered ? "●" : "○"}
                    </span>
                    <span
                      className={
                        c.covered ? "text-vpv-navy font-medium" : "text-vpv-muted"
                      }
                    >
                      {c.label}
                    </span>
                    {c.covered && (
                      <span className="ml-auto text-[10.5px] text-vpv-muted">
                        ×{c.mentions}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            {/* Topics with evidence */}
            {analysis.topics.length > 0 && (
              <Card className="mt-5">
                <SectionHeader
                  icon={<Sparkles size={12} />}
                  label={`Spoke on ${analysis.topics.length} topic${analysis.topics.length === 1 ? "" : "s"}`}
                />
                <div className="space-y-2 mt-1">
                  {analysis.topics.map((t) => (
                    <div
                      key={t.key}
                      className="rounded-lg border border-vpv-line bg-white p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-medium text-vpv-navy">
                          {t.label}
                        </span>
                        <span className="text-[10.5px] text-vpv-muted">
                          {t.mentions} mention{t.mentions === 1 ? "" : "s"}
                        </span>
                      </div>
                      {t.detail && (
                        <div className="text-[12px] text-vpv-muted mt-1 leading-snug">
                          “{t.detail}”
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Quotations detected */}
            {analysis.quotations.length > 0 && (
              <Card className="mt-5">
                <SectionHeader
                  icon={<IndianRupee size={12} />}
                  label={`Numbers / quotations mentioned (${analysis.quotations.length})`}
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {analysis.quotations.map((q, i) => (
                    <span
                      key={i}
                      className="text-[12px] px-2 py-1 rounded-md bg-vpv-tint text-vpv-navy border border-vpv-blue/25 font-medium"
                    >
                      {q}
                    </span>
                  ))}
                </div>
              </Card>
            )}

            {/* Buying signals */}
            {analysis.buyingSignals.length > 0 && (
              <Card className="mt-5">
                <SectionHeader
                  icon={<ThumbsUp size={12} />}
                  label={`Buying signals (${analysis.buyingSignals.length})`}
                  tone="positive"
                />
                <ul className="space-y-1.5 mt-1">
                  {analysis.buyingSignals.map((s, i) => (
                    <li
                      key={i}
                      className="text-[12.5px] text-vpv-ink border-l-2 border-emerald-400 pl-2.5 py-0.5"
                    >
                      “{s}”
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Objections */}
            {analysis.objections.length > 0 && (
              <Card className="mt-5">
                <SectionHeader
                  icon={<ShieldAlert size={12} />}
                  label={`Objections / concerns (${analysis.objections.length})`}
                  tone="warning"
                />
                <ul className="space-y-1.5 mt-1">
                  {analysis.objections.map((s, i) => (
                    <li
                      key={i}
                      className="text-[12.5px] text-vpv-ink border-l-2 border-amber-400 pl-2.5 py-0.5"
                    >
                      “{s}”
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Transcript */}
            {ps.transcript && (
              <Card className="mt-5">
                <SectionHeader
                  icon={<MessageSquare size={12} />}
                  label="Transcript"
                />
                <div className="max-h-96 overflow-y-auto rounded-lg border border-vpv-line bg-vpv-canvas p-3 text-[12.5px] text-vpv-ink leading-relaxed whitespace-pre-wrap mt-1">
                  {ps.transcript}
                </div>
              </Card>
            )}
          </>
        )}
      </main>
    </Shell>
  );
}

/* ------------------------------ atoms --------------------------------- */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen bg-vpv-canvas text-vpv-ink"
      style={{
        backgroundImage:
          "radial-gradient(60% 55% at 85% 0%, rgba(25,184,242,0.10), rgba(0,0,0,0) 60%), radial-gradient(45% 45% at 5% 5%, rgba(20,104,216,0.08), rgba(0,0,0,0) 55%)",
        backgroundAttachment: "fixed",
      }}
    >
      <header className="bg-white border-b border-vpv-line px-8 py-3 flex items-center">
        <VpvLogo />
      </header>
      {children}
    </div>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-white border border-vpv-line rounded-2xl p-4 shadow-[0_1px_2px_rgba(11,61,145,0.04),0_10px_30px_-18px_rgba(11,61,145,0.18)] ${className}`}
    >
      {children}
    </div>
  );
}

function SectionHeader({
  icon,
  label,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  tone?: "positive" | "warning";
}) {
  const color =
    tone === "positive"
      ? "text-emerald-600"
      : tone === "warning"
        ? "text-amber-600"
        : "text-vpv-blue";
  return (
    <div
      className={`text-[10.5px] uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1.5 ${color}`}
    >
      {icon} {label}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <div className="text-[10px] uppercase tracking-wider text-vpv-muted">
        {label}
      </div>
      <div className="text-[22px] font-semibold tabular-nums text-vpv-ink mt-0.5">
        {value}
      </div>
      {sub && <div className="text-[10.5px] text-vpv-muted mt-0.5">{sub}</div>}
    </Card>
  );
}

function ScoreBadge({ analysis }: { analysis: PresentationAnalysis }) {
  const bg =
    analysis.scoreBand === "Excellent"
      ? "from-emerald-500 to-emerald-400"
      : analysis.scoreBand === "Strong"
        ? "from-vpv-blue to-vpv-cyan"
        : analysis.scoreBand === "Fair"
          ? "from-amber-500 to-amber-400"
          : "from-rose-500 to-rose-400";
  return (
    <div
      className={`shrink-0 rounded-2xl p-4 text-white bg-gradient-to-br ${bg} shadow-[0_16px_40px_-16px_rgba(11,61,145,0.35)] min-w-[180px]`}
    >
      <div className="text-[10px] uppercase tracking-wider opacity-85">
        AI score
      </div>
      <div className="text-[38px] font-extrabold leading-none tabular-nums">
        {analysis.score}
      </div>
      <div className="text-[12px] mt-1 opacity-95">{analysis.scoreBand}</div>
    </div>
  );
}

function fmtDur(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function paceLabel(wpm: number): string {
  if (wpm === 0) return "";
  if (wpm > 190) return "A bit rushed";
  if (wpm > 150) return "Energetic";
  if (wpm >= 100) return "Conversational";
  if (wpm >= 80) return "Measured";
  return "Slow — pick up pace";
}
