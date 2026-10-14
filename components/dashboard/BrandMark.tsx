"use client";

/**
 * BrandMark — the VPV logo image, with a plain "VPV" wordmark as the
 * fallback if the file cannot be loaded, so a header never shows a
 * broken-image icon.
 */

import { useEffect, useRef, useState } from "react";

export default function BrandMark({
  src,
  height,
  alt,
}: {
  src: string;
  height: number;
  alt: string;
}) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // The image may fail while the page is still hydrating, before React
  // has attached onError. Check once after mount.
  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) {
    return (
      <span
        role="img"
        aria-label={alt}
        className="font-extrabold tracking-tight bg-vpv-grad bg-clip-text text-transparent"
        style={{ fontSize: Math.round(height * 0.95), lineHeight: 1 }}
      >
        VPV
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      style={{ height, width: "auto", display: "block" }}
      draggable={false}
    />
  );
}
