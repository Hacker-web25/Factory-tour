"use client";

/**
 * lib/dividerImage.ts — draws a unit's divider card: a white picture with the
 * unit's name in big black bold letters, and stores it like any other scene
 * picture.
 *
 * The text is part of the picture, so it looks the same in every viewer and in
 * a downloaded copy of the tour. The cost is that it cannot be translated;
 * the scene's own name (shown in the menu) still can.
 */

import { mediaStorage } from "@/lib/media";
import { ensurePreview } from "@/lib/scenePreview";
import { dividerFileName, layoutDividerText } from "@/lib/units";

const WIDTH = 4096;
const HEIGHT = 2048;
const FONT = '"Inter", "Helvetica Neue", Arial, sans-serif';

/** The divider card as a PNG. */
export async function drawDividerCard(title: string): Promise<Blob> {
  try {
    await document.fonts?.load(`800 100px ${FONT}`);
  } catch {
    /* the fallback fonts are fine */
  }
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw the divider card.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const measure = (text: string, size: number) => {
    ctx.font = `800 ${size}px ${FONT}`;
    return ctx.measureText(text).width;
  };
  const box = layoutDividerText(title, WIDTH, HEIGHT, measure);

  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${box.fontSize}px ${FONT}`;
  const lineHeight = box.fontSize * 1.12;
  const top = HEIGHT / 2 - ((box.lines.length - 1) * lineHeight) / 2;
  box.lines.forEach((line, i) => ctx.fillText(line, WIDTH / 2, top + i * lineHeight));

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not make the divider picture."))), "image/png"),
  );
}

/** Draws the card for `title`, stores it in the tour's folder, returns its path. */
export async function storeDividerCard(tourId: string, title: string): Promise<string> {
  const blob = await drawDividerCard(title);
  const name = dividerFileName(title).replace(/\.png$/, "");
  const path = `${tourId}/${name}-${crypto.randomUUID().slice(0, 8)}.png`;
  const { error } = await mediaStorage("panoramas").upload(path, blob, { cacheControl: "3600", contentType: "image/png", upsert: false });
  if (error) throw new Error(error.message || "Could not store the divider picture.");
  ensurePreview(path, blob);
  return path;
}
