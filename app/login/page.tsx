"use client";

/**
 * /login — unified sign-in with the three new security layers wired in:
 *
 *   1. Rate limiting + account lockout  (check_login_rate_limit RPC)
 *   2. Device-slot claim on success     (claim_device_slot RPC)
 *   3. "New device signed in" email     (/api/notify-new-device)
 *
 * UI additions:
 *   - Working "Forgot password" flow (sends recovery email)
 *   - A big "Sales team — sign up / log in" button at the bottom
 *     routing to /signup/sales
 *
 * The org_admin + Google flows at the top are unchanged in behaviour;
 * only the submit handler was reshaped to run through the security
 * layers before the existing redirect logic.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  signIn,
  signInWithGoogle,
  signOut,
  getMyProfile,
} from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { slugForOrgId } from "@/lib/orgSlug";
import { goToDashboard } from "@/lib/authRedirect";
import AuthShell from "@/components/AuthShell";
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
} from "lucide-react";
import {
  checkLoginLockout,
  recordLoginAttempt,
  formatLockoutRemaining,
} from "@/lib/loginRateLimit";
import {
  claimDeviceSlot,
  isNewDevice,
} from "@/lib/deviceSessions";
import { notifyNewDevice } from "@/lib/newDeviceNotify";
import { getDeviceFingerprint } from "@/lib/deviceFingerprint";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
    if (claim.status === "unauth") {
      setError("Could not establish a session. Please try again.");
      setBusy(false);
      return;
    }

    // 6. Fire the "new device" email if applicable. Fire-and-forget —
    //    don't let a slow email provider stall the redirect.
    const profile = await getMyProfile();
    if (newDevice && profile?.email) {
      notifyNewDevice({
        email: profile.email,
        fullName: profile.full_name,
        deviceFingerprint: getDeviceFingerprint(),
      });
    }

    // 7. The existing redirect logic.
    const next =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("next")
        : null;
    if (next) {
      router.push(next);
      return;
    }
    if (profile?.role === "owner") {
      router.push("/");
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
    const role = profile.role === "presenter" ? "sales" : "owner";
    await goToDashboard(slug, role);
  }

  const isLocked = !!lockedUntil && lockedUntil.getTime() > Date.now();

  return (
    <AuthShell>
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
          <h1 className="text-[26px] font-semibold tracking-tight mb-1">
            Welcome back
          </h1>
          <p className="text-[13px] text-white/50 mb-7">
            Sign in to your dashboard.
          </p>

          {/* Email */}
          <div className="mb-3">
            <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">
              Email
            </label>
            <div className="relative">
              <Mail
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
              />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoFocus
                autoComplete="email"
                className="w-full bg-white/[0.03] border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-[14px] outline-none focus:border-violet-400/60 focus:bg-white/[0.05]"
              />
            </div>
          </div>

          {/* Password */}
          <div className="mb-3">
            <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
              />
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full bg-white/[0.03] border border-white/10 rounded-lg pl-9 pr-10 py-2.5 text-[14px] outline-none focus:border-violet-400/60 focus:bg-white/[0.05]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-white/40 hover:text-white/70"
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Remember + forgot */}
          <div className="flex items-center justify-between mb-5">
            <label className="flex items-center gap-2 text-[12px] text-white/60 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="accent-violet-500"
              />
              Remember me
            </label>
            <button
              type="button"
              className="text-[12px] text-violet-300 hover:text-violet-200"
              onClick={() => setForgotOpen(true)}
            >
              Forgot password?
            </button>
          </div>

          {error && (
            <div className="text-[12px] text-rose-300 mb-3 bg-rose-500/10 border border-rose-500/30 rounded px-3 py-2 flex items-start gap-2">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>
                {isLocked && lockedUntil
                  ? `Account locked. Try again in ${formatLockoutRemaining(
                      lockedUntil
                    )}.`
                  : error}
              </span>
            </div>
          )}

          {/* Sign in */}
          <button
            type="submit"
            disabled={busy || isLocked}
            className="w-full py-2.5 rounded-lg font-medium text-white bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-400 hover:to-indigo-400 shadow-[0_10px_30px_-8px_rgba(124,92,255,0.5)] disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
          >
            {busy ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Signing in…
              </>
            ) : (
              <>
                Sign in <ArrowRight size={15} />
              </>
            )}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[11px] text-white/40">or continue with</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Google only */}
          <button
            type="button"
            onClick={async () => {
              const next =
                new URLSearchParams(window.location.search).get("next") ?? "/";
              await signInWithGoogle(next);
            }}
            className="w-full py-2.5 rounded-lg bg-white text-black font-medium flex items-center justify-center gap-2 hover:bg-white/95"
          >
            <GoogleGlyph />
            Google
          </button>

          {/* Sales-team entry — second entrypoint, visually separated. */}
          <div className="mt-7 pt-6 border-t border-white/10">
            <Link
              href="/signup/sales"
              className="w-full py-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-violet-400/40 text-white flex items-center justify-center gap-2.5 transition-all group"
            >
              <Users size={15} className="text-violet-300" />
              <span className="text-[13.5px] font-medium">
                Join as sales team
              </span>
              <ArrowRight
                size={14}
                className="text-white/40 group-hover:text-violet-300 group-hover:translate-x-0.5 transition-all"
              />
            </Link>
            <p className="text-[11px] text-white/40 text-center mt-2">
              With an invite code from your admin
            </p>
          </div>

        </form>
      )}
    </AuthShell>
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
      <h1 className="text-[22px] font-semibold tracking-tight mb-1">
        Reset your password
      </h1>
      <p className="text-[13px] text-white/50 mb-7">
        We&apos;ll email you a link to set a new one.
      </p>

      {sent ? (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-4 text-[13px] text-emerald-200 leading-relaxed">
          Check your inbox. If an account exists for{" "}
          <strong className="text-white">{email}</strong>, a reset link is on
          its way. It expires in 1 hour.
        </div>
      ) : (
        <form onSubmit={submit}>
          <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">
            Email
          </label>
          <div className="relative mb-4">
            <Mail
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
            />
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full bg-white/[0.03] border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-[14px] outline-none focus:border-violet-400/60 focus:bg-white/[0.05]"
            />
          </div>
          {error && (
            <div className="text-[12px] text-rose-300 mb-3 bg-rose-500/10 border border-rose-500/30 rounded px-3 py-2">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={busy || !email}
            className="w-full py-2.5 rounded-lg font-medium text-white bg-gradient-to-r from-violet-500 to-indigo-500 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Sending…
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
        className="mt-6 text-[12px] text-white/50 hover:text-white/80 flex items-center gap-1 mx-auto"
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
      <div
        className="w-14 h-14 rounded-full grid place-items-center mb-4"
        style={{
          background: "rgba(244, 63, 94, 0.12)",
          border: "1px solid rgba(244, 63, 94, 0.3)",
        }}
      >
        <ShieldCheck size={24} className="text-rose-300" />
      </div>
      <h1 className="text-[22px] font-semibold tracking-tight mb-2">
        Signed in elsewhere
      </h1>
      <p className="text-[13px] text-white/60 mb-5 leading-relaxed">
        This account is already active on{" "}
        <strong className="text-white">{active}</strong> device
        {active === 1 ? "" : "s"} (your limit is{" "}
        <strong className="text-white">{limit}</strong>). To sign in here,
        sign out from one of the other devices — or ask your admin to raise
        the limit on your invite.
      </p>
      <ul className="text-[12px] text-white/50 mb-6 space-y-1.5">
        <li>• An idle session frees up automatically after 30 min.</li>
        <li>• Your admin can revoke other sessions from the team page.</li>
      </ul>
      <button
        type="button"
        onClick={onBack}
        className="w-full py-2.5 rounded-lg font-medium text-white bg-white/5 border border-white/10 hover:bg-white/10"
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
