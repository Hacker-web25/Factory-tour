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
  // A new scene picture (or thumbnail) starts over.
  useEffect(() => setSrc(first), [first]);

  // Once the preview has been made, switch the tile over to it.
  useEffect(() => {
    if (!preview) return;
    return onPreviewReady((p) => {
      if (p === imagePath) setSrc(`${preview}?v=1`);
    });
  }, [imagePath, preview]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={draggable}
      className={className}
      onError={() => {
        // No preview yet: show the panorama now, and have one made.
        if (preview && src.startsWith(preview) && !previewIsReady(imagePath)) {
          setSrc(publicUrl(imagePath));
          if (generate) ensurePreview(imagePath);
        }
      }}
    />
  );
}
