/**
 * Lazy-loads OpenCV.js from the official CDN on first call.
 *
 * OpenCV.js is a ~8 MB WebAssembly bundle. We don't want to pay that on
 * every page load — only load it when the user actually opens Beautify
 * mode. After the first load, the promise is cached so subsequent calls
 * resolve instantly.
 *
 * Usage:
 *   const cv = await loadOpenCV();
 *   const src = cv.imread(canvasEl);
 *   const mask = cv.imread(maskCanvasEl);
 *   const dst = new cv.Mat();
 *   cv.inpaint(src, mask, dst, 5, cv.INPAINT_TELEA);
 *   cv.imshow(outCanvas, dst);
 *   src.delete(); mask.delete(); dst.delete();
 */

let cvPromise: Promise<any> | null = null;

// URL for opencv.js on docs.opencv.org — official CDN, always latest 4.x.
const OPENCV_URL = "https://docs.opencv.org/4.x/opencv.js";

export function loadOpenCV(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("OpenCV can only load in the browser"));
  }
  if (cvPromise) return cvPromise;

  cvPromise = new Promise((resolve, reject) => {
    // Already loaded? (e.g. hot-reload)
    if ((window as any).cv && (window as any).cv.Mat) {
      resolve((window as any).cv);
      return;
    }

    // Set the callback OpenCV.js looks for once its WASM finishes booting.
    (window as any).Module = {
      onRuntimeInitialized() {
        // OpenCV attaches itself to window.cv when ready.
        if ((window as any).cv) {
          resolve((window as any).cv);
        } else {
          reject(new Error("OpenCV loaded but cv global missing"));
        }
      },
    };

    // Inject the script tag.
    const script = document.createElement("script");
    script.src = OPENCV_URL;
    script.async = true;
    script.onerror = () =>
      reject(new Error("Failed to fetch opencv.js from CDN"));
    document.head.appendChild(script);
  });

  return cvPromise;
}
