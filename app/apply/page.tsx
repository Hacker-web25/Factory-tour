"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  AlertTriangle,
} from "lucide-react";

/**
 * apply.myvpv.com — export qualification intake form.
 *
 * Multi-step wizard. State is persisted to localStorage so a partial
 * submission survives an accidental reload. On submit, the row lands
 * in `qualification_leads` (see supabase/migrations/apply_form.sql)
 * via the anon key; RLS allows insert-only from public.
 */

type Field = {
  id: string;
  label: string;
  help?: string;
  type: "text" | "email" | "tel" | "textarea" | "radio" | "select";
  options?: string[];
  placeholder?: string;
  required?: boolean;
  /** For type: "select" — when the chosen option equals this string, an
   *  extra "Please specify" text input appears; its value is combined
   *  into the field as "<option>: <specified>". Typical value: "Other". */
  otherOption?: string;
};

type Step = {
  title: string;
  subtitle: string;
  fields: Field[];
};

const STEPS: Step[] = [
  {
    title: "Contact",
    subtitle: "Who are you and where do we reach you?",
    fields: [
      { id: "first_name", label: "First name", type: "text", required: true },
      { id: "last_name", label: "Last name", type: "text", required: true },
      { id: "company_name", label: "Company name", type: "text", required: true },
      { id: "mobile", label: "Mobile number", type: "tel", required: true, placeholder: "+91 …" },
      { id: "email", label: "Email address", type: "email", required: true },
    ],
  },
  {
    title: "Company scale",
    subtitle: "A quick picture of your manufacturing footprint.",
    fields: [
      {
        id: "industry",
        label: "Primary industry / sector",
        type: "select",
        required: true,
        options: [
          "Textiles & Apparel",
          "Automotive & Components",
          "Pharmaceuticals & Chemicals",
          "Engineering & Machinery",
          "Food & Beverages",
          "Electronics & IT Hardware",
          "Handicrafts & Furniture",
          "Dairy",
          "Machine Manufacturing",
          "Paper",
          "Rubber",
          "Other",
        ],
        otherOption: "Other",
      },
      {
        id: "factory_count",
        label: "Number of manufacturing / processing factories",
        type: "radio",
        options: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10 or more"],
        required: true,
      },
      {
        id: "current_export_turnover",
        label: "Current export turnover (₹ Crores)",
        type: "radio",
        options: [
          "Less than 10",
          "10 – 25",
          "26 – 50",
          "51 – 100",
          "101 – 250",
          "251 – 500",
          "Greater than 500",
        ],
        required: true,
      },
    ],
  },
  {
    title: "Ambition",
    subtitle: "Where you want to be in five years.",
    fields: [
      {
        id: "export_goal_5yr",
        label: "Your export revenue goal for the next 5 years (₹ Crores)",
        type: "radio",
        options: ["10", "50", "100", "250", "500", "1000", "5000"],
        required: true,
      },
      {
        id: "client_ltv_cr",
        label: "Lifetime value of ONE good international client over 5 years (₹ Crores)",
        help: "Your best estimate of what a top-tier buyer is worth to you across a full cycle.",
        type: "text",
        placeholder: "e.g. 5",
        required: true,
      },
      {
        id: "export_countries",
        label: "Which countries or regions are you currently exporting to?",
        type: "textarea",
        placeholder: "e.g. USA, EU, Middle East, Southeast Asia",
        required: true,
      },
    ],
  },
  {
    title: "Marketing & sales",
    subtitle: "How you go to market today.",
    fields: [
      {
        id: "intl_marketing_spend",
        label: "Approximate annual spend on international marketing & exhibitions (INR)",
        type: "radio",
        options: [
          "10 – 25 lakhs",
          "25 – 50 lakhs",
          "50 lakhs – 1 crore",
          "2 – 3 crores",
          "3 – 5 crores",
          "5 – 10 crores",
        ],
      },
      {
        id: "exhibitions_5yr",
        label: "Number of international trade exhibitions participated in over the last 5 years",
        type: "text",
        placeholder: "e.g. 8",
      },
      {
        id: "sales_cycle_length",
        label: "Typical length of your export sales cycle (inquiry → first order)",
        type: "radio",
        options: [
          "Less than 1 month",
          "1 – 3 months",
          "3 – 6 months",
          "6 – 12 months",
          "More than 12 months",
        ],
      },
      {
        id: "lead_conversion_rate",
        label: "Current average lead conversion rate (total leads → closed orders)",
        type: "radio",
        options: [
          "Less than 1%",
          "1% – 3%",
          "3% – 5%",
          "More than 5%",
          "We do not track this accurately",
        ],
      },
    ],
  },
  {
    title: "Trust & positioning",
    subtitle: "Be honest — the answers here shape everything.",
    fields: [
      {
        id: "buyers_negotiate_price",
        label: "Do buyers primarily negotiate on price, treating your product like a commodity?",
        type: "radio",
        options: [
          "Yes, almost always",
          "Sometimes",
          "No, they understand our premium value",
        ],
      },
      {
        id: "buyers_understand_scale",
        label: "Have you felt frustrated that buyers do not fully understand your true scale or hygiene standards initially?",
        type: "radio",
        options: [
          "Yes, frequently",
          "Sometimes",
          "No, our presentation perfectly communicates this",
        ],
      },
      {
        id: "competitive_positioning",
        label:
          "Next to a top Chinese / Turkish competitor, does your PDF / website undeniably prove you are a superior, lower-risk manufacturer?",
        type: "radio",
        options: [
          "Yes, our materials are world-class",
          "No, we look pretty much the same",
          "No, our presentation is quite outdated",
        ],
      },
      {
        id: "trust_delays_deals",
        label: "Do you believe a perceived lack of trust, distance or transparency significantly delays your deals?",
        type: "radio",
        options: ["Yes, absolutely", "Somewhat", "No"],
      },
    ],
  },
  {
    title: "Capabilities today",
    subtitle: "What actually happens when a buyer wants to see you.",
    fields: [
      {
        id: "factory_showcase_method",
        label:
          "How do you currently showcase your factory capabilities remotely to international buyers?",
        help: "Videos, 360 virtual tours, live streams, detailed documentation, PDFs…",
        type: "textarea",
      },
      {
        id: "followup_system",
        label: "Do you have a documented, highly structured export follow-up system for new leads?",
        type: "radio",
        options: [
          "Yes, fully structured and automated (CRM in place)",
          "Mostly manual, but we follow up diligently",
          "No, it is quite random and informal",
        ],
      },
      {
        id: "export_team",
        label: "Do you have a dedicated Export Manager and / or Export Team?",
        type: "radio",
        options: [
          "Yes, a dedicated team / manager",
          "No, this is handled by domestic sales or senior management",
        ],
      },
      {
        id: "virtual_audit_readiness",
        label:
          "If an overseas buyer wants to conduct a full remote / virtual audit for shortlisting vendors tomorrow, are you prepared?",
        type: "radio",
        options: [
          "Yes, 100% prepared and materials are ready for virtual presentation",
          "Partially prepared, but would require some scrambling / cleanup",
          "No, we would struggle to present it well remotely",
        ],
      },
    ],
  },
  {
    title: "Track record",
    subtitle: "What you have already put on the board.",
    fields: [
      {
        id: "yoy_growth",
        label: "Year-on-year growth in exports over the last 5 years",
        help: "e.g. FY20–21 = 15%, FY21–22 = 50%, FY22–23 = 63%",
        type: "textarea",
      },
      {
        id: "total_exhibition_investment",
        label: "Total investment in exhibitions over the last 5 years (approx.)",
        type: "radio",
        options: [
          "25 lakhs",
          "50 lakhs",
          "1 crore",
          "2 crores",
          "3 crores",
          "4 crores",
          "5 crores or more",
        ],
      },
      {
        id: "growth_initiatives",
        label:
          "What specific initiatives have you taken in the last 5 years to grow exports leaps and bounds?",
        help: "Focus on digital strategy, certifications, major investments, etc.",
        type: "textarea",
      },
      {
        id: "top_challenges",
        label: "What are your top two biggest export challenges right now?",
        help:
          "e.g. finding good buyers, price competition, logistics, financing, trust-building, team, lead conversion, market slowdown, geography, lack of clarity…",
        type: "textarea",
      },
      { id: "has_usp", label: "Does your business have a USP?", type: "radio", options: ["Yes", "No"] },
      {
        id: "last_innovation",
        label:
          "What is the last innovation you did in your business and when? What was its impact?",
        type: "textarea",
      },
    ],
  },
  {
    title: "Strategic honesty",
    subtitle: "The three questions that really decide the next five years.",
    fields: [
      {
        id: "marketing_execution_pct",
        label:
          "What % of the required high-level strategic marketing work (branding, digital presence, high-trust content) are you actually executing right now to meet your 5-year goal?",
        type: "radio",
        options: ["0 – 10%", "20 – 30%", "50 – 75%", "100%"],
      },
      {
        id: "lost_revenue",
        label:
          "Trust Deficit — [Total high-quality leads in 5 yrs] × [Lifetime value of 1 client] = [Total Potential]. Subtract the business you ACTUALLY captured. What is your Lost Revenue?",
        type: "radio",
        options: [
          "🚨 Lost more than ₹50 Crores ($6M+)",
          "🚨 Lost between ₹10 Crores and ₹50 Crores",
          "🚨 Lost between ₹1 Crore and ₹10 Crores",
          "Captured almost all potential (Zero Loss)",
        ],
      },
      {
        id: "brutal_honesty",
        label:
          "Be brutally honest: if you change absolutely nothing about your current presentation, follow-up and trust-building strategy, will you hit your massive 5-year export goal?",
        type: "radio",
        options: [
          "Yes, we will easily hit it",
          "No, we will likely remain stagnant or grow very slowly",
          "I need a completely new system / strategy",
        ],
      },
    ],
  },
];

