/**
 * Step 2 of the funnel — what buyers should see.
 *
 * Every area and process from lib/factoryAreas.ts is laid out as a tile,
 * the way the old site's assessment did it. The list is the persuasion: a
 * factory owner who scrolls past "Effluent Treatment Plant" or "Tool Room"
 * realises those are exactly the places buyers ask about, and picks them.
 * Each area picked is one AOA (Active Operational Area); each process
 * picked is one process video. Anything missing can be typed in.
 *
 * The old "do you need information icons?" question is gone — info icons
 * are in every plan now — and sharing controls moved to their own step,
 * because that is the question that decides Control.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Factory, FileText, Plus, Video, X } from "lucide-react";
import {
  BackLink,
  Card,
  Counter,
  StarBadge,
  FunnelBody,
  FunnelHeader,
  PickTile,
  PrimaryButton,
  RestartNotice,
  SectionTitle,
  TextInput,
} from "@/components/funnel/FunnelShell";
import FunnelIcon from "@/components/funnel/FunnelIcon";
import {
  CURATED_AREA_PICKS,
  CURATED_PROCESS_PICKS,
  FACTORY_AREAS,
  FACTORY_PROCESSES,
  STAR_COPY,
  type CatalogueItem,
  type StarPhase,
} from "@/lib/factoryAreas";
import { VIDEO_SHOT_NOTE } from "@/lib/pricing";
import { loadFunnel, mirrorLead, saveFunnel, type FunnelState } from "@/lib/funnel";

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function CustomAdder({
  placeholder,
  items,
  onChange,
}: {
  placeholder: string;
  items: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim().slice(0, 60);
    if (!v || items.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    onChange([...items, v]);
    setDraft("");
  };
  return (
    <div className="mt-5">
      <div className="flex gap-2">
        <TextInput
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-vpv-line px-4 text-[13.5px] font-semibold text-vpv-ink transition-colors hover:border-vpv-blue/40 hover:text-vpv-blue disabled:opacity-40"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add
        </button>
      </div>
      {items.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {items.map((c) => (
            <li key={c} className="inline-flex items-center gap-1.5 rounded-full border border-vpv-blue bg-vpv-tint/70 py-1 pl-3 pr-1.5 text-[13px] font-medium text-vpv-ink">
              {c}
              <button
                type="button"
                onClick={() => onChange(items.filter((x) => x !== c))}
                aria-label={`Remove ${c}`}
                className="flex h-5 w-5 items-center justify-center rounded-full text-slate-500 hover:bg-white hover:text-vpv-ink"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TileGrid({
  items,
  selected,
  onToggle,
  starred,
  starLabel,
}: {
  items: CatalogueItem[];
  selected: string[];
  onToggle: (id: string) => void;
  starred: string[];
  starLabel: string;
}) {
  return (
    <div className="mt-6 grid gap-x-2.5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <PickTile
          key={item.id}
          selected={selected.includes(item.id)}
          onToggle={() => onToggle(item.id)}
          icon={<FunnelIcon name={item.icon} className="h-[18px] w-[18px]" />}
          name={item.name}
          description={item.description}
          star={starred.includes(item.id) ? starLabel : undefined}
        />
      ))}
    </div>
  );
}

/** One line under a section saying what the gold star means. */
function StarLegend({ phase }: { phase: StarPhase }) {
  return (
    <p className="mt-4 flex flex-wrap items-center gap-2 text-[12.5px] text-slate-600">
      <StarBadge label={STAR_COPY[phase].badge} />
      {STAR_COPY[phase].legend}
    </p>
  );
}

type Stars = { phase: StarPhase; areaIds: string[]; processIds: string[] };

/** Which tiles get a star. Starts with our recommendations so nothing
 *  flickers, then takes whatever the server says applies today. */
