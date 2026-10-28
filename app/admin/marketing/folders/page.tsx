/**
 * /admin/marketing/folders — every marketing campaign, and how each one is doing.
 *
 * One card per campaign: a city, a batch, a trade show. Open a card to see
 * every person who was sent a QR code, when they opened it, whether they
 * reached the website, and — by clicking a name — their whole journey.
 *
 * The numbers worth reading first are PEOPLE, OPENED and VISITED. Opened is a
 * person scanning the card; visited is the website actually loading for them.
 * A gap between the two is a scan that went nowhere (no signal, tab closed),
 * and it is worth a phone call.
 *
 * Every rate is measured against how many pieces were printed. A campaign
 * with no printed count shows its rates blank with a prompt to fill it in,
 * never a rate quietly computed from something else.
 *
 * Platform owner only.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getMyProfile, type Profile } from "@/lib/auth";
import { FOLDER_CHANNELS, type FolderStat } from "@/lib/campaignFolders";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const pctOf = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}% of people` : undefined);
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default function FoldersPage() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [folders, setFolders] = useState<FolderStat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [migration, setMigration] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [channel, setChannel] = useState<string>("pamphlet");
  const [printedCount, setPrintedCount] = useState("");
  const [distributedAt, setDistributedAt] = useState("");
  const [destination, setDestination] = useState("/");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const token = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/marketing/folders", {
        headers: { Authorization: `Bearer ${await token()}` },
      });
      const d = (await res.json()) as {
        ok?: boolean;
        folders?: FolderStat[];
        needsMigration?: boolean;
        hint?: string;
        message?: string;
      };
      if (!res.ok || !d.ok) {
        setError(d.message ?? "Could not load the campaigns.");
        return;
      }
      setMigration(d.needsMigration ? d.hint ?? "A migration is pending." : null);
      setFolders(d.folders ?? []);
      setError(null);
    } catch {
      setError("Could not reach the server.");
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getMyProfile();
      if (!p) {
        router.push("/login?next=/admin/marketing/folders");
        return;
      }
      if (cancelled) return;
      setMe(p);
      if (p.role !== "owner") return;
      await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [router, load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const res = await fetch("/api/admin/marketing/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ name, city, channel, printedCount, distributedAt, destination }),
      });
      const d = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !d.ok) {
        setFormError(d.message ?? "Could not create that campaign.");
        return;
      }
      setName("");
      setCity("");
      setPrintedCount("");
      setDistributedAt("");
      setOpen(false);
      await load();
    } catch {
      setFormError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (me && me.role !== "owner") {
    return (
      <div className="grid min-h-screen place-items-center bg-vpv-canvas px-6 text-center">
        <div>
          <h1 className="text-[20px] font-semibold text-vpv-ink">Not available</h1>
          <p className="mt-2 text-[14px] text-vpv-muted">This page is for the platform owner.</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-vpv-canvas px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin/marketing" className="text-[13px] font-medium text-vpv-blue underline underline-offset-2">
          ← Marketing
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold tracking-tight">Campaigns</h1>
            <p className="mt-1 max-w-2xl text-[14px] text-vpv-muted">
              One card per campaign. Open one to see every person who was sent a QR code, whether
              they opened it, whether they reached the website, how interested they are and how to
              reach them. Rates are measured against how many pieces were printed, because the
              people who never scanned are exactly the ones the next run has to win.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-full bg-vpv-blue px-5 py-2.5 text-[13.5px] font-semibold text-white hover:opacity-90"
          >
            {open ? "Cancel" : "New campaign"}
          </button>
        </div>

        {migration && (
          <p className="mt-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13.5px] text-amber-900">
            {migration}
          </p>
        )}
        {error && (
          <p className="mt-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-[13.5px] text-red-800">
            {error}
          </p>
        )}

        {open && (
          <form
            onSubmit={create}
            className="mt-6 rounded-2xl border border-vpv-line bg-white p-5 shadow-sm sm:p-6"
          >
            <h2 className="text-[16px] font-semibold">New campaign</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Name" hint="What you will call it later, e.g. “Gurugram — Oct 26, batch 1”.">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full rounded-lg border border-vpv-line px-3 py-2 text-[14px]"
                />
              </Field>
              <Field label="City">
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Gurugram"
                  className="w-full rounded-lg border border-vpv-line px-3 py-2 text-[14px]"
                />
              </Field>
              <Field label="How it reaches them">
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  className="w-full rounded-lg border border-vpv-line px-3 py-2 text-[14px]"
                >
                  {FOLDER_CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="How many printed" hint="The number every rate is measured against. Blank is fine for now.">
                <input
                  value={printedCount}
                  onChange={(e) => setPrintedCount(e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric"
                  placeholder="220"
                  className="w-full rounded-lg border border-vpv-line px-3 py-2 text-[14px] tabular-nums"
                />
              </Field>
              <Field label="Handed out on">
                <input
                  type="date"
                  value={distributedAt}
                  onChange={(e) => setDistributedAt(e.target.value)}
                  className="w-full rounded-lg border border-vpv-line px-3 py-2 text-[14px]"
                />
              </Field>
              <Field label="Where the codes land" hint="A path on myvpv.com.">
                <input
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="w-full rounded-lg border border-vpv-line px-3 py-2 text-[14px]"
                />
              </Field>
            </div>
            {formError && <p className="mt-4 text-[13px] text-red-700">{formError}</p>}
            <button
              type="submit"
              disabled={busy}
              className="mt-5 rounded-full bg-vpv-blue px-6 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Creating…" : "Create campaign"}
            </button>
          </form>
        )}

        {folders === null && !error && <p className="mt-8 text-[14px] text-vpv-muted">Loading…</p>}

        {folders?.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-vpv-line bg-white p-8 text-center">
            <p className="text-[15px] font-medium text-vpv-ink">No campaigns yet.</p>
            <p className="mx-auto mt-2 max-w-md text-[13.5px] text-vpv-muted">
              Create one for the batch you are about to hand out, then file a personal code for each
              person under it.
            </p>
          </div>
        )}

        {folders && folders.length > 0 && (
          <div className="mt-8 grid gap-4">
            {folders.map((f) => (
              <Link
                key={f.id}
                href={`/admin/marketing/folders/${f.slug}`}
                className="block rounded-2xl border border-vpv-line bg-white p-5 shadow-sm transition hover:border-vpv-blue/50 hover:shadow sm:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[17px] font-semibold text-vpv-ink">{f.name}</h3>
                    <p className="mt-0.5 text-[12.5px] text-vpv-muted">
                      {[f.city, f.channel, f.distributedAt ? `out ${when(f.distributedAt)}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                      {!f.active && " · archived"}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-[20px] font-semibold tabular-nums text-vpv-ink">
                      {f.revenueInr > 0 ? inr(f.revenueInr) : "—"}
                    </div>
                    <div className="text-[12px] text-vpv-muted">
                      {f.paid} paid
                      {f.revenuePerPieceInr !== null && f.revenueInr > 0
                        ? ` · ₹${f.revenuePerPieceInr}/piece`
                        : ""}
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 lg:grid-cols-7">
                  <Cell
                    label="People"
                    value={String(f.codes)}
                    sub={f.printed !== null && f.printed !== f.codes ? `${f.printed} printed` : undefined}
                  />
                  <Cell
                    label="Opened"
                    value={String(f.scannedCodes)}
                    sub={pctOf(f.scannedCodes, f.codes)}
                    strong
                  />
                  <Cell
                    label="Visited site"
                    value={String(f.visited)}
                    sub={f.scannedCodes > f.visited ? `${f.scannedCodes - f.visited} opened, never loaded` : pctOf(f.visited, f.codes)}
                    strong
                  />
                  <Cell label="Left details" value={String(f.contacts)} sub="phone or e-mail" />
                  <Cell label="Reached the bill" value={String(f.reachedBilling)} />
                  <Cell label="Not opened" value={String(f.neverOpened)} dim={f.neverOpened === 0} />
                  <Cell label="Shown on" value={String(f.repeatScans)} sub="scanned again" dim={f.repeatScans === 0} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-vpv-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-vpv-muted">{hint}</span>}
    </label>
  );
}

function Cell({
  label,
  value,
  sub,
  strong,
  dim,
}: {
  label: string;
  value: string;
  sub?: string;
  strong?: boolean;
  dim?: boolean;
}) {
  return (
    <div>
      <div className="text-[11.5px] uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={`mt-0.5 tabular-nums ${
          strong ? "text-[19px] font-semibold text-vpv-ink" : "text-[17px] font-medium text-vpv-ink"
        } ${dim ? "opacity-45" : ""}`}
      >
        {value}
      </div>
      {sub && <div className="text-[11.5px] text-vpv-muted">{sub}</div>}
    </div>
  );
}
