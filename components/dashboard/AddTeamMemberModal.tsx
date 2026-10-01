"use client";

/**
 * AddTeamMemberModal — org_admin's two-way to onboard sales reps.
 *
 *   Tab 1 — Generate code
 *     One shareable code with a configurable capacity (max_uses) and
 *     per-rep device limit. Paste it into a group chat and 100 reps
 *     can sign up with the same code. The device limit decides how
 *     many devices each rep can be active on at once (default 1, to
 *     prevent credential sharing).
 *
 *   Tab 2 — Add by email
 *     Paste a list of emails (one per line or comma-separated). We
 *     mint a single-use code per email + the admin gets a copy-list
 *     to forward to each person. More personal than a bulk code.
 *
 *  Both tabs end in a share-ready result the admin can copy or email.
 */

import { useMemo, useState } from "react";
import { createInviteCode } from "@/lib/inviteCodes";
import {
  X,
  Users,
  Mail,
  Copy,
  Check,
  Loader2,
  KeyRound,
  Smartphone,
  Clock,
} from "lucide-react";

type Tab = "bulk" | "email";
type BulkResult = {
  code: string;
  maxUses: number;
  deviceLimit: number;
  expiresInDays: number;
};
type EmailRow = {
  email: string;
  code?: string;
  error?: string;
};

