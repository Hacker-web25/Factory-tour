"use client";

/**
 * /billing — "Plan and billing" for an organisation admin.
 *
 * Answers the three questions a paying customer actually has:
 *   What am I on?  How many scenes can my customers see?
 *   Is my support still covered, and when does it run out?
 *   Where are my invoices?
 *
 * And gives them the two buttons that used to be an e-mail to you:
 * renew support, and buy more scenes.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CreditCard,
  Crown,
  FileText,
  Loader2,
  LifeBuoy,
  Plus,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getMyProfile, type Profile } from "@/lib/auth";
import VpvLogo from "@/components/dashboard/VpvLogo";
import { LegalLinks } from "@/components/legal/SiteFooter";
import CheckoutFlow from "@/components/billing/CheckoutFlow";
import SceneCalculator from "@/components/billing/SceneCalculator";
import {
  PRO_MONTHLY_INR,
  SUPPORT_ANNUAL_INR,
  SUPPORT_GRACE_DAYS,
  fromPaise,
  inr,
  priceForScenes,
} from "@/lib/pricing";

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  plan: "basic" | "pro" | "ultra";
  plan_status: string | null;
  scene_quota: number | null;
  support_until: string | null;
  activated_at: string | null;
  billing_email: string | null;
  billing_gstin: string | null;
};

type InvoiceRow = {
  invoice_no: string;
  description: string;
  total_paise: number;
  issued_at: string;
};

type SupportState = "active" | "grace" | "lapsed" | "none";

function supportState(until: string | null): SupportState {
  if (!until) return "none";
  const end = new Date(until).getTime();
  const now = Date.now();
  if (end >= now) return "active";
  if (end + SUPPORT_GRACE_DAYS * 86_400_000 >= now) return "grace";
  return "lapsed";
}

function daysBetween(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export default function BillingPage() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [org, setOrg] = useState<OrgRow | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pane, setPane] = useState<"none" | "support" | "scenes">("none");
  const [topupTo, setTopupTo] = useState<number>(0);

  const load = useCallback(async () => {
    const p = await getMyProfile();
    if (!p) {
      router.replace("/login?next=/billing");
      return;
    }
    setMe(p);

    const { data: sess } = await supabase.auth.getSession();
    setToken(sess.session?.access_token ?? null);

    if (p.org_id) {
      const { data: orgRow } = await supabase
        .from("organizations")
        .select(
          "id, name, slug, plan, plan_status, scene_quota, support_until, activated_at, billing_email, billing_gstin"
        )
        .eq("id", p.org_id)
        .maybeSingle();
      if (orgRow) {
        setOrg(orgRow as OrgRow);
        setTopupTo(((orgRow as OrgRow).scene_quota ?? 2) + 1);
      }

      const { data: inv } = await supabase
        .from("billing_invoices")
        .select("invoice_no, description, total_paise, issued_at")
        .eq("org_id", p.org_id)
        .order("issued_at", { ascending: false })
        .limit(50);
      setInvoices((inv ?? []) as InvoiceRow[]);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-vpv-canvas text-vpv-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!org) {
    return (
      <Shell>
        <div className="rounded-2xl border border-vpv-line bg-white p-8 text-center">
          <h1 className="text-[20px] font-semibold text-vpv-ink">No organisation yet</h1>
          <p className="mx-auto mt-2 max-w-sm text-[14px] text-slate-600">
            Your account is not attached to a workspace. If you have just paid,
            give it a minute and refresh — or write to billing@myvpv.com.
          </p>
        </div>
      </Shell>
    );
  }

  const isAdmin = me?.role === "org_admin" || me?.role === "owner";
  const state = supportState(org.support_until);
  const daysLeft = org.support_until ? daysBetween(org.support_until) : null;
  const quota = org.scene_quota;

  return (
    <Shell>
      <div className="mb-8">
        <h1 className="text-[28px] font-semibold tracking-tight text-vpv-ink">
          Plan and billing
        </h1>
        <p className="mt-1 text-[13.5px] text-vpv-muted">
          {org.name} · {org.slug}.myvpv.com
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Plan */}
        <Card>
          <CardHead icon={<Crown size={17} />} title="Your plan" />
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-[28px] font-semibold capitalize tracking-tight text-vpv-ink">
              {org.plan}
            </span>
            {org.plan === "basic" && (
              <span className="text-[13px] text-slate-500">one-time licence</span>
            )}
            {org.plan !== "basic" && (
              <span className="text-[13px] text-slate-500">monthly</span>
            )}
          </div>
          <p className="mt-3 text-[13.5px] leading-relaxed text-slate-600">
            {org.plan === "basic" ? (
              <>
                Your customers can see{" "}
                <strong className="text-vpv-ink">
                  the first {quota ?? 2} scene{(quota ?? 2) === 1 ? "" : "s"}
                </strong>{" "}
                of each tour. Your team sees every scene in the editor.
              </>
            ) : (
              <>
                Unlimited scenes. Every scene you build is visible to your
                customers.
              </>
            )}
          </p>
          {org.plan === "basic" && (
            <div className="mt-4 rounded-xl bg-vpv-tint/60 px-4 py-3 text-[12.5px] leading-relaxed text-vpv-navy">
              Going beyond {quota ?? 2} rooms often? Pro is {inr(PRO_MONTHLY_INR)} a
              month for unlimited scenes —{" "}
              <Link href="/contact" className="underline underline-offset-2">
                talk to us
              </Link>
              .
            </div>
          )}
        </Card>

        {/* Support */}
        <Card>
          <CardHead icon={<LifeBuoy size={17} />} title="Technical support" />
          <div className="mt-4">
            <SupportBadge state={state} />
          </div>
          <p className="mt-3 text-[13.5px] leading-relaxed text-slate-600">
            {state === "active" && org.support_until && (
              <>
                Covered until{" "}
                <strong className="text-vpv-ink">
                  {new Date(org.support_until).toDateString()}
                </strong>
                {daysLeft !== null && daysLeft <= 45 && <> — {daysLeft} days left.</>}
              </>
            )}
            {state === "grace" && (
              <>
                Your support year has ended. You are inside the{" "}
                {SUPPORT_GRACE_DAYS}-day grace period — renew now and nothing is
                interrupted.
              </>
            )}
            {state === "lapsed" && (
              <>
                Support has paused. Your workspace and tours still work; renew to
                get e-mail support and maintenance back.
              </>
            )}
            {state === "none" && <>No support period recorded yet.</>}
          </p>
          {isAdmin && org.plan === "basic" && (
            <button
              onClick={() => setPane(pane === "support" ? "none" : "support")}
              className="mt-4 w-full rounded-full bg-vpv-grad py-2.5 text-[13.5px] font-semibold text-white hover:opacity-95"
            >
              Renew for {inr(SUPPORT_ANNUAL_INR)} a year
            </button>
          )}
          {org.plan !== "basic" && (
            <p className="mt-4 flex items-center gap-1.5 text-[13px] text-emerald-700">
              <Check size={14} /> Included with {org.plan}
            </p>
          )}
        </Card>

        {/* Scenes */}
        <Card>
          <CardHead icon={<Plus size={17} />} title="Scenes" />
          <div className="mt-4 text-[28px] font-semibold tabular-nums tracking-tight text-vpv-ink">
            {quota ?? "Unlimited"}
          </div>
          <p className="mt-3 text-[13.5px] leading-relaxed text-slate-600">
            {org.plan === "basic"
              ? "Scenes your customers can see. Add more at any time — the price per scene keeps falling."
              : "No limit on this plan."}
          </p>
          {isAdmin && org.plan === "basic" && (
            <button
              onClick={() => setPane(pane === "scenes" ? "none" : "scenes")}
              className="mt-4 w-full rounded-full border border-vpv-blue/40 py-2.5 text-[13.5px] font-semibold text-vpv-blue hover:bg-vpv-tint"
            >
              Add more scenes
            </button>
          )}
        </Card>
      </div>

      {/* ── Buy panes ───────────────────────────────────────────────── */}
      {pane === "support" && isAdmin && (
        <Pane title="Renew technical support">
          <CheckoutFlow
            purpose="support_renewal"
            accessToken={token}
            prefill={{
              name: me?.full_name ?? "",
              email: org.billing_email ?? me?.email ?? "",
              company: org.name,
              gstin: org.billing_gstin ?? "",
            }}
          />
        </Pane>
      )}

      {pane === "scenes" && isAdmin && (
        <Pane title="Add more scenes">
          <p className="mb-5 max-w-xl text-[14px] leading-relaxed text-slate-600">
            You have {quota ?? 0} scene{(quota ?? 0) === 1 ? "" : "s"} today. Drag
            to the total you want — you pay only the difference, at the same
            falling rate.
          </p>
          <SceneCalculator value={topupTo} onChange={setTopupTo} compact />
          <div className="mt-4 rounded-xl border border-vpv-line bg-white p-4">
            <div className="flex items-baseline justify-between text-[14px]">
              <span className="text-slate-600">
                Difference for {Math.max(0, topupTo - (quota ?? 0))} more scene
                {Math.max(0, topupTo - (quota ?? 0)) === 1 ? "" : "s"}
              </span>
              <span className="text-[20px] font-semibold tabular-nums text-vpv-ink">
                {inr(Math.max(0, priceForScenes(topupTo) - priceForScenes(quota ?? 0)))}
              </span>
            </div>
            <TopupButton token={token} scenes={topupTo} disabled={topupTo <= (quota ?? 0)} />
          </div>
        </Pane>
      )}

      {/* ── Invoices ────────────────────────────────────────────────── */}
      <div className="mt-10">
        <h2 className="mb-4 flex items-center gap-2 text-[17px] font-semibold text-vpv-ink">
          <FileText size={17} className="text-vpv-blue" /> Invoices
        </h2>
        {invoices.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-vpv-line bg-white px-5 py-7 text-center text-[13.5px] text-slate-500">
            No invoices yet. Every payment produces a GST invoice, e-mailed to
            you and listed here.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-vpv-line bg-white">
            <table className="w-full min-w-[560px] text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-vpv-line text-[11.5px] uppercase tracking-[0.08em] text-vpv-muted">
                  <th className="px-4 py-3 font-semibold">Invoice</th>
                  <th className="px-4 py-3 font-semibold">For</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.invoice_no} className="border-b border-vpv-line last:border-0">
                    <td className="px-4 py-3 font-medium text-vpv-ink">{inv.invoice_no}</td>
                    <td className="px-4 py-3 text-slate-600">{inv.description}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(inv.issued_at).toDateString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-vpv-ink">
                      {inr(fromPaise(inv.total_paise))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[12.5px] text-slate-500">
          Need a copy re-sent, or a detail corrected? Write to billing@myvpv.com
          with the invoice number.
        </p>
      </div>
    </Shell>
  );
}

