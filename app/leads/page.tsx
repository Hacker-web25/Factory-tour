"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getMyProfile } from "@/lib/auth";
import {
  Search,
  Download,
  X,
  Loader2,
  Building2,
  Mail,
  Phone,
  Calendar,
  Factory,
  TrendingUp,
  Target,
  AlertTriangle,
  ArrowRight,
  Copy as CopyIcon,
  Check,
  Users,
  Sparkles,
} from "lucide-react";

/**
 * /leads — private super-owner-only lead inbox for the /apply form.
 *
 * Design choices:
 *   * Not linked from anywhere; you visit factory-tour-zeta.vercel.app/leads
 *     directly. On any *.myvpv.com host the page hard-redirects away so a
 *     random visitor who guesses the path lands on the marketing site.
 *   * Role gate: only profiles.role === 'owner' passes; everyone else is
 *     bounced to /login. Combined with the RLS SELECT policy (owners only)
 *     the data is inaccessible to anyone else even if they got in via
 *     UI trickery.
 *   * Skimmable list on the left, focused detail on the right, no modals.
 *   * Search + industry + brutal-honesty filters cover the "who's a serious
 *     lead vs. who's just curious" question that comes up first.
 *   * CSV export dumps the full row set so you can share with your team.
 */

type Lead = {
  id: string;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  mobile: string | null;
  email: string | null;

  industry: string | null;
  factory_count: string | null;
  current_export_turnover: string | null;
  export_goal_5yr: string | null;
  client_ltv_cr: string | null;
  export_countries: string | null;

  intl_marketing_spend: string | null;
  exhibitions_5yr: string | null;
  sales_cycle_length: string | null;
  lead_conversion_rate: string | null;

  buyers_negotiate_price: string | null;
  buyers_understand_scale: string | null;
  competitive_positioning: string | null;
  trust_delays_deals: string | null;

  factory_showcase_method: string | null;
  followup_system: string | null;
  export_team: string | null;
  virtual_audit_readiness: string | null;

  yoy_growth: string | null;
  total_exhibition_investment: string | null;
  growth_initiatives: string | null;
  top_challenges: string | null;
  has_usp: string | null;
  last_innovation: string | null;

  marketing_execution_pct: string | null;
  lost_revenue: string | null;
  brutal_honesty: string | null;

  referrer: string | null;
  user_agent: string | null;
};

const HONESTY_TONE: Record<string, string> = {
  "Yes, we will easily hit it": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "No, we will likely remain stagnant or grow very slowly":
    "bg-amber-50 text-amber-700 border-amber-200",
  "I need a completely new system / strategy":
    "bg-rose-50 text-rose-700 border-rose-200",
};

function fullName(l: Lead) {
  return [l.first_name, l.last_name].filter(Boolean).join(" ") || "(no name)";
}

