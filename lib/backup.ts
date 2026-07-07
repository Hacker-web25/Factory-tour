/**
 * .factour backup format
 * -----------------------
 * Layout of the file bytes:
 *   [4 bytes magic "FCTR"] [1 byte version] [N bytes gzip(XOR(json))]
 *
 * The XOR + custom container is intentional obfuscation, not real security —
 * enough to guarantee the file won't open in a standard editor / archive tool
 * and to signal that this file "belongs to" the Factory Tour app.
 *
 * The JSON payload embeds:
 *   - the tour row
 *   - every scene row + its panorama image bytes as base64
 *   - every hotspot row + any uploaded icon/image bytes as base64
 *
 * Import creates a NEW tour (fresh UUIDs) and remaps `target_scene_id`
 * references from old scene ids to the newly-created ones.
 */

import { supabase, publicUrl } from "./supabase";
import type { Hotspot, Scene, Tour } from "./types";

const MAGIC = new Uint8Array([0x46, 0x43, 0x54, 0x52]); // "FCTR"
const VERSION = 1;
const KEY = new TextEncoder().encode("factour-tour-backup-v1-9c4fce8d");

type ExportedScene = Scene & { image_data: string; image_mime: string };
type ExportedHotspot = Hotspot & {
  icon_url_data?: string;
  icon_url_mime?: string;
  image_url_data?: string;
  image_url_mime?: string;
};

type BackupPayload = {
  version: number;
  format: "factour";
  exported_at: string;
  tour: Tour;
  scenes: ExportedScene[];
  hotspots: ExportedHotspot[];
};

/* ---------------------------------- EXPORT --------------------------------- */

export async function exportTourToBlob(
  tourId: string
): Promise<{ blob: Blob; filename: string }> {
  const { data: tour, error: tourErr } = await supabase
    .from("tours")
    .select("*")
    .eq("id", tourId)
    .single();
  if (tourErr || !tour) throw new Error("Tour not found");

  const { data: sceneRows } = await supabase
    .from("scenes")
    .select("*")
    .eq("tour_id", tourId)
    .order("order_index");
  const scenes = (sceneRows ?? []) as Scene[];

  const sceneIds = scenes.map((s) => s.id);
  let hotspots: Hotspot[] = [];
  if (sceneIds.length) {
    const { data: hs } = await supabase
      .from("hotspots")
      .select("*")
      .in("scene_id", sceneIds);
    hotspots = (hs ?? []) as Hotspot[];
  }

  // Download each panorama into base64
  const scenesWithImages: ExportedScene[] = await Promise.all(
    scenes.map(async (s) => {
      const asset = await fetchAsBase64(publicUrl(s.image_path));
      if (!asset) throw new Error(`Failed to fetch panorama for scene "${s.name}"`);
      return { ...s, image_data: asset.data, image_mime: asset.mime };
    })
  );

  // Download uploaded icons / hotspot images
  const hotspotsWithAssets: ExportedHotspot[] = await Promise.all(
    hotspots.map(async (h) => {
      const out: ExportedHotspot = { ...h };
      if (h.icon_url) {
        const asset = await fetchAsBase64(h.icon_url);
        if (asset) {
          out.icon_url_data = asset.data;
          out.icon_url_mime = asset.mime;
        }
      }
      if (h.image_url && h.image_url !== h.icon_url) {
        const asset = await fetchAsBase64(h.image_url);
        if (asset) {
          out.image_url_data = asset.data;
          out.image_url_mime = asset.mime;
        }
      }
      return out;
    })
  );

  const payload: BackupPayload = {
    version: VERSION,
    format: "factour",
    exported_at: new Date().toISOString(),
    tour: tour as Tour,
    scenes: scenesWithImages,
    hotspots: hotspotsWithAssets,
  };

  const blob = await encodePayload(payload);
  const safeName = (tour.title || "tour")
    .replace(/[^a-z0-9-_ ]+/gi, "")
    .replace(/\s+/g, "_")
    .slice(0, 40) || "tour";
  return { blob, filename: `${safeName}.factour` };
}

/* ---------------------------------- IMPORT --------------------------------- */

