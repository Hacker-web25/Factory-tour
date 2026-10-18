/**
 * Step 3 of the funnel — the question that decides whether somebody buys
 * VPV Control.
 *
 * Every manufacturer who has ever sent a factory video to a buyer has the
 * same worry: that it gets forwarded to a competitor. So that worry is the
 * largest thing on this page, above the question and in brand blue, and
 * the demonstration sits directly under it. Nothing else competes for the
 * eye.
 *
 * Both answers are styled identically (see YesNo) — the point is to ask the
 * question plainly where it is relevant, not to shame anyone into "yes".
 *
 * One-time link expiry and share restrictions exist on Control alone and
 * cannot be bought as an add-on, so a "yes" here sends the recommendation
 * straight to Control in recommendPlan().
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BackLink,
  Card,
  FunnelBody,
  PrimaryButton,
  RestartNotice,
  StepBar,
  YesNo,
} from "@/components/funnel/FunnelShell";
import { loadFunnel, mirrorLead, saveFunnel, type FunnelState } from "@/lib/funnel";

/**
 * The demonstration clip. PLACEHOLDER — drop the file at
 * /public/video/sharing-controls.mp4 (plus the poster frame) and this plays
 * automatically. Until then the panel below says a demonstration is coming,
 * rather than showing a broken player.
 *
 * It is muted, looped and inline because every current browser refuses to
 * autoplay a clip with sound, and a video that needs a click is a video
 * most visitors never watch.
 */
const SECURITY_VIDEO_SRC = "/video/sharing-controls.mp4";
const SECURITY_VIDEO_POSTER = "/img/vpv-preview.webp";

export default function Step3Security() {
  const router = useRouter();
  const [s, setS] = useState<FunnelState | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    setS(loadFunnel());
    setReady(true);
  }, []);

  async function onSubmit() {
    if (!s || s.wantsSharingControls === null) return;
    setBusy(true);
    const saved = saveFunnel({ wantsSharingControls: s.wantsSharingControls });
    await mirrorLead("security", saved);
    router.push("/assessment/plan");
  }

  const header = (
    <div
      className="border-b border-vpv-line"
      style={{
        backgroundImage:
          "radial-gradient(60% 120% at 90% 0%, rgba(25,184,242,0.14), rgba(255,255,255,0) 60%), radial-gradient(50% 100% at 0% 0%, rgba(20,104,216,0.09), rgba(255,255,255,0) 55%)",
      }}
    >
      <div className="mx-auto max-w-3xl px-5 pt-10 pb-10">
        <StepBar current={2} />
        <div className="mt-8 text-[11.5px] font-semibold uppercase tracking-[0.18em] text-vpv-blue">
          Step 3 of 5
        </div>
        {/* The biggest type on the page, on purpose. This is the sentence
            the whole screen exists to put in front of a factory owner. */}
        <p className="mt-3 text-[32px] sm:text-[46px] font-semibold leading-[1.06] tracking-tight text-vpv-blue">
          Stop your VPV link being shared with your competitors.
        </p>
        <p className="mt-4 text-[16px] leading-relaxed text-slate-600">
          A brochure or a factory video, once sent, is out of your hands
          forever. A VPV does not have to be.
        </p>
      </div>
    </div>
  );

  if (!ready || !s) {
    return (
      <>
        {header}
        <FunnelBody>
          <Card>
            <div className="h-5 w-48 animate-pulse rounded bg-vpv-tint" />
          </Card>
        </FunnelBody>
      </>
    );
  }

  if (!s.factoryCity) {
    return (
      <>
        {header}
        <FunnelBody>
          <RestartNotice missing="your factory's city and what you want shown" />
        </FunnelBody>
      </>
    );
  }

  return (
    <>
      {header}
      <FunnelBody>
        {/* The demonstration, directly under the headline. */}
        <div className="overflow-hidden rounded-2xl border border-vpv-line bg-vpv-ink">
          {videoFailed ? (
            <div className="flex aspect-video flex-col items-center justify-center gap-3 bg-vpv-ink px-6 text-center">
              <span className="rounded-full border border-white/25 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
                Demonstration
              </span>
              <p className="max-w-md text-[15px] leading-relaxed text-white/80">
                A short clip showing a shared link expiring the moment it is
                forwarded is being added here.
              </p>
            </div>
          ) : (
            <video
              className="aspect-video w-full bg-vpv-ink object-cover"
              src={SECURITY_VIDEO_SRC}
              poster={SECURITY_VIDEO_POSTER}
              autoPlay
              muted
              loop
              playsInline
              controls
              preload="metadata"
              onError={() => setVideoFailed(true)}
              aria-label="How VPV sharing restrictions and one-time link expiry work"
            />
          )}
        </div>

        <Card className="mt-5">
          <h2 className="text-[19px] font-semibold text-vpv-ink">
            How it works
          </h2>
          <ul className="mt-4 space-y-3 text-[14.5px] leading-relaxed text-slate-700">
            <li className="flex gap-3">
              <span aria-hidden className="mt-0.5 shrink-0 text-vpv-blue">●</span>
              <span>
                <strong className="font-semibold text-vpv-ink">One-time links.</strong>{" "}
                A link opens once, for the buyer you sent it to, and is dead
                afterwards. Forwarding it achieves nothing.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-0.5 shrink-0 text-vpv-blue">●</span>
              <span>
                <strong className="font-semibold text-vpv-ink">Expiry you set.</strong>{" "}
                Give a link 24 hours, or a week. After that it stops working
                whether or not anybody has opened it.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-0.5 shrink-0 text-vpv-blue">●</span>
              <span>
                <strong className="font-semibold text-vpv-ink">Device limits and passwords.</strong>{" "}
                Cap how many devices a link works on, and put a password in
                front of it.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-0.5 shrink-0 text-vpv-blue">●</span>
              <span>
                <strong className="font-semibold text-vpv-ink">You can see who looked.</strong>{" "}
                Every opened link is recorded, so you know which buyer actually
                walked through your plant and which did not.
              </span>
            </li>
          </ul>
        </Card>

        <Card className="mt-5">
          <h2 className="text-[19px] font-semibold text-vpv-ink">
            Do you want these controls on your VPV?
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-slate-600">
            They are part of VPV Control and are not sold separately. Answer
            honestly — if your tour is something you would happily put on your
            website, you do not need them and we will not recommend them.
          </p>
          <div className="mt-5">
            <YesNo
              value={s.wantsSharingControls}
              onChange={(v) => setS({ ...s, wantsSharingControls: v })}
              yesLabel="Yes, I want this protection"
              noLabel="No, open sharing is fine"
            />
          </div>
        </Card>

        <div className="mt-7 flex flex-col gap-4 sm:flex-row-reverse sm:items-center sm:justify-between">
          <PrimaryButton
            onClick={() => void onSubmit()}
            busy={busy}
            disabled={s.wantsSharingControls === null}
          >
            See my plan
          </PrimaryButton>
          <BackLink href="/assessment/scope">Back to what buyers see</BackLink>
        </div>
        {s.wantsSharingControls === null && (
          <p className="mt-3 text-[12.5px] text-slate-500">
            Pick one to carry on. There is no wrong answer.
          </p>
        )}
      </FunnelBody>
    </>
  );
}