/* ───────────────────────────── pieces ────────────────────────────── */

function TopupButton({
  token,
  scenes,
  disabled,
}: {
  token: string | null;
  scenes: number;
  disabled: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          purpose: "scene_topup",
          scenes,
          buyer: { name: "—", email: "topup@myvpv.com", company: "—" },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message || "Could not start that payment.");
        setBusy(false);
        return;
      }
      const w = window as unknown as { Razorpay?: new (o: Record<string, unknown>) => { open: () => void } };
      if (!w.Razorpay) {
        const s = document.createElement("script");
        s.src = "https://checkout.razorpay.com/v1/checkout.js";
        document.body.appendChild(s);
        await new Promise((r) => {
          s.onload = r;
          s.onerror = r;
        });
      }
      if (!w.Razorpay) {
        setError("The payment window could not load.");
        setBusy(false);
        return;
      }
      new w.Razorpay({
        key: data.keyId,
        order_id: data.razorpayOrderId,
        amount: data.amountPaise,
        currency: "INR",
        name: "VPV — Virtual Plant Visit",
        description: data.description,
        theme: { color: "#1468D8" },
        handler: async (response: Record<string, string>) => {
          await fetch("/api/billing/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: data.orderId, ...response }),
          });
          window.location.reload();
        },
        modal: { ondismiss: () => setBusy(false) },
      }).open();
    } catch {
      setError("Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={go}
        disabled={disabled || busy}
        className="mt-4 w-full rounded-full bg-vpv-grad py-3 text-[14px] font-semibold text-white hover:opacity-95 disabled:opacity-40"
      >
        {busy ? "Opening secure payment…" : "Pay and add these scenes"}
      </button>
      {error && <p className="mt-2 text-[12.5px] text-red-600">{error}</p>}
    </>
  );
}

