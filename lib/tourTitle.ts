/**
 * Renaming a tour from the dashboard. Pure function so the rules are easy to
 * test and the same everywhere: tidy the spaces, cap the length, and never
 * save an empty name.
 */

/** Longest tour name we keep. Longer pastes are cut, not rejected. */
export const MAX_TOUR_TITLE = 120;

/**
 * What to save when someone types `input` as the new name of a tour that is
 * currently called `current`.
 *
 * Returns the cleaned name to save, or `null` when nothing should be saved:
 * the box was left empty (we keep the old name rather than blank it) or the
 * cleaned name is the same as the current one.
 */
export function nextTourTitle(input: string, current: string): string | null {
  const cleaned = input
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TOUR_TITLE)
    .trim();
  if (!cleaned) return null;
  if (cleaned === current.trim()) return null;
  return cleaned;
}
