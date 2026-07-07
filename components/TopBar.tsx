"use client";

import Link from "next/link";
import { Factory, Upload, LayoutDashboard } from "lucide-react";

export default function TopBar() {
  return (
    <header className="h-14 border-b border-border flex items-center px-4 gap-6 bg-panel">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <Factory size={20} className="text-accent" />
        Factory Tour
      </Link>
      <nav className="flex items-center gap-4 text-sm text-neutral-300">
        <Link href="/" className="flex items-center gap-1 hover:text-white">
          <LayoutDashboard size={16} /> Dashboard
        </Link>
        <Link href="/upload" className="flex items-center gap-1 hover:text-white">
          <Upload size={16} /> Upload
        </Link>
      </nav>
    </header>
  );
}
