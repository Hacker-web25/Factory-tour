"use client";

/**
 * Pricing-tier helper.
 *
 * One place that owns the "what does this plan unlock" rules. Every
 * feature gate — the Present pop-up, the discount counter, the editor
 * hidden-scene banner, future per-feature gates — reads from here, so
 * we never end up with a stale check in some out-of-the-way file.
 *
 * The server also enforces plan limits (RPCs, API routes, the
 * `public_tour_scenes` function); this file is for the DASHBOARD UX
 * and nothing else, so a tampered client can't buy itself a feature.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  PRO_MONTHLY_INR,
  SCENE_MIN,
  ULTRA_MONTHLY_INR,
  inr,
  priceForScenes,
} from "@/lib/pricing";

export type Plan = "basic" | "pro" | "ultra";

export const PLAN_LABEL: Record<Plan, string> = {
  basic: "Basic",
  pro: "Pro",
  ultra: "Ultra",
};

/**
 * Display prices for the counter and the upgrade modal. All of them come
 * from lib/pricing.ts, so the dashboard can never pitch a price the
 * checkout does not honour.
 *
 * Basic is the entry price (the smallest pack) because it varies with
 * the number of scenes; Pro and Ultra are monthly.
 */
export const PLAN_PRICE_INR: Record<Plan, number> = {
  basic: priceForScenes(SCENE_MIN),
  pro: PRO_MONTHLY_INR,
  ultra: ULTRA_MONTHLY_INR,
};

/** How a plan's price should be read out loud. */
export const PLAN_PRICE_SUFFIX: Record<Plan, string> = {
  basic: "one time",
  pro: "per month",
  ultra: "per month",
};

/** rupees → "₹9,000" / "₹15,000", Indian numbering. */
export function formatInr(n: number): string {
  return inr(n);
}

/** The tier the counter / modal pitches to someone currently on `plan`.
 *  Ultra has nothing above it. */
export function upsellTarget(plan: Plan): Plan | null {
  if (plan === "basic") return "pro";
  if (plan === "pro") return "ultra";
  return null;
}

/** TRUE while nothing confirms we're on `plan` or anything above it. We
 *  default to "assume gated" so a slow network can't briefly unlock
 *  paid features (which would be jarring to re-lock after the plan
 *  loads). */
export function planAtLeast(current: Plan | null, target: Plan): boolean {
  if (!current) return false;
  const rank: Record<Plan, number> = { basic: 0, pro: 1, ultra: 2 };
  return rank[current] >= rank[target];
}

/** Fallback when an org's quota cannot be read. The server
 *  (`public_tour_scenes`) is authoritative; this is only for the
 *  editor's "hidden from your customers" banner, and it errs on the
 *  strict side so we never imply a customer sees more than they do. */
export const BASIC_SCENE_CAP = SCENE_MIN;

/* ---------- React hooks ------------------------------------------------ */

/** Load an org's plan (and scene cap). Returns `null` while loading so
 *  callers can wait before gating UI; a failed/absent lookup resolves
 *  to BASIC — the strictest tier — so we never show paid chrome to
 *  someone whose plan we couldn't read. */
export function useOrgPlan(orgId: string | null | undefined): {
  plan: Plan | null;
  sceneCap: number;
  loading: boolean;
} {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [sceneCap, setSceneCap] = useState<number>(BASIC_SCENE_CAP);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!orgId) {
      setPlan(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const { data } = await supabase
          .from("organizations")
          .select("plan, scene_quota, basic_scene_cap")
          .eq("id", orgId)
          .maybeSingle();
        if (cancelled) return;
        const row = data as
          | { plan?: string; scene_quota?: number | null; basic_scene_cap?: number }
          | null;
        const raw = row?.plan;
        const resolved: Plan =
          raw === "ultra" ? "ultra" : raw === "pro" ? "pro" : "basic";
        // scene_quota is the current column; basic_scene_cap is the
        // older one, kept so an org provisioned before the billing
        // migration still reports the right number.
        const quota = row?.scene_quota ?? row?.basic_scene_cap ?? BASIC_SCENE_CAP;
        setPlan(resolved);
        setSceneCap(Math.max(1, quota));
      } catch {
        if (!cancelled) setPlan("basic");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return { plan, sceneCap, loading };
}

/* ---------- Upgrade CTA target ----------------------------------------
   Pro and Ultra are monthly plans we agree in conversation, so the
   upgrade button goes to the enquiry form on the pricing page rather
   than to a checkout. A Basic customer who only needs a few more rooms
   is better served by the scene top-up on /billing, which IS a
   checkout — the modal links to both. */
export const UPGRADE_CTA_URL = "/pricing#talk";

/** Where a Basic customer buys more scenes for themselves. */
export const ADD_SCENES_URL = "/billing";
