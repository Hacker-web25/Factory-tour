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

import { useEffect, useRef, useState } from "react";
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
import AuthSplit, {
  ConsentCheckbox,
  authButtonPrimary,
  authErrorBox,
  authInput,
  authLabel,
} from "@/components/auth/AuthSplit";
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
} from "lucide-react";
import {
  checkLoginLockout,
  recordLoginAttempt,
  formatLockoutRemaining,
} from "@/lib/loginRateLimit";
import { claimDeviceSlot, isNewDevice } from "@/lib/deviceSessions";
import { notifyNewDevice } from "@/lib/newDeviceNotify";
import { getDeviceFingerprint } from "@/lib/deviceFingerprint";
import TurnstileBox, {
  type TurnstileHandle,
  type TurnstileState,
} from "@/components/auth/TurnstileBox";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Cloudflare Turnstile ("are you a person?") — token is single-use, so it is reset after every attempt.
  const captchaRef = useRef<TurnstileHandle>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaState, setCaptchaState] = useState<TurnstileState>("loading");

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

    if (!captchaToken && captchaState === "loading") {
      setError("One moment — the security check is still loading. Please try again.");
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
    const { error: authError } = await signIn(email, password, captchaToken);
    captchaRef.current?.reset();
    if (authError) {
      if (/captcha/i.test(authError.message)) {
        // The security check failed, not the password — don't count it against the account.
        setError("The security check could not be completed. Please wait a moment and try again.");
        setBusy(false);
        return;
      }
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
    <AuthSplit
      pill="The leadership command centre"
      headline="Every plant visit,"
      accent="begins right here."
      body="Your real factory, opened to buyers in the very first meeting — with live analytics, presenter attribution and shareable tours your customers actually want to explore."
    >
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
          <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-vpv-blue/20 bg-vpv-tint px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-vpv-navy">
            <Crown size={12} className="text-vpv-blue" />
            For MDs &amp; Owners
          </div>

          <h1 className="text-[26px] font-semibold tracking-tight text-vpv-ink">Welcome back</h1>
          <p className="mt-1 mb-7 text-[13.5px] text-vpv-muted">
            Sign in to your VPV command centre. Sales-team members have a separate entry below.
          </p>

          <div className="mb-3.5">
            <label className={authLabel}>Email</label>
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
                className={authInput}
              />
            </div>
          </div>

          <div className="mb-3.5">
            <label className={authLabel}>Password</label>
            <div className="relative">
              <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-vpv-muted/70" />
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className={authInput + " pr-11"}
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

          <ConsentCheckbox checked={consent} onChange={setConsent} />

          <TurnstileBox
            ref={captchaRef}
            onToken={setCaptchaToken}
            onState={setCaptchaState}
            className="mb-3 flex justify-center"
          />

          {error && (
            <div className={authErrorBox}>
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                {isLocked && lockedUntil
                  ? `Account locked. Try again in ${formatLockoutRemaining(lockedUntil)}.`
                  : error}
              </span>
            </div>
          )}

          <button type="submit" disabled={busy || isLocked || !consent} className={authButtonPrimary}>
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

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-vpv-line" />
            <span className="text-[11px] font-medium uppercase tracking-wide text-vpv-muted/70">
              or continue with
            </span>
            <div className="h-px flex-1 bg-vpv-line" />
          </div>

          <button
            type="button"
            onClick={onGoogle}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-vpv-line bg-white py-3 text-[13.5px] font-medium text-vpv-ink transition-all hover:border-vpv-blue/40 hover:bg-vpv-tint/40"
          >
            <GoogleGlyph />
            Google
          </button>

          <div className="mt-7 border-t border-vpv-line pt-6">
            <p className="mb-2.5 text-center text-[11.5px] font-medium uppercase tracking-wide text-vpv-muted/80">
              Not an MD?
            </p>
            <Link
              href="/signup/sales"
              className="group flex w-full items-center justify-center gap-2.5 rounded-xl border border-vpv-blue/25 bg-vpv-tint/50 py-3 text-vpv-navy transition-all hover:border-vpv-blue/50 hover:bg-vpv-tint"
            >
              <Users size={15} className="text-vpv-blue" />
              <span className="text-[13.5px] font-semibold">Sales team — sign in or join</span>
              <ArrowRight size={14} className="text-vpv-blue/70 transition-all group-hover:translate-x-0.5" />
            </Link>
            <p className="mt-2 text-center text-[11px] text-vpv-muted/70">
              Presenters &amp; reps join with an invite code from their admin.
            </p>
          </div>
        </form>
      )}
    </AuthSplit>
  );
}

/* ---------- Forgot-password inline panel ----------------------------- */

function ForgotPasswordPanel({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const captchaRef = useRef<TurnstileHandle>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaState, setCaptchaState] = useState<TurnstileState>("loading");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!captchaToken && captchaState === "loading") {
      setError("One moment — the security check is still loading. Please try again.");
      return;
    }
    setBusy(true);
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/reset`
        : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
      captchaToken: captchaToken ?? undefined,
    });
    captchaRef.current?.reset();
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
          <TurnstileBox
            ref={captchaRef}
            onToken={setCaptchaToken}
            onState={setCaptchaState}
            className="mb-3 flex justify-center"
          />
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
