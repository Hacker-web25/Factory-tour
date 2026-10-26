"use client";

/**
 * /admin/customers — the platform owner's control room.
 *
 * Replaces the SQL you type by hand. In one screen:
 *
 *   • every customer, with their plan, scene quota, support state and
 *     what they have paid — the "do they have support?" answer in a
 *     colour, not a query;
 *   • change a plan (this is how Pro and Ultra get switched on after
 *     someone pays you by bank transfer);
 *   • create a customer from scratch, login and subdomain included.
 *
 * Owner only, enforced twice: this page checks the role, and the
 * database functions behind it refuse anyone who is not the owner.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Check,
  Copy,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { INDIAN_STATES } from "@/lib/indianStates";
import { getMyProfile, type Profile } from "@/lib/auth";
import VpvLogo from "@/components/dashboard/VpvLogo";
import { SCENE_MAX, SCENE_MIN, fromPaise, inr, type PlanId } from "@/lib/pricing";

type Customer = {
  org_id: string;
  name: string;
  slug: string;
  plan: PlanId;
  plan_status: string;
  scene_quota: number | null;
  support_until: string | null;
  support_state: "active" | "grace" | "lapsed" | "none";
  days_left: number | null;
  admin_email: string | null;
  billing_email: string | null;
  tours: number;
  members: number;
  paid_total_paise: number;
  activated_at: string | null;
  created_at: string;
};

export default function AdminCustomersPage() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [rows, setRows] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const p = await getMyProfile();
    if (!p) {
      router.push("/login?next=/admin/customers");
      return;
    }
    setMe(p);
    if (p.role !== "owner") {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.rpc("admin_customer_overview");
    if (!error && data) setRows(data as Customer[]);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name?.toLowerCase().includes(q) ||
        r.slug?.toLowerCase().includes(q) ||
        r.admin_email?.toLowerCase().includes(q)
    );
  }, [rows, query]);

  const totals = useMemo(() => {
    return {
      customers: rows.length,
      revenue: rows.reduce((s, r) => s + Number(r.paid_total_paise || 0), 0),
      lapsing: rows.filter((r) => r.support_state === "grace" || r.support_state === "lapsed").length,
      dueSoon: rows.filter(
        (r) => r.support_state === "active" && r.days_left !== null && r.days_left <= 30
      ).length,
    };
  }, [rows]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-vpv-canvas text-vpv-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (me?.role !== "owner") {
    return (
      <div className="min-h-screen grid place-items-center bg-vpv-canvas px-6 text-center">
        <div>
          <h1 className="text-[20px] font-semibold text-vpv-ink">Not available</h1>
          <p className="mt-2 text-[14px] text-slate-600">
            This page is for the platform owner.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-vpv-canvas text-vpv-ink">
      <div className="flex items-center gap-4 border-b border-vpv-line bg-white/70 px-6 py-2.5 backdrop-blur">
        <Link href="/admin" className="flex items-center gap-1.5 text-xs text-vpv-muted hover:text-vpv-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> Admin
        </Link>
        <div className="mx-auto">
          <VpvLogo />
        </div>
        <div className="w-16" />
      </div>

      <div className="mx-auto max-w-7xl px-6 py-9">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold tracking-tight">Customers</h1>
            <p className="mt-1 text-[13.5px] text-vpv-muted">
              Every organisation, what they are on, and whether their support is live.
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-full bg-vpv-grad px-5 py-2.5 text-[13.5px] font-semibold text-white hover:opacity-95"
          >
            <Plus size={15} /> New customer
          </button>
        </div>

        {notice && (
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13.5px] text-emerald-800">
            <Check size={16} className="mt-0.5 shrink-0" />
            <span className="flex-1">{notice}</span>
            <button onClick={() => setNotice(null)} className="text-emerald-700 hover:text-emerald-900">
              <X size={15} />
            </button>
          </div>
        )}

        {/* Headline numbers */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Customers" value={String(totals.customers)} />
          <Stat label="Collected" value={inr(fromPaise(totals.revenue))} />
          <Stat label="Support due in 30 days" value={String(totals.dueSoon)} tone={totals.dueSoon ? "amber" : "plain"} />
          <Stat label="Support overdue" value={String(totals.lapsing)} tone={totals.lapsing ? "red" : "plain"} />
        </div>

        {/* Search */}
        <div className="relative mt-7 max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-vpv-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by company, subdomain or e-mail"
            className="w-full rounded-full border border-vpv-line bg-white py-2.5 pl-10 pr-4 text-[13.5px] outline-none focus:border-vpv-blue"
          />
        </div>

        {/* Table */}
        <div className="mt-5 overflow-x-auto rounded-2xl border border-vpv-line bg-white">
          <table className="w-full min-w-[920px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-vpv-line text-[11.5px] uppercase tracking-[0.08em] text-vpv-muted">
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Plan</th>
                <th className="px-4 py-3 font-semibold">Scenes</th>
                <th className="px-4 py-3 font-semibold">Support</th>
                <th className="px-4 py-3 font-semibold">Tours</th>
                <th className="px-4 py-3 text-right font-semibold">Paid</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    No customers match that.
                  </td>
                </tr>
              )}
              {filtered.map((c) => (
                <tr key={c.org_id} className="border-b border-vpv-line last:border-0 hover:bg-vpv-canvas/60">
                  <td className="px-4 py-3">
                    <div className="font-medium text-vpv-ink">{c.name}</div>
                    <div className="text-[12px] text-vpv-muted">
                      {c.slug}.myvpv.com{c.admin_email ? ` · ${c.admin_email}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <PlanChip plan={c.plan} />
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-600">
                    {c.scene_quota ?? "Unlimited"}
                  </td>
                  <td className="px-4 py-3">
                    <SupportChip state={c.support_state} daysLeft={c.days_left} until={c.support_until} />
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-600">{c.tours}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {inr(fromPaise(Number(c.paid_total_paise || 0)))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setEditing(c)}
                      className="rounded-full border border-vpv-line px-3 py-1.5 text-[12.5px] font-medium text-vpv-blue hover:bg-vpv-tint"
                    >
                      Change plan
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-[12.5px] text-slate-500">
          Basic customers who buy online appear here by themselves. Use “New
          customer” for Pro and Ultra, who pay you outside the website.
        </p>
      </div>

      {editing && (
        <PlanModal
          customer={editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            setNotice(msg);
            load();
          }}
        />
      )}
      {creating && (
        <CreateModal
          onClose={() => setCreating(false)}
          onCreated={(msg) => {
            setCreating(false);
            setNotice(msg);
            load();
          }}
        />
      )}
    </div>
  );
}

/* ───────────────────────────── bits ──────────────────────────────── */

function Stat({ label, value, tone = "plain" }: { label: string; value: string; tone?: "plain" | "amber" | "red" }) {
  const ring =
    tone === "amber" ? "ring-amber-200 bg-amber-50" : tone === "red" ? "ring-red-200 bg-red-50" : "ring-vpv-line bg-white";
  return (
    <div className={`rounded-2xl p-5 ring-1 ${ring}`}>
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-vpv-muted">{label}</div>
      <div className="mt-1.5 text-[24px] font-semibold tabular-nums tracking-tight text-vpv-ink">{value}</div>
    </div>
  );
}

function PlanChip({ plan }: { plan: PlanId }) {
  const map: Record<PlanId, string> = {
    basic: "bg-slate-100 text-slate-700 ring-slate-200",
    pro: "bg-vpv-tint text-vpv-navy ring-vpv-blue/30",
    ultra: "bg-vpv-navy text-white ring-vpv-navy",
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11.5px] font-semibold uppercase tracking-wide ring-1 ${map[plan]}`}>
      {plan}
    </span>
  );
}

function SupportChip({
  state,
  daysLeft,
  until,
}: {
  state: Customer["support_state"];
  daysLeft: number | null;
  until: string | null;
}) {
  const map = {
    active: { label: daysLeft !== null && daysLeft <= 30 ? `${daysLeft}d left` : "Active", cls: daysLeft !== null && daysLeft <= 30 ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200" },
    grace: { label: "Reminding", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
    lapsed: { label: "Locked", cls: "bg-red-50 text-red-700 ring-red-200" },
    none: { label: "Not set", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
  }[state];
  return (
    <span
      title={until ? new Date(until).toDateString() : undefined}
      className={`inline-flex rounded-full px-2.5 py-1 text-[11.5px] font-semibold ring-1 ${map.cls}`}
    >
      {map.label}
    </span>
  );
}

/* ─────────────────────── change-plan modal ───────────────────────── */

function PlanModal({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [plan, setPlan] = useState<PlanId>(customer.plan);
  const [scenes, setScenes] = useState<number>(customer.scene_quota ?? SCENE_MIN);
  const [months, setMonths] = useState<number>(12);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const supportUntil =
      months > 0
        ? new Date(new Date().setMonth(new Date().getMonth() + months)).toISOString()
        : null;
    const { error: rpcError } = await supabase.rpc("admin_set_org_plan", {
      p_org: customer.org_id,
      p_plan: plan,
      p_scene_quota: plan === "basic" ? scenes : null,
      p_support_until: supportUntil,
      p_note: note || null,
    });
    if (rpcError) {
      setError(rpcError.message);
      setBusy(false);
      return;
    }
    onSaved(`${customer.name} is now on ${plan}.`);
  }

  return (
    <Modal title={`Change plan — ${customer.name}`} onClose={onClose}>
      <div className="grid gap-2 sm:grid-cols-3">
        {(["basic", "pro", "ultra"] as PlanId[]).map((p) => (
          <button
            key={p}
            onClick={() => setPlan(p)}
            className={`rounded-xl border px-4 py-3 text-left capitalize transition-colors ${
              plan === p ? "border-vpv-blue bg-vpv-tint/70" : "border-vpv-line hover:border-vpv-blue/40"
            }`}
          >
            <span className="block text-[14px] font-semibold text-vpv-ink">{p}</span>
            <span className="block text-[12px] text-slate-500">
              {p === "basic" ? "Scene limit applies" : "Unlimited scenes"}
            </span>
          </button>
        ))}
      </div>

      {plan === "basic" && (
        <label className="mt-5 block">
          <span className="mb-1.5 block text-[13px] font-medium text-vpv-ink">
            Scenes their customers can see
          </span>
          <input
            type="number"
            min={SCENE_MIN}
            max={SCENE_MAX}
            value={scenes}
            onChange={(e) => setScenes(Number(e.target.value))}
            className="w-full rounded-xl border border-vpv-line px-3.5 py-2.5 text-[14px] outline-none focus:border-vpv-blue"
          />
        </label>
      )}

      <label className="mt-4 block">
        <span className="mb-1.5 block text-[13px] font-medium text-vpv-ink">
          Extend support by (months)
        </span>
        <input
          type="number"
          min={0}
          max={60}
          value={months}
          onChange={(e) => setMonths(Number(e.target.value))}
          className="w-full rounded-xl border border-vpv-line px-3.5 py-2.5 text-[14px] outline-none focus:border-vpv-blue"
        />
        <span className="mt-1 block text-[11.5px] text-slate-500">
          0 leaves the current date untouched. Counted from today.
        </span>
      </label>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-[13px] font-medium text-vpv-ink">
          Note for the record
        </span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Paid by bank transfer, invoice VPV/2026-27/0012"
          className="w-full rounded-xl border border-vpv-line px-3.5 py-2.5 text-[14px] outline-none focus:border-vpv-blue"
        />
      </label>

      {error && (
        <p className="mt-4 flex gap-2 text-[13px] text-red-600">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="rounded-full px-5 py-2.5 text-[13.5px] text-vpv-muted hover:text-vpv-ink">
          Cancel
        </button>
        <button
          onClick={save}
          disabled={busy}
          className="rounded-full bg-vpv-grad px-6 py-2.5 text-[13.5px] font-semibold text-white hover:opacity-95 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save plan"}
        </button>
      </div>
    </Modal>
  );
}

/* ───────────────────── create-customer modal ─────────────────────── */

function CreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const [form, setForm] = useState({
    company: "",
    adminName: "",
    adminEmail: "",
    plan: "pro" as PlanId,
    scenes: 5,
    supportMonths: 12,
    state: "",
    note: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ slug: string; email: string; tempPassword: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    const { data: sess } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/provision", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sess.session?.access_token ?? ""}`,
      },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.message || "Could not create that customer.");
      setBusy(false);
      return;
    }
    setDone({ slug: data.slug, email: data.email, tempPassword: data.tempPassword });
    setBusy(false);
  }

  if (done) {
    return (
      <Modal title="Customer created" onClose={() => onCreated(`${form.company} is set up at ${done.slug}.myvpv.com.`)}>
        <p className="text-[14px] leading-relaxed text-slate-600">
          Their workspace is live and the welcome e-mail has gone out. If you
          want to read the details out to them now:
        </p>
        <div className="mt-4 space-y-2.5 rounded-xl border border-vpv-line bg-vpv-canvas/60 p-4 text-[13.5px]">
          <Line label="Address" value={`${done.slug}.myvpv.com`} />
          <Line label="E-mail" value={done.email} />
          {done.tempPassword ? (
            <Line label="Password" value={done.tempPassword} mono />
          ) : (
            <p className="text-[12.5px] text-slate-500">
              This person already had a VPV account, so they keep their existing password.
            </p>
          )}
        </div>
        {done.tempPassword && (
          <>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(
                  `Workspace: https://${done.slug}.myvpv.com\nEmail: ${done.email}\nPassword: ${done.tempPassword}`
                );
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-vpv-line px-4 py-2 text-[13px] font-medium text-vpv-blue hover:bg-vpv-tint"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy sign-in details"}
            </button>
            <p className="mt-3 text-[12px] text-amber-700">
              This password is shown once and is not stored. If you lose it, they
              can reset it from the sign-in page.
            </p>
          </>
        )}
        <div className="mt-6 flex justify-end">
          <button
            onClick={() => onCreated(`${form.company} is set up at ${done.slug}.myvpv.com.`)}
            className="rounded-full bg-vpv-grad px-6 py-2.5 text-[13.5px] font-semibold text-white"
          >
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="New customer" onClose={onClose}>
      <p className="text-[13.5px] leading-relaxed text-slate-600">
        Creates the organisation, the subdomain and the admin login, and e-mails
        them the details. Use this for Pro and Ultra, who pay outside the website.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Input label="Company" value={form.company} onChange={(v) => setForm({ ...form, company: v })} />
        <Input label="Admin name" value={form.adminName} onChange={(v) => setForm({ ...form, adminName: v })} />
        <Input label="Admin e-mail" value={form.adminEmail} onChange={(v) => setForm({ ...form, adminEmail: v })} type="email" />
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-vpv-ink">Plan</span>
          <select
            value={form.plan}
            onChange={(e) => setForm({ ...form, plan: e.target.value as PlanId })}
            className="w-full rounded-xl border border-vpv-line px-3.5 py-2.5 text-[14px] outline-none focus:border-vpv-blue"
          >
            <option value="basic">Basic</option>
            <option value="pro">Pro</option>
            <option value="ultra">Ultra</option>
          </select>
        </label>
        {form.plan === "basic" && (
          <Input
            label="Scenes"
            type="number"
            value={String(form.scenes)}
            onChange={(v) => setForm({ ...form, scenes: Number(v) })}
          />
        )}
        <Input
          label="Support months"
          type="number"
          value={String(form.supportMonths)}
          onChange={(v) => setForm({ ...form, supportMonths: Number(v) })}
        />
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-[13px] font-medium text-vpv-ink">
            Customer&apos;s state <span className="font-normal text-slate-500">— decides CGST+SGST vs IGST on their invoices</span>
          </span>
          <select
            value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value })}
            className="w-full rounded-xl border border-vpv-line px-3.5 py-2.5 text-[14px] outline-none focus:border-vpv-blue"
          >
            <option value="">Not known yet (they will be asked at their first top-up)</option>
            {INDIAN_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <div className="sm:col-span-2">
          <Input label="Note" value={form.note} onChange={(v) => setForm({ ...form, note: v })} />
        </div>
      </div>

      {error && (
        <p className="mt-4 flex gap-2 text-[13px] text-red-600">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="rounded-full px-5 py-2.5 text-[13.5px] text-vpv-muted hover:text-vpv-ink">
          Cancel
        </button>
        <button
          onClick={create}
          disabled={busy || !form.company || !form.adminEmail}
          className="inline-flex items-center gap-2 rounded-full bg-vpv-grad px-6 py-2.5 text-[13.5px] font-semibold text-white hover:opacity-95 disabled:opacity-40"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {busy ? "Creating…" : "Create customer"}
        </button>
      </div>
    </Modal>
  );
}

/* ───────────────────────────── shared ────────────────────────────── */

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-5 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-7 shadow-[0_40px_90px_-30px_rgba(11,61,145,0.5)]"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="flex items-center gap-2 text-[19px] font-semibold tracking-tight text-vpv-ink">
            <Building2 size={18} className="text-vpv-blue" /> {title}
          </h2>
          <button onClick={onClose} className="text-vpv-muted hover:text-vpv-ink">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-vpv-ink">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-vpv-line px-3.5 py-2.5 text-[14px] outline-none focus:border-vpv-blue"
      />
    </label>
  );
}

function Line({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className={`font-medium text-vpv-ink ${mono ? "font-mono tracking-wide" : ""}`}>{value}</span>
    </div>
  );
}
