"use client";

/**
 * EnquiryForm — the "let's talk" path for Pro and Ultra.
 *
 * Those are recurring commitments that nobody signs up for from a web
 * page, so instead of a checkout we take the details, e-mail the team
 * and reply with a written proposal.
 */

import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Send } from "lucide-react";
import { PRO_MONTHLY_INR, ULTRA_MONTHLY_INR, inr, type PlanId } from "@/lib/pricing";

export default function EnquiryForm({
  defaultPlan = "pro",
  compact = false,
}: {
  defaultPlan?: PlanId;
  compact?: boolean;
}) {
  const [plan, setPlan] = useState<PlanId>(defaultPlan);
  const [form, setForm] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    message: "",
  });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/billing/enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, ...form }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message || "We could not send that. Please e-mail us instead.");
        setBusy(false);
        return;
      }
      setSent(true);
    } catch {
      setError("We could not send that. Please e-mail us instead.");
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 text-center">
        <CheckCircle2 size={26} className="mx-auto text-emerald-600" />
        <h3 className="mt-3 text-[18px] font-semibold text-vpv-ink">Thank you — it has reached us</h3>
        <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-slate-600">
          A person from our team will reply within two business days with a
          written proposal. We have also e-mailed you a confirmation.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className={`rounded-2xl border border-vpv-line bg-white ${compact ? "p-6" : "p-7"}`}
    >
      <h3 className="text-[19px] font-semibold tracking-tight text-vpv-ink">
        Talk to us about Pro or Ultra
      </h3>
      <p className="mt-1.5 text-[13.5px] text-slate-600">
        Tell us about your plants. We reply with a written proposal, and set the
        workspace up for you.
      </p>

      <div className="mt-5 flex gap-2">
        {(["pro", "ultra"] as PlanId[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPlan(p)}
            className={`flex-1 rounded-xl border px-4 py-3 text-left transition-colors ${
              plan === p
                ? "border-vpv-blue bg-vpv-tint/70 shadow-[inset_0_0_0_1px_rgba(20,104,216,0.3)]"
                : "border-vpv-line hover:border-vpv-blue/40"
            }`}
          >
            <span className="block text-[14px] font-semibold capitalize text-vpv-ink">{p}</span>
            <span className="block text-[12.5px] text-slate-500">
              {inr(p === "pro" ? PRO_MONTHLY_INR : ULTRA_MONTHLY_INR)} / month
            </span>
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-3.5 sm:grid-cols-2">
        <Input label="Your name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required autoComplete="name" />
        <Input label="Company" value={form.company} onChange={(v) => setForm({ ...form, company: v })} required autoComplete="organization" />
        <Input label="Work e-mail" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required autoComplete="email" />
        <Input label="Mobile" type="tel" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} autoComplete="tel" />
        <div className="sm:col-span-2">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-vpv-ink">
              What would you like to show your customers?
            </span>
            <textarea
              className="vpv-enq min-h-[88px] resize-y"
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="How many plants, roughly how many rooms, and who you sell to."
            />
          </label>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-vpv-grad px-6 py-3 text-[14px] font-semibold text-white shadow-[0_14px_32px_-14px_rgba(20,104,216,0.7)] transition-opacity hover:opacity-95 disabled:opacity-50"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        {busy ? "Sending…" : "Send enquiry"}
      </button>

      <style jsx global>{`
        .vpv-enq {
          width: 100%;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 10px 13px;
          font-size: 14px;
          color: #0c1017;
          outline: none;
          transition: border-color 140ms ease, box-shadow 140ms ease;
        }
        .vpv-enq:focus {
          border-color: #1468d8;
          box-shadow: 0 0 0 4px rgba(20, 104, 216, 0.12);
        }
      `}</style>
    </form>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  required,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-vpv-ink">
        {label}
        {required && <span className="ml-1 text-vpv-blue">*</span>}
      </span>
      <input
        className="vpv-enq"
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