function timeAgo(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function toCsv(rows: Lead[]): string {
  const cols = [
    "created_at",
    "first_name",
    "last_name",
    "company_name",
    "mobile",
    "email",
    "industry",
    "factory_count",
    "current_export_turnover",
    "export_goal_5yr",
    "client_ltv_cr",
    "export_countries",
    "intl_marketing_spend",
    "exhibitions_5yr",
    "sales_cycle_length",
    "lead_conversion_rate",
    "buyers_negotiate_price",
    "buyers_understand_scale",
    "competitive_positioning",
    "trust_delays_deals",
    "factory_showcase_method",
    "followup_system",
    "export_team",
    "virtual_audit_readiness",
    "yoy_growth",
    "total_exhibition_investment",
    "growth_initiatives",
    "top_challenges",
    "has_usp",
    "last_innovation",
    "marketing_execution_pct",
    "lost_revenue",
    "brutal_honesty",
  ] as const;
  const esc = (v: unknown) => {
    if (v == null) return "";
    const s = String(v).replace(/\r?\n/g, " ");
    if (/[",]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = cols.join(",");
  const body = rows.map((r) => cols.map((c) => esc((r as any)[c])).join(",")).join("\n");
  return header + "\n" + body;
}

export default function LeadsPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [rows, setRows] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [industryFilter, setIndustryFilter] = useState<string>("");
  const [honestyFilter, setHonestyFilter] = useState<string>("");
  const [selected, setSelected] = useState<Lead | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // Hard host guard — never expose /leads from a *.myvpv.com host.
      if (typeof window !== "undefined") {
        const h = window.location.hostname.toLowerCase();
        if (h === "myvpv.com" || h.endsWith(".myvpv.com")) {
          window.location.replace("https://myvpv.com");
          return;
        }
      }
      const p = await getMyProfile();
      if (!p) {
        router.replace("/login?next=/leads");
        return;
      }
      if (p.role !== "owner") {
        router.replace("/");
        return;
      }
      setChecking(false);
      const { data, error } = await supabase
        .from("qualification_leads")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) setError(error.message);
      else setRows((data ?? []) as Lead[]);
      setLoading(false);
    })();
  }, [router]);

  const industries = useMemo(
    () => Array.from(new Set(rows.map((r) => r.industry).filter(Boolean))) as string[],
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (industryFilter && (r.industry ?? "") !== industryFilter) return false;
      if (honestyFilter && (r.brutal_honesty ?? "") !== honestyFilter) return false;
      if (!q) return true;
      const hay = [
        r.first_name,
        r.last_name,
        r.company_name,
        r.email,
        r.mobile,
        r.industry,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, industryFilter, honestyFilter]);

  const stats = useMemo(() => {
    const today = new Date();
    const day = 24 * 60 * 60 * 1000;
    const week = 7 * day;
    const month = 30 * day;
    const now = today.getTime();
    let w = 0,
      m = 0;
    for (const r of rows) {
      const t = new Date(r.created_at).getTime();
      if (now - t <= week) w++;
      if (now - t <= month) m++;
    }
    return { total: rows.length, week: w, month: m };
  }, [rows]);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1200);
  }

  function download() {
    const csv = toCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vpv-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-950 grid place-items-center text-white/60">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 size={16} className="animate-spin" />
          Checking access…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top bar */}
      <header className="border-b border-white/10 bg-slate-900/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1468d8] to-[#0b3d91] grid place-items-center text-white text-[12px] font-bold">
              VPV
            </div>
            <div>
              <div className="text-[14px] font-semibold text-white">Lead Inbox</div>
              <div className="text-[11px] text-white/40 tabular-nums">
                Private · super-owner only
              </div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-5 ml-6 text-[12px]">
            <StatChip icon={<Users size={12} />} label="Total" value={stats.total} />
            <StatChip icon={<Sparkles size={12} />} label="This month" value={stats.month} />
            <StatChip icon={<Calendar size={12} />} label="This week" value={stats.week} />
          </div>
          <div className="flex-1" />
          <button
            onClick={download}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-white/70 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-lg px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={13} /> Export CSV
          </button>
        </div>
        {/* Filter row */}
        <div className="max-w-[1400px] mx-auto px-6 pb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[260px] max-w-md">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search company, name, email…"
              className="w-full bg-white/[0.04] border border-white/10 focus:border-[#1468d8] rounded-lg pl-9 pr-3 py-2 text-[13px] outline-none placeholder:text-white/30"
            />
          </div>
          <FilterSelect
            value={industryFilter}
            onChange={setIndustryFilter}
            placeholder="All industries"
            options={industries}
          />
          <FilterSelect
            value={honestyFilter}
            onChange={setHonestyFilter}
            placeholder="All honesty answers"
            options={[
              "Yes, we will easily hit it",
              "No, we will likely remain stagnant or grow very slowly",
              "I need a completely new system / strategy",
            ]}
          />
          {(query || industryFilter || honestyFilter) && (
            <button
              onClick={() => {
                setQuery("");
                setIndustryFilter("");
                setHonestyFilter("");
              }}
              className="text-[12px] text-white/50 hover:text-white"
            >
              Reset
            </button>
          )}
          <div className="ml-auto text-[12px] text-white/40 tabular-nums">
            {filtered.length} of {rows.length}
          </div>
        </div>
      </header>

      {/* Body: split view */}
      <div className="max-w-[1400px] mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-6">
        {/* Left: list */}
        <div className="space-y-2">
          {loading ? (
            <div className="text-center py-24 text-white/40 text-sm">
              <Loader2 size={16} className="animate-spin inline mr-2" />
              Loading submissions…
            </div>
          ) : error ? (
            <div className="text-center py-24 text-rose-400 text-sm">
              <AlertTriangle size={16} className="inline mr-1.5" />
              {error}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-24 text-white/40 text-sm">
              {rows.length === 0
                ? "No submissions yet. Share https://apply.myvpv.com to start collecting."
                : "No submissions match those filters."}
            </div>
          ) : (
            filtered.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className={
                  "w-full text-left rounded-xl border p-4 transition-all group " +
                  (selected?.id === r.id
                    ? "border-[#1468d8]/60 bg-[#1468d8]/[0.08]"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]")
                }
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-white truncate">
                      {r.company_name || "(no company)"}
                    </div>
                    <div className="text-[12px] text-white/50 truncate">
                      {fullName(r)}
                    </div>
                  </div>
                  <div className="text-[10px] text-white/30 shrink-0 tabular-nums">
                    {timeAgo(r.created_at)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[10.5px]">
                  {r.industry && (
                    <span className="inline-flex items-center gap-1 text-white/60 bg-white/[0.05] border border-white/10 rounded-full px-2 py-0.5">
                      <Factory size={10} />
                      {r.industry}
                    </span>
                  )}
                  {r.current_export_turnover && (
                    <span className="inline-flex items-center gap-1 text-white/60 bg-white/[0.05] border border-white/10 rounded-full px-2 py-0.5">
                      <TrendingUp size={10} />₹{r.current_export_turnover} Cr
                    </span>
                  )}
                  {r.export_goal_5yr && (
                    <span className="inline-flex items-center gap-1 text-white/60 bg-white/[0.05] border border-white/10 rounded-full px-2 py-0.5">
                      <Target size={10} />
                      goal ₹{r.export_goal_5yr}
                    </span>
                  )}
                  {r.brutal_honesty && (
                    <span
                      className={
                        "inline-flex items-center rounded-full px-2 py-0.5 border font-medium " +
                        (HONESTY_TONE[r.brutal_honesty] ??
                          "bg-white/5 text-white/50 border-white/10")
                      }
                    >
                      {r.brutal_honesty === "Yes, we will easily hit it"
                        ? "confident"
                        : r.brutal_honesty ===
                          "No, we will likely remain stagnant or grow very slowly"
                        ? "stagnant"
                        : r.brutal_honesty ===
                          "I need a completely new system / strategy"
                        ? "needs new system"
                        : r.brutal_honesty}
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Right: detail */}
        <div className="lg:sticky lg:top-[145px] self-start max-h-[calc(100vh-165px)] overflow-auto rounded-xl border border-white/10 bg-white/[0.02] p-6">
          {!selected ? (
            <div className="grid place-items-center h-[400px] text-white/40 text-sm text-center">
              <div>
                <div className="text-white/30 mb-2">Select a lead to view the full submission.</div>
                <div className="text-[11px] text-white/20">
                  All 30+ answers, contact details, and metadata.
                </div>
              </div>
            </div>
          ) : (
            <LeadDetail
              lead={selected}
              onClose={() => setSelected(null)}
              copied={copied}
              onCopy={copy}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StatChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-1.5 text-white/50">
      {icon}
      <span>{label}</span>
      <span className="text-white font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-white/[0.04] border border-white/10 focus:border-[#1468d8] rounded-lg px-3 py-2 text-[12.5px] outline-none text-white/80 max-w-[240px] truncate"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o} className="bg-slate-900">
          {o}
        </option>
      ))}
    </select>
  );
}

