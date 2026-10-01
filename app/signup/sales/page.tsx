"use client";

/**
 * /signup/sales — sales team member sign-up.
 *
 * Three steps:
 *   1. Form: name, mobile, email, password
 *   2. Submit → creates auth user, upserts profile with mobile + name
 *   3. Code: enter the bulk invite code from your admin → redeems →
 *      sets profiles.org_id + role='presenter' + device_limit from code
 *      → redirects to the sales dashboard.
 *
 * Below the form is an "already have an account? Log in" link that
 * sends existing presenters back to /login (no code needed on login —
 * the code is only redeemed on first signup).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getMyProfile } from "@/lib/auth";
import { redeemInviteCode } from "@/lib/inviteCodes";
import { slugForOrgId } from "@/lib/orgSlug";
import { goToDashboard } from "@/lib/authRedirect";
import AuthShell from "@/components/AuthShell";
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

  // Step 2 field
  const [code, setCode] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  async function onCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
    await supabase
      .from("profiles")
      .update({ org_id: res.orgId, role: "presenter" })
      .eq("id", userId);

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
    <AuthShell>
      {step === "details" && (
        <form onSubmit={onCreateAccount}>
          <h1 className="text-[26px] font-semibold tracking-tight mb-1">
            Join your sales team
          </h1>
          <p className="text-[13px] text-white/50 mb-6">
            Create your account. You&apos;ll enter your team code on the next
            step.
          </p>

          <Field label="Full name" icon={<User size={14} />}>
            <input
              type="text"
              required
              autoFocus
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Amit Sharma"
              className={inputCls}
            />
          </Field>

          <Field label="Mobile number" icon={<Phone size={14} />}>
            <input
              type="tel"
              required
              autoComplete="tel"
              inputMode="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="+91 98xxxxxxxx"
              className={inputCls}
            />
          </Field>

          <Field label="Email" icon={<Mail size={14} />}>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className={inputCls}
            />
          </Field>

          <Field label="Password" icon={<Lock size={14} />}>
            <input
              type={showPw ? "text" : "password"}
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 10 characters"
              className={inputCls + " pr-10"}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-white/40 hover:text-white/70"
              aria-label={showPw ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </Field>

          {error && (
            <div className="text-[12px] text-rose-300 mb-3 bg-rose-500/10 border border-rose-500/30 rounded px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-lg font-medium text-white bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-400 hover:to-indigo-400 shadow-[0_10px_30px_-8px_rgba(124,92,255,0.5)] disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
          >
            {busy ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Creating account…
              </>
            ) : (
              <>
                Continue <ArrowRight size={15} />
              </>
            )}
          </button>

          <div className="text-[12px] text-white/50 mt-6 text-center">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-violet-300 hover:text-violet-200 font-medium"
            >
              Log in
            </Link>
          </div>
        </form>
      )}

      {step === "verify-email" && (
        <div>
          <div
            className="w-14 h-14 rounded-full grid place-items-center mb-4"
            style={{
              background: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
            }}
          >
            <Mail size={24} className="text-emerald-300" />
          </div>
          <h1 className="text-[22px] font-semibold tracking-tight mb-2">
            Check your email
          </h1>
          <p className="text-[13px] text-white/60 mb-6 leading-relaxed">
            We sent a confirmation link to{" "}
            <strong className="text-white">{email}</strong>. Click it, then
            come back here and sign in to enter your team code.
          </p>
          <Link
            href="/login"
            className="w-full py-2.5 rounded-lg font-medium text-white bg-gradient-to-r from-violet-500 to-indigo-500 flex items-center justify-center gap-2"
          >
            Go to sign in <ArrowRight size={15} />
          </Link>
        </div>
      )}

      {step === "code" && (
        <form onSubmit={onRedeemCode}>
          <div
            className="w-14 h-14 rounded-full grid place-items-center mb-4"
            style={{
              background: "rgba(139, 92, 246, 0.14)",
              border: "1px solid rgba(139, 92, 246, 0.35)",
            }}
          >
            <KeyRound size={22} className="text-violet-300" />
          </div>
          <h1 className="text-[22px] font-semibold tracking-tight mb-1">
            Enter your team code
          </h1>
          <p className="text-[13px] text-white/50 mb-6">
            Your admin shared this with you.
          </p>

          <input
            type="text"
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="XXXXXXXX"
            maxLength={16}
            className="w-full mb-4 bg-white/[0.03] border border-white/10 rounded-lg px-4 py-3 text-center text-[20px] font-mono tracking-[0.3em] text-white outline-none focus:border-violet-400/60 focus:bg-white/[0.05]"
          />

          {error && (
            <div className="text-[12px] text-rose-300 mb-3 bg-rose-500/10 border border-rose-500/30 rounded px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !code}
            className="w-full py-2.5 rounded-lg font-medium text-white bg-gradient-to-r from-violet-500 to-indigo-500 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Joining team…
              </>
            ) : (
              <>
                <CheckCircle2 size={15} /> Join the team
              </>
            )}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

const inputCls =
  "w-full bg-white/[0.03] border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-[14px] outline-none focus:border-violet-400/60 focus:bg-white/[0.05]";

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
    <div className="mb-3">
      <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">
        {label}
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">
          {icon}
        </span>
        {children}
      </div>
    </div>
  );
}
