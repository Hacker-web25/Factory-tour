"use client";

/**
 * /signup/sales — sales team member sign-up.
 *
 * Three steps:
 *   1. Form: name, mobile, email, password (+ consent to Terms/Privacy/Refund)
 *   2. Submit → creates auth user, upserts profile with mobile + name
 *   3. Code: enter the bulk invite code from your admin → redeems →
 *      sets profiles.org_id + role='presenter' + device_limit from code
 *      → redirects to the sales dashboard.
 *
 * Below the form is an "already have an account? Log in" link that
 * sends existing presenters back to /login (no code needed on login —
 * the code is only redeemed on first signup). MDs / owners have their
 * own entry on /login.
 *
 * Look and feel: shares AuthSplit with /login so both pages match.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getMyProfile } from "@/lib/auth";
import { redeemInviteCode } from "@/lib/inviteCodes";
import { enforceRateLimit } from "@/lib/rateLimit";
import { getDeviceFingerprint } from "@/lib/deviceFingerprint";
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
  User,
  Phone,
  Mail,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Users,
  Crown,
} from "lucide-react";

type Step = "details" | "code" | "verify-email";

export default function SalesSignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("details");

  // Step 1 fields
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [consent, setConsent] = useState(false);

  // Step 2 field
  const [code, setCode] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Already-signed-in presenter with no org? Must have come back after
  // email confirmation. Skip the account form and jump straight to the
  // code redemption step.
  useEffect(() => {
    (async () => {
      const profile = await getMyProfile();
      if (profile && !profile.org_id && profile.role !== "owner") {
        setUserId(profile.id);
        setEmail(profile.email);
        setFullName(profile.full_name ?? "");
        setStep("code");
      }
    })();
  }, []);

  async function onCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!consent) {
      setError("Please accept the Terms, Privacy and Refund policies to continue.");
      return;
    }
    if (password.length < 10) {
      setError("Password must be at least 10 characters.");
      return;
    }
    if (!fullName.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!mobile.trim()) {
      setError("Please enter your mobile number.");
      return;
    }
    // Rate-limit account creation per browser — 3 per 30 min. The
    // real abuse-stop is the invite code requirement, but this
    // prevents a bot from hammering signup to fish for existing
    // email collisions.
    const rl = await enforceRateLimit(
      `signup-sales:fp:${getDeviceFingerprint()}`,
      3,
      1800
    );
    if (!rl.allowed) {
      setError(
        `Too many signup attempts. Try again in ${Math.ceil(
          rl.retryAfter / 60
        )} minute${rl.retryAfter > 60 ? "s" : ""}.`
      );
      return;
    }

    setBusy(true);

    // Create the Supabase auth user.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          name: fullName.trim(),
          mobile_number: mobile.trim(),
        },
      },
    });
    setBusy(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    // Depending on Supabase project settings:
    //  - email confirmation ON  → data.user exists but data.session is null
    //  - email confirmation OFF → both exist, user is logged in
    const createdUserId = data.user?.id ?? null;
    if (!createdUserId) {
      setError("Could not create your account. Please try again.");
      return;
    }
    setUserId(createdUserId);

    // Upsert the profile row with name + mobile. role/org set in step 2.
    await supabase.from("profiles").upsert(
      {
        id: createdUserId,
        email: email.trim().toLowerCase(),
        full_name: fullName.trim(),
        mobile_number: mobile.trim(),
        role: "presenter",
      },
      { onConflict: "id" }
    );

    if (!data.session) {
      // Email confirmation is on — can't redeem until they click the
      // confirmation link + come back to log in. Show a holding screen
      // explaining what's next.
      setStep("verify-email");
      return;
    }

    // Logged in straight away — go to code step.
    setStep("code");
  }

  async function onRedeemCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!userId) {
      setError("Session lost. Please sign in and try again.");
      return;
    }
    const clean = code.trim().toUpperCase();
    if (!clean) {
      setError("Please enter your invite code.");
      return;
    }
    setBusy(true);
    const res = await redeemInviteCode(clean, userId);
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    // Attach the user to the org as presenter.
    const attach = await supabase
      .from("profiles")
      .update({ org_id: res.orgId, role: "presenter" })
      .eq("id", userId);
    if (attach.error && /sales_logins_full/.test(attach.error.message)) {
      // The database refuses a salesperson beyond the logins the company paid for.
      setError(
        "All the Sales Team logins your company has paid for are in use. Please ask your admin to free one up or add more."
      );
      return;
    }

    // Hand off to the sales dashboard on the right subdomain.
    const profile = await getMyProfile();
    const slug = profile?.org_id ? await slugForOrgId(profile.org_id) : null;
    if (slug) {
      await goToDashboard(slug, "sales");
    } else {
      router.replace("/setup");
    }
  }

  return (
    <AuthSplit
      pill="Built for the sales floor"
      headline="Take the factory"
      accent="to every buyer."
      body="Present your real plant in the room, share a tour link afterwards, and see exactly what each buyer explored — so every visit moves the deal forward."
    >
      {step === "details" && (
        <form onSubmit={onCreateAccount}>
          <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-vpv-blue/20 bg-vpv-tint px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-vpv-navy">
            <Users size={12} className="text-vpv-blue" />
            For the Sales Team
          </div>

          <h1 className="text-[26px] font-semibold tracking-tight text-vpv-ink">
            Join your sales team
          </h1>
          <p className="mt-1 mb-6 text-[13.5px] text-vpv-muted">
            Create your account. You&apos;ll enter your team code on the next step.
          </p>

          <Field label="Full name" icon={<User size={15} />}>
            <input
              type="text"
              required
              autoFocus
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Amit Sharma"
              className={authInput}
            />
          </Field>

          <Field label="Mobile number" icon={<Phone size={15} />}>
            <input
              type="tel"
              required
              autoComplete="tel"
              inputMode="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="+91 98xxxxxxxx"
              className={authInput}
            />
          </Field>

          <Field label="Email" icon={<Mail size={15} />}>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className={authInput}
            />
          </Field>

          <Field label="Password" icon={<Lock size={15} />}>
            <input
              type={showPw ? "text" : "password"}
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 10 characters"
              className={authInput + " pr-11"}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-vpv-muted/70 hover:text-vpv-ink"
              aria-label={showPw ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </Field>

          <div className="mt-1">
            <ConsentCheckbox checked={consent} onChange={setConsent} />
          </div>

          {error && (
            <div className={authErrorBox}>
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button type="submit" disabled={busy || !consent} className={authButtonPrimary}>
            {busy ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Creating account…
              </>
            ) : (
              <>
                Continue <ArrowRight size={16} />
              </>
            )}
          </button>

          <div className="mt-6 text-center text-[12.5px] text-vpv-muted">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-vpv-blue hover:text-vpv-navy">
              Log in
            </Link>
          </div>

          <div className="mt-6 border-t border-vpv-line pt-5">
            <Link
              href="/login"
              className="group flex w-full items-center justify-center gap-2.5 rounded-xl border border-vpv-blue/25 bg-vpv-tint/50 py-3 text-vpv-navy transition-all hover:border-vpv-blue/50 hover:bg-vpv-tint"
            >
              <Crown size={15} className="text-vpv-blue" />
              <span className="text-[13.5px] font-semibold">MD or owner? Sign in here</span>
              <ArrowRight size={14} className="text-vpv-blue/70 transition-all group-hover:translate-x-0.5" />
            </Link>
          </div>
        </form>
      )}

      {step === "verify-email" && (
        <div>
          <div className="mb-4 grid h-14 w-14 place-items-center rounded-full border border-emerald-200 bg-emerald-50">
            <Mail size={24} className="text-emerald-600" />
          </div>
          <h1 className="mb-2 text-[22px] font-semibold tracking-tight text-vpv-ink">
            Check your email
          </h1>
          <p className="mb-6 text-[13.5px] leading-relaxed text-vpv-muted">
            We sent a confirmation link to{" "}
            <strong className="text-vpv-ink">{email}</strong>. Click it, then come
            back here and sign in to enter your team code.
          </p>
          <Link href="/login" className={authButtonPrimary}>
            Go to sign in <ArrowRight size={16} />
          </Link>
        </div>
      )}

      {step === "code" && (
        <form onSubmit={onRedeemCode}>
          <div className="mb-4 grid h-14 w-14 place-items-center rounded-full border border-vpv-blue/25 bg-vpv-tint">
            <KeyRound size={22} className="text-vpv-blue" />
          </div>
          <h1 className="mb-1 text-[22px] font-semibold tracking-tight text-vpv-ink">
            Enter your team code
          </h1>
          <p className="mb-6 text-[13.5px] text-vpv-muted">Your admin shared this with you.</p>

          <input
            type="text"
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="XXXXXXXX"
            maxLength={16}
            className="mb-4 w-full rounded-xl border border-vpv-line bg-white px-4 py-3.5 text-center font-mono text-[20px] tracking-[0.3em] text-vpv-ink outline-none transition-all placeholder:text-vpv-muted/40 focus:border-vpv-blue focus:ring-2 focus:ring-vpv-blue/15"
          />

          {error && (
            <div className={authErrorBox}>
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button type="submit" disabled={busy || !code} className={authButtonPrimary}>
            {busy ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Joining team…
              </>
            ) : (
              <>
                <CheckCircle2 size={16} /> Join the team
              </>
            )}
          </button>
        </form>
      )}
    </AuthSplit>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3.5">
      <label className={authLabel}>{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-vpv-muted/70">
          {icon}
        </span>
        {children}
      </div>
    </div>
  );
}
