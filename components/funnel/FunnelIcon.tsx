/**
 * Named icons for the funnel.
 *
 * lib/factoryAreas.ts names its icons as strings so it can stay plain data;
 * this maps those names to lucide-react components, explicitly, so only
 * the icons the funnel uses end up in the bundle.
 */

"use client";

import {
  Archive, BadgeCheck, Building2, ClipboardCheck, Cog, Construction, Cpu, Drill,
  Droplets, Factory, FireExtinguisher, FlaskConical, Flame, Forklift, Gauge,
  GraduationCap, Hammer, Layers, Lightbulb, Move, Package, PackageOpen, Recycle,
  RotateCw, ScanSearch, Scissors, Search, ShieldCheck, Sparkles, SprayCan, Syringe,
  Thermometer, Truck, UtensilsCrossed, Warehouse, Waves, Wrench, Zap,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Archive, BadgeCheck, Building2, ClipboardCheck, Cog, Construction, Cpu, Drill,
  Droplets, Factory, FireExtinguisher, FlaskConical, Flame, Forklift, Gauge,
  GraduationCap, Hammer, Layers, Lightbulb, Move, Package, PackageOpen, Recycle,
  RotateCw, ScanSearch, Scissors, Search, ShieldCheck, Sparkles, SprayCan, Syringe,
  Thermometer, Truck, UtensilsCrossed, Warehouse, Waves, Wrench, Zap,
};

export default function FunnelIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Factory;
  return <Icon className={className} aria-hidden strokeWidth={1.75} />;
}
