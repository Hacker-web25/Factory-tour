"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getMyProfile, signOut } from "@/lib/auth";
import { uniqueSlugForOrg, slugForOrgId } from "@/lib/orgSlug";
import { redeemInviteCode } from "@/lib/inviteCodes";
import AuthShell from "@/components/AuthShell";
import {
  Factory,
  Users2,
  ArrowRight,
  ChevronLeft,
  Building2,
  KeyRound,
  LogOut,
  Loader2,
} from "lucide-react";

type Step = "picker" | "owner" | "sales";

/**
 * /setup — one-time role selection after signup.
 *
 * Users who already have role + org set are auto-redirected to their
 * dashboard. Everyone else picks:
 *   - "Factory Owner" → enter org name → create org → /{slug}/owner
 *   - "Sales Team"    → enter invite code → validate → /{slug}/sales
 */
export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("picker");
  const [checking, setChecking] = useState(true);
  const [orgName, setOrgName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");

  useEffect(() => {
    (async () => {
      const p = await getMyProfile();
      if (!p) {
        router.replace("/login?next=/setup");
        return;
      }
      setUserEmail(p.email);
      // Super-owner (you, NITIN) → cross-org tour editor at /.
      if (p.role === "owner") {
        router.replace("/");
        return;
      }
      // Already onboarded — jump straight to the right dashboard.
      if (p.org_id) {
        const slug = await slugForOrgId(p.org_id);
        if (slug) {
          const role = p.role === "presenter" ? "sales" : "owner";
          router.replace(`/${slug}/${role}`);
          return;
        }
      }
      setChecking(false);
    })();
  }, [router]);

  async function submitOwner(e: React.FormEvent) {
    e.preventDefault();
    if (!orgName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const p = await getMyProfile();
      if (!p) throw new Error("Not signed in");
      const slug = await uniqueSlugForOrg(orgName.trim());
      const { data: org, error: orgErr } = await supabase
        .from("organizations")
        .insert({ name: orgName.trim(), slug })
        .select()
        .single();
      if (orgErr) throw orgErr;
      const { error: profErr } = await supabase
        .from("profiles")
        .update({ role: "org_admin", org_id: org.id })
        .eq("id", p.id);
      if (profErr) throw profErr;
      router.replace(`/${slug}/owner`);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
      setBusy(false);
    }
  }

  async function submitSales(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const p = await getMyProfile();
      if (!p) throw new Error("Not signed in");
      const res = await redeemInviteCode(code, p.id);
      if ("error" in res) throw new Error(res.error);
      const { error: profErr } = await supabase
        .from("profiles")
        .update({ role: "presenter", org_id: res.orgId })
        .eq("id", p.id);
      if (profErr) throw profErr;
      const slug = await slugForOrgId(res.orgId);
      router.replace(`/${slug}/sales`);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
      setBusy(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  if (checking) {
    return (
      <AuthShell>
        <div className="flex items-center gap-3 text-white/60 text-[13px] py-8 justify-center">
          <Loader2 size={16} className="animate-spin" /> Checking your setup…
        </div>
      </AuthShell>
    );
  }

  if (step === "owner") {
    return (
      <AuthShell>
        <form onSubmit={submitOwner}>
          <button
            type="button"
            onClick={() => {
              setStep("picker");
              setError(null);
            }}
            className="text-[11px] text-white/50 hover:text-white mb-4 flex items-center gap-1"
          >
            <ChevronLeft size={12} /> Back
          </button>
          <h1 className="text-[26px] font-semibold tracking-tight mb-1">
            Name your organization
          </h1>
          <p className="text-[13px] text-white/50 mb-6">
            This is how your factory will appear across the platform. You can
            change it later.
          </p>
          <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">
            Organization name
          </label>
          <div className="relative mb-3">
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
              className="w-full bg-white/[0.03] border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-[14px] outline-none focus:border-violet-400/60"
            />
          </div>
          {orgName.trim() && (
            <div className="text-[11px] text-white/50 mb-4">
              Your dashboard will live at{" "}
              <span className="text-violet-300 font-mono">
                factour.app/
                {orgName
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-+|-+$/g, "") || "org"}
                /owner
              </span>
            </div>
          )}
          {error && (
            <div className="text-[12px] text-rose-300 mb-3 bg-rose-500/10 border border-rose-500/30 rounded px-3 py-2">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={busy || !orgName.trim()}
            className="w-full py-2.5 rounded-lg font-medium text-white bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-400 hover:to-indigo-400 disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_10px_30px_-8px_rgba(124,92,255,0.5)]"
          >
            {busy ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Creating…
              </>
            ) : (
              <>
                Create organization <ArrowRight size={14} />
              </>
            )}
          </button>
        </form>
      </AuthShell>
    );
  }

  if (step === "sales") {
    return (
      <AuthShell>
        <form onSubmit={submitSales}>
          <button
            type="button"
            onClick={() => {
              setStep("picker");
              setError(null);
            }}
            className="text-[11px] text-white/50 hover:text-white mb-4 flex items-center gap-1"
          >
            <ChevronLeft size={12} /> Back
          </button>
          <h1 className="text-[26px] font-semibold tracking-tight mb-1">
            Enter your invite code
          </h1>
          <p className="text-[13px] text-white/50 mb-6">
            Your admin generated a code and shared it with you (email or
            message). Type it in below to join their team.
          </p>
          <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">
            Invite code
          </label>
          <div className="relative mb-4">
            <KeyRound
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
            />
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX"
              autoFocus
              maxLength={12}
              className="w-full bg-white/[0.03] border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-[16px] font-mono tracking-widest outline-none focus:border-cyan-400/60"
            />
          </div>
          {error && (
            <div className="text-[12px] text-rose-300 mb-3 bg-rose-500/10 border border-rose-500/30 rounded px-3 py-2">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={busy || !code.trim()}
            className="w-full py-2.5 rounded-lg font-medium text-black bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_10px_30px_-8px_rgba(34,211,238,0.5)]"
          >
            {busy ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Joining…
              </>
            ) : (
              <>
                Join team <ArrowRight size={14} />
              </>
            )}
          </button>
          <p className="text-[11px] text-white/40 mt-5 text-center">
            Don&apos;t have a code? Ask your admin to generate one from their
            dashboard&apos;s <span className="text-white/60">Team</span>{" "}
            section.
          </p>
        </form>
      </AuthShell>
    );
  }

  // Picker
  return (
    <AuthShell>
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight mb-1">
          Welcome to Factory Tour
        </h1>
        <p className="text-[13px] text-white/50 mb-8">
          Signed in as{" "}
          <span className="text-white/80">{userEmail}</span> — one last step.
        </p>

        <button
          onClick={() => setStep("owner")}
          className="group w-full text-left mb-3 rounded-xl border border-white/10 bg-gradient-to-br from-violet-500/15 via-indigo-500/10 to-transparent hover:border-violet-400/50 hover:from-violet-500/25 transition-all p-4"
        >
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 grid place-items-center shadow-[0_8px_24px_-4px_rgba(139,92,246,0.6)]">
              <Factory size={20} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-semibold text-white mb-0.5">
                I&apos;m the Factory Owner
              </div>
              <div className="text-[12px] text-white/60 leading-relaxed">
                You&apos;ll be the admin. Create your organization, upload
                panoramas, and invite salespeople as presenters.
              </div>
            </div>
            <ArrowRight
              size={16}
              className="text-white/40 group-hover:text-white group-hover:translate-x-0.5 transition-all mt-1"
            />
          </div>
        </button>

        <button
          onClick={() => setStep("sales")}
          className="group w-full text-left rounded-xl border border-white/10 bg-gradient-to-br from-cyan-500/15 via-emerald-500/10 to-transparent hover:border-cyan-400/50 hover:from-cyan-500/25 transition-all p-4"
        >
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-cyan-500 to-emerald-500 grid place-items-center shadow-[0_8px_24px_-4px_rgba(34,211,238,0.6)]">
              <Users2 size={20} className="text-black" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-semibold text-white mb-0.5">
                I&apos;m on the Sales Team
              </div>
              <div className="text-[12px] text-white/60 leading-relaxed">
                Join your organization with an invite code from your admin —
                start presenting factory tours to prospects.
              </div>
            </div>
            <ArrowRight
              size={16}
              className="text-white/40 group-hover:text-white group-hover:translate-x-0.5 transition-all mt-1"
            />
          </div>
        </button>

        <button
          onClick={handleSignOut}
          className="mt-8 mx-auto flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/70"
        >
          <LogOut size={11} /> Sign out
        </button>
      </div>
    </AuthShell>
  );
}
