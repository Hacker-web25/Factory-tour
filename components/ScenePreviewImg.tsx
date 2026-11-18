"use client";

/**
 * A scene's tile image: its own thumbnail if it has one, else the small
 * preview (lib/scenePreview), else, until the preview exists, the full
 * panorama. Loads only when scrolled into view and decodes off the main
 * thread. With `generate`, a missing preview is made in the background
 * (editor only: making one needs upload rights).
 */

import { useEffect, useState } from "react";
import { publicUrl } from "@/lib/supabase";
import { ensurePreview, onPreviewReady, previewIsReady, previewUrl } from "@/lib/scenePreview";

export default function ScenePreviewImg({
  imagePath,
  thumbnailPath,
  alt,
  className,
  generate = false,
  draggable,
}: {
  imagePath: string;
  thumbnailPath?: string | null;
  alt: string;
  className?: string;
  generate?: boolean;
  draggable?: boolean;
}) {
  const preview = thumbnailPath ? null : previewUrl(imagePath);
  const first = thumbnailPath ? publicUrl(thumbnailPath) : preview ?? publicUrl(imagePath);
  const [src, setSrc] = useState(first);
  // The server would not allow reading the picture (CORS): show it plainly.
  const [plain, setPlain] = useState(false);
  // A new scene picture (or thumbnail) starts over.
  useEffect(() => setSrc(first), [first]);

  // Once the preview has been made, switch the tile over to it.
  useEffect(() => {
    if (!preview) return;
    return onPreviewReady((p) => {
      if (p === imagePath) setSrc(`${preview}?v=1`);
    });
  }, [imagePath, preview]);

  // Showing the full panorama because the preview does not exist yet.
  const full = !!preview && !src.startsWith(preview) && src.startsWith(publicUrl(imagePath));
  const readable = full && generate && !plain;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={draggable}
      className={className}
      // Read with CORS so the picture already downloaded here can be shrunk
      // into the preview (no second download of the panorama).
      crossOrigin={readable ? "anonymous" : undefined}
      onLoad={(e) => {
        if (readable) ensurePreview(imagePath, e.currentTarget);
      }}
      onError={() => {
        if (readable) {
          setPlain(true);
          setSrc(`${publicUrl(imagePath)}#plain`);
          return;
        }
        if (preview && src.startsWith(preview)) {
          if (!previewIsReady(imagePath)) {
            // No preview yet: show the panorama now; it is made once that loads.
            setSrc(publicUrl(imagePath));
          } else {
            // The preview was just made but cannot be read yet: never leave
            // the tile blank, show the panorama (and do not make it again).
            setPlain(true);
            setSrc(`${publicUrl(imagePath)}#plain`);
          }
        }
      }}
    />
  );
}
