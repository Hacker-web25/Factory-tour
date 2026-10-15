"use client";

/**
 * /login — VPV sign-in for MDs & owners.
 *
 * Premium, brand-matched (white + bluish-translucent) rebuild of the auth
 * screen. The security + routing behaviour is UNCHANGED:
 *
 *   1. Rate limiting + account lockout  (check_login_rate_limit RPC)
 *   2. Device-slot claim on success     (claim_device_slot RPC)
 *   3. "New device signed in" email     (/api/notify-new-device)
 *   4. Forgot-password recovery email
 *   5. Google OAuth
 *
 * What changed in this round:
 *   - Light, on-brand split-screen (no shared dark AuthShell here).
 *   - VPV transparent wordmark throughout.
 *   - A required consent to Terms / Privacy / Refund before sign-in.
 *   - Clear "this is for MDs & owners" framing.
 *   - A distinct sales-team entry button below.
 *   - A left-hand tagline panel (final copy to be supplied by the client —
 *     see TAGLINE below).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  signIn,
  signInWithGoogle,
  signOut,
  getMyProfile,
  getSession,
} from "@/lib/auth";
import { safeNext, isTenantPath } from "@/lib/safeNext";
import { supabase } from "@/lib/supabase";
import { slugForOrgId } from "@/lib/orgSlug";
import { goToDashboard } from "@/lib/authRedirect";
import BrandMark from "@/components/dashboard/BrandMark";
import { VPV_LOGO_URL } from "@/components/dashboard/VpvLogo";
import { LegalLinks } from "@/components/legal/SiteFooter";
import { COMPANY } from "@/lib/company";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertTriangle,
  ShieldCheck,
  Users,
  Loader2,
  Crown,
  Check,
  BarChart3,
  Share2,
  Sparkles,
} from "lucide-react";
import {
  checkLoginLockout,
  recordLoginAttempt,
  formatLockoutRemaining,
} from "@/lib/loginRateLimit";
import { claimDeviceSlot, isNewDevice } from "@/lib/deviceSessions";
import { notifyNewDevice } from "@/lib/newDeviceNotify";
import { getDeviceFingerprint } from "@/lib/deviceFingerprint";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Rate-limit state — populated by checkLoginLockout
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);

  // Forgot-password + device-full modals
  const [forgotOpen, setForgotOpen] = useState(false);
  const [deviceFull, setDeviceFull] = useState<
    { active: number; limit: number } | null
  >(null);

  // Re-render once a second while locked so the countdown is live.
  useEffect(() => {
    if (!lockedUntil) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [lockedUntil]);

  // Clear the lock when it expires.
  useEffect(() => {
    if (lockedUntil && lockedUntil.getTime() <= Date.now()) {
      setLockedUntil(null);
    }
  }, [tick, lockedUntil]);

  // One place that decides where a signed-in user goes. A literal
  // /{slug}/owner|sales `next` is ignored on purpose: the tenant
  // dashboard is reached only through goToDashboard()'s session
  // hand-off (pushing the raw path would bounce between hosts forever).
  async function routeAfterLogin(
    profile: Awaited<ReturnType<typeof getMyProfile>>
  ) {
    const next = safeNext(
      new URLSearchParams(window.location.search).get("next"),
      ""
    );
    if (next && !isTenantPath(next)) {
      router.push(next);
      return;
    }
    if (profile?.role === "owner") {
      router.push("/dashboard");
      return;
    }
    if (!profile || !profile.org_id) {
      router.push("/setup");
      return;
    }
    const slug = await slugForOrgId(profile.org_id);
    if (!slug) {
      router.push("/setup");
      return;
    }
    await goToDashboard(slug, profile.role === "presenter" ? "sales" : "owner");
  }

  // Already signed in here (e.g. bounced from a tenant subdomain whose
  // own session was lost)? Skip the form and continue to the dashboard.
  // `?reauth=1` (set when a hand-off fails) disables this so a bad
  // session can never cause a redirect loop.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("reauth")) return;
    let cancelled = false;
    (async () => {
      const s = await getSession();
      if (!s || cancelled) return;
      const p = await getMyProfile();
      if (cancelled) return;
      await routeAfterLogin(p);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // 0. Consent is mandatory before any credential is sent.
    if (!consent) {
      setError("Please accept the Terms, Privacy and Refund policies to continue.");
      return;
    }

    setBusy(true);

    // 1. Rate-limit check BEFORE touching Supabase auth.
    const lock = await checkLoginLockout(email);
    if (lock.locked && lock.lockedUntil) {
      setLockedUntil(lock.lockedUntil);
      setError(
        `Too many failed attempts. Try again in ${formatLockoutRemaining(
          lock.lockedUntil
        )}.`
      );
      setBusy(false);
      return;
    }

    // 2. Actual sign-in.
    const { error: authError } = await signIn(email, password);
    if (authError) {
      await recordLoginAttempt(email, false);
      // After recording, re-check — the 5th failure flips the lock.
      const after = await checkLoginLockout(email);
      if (after.locked && after.lockedUntil) {
        setLockedUntil(after.lockedUntil);
        setError(
          `Too many failed attempts. Account locked for ${formatLockoutRemaining(
            after.lockedUntil
          )}.`
        );
      } else {
        const attemptsLeft = Math.max(0, 5 - (after.failedRecent ?? 0));
        setError(
          `${authError.message}${
            attemptsLeft <= 2
              ? ` · ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} left`
              : ""
          }`
        );
      }
      setBusy(false);
      return;
    }

    // 3. Record the success — resets the failed-counter window.
    await recordLoginAttempt(email, true);

    // 4. Check whether this device is new BEFORE claiming the slot
    //    (claim_device_slot inserts the row, so is_new_device must run
    //    first).
    const newDevice = await isNewDevice();

    // 5. Claim the device slot.
    const claim = await claimDeviceSlot();
    if (claim.status === "full") {
      // Sign them back out — their session was created by signIn but
      // we don't let them past the gate.
      await signOut();
      setDeviceFull({ active: claim.activeCount, limit: claim.deviceLimit });
      setBusy(false);
      return;
    }

    // 6. Fire the "new device" email if applicable. Fire-and-forget.
    const profile = await getMyProfile();
    if (newDevice && profile?.email) {
      notifyNewDevice({
        email: profile.email,
        fullName: profile.full_name,
        deviceFingerprint: getDeviceFingerprint(),
      });
    }

    // 7. Route to the right place.
    await routeAfterLogin(profile);
  }

  async function onGoogle() {
    setError(null);
    if (!consent) {
      setError("Please accept the Terms, Privacy and Refund policies to continue.");
      return;
    }
    const next = safeNext(
      new URLSearchParams(window.location.search).get("next"),
      "/"
    );
    await signInWithGoogle(next);
  }

  const isLocked = !!lockedUntil && lockedUntil.getTime() > Date.now();

  return (
    <div className="relative min-h-screen w-full bg-vpv-canvas text-vpv-ink flex flex-col lg:flex-row overflow-hidden">
      {/* ======================= LEFT — brand / tagline ======================= */}
      <aside className="relative hidden lg:flex lg:w-[54%] xl:w-[56%] overflow-hidden">
        {/* layered bluish light gradients */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(1100px 760px at 12% 108%, rgba(11,61,145,0.18), transparent 58%), radial-gradient(820px 560px at 92% -8%, rgba(25,184,242,0.16), transparent 55%), linear-gradient(135deg, #FFFFFF 0%, #EAF2FE 54%, #DCEBFE 100%)",
          }}
        />
        {/* faint engineering grid */}
        <div
          className="absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(20,104,216,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(20,104,216,0.06) 1px, transparent 1px)",
            backgroundSize: "54px 54px",
            maskImage:
              "radial-gradient(circle at 40% 45%, black, transparent 78%)",
            WebkitMaskImage:
              "radial-gradient(circle at 40% 45%, black, transparent 78%)",
          }}
        />
        {/* floating translucent orbs */}
        <div className="vpv-orb absolute -top-16 right-10 h-72 w-72 rounded-full bg-vpv-cyan/20 blur-3xl" />
        <div className="vpv-orb vpv-orb--slow absolute bottom-[-4rem] left-[-3rem] h-96 w-96 rounded-full bg-vpv-blue/15 blur-3xl" />

        <div className="relative z-10 flex w-full flex-col justify-between p-12 xl:p-16">
          {/* wordmark */}
          <div className="flex items-center gap-3">
            <BrandMark src={VPV_LOGO_URL} height={42} alt="VPV — Virtual Plant Visit" />
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.26em] text-vpv-muted">
              Virtual&nbsp;Plant&nbsp;Visit
            </span>
          </div>

          {/* TAGLINE — placeholder copy. Client will supply the final line. */}
          <div className="max-w-xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/60 px-3.5 py-1.5 text-[11.5px] font-medium text-vpv-navy shadow-[0_8px_30px_-16px_rgba(11,61,145,0.5)] backdrop-blur-xl">
              <Sparkles size={13} className="text-vpv-blue" />
              The leadership command centre
            </div>
            <h1 className="text-[42px] xl:text-[52px] font-semibold leading-[1.04] tracking-tight text-vpv-ink">
              Every plant visit,
              <br />
              <span className="bg-vpv-grad bg-clip-text text-transparent">
                begins right here.
              </span>
            </h1>
            <div className="mt-7 h-px w-16 bg-gradient-to-r from-vpv-blue to-transparent" />
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-vpv-muted">
              Your real factory, opened to buyers in the very first meeting —
              with live analytics, presenter attribution and shareable tours
              your customers actually want to explore.
            </p>

            {/* trust pills */}
            <div className="mt-9 grid max-w-md grid-cols-2 gap-3">
              <TrustPill icon={<BarChart3 size={14} />} label="Live analytics" sub="Per-scene, per-buyer" />
              <TrustPill icon={<Users size={14} />} label="Team accounts" sub="Presenter attribution" />
              <TrustPill icon={<Share2 size={14} />} label="Shareable tours" sub="Gated by email & link" />
              <TrustPill icon={<ShieldCheck size={14} />} label="Enterprise security" sub="Roles, devices, expiry" />
            </div>
          </div>

          {/* footer */}
          <div className="flex items-center gap-2 text-[11.5px] text-vpv-muted">
            <ShieldCheck size={13} className="text-vpv-blue" />
            Bank-grade encryption · © {new Date().getFullYear()} {COMPANY.legalName}
          </div>
        </div>
      </aside>

      {/* ======================= RIGHT — form ======================= */}
      <main className="relative z-10 flex flex-1 items-center justify-center p-6 sm:p-10 lg:w-[46%] xl:w-[44%]">
        {/* soft bluish wash behind the card on mobile / small screens */}
        <div
          className="pointer-events-none absolute inset-0 lg:hidden"
          style={{
            background:
              "radial-gradient(700px 480px at 50% -10%, rgba(25,184,242,0.14), transparent 60%), radial-gradient(600px 520px at 50% 120%, rgba(11,61,145,0.12), transparent 60%)",
          }}
        />
        <div className="relative w-full max-w-[420px]">
          {/* mobile logo (left panel is hidden) */}
          <div className="mb-6 flex items-center justify-center gap-2.5 lg:hidden">
            <BrandMark src={VPV_LOGO_URL} height={34} alt="VPV" />
          </div>

          <div className="rounded-[26px] border border-vpv-line bg-white/80 p-7 shadow-[0_30px_80px_-40px_rgba(11,61,145,0.45)] backdrop-blur-xl sm:p-9">
            {deviceFull ? (
              <DeviceFullScreen
                active={deviceFull.active}
                limit={deviceFull.limit}
                onBack={() => {
                  setDeviceFull(null);
                  setPassword("");
                }}
              />
            ) : forgotOpen ? (
              <ForgotPasswordPanel onBack={() => setForgotOpen(false)} />
            ) : (
              <form onSubmit={onSubmit}>
                {/* audience pill */}
                <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-vpv-blue/20 bg-vpv-tint px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-vpv-navy">
                  <Crown size={12} className="text-vpv-blue" />
                  For MDs &amp; Owners
                </div>

                <h1 className="text-[26px] font-semibold tracking-tight text-vpv-ink">
                  Welcome back
                </h1>
                <p className="mt-1 mb-7 text-[13.5px] text-vpv-muted">
                  Sign in to your VPV command centre. Sales-team members have a
                  separate entry below.
                </p>

                {/* Email */}
                <div className="mb-3.5">
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-vpv-muted">
                    Email
                  </label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-vpv-muted/70" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      autoFocus
                      autoComplete="email"
                      className="w-full rounded-xl border border-vpv-line bg-white px-3.5 py-3 pl-10 text-[14px] text-vpv-ink outline-none transition-all placeholder:text-vpv-muted/50 focus:border-vpv-blue focus:ring-2 focus:ring-vpv-blue/15"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="mb-3.5">
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-vpv-muted">
                    Password
                  </label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-vpv-muted/70" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="w-full rounded-xl border border-vpv-line bg-white px-3.5 py-3 pl-10 pr-11 text-[14px] text-vpv-ink outline-none transition-all placeholder:text-vpv-muted/50 focus:border-vpv-blue focus:ring-2 focus:ring-vpv-blue/15"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-vpv-muted/70 hover:text-vpv-ink"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {/* Remember + forgot */}
                <div className="mb-4 flex items-center justify-between">
                  <label className="flex cursor-pointer select-none items-center gap-2 text-[12.5px] text-vpv-muted">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="h-3.5 w-3.5 accent-vpv-blue"
                    />
                    Remember me
                  </label>
                  <button
                    type="button"
                    className="text-[12.5px] font-medium text-vpv-blue hover:text-vpv-navy"
                    onClick={() => setForgotOpen(true)}
                  >
                    Forgot password?
                  </button>
                </div>

                {/* Consent */}
                <label className="mb-5 flex cursor-pointer select-none items-start gap-2.5 rounded-xl border border-vpv-line bg-vpv-canvas/70 px-3.5 py-3 text-[12.5px] leading-relaxed text-vpv-muted">
                  <span
                    className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border transition-all ${
                      consent
                        ? "border-vpv-blue bg-vpv-blue text-white"
                        : "border-vpv-line bg-white"
                    }`}
                  >
                    {consent && <Check size={11} strokeWidth={3} />}
                  </span>
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="sr-only"
                  />
                  <span>
                    I agree to VPV&apos;s{" "}
                    <Link href="/terms" className="font-medium text-vpv-blue hover:underline" target="_blank">
                      Terms &amp; Conditions
                    </Link>
                    ,{" "}
                    <Link href="/privacy" className="font-medium text-vpv-blue hover:underline" target="_blank">
                      Privacy Policy
                    </Link>{" "}
                    and{" "}
                    <Link href="/refund-policy" className="font-medium text-vpv-blue hover:underline" target="_blank">
                      Refund Policy
                    </Link>
                    .
                  </span>
                </label>

                {error && (
                  <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[12.5px] text-rose-700">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span>
                      {isLocked && lockedUntil
                        ? `Account locked. Try again in ${formatLockoutRemaining(lockedUntil)}.`
                        : error}
                    </span>
                  </div>
                )}

                {/* Sign in */}
                <button
                  type="submit"
                  disabled={busy || isLocked || !consent}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-vpv-grad py-3 text-[14.5px] font-semibold text-white shadow-[0_18px_40px_-16px_rgba(20,104,216,0.7)] transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {busy ? (
                    <>
                      <Loader2 size={15} className="animate-spin" /> Signing in…
                    </>
                  ) : (
                    <>
                      Sign in <ArrowRight size={16} />
                    </>
                  )}
                </button>

                {/* Divider */}
                <div className="my-5 flex items-center gap-3">
                  <div className="h-px flex-1 bg-vpv-line" />
                  <span className="text-[11px] font-medium uppercase tracking-wide text-vpv-muted/70">
                    or continue with
                  </span>
                  <div className="h-px flex-1 bg-vpv-line" />
                </div>

                {/* Google */}
                <button
                  type="button"
                  onClick={onGoogle}
                  className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-vpv-line bg-white py-3 text-[13.5px] font-medium text-vpv-ink transition-all hover:border-vpv-blue/40 hover:bg-vpv-tint/40"
                >
                  <GoogleGlyph />
                  Google
                </button>

                {/* Sales-team entry */}
                <div className="mt-7 border-t border-vpv-line pt-6">
                  <p className="mb-2.5 text-center text-[11.5px] font-medium uppercase tracking-wide text-vpv-muted/80">
                    Not an MD?
                  </p>
                  <Link
                    href="/signup/sales"
                    className="group flex w-full items-center justify-center gap-2.5 rounded-xl border border-vpv-blue/25 bg-vpv-tint/50 py-3 text-vpv-navy transition-all hover:border-vpv-blue/50 hover:bg-vpv-tint"
                  >
                    <Users size={15} className="text-vpv-blue" />
                    <span className="text-[13.5px] font-semibold">
                      Sales team — sign in or join
                    </span>
                    <ArrowRight size={14} className="text-vpv-blue/70 transition-all group-hover:translate-x-0.5" />
                  </Link>
                  <p className="mt-2 text-center text-[11px] text-vpv-muted/70">
                    Presenters &amp; reps join with an invite code from their admin.
                  </p>
                </div>
              </form>
            )}
          </div>

          <LegalLinks tone="light" newTab={false} className="mt-7" />
        </div>
      </main>

      {/* local float animation for the brand orbs */}
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

/* ---------- left-panel trust pill ----------------------------------- */

function TrustPill({
  icon,
  label,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
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

/* ---------- Forgot-password inline panel ----------------------------- */

function ForgotPasswordPanel({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/reset`
        : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <div>
      <h1 className="text-[22px] font-semibold tracking-tight text-vpv-ink">
        Reset your password
      </h1>
      <p className="mt-1 mb-7 text-[13.5px] text-vpv-muted">
        We&apos;ll email you a link to set a new one.
      </p>

      {sent ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-[13px] leading-relaxed text-emerald-800">
          Check your inbox. If an account exists for{" "}
          <strong className="text-emerald-900">{email}</strong>, a reset link is
          on its way. It expires in 1 hour.
        </div>
      ) : (
        <form onSubmit={submit}>
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-vpv-muted">
            Email
          </label>
          <div className="relative mb-4">
            <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-vpv-muted/70" />
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full rounded-xl border border-vpv-line bg-white px-3.5 py-3 pl-10 text-[14px] text-vpv-ink outline-none transition-all placeholder:text-vpv-muted/50 focus:border-vpv-blue focus:ring-2 focus:ring-vpv-blue/15"
            />
          </div>
          {error && (
            <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[12.5px] text-rose-700">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={busy || !email}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-vpv-grad py-3 text-[14px] font-semibold text-white disabled:opacity-45"
          >
            {busy ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Sending…
              </>
            ) : (
              "Send reset link"
            )}
          </button>
        </form>
      )}

      <button
        type="button"
        onClick={onBack}
        className="mx-auto mt-6 flex items-center gap-1 text-[12.5px] text-vpv-muted hover:text-vpv-ink"
      >
        ← Back to sign in
      </button>
    </div>
  );
}

