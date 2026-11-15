/**
 * Named icons for the funnel.
 *
 * lib/factoryAreas.ts names its icons as strings so it can stay plain data;
 * this maps those names to lucide-react components, explicitly, so only
 * the icons the funnel uses end up in the bundle. A test checks every name
 * in the catalogue is listed here.
 */

"use client";

import {
  Apple, Archive, Armchair, ArrowDownToLine, Atom, Axe, BadgeCheck, Bath, Battery, BatteryCharging,
  Beaker, Bean, Blend, Bolt, Box, Boxes, BrickWall, Building2, Cable, CakeSlice, Candy, Car,
  ChefHat, CircleDot, CircuitBoard, Citrus, ClipboardCheck, Coffee, Cog, Construction, Container,
  Cookie, CookingPot, Cpu, Croissant, CupSoda, Cylinder, Diamond, Disc, Drill, Droplet, Droplets,
  Factory, Fan, Filter, FireExtinguisher, Fish, Flame, FlameKindling, FlaskConical, FlaskRound,
  Footprints, Forklift, Frame, Gauge, Gem, Gift, GlassWater, GraduationCap, Grid3x3, Hammer,
  Heater, Lamp, Layers, Layers3, Leaf, Lightbulb, Microchip, Microscope, Milk, Monitor, Mountain,
  Move, Newspaper, Nut, Package, PackageCheck, PackageOpen, Paintbrush, Palette, Pickaxe, Pill,
  Pipette, Plug, Printer, Recycle, RotateCw, Rows3, Ruler, Scale, ScanBarcode, ScanLine,
  ScanSearch, Scissors, Scroll, Search, Shapes, Shield, ShieldCheck, Shirt, ShoppingBag,
  SlidersHorizontal, Snowflake, Sofa, Soup, Sparkles, Spline, SprayCan, SquareStack, Stamp, Store,
  Sun, Syringe, Tag, TestTube, TestTubes, Thermometer, ThermometerSnowflake, Timer, TreePine,
  Truck, UtensilsCrossed, Warehouse, WashingMachine, Waves, Wheat, Wind, Workflow, Wrench, Zap,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Apple, Archive, Armchair, ArrowDownToLine, Atom, Axe, BadgeCheck, Bath, Battery, BatteryCharging,
  Beaker, Bean, Blend, Bolt, Box, Boxes, BrickWall, Building2, Cable, CakeSlice, Candy, Car,
  ChefHat, CircleDot, CircuitBoard, Citrus, ClipboardCheck, Coffee, Cog, Construction, Container,
  Cookie, CookingPot, Cpu, Croissant, CupSoda, Cylinder, Diamond, Disc, Drill, Droplet, Droplets,
  Factory, Fan, Filter, FireExtinguisher, Fish, Flame, FlameKindling, FlaskConical, FlaskRound,
  Footprints, Forklift, Frame, Gauge, Gem, Gift, GlassWater, GraduationCap, Grid3x3, Hammer,
  Heater, Lamp, Layers, Layers3, Leaf, Lightbulb, Microchip, Microscope, Milk, Monitor, Mountain,
  Move, Newspaper, Nut, Package, PackageCheck, PackageOpen, Paintbrush, Palette, Pickaxe, Pill,
  Pipette, Plug, Printer, Recycle, RotateCw, Rows3, Ruler, Scale, ScanBarcode, ScanLine,
  ScanSearch, Scissors, Scroll, Search, Shapes, Shield, ShieldCheck, Shirt, ShoppingBag,
  SlidersHorizontal, Snowflake, Sofa, Soup, Sparkles, Spline, SprayCan, SquareStack, Stamp, Store,
  Sun, Syringe, Tag, TestTube, TestTubes, Thermometer, ThermometerSnowflake, Timer, TreePine,
  Truck, UtensilsCrossed, Warehouse, WashingMachine, Waves, Wheat, Wind, Workflow, Wrench, Zap,
};

export default function FunnelIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Factory;
  return <Icon className={className} aria-hidden strokeWidth={1.75} />;
}
