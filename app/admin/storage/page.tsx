"use client";

/**
 * /admin/storage — move every picture and sound out of Supabase and onto Cloudflare R2.
 *
 * Supabase Free holds 1 GB of files. Tour pictures are large and customers keep them, so the
 * files belong on Cloudflare (cheap, no download fees) and Supabase should hold only the database.
 * New uploads already go straight to Cloudflare. This page copies the older ones across and
 * proves each arrived intact, before anything is deleted.
 *
 *   1. Copy        sends each Supabase file to Cloudflare, one small batch at a time. Safe to stop and
 *                  start again: files already there are left alone.
 *   2. Check       compares name, size and MD5 fingerprint on both sides.
 *   3. Free up     deletes the Supabase copies. Locked until step 2 shows every file is in Cloudflare;
 *                  needs the phrase typed. This one cannot be undone.
 *
 * Owner only: this page, the API routes and the database function behind them all check.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, CloudUpload, Loader2, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getMyProfile, type Profile } from "@/lib/auth";
import VpvLogo from "@/components/dashboard/VpvLogo";
import { formatBytes } from "@/lib/formatBytes";

type BucketStatus = {
  bucket: string;
  supabase: { files: number; bytes: number };
  r2: { files: number; bytes: number };
  verified: number;
  sizeOnly: number;
  missing: { files: number; bytes: number; names: string[] };
  conflicts: Array<{ name: string; supabase: number; r2: number }>;
  replacedSince: number;
  r2Only: number;
  readyToDelete: boolean;
};
type Status = { buckets: BucketStatus[]; private: Array<{ bucket: string; files: number; bytes: number }> };
type Problem = { name: string; message: string };

const PHRASE = "DELETE FROM SUPABASE";
const BATCH = 6;
const LANES = 2;

const LABEL: Record<string, string> = {
  panoramas: "Pictures, icons, documents and tour sounds",
  tours: "Logos and sounds (older)",
  recordings: "Meeting recordings (private)",
  "voice-samples": "Voice samples (private)",
};

const FRIENDLY: Record<string, string> = {
  unauthorized: "Your session has expired. Sign in again.",
  forbidden: "Only the platform owner can use this page.",
  not_configured: "Cloudflare or the Supabase server key is not set up on the server yet.",
};

export default function AdminStoragePage() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copying, setCopying] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [problems, setProblems] = useState<Problem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const stopRef = useRef(false);

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const { data: sess } = await supabase.auth.getSession();
    const res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess.session?.access_token ?? ""}`, ...(init?.headers ?? {}) },
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok && body.ok !== false, status: res.status, body };
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const r = await api("/api/admin/storage");
    if (r.ok) setStatus(r.body as unknown as Status);
    else setError(String(r.body.message ?? FRIENDLY[String(r.body.error)] ?? "Could not read the file lists."));
  }, [api]);

  useEffect(() => {
    (async () => {
      const p = await getMyProfile();
      if (!p) {
        router.push("/login?next=/admin/storage");
        return;
      }
      setMe(p);
      if (p.role === "owner") await load();
      setLoading(false);
    })();
  }, [router, load]);

  async function copyAll(b: BucketStatus) {
    stopRef.current = false;
    setCopying(b.bucket);
    setProblems([]);
    setNotice(null);
    const queue = [...b.missing.names];
    const found: Problem[] = [];
    let done = 0;
    setProgress({ done: 0, total: queue.length });

    const lane = async () => {
      while (queue.length > 0 && !stopRef.current) {
        const names = queue.splice(0, BATCH);
        try {
          const r = await api("/api/admin/storage/copy", { method: "POST", body: JSON.stringify({ bucket: b.bucket, names }) });
          if (!r.ok) {
            const msg = String(r.body.message ?? FRIENDLY[String(r.body.error)] ?? `Failed (${r.status}).`);
            for (const n of names) found.push({ name: n, message: msg });
          } else {
            for (const x of (r.body.results ?? []) as Array<{ name: string; status: string; message?: string }>) {
              if (x.status === "failed" || x.status === "skipped") found.push({ name: x.name, message: x.message ?? x.status });
            }
          }
        } catch (e) {
          for (const n of names) found.push({ name: n, message: e instanceof Error ? e.message : "Network error" });
        }
        done += names.length;
        setProgress({ done, total: b.missing.names.length });
        setProblems([...found]);
      }
    };
    await Promise.all(Array.from({ length: LANES }, lane));
    setCopying(null);
    await load();
    setNotice(stopRef.current ? "Stopped. Start again any time; files already copied are left alone." : "Copy pass finished. The numbers above are the check.");
  }

  async function purge(b: BucketStatus, typed: string) {
    setNotice(null);
    const r = await api("/api/admin/storage/purge", { method: "POST", body: JSON.stringify({ bucket: b.bucket, confirm: typed }) });
    if (r.ok) {
      setNotice(`Done: ${String(r.body.removed)} files removed from Supabase. They are all in Cloudflare.`);
      await load();
    } else {
      setNotice(String(r.body.message ?? "Nothing was deleted."));
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-vpv-canvas text-vpv-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (me?.role !== "owner") {
    return (
      <div className="grid min-h-screen place-items-center bg-vpv-canvas px-6 text-center">
        <div>
          <h1 className="text-[20px] font-semibold text-vpv-ink">Not available</h1>
          <p className="mt-2 text-[14px] text-slate-600">This page is for the platform owner.</p>
        </div>
      </div>
    );
  }

  const supabaseBytes = (status?.buckets ?? []).reduce((n, b) => n + b.supabase.bytes, 0) + (status?.private ?? []).reduce((n, b) => n + b.bytes, 0);
  const allMoved = status !== null && status.buckets.every((b) => b.supabase.files === 0 && b.missing.files === 0);

  return (
    <div className="min-h-screen bg-vpv-canvas text-vpv-ink">
      <div className="flex items-center gap-4 border-b border-vpv-line bg-white/70 px-6 py-2.5 backdrop-blur">
        <Link href="/admin" className="flex items-center gap-1.5 text-xs text-vpv-muted hover:text-vpv-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> Admin
        </Link>
        <div className="mx-auto">
          <VpvLogo />
        </div>
        <button
          onClick={() => {
            setLoading(true);
            load().finally(() => setLoading(false));
          }}
          disabled={copying !== null}
          className="flex w-16 items-center justify-end gap-1.5 text-xs text-vpv-muted hover:text-vpv-ink disabled:opacity-40"
          title="Check again"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Check
        </button>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-9">
        <h1 className="text-[28px] font-semibold tracking-tight">File storage</h1>
        <p className="mt-1 max-w-[40rem] text-[13.5px] text-vpv-muted">
          Pictures and sounds live on Cloudflare, which costs a fraction of Supabase and never charges for downloads. Supabase should hold only the
          database. This page moves the older files across and proves each one arrived intact before you free up the space.
        </p>

        {error && (
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div role="status" className="mt-5 flex items-start gap-2 rounded-xl border border-vpv-line bg-white px-4 py-3 text-[13.5px] text-vpv-ink">
            <Check size={16} className="mt-0.5 shrink-0 text-emerald-600" />
            <span>{notice}</span>
          </div>
        )}

        {status && (
          <>
            <div
              className={`mt-5 flex items-center gap-3 rounded-xl border px-4 py-3 text-[13.5px] ${
                allMoved ? "border-emerald-200 bg-emerald-50 text-emerald-900" : supabaseBytes > 0.9 * 1024 ** 3 ? "border-amber-200 bg-amber-50 text-amber-900" : "border-vpv-line bg-white"
              }`}
            >
              {allMoved ? <ShieldCheck size={18} className="shrink-0" /> : <AlertTriangle size={18} className="shrink-0" />}
              <div>
                <div className="font-semibold">Supabase holds {formatBytes(supabaseBytes)} of files</div>
                <div className="text-[12.5px] opacity-80">The free plan includes 1 GB. {allMoved ? "All pictures and sounds are on Cloudflare." : "Moving the pictures brings this close to zero."}</div>
              </div>
            </div>

            {status.buckets.map((b) => (
              <BucketCard key={b.bucket} b={b} copying={copying === b.bucket} anyCopying={copying !== null} progress={progress} onCopy={() => copyAll(b)} onStop={() => (stopRef.current = true)} onPurge={(t) => purge(b, t)} />
            ))}

            {problems.length > 0 && (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
                <div className="font-semibold">{problems.length} file{problems.length === 1 ? "" : "s"} did not copy</div>
                <ul className="mt-2 max-h-48 list-disc space-y-1 overflow-auto pl-5 text-[12.5px]">
                  {problems.slice(0, 40).map((p) => (
                    <li key={p.name}>
                      <span className="font-mono">{p.name}</span> — {p.message}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[12.5px]">Press Copy again to retry the ones that failed. Files marked as skipped cannot be stored on Cloudflare and stay in Supabase.</p>
              </div>
            )}

            <div className="mt-8">
              <h2 className="text-[15px] font-semibold">Private files that stay in Supabase</h2>
              <p className="mt-1 max-w-[40rem] text-[13px] text-vpv-muted">
                Meeting recordings and voice samples are private, so they are not served from the public Cloudflare address. They are small today.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {status.private.map((p) => (
                  <div key={p.bucket} className="rounded-xl border border-vpv-line bg-white px-4 py-3">
                    <div className="text-[13px] font-medium">{LABEL[p.bucket] ?? p.bucket}</div>
                    <div className="mt-0.5 text-[12.5px] text-vpv-muted">
                      {p.files} file{p.files === 1 ? "" : "s"} · {formatBytes(p.bytes)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function BucketCard(props: {
  b: BucketStatus;
  copying: boolean;
  anyCopying: boolean;
  progress: { done: number; total: number };
  onCopy: () => void;
  onStop: () => void;
  onPurge: (phrase: string) => Promise<void>;
}) {
  const { b, copying, anyCopying, progress } = props;
  const [typed, setTyped] = useState("");
  const [haveBackup, setHaveBackup] = useState(false);
  const [purging, setPurging] = useState(false);
  const total = b.supabase.files;
  const pct = total === 0 ? 100 : Math.round((b.verified / total) * 100);
  const nothingLeft = total === 0;

  return (
    <section className="mt-5 rounded-2xl border border-vpv-line bg-white p-5 shadow-[0_1px_2px_rgba(11,61,145,.06)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[16px] font-semibold">{LABEL[b.bucket] ?? b.bucket}</h2>
        <span className="font-mono text-[12px] text-vpv-muted">{b.bucket}</span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-vpv-canvas px-4 py-3">
          <div className="text-[11.5px] uppercase tracking-[0.08em] text-vpv-muted">Still in Supabase</div>
          <div className="mt-1 text-[20px] font-semibold">{b.supabase.files} <span className="text-[13px] font-normal text-vpv-muted">files · {formatBytes(b.supabase.bytes)}</span></div>
        </div>
        <div className="rounded-xl bg-vpv-tint px-4 py-3">
          <div className="text-[11.5px] uppercase tracking-[0.08em] text-vpv-muted">On Cloudflare</div>
          <div className="mt-1 text-[20px] font-semibold">{b.r2.files} <span className="text-[13px] font-normal text-vpv-muted">files · {formatBytes(b.r2.bytes)}</span></div>
        </div>
      </div>

      {!nothingLeft && (
        <>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-vpv-line" aria-hidden>
            <div className="h-full rounded-full bg-vpv-grad transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-[13px] text-vpv-muted">
            {b.verified} of {total} Supabase files are confirmed on Cloudflare with identical contents
            {b.missing.files > 0 && <> · <strong className="text-vpv-ink">{b.missing.files} still to copy</strong> ({formatBytes(b.missing.bytes)})</>}
            {b.sizeOnly > 0 && <> · {b.sizeOnly} confirmed by size only</>}
            {b.replacedSince > 0 && <> · {b.replacedSince} replaced on Cloudflare since (newer there)</>}
          </p>
        </>
      )}
      {b.r2Only > 0 && <p className="mt-1 text-[12.5px] text-vpv-muted">{b.r2Only} more files were uploaded straight to Cloudflare after the switch.</p>}

      {b.conflicts.length > 0 && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-800">
          <strong>{b.conflicts.length} file{b.conflicts.length === 1 ? " differs" : "s differ"}</strong> between Supabase and Cloudflare and Cloudflare&rsquo;s copy is not newer. Nothing will be deleted until this is looked at:
          <ul className="mt-1 list-disc pl-5 font-mono">
            {b.conflicts.slice(0, 5).map((c) => (
              <li key={c.name}>{c.name}</li>
            ))}
          </ul>
        </div>
      )}

      {nothingLeft ? (
        <p className="mt-4 flex items-center gap-2 text-[13.5px] text-emerald-700">
          <CheckCircle2 size={16} /> Nothing left in Supabase for this bucket.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {copying ? (
            <>
              <span className="flex items-center gap-2 text-[13px] text-vpv-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Copying {progress.done} of {progress.total}…
              </span>
              <button onClick={props.onStop} className="rounded-lg border border-vpv-line px-3 py-1.5 text-[13px] hover:bg-vpv-canvas">
                Stop
              </button>
            </>
          ) : (
            <button
              onClick={props.onCopy}
              disabled={anyCopying || b.missing.files === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-vpv-blue px-4 py-2 text-[13.5px] font-medium text-white shadow-sm hover:bg-vpv-navy disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CloudUpload size={15} /> {b.missing.files === 0 ? "Everything is copied" : `Copy ${b.missing.files} file${b.missing.files === 1 ? "" : "s"} to Cloudflare`}
            </button>
          )}
        </div>
      )}

      {!nothingLeft && b.readyToDelete && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50/60 p-4">
          <h3 className="flex items-center gap-2 text-[14px] font-semibold text-red-900">
            <Trash2 size={15} /> Free up Supabase
          </h3>
          <p className="mt-1 text-[12.5px] text-red-900/80">
            Every file in this bucket is on Cloudflare with identical contents. Deleting the Supabase copies cannot be undone. Make sure the nightly backup has run at
            least once first (see the backup guide), so the files exist in three places.
          </p>
          <label className="mt-3 flex items-start gap-2 text-[12.5px] text-red-900">
            <input type="checkbox" checked={haveBackup} onChange={(e) => setHaveBackup(e.target.checked)} className="mt-0.5" />
            <span>The nightly backup has run and I can see it in the backup bucket.</span>
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={`Type ${PHRASE}`}
              aria-label="Confirmation phrase"
              className="w-64 rounded-lg border border-red-200 bg-white px-3 py-1.5 font-mono text-[12.5px]"
            />
            <button
              disabled={typed !== PHRASE || !haveBackup || purging}
              onClick={async () => {
                setPurging(true);
                await props.onPurge(typed);
                setPurging(false);
                setTyped("");
              }}
              className="rounded-lg bg-red-700 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {purging ? "Deleting…" : "Delete from Supabase"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
