"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getMyProfile, signOut } from "@/lib/auth";
import { slugForOrgId } from "@/lib/orgSlug";
import { goToDashboard } from "@/lib/authRedirect";
import { redeemInviteCode } from "@/lib/inviteCodes";
import AuthShell from "@/components/AuthShell";
import { Users2, ArrowRight, KeyRound, LogOut, Loader2 } from "lucide-react";

/**
 * /setup — post-signup step for sales-team members.
 *
 * Organizations are created MANUALLY by the platform owner (Nitin) via
 * the super-owner dashboard, and the org_admin's profile is set at
 * that time — so org_admins never see this page (they auto-redirect
 * to /{slug}/owner from the useEffect below).
 *
 * A freshly signed-up user with no org_id is assumed to be a sales
 * presenter who needs to redeem an invite code from their admin.
 */
export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
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
      // Manually-provisioned org_admins land here on first login and
      // immediately bounce to /{slug}/owner.
      if (p.org_id) {
        const slug = await slugForOrgId(p.org_id);
        if (slug) {
          const role = p.role === "presenter" ? "sales" : "owner";
          await goToDashboard(slug, role);
          return;
        }
      }
      setChecking(false);
    })();
  }, [router]);

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
      if (slug) await goToDashboard(slug, "sales");
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

  return (
    <AuthShell>
      <form onSubmit={submitSales}>
        <div className="flex items-start gap-3 mb-6">
          <div className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-cyan-500 to-emerald-500 grid place-items-center shadow-[0_8px_24px_-4px_rgba(34,211,238,0.6)]">
            <Users2 size={20} className="text-black" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight mb-1 leading-tight">
              Join your team
            </h1>
            <p className="text-[12px] text-white/50">
              Signed in as{" "}
              <span className="text-white/80">{userEmail}</span>
            </p>
          </div>
        </div>

        <p className="text-[13px] text-white/60 mb-6 leading-relaxed">
          Your organization admin generated an invite code for you and
          shared it over email or message. Type it in below to join their
          team as a sales presenter.
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

        <p className="text-[11px] text-white/40 mt-5 text-center leading-relaxed">
          Don&apos;t have a code? Ask your admin to generate one from their
          dashboard&apos;s <span className="text-white/60">Team</span>{" "}
          section.
          <br />
          If your organization hasn&apos;t been set up yet, contact{" "}
          <a
            href="mailto:sales@myvpv.com"
            className="text-cyan-300 hover:text-cyan-200"
          >
            sales@myvpv.com
          </a>
          .
        </p>

        <button
          type="button"
          onClick={handleSignOut}
          className="mt-6 mx-auto flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/70"
        >
          <LogOut size={11} /> Sign out
        </button>
      </form>
    </AuthShell>
  );
}
