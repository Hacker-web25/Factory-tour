/**
 * Step 2 of the funnel — how much of the factory to show.
 *
 * Three answers: areas of attention, process videos, PDF reports. Those
 * three are what every plan is sized by, so they are what decides the
 * recommendation on step 4.
 *
 * The old "do you need information icons?" question is gone on purpose:
 * info icons are now part of every plan, so asking implied they were
 * optional and invited a visitor to turn down something they already had.
 * The sharing-controls question moved to its own step, because it is the
 * one that decides whether somebody buys Control.
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BackLink,
  Card,
  Counter,
  FunnelBody,
  FunnelHeader,
  PrimaryButton,
  RestartNotice,
} from "@/components/funnel/FunnelShell";
import { VIDEO_SHOT_NOTE } from "@/lib/pricing";
import { loadFunnel, mirrorLead, saveFunnel, type FunnelState } from "@/lib/funnel";

/** Shown as examples of what counts as one area. Drawn from what factories
 *  actually ask us to shoot, so a visitor can map it onto their own plant. */
const EXAMPLE_AREAS = [
  "Manufacturing / production floor",
  "Foundry or casting area",
  "Assembly line",
  "Quality control and testing lab",
  "Raw material and finished goods stores",
  "Loading and unloading bay",
  "Effluent treatment plant",
  "Fire and safety installations",
  "R&D or design office",
  "Reception and meeting rooms",
];

export default function Step2Scope() {
  const router = useRouter();
  const [s, setS] = useState<FunnelState | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const loaded = loadFunnel();
    // Default to something sensible rather than zero, so the visitor is
    // adjusting a number instead of starting at nothing.
    setS({
      ...loaded,
      aoaCount: loaded.aoaCount ?? 8,
      videoCount: loaded.videoCount ?? 0,
      pdfCount: loaded.pdfCount ?? 0,
    });
    setReady(true);
  }, []);

  async function onSubmit() {
    if (!s) return;
    setBusy(true);
    const saved = saveFunnel({
      aoaCount: s.aoaCount,
      videoCount: s.videoCount,
      pdfCount: s.pdfCount,
    });
    await mirrorLead("scope", saved);
    router.push("/assessment/security");
  }

  if (!ready || !s) {
    return (
      <>
        <FunnelHeader step={1} eyebrow="Step 2 of 5" title="What should buyers see?" />
        <FunnelBody>
          <Card>
            <div className="h-5 w-48 animate-pulse rounded bg-vpv-tint" />
            <div className="mt-5 h-11 animate-pulse rounded-xl bg-vpv-canvas" />
          </Card>
        </FunnelBody>
      </>
    );
  }

  // Step 1 holds the city, and without it nothing downstream can be priced.
  if (!s.factoryCity) {
    return (
      <>
        <FunnelHeader step={1} eyebrow="Step 2 of 5" title="What should buyers see?" />
        <FunnelBody>
          <RestartNotice missing="your factory's city" />
        </FunnelBody>
      </>
    );
  }

  return (
    <>
      <FunnelHeader
        step={1}
        eyebrow="Step 2 of 5"
        title="What should buyers see?"
        summary="Three numbers. You can change any of them on the next-but-one screen once you have seen the price."
      />
      <FunnelBody>
        <Card>
          <h2 className="text-[17px] font-semibold text-vpv-ink">Areas of attention</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-slate-600">
            An area of attention — an AOA — is one place a buyer can stand and
            look around in 360°. Each area counts as one AOA.
          </p>
          <div className="mt-5">
            <Counter
              value={s.aoaCount ?? 0}
              onChange={(n) => setS({ ...s, aoaCount: n })}
              min={1}
              max={40}
              suffix="areas"
            />
          </div>
          <details className="group mt-5">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-[13.5px] font-medium text-vpv-blue">
              What do other factories pick?
              <span aria-hidden className="transition-transform group-open:rotate-90">›</span>
            </summary>
            <ul className="mt-3 grid gap-1.5 text-[13.5px] leading-relaxed text-slate-600 sm:grid-cols-2">
              {EXAMPLE_AREAS.map((a) => (
                <li key={a}>• {a}</li>
              ))}
            </ul>
            <p className="mt-3 text-[12.5px] leading-relaxed text-slate-500">
              Most plants land between 6 and 15. You do not have to show the
              whole factory — many customers deliberately leave some areas out.
            </p>
          </details>
        </Card>

        <Card className="mt-5">
          <h2 className="text-[17px] font-semibold text-vpv-ink">Process videos</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-slate-600">
            A short clip of a machine or a process actually running. An area
            shows a buyer the place; a video shows them the work.
          </p>
          <div className="mt-5">
            <Counter
              value={s.videoCount ?? 0}
              onChange={(n) => setS({ ...s, videoCount: n })}
              min={0}
              max={20}
              suffix="videos"
            />
          </div>
          <p className="mt-4 rounded-xl border border-vpv-line bg-vpv-canvas px-3.5 py-3 text-[12.5px] leading-relaxed text-slate-600">
            {VIDEO_SHOT_NOTE} Each process you want filmed needs its machine
            running on shoot day.
          </p>
        </Card>

        <Card className="mt-5">
          <h2 className="text-[17px] font-semibold text-vpv-ink">PDF reports</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-slate-600">
            Certificates, test reports, datasheets or brochures a buyer can
            open from inside the tour — ISO certificates and material test
            reports are the usual ones.
          </p>
          <div className="mt-5">
            <Counter
              value={s.pdfCount ?? 0}
              onChange={(n) => setS({ ...s, pdfCount: n })}
              min={0}
              max={40}
              suffix="PDFs"
            />
          </div>
          <p className="mt-4 text-[12.5px] leading-relaxed text-slate-500">
            Leave this at zero if you would rather not put documents in front
            of buyers. You can add them later from your own dashboard.
          </p>
        </Card>

        <div className="mt-7 flex flex-col gap-4 sm:flex-row-reverse sm:items-center sm:justify-between">
          <PrimaryButton onClick={() => void onSubmit()} busy={busy}>
            Continue
          </PrimaryButton>
          <BackLink href="/assessment">Back to your details</BackLink>
        </div>
      </FunnelBody>
    </>
  );
}
