"use client";

/**
 * /[slug]/owner/recording-activity — the MD's review queue for stops.
 *
 * Every time a sales rep stops a recording mid-meeting, VPV logs it and
 * keeps recording for a short window so the reason is on tape. This page
 * is where the MD listens and decides.
 *
 * The one design rule here: a stop VPV could not verify is shown as
 * "could not verify", never as a problem. A detector miss (poor audio,
 * no voice sample on file, Hindi/English mix) must not read as guilt —
 * someone's job can turn on this screen. The MD's own judgement is the
 * decision, and the page says so.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getMyProfile, type Profile } from "@/lib/auth";
import { orgBySlug } from "@/lib/orgSlug";
import { recordingUrl } from "@/lib/presentationSession";
import {
  listRecordingStops,
  setMdReview,
  verdictLabel,
  verdictHelp,
  type RecordingStopRow,
  type MdReview,
} from "@/lib/recordingStops";
import VpvLogo from "@/components/dashboard/VpvLogo";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  User as UserIcon,
  Film,
  HelpCircle,
  ShieldCheck,
  MicOff,
} from "lucide-react";

export default function RecordingActivityPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [rows, setRows] = useState<RecordingStopRow[] | null>(null);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
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
    setMe(p);
    setRows(await listRecordingStops(org.id));
  }, [params.slug, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(id: string, decision: MdReview) {
    setBusyId(id);
    const ok = await setMdReview(id, decision, notes[id]);
    setBusyId(null);
    if (!ok) return;
    setRows((prev) =>
      prev
        ? prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  md_review: decision,
                  md_reviewed_at: new Date().toISOString(),
                  md_note: notes[id]?.trim() || r.md_note,
                }
              : r
          )
        : prev
    );
  }

  const shown = useMemo(() => {
    if (!rows) return [];
    return filter === "pending" ? rows.filter((r) => !r.md_review) : rows;
  }, [rows, filter]);

  const pendingCount = rows?.filter((r) => !r.md_review).length ?? 0;

  if (rows === null) {
    return (
      <div className="min-h-screen grid place-items-center bg-vpv-canvas">
        <Loader2 className="w-5 h-5 animate-spin text-vpv-blue" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-vpv-canvas">
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-vpv-line">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
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
              Recording activity
            </div>
            <div className="text-[11px] text-vpv-muted">
              {pendingCount} awaiting your review
            </div>
          </div>
          <div className="ml-auto inline-flex rounded-full bg-vpv-canvas border border-vpv-line p-0.5">
            {(["pending", "all"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-3 h-7 rounded-full text-[12px] font-medium transition-colors ${
                  filter === f
                    ? "bg-white text-vpv-ink shadow-sm"
                    : "text-vpv-muted hover:text-vpv-ink"
                }`}
              >
                {f === "pending" ? "To review" : "All"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-5">
        {/* How to read this page */}
        <div className="rounded-2xl bg-white border border-vpv-line p-5 flex items-start gap-3 shadow-[0_1px_2px_rgba(11,61,145,0.04),0_10px_30px_-18px_rgba(11,61,145,0.14)]">
          <div className="w-9 h-9 rounded-lg bg-vpv-tint text-vpv-blue grid place-items-center shrink-0">
            <ShieldCheck size={16} />
          </div>
          <div>
            <div className="text-[14px] font-semibold text-vpv-ink">
              How to read this
            </div>
            <p className="text-[12.5px] text-vpv-muted mt-0.5 leading-relaxed">
              When a sales rep stops a recording during a meeting, VPV keeps
              recording for a few more seconds and logs the stop here. Press
              play to hear what was said around it — the player starts a
              little before the stop so you get the lead-in.
            </p>
            <p className="text-[12.5px] text-vpv-muted mt-2 leading-relaxed">
              <strong className="text-vpv-ink">
                “Could not verify” is not an accusation.
              </strong>{" "}
              It means our system could not tell from the audio — often poor
              sound, a mix of languages, or no voice sample on file for that
              rep. Listen before you decide. Your decision is the one that
              counts; ours is only a hint.
            </p>
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="rounded-2xl bg-white border border-dashed border-vpv-line p-10 text-center">
            <MicOff className="w-6 h-6 mx-auto text-vpv-muted/60" />
            <p className="mt-3 text-[13.5px] text-vpv-muted">
              {filter === "pending"
                ? "Nothing waiting for review. Every stop has been looked at."
                : "No recordings have been stopped mid-meeting yet."}
            </p>
          </div>
        ) : (
          shown.map((r) => (
            <StopCard
              key={r.id}
              row={r}
              busy={busyId === r.id}
              note={notes[r.id] ?? ""}
              onNote={(v) => setNotes((p) => ({ ...p, [r.id]: v }))}
              onReview={(d) => void review(r.id, d)}
            />
          ))
        )}
      </main>
    </div>
  );
}

