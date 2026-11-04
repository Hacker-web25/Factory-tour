/**
 * What the Beautify tool tells the person while it works: plain words, sizes,
 * speed and time left. Pure functions, so they are tested without a browser
 * (tests/beautify/progress.test.ts).
 */

export type AiPhase = "idle" | "checking" | "downloading" | "loading" | "working" | "ready" | "error";

export type AiStatus = {
  phase: AiPhase;
  /** Bytes downloaded so far / in the whole model file (0 while unknown). */
  loaded: number;
  total: number;
  /** 0..1 */
  fraction: number;
  /** Bytes per second, averaged over the last few seconds. */
  speed: number;
  /** Seconds left, or null when it cannot be told yet. */
  eta: number | null;
  detail: string;
  /** A passing problem the tool is working around (for example a dropped connection). */
  note: string;
  error: string | null;
};

export type ToolsStage = "idle" | "loading" | "compiling" | "ready" | "error";

export const INITIAL_AI: AiStatus = {
  phase: "idle",
  loaded: 0,
  total: 0,
  fraction: 0,
  speed: 0,
  eta: null,
  detail: "",
  note: "",
  error: null,
};

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 MB";
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(n >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function formatSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond < 1024) return "";
  return `${formatBytes(bytesPerSecond)}/s`;
}

/** "a few seconds", "42 s", "1 min 20 s", "2 h 5 min" */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "";
  const s = Math.round(seconds);
  if (s < 5) return "a few seconds";
  if (s < 60) return `${s} s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${m} min ${r} s` : `${m} min`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

export type AiView = {
  /** Short text for the button. */
  button: string;
  /** Headline of the progress card. */
  title: string;
  subtitle: string;
  /** 0..100 for a bar that fills, or null for a bar that just moves. */
  percent: number | null;
  /** The person can still back out (nothing has been changed yet). */
  cancellable: boolean;
};

export function describeAi(ai: AiStatus): AiView {
  switch (ai.phase) {
    case "checking":
      return {
        button: "Starting AI…",
        title: "Starting AI repair",
        subtitle: "Looking for the AI model on this computer",
        percent: null,
        cancellable: true,
      };
    case "downloading": {
      const pct = Math.min(100, Math.floor(ai.fraction * 100));
      if (!ai.total) {
        return {
          button: "Connecting…",
          title: "Downloading the AI model",
          subtitle: ai.note || "Connecting to the download server…",
          percent: null,
          cancellable: true,
        };
      }
      const bits = [`${formatBytes(ai.loaded)} of ${formatBytes(ai.total)}`];
      const sp = formatSpeed(ai.speed);
      if (sp) bits.push(sp);
      const left = ai.eta === null ? "" : formatDuration(ai.eta);
      bits.push(left ? `${left} left` : "working out the time left…");
      return {
        button: `Downloading AI ${pct}%`,
        title: `Downloading the AI model: ${pct}%`,
        subtitle: ai.note ? `${bits.join(" · ")}\n${ai.note}` : bits.join(" · "),
        percent: ai.fraction * 100,
        cancellable: true,
      };
    }
    case "loading":
      return {
        button: "Loading AI…",
        title: "Loading the AI model",
        subtitle: ai.detail || "Getting the model ready. This takes a moment.",
        percent: null,
        cancellable: true,
      };
    case "working":
      return {
        button: "Repairing…",
        title: "AI is repairing your picture",
        subtitle: ai.detail || "Repairing the painted area",
        percent: null,
        cancellable: false,
      };
    case "error":
      return {
        button: "✨ Repair (AI)",
        title: "AI repair could not run",
        subtitle: ai.error || "Something went wrong.",
        percent: null,
        cancellable: false,
      };
    default:
      return { button: "✨ Repair (AI)", title: "", subtitle: "", percent: null, cancellable: false };
  }
}

export function describeTools(stage: ToolsStage): string {
  switch (stage) {
    case "loading":
      return "Downloading tools…";
    case "compiling":
      return "Starting tools…";
    default:
      return "Preparing tools…";
  }
}
