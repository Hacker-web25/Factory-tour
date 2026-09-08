import { forwardRef } from "react";
import {
  Circle,
  CircleDot,
  Info,
  Star,
  Plus,
  Link as LinkIcon,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Camera,
  Video,
  Diamond,
  MapPin,
  Play,
  HelpCircle,
  AlertCircle,
  Wrench,
  Mic,
  Volume2,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

/** Custom "target ring" — thick outer stroke ring with a small filled
 *  centre dot, with clear space between. Matches the "Admin Block"
 *  style marker used across the sample tours. Wrapped so it accepts
 *  the same props as any Lucide icon (color, size, strokeWidth). */
const TargetRing: LucideIcon = forwardRef<SVGSVGElement, LucideProps>(
  ({ size = 24, color = "currentColor", strokeWidth = 2, ...rest }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={Number(strokeWidth) + 0.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {/* Outer ring — noticeably thicker & wider than CircleDot */}
      <circle cx="12" cy="12" r="9" />
      {/* Solid centre dot — filled to match stroke colour */}
      <circle cx="12" cy="12" r="2.5" fill={color} stroke="none" />
    </svg>
  )
) as LucideIcon;
TargetRing.displayName = "TargetRing";

export type IconEntry = {
  key: string;
  label: string;
  Icon: LucideIcon;
};

/** Ordered library of built-in icons. Add more here to expand the picker. */
export const ICON_LIBRARY: IconEntry[] = [
  { key: "target-ring",  label: "Target ring",  Icon: TargetRing },
  { key: "circle",       label: "Circle",       Icon: Circle },
  { key: "circle-dot",   label: "Target",       Icon: CircleDot },
  { key: "info",         label: "Info",         Icon: Info },
  { key: "help",         label: "Help",         Icon: HelpCircle },
  { key: "alert",        label: "Alert",        Icon: AlertCircle },
  { key: "star",         label: "Star",         Icon: Star },
  { key: "plus",         label: "Plus",         Icon: Plus },
  { key: "link",         label: "Link",         Icon: LinkIcon },
  { key: "pin",          label: "Pin",          Icon: MapPin },
  { key: "wrench",       label: "Wrench",       Icon: Wrench },
  { key: "camera",       label: "Camera",       Icon: Camera },
  { key: "video",        label: "Video",        Icon: Video },
  { key: "play",         label: "Play",         Icon: Play },
  { key: "mic",          label: "Microphone",   Icon: Mic },
  { key: "speaker",      label: "Speaker",      Icon: Volume2 },
  { key: "diamond",      label: "Diamond",      Icon: Diamond },
  { key: "arrow-up",     label: "Arrow up",     Icon: ArrowUp },
  { key: "arrow-down",   label: "Arrow down",   Icon: ArrowDown },
  { key: "arrow-left",   label: "Arrow left",   Icon: ArrowLeft },
  { key: "arrow-right",  label: "Arrow right",  Icon: ArrowRight },
  { key: "chevron-up",   label: "Chevron up",   Icon: ChevronUp },
  { key: "chevron-down", label: "Chevron down", Icon: ChevronDown },
  { key: "chevron-left", label: "Chevron left", Icon: ChevronLeft },
  { key: "chevron-right",label: "Chevron right",Icon: ChevronRight },
];

export function findIcon(key: string | null): IconEntry | null {
  if (!key) return null;
  return ICON_LIBRARY.find((i) => i.key === key) ?? null;
}
