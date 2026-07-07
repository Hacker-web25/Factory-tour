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
} from "lucide-react";

export type IconEntry = {
  key: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
};

/** Ordered library of built-in icons. Add more here to expand the picker. */
export const ICON_LIBRARY: IconEntry[] = [
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
