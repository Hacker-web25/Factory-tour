"use client";

/**
 * Per-presentation session enrichment: GPS location + voice recording.
 *
 * Keyed by the analytics session_id so it lines up 1:1 with the session
 * stats derived from tour_events. All best-effort and non-blocking — a
 * failed geolocation or upload never breaks the tour for the presenter.
 */

import { supabase } from "@/lib/supabase";

export type PresentationSession = {
  session_id: string;
  tour_id: string | null;
  org_id: string | null;
  presenter_user_id: string | null;
  started_at: string;
  lat: number | null;
  lng: number | null;
  place: string | null;
  audio_path: string | null;
  duration_sec: number | null;
  transcript: string | null;
  topics: TopicHit[] | null;
  consent: boolean;
};

export type TopicHit = {
  key: string;
  label: string;
  detail: string;
  mentions: number;
};

/* --------------------------- Session start ------------------------------ */

/** Create the presentation_sessions row and (best-effort) attach the
 *  presenter's GPS location + a human place name. Safe to call once per
 *  presentation on session start. */
export async function startPresentationSession(args: {
  sessionId: string;
  tourId: string;
  orgId: string | null;
  presenterId: string | null;
}): Promise<void> {
  const { sessionId, tourId, orgId, presenterId } = args;
  // Insert the base row immediately so the session shows up even if the
  // user denies location.
  await supabase
    .from("presentation_sessions")
    .upsert(
      {
        session_id: sessionId,
        tour_id: tourId,
        org_id: orgId,
        presenter_user_id: presenterId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "session_id" }
    )
    .then(() => {});

  // Geolocation is async + permission-gated — enrich the row when it lands.
  const pos = await getPosition();
  if (!pos) return;
  const { latitude, longitude } = pos.coords;
  const place = await reverseGeocode(latitude, longitude);
  await supabase
    .from("presentation_sessions")
    .update({
      lat: latitude,
      lng: longitude,
      place,
      updated_at: new Date().toISOString(),
    })
    .eq("session_id", sessionId)
    .then(() => {});
}

function getPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
    );
  });
}

/** Free, no-key reverse geocode (BigDataCloud client endpoint, CORS-open). */
async function reverseGeocode(
  lat: number,
  lng: number
): Promise<string | null> {
  try {
    const r = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
    );
    if (!r.ok) return null;
    const d = await r.json();
    const parts = [
      d.locality || d.city,
      d.principalSubdivision,
      d.countryName,
    ].filter(Boolean);
    return parts.join(", ") || null;
  } catch {
    return null;
  }
}

/* --------------------------- Recording save ----------------------------- */

/** Upload the recorded audio + attach transcript & detected topics to the
 *  session row. */
export async function savePresentationRecording(args: {
  sessionId: string;
  blob: Blob;
  transcript: string;
  durationSec: number;
}): Promise<void> {
  const { sessionId, blob, transcript, durationSec } = args;
  let audioPath: string | null = null;
  try {
    const ext = blob.type.includes("mp4") ? "mp4" : "webm";
    const path = `${sessionId}.${ext}`;
    const { error } = await supabase.storage
      .from("recordings")
      .upload(path, blob, {
        contentType: blob.type || "audio/webm",
        upsert: true,
      });
    if (!error) audioPath = path;
  } catch {
    /* upload failed — still save transcript/topics */
  }

  const topics = detectTopics(transcript);
  await supabase
    .from("presentation_sessions")
    .update({
      audio_path: audioPath,
      duration_sec: durationSec,
      transcript: transcript || null,
      topics,
      consent: true,
      updated_at: new Date().toISOString(),
    })
    .eq("session_id", sessionId)
    .then(() => {});
}

/** Public URL for a stored recording. */
export function recordingUrl(audioPath: string | null): string | null {
  if (!audioPath) return null;
  const { data } = supabase.storage.from("recordings").getPublicUrl(audioPath);
  return data.publicUrl ?? null;
}

/* --------------------------- Topic detection ---------------------------- */

/** Keyword-driven topic detector — free + deterministic. Scans the
 *  presenter's transcript for the sales-relevant themes and reports which
 *  were covered, how strongly, and a short evidence snippet. A paid LLM can
 *  replace this later without changing the stored shape or the UI. */
const TOPIC_RULES: { key: string; label: string; terms: string[] }[] = [
  {
    key: "sales",
    label: "Sales pitch",
    terms: [
      "sell", "selling", "sale", "offer", "deal", "discount", "benefit",
      "value", "advantage", "quality", "best", "guarantee", "warranty",
      "trusted", "leading", "premium",
    ],
  },
  {
    key: "quotation",
    label: "Quotation / pricing",
    terms: [
      "price", "pricing", "cost", "quote", "quotation", "rate", "per unit",
      "budget", "payment", "invoice", "lakh", "crore", "rupee", "dollar",
      "inr", "gst", "moq", "order quantity",
    ],
  },
  {
    key: "location",
    label: "Location / logistics",
    terms: [
      "location", "address", "plant", "factory", "warehouse", "ship",
      "shipping", "delivery", "export", "import", "logistics", "transport",
      "distance", "port", "km", "kilometer",
    ],
  },
  {
    key: "product",
    label: "Product / process",
    terms: [
      "product", "machine", "machinery", "process", "manufacture",
      "manufacturing", "capacity", "production", "material", "spec",
      "specification", "line", "unit",
    ],
  },
  {
    key: "capacity",
    label: "Capacity / scale",
    terms: [
      "capacity", "output", "tonnes", "tons", "volume", "scale", "monthly",
      "annual", "throughput", "shift",
    ],
  },
  {
    key: "compliance",
    label: "Quality / compliance",
    terms: [
      "iso", "certified", "certification", "compliance", "standard", "audit",
      "lab", "laboratory", "testing", "safety",
    ],
  },
];

export function detectTopics(transcript: string): TopicHit[] {
  if (!transcript || !transcript.trim()) return [];
  const text = transcript.toLowerCase();
  const sentences = transcript
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const hits: TopicHit[] = [];
  for (const rule of TOPIC_RULES) {
    let mentions = 0;
    for (const term of rule.terms) {
      const re = new RegExp(`\\b${escapeRe(term)}\\b`, "gi");
      const m = text.match(re);
      if (m) mentions += m.length;
    }
    if (mentions === 0) continue;
    // Evidence — the first sentence that mentions any term.
    const detail =
      sentences.find((s) =>
        rule.terms.some((t) => new RegExp(`\\b${escapeRe(t)}\\b`, "i").test(s))
      ) ?? "";
    hits.push({
      key: rule.key,
      label: rule.label,
      detail: detail.length > 160 ? detail.slice(0, 157) + "…" : detail,
      mentions,
    });
  }
  hits.sort((a, b) => b.mentions - a.mentions);
  return hits;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* --------------------------- Loading (dashboard) ------------------------ */

/** Load all presentation_sessions for an org, keyed by session_id. */
export async function loadPresentationSessions(
  orgId: string
): Promise<Map<string, PresentationSession>> {
  const out = new Map<string, PresentationSession>();
  const since = new Date(
    Date.now() - 90 * 24 * 3600 * 1000
  ).toISOString();
  const { data } = await supabase
    .from("presentation_sessions")
    .select("*")
    .eq("org_id", orgId)
    .gte("started_at", since);
  for (const r of (data ?? []) as PresentationSession[]) {
    out.set(r.session_id, r);
  }
  return out;
}