const STORAGE_KEY = "vpv-apply-draft-v1";

type Draft = {
  step: number;
  values: Record<string, string>;
};

function loadDraft(): Draft {
  if (typeof window === "undefined") return { step: 0, values: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { step: 0, values: {} };
    const parsed = JSON.parse(raw);
    return {
      step: Number.isFinite(parsed?.step) ? parsed.step : 0,
      values: parsed?.values && typeof parsed.values === "object" ? parsed.values : {},
    };
  } catch {
    return { step: 0, values: {} };
  }
}

export default function ApplyPage() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = loadDraft();
    setStep(d.step);
    setValues(d.values);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ step, values }));
    } catch {}
  }, [step, values, hydrated]);

  const total = STEPS.length;
  const current = STEPS[step];
  const progress = useMemo(
    () => Math.round(((step + 1) / total) * 100),
    [step, total],
  );

  function setField(id: string, value: string) {
    setValues((v) => ({ ...v, [id]: value }));
    setError(null);
  }

  function validateStep(): string | null {
    for (const f of current.fields) {
      if (!f.required) continue;
      const v = (values[f.id] ?? "").trim();
      if (!v) return `Please answer: ${f.label}`;
      if (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
        return "That email doesn't look right.";
    }
    return null;
  }

  function goNext() {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setStep((s) => Math.min(s + 1, total - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const row: Record<string, string | null> = {};
      for (const s of STEPS) {
        for (const f of s.fields) {
          row[f.id] = (values[f.id] ?? "").trim() || null;
        }
      }
      row.referrer = typeof document !== "undefined" ? document.referrer || null : null;
      row.user_agent = typeof navigator !== "undefined" ? navigator.userAgent : null;

      const { error: insertError } = await supabase
        .from("qualification_leads")
        .insert(row);

      if (insertError) throw insertError;

      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      router.push("/apply/thanks");
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-white grid place-items-center">
        <Loader2 size={20} className="animate-spin text-slate-400" />
      </div>
    );
  }

  const isLast = step === total - 1;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      {/* Top bar */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-5 md:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1468d8] to-[#0b3d91] grid place-items-center text-white text-[13px] font-bold tracking-tighter">
              VPV
            </div>
            <div className="text-[13px] font-semibold text-slate-800">
              Qualification Form
            </div>
          </div>
          <div className="text-[12px] text-slate-500 tabular-nums">
            Step {step + 1} of {total}
          </div>
        </div>
        <div className="h-1 bg-slate-100">
          <div
            className="h-full bg-gradient-to-r from-[#1468d8] to-[#0b3d91] transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 md:px-8 py-10 md:py-16">
        {/* Step header */}
        <div className="mb-8">
          <div className="text-[11px] font-semibold tracking-widest uppercase text-[#1468d8] mb-2">
            {String(step + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
            &nbsp;·&nbsp;{current.title}
          </div>
          <h1 className="text-[28px] md:text-[34px] font-semibold tracking-tight text-slate-900 leading-tight mb-2">
            {current.subtitle}
          </h1>
        </div>

        {/* Fields */}
        <div className="space-y-6">
          {current.fields.map((f) => (
            <FieldRow
              key={f.id}
              field={f}
              value={values[f.id] ?? ""}
              onChange={(v) => setField(f.id, v)}
            />
          ))}
        </div>

        {error && (
          <div className="mt-6 flex items-start gap-2 text-[13px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Nav */}
        <div className="mt-10 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={goBack}
            disabled={step === 0}
            className="inline-flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ArrowLeft size={14} /> Back
          </button>
          {!isLast ? (
            <button
              type="button"
              onClick={goNext}
              className="inline-flex items-center gap-2 bg-[#1468d8] hover:bg-[#0b3d91] text-white font-semibold text-[14px] px-6 py-3 rounded-full shadow-[0_10px_30px_-8px_rgba(20,104,216,0.5)] transition-colors"
            >
              Continue
              <ArrowRight size={15} />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={submit}
              className="inline-flex items-center gap-2 bg-[#0b3d91] hover:bg-black text-white font-semibold text-[14px] px-6 py-3 rounded-full shadow-[0_10px_30px_-8px_rgba(11,61,145,0.6)] disabled:opacity-60 transition-colors"
            >
              {submitting ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Sending…
                </>
              ) : (
                <>
                  Submit application
                  <CheckCircle2 size={16} />
                </>
              )}
            </button>
          )}
        </div>

        <p className="mt-10 text-[11px] text-slate-400 text-center">
          Your answers are private and go directly to the VPV team. We reply
          within 24 business hours.
        </p>
      </main>
    </div>
  );
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: string;
  onChange: (v: string) => void;
}) {
  const commonLabel = (
    <div className="mb-2">
      <label
        htmlFor={field.id}
        className="block text-[13px] font-medium text-slate-800"
      >
        {field.label}
        {field.required ? (
          <span className="text-[#1468d8] ml-0.5">*</span>
        ) : null}
      </label>
      {field.help ? (
        <p className="text-[12px] text-slate-500 mt-1 leading-relaxed">
          {field.help}
        </p>
      ) : null}
    </div>
  );

  if (field.type === "textarea") {
    return (
      <div>
        {commonLabel}
        <textarea
          id={field.id}
          value={value}
          rows={4}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-white border border-slate-200 hover:border-slate-300 focus:border-[#1468d8] focus:ring-4 focus:ring-[#1468d8]/10 rounded-xl px-4 py-3 text-[14px] outline-none transition-all resize-y"
        />
      </div>
    );
  }

  if (field.type === "radio" && field.options) {
    return (
      <div>
        {commonLabel}
        <div className="grid gap-2 md:grid-cols-2">
          {field.options.map((opt) => {
            const active = value === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onChange(opt)}
                className={
                  "text-left rounded-xl border px-4 py-3 text-[13.5px] transition-all " +
                  (active
                    ? "border-[#1468d8] bg-[#1468d8]/[0.06] text-[#0b3d91] font-semibold shadow-[0_6px_20px_-8px_rgba(20,104,216,0.35)]"
                    : "border-slate-200 hover:border-slate-300 bg-white text-slate-700")
                }
              >
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden
                    className={
                      "w-3.5 h-3.5 rounded-full border transition-all " +
                      (active
                        ? "border-[#1468d8] bg-[#1468d8]"
                        : "border-slate-300 bg-white")
                    }
                  />
                  {opt}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (field.type === "select" && field.options) {
    // Value shape when "Other" chosen: "Other: <specified text>" (or just
    // "Other" when nothing was specified). This keeps a single DB column.
    const rawIsOther =
      field.otherOption != null &&
      (value === field.otherOption ||
        value.startsWith(field.otherOption + ": "));
    const selected = rawIsOther
      ? field.otherOption!
      : field.options.includes(value)
      ? value
      : "";
    const specified = rawIsOther
      ? value === field.otherOption
        ? ""
        : value.slice(field.otherOption!.length + 2)
      : "";

    return (
      <div>
        {commonLabel}
        <select
          id={field.id}
          value={selected}
          onChange={(e) => {
            const v = e.target.value;
            if (v === field.otherOption) onChange(field.otherOption!);
            else onChange(v);
          }}
          className="w-full bg-white border border-slate-200 hover:border-slate-300 focus:border-[#1468d8] focus:ring-4 focus:ring-[#1468d8]/10 rounded-xl px-4 py-3 text-[14px] outline-none transition-all appearance-none bg-[url('data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%2364748b%22%3E%3Cpath%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.06l3.71-3.83a.75.75%200%20111.08%201.04l-4.25%204.4a.75.75%200%2001-1.08%200l-4.25-4.4a.75.75%200%2001.02-1.06z%22/%3E%3C/svg%3E')] bg-no-repeat bg-[position:right_1rem_center] pr-10"
        >
          <option value="" disabled>
            Select an option
          </option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        {selected === field.otherOption && (
          <input
            type="text"
            value={specified}
            placeholder="Please specify (optional)"
            onChange={(e) => {
              const t = e.target.value;
              onChange(t.trim() ? `${field.otherOption}: ${t}` : field.otherOption!);
            }}
            className="mt-2 w-full bg-white border border-slate-200 hover:border-slate-300 focus:border-[#1468d8] focus:ring-4 focus:ring-[#1468d8]/10 rounded-xl px-4 py-3 text-[14px] outline-none transition-all"
          />
        )}
      </div>
    );
  }

  return (
    <div>
      {commonLabel}
      <input
        id={field.id}
        type={field.type}
        value={value}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white border border-slate-200 hover:border-slate-300 focus:border-[#1468d8] focus:ring-4 focus:ring-[#1468d8]/10 rounded-xl px-4 py-3 text-[14px] outline-none transition-all"
      />
    </div>
  );
}
