/**
 * Which audio file is this? One answer however its address is written.
 *
 * The same recording can be reached as a Supabase address (before the move to
 * Cloudflare), as a Cloudflare media address (after it), with or without a
 * "?token=…" on the end. All of those are the same file and must share one
 * transcript, so the key is built from "bucket/path" only — never from the host
 * or the query string.
 */

import { sha1Hex } from "@/lib/language/hash";

export type AudioKeyContext = {
  /** NEXT_PUBLIC_MEDIA_BASE_URL — the Cloudflare media Worker's address. */
  mediaBase?: string;
};

function decode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/** A readable, stable name for an audio address (also stored for humans to read). */
export function canonicalAudioRef(url: string, ctx: AudioKeyContext = {}): string {
  const raw = String(url ?? "").trim();
  if (!raw) return "";

  // A bare storage path ("tours/abc/voice.mp3") or a site-relative one ("/demo/a.mp3").
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw) && !raw.startsWith("//")) {
    const path = raw.split(/[?#]/)[0].replace(/^\/+/, "");
    return path.split("/").map(decode).join("/");
  }

  let u: URL;
  try {
    u = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
  } catch {
    return raw.split(/[?#]/)[0];
  }
  const segments = u.pathname.split("/").filter(Boolean).map(decode);

  // https://<project>.supabase.co/storage/v1/object/(public|sign|authenticated)/<bucket>/<path>
  const i = segments.indexOf("object");
  if (
    segments[0] === "storage" &&
    segments[1] === "v1" &&
    i === 2 &&
    ["public", "sign", "authenticated"].includes(segments[i + 1] ?? "") &&
    segments.length > i + 3
  ) {
    return segments.slice(i + 2).join("/");
  }

  // The Cloudflare media Worker serves /<bucket>/<path>.
  if (ctx.mediaBase) {
    try {
      const base = new URL(ctx.mediaBase);
      if (base.host.toLowerCase() === u.host.toLowerCase()) return segments.join("/");
    } catch {
      /* a bad base setting just means "not ours" */
    }
  }

  return `${u.host.toLowerCase()}/${segments.join("/")}`;
}

/** The 40-character key a transcript is stored under. */
export function audioKey(url: string, ctx: AudioKeyContext = {}): string {
  return sha1Hex(`audio:${canonicalAudioRef(url, ctx)}`);
}
