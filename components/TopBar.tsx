"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Menu,
  Compass,
  Rss,
  Upload,
  LifeBuoy,
  Factory,
  LogOut,
  LogIn,
  Users,
  ShieldCheck,
} from "lucide-react";
import { getMyProfile, signOut, type Profile } from "@/lib/auth";

/**
 * Slim, dark top bar shared across pages.
 *
 *  - Nav links (Explore / Feed / Upload / Support) render only for the
 *    `owner` role; other roles get the pages the guards allow them to
 *    reach anyway, so cluttering the bar with unreachable links is a
 *    tell-clients-they're-missing-something bad UX.
 *  - Right-side action: Sign in when logged out, Sign out when logged in.
 *  - Owner also gets Admin + Team quick-links so they don't have to type
 *    the URLs.
 */
export default function TopBar({
  variant = "app",
}: {
  variant?: "app" | "minimal";
}) {
  const pathname = usePathname();
  const router = useRouter();
  const on = (href: string) => pathname === href;

  const [profile, setProfile] = useState<Profile | null | undefined>(
    undefined
  );

  useEffect(() => {
    (async () => {
      setProfile(await getMyProfile());
    })();
  }, [pathname]);

  const isOwner = profile?.role === "owner";
  const isLoggedIn = !!profile;

  async function onSignOut() {
    await signOut();
    router.push("/login");
  }

  return (
    <header className="h-12 bg-chrome border-b border-border flex items-center px-3 gap-1 text-[13px] relative select-none">
      <button
        className="p-1.5 text-neutral-400 hover:text-white rounded"
        title="Menu"
        aria-label="Menu"
      >
        <Menu size={16} />
      </button>

      {variant === "app" && isOwner && (
        <nav className="flex items-center gap-0.5 ml-1">
          <NavLink href="/" active={on("/")} icon={<Compass size={14} />}>
            Explore
          </NavLink>
          <NavLink
            href="/upload"
            active={on("/upload")}
            icon={<Upload size={14} />}
          >
            Upload
          </NavLink>
          <NavLink
            href="/admin"
            active={on("/admin")}
            icon={<ShieldCheck size={14} />}
          >
            Admin
          </NavLink>
          <NavLink
            href="/admin/tours"
            active={on("/admin/tours")}
            icon={<Upload size={14} />}
          >
            Assign
          </NavLink>
          <NavLink
            href="/team"
            active={on("/team")}
            icon={<Users size={14} />}
          >
            Team
          </NavLink>
        </nav>
      )}

      {/* Center brand */}
      <Link
        href="/"
        className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 font-semibold text-[15px] tracking-tight hover:opacity-90"
        aria-label="Factory Tour home"
      >
        <Factory size={16} className="text-accent" />
        Factory Tour
      </Link>

      <div className="flex-1" />

      {/* Right-side auth action */}
      {profile === undefined ? null : isLoggedIn ? (
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] text-neutral-500 hidden sm:inline truncate max-w-[180px]"
            title={profile.email}
          >
            {profile.full_name || profile.email}
          </span>
          <button
            onClick={onSignOut}
            className="chip !py-1 flex items-center gap-1"
            title="Sign out"
          >
            <LogOut size={12} /> Sign out
          </button>
        </div>
      ) : (
        <Link
          href="/login"
          className="chip !py-1 flex items-center gap-1"
          title="Sign in"
        >
          <LogIn size={12} /> Sign in
        </Link>
      )}
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
