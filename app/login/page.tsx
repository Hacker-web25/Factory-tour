"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn, signInWithGoogle } from "@/lib/auth";
import AuthShell from "@/components/AuthShell";
import { Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    const next =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("next")
        : null;
    router.push(next || "/");
  }

  return (
    <AuthShell>
      <form onSubmit={onSubmit}>
        <h1 className="text-[26px] font-semibold tracking-tight mb-1">
          Welcome back
        </h1>
        <p className="text-[13px] text-white/50 mb-8">
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
            onClick={() =>
              alert(
                "Password reset — coming soon. Contact your admin to reset."
              )
            }
          >
            Forgot password?
          </button>
        </div>

        {error && (
          <div className="text-[12px] text-rose-300 mb-3 bg-rose-500/10 border border-rose-500/30 rounded px-3 py-2">
            {error}
          </div>
        )}

        {/* Sign in */}
        <button
          type="submit"
          disabled={busy}
          className="w-full py-2.5 rounded-lg font-medium text-white bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-400 hover:to-indigo-400 shadow-[0_10px_30px_-8px_rgba(124,92,255,0.5)] disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
        >
          {busy ? "Signing in…" : (
            <>
              Sign in
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

        <div className="text-[12px] text-white/50 mt-6 text-center">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="text-violet-300 hover:text-violet-200 font-medium"
          >
            Get started
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