/* ---------- Device-limit-hit screen --------------------------------- */

function DeviceFullScreen({
  active,
  limit,
  onBack,
}: {
  active: number;
  limit: number;
  onBack: () => void;
}) {
  return (
    <div>
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-full border border-rose-200 bg-rose-50">
        <ShieldCheck size={24} className="text-rose-500" />
      </div>
      <h1 className="mb-2 text-[22px] font-semibold tracking-tight text-vpv-ink">
        Signed in elsewhere
      </h1>
      <p className="mb-5 text-[13.5px] leading-relaxed text-vpv-muted">
        This account is already active on{" "}
        <strong className="text-vpv-ink">{active}</strong> device
        {active === 1 ? "" : "s"} (your limit is{" "}
        <strong className="text-vpv-ink">{limit}</strong>). To sign in here, sign
        out from one of the other devices — or ask your admin to raise the limit
        on your invite.
      </p>
      <ul className="mb-6 space-y-1.5 text-[12.5px] text-vpv-muted">
        <li>• An idle session frees up automatically after 30 min.</li>
        <li>• Your admin can revoke other sessions from the team page.</li>
      </ul>
      <button
        type="button"
        onClick={onBack}
        className="w-full rounded-xl border border-vpv-line bg-white py-3 text-[14px] font-medium text-vpv-ink hover:bg-vpv-tint/40"
      >
        Try again
      </button>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width={16} height={16} viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
