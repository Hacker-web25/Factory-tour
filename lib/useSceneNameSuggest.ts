"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ALL_AREAS } from "@/lib/factoryAreas";
import {
  buildVocab,
  sourcesFromServer,
  sourcesFromTour,
  suggest,
  type ServerNames,
  type Source,
  type Vocab,
} from "@/lib/sceneNames";

/**
 * Name completion for the scene-name boxes.
 *
 * It learns from three places, nearest first: the other scenes in this tour,
 * every scene name the signed-in person can see (and names many customers
 * use, from /api/scene-names), and a built-in list of factory areas. The
 * server's names are fetched once, the first time a name box gets focus, and
 * kept for ten minutes; until they arrive the built-in list and this tour's
 * names already work.
 */

const STALE_MS = 10 * 60_000;
let fetched: { at: number; sources: Source[] } | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

const SEEDS: Source[] = ALL_AREAS.map((a) => ({ text: a.name, weight: 1 }));

async function fetchNames(): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const res = await fetch("/api/scene-names", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const body = (await res.json()) as ServerNames;
    fetched = { at: Date.now(), sources: sourcesFromServer(body) };
    listeners.forEach((f) => f());
  } catch {
    /* the built-in list and this tour's names still work */
  }
}

/** Starts reading names from the server, once; harmless to call on every focus. */
export function warmSceneNames(): void {
  if (fetched && Date.now() - fetched.at < STALE_MS) return;
  if (inflight) return;
  inflight = fetchNames().finally(() => {
    inflight = null;
  });
}

/**
 * `scenes` is the tour being edited; `exceptId` is the scene whose name is being
 * typed, so what it used to be is not suggested back.
 */
export function useSceneNameSuggest(
  scenes: readonly { id: string; name: string | null }[],
  exceptId?: string
): { suggest: (typed: string) => string[]; warm: () => void } {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const f = () => setVersion((v) => v + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);

  // Rebuilt only when the set of names changes, not on every keystroke elsewhere.
  const tourKey = scenes
    .filter((s) => s.id !== exceptId)
    .map((s) => s.name ?? "")
    .join("\u0001");
  const vocab: Vocab = useMemo(
    () => buildVocab([...SEEDS, ...(fetched?.sources ?? []), ...sourcesFromTour(tourKey.split("\u0001"))]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tourKey, version]
  );

  const run = useCallback((typed: string) => suggest(vocab, typed).map((s) => s.text), [vocab]);
  return { suggest: run, warm: warmSceneNames };
}
