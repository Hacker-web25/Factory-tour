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

export type Plan = "basic" | "pro" | "ultra";

export const PLAN_LABEL: Record<Plan, string> = {
  basic: "Basic",
  pro: "Pro",
  ultra: "Ultra",
};

/** Display prices used by the counter + upgrade modal. Change in one
 *  place; both surfaces update. */
export const PLAN_PRICE_INR: Record<Plan, number> = {
  basic: 30_000,
  pro: 1_20_000,
  ultra: 3_00_000,
};

/** rupees → "₹30,000" / "₹1,20,000". Uses the Indian numbering system. */
export function formatInr(n: number): string {
  return "₹" + n.toLocaleString("en-IN");
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

/** How many scenes BASIC viewers see on the public viewer. The server
 *  (`public_tour_scenes` RPC) is authoritative; this constant is used
 *  only by the editor's "hidden to Basic viewers" banner. Keep in sync
 *  with `organizations.basic_scene_cap` default. */
export const BASIC_SCENE_CAP = 2;

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
          .select("plan, basic_scene_cap")
          .eq("id", orgId)
          .maybeSingle();
        if (cancelled) return;
        const raw = (data as { plan?: string } | null)?.plan;
        const resolved: Plan =
          raw === "ultra" ? "ultra" : raw === "pro" ? "pro" : "basic";
        const cap =
          (data as { basic_scene_cap?: number } | null)?.basic_scene_cap ??
          BASIC_SCENE_CAP;
        setPlan(resolved);
        setSceneCap(Math.max(1, Math.min(10, cap)));
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
   Right now "upgrade" opens WhatsApp to the sales number (manual
   billing is the right call until the first 20 customers). When we
   wire Razorpay later, swap this to `/upgrade?target=<plan>`. */
export const UPGRADE_CTA_URL =
  "https://wa.me/919999999999?text=" +
  encodeURIComponent("Hi, I'd like to upgrade my VPV plan.");
