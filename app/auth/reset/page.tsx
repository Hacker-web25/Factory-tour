"use client";

/**
 * /auth/reset — landing page from the Supabase password-recovery email.
 *
 * How it works:
 *   The link in the email contains access + refresh tokens that the
 *   Supabase JS SDK auto-detects (detectSessionInUrl: true in our
 *   supabase client config). By the time this component mounts, the
 *   user is already signed in to a short-lived "recovery" session.
 *
 *   We let them set a new password with auth.updateUser(). On success
 *   we send them to /login so they can sign in fresh with the new
 *   password (and get properly rate-limited + device-slotted via the
 *   usual flow).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import AuthShell from "@/components/AuthShell";
import { Lock, Eye, EyeOff, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [sessionOk, setSessionOk] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // The Supabase SDK ingests the ?token hash from the URL on mount.
  // Give it a tick, then check whether a session was established.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setSessionOk(!!data.session);
      setReady(true);
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 10) {
      setError("Password must be at least 10 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    // Sign out of the recovery session so the next step is a clean
    // password login via the usual flow (rate-limit + device slot).
    await supabase.auth.signOut();
    setDone(true);
    window.setTimeout(() => router.replace("/login"), 1600);
  }

  return (
    <AuthShell>
      {!ready ? (
        <div className="grid place-items-center py-10 text-white/60 text-sm">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : !sessionOk ? (
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight mb-2">
            Link expired
          </h1>
          <p className="text-[13px] text-white/60 mb-6 leading-relaxed">
            This reset link is no longer valid. It may have been used already,
            or expired. Request a new one from the login page.
          </p>
          <Link
            href="/login"
            className="w-full py-2.5 rounded-lg font-medium text-white bg-gradient-to-r from-violet-500 to-indigo-500 flex items-center justify-center gap-2"
          >
            Back to sign in <ArrowRight size={15} />
          </Link>
        </div>
      ) : done ? (
        <div className="text-center">
          <div
            className="w-14 h-14 rounded-full grid place-items-center mx-auto mb-4"
            style={{
              background: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
            }}
          >
            <CheckCircle2 size={26} className="text-emerald-300" />
          </div>
          <h1 className="text-[22px] font-semibold tracking-tight mb-2">
            Password updated
          </h1>
          <p className="text-[13px] text-white/60 mb-2">
            Redirecting you to sign in…
          </p>
        </div>
      ) : (
        <form onSubmit={submit}>
          <h1 className="text-[22px] font-semibold tracking-tight mb-1">
            Set a new password
          </h1>
          <p className="text-[13px] text-white/50 mb-7">
            At least 10 characters. You&apos;ll be signed back in afterwards.
          </p>

          <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">
            New password
          </label>
          <div className="relative mb-3">
            <Lock
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
            />
            <input
              type={show ? "text" : "password"}
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/10 rounded-lg pl-9 pr-10 py-2.5 text-[14px] outline-none focus:border-violet-400/60 focus:bg-white/[0.05]"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-white/40 hover:text-white/70"
              aria-label={show ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>

          <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">
            Confirm
          </label>
          <div className="relative mb-4">
            <Lock
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
            />
            <input
              type={show ? "text" : "password"}
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
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
            disabled={busy}
            className="w-full py-2.5 rounded-lg font-medium text-white bg-gradient-to-r from-violet-500 to-indigo-500 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Updating…
              </>
            ) : (
              <>
                Update password <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