function SupportBadge({ state }: { state: SupportState }) {
  const map = {
    active: { text: "Active", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
    grace: { text: "In grace period", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
    lapsed: { text: "Paused", cls: "bg-red-50 text-red-700 ring-red-200" },
    none: { text: "Not set", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
  }[state];
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-[12.5px] font-semibold ring-1 ${map.cls}`}>
      {map.text}
    </span>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-vpv-line bg-white p-6">{children}</div>;
}

function CardHead({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-vpv-tint text-vpv-blue">
        {icon}
      </span>
      <h2 className="text-[15px] font-semibold text-vpv-ink">{title}</h2>
    </div>
  );
}

function Pane({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-8 rounded-3xl border border-vpv-blue/25 bg-vpv-canvas/60 p-6 sm:p-8">
      <h2 className="mb-5 flex items-center gap-2 text-[18px] font-semibold text-vpv-ink">
        <CreditCard size={18} className="text-vpv-blue" /> {title}
      </h2>
      {children}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-vpv-canvas text-vpv-ink">
      <div className="flex items-center gap-4 border-b border-vpv-line bg-white/70 px-6 py-2.5 backdrop-blur">
        <Link href="/client" className="flex items-center gap-1.5 text-xs text-vpv-muted hover:text-vpv-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
        </Link>
        <div className="mx-auto">
          <VpvLogo />
        </div>
        <div className="w-24" />
      </div>
      <div className="mx-auto max-w-6xl px-6 py-9">{children}</div>
      <LegalLinks compact className="pb-8" />
    </div>
  );
}