function useStars(): Stars {
  const [stars, setStars] = useState<Stars>({
    phase: "curated",
    areaIds: CURATED_AREA_PICKS,
    processIds: CURATED_PROCESS_PICKS,
  });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/funnel/popular");
        const data = (await res.json()) as Partial<Stars>;
        if (!cancelled && (data.phase === "curated" || data.phase === "popular")) {
          setStars({
            phase: data.phase,
            areaIds: Array.isArray(data.areaIds) ? data.areaIds : [],
            processIds: Array.isArray(data.processIds) ? data.processIds : [],
          });
        }
      } catch {
        /* intentional — keep the recommendations if the request fails. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return stars;
}

function CountPill({ n, unit }: { n: number; unit: string }) {
  return (
    <span className={`rounded-full px-3 py-1 text-[12.5px] font-semibold tabular-nums ${n > 0 ? "bg-vpv-blue text-white" : "bg-vpv-canvas text-slate-500"}`}>
      {n} {unit}
    </span>
  );
}

export default function Step2Scope() {
  const router = useRouter();
  const [s, setS] = useState<FunnelState | null>(null);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const stars = useStars();
  const starLabel = STAR_COPY[stars.phase].badge;

  useEffect(() => {
    const loaded = loadFunnel();
    setS({ ...loaded, pdfCount: loaded.pdfCount ?? 0 });
  }, []);

  const areaCount = s ? s.selectedAreas.length + s.customAreas.length : 0;
  const videoCount = s ? s.selectedProcesses.length + s.customProcesses.length : 0;

  const summary = useMemo(() => {
    const parts = [`${areaCount} area${areaCount === 1 ? "" : "s"}`, `${videoCount} video${videoCount === 1 ? "" : "s"}`];
    const pdfs = s?.pdfCount ?? 0;
    parts.push(`${pdfs} PDF${pdfs === 1 ? "" : "s"}`);
    return parts.join(", ");
  }, [areaCount, videoCount, s?.pdfCount]);

  async function onSubmit() {
    if (!s) return;
    setTried(true);
    if (areaCount < 1) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setBusy(true);
    const saved = saveFunnel({
      selectedAreas: s.selectedAreas,
      customAreas: s.customAreas,
      selectedProcesses: s.selectedProcesses,
      customProcesses: s.customProcesses,
      aoaCount: areaCount,
      videoCount,
      pdfCount: s.pdfCount,
      // A new scope means a new recommendation; drop an earlier plan choice.
      chosenPlan: null,
      extraAreas: 0,
      extraVideos: 0,
    });
    await mirrorLead("scope", saved);
    router.push("/assessment/security");
  }

  const header = (
    <FunnelHeader
      step={1}
      title="What should your buyers see?"
      summary="Tap every area and process you would want a buyer to see. Each area becomes one AOA in your VPV, and each process becomes a short video of it running."
      image="factory-floor"
      imageAlt="A bright, orderly Indian factory floor with CNC machines"
      caption="Pick as many as you like"
    />
  );

  if (!s) {
    return (
      <>
        {header}
        <FunnelBody wide>
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
          <RestartNotice missing="your factory's city" />
        </FunnelBody>
      </>
    );
  }

  return (
    <>
      {header}
      <FunnelBody wide>
        <Card>
          <SectionTitle icon={Factory} title="Active Operational Areas" aside={<CountPill n={areaCount} unit="selected" />}>
            An Active Operational Area (AOA) is one place in your plant a buyer can stand in and look
            around, in 360°. Most plants pick between 6 and 15.
          </SectionTitle>
          {tried && areaCount < 1 && (
            <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-medium text-red-700">
              Pick at least one area to carry on.
            </p>
          )}
          {stars.areaIds.length > 0 && <StarLegend phase={stars.phase} />}
          <TileGrid
            items={FACTORY_AREAS}
            selected={s.selectedAreas}
            onToggle={(id) => setS({ ...s, selectedAreas: toggle(s.selectedAreas, id) })}
            starred={stars.areaIds}
            starLabel={starLabel}
          />
          <CustomAdder
            placeholder="Add an area that isn't listed"
            items={s.customAreas}
            onChange={(customAreas) => setS({ ...s, customAreas })}
          />
        </Card>

        <Card className="mt-6">
          <SectionTitle icon={Video} title="Process videos" aside={<CountPill n={videoCount} unit="selected" />}>
            A short clip of a process actually running. An area shows a buyer the place; a video shows
            them the work. {VIDEO_SHOT_NOTE}
          </SectionTitle>
          {stars.processIds.length > 0 && <StarLegend phase={stars.phase} />}
          <TileGrid
            items={FACTORY_PROCESSES}
            selected={s.selectedProcesses}
            onToggle={(id) => setS({ ...s, selectedProcesses: toggle(s.selectedProcesses, id) })}
            starred={stars.processIds}
            starLabel={starLabel}
          />
          <CustomAdder
            placeholder="Add a process that isn't listed"
            items={s.customProcesses}
            onChange={(customProcesses) => setS({ ...s, customProcesses })}
          />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-slate-500">
            <span>Each process you pick needs its machine running on shoot day.</span>
            {videoCount > 0 && (
              <button
                type="button"
                onClick={() => setS({ ...s, selectedProcesses: [], customProcesses: [] })}
                className="font-medium text-vpv-blue underline underline-offset-2"
              >
                I don&rsquo;t need process videos
              </button>
            )}
          </div>
        </Card>

        <Card className="mt-6">
          <SectionTitle icon={FileText} title="PDF reports">
            Certificates, test reports, datasheets or brochures a buyer can open from inside the tour.
            ISO certificates and material test reports are the usual ones. Leave it at zero if you
            would rather not; you can add them later from your dashboard.
          </SectionTitle>
          <div className="mt-5 pl-[60px]">
            <Counter value={s.pdfCount ?? 0} onChange={(n) => setS({ ...s, pdfCount: n })} min={0} max={40} suffix="PDFs" />
          </div>
        </Card>

        <div className="mt-8">
          <BackLink href="/assessment">Back to your details</BackLink>
        </div>
        {/* Room for the sticky bar so it never covers the last card. */}
        <div className="h-24" aria-hidden />
      </FunnelBody>

      {/* The running total of what they picked, always in reach. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-vpv-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3.5">
          <p className="text-[14px] text-slate-600">
            <span className="font-semibold text-vpv-ink">{summary}</span>
            <span className="hidden sm:inline"> selected</span>
          </p>
          <div className="shrink-0">
            <PrimaryButton onClick={() => void onSubmit()} busy={busy}>
              Continue
            </PrimaryButton>
          </div>
        </div>
      </div>
    </>
  );
}
