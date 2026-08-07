"use client";

import { useEffect, useState } from "react";

/**
 * Global fullscreen viewer for polygon media hotspots.
 *
 * Mounted once at the root layout so it's always available — whether
 * the visitor is inside the live TourPlayer OR the editor's Preview
 * mode, which uses PanoramaViewer directly (no TourPlayer wrapper) and
 * previously had no listener.
 *
 * Listens on `window` for `factour:polygon-fullscreen` events dispatched
 * by MediaQuad's onQuadClick. Renders the overlay in plain React DOM so
 * <video>/<img> tags aren't reconciled by @react-three/fiber (which
 * would explode trying to construct a THREE.Video object).
 */
export default function PolygonFullscreenViewer() {
  const [media, setMedia] = useState<
    | { kind: "video"; url: string }
    | { kind: "image"; url: string }
    | null
  >(null);

  useEffect(() => {
    function onOpen(e: Event) {
      const d = (e as CustomEvent).detail as {
        kind: "video" | "image";
        url: string;
      };
      setMedia(d);
    }
    window.addEventListener("factour:polygon-fullscreen", onOpen);
    return () =>
      window.removeEventListener("factour:polygon-fullscreen", onOpen);
  }, []);

  // Escape closes.
  useEffect(() => {
    if (!media) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMedia(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [media]);

  if (!media) return null;

  return (
    <div
      className="media-hs__fullscreen"
      onClick={() => setMedia(null)}
      style={{ zIndex: 20000 }}
    >
      <button
        className="media-hs__fullscreen-close"
        onClick={(e) => {
          e.stopPropagation();
          setMedia(null);
        }}
        aria-label="Close"
      >
        ×
      </button>
      {media.kind === "video" ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          src={media.url}
          controls
          autoPlay
          onClick={(e) => e.stopPropagation()}
          style={{
            maxWidth: "94vw",
            maxHeight: "94vh",
            width: "auto",
            height: "auto",
            objectFit: "contain",
            borderRadius: 6,
            background: "#000",
          }}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={media.url}
          alt=""
          onClick={(e) => e.stopPropagation()}
          style={{
            maxWidth: "94vw",
            maxHeight: "94vh",
            width: "auto",
            height: "auto",
            objectFit: "contain",
            borderRadius: 6,
          }}
        />
      )}
    </div>
  );
}
