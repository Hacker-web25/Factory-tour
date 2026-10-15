"use client";

/**
 * AuthSplit — the shared light, on-brand split screen for every sign-in and
 * sign-up page (/login for MDs & owners, /signup/sales for the sales team).
 *
 * Left: the VPV wordmark, a tagline card and trust pills.
 * Right: a frosted white card holding whatever form the page passes as children.
 *
 * Also exports the shared input / label / button classes and the consent box,
 * so every auth screen looks and behaves the same.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { BarChart3, Check, Share2, ShieldCheck, Sparkles, Users } from "lucide-react";
import BrandMark from "@/components/dashboard/BrandMark";
import { VPV_LOGO_URL } from "@/components/dashboard/VpvLogo";
import { LegalLinks } from "@/components/legal/SiteFooter";
import { COMPANY } from "@/lib/company";

export const authLabel =
  "mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-vpv-muted";

export const authInput =
  "w-full rounded-xl border border-vpv-line bg-white px-3.5 py-3 pl-10 text-[14px] text-vpv-ink outline-none transition-all placeholder:text-vpv-muted/50 focus:border-vpv-blue focus:ring-2 focus:ring-vpv-blue/15";

export const authButtonPrimary =
  "flex w-full items-center justify-center gap-2 rounded-xl bg-vpv-grad py-3 text-[14.5px] font-semibold text-white shadow-[0_18px_40px_-16px_rgba(20,104,216,0.7)] transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-45";

export const authErrorBox =
  "mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[12.5px] text-rose-700";

export default function AuthSplit({
  pill,
  headline,
  accent,
  body,
  children,
}: {
  pill: string;
  headline: string;
  accent: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen w-full bg-vpv-canvas text-vpv-ink flex flex-col lg:flex-row overflow-hidden">
      {/* ======================= LEFT — brand / tagline ======================= */}
      <aside className="relative hidden lg:flex lg:w-[54%] xl:w-[56%] overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(1100px 760px at 12% 108%, rgba(11,61,145,0.18), transparent 58%), radial-gradient(820px 560px at 92% -8%, rgba(25,184,242,0.16), transparent 55%), linear-gradient(135deg, #FFFFFF 0%, #EAF2FE 54%, #DCEBFE 100%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(20,104,216,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(20,104,216,0.06) 1px, transparent 1px)",
            backgroundSize: "54px 54px",
            maskImage: "radial-gradient(circle at 40% 45%, black, transparent 78%)",
            WebkitMaskImage: "radial-gradient(circle at 40% 45%, black, transparent 78%)",
          }}
        />
        <div className="vpv-orb absolute -top-16 right-10 h-72 w-72 rounded-full bg-vpv-cyan/20 blur-3xl" />
        <div className="vpv-orb vpv-orb--slow absolute bottom-[-4rem] left-[-3rem] h-96 w-96 rounded-full bg-vpv-blue/15 blur-3xl" />

        <div className="relative z-10 flex w-full flex-col justify-between p-12 xl:p-16">
          <div className="flex items-center gap-3">
            <BrandMark src={VPV_LOGO_URL} height={42} alt="VPV — Virtual Plant Visit" />
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.26em] text-vpv-muted">
              Virtual&nbsp;Plant&nbsp;Visit
            </span>
          </div>

          <div className="max-w-xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/60 px-3.5 py-1.5 text-[11.5px] font-medium text-vpv-navy shadow-[0_8px_30px_-16px_rgba(11,61,145,0.5)] backdrop-blur-xl">
              <Sparkles size={13} className="text-vpv-blue" />
              {pill}
            </div>
            <h1 className="text-[42px] xl:text-[52px] font-semibold leading-[1.04] tracking-tight text-vpv-ink">
              {headline}
              <br />
              <span className="bg-vpv-grad bg-clip-text text-transparent">{accent}</span>
            </h1>
            <div className="mt-7 h-px w-16 bg-gradient-to-r from-vpv-blue to-transparent" />
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-vpv-muted">{body}</p>

            <div className="mt-9 grid max-w-md grid-cols-2 gap-3">
              <TrustPill icon={<BarChart3 size={14} />} label="Live analytics" sub="Per-scene, per-buyer" />
              <TrustPill icon={<Users size={14} />} label="Team accounts" sub="Presenter attribution" />
              <TrustPill icon={<Share2 size={14} />} label="Shareable tours" sub="Gated by email & link" />
              <TrustPill icon={<ShieldCheck size={14} />} label="Enterprise security" sub="Roles, devices, expiry" />
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11.5px] text-vpv-muted">
            <ShieldCheck size={13} className="text-vpv-blue" />
            Bank-grade encryption · © {new Date().getFullYear()} {COMPANY.legalName}
          </div>
        </div>
      </aside>

      {/* ======================= RIGHT — form ======================= */}
      <main className="relative z-10 flex flex-1 items-center justify-center p-6 sm:p-10 lg:w-[46%] xl:w-[44%]">
        <div
          className="pointer-events-none absolute inset-0 lg:hidden"
          style={{
            background:
              "radial-gradient(700px 480px at 50% -10%, rgba(25,184,242,0.14), transparent 60%), radial-gradient(600px 520px at 50% 120%, rgba(11,61,145,0.12), transparent 60%)",
          }}
        />
        <div className="relative w-full max-w-[420px]">
          <div className="mb-6 flex items-center justify-center gap-2.5 lg:hidden">
            <BrandMark src={VPV_LOGO_URL} height={34} alt="VPV" />
          </div>

          <div className="rounded-[26px] border border-vpv-line bg-white/80 p-7 shadow-[0_30px_80px_-40px_rgba(11,61,145,0.45)] backdrop-blur-xl sm:p-9">
            {children}
          </div>

          <LegalLinks tone="light" newTab={false} className="mt-7" />
        </div>
      </main>

      <style jsx>{`
        .vpv-orb {
          animation: vpvFloat 9s ease-in-out infinite;
        }
        .vpv-orb--slow {
          animation-duration: 13s;
        }
        @keyframes vpvFloat {
          0%,
          100% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          50% {
            transform: translate3d(0, -18px, 0) scale(1.05);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .vpv-orb {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

function TrustPill({ icon, label, sub }: { icon: ReactNode; label: string; sub: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/70 bg-white/55 px-3 py-2.5 backdrop-blur-xl">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-vpv-tint text-vpv-blue">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[12.5px] font-semibold text-vpv-ink">{label}</div>
        <div className="truncate text-[10.5px] text-vpv-muted">{sub}</div>
      </div>
    </div>
  );
}

/** The Terms / Privacy / Refund consent. Sign-up and sign-in stay disabled until it is ticked. */
export function ConsentCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="mb-5 flex cursor-pointer select-none items-start gap-2.5 rounded-xl border border-vpv-line bg-vpv-canvas/70 px-3.5 py-3 text-[12.5px] leading-relaxed text-vpv-muted">
      <span
        className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border transition-all ${
          checked ? "border-vpv-blue bg-vpv-blue text-white" : "border-vpv-line bg-white"
        }`}
      >
        {checked && <Check size={11} strokeWidth={3} />}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span>
        I agree to VPV&apos;s{" "}
        <Link href="/terms" target="_blank" className="font-medium text-vpv-blue hover:underline">
          Terms &amp; Conditions
        </Link>
        ,{" "}
        <Link href="/privacy" target="_blank" className="font-medium text-vpv-blue hover:underline">
          Privacy Policy
        </Link>{" "}
        and{" "}
        <Link href="/refund-policy" target="_blank" className="font-medium text-vpv-blue hover:underline">
          Refund Policy
        </Link>
        .
      </span>
    </label>
  );
}