export default function AddTeamMemberModal({
  orgId,
  onClose,
  onCreated,
}: {
  orgId: string | null;
  onClose: () => void;
  onCreated?: (summary: { codes: string[] }) => void;
}) {
  const [tab, setTab] = useState<Tab>("bulk");

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-vpv-navy/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[520px] max-w-[94vw] max-h-[90vh] overflow-auto rounded-2xl bg-white border border-vpv-line p-6 shadow-[0_30px_80px_-20px_rgba(11,61,145,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-vpv-muted mb-1">
              Invite team members
            </div>
            <div className="text-[18px] font-semibold text-vpv-ink">
              Add presenters
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-vpv-tint grid place-items-center text-vpv-muted"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-vpv-canvas border border-vpv-line mb-5">
          <TabButton
            active={tab === "bulk"}
            onClick={() => setTab("bulk")}
            icon={<Users size={13} />}
            label="Generate code"
          />
          <TabButton
            active={tab === "email"}
            onClick={() => setTab("email")}
            icon={<Mail size={13} />}
            label="Add by email"
          />
        </div>

        {tab === "bulk" ? (
          <BulkTab orgId={orgId} onCreated={onCreated} />
        ) : (
          <EmailTab orgId={orgId} onCreated={onCreated} />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 rounded-lg text-[13px] font-medium flex items-center justify-center gap-1.5 transition-all ${
        active
          ? "bg-white text-vpv-navy shadow-sm border border-vpv-line"
          : "text-vpv-muted hover:text-vpv-navy"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/* --------------------------------- Tab 1 --------------------------------- */

function BulkTab({
  orgId,
  onCreated,
}: {
  orgId: string | null;
  onCreated?: (summary: { codes: string[] }) => void;
}) {
  const [maxUses, setMaxUses] = useState(10);
  const [deviceLimit, setDeviceLimit] = useState(1);
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    if (!orgId) {
      setError("Your account isn't linked to an organization yet.");
      return;
    }
    setError(null);
    setBusy(true);
    const res = await createInviteCode({
      orgId,
      maxUses,
      expiresInDays,
      deviceLimit,
    });
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setResult({ code: res.code, maxUses, deviceLimit, expiresInDays });
    onCreated?.({ codes: [res.code] });
  }

  function copy() {
    if (!result) return;
    navigator.clipboard.writeText(result.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  if (result) {
    return (
      <div>
        <div className="text-[12px] text-vpv-muted mb-3">
          Share this code. Up to{" "}
          <strong className="text-vpv-navy">{result.maxUses}</strong> presenter
          {result.maxUses === 1 ? "" : "s"} can sign up with it on{" "}
          <code className="bg-vpv-tint px-1 rounded">/signup/sales</code>.
        </div>

        <div className="p-5 rounded-xl bg-gradient-to-br from-vpv-tint to-white border border-vpv-blue/30 font-mono text-[26px] tracking-[0.3em] text-vpv-navy text-center mb-4 select-all">
          {result.code}
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <StatPill label="Max signups" value={String(result.maxUses)} />
          <StatPill
            label="Device limit"
            value={`${result.deviceLimit} per rep`}
          />
          <StatPill label="Expires in" value={`${result.expiresInDays}d`} />
        </div>

        <button
          onClick={copy}
          className="w-full py-2.5 rounded-full bg-white border border-vpv-line hover:border-vpv-blue/50 hover:bg-vpv-tint text-vpv-navy text-[13px] font-medium flex items-center justify-center gap-2"
        >
          {copied ? (
            <>
              <Check size={14} className="text-emerald-500" /> Copied!
            </>
          ) : (
            <>
              <Copy size={14} /> Copy code
            </>
          )}
        </button>

        <button
          onClick={() => setResult(null)}
          className="w-full mt-2 py-2 text-[12px] text-vpv-muted hover:text-vpv-navy"
        >
          Generate another
        </button>
      </div>
    );
  }

  return (
    <div>
      <SliderField
        icon={<Users size={13} />}
        label="Number of signups allowed"
        hint="How many different people can use this one code"
        value={maxUses}
        min={1}
        max={100}
        onChange={setMaxUses}
        valueLabel={`${maxUses} ${maxUses === 1 ? "person" : "people"}`}
      />
      <SliderField
        icon={<Smartphone size={13} />}
        label="Devices per rep"
        hint="How many devices each rep can be signed in on at once"
        value={deviceLimit}
        min={1}
        max={5}
        onChange={setDeviceLimit}
        valueLabel={`${deviceLimit} ${deviceLimit === 1 ? "device" : "devices"}`}
      />
      <SliderField
        icon={<Clock size={13} />}
        label="Expiry"
        value={expiresInDays}
        min={1}
        max={30}
        onChange={setExpiresInDays}
        valueLabel={`${expiresInDays} day${expiresInDays === 1 ? "" : "s"}`}
      />

      {error && (
        <div className="text-[12px] text-rose-600 mb-3 bg-rose-50 border border-rose-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      <button
        onClick={generate}
        disabled={busy || !orgId}
        className="w-full py-2.5 rounded-full bg-vpv-navy hover:bg-vpv-blue text-white text-[13px] font-medium flex items-center justify-center gap-2 disabled:opacity-50 shadow-[0_10px_28px_-10px_rgba(11,61,145,0.5)]"
      >
        {busy ? (
          <>
            <Loader2 size={14} className="animate-spin" /> Generating…
          </>
        ) : (
          <>
            <KeyRound size={14} /> Generate code
          </>
        )}
      </button>
    </div>
  );
}

/* --------------------------------- Tab 2 --------------------------------- */

function EmailTab({
  orgId,
  onCreated,
}: {
  orgId: string | null;
  onCreated?: (summary: { codes: string[] }) => void;
}) {
  const [raw, setRaw] = useState("");
  const [deviceLimit, setDeviceLimit] = useState(1);
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<EmailRow[] | null>(null);
  const [copied, setCopied] = useState(false);

  const emails = useMemo(() => {
    return raw
      .split(/[\s,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
  }, [raw]);

  async function generate() {
    if (!orgId || emails.length === 0) return;
    setBusy(true);
    const rows: EmailRow[] = [];
    for (const email of emails) {
      const res = await createInviteCode({
        orgId,
        maxUses: 1,
        expiresInDays,
        deviceLimit,
      });
      if ("error" in res) {
        rows.push({ email, error: res.error });
      } else {
        rows.push({ email, code: res.code });
      }
    }
    setBusy(false);
    setResults(rows);
    const successCodes = rows.filter((r) => r.code).map((r) => r.code!);
    onCreated?.({ codes: successCodes });
  }

  function copyAll() {
    if (!results) return;
    const txt = results
      .filter((r) => r.code)
      .map((r) => `${r.email}\t${r.code}`)
      .join("\n");
    navigator.clipboard.writeText(txt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  if (results) {
    const good = results.filter((r) => r.code);
    const bad = results.filter((r) => r.error);
    return (
      <div>
        <div className="text-[12px] text-vpv-muted mb-3">
          Generated {good.length} code{good.length === 1 ? "" : "s"}. Each code
          is single-use. Copy the list below and forward each code to the
          matching person.
        </div>
        <div className="max-h-[280px] overflow-auto rounded-lg border border-vpv-line divide-y divide-vpv-line mb-3">
          {results.map((r) => (
            <div
              key={r.email}
              className="flex items-center justify-between px-3 py-2 text-[12px]"
            >
              <span className="text-vpv-ink truncate pr-2">{r.email}</span>
              {r.code ? (
                <span className="font-mono tracking-widest text-vpv-navy">
                  {r.code}
                </span>
              ) : (
                <span className="text-rose-500 text-[11px]">{r.error}</span>
              )}
            </div>
          ))}
        </div>
        {bad.length > 0 && (
          <div className="text-[11px] text-rose-600 mb-2">
            {bad.length} row{bad.length === 1 ? "" : "s"} failed — try again or
            check your SQL migrations.
          </div>
        )}
        <button
          onClick={copyAll}
          className="w-full py-2.5 rounded-full bg-white border border-vpv-line hover:border-vpv-blue/50 hover:bg-vpv-tint text-vpv-navy text-[13px] font-medium flex items-center justify-center gap-2"
        >
          {copied ? (
            <>
              <Check size={14} className="text-emerald-500" /> Copied!
            </>
          ) : (
            <>
              <Copy size={14} /> Copy as email / code list
            </>
          )}
        </button>
        <button
          onClick={() => setResults(null)}
          className="w-full mt-2 py-2 text-[12px] text-vpv-muted hover:text-vpv-navy"
        >
          Add more
        </button>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-[11px] uppercase tracking-[0.15em] text-vpv-muted mb-1.5">
        Paste emails
      </label>
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder={"amit@acmeco.com\npriya@acmeco.com\n…"}
        rows={5}
        className="w-full mb-1 bg-vpv-canvas border border-vpv-line rounded-lg px-3 py-2.5 text-[13px] text-vpv-ink outline-none focus:border-vpv-blue resize-none font-mono"
      />
      <div className="text-[11px] text-vpv-muted mb-3">
        {emails.length} valid email{emails.length === 1 ? "" : "s"} detected
      </div>

      <SliderField
        icon={<Smartphone size={13} />}
        label="Devices per rep"
        value={deviceLimit}
        min={1}
        max={5}
        onChange={setDeviceLimit}
        valueLabel={`${deviceLimit} ${deviceLimit === 1 ? "device" : "devices"}`}
      />
      <SliderField
        icon={<Clock size={13} />}
        label="Codes expire in"
        value={expiresInDays}
        min={1}
        max={30}
        onChange={setExpiresInDays}
        valueLabel={`${expiresInDays} day${expiresInDays === 1 ? "" : "s"}`}
      />

      <button
        onClick={generate}
        disabled={busy || !orgId || emails.length === 0}
        className="w-full py-2.5 rounded-full bg-vpv-navy hover:bg-vpv-blue text-white text-[13px] font-medium flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {busy ? (
          <>
            <Loader2 size={14} className="animate-spin" /> Generating {emails.length} codes…
          </>
        ) : (
          <>
            <KeyRound size={14} /> Generate {emails.length || ""} code
            {emails.length === 1 ? "" : "s"}
          </>
        )}
      </button>
    </div>
  );
}

/* ---------------------------- Shared bits -------------------------------- */

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2 rounded-lg bg-vpv-canvas border border-vpv-line text-center">
      <div className="text-[9px] uppercase tracking-wider text-vpv-muted">
        {label}
      </div>
      <div className="text-[12px] font-semibold text-vpv-navy mt-0.5">
        {value}
      </div>
    </div>
  );
}

function SliderField({
  icon,
  label,
  hint,
  value,
  min,
  max,
  onChange,
  valueLabel,
}: {
  icon?: React.ReactNode;
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  valueLabel: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] text-vpv-muted">
          {icon}
          {label}
        </div>
        <div className="text-[12px] font-semibold text-vpv-navy tabular-nums">
          {valueLabel}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-vpv-blue"
      />
      {hint && (
        <div className="text-[11px] text-vpv-muted mt-1">{hint}</div>
      )}
    </div>
  );
}
