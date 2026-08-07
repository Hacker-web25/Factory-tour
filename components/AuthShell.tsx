"use client";

import { Factory, BarChart3, Users, Share2, ShieldCheck } from "lucide-react";

/**
 * Shared split-screen chrome for the auth pages (login + signup).
 *
 * Left: brand + hero copy + a small feature badge cluster. Serves as a
 *       marketing panel so the auth screen doesn't feel bare, without
 *       requiring a heavy 3D asset.
 * Right: the actual auth form — passed in as `children` so each page
 *        can render its own inputs and buttons.
 *
 * Below `md`, the left panel collapses out of view and the form takes
 * the full width so mobile users aren't scrolled to a giant hero.
 */
export default function AuthShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full bg-black text-white flex flex-col md:flex-row">
      {/* ---------- LEFT (brand + hero) ---------- */}
      <div className="hidden md:flex md:w-1/2 lg:w-3/5 relative overflow-hidden">
        {/* Layered gradients — a soft violet glow bottom-left plus a
            teal-tinted radial top-right for depth. Pure CSS, no assets. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(1200px 800px at 20% 100%, rgba(124, 92, 255, 0.25), transparent 60%), radial-gradient(900px 600px at 90% 0%, rgba(34, 211, 238, 0.12), transparent 55%), #06070b",
          }}
        />
        {/* Subtle grid overlay for the "engineering" feel. */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />

        <div className="relative z-10 flex flex-col justify-between p-10 lg:p-14 w-full">
          {/* Wordmark */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-400 grid place-items-center shadow-[0_6px_24px_rgba(124,92,255,0.35)]">
              <Factory size={20} className="text-white" />
            </div>
            <div>
              <div className="text-[15px] font-semibold tracking-[0.18em]">
                FACTORY&nbsp;TOUR
              </div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-white/40">
                See your factory. Anywhere.
              </div>
            </div>
          </div>

          {/* Hero copy */}
          <div className="max-w-lg">
            <h1 className="text-4xl lg:text-5xl font-semibold leading-[1.05] tracking-tight">
              Your factory.
              <br />
              <span className="bg-gradient-to-r from-violet-400 via-cyan-300 to-emerald-300 bg-clip-text text-transparent">
                Digitally reimagined.
              </span>
            </h1>
            <div className="h-px w-16 bg-white/20 mt-6 mb-5" />
            <p className="text-[14px] text-white/60 leading-relaxed max-w-md">
              Immersive 360° tours with real-time analytics, presenter
              attribution, and shareable links your customers actually
              want to open.
            </p>

            {/* Floating feature badges — plain HTML, no artwork. */}
            <div className="mt-8 grid grid-cols-2 gap-3 max-w-sm">
              <FeatureBadge
                icon={<BarChart3 size={13} />}
                label="Live analytics"
                sub="Per-scene, per-user"
              />
              <FeatureBadge
                icon={<Users size={13} />}
                label="Team accounts"
                sub="Presenter attribution"
              />
              <FeatureBadge
                icon={<Share2 size={13} />}
                label="Shareable links"
                sub="Password + email gate"
              />
              <FeatureBadge
                icon={<ShieldCheck size={13} />}
                label="Access control"
                sub="Roles + expiry"
              />
            </div>
          </div>

          <div className="text-[11px] text-white/30">
            © {new Date().getFullYear()} Factory Tour
          </div>
        </div>
      </div>

      {/* ---------- RIGHT (form panel) ---------- */}
      <div className="flex-1 md:w-1/2 lg:w-2/5 flex items-center justify-center p-6 md:p-10 bg-[#0a0b10]">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}

function FeatureBadge({
  icon,
  label,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <div className="flex items-center gap-2.5 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 backdrop-blur-sm">
      <div className="w-7 h-7 rounded-md bg-white/[0.06] grid place-items-center text-cyan-300 shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[12px] font-medium truncate">{label}</div>
        <div className="text-[10px] text-white/45 truncate">{sub}</div>
      </div>
    </div>
  );
}
