"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Compass, Rss, Upload, LifeBuoy, Factory } from "lucide-react";

/**
 * Slim, dark top bar shared across public pages (Dashboard, Upload).
 * Layout: hamburger + left-aligned text nav, centered brand, right-side actions.
 * Editor pages use their own inline header instead of this component.
 */
export default function TopBar({
  variant = "app",
}: {
  variant?: "app" | "minimal";
}) {
  const pathname = usePathname();
  const on = (href: string) => pathname === href;

  return (
    <header className="h-12 bg-chrome border-b border-border flex items-center px-3 gap-1 text-[13px] relative select-none">
      {/* Left: hamburger + nav links */}
      <button
        className="p-1.5 text-neutral-400 hover:text-white rounded"
        title="Menu"
        aria-label="Menu"
      >
        <Menu size={16} />
      </button>

      {variant === "app" && (
        <nav className="flex items-center gap-0.5 ml-1">
          <NavLink href="/" active={on("/")} icon={<Compass size={14} />}>
            Explore
          </NavLink>
          <NavLink href="/" active={false} icon={<Rss size={14} />}>
            Feed
          </NavLink>
          <NavLink
            href="/upload"
            active={on("/upload")}
            icon={<Upload size={14} />}
          >
            Upload
          </NavLink>
          <NavLink href="/" active={false} icon={<LifeBuoy size={14} />}>
            Support
          </NavLink>
        </nav>
      )}

      {/* Center: brand mark */}
      <Link
        href="/"
        className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 font-semibold text-[15px] tracking-tight hover:opacity-90"
        aria-label="Factory Tour home"
      >
        <Factory size={16} className="text-accent" />
        Factory Tour
      </Link>

      <div className="flex-1" />
    </header>
  );
}

function NavLink({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded transition-colors ${
        active
          ? "text-white"
          : "text-neutral-400 hover:text-white hover:bg-panelSoft"
      }`}
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
}
