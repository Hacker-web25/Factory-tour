"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUp } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import AuthShell from "@/components/AuthShell";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Building2,
  User,
} from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await signUp({
      email,
      password,
      fullName: fullName || undefined,
      orgName,
    });
    setBusy(false);
    if ("error" in res && res.error) {
      setError((res.error as Error).message);
      return;
    }
    router.push("/");
  }

  return (
    <AuthShell>
      <form onSubmit={onSubmit}>
        <h1 className="text-[26px] font-semibold tracking-tight mb-1">
          Create your account
        </h1>
        <p className="text-[13px] text-white/50 mb-8">
          You&apos;ll be the admin — invite presenters after signing in.
        </p>

        {/* Org name */}
        <div className="mb-3">
          <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">
            Organization
          </label>
          <div className="relative">
            <Building2
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
            />
            <input
              type="text"
              required
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Acme Manufacturing"
              autoFocus
              className="w-full bg-white/[0.03] border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-[14px] outline-none focus:border-violet-400/60 focus:bg-white/[0.05]"
            />
          </div>
        </div>

        {/* Full name */}
        <div className="mb-3">
          <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">
            Your name{" "}
            <span className="text-white/30 normal-case tracking-normal">
              (optional)
            </span>
          </label>
          <div className="relative">
            <User
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
            />
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Doe"
              autoComplete="name"
              className="w-full bg-white/[0.03] border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-[14px] outline-none focus:border-violet-400/60 focus:bg-white/[0.05]"
            />
          </div>
        </div>

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
              autoComplete="email"
              className="w-full bg-white/[0.03] border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-[14px] outline-none focus:border-violet-400/60 focus:bg-white/[0.05]"
            />
          </div>
        </div>

        {/* Password */}
        <div className="mb-5">
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
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8+ characters"
              autoComplete="new-password"
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
          {busy ? "Creating…" : (
            <>
              Create account
              <ArrowRight size={15} />
            </>
          )}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-[11px] text-white/40">or continue with</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Google — requires org name so we can create the org on
            callback via the ?org= param. */}
        <button
          type="button"
          onClick={async () => {
            if (!orgName.trim()) {
              setError("Please enter an organization name first.");
              return;
            }
            const redirectTo = `${window.location.origin}/auth/callback?next=/&org=${encodeURIComponent(
              orgName.trim()
            )}`;
            await supabase.auth.signInWithOAuth({
              provider: "google",
              options: { redirectTo },
            });
          }}
          className="w-full py-2.5 rounded-lg bg-white text-black font-medium flex items-center justify-center gap-2 hover:bg-white/95"
        >
          <GoogleGlyph />
          Google
        </button>

        <div className="text-[12px] text-white/50 mt-6 text-center">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-violet-300 hover:text-violet-200 font-medium"
          >
            Sign in
          </Link>
        </div>
      </form>
    </AuthShell>
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