export async function importTourFromFile(
  file: File
): Promise<{ tourId: string }> {
  const payload = await decodePayload(file);
  if (payload.format !== "factour") {
    throw new Error("Not a Factour backup file");
  }

  // 1) Create the new tour shell
  const { data: newTour, error: tErr } = await supabase
    .from("tours")
    .insert({
      title: (payload.tour.title || "Untitled tour") + " (imported)",
      description: payload.tour.description ?? null,
      published: false,
      // preserve the reading direction from the backup
      mirrored: payload.tour.mirrored ?? false,
    })
    .select()
    .single();
  if (tErr || !newTour) throw new Error(tErr?.message ?? "Failed to create tour");

  // 2) Recreate scenes + upload their panoramas
  const sceneIdMap = new Map<string, string>();
  for (const s of payload.scenes) {
    const blob = base64ToBlob(s.image_data, s.image_mime);
    const ext = extForMime(s.image_mime);
    const path = `${newTour.id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("panoramas")
      .upload(path, blob);
    if (upErr) throw new Error(`Scene upload failed: ${upErr.message}`);

    const { data: newScene, error: sErr } = await supabase
      .from("scenes")
      .insert({
        tour_id: newTour.id,
        name: s.name,
        image_path: path,
        order_index: s.order_index,
        initial_yaw: s.initial_yaw,
        initial_pitch: s.initial_pitch,
      })
      .select()
      .single();
    if (sErr || !newScene) throw new Error(sErr?.message ?? "Scene insert failed");

    sceneIdMap.set(s.id, newScene.id);
  }

  // 3) Recreate hotspots (re-upload assets, remap scene refs)
  for (const h of payload.hotspots) {
    const newSceneId = sceneIdMap.get(h.scene_id);
    if (!newSceneId) continue;

    let iconUrl = h.icon_url;
    if (h.icon_url_data && h.icon_url_mime) {
      const path = `icons/${crypto.randomUUID()}.${extForMime(h.icon_url_mime)}`;
      const b = base64ToBlob(h.icon_url_data, h.icon_url_mime);
      const { error } = await supabase.storage.from("panoramas").upload(path, b);
      if (!error) iconUrl = publicUrl(path);
    }

    let imgUrl = h.image_url;
    if (h.image_url_data && h.image_url_mime) {
      const path = `icons/${crypto.randomUUID()}.${extForMime(h.image_url_mime)}`;
      const b = base64ToBlob(h.image_url_data, h.image_url_mime);
      const { error } = await supabase.storage.from("panoramas").upload(path, b);
      if (!error) imgUrl = publicUrl(path);
    }

    const newTargetSceneId = h.target_scene_id
      ? sceneIdMap.get(h.target_scene_id) ?? null
      : null;

    const insert: Record<string, unknown> = { ...h };
    // scrub fields that shouldn't be re-inserted verbatim
    delete insert.id;
    delete insert.created_at;
    delete insert.icon_url_data;
    delete insert.icon_url_mime;
    delete insert.image_url_data;
    delete insert.image_url_mime;
    insert.scene_id = newSceneId;
    insert.icon_url = iconUrl;
    insert.image_url = imgUrl;
    insert.target_scene_id = newTargetSceneId;

    await supabase.from("hotspots").insert(insert);
  }

  return { tourId: newTour.id };
}

/* --------------------------------- Helpers --------------------------------- */

async function encodePayload(payload: BackupPayload): Promise<Blob> {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(payload));
  const obf = xorBytes(jsonBytes, KEY);
  const compressed = await gzipCompress(obf);
  const header = new Uint8Array(MAGIC.length + 1);
  header.set(MAGIC, 0);
  header[MAGIC.length] = VERSION;
  const out = new Uint8Array(header.length + compressed.length);
  out.set(header, 0);
  out.set(compressed, header.length);
  return new Blob([out], { type: "application/octet-stream" });
}

async function decodePayload(file: File): Promise<BackupPayload> {
  const buf = new Uint8Array(await file.arrayBuffer());
  for (let i = 0; i < MAGIC.length; i++) {
    if (buf[i] !== MAGIC[i]) {
      throw new Error("Not a Factour backup file (bad header)");
    }
  }
  const version = buf[MAGIC.length];
  if (version !== VERSION) {
    throw new Error(`Unsupported backup version: ${version}`);
  }
  const body = buf.slice(MAGIC.length + 1);
  const inflated = await gzipDecompress(body);
  const json = new TextDecoder().decode(xorBytes(inflated, KEY));
  return JSON.parse(json) as BackupPayload;
}

function xorBytes(input: Uint8Array, key: Uint8Array): Uint8Array {
  const out = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = input[i] ^ key[i % key.length];
  return out;
}

async function gzipCompress(data: Uint8Array): Promise<Uint8Array> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CS = (globalThis as any).CompressionStream;
  if (!CS) throw new Error("CompressionStream is not available in this browser");
  const stream = new Blob([data]).stream().pipeThrough(new CS("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gzipDecompress(data: Uint8Array): Promise<Uint8Array> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const DS = (globalThis as any).DecompressionStream;
  if (!DS) throw new Error("DecompressionStream is not available in this browser");
  const stream = new Blob([data]).stream().pipeThrough(new DS("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function fetchAsBase64(
  url: string
): Promise<{ data: string; mime: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return { data: await blobToBase64(blob), mime: blob.type };
  } catch {
    return null;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = r.result as string;
      resolve(s.substring(s.indexOf(",") + 1));
    };
    r.onerror = () => reject(new Error("Failed to encode blob"));
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function extForMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("svg")) return "svg";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
