import type { LabelFont } from "./types";

export const FONT_MAP: Record<LabelFont, string> = {
  sans:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", Times, serif',
  mono: 'Menlo, Consolas, "Courier New", monospace',
  cursive: '"Brush Script MT", "Segoe Script", cursive',
  display: 'Impact, "Arial Black", "Helvetica Neue", sans-serif',
};

export const FONT_OPTIONS: { key: LabelFont; label: string }[] = [
  { key: "sans", label: "Sans" },
  { key: "serif", label: "Serif" },
  { key: "mono", label: "Monospace" },
  { key: "cursive", label: "Cursive" },
  { key: "display", label: "Display" },
];

export function fontFor(key: string | null | undefined): string {
  if (key && key in FONT_MAP) return FONT_MAP[key as LabelFont];
  return FONT_MAP.sans;
}
