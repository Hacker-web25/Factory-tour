/**
 * /admin/channels/email/new — make an e-mail campaign from a file of addresses.
 *
 * Upload Excel or CSV, check the columns, name the campaign (the same name it
 * has in Zoho), optionally set the one shared coupon, and create. The browser
 * reads the file and shows what it found; nothing is saved until "Create".
 *
 * Platform owner only.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getMyProfile, type Profile } from "@/lib/auth";
import {
  MAX_EMAIL_PEOPLE,
  guessColumns,
  parseSpreadsheet,
  planRecipients,
  type ColumnMap,
  type Table,
} from "@/lib/emailImport";
import { couponExpiry, emailTemplate, formatIst } from "@/lib/emailCampaign";
import { NotOwner } from "@/components/admin/channelBits";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** "2026-11-02T14:30" in the browser's own time, for a datetime-local input. */
function localInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function NewEmailCampaignPage() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);

  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<Table | null>(null);
  const [map, setMap] = useState<ColumnMap>({ email: -1, name: -1, company: -1, phone: -1 });
  const [fileError, setFileError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [destination, setDestination] = useState("/");
  const [sentAt, setSentAt] = useState(() => localInput(new Date()));
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");

  const [useCoupon, setUseCoupon] = useState(true);
  const [couponCode, setCouponCode] = useState("");
  const [couponKind, setCouponKind] = useState<"percent" | "amount">("percent");
  const [couponValue, setCouponValue] = useState("50");
  const [couponDays, setCouponDays] = useState("3");
  const [couponMax, setCouponMax] = useState("");
  const [maxTouched, setMaxTouched] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getMyProfile();
      if (!p) {
        router.push("/login?next=/admin/channels/email/new");
        return;
      }
      if (!cancelled) setMe(p);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const plan = useMemo(() => (table ? planRecipients(table, map) : null), [table, map]);

  // The use limit follows the list size until the owner types their own.
  useEffect(() => {
    if (!maxTouched && plan) setCouponMax(String(plan.recipients.length || ""));
  }, [plan, maxTouched]);

  const sentDate = useMemo(() => {
    const d = new Date(sentAt);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }, [sentAt]);
  const daysNum = Number(couponDays);
  const validUntil = Number.isInteger(daysNum) && daysNum >= 1 ? couponExpiry(sentDate, daysNum) : null;

  const pick = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    setTable(null);
    if (file.size > MAX_FILE_BYTES) {
      setFileError("That file is larger than 20 MB. Split it into two lists.");
      return;
    }
    try {
      const t = parseSpreadsheet(file.name, new Uint8Array(await file.arrayBuffer()));
      if (!t.rows.length) {
        setFileError("The file has no rows in it.");
        return;
      }
      setFileName(file.name);
      setTable(t);
      setMap(guessColumns(t));
      setName((n) => n || file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim());
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "Could not read that file.");
    }
  }, []);

  function fillTemplate() {
    const disc =
      couponKind === "percent" ? `${couponValue || "…"}% off` : `₹${Number(couponValue || 0).toLocaleString("en-IN")} off`;
    const t = emailTemplate({
      couponCode: useCoupon && couponCode ? couponCode.toUpperCase() : null,
      discount: disc,
      validUntil: useCoupon ? validUntil : null,
      limit: useCoupon && Number(couponMax) > 0 ? Number(couponMax) : null,
    });
    setSubject(t.subject);
    setBodyText(t.body);
  }

  const couponInvalid =
    useCoupon &&
    (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,23}$/.test(couponCode.trim()) ||
      !(Number.isInteger(Number(couponValue)) && Number(couponValue) >= 1 && (couponKind === "amount" || Number(couponValue) <= 100)) ||
      !validUntil);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!plan || !plan.recipients.length) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/email-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({
          name,
          zohoName: name,
          destination,
          sentAt: sentDate.toISOString(),
          subject,
          bodyText,
          recipients: plan.recipients.map((r) => ({ email: r.email, name: r.name, company: r.company, phone: r.phone })),
          coupon: useCoupon
            ? {
                code: couponCode.trim().toUpperCase(),
                kind: couponKind,
                value: Number(couponValue),
                days: Number(couponDays),
                maxUses: couponMax.trim() === "" ? null : Number(couponMax),
              }
            : null,
        }),
      });
      const d = (await res.json()) as { ok?: boolean; message?: string; slug?: string };
      if (!res.ok || !d.ok || !d.slug) {
        setError(d.message ?? "Could not create the campaign.");
        return;
      }
      router.push(`/admin/channels/email/${d.slug}`);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (me && me.role !== "owner") return <NotOwner />;

  const headerOpts = table?.headers ?? [];
  const field = "w-full rounded-lg border border-vpv-line px-3 py-2 text-[14px]";

  return (
    <main className="min-h-screen bg-vpv-canvas px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin/channels/email" className="text-[13px] font-medium text-vpv-blue underline underline-offset-2">
          ← Email
        </Link>
        <h1 className="mt-3 text-[28px] font-semibold tracking-tight">New e-mail campaign</h1>
        <p className="mt-1 max-w-2xl text-[14px] text-vpv-muted">
          Upload your list, and every person gets their own tracked link. Nothing is saved until you press Create.
        </p>

        <form onSubmit={create}>
          {/* 1 ── the file */}
          <section className="mt-7 rounded-2xl border border-vpv-line bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-[16px] font-semibold">1. Your list</h2>
            <p className="mt-1 text-[13px] text-vpv-muted">
              Excel (.xlsx), CSV or tab-separated text, up to {MAX_EMAIL_PEOPLE.toLocaleString("en-IN")} people. It needs an
              e-mail column; name, company and phone are optional. Duplicates and bad addresses are removed for you.
            </p>
            <input
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,text/csv"
              onChange={(e) => void pick(e.target.files?.[0])}
              className="mt-4 block w-full text-[13.5px] file:mr-3 file:rounded-full file:border-0 file:bg-vpv-blue file:px-4 file:py-2 file:text-[13px] file:font-semibold file:text-white"
            />
            {fileError && <p className="mt-3 text-[13px] text-red-700">{fileError}</p>}

            {table && plan && (
              <div className="mt-5">
                <p className="text-[13px] text-vpv-muted">
                  {fileName}: {table.rows.length.toLocaleString("en-IN")} rows. Check the columns we found:
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  {(
                    [
                      ["email", "E-mail (required)"],
                      ["name", "Name"],
                      ["company", "Company"],
                      ["phone", "Phone"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="block">
                      <span className="mb-1 block text-[12.5px] font-medium text-vpv-ink">{label}</span>
                      <select
                        value={map[key]}
                        onChange={(e) => setMap({ ...map, [key]: Number(e.target.value) })}
                        className={field}
                      >
                        <option value={-1}>{key === "email" ? "Choose…" : "(none)"}</option>
                        {headerOpts.map((h, i) => (
                          <option key={i} value={i}>
                            {h || `Column ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>

                {map.email < 0 ? (
                  <p className="mt-4 text-[13px] text-red-700">Choose which column holds the e-mail addresses.</p>
                ) : (
                  <div className="mt-4 rounded-xl bg-vpv-canvas p-4 text-[13.5px]">
                    <p className="font-semibold text-vpv-ink">
                      {plan.recipients.length.toLocaleString("en-IN")} people ready
                    </p>
                    <ul className="mt-1.5 space-y-0.5 text-[13px] text-slate-600">
                      {plan.duplicates > 0 && <li>{plan.duplicates} duplicate address{plan.duplicates === 1 ? "" : "es"} removed</li>}
                      {plan.invalid.length > 0 && (
                        <li className="text-amber-800">
                          {plan.invalid.length} not a valid address, left out
                          {" ("}
                          {plan.invalid.slice(0, 3).map((x) => `row ${x.row}: ${x.value}`).join("; ")}
                          {plan.invalid.length > 3 ? "…" : ""}
                          {")"}
                        </li>
                      )}
                      {plan.blank > 0 && <li>{plan.blank} empty row{plan.blank === 1 ? "" : "s"} skipped</li>}
                      {plan.roleAddresses > 0 && (
                        <li>
                          {plan.roleAddresses} shared inbox{plan.roleAddresses === 1 ? "" : "es"} (info@, sales@ …): kept, but
                          they are read less often than a person&rsquo;s own address
                        </li>
                      )}
                      {plan.overflow > 0 && (
                        <li className="text-amber-800">
                          {plan.overflow} more past the {MAX_EMAIL_PEOPLE.toLocaleString("en-IN")} limit were left out. Make a
                          second campaign for them.
                        </li>
                      )}
                    </ul>
                    {plan.recipients.slice(0, 3).length > 0 && (
                      <p className="mt-2 text-[12px] text-slate-500">
                        e.g. {plan.recipients.slice(0, 3).map((r) => `${r.name} <${r.email}>`).join(", ")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 2 ── the campaign */}
          <section className="mt-5 rounded-2xl border border-vpv-line bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-[16px] font-semibold">2. The campaign</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-[13px] font-medium text-vpv-ink">Campaign name (same as in Zoho)</span>
                <input value={name} onChange={(e) => setName(e.target.value)} required className={field} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-vpv-ink">Sending on</span>
                <input type="datetime-local" value={sentAt} onChange={(e) => setSentAt(e.target.value)} className={field} />
                <span className="mt-1 block text-[12px] text-vpv-muted">The coupon&rsquo;s days are counted from this moment.</span>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-vpv-ink">Where the links land</span>
                <input value={destination} onChange={(e) => setDestination(e.target.value)} className={field} />
                <span className="mt-1 block text-[12px] text-vpv-muted">A page on myvpv.com, like / or /demo.</span>
              </label>
            </div>
          </section>

          {/* 3 ── the coupon */}
          <section className="mt-5 rounded-2xl border border-vpv-line bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[16px] font-semibold">3. One shared coupon</h2>
              <label className="flex items-center gap-2 text-[13px] font-medium">
                <input type="checkbox" checked={useCoupon} onChange={(e) => setUseCoupon(e.target.checked)} />
                Add a coupon
              </label>
            </div>
            <p className="mt-1 text-[13px] text-vpv-muted">
              One code for the whole campaign, not one per person. Everyone gets the same discount and the same end time.
              It is applied automatically when they open their link, and you can also print the code in the e-mail.
            </p>
            {useCoupon && (
              <div className="mt-4 grid gap-4 sm:grid-cols-4">
                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-[13px] font-medium text-vpv-ink">Code</span>
                  <input
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
                    placeholder="DIWALI50"
                    maxLength={24}
                    className={`${field} font-mono uppercase`}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-medium text-vpv-ink">Discount</span>
                  <select value={couponKind} onChange={(e) => setCouponKind(e.target.value as "percent" | "amount")} className={field}>
                    <option value="percent">Percent off</option>
                    <option value="amount">Rupees off</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-medium text-vpv-ink">{couponKind === "percent" ? "Percent" : "Rupees"}</span>
                  <input
                    value={couponValue}
                    onChange={(e) => setCouponValue(e.target.value.replace(/[^0-9]/g, ""))}
                    inputMode="numeric"
                    className={`${field} tabular-nums`}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-medium text-vpv-ink">Valid for (days)</span>
                  <input
                    value={couponDays}
                    onChange={(e) => setCouponDays(e.target.value.replace(/[^0-9]/g, ""))}
                    inputMode="numeric"
                    className={`${field} tabular-nums`}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-medium text-vpv-ink">Can be used by</span>
                  <input
                    value={couponMax}
                    onChange={(e) => {
                      setMaxTouched(true);
                      setCouponMax(e.target.value.replace(/[^0-9]/g, ""));
                    }}
                    inputMode="numeric"
                    placeholder="no limit"
                    className={`${field} tabular-nums`}
                  />
                  <span className="mt-1 block text-[12px] text-vpv-muted">people. Try 50 for a &ldquo;first 50&rdquo; offer.</span>
                </label>
                <p className="self-end text-[13px] text-slate-600 sm:col-span-2">
                  {validUntil ? <>Ends <strong>{formatIst(validUntil)} IST</strong>.</> : "Enter a whole number of days."}
                </p>
              </div>
            )}
          </section>

          {/* 4 ── the e-mail text */}
          <section className="mt-5 rounded-2xl border border-vpv-line bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[16px] font-semibold">4. The e-mail (optional)</h2>
              <button
                type="button"
                onClick={fillTemplate}
                className="rounded-full border border-vpv-blue px-4 py-1.5 text-[13px] font-semibold text-vpv-blue hover:bg-vpv-canvas"
              >
                Write a suggested e-mail
              </button>
            </div>
            <p className="mt-1 text-[13px] text-vpv-muted">
              Kept here so you can read what was sent with one click. You still write and send it in Zoho. In the
              suggested text, replace [[FIRST NAME]] and [[LINK]] with Zoho&rsquo;s merge fields.
            </p>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-[13px] font-medium text-vpv-ink">Subject</span>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className={field} />
            </label>
            <label className="mt-3 block">
              <span className="mb-1.5 block text-[13px] font-medium text-vpv-ink">Text</span>
              <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={9} className={`${field} font-mono text-[13px]`} />
            </label>
          </section>

          {error && <p className="mt-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-[13.5px] text-red-800">{error}</p>}

          <button
            type="submit"
            disabled={busy || !plan || plan.recipients.length === 0 || !name.trim() || couponInvalid}
            className="mt-6 rounded-full bg-vpv-blue px-7 py-3 text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Creating…" : plan?.recipients.length ? `Create campaign for ${plan.recipients.length.toLocaleString("en-IN")} people` : "Create campaign"}
          </button>
          {couponInvalid && (
            <p className="mt-2 text-[12.5px] text-amber-800">
              Check the coupon: a code of 3 to 24 letters or digits, a discount, and a number of days.
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