function LeadDetail({
  lead,
  onClose,
  copied,
  onCopy,
}: {
  lead: Lead;
  onClose: () => void;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
}) {
  const groups: { title: string; fields: [string, string | null][] }[] = [
    {
      title: "Company scale",
      fields: [
        ["Industry", lead.industry],
        ["Factories", lead.factory_count],
        ["Current export turnover (₹ Cr)", lead.current_export_turnover],
      ],
    },
    {
      title: "Ambition",
      fields: [
        ["5-year export goal (₹ Cr)", lead.export_goal_5yr],
        ["LTV of one client (₹ Cr)", lead.client_ltv_cr],
        ["Countries exporting to", lead.export_countries],
      ],
    },
    {
      title: "Marketing & sales",
      fields: [
        ["Annual intl. marketing spend", lead.intl_marketing_spend],
        ["Exhibitions in 5 yrs", lead.exhibitions_5yr],
        ["Sales cycle length", lead.sales_cycle_length],
        ["Lead conversion rate", lead.lead_conversion_rate],
      ],
    },
    {
      title: "Trust & positioning",
      fields: [
        ["Buyers negotiate on price?", lead.buyers_negotiate_price],
        ["Buyers understand scale?", lead.buyers_understand_scale],
        ["vs. Chinese/Turkish competitor", lead.competitive_positioning],
        ["Trust delays deals?", lead.trust_delays_deals],
      ],
    },
    {
      title: "Capabilities today",
      fields: [
        ["Factory showcase method", lead.factory_showcase_method],
        ["Follow-up system", lead.followup_system],
        ["Dedicated export team?", lead.export_team],
        ["Ready for virtual audit tomorrow?", lead.virtual_audit_readiness],
      ],
    },
    {
      title: "Track record",
      fields: [
        ["YoY growth (5 yrs)", lead.yoy_growth],
        ["Total exhibition investment", lead.total_exhibition_investment],
        ["Growth initiatives taken", lead.growth_initiatives],
        ["Top challenges right now", lead.top_challenges],
        ["Has USP?", lead.has_usp],
        ["Last innovation & impact", lead.last_innovation],
      ],
    },
    {
      title: "Strategic honesty",
      fields: [
        ["% of strategic marketing being executed", lead.marketing_execution_pct],
        ["Estimated lost revenue", lead.lost_revenue],
        ["Will you hit 5-yr goal without change?", lead.brutal_honesty],
      ],
    },
  ];

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-white/40 mb-1">
            {fmtDateTime(lead.created_at)}
          </div>
          <h2 className="text-[22px] font-semibold text-white leading-tight">
            {lead.company_name || "(no company)"}
          </h2>
          <div className="text-[13px] text-white/60 mt-0.5">{fullName(lead)}</div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06]"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      {/* Contact strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6">
        {lead.email && (
          <CopyRow
            icon={<Mail size={13} />}
            label={lead.email}
            copied={copied === `email-${lead.id}`}
            onCopy={() => onCopy(lead.email!, `email-${lead.id}`)}
          />
        )}
        {lead.mobile && (
          <CopyRow
            icon={<Phone size={13} />}
            label={lead.mobile}
            copied={copied === `mobile-${lead.id}`}
            onCopy={() => onCopy(lead.mobile!, `mobile-${lead.id}`)}
          />
        )}
      </div>

      {/* Groups */}
      <div className="space-y-5">
        {groups.map((g) => (
          <section key={g.title}>
            <div className="text-[11px] uppercase tracking-widest text-[#4d9fff] font-semibold mb-2">
              {g.title}
            </div>
            <div className="rounded-xl border border-white/10 divide-y divide-white/5 overflow-hidden">
              {g.fields.map(([k, v]) => (
                <div
                  key={k}
                  className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)] gap-4 px-4 py-3"
                >
                  <div className="text-[12px] text-white/50">{k}</div>
                  <div className="text-[13px] text-white/90 whitespace-pre-wrap break-words">
                    {v || <span className="text-white/25">—</span>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Meta */}
      <div className="mt-6 pt-5 border-t border-white/10 text-[11px] text-white/30 space-y-1">
        <div>
          <span className="text-white/40">Submission ID:</span>{" "}
          <span className="font-mono">{lead.id}</span>
        </div>
        {lead.referrer && (
          <div>
            <span className="text-white/40">Referrer:</span> {lead.referrer}
          </div>
        )}
        {lead.user_agent && (
          <div className="truncate">
            <span className="text-white/40">User agent:</span> {lead.user_agent}
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {lead.email && (
          <a
            href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
              lead.email,
            )}&su=${encodeURIComponent("Your VPV qualification — next steps")}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 bg-[#1468d8] hover:bg-[#0b3d91] text-white text-[12.5px] font-semibold rounded-lg px-3.5 py-2"
          >
            <Mail size={13} /> Email
            <ArrowRight size={12} />
          </a>
        )}
        {lead.mobile && (
          <a
            href={`https://wa.me/${lead.mobile.replace(/[^0-9]/g, "")}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[12.5px] font-semibold rounded-lg px-3.5 py-2"
          >
            <Phone size={13} /> WhatsApp
            <ArrowRight size={12} />
          </a>
        )}
      </div>
    </div>
  );
}

function CopyRow({
  icon,
  label,
  copied,
  onCopy,
}: {
  icon: React.ReactNode;
  label: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <button
      onClick={onCopy}
      className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 px-3 py-2 text-left"
    >
      <span className="flex items-center gap-2 text-[13px] text-white/85 min-w-0">
        <span className="text-white/40 shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <span className="text-white/40 shrink-0">
        {copied ? <Check size={13} className="text-emerald-400" /> : <CopyIcon size={13} />}
      </span>
    </button>
  );
}
