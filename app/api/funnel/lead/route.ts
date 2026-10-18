/**
 * POST /api/funnel/lead — create or update the row behind one visitor's
 * journey through the pricing funnel.
 *
 * Called once per step, not once at the end. The first call (no `leadId`)
 * inserts the row and returns its id; every later call updates that row and
 * moves `stage` forward. That is deliberate: a visitor who priced ₹1.2 lakh
 * of Control and stopped at the bill is the most valuable call a rep can
 * make, and they only exist in the table if the row was written before the
 * payment was.
 *
 * Nothing here is trusted for money. The lead row records what the visitor
 * ASKED for; the amount actually charged is priced again from lib/pricing.ts
 * inside /api/billing/order. A tampered call can write a wrong number into
 * our own notes and nothing else.
 *
 * Writes go through the service role because funnel_leads has RLS on with no
 * public policy — the browser can neither read nor write it, not even its own
 * row. Failure is non-fatal by design: losing a lead note must never stop
 * somebody buying.
 */

import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/getClientIp";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  billingRateLimit,
  clean,
  fail,
  json,
  readJson,
  validEmail,
} from "@/lib/server/billingGuard";
import { canonicalIndianState } from "@/lib/indianStates";
import { canonicalIndustry } from "@/lib/industries";
import { describeSelection } from "@/lib/factoryAreas";
import { logisticsFor } from "@/lib/logistics";
import {
  clampExtraAreas,
  clampExtraVideos,
  isSitePlanId,
  siteQuote,
} from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;

const STAGES = ["info", "scope", "security", "plan", "billing", "paid"] as const;
type Stage = (typeof STAGES)[number];

function isStage(v: unknown): v is Stage {
  return typeof v === "string" && (STAGES as readonly string[]).includes(v);
}

/** A 10-digit Indian mobile, stored without spaces or a country code. */
function cleanPhone(v: unknown): string {
  const digits = clean(v, 24).replace(/\D/g, "");
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  return /^[6-9]\d{9}$/.test(local) ? local : "";
}

function intOrNull(v: unknown, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.max(0, Math.min(max, Math.round(v)));
}

export async function POST(req: Request) {
  const sb = supabaseAdmin();
  // No service key configured yet: say so plainly rather than pretending the
  // lead was saved. The funnel treats this as non-fatal and carries on.
  if (!sb) return json({ ok: false, error: "not_configured" }, 200);

  const read = await readJson(req, MAX_BODY_BYTES);
  if (!read.ok) return fail(read.status, read.error);
  const body = read.body;

  const ip = getClientIp(req.headers);
  const limit = await billingRateLimit(sb, `funnel_lead:ip:${ip}`, 40, 600);
  if (!limit.allowed) {
    return fail(429, "rate_limited", undefined, { "Retry-After": String(limit.retryAfter) });
  }

  const leadId = typeof body.leadId === "string" && body.leadId.length === 36 ? body.leadId : null;
  const stage: Stage = isStage(body.stage) ? body.stage : "info";

  /* ---- Build only the columns this step actually carries. ---- */
  const patch: Record<string, unknown> = { stage };

  const name = clean(body.name, 80);
  const email = clean(body.email, 254).toLowerCase();
  const phone = cleanPhone(body.phone);
  const company = clean(body.company, 120);

  if (name) patch.name = name;
  if (company) patch.company = company;
  if (phone) patch.phone = phone;
  if (email && validEmail(email)) patch.email = email;

  const industry = canonicalIndustry(body.industry, body.industryOther);
  if (industry) patch.industry = industry;

  // The city is the answer that prices the travel, so it is resolved here and
  // the tier stored alongside it — a rep should not have to look it up.
  const cityRaw = clean(body.factoryCity, 80);
  if (cityRaw) {
    const log = logisticsFor(cityRaw);
    patch.factory_city = log.city || cityRaw;
    patch.logistics_tier = log.tier;
    patch.city_needs_confirmation = log.needsConfirmation;
    const st = log.matched?.state ?? canonicalIndianState(body.factoryState);
    if (st) patch.factory_state = st;
  }

  const aoa = intOrNull(body.aoaCount, 200);
  const videos = intOrNull(body.videoCount, 100);
  const pdfs = intOrNull(body.pdfCount, 100);
  if (aoa !== null) patch.aoa_count = aoa;
  if (videos !== null) patch.video_count = videos;
  if (pdfs !== null) patch.pdf_count = pdfs;

  // The named areas and processes, for the rep's call. Only sent by step 2.
  if (Array.isArray(body.selectedAreas) || Array.isArray(body.customAreas)) {
    patch.areas = describeSelection(body.selectedAreas, body.customAreas, "area");
  }
  if (Array.isArray(body.selectedProcesses) || Array.isArray(body.customProcesses)) {
    patch.processes = describeSelection(body.selectedProcesses, body.customProcesses, "process");
  }

  if (typeof body.wantsSharingControls === "boolean") {
    patch.wants_sharing_controls = body.wantsSharingControls;
  }

  if (isSitePlanId(body.recommendedPlan)) patch.recommended_plan = body.recommendedPlan;

  // Re-price whatever plan they are looking at, so quoted_total_inr in our
  // notes is a number WE calculated and matches what they were shown.
  if (isSitePlanId(body.chosenPlan)) {
    const extraAreas = clampExtraAreas(body.extraAreas);
    const extraVideos = clampExtraVideos(body.extraVideos);
    patch.chosen_plan = body.chosenPlan;
    patch.extra_areas = extraAreas;
    patch.extra_videos = extraVideos;
    const q = siteQuote(body.chosenPlan, {
      extraAreas,
      extraVideos,
      city: typeof patch.factory_city === "string" ? patch.factory_city : undefined,
    });
    patch.quoted_total_inr = Math.round(q.totalInr);
  }

  // Two separate consents, because they are two separate things: the terms
  // are required to buy, agreeing to be contacted is not and must be its own
  // affirmative tick (DPDP Act — consent has to be specific, not bundled).
  if (body.termsAccepted === true) patch.terms_accepted_at = new Date().toISOString();
  // Step 1's single tick: Terms, Privacy Policy and the other policies.
  if (body.policiesAccepted === true) patch.policies_accepted_at = new Date().toISOString();
  if (typeof body.marketingConsent === "boolean") {
    patch.marketing_consent = body.marketingConsent;
    patch.marketing_consent_at = body.marketingConsent ? new Date().toISOString() : null;
  }

  try {
    if (leadId) {
      const { error } = await sb.from("funnel_leads").update(patch).eq("id", leadId);
      if (error) throw error;
      return json({ ok: true, leadId });
    }

    const { data, error } = await sb
      .from("funnel_leads")
      .insert({
        ...patch,
        ip,
        user_agent: clean(req.headers.get("user-agent"), 300),
        // Deduplicating on e-mail would overwrite a real second enquiry, so
        // every start is its own row. /admin groups them by e-mail instead.
      })
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return json({ ok: true, leadId: data?.id ?? null });
  } catch (err) {
    // Non-fatal on purpose: a lost note must never block a sale. Logged so
    // it shows up in Vercel's function logs rather than disappearing.
    // eslint-disable-next-line no-console
    console.warn("[funnel/lead] write failed:", err instanceof Error ? err.message : err);
    return json({ ok: false, error: "write_failed" }, 200);
  }
}

export function GET() {
  return NextResponse.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
}
