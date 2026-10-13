/**
 * AnalysisContext — the shape we pass to any analysis provider.
 *
 * The file is called `claude.ts` for history; the actual providers now
 * live in `geminiReport.ts` and `heuristicReport.ts`. Keeping the type
 * exported from here means nothing else had to move.
 */

export type AnalysisContext = {
  orgName: string | null;
  tourTitle: string | null;
  presenterName: string | null;
  clientLabel: string | null;
  startedAt: string | null;
  durationSec: number | null;
  place: string | null;
  scenesShown: { name: string; seconds: number }[];
  hotspotsOpened: string[];
};