/* ───────────────────────────── one stop ──────────────────────────── */

function StopCard({
  row,
  busy,
  note,
  onNote,
  onReview,
}: {
  row: RecordingStopRow;
  busy: boolean;
  note: string;
  onNote: (v: string) => void;
  onReview: (d: MdReview) => void;
}) {
  const audio = recordingUrl(row.audio_path);
  // Start the player a few seconds BEFORE the stop so the MD hears the
  // lead-in, not just the silence after.
  const seekTo = Math.max(0, (row.stop_offset_sec ?? 0) - 10);
  const who = row.presenter_name || row.presenter_email || "A sales rep";
  const when = new Date(row.stopped_at);

  const verdictTone =
    row.verdict === "verified_valid"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : row.verdict === "flagged"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : "bg-slate-100 text-slate-600 border-slate-200";

  return (
    <section className="rounded-2xl bg-white border border-vpv-line shadow-[0_1px_2px_rgba(11,61,145,0.04),0_10px_30px_-18px_rgba(11,61,145,0.14)] overflow-hidden">
      <div className="px-5 py-4 border-b border-vpv-line flex flex-wrap items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-vpv-tint text-vpv-navy grid place-items-center shrink-0">
          <UserIcon size={15} />
        </div>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-vpv-ink truncate">
            {who}
          </div>
          <div className="text-[11.5px] text-vpv-muted flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            <span className="inline-flex items-center gap-1">
              <Clock size={11} />
              {when.toLocaleString()}
            </span>
            {row.tour_title && (
              <span className="inline-flex items-center gap-1">
                <Film size={11} />
                {row.tour_title}
              </span>
            )}
            {row.stop_offset_sec != null && (
              <span>stopped {fmtOffset(row.stop_offset_sec)} in</span>
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11.5px] font-medium ${verdictTone}`}
            title={verdictHelp(row.verdict)}
          >
            {row.verdict === "verified_valid" ? (
              <CheckCircle2 size={12} />
            ) : row.verdict === "flagged" ? (
              <AlertCircle size={12} />
            ) : (
              <HelpCircle size={12} />
            )}
            {verdictLabel(row.verdict)}
          </span>
          {row.md_review && (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11.5px] font-semibold ${
                row.md_review === "ok"
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-rose-600 text-white border-rose-600"
              }`}
            >
              {row.md_review === "ok" ? (
                <CheckCircle2 size={12} />
              ) : (
                <XCircle size={12} />
              )}
              {row.md_review === "ok" ? "You marked OK" : "You marked not OK"}
            </span>
          )}
        </div>
      </div>

      <div className="p-5 space-y-4">
        <VerdictDetail row={row} />

        {!row.trailing_captured && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[12.5px] text-amber-800 flex items-start gap-2">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <span>
              The tab closed before the {row.trailing_seconds}-second window
              finished, so the audio after the stop may be short or missing.
              That alone is not evidence of anything — a laptop lid closing
              does the same thing.
            </span>
          </div>
        )}

        {audio ? (
          <div>
            <div className="text-[11.5px] uppercase tracking-[0.1em] font-semibold text-vpv-muted mb-1.5">
              Audio around the stop
            </div>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio
              controls
              preload="metadata"
              src={`${audio}#t=${seekTo}`}
              className="w-full"
            />
            <p className="mt-1.5 text-[11px] text-vpv-muted">
              Starts {seekTo > 0 ? "10 seconds before" : "at"} the stop. Drag
              back for more context.
            </p>
          </div>
        ) : (
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-[12.5px] text-slate-600">
            No audio was saved for this session, so there is nothing to
            listen to. Judge this one on the rep's own account of it.
          </div>
        )}

        {row.md_note && (
          <div className="rounded-lg bg-vpv-canvas/60 border border-vpv-line px-3 py-2">
            <div className="text-[11px] uppercase tracking-[0.08em] font-semibold text-vpv-muted">
              Your note
            </div>
            <p className="text-[13px] text-vpv-ink mt-0.5 whitespace-pre-wrap">
              {row.md_note}
            </p>
          </div>
        )}

        <div>
          <label className="block">
            <div className="text-[12px] font-medium text-vpv-ink mb-1">
              Note (optional — only you and your admins see this)
            </div>
            <textarea
              value={note}
              onChange={(e) => onNote(e.target.value)}
              rows={2}
              placeholder="e.g. Spoke to Ramesh — the client asked to stop before discussing price."
              className="w-full px-3 py-2 rounded-lg border border-vpv-line focus:border-vpv-blue focus:ring-2 focus:ring-vpv-blue/20 outline-none text-[13.5px] bg-white resize-y"
            />
          </label>
          <div className="mt-3 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={() => onReview("not_ok")}
              className="h-10 px-4 rounded-full border border-rose-300 text-rose-700 text-[13.5px] font-medium hover:bg-rose-50 disabled:opacity-40 inline-flex items-center justify-center gap-2"
            >
              <XCircle size={14} /> Not OK
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onReview("ok")}
              className="h-10 px-5 rounded-full bg-vpv-grad text-white text-[13.5px] font-semibold shadow-[0_10px_26px_-10px_rgba(20,104,216,0.6)] disabled:opacity-40 inline-flex items-center justify-center gap-2"
            >
              {busy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CheckCircle2 size={14} />
              )}
              This was OK
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function fmtOffset(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

/**
 * What the automated check concluded about this stop.
 *
 * verdict_detail is written per-row by /api/recording-stops/verify and
 * explains the reasoning in the MD's own terms. The static verdictHelp
 * copy is the fallback for rows written before that route existed, or
 * when the pass never ran.
 *
 * The detail may carry a quoted line (`Heard: "…"`) as a second
 * paragraph; it is pulled out and shown as a quote so the MD can see the
 * exact words the decision turned on.
 */
function VerdictDetail({ row }: { row: RecordingStopRow }) {
  const raw = row.verdict_detail?.trim();
  if (!raw) {
    return (
      <p className="text-[12.5px] text-vpv-muted leading-relaxed">
        {verdictHelp(row.verdict)}
      </p>
    );
  }
  const [body, ...rest] = raw.split(/\n\s*\n/);
  const heard = rest.join("\n\n").replace(/^Heard:\s*/i, "").trim();
  return (
    <div className="space-y-2">
      <p className="text-[12.5px] text-vpv-muted leading-relaxed">{body}</p>
      {heard && (
        <blockquote className="border-l-2 border-vpv-blue/40 pl-3 py-0.5">
          <div className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-vpv-muted">
            Heard around the stop
          </div>
          <p className="text-[13px] text-vpv-ink italic mt-0.5">{heard}</p>
        </blockquote>
      )}
    </div>
  );
}
