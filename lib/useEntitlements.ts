"use client";

/**
 * useEntitlements — the signed-in person's workspace, as lib/entitlements.ts
 * needs it, plus `access(key)` / `can(key)` and a way to ask for an upgrade.
 *
 * Returns `ready: false` while loading. Callers HIDE plan features until it
 * is ready, so nothing flashes open and then locks.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  accessTo,
  effectivePlan,
  nextPlan,
  planLimits,
  type Access,
  type FeatureKey,
  type WorkspaceFacts,
} from "@/lib/entitlements";

export type Entitlements = {
  ready: boolean;
  facts: WorkspaceFacts;
  orgId: string | null;
  access: (key: FeatureKey) => Access;
  can: (key: FeatureKey) => boolean;
  hidden: (key: FeatureKey) => boolean;
  limits: { videos: number; pdfs: number };
  plan: ReturnType<typeof effectivePlan>;
  next: ReturnType<typeof nextPlan>;
  /** Opens the upgrade pop-up for this feature (mounted once in the root layout). */
  askUpgrade: (key: FeatureKey) => void;
};

/** Open the upgrade pop-up from anywhere. */
export function requestUpgrade(key: FeatureKey): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("vpv:upgrade", { detail: { feature: key } }));
}

let cache: { at: number; orgId: string | null; facts: WorkspaceFacts } | null = null;
const CACHE_MS = 60_000;

export async function loadWorkspaceFacts(force = false): Promise<{ orgId: string | null; facts: WorkspaceFacts }> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache;
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) return { orgId: null, facts: {} };
  const { data: prof } = await supabase.from("profiles").select("role, org_id").eq("id", uid).maybeSingle();
  const role = (prof as { role?: string } | null)?.role ?? null;
  const orgId = (prof as { org_id?: string | null } | null)?.org_id ?? null;
  const facts: WorkspaceFacts = { role };
  if (orgId) {
    const { data: org } = await supabase.from("organizations").select("plan").eq("id", orgId).maybeSingle();
    facts.plan = (org as { plan?: string } | null)?.plan ?? null;
    // Read separately: a database without supabase/plan_features.sql /
    // sales_seats.sql still loads (as Confidence, no logins).
    const { data: sp } = await supabase.from("organizations").select("site_plan").eq("id", orgId).maybeSingle();
    facts.site_plan = (sp as { site_plan?: string | null } | null)?.site_plan ?? null;
    const { data: seats } = await supabase.from("organizations").select("sales_seats").eq("id", orgId).maybeSingle();
    facts.sales_seats = Number((seats as { sales_seats?: number } | null)?.sales_seats ?? 0) || 0;
  }
  cache = { at: Date.now(), orgId, facts };
  return cache;
}

export function useEntitlements(): Entitlements {
  const [state, setState] = useState<{ ready: boolean; orgId: string | null; facts: WorkspaceFacts }>({
    ready: false,
    orgId: null,
    facts: {},
  });

  useEffect(() => {
    let alive = true;
    const run = (force: boolean) =>
      loadWorkspaceFacts(force)
        .then((r) => alive && setState({ ready: true, ...r }))
        .catch(() => alive && setState({ ready: true, orgId: null, facts: {} }));
    void run(false);
    const onChanged = () => void run(true);
    window.addEventListener("vpv:billing-changed", onChanged);
    return () => {
      alive = false;
      window.removeEventListener("vpv:billing-changed", onChanged);
    };
  }, []);

  const access = useCallback(
    (key: FeatureKey): Access => (state.ready ? accessTo(state.facts, key) : { state: "hidden" }),
    [state]
  );

  return {
    ready: state.ready,
    facts: state.facts,
    orgId: state.orgId,
    access,
    can: (key) => access(key).state === "open",
    hidden: (key) => access(key).state === "hidden",
    limits: planLimits(state.facts),
    plan: effectivePlan(state.facts),
    next: nextPlan(state.facts),
    askUpgrade: requestUpgrade,
  };
}

/**
 * How many process videos and PDF reports the workspace already uses, across
 * all its tours: hotspots that open a video, and hotspots that open a PDF.
 */
export async function countOrgMedia(orgId: string | null): Promise<{ videos: number; pdfs: number }> {
  if (!orgId) return { videos: 0, pdfs: 0 };
  try {
    const { data: tours } = await supabase.from("tours").select("id").eq("org_id", orgId);
    const tourIds = ((tours ?? []) as { id: string }[]).map((t) => t.id);
    if (tourIds.length === 0) return { videos: 0, pdfs: 0 };
    const { data: scenes } = await supabase.from("scenes").select("id").in("tour_id", tourIds);
    const sceneIds = ((scenes ?? []) as { id: string }[]).map((s) => s.id);
    if (sceneIds.length === 0) return { videos: 0, pdfs: 0 };
    const count = async (action: string) => {
      const { count: n } = await supabase
        .from("hotspots")
        .select("id", { count: "exact", head: true })
        .in("scene_id", sceneIds)
        .eq("action", action);
      return n ?? 0;
    };
    return { videos: await count("video_popup"), pdfs: await count("pdf_popup") };
  } catch {
    return { videos: 0, pdfs: 0 };
  }
}

/** The plan's allowance is used up: say so, and offer the next plan if there is one. */
export function reportLimit(key: "process_videos" | "pdf_reports", used: number, max: number): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("vpv:upgrade", { detail: { feature: key, limit: { used, max } } }));
}
