"use client";

/**
 * OfflineControls — the presenter's cockpit for offline mode.
 *
 * Renders three things:
 *   1. A pill in the corner showing current online / offline status.
 *   2. A modal listing every tour the presenter can prep offline, with
 *      per-tour "Download / Refresh / Remove" buttons and a progress bar.
 *   3. Cache size + "Clear all" button so the presenter can free space.
 *
 * The heavy lifting lives in lib/offlineCache.ts. This file is purely
 * the UI + orchestration.
 */

import { useEffect, useMemo, useState } from "react";
import type { Tour } from "@/lib/types";
import {
  prepareTourForOffline,
  listPreparedTours,
  isTourPrepared,
  removeTourPrepared,
  clearOfflineCache,
  getStorageEstimate,
  isOffline as isOfflineNow,
  onOfflineChange,
  formatBytes,
  type PrepareProgress,
} from "@/lib/offlineCache";
import { queueSize, flushQueue } from "@/lib/offlineQueue";
import {
  WifiOff,
  Wifi,
  Download,
  RefreshCw,
  Trash2,
  X,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  HardDrive,
  ArrowUpFromLine,
} from "lucide-react";

type Props = {
  tours: Pick<Tour, "id" | "title">[];
};

export default function OfflineControls({ tours }: Props) {
  const [offline, setOffline] = useState<boolean>(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [prepared, setPrepared] = useState(() => listPreparedTours());
  const [busyTourId, setBusyTourId] = useState<string | null>(null);
  const [progress, setProgress] = useState<PrepareProgress | null>(null);
  const [storage, setStorage] = useState<{ usage: number; quota: number }>({
    usage: 0,
    quota: 0,
  });
  const [pendingWrites, setPendingWrites] = useState(0);

  // Subscribe to browser online/offline events.
  useEffect(() => {
    setOffline(isOfflineNow());
    const teardown = onOfflineChange(setOffline);
    return teardown;
  }, []);

  // Refresh cache stats each time the modal opens.
  useEffect(() => {
    if (!modalOpen) return;
    getStorageEstimate().then(setStorage);
    setPrepared(listPreparedTours());
    setPendingWrites(queueSize());
  }, [modalOpen]);

  async function handlePrepare(tourId: string) {
    setBusyTourId(tourId);
    setProgress({
      phase: "collecting",
      done: 0,
      total: 0,
      ok: 0,
      failed: 0,
    });
    try {
      await prepareTourForOffline(tourId, (p) => setProgress(p));
      setPrepared(listPreparedTours());
      getStorageEstimate().then(setStorage);
    } finally {
      // Leave the last progress state visible for a beat so the user
      // sees the "done" tick before it disappears.
      setTimeout(() => {
        setBusyTourId(null);
        setProgress(null);
      }, 1200);
    }
  }

  function handleRemove(tourId: string) {
    if (
      !confirm(
        "Remove this tour's offline copy? Media stays on the server — you can re-download anytime."
      )
    )
      return;
    removeTourPrepared(tourId);
    setPrepared(listPreparedTours());
  }

  async function handleClearAll() {
    if (
      !confirm(
        "Clear ALL offline data? You'll need to re-download every tour before your next offline presentation."
      )
    )
      return;
    await clearOfflineCache();
    setPrepared([]);
    getStorageEstimate().then(setStorage);
  }

  async function handleFlush() {
    const r = await flushQueue();
    setPendingWrites(queueSize());
    alert(
      `Flushed ${r.ok}/${r.attempted} queued event${
        r.attempted === 1 ? "" : "s"
      }.${r.failed > 0 ? ` ${r.failed} still pending.` : ""}`
    );
  }

  const preparedIds = useMemo(
    () => new Set(prepared.map((p) => p.tourId)),
    [prepared]
  );

  return (
    <>
      {/* Floating status + open button */}
      <button
        onClick={() => setModalOpen(true)}
        title="Offline mode & downloads"
        className={`fixed bottom-4 right-4 z-40 flex items-center gap-2 px-3 py-2 rounded-full border shadow-panel transition-colors ${
          offline
            ? "bg-amber-500 border-amber-300 text-black"
            : "bg-black/80 border-white/15 text-white/80 hover:text-white"
        }`}
      >
        {offline ? <WifiOff size={14} /> : <Wifi size={14} />}
        <span className="text-[12px] font-medium">
          {offline ? "Offline" : "Online"}
        </span>
        {prepared.length > 0 && (
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
              offline ? "bg-black/25 text-black" : "bg-accent/25 text-accent"
            }`}
          >
            {prepared.length} saved
          </span>
        )}
      </button>

      {/* Optional slim offline banner at the top when actually offline */}
      {offline && (
        <div className="fixed top-0 inset-x-0 z-40 bg-amber-500 text-black text-[12px] font-medium py-1.5 flex items-center justify-center gap-2">
          <WifiOff size={12} />
          You&rsquo;re offline. Only tours you downloaded earlier will play.
          {pendingWrites > 0 && (
            <span className="ml-2 text-black/70">
              {pendingWrites} event{pendingWrites === 1 ? "" : "s"} queued —
              will sync on reconnect.
            </span>
          )}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-panel border border-border rounded-lg w-[560px] max-w-full max-h-[85vh] flex flex-col shadow-panel"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                {offline ? (
                  <WifiOff size={16} className="text-amber-400" />
                ) : (
                  <Wifi size={16} className="text-accent" />
                )}
                <h3 className="text-[14px] font-semibold">
                  Offline mode
                  {offline && (
                    <span className="ml-2 text-[11px] text-amber-400 font-normal">
                      · currently offline
                    </span>
                  )}
                </h3>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-neutral-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {/* Storage summary */}
            <div className="px-4 py-3 border-b border-border bg-panelSoft/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive size={13} className="text-neutral-400" />
                <div className="text-[12px]">
                  <div className="text-white">
                    <span className="font-semibold">
                      {formatBytes(storage.usage)}
                    </span>{" "}
                    <span className="text-neutral-500">
                      / {formatBytes(storage.quota)} available
                    </span>
                  </div>
                  <div className="text-[10.5px] text-neutral-500">
                    {prepared.length} tour{prepared.length === 1 ? "" : "s"}{" "}
                    downloaded
                  </div>
                </div>
              </div>
              {prepared.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="text-[11px] text-red-300 hover:text-red-200 flex items-center gap-1"
                >
                  <Trash2 size={11} /> Clear all
                </button>
              )}
            </div>

            {/* Queued writes badge */}
            {pendingWrites > 0 && (
              <div className="px-4 py-2.5 border-b border-border flex items-center justify-between bg-amber-500/10">
                <div className="flex items-center gap-2 text-[12px] text-amber-200">
                  <ArrowUpFromLine size={12} />
                  {pendingWrites} analytics event
                  {pendingWrites === 1 ? "" : "s"} queued to sync
                </div>
                <button
                  disabled={offline}
                  onClick={handleFlush}
                  className="text-[11px] text-accent hover:underline disabled:opacity-40 disabled:pointer-events-none"
                >
                  Sync now
                </button>
              </div>
            )}

            {/* Tour list */}
            <div className="flex-1 overflow-auto panel-scroll p-3">
              {tours.length === 0 ? (
                <div className="text-[12px] text-neutral-500 py-8 text-center">
                  No tours assigned to you yet.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {tours.map((t) => {
                    const isReady = preparedIds.has(t.id);
                    const busy = busyTourId === t.id;
                    return (
                      <div
                        key={t.id}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded border ${
                          isReady
                            ? "border-accent/40 bg-accent/5"
                            : "border-border bg-panelSoft/40"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium truncate">
                            {t.title}
                          </div>
                          {isReady && !busy && (
                            <div className="text-[10.5px] text-neutral-500 flex items-center gap-1 mt-0.5">
                              <CheckCircle2
                                size={10}
                                className="text-accent"
                              />
                              Ready offline
                              {(() => {
                                const p = prepared.find(
                                  (x) => x.tourId === t.id
                                );
                                if (!p) return null;
                                return (
                                  <>
                                    <span className="text-neutral-700">·</span>
                                    <span>
                                      {p.urlCount} file
                                      {p.urlCount === 1 ? "" : "s"} ·{" "}
                                      {new Date(
                                        p.preparedAt
                                      ).toLocaleDateString()}
                                    </span>
                                  </>
                                );
                              })()}
                            </div>
                          )}
                          {busy && progress && (
                            <div className="mt-1">
                              <div className="text-[10.5px] text-neutral-400 mb-0.5 flex items-center gap-1">
                                {progress.phase === "collecting" && (
                                  <>
                                    <Loader2
                                      size={10}
                                      className="animate-spin"
                                    />
                                    Finding files…
                                  </>
                                )}
                                {progress.phase === "downloading" && (
                                  <>
                                    <Loader2
                                      size={10}
                                      className="animate-spin"
                                    />
                                    Downloading {progress.done}/
                                    {progress.total}
                                    {progress.failed > 0 &&
                                      ` · ${progress.failed} failed`}
                                  </>
                                )}
                                {progress.phase === "done" && (
                                  <>
                                    <CheckCircle2
                                      size={10}
                                      className="text-accent"
                                    />
                                    Done — {progress.ok} file
                                    {progress.ok === 1 ? "" : "s"} ready
                                  </>
                                )}
                                {progress.phase === "error" && (
                                  <>
                                    <AlertTriangle
                                      size={10}
                                      className="text-amber-400"
                                    />
                                    {progress.message ?? "Some files failed"}
                                  </>
                                )}
                              </div>
                              <div className="h-1 bg-white/10 rounded overflow-hidden">
                                <div
                                  className={`h-full ${
                                    progress.phase === "error"
                                      ? "bg-amber-400"
                                      : "bg-accent"
                                  }`}
                                  style={{
                                    width: `${
                                      progress.total > 0
                                        ? Math.round(
                                            (progress.done /
                                              progress.total) *
                                              100
                                          )
                                        : 0
                                    }%`,
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                        {!busy && (
                          <>
                            <button
                              onClick={() => handlePrepare(t.id)}
                              disabled={offline}
                              title={
                                offline
                                  ? "Go online to download"
                                  : isReady
                                    ? "Re-download to refresh"
                                    : "Download for offline"
                              }
                              className={`text-[11px] font-medium px-2.5 py-1.5 rounded transition-colors ${
                                isReady
                                  ? "text-accent hover:text-black hover:bg-accent"
                                  : "bg-accent text-black hover:bg-accentHover"
                              } disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1`}
                            >
                              {isReady ? (
                                <>
                                  <RefreshCw size={11} /> Refresh
                                </>
                              ) : (
                                <>
                                  <Download size={11} /> Download
                                </>
                              )}
                            </button>
                            {isReady && (
                              <button
                                onClick={() => handleRemove(t.id)}
                                title="Remove offline copy"
                                className="text-neutral-500 hover:text-red-400 p-1.5"
                              >
                                <Trash2 size={11} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer tip */}
            <div className="px-4 py-2.5 border-t border-border text-[11px] text-neutral-500 leading-snug">
              Download tours over wifi before your factory visit. When the
              network drops, downloaded tours keep playing — panoramas,
              hotspots, videos, PDFs and audio all run from local cache.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
