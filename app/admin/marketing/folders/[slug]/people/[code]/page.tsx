/**
 * /admin/marketing/folders/<slug>/people/<code> — one person's whole story.
 *
 * Reads the way a sales call is prepared:
 *
 *   1. who they are, how interested they look and why, so you know in
 *      five seconds whether to ring;
 *   2. how to reach them — the number and e-mail they typed into the website
 *      if they did, with dial / WhatsApp / mail links — and a place to write
 *      down what happened when you did;
 *   3. how far they got, step by step, with the time each step was reached;
 *   4. every visit, minute by minute: the page, the time on it, how far down
 *      they read, the questions they opened, the buttons they pressed;
 *   5. everything they told us in the enquiry form.
 *
 * All times are Indian Standard Time. Platform owner only.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getMyProfile, type Profile } from "@/lib/auth";
import { formatDuration } from "@/lib/buyerReport";
import { deviceLabel } from "@/lib/analytics/userAgent";
import { INTEREST_MEANING } from "@/lib/interest";
import {
  DELIVERY_LABELS,
  OUTREACH_LABELS,
  OUTREACH_STATES,
  type DeliveryState,
  type OutreachState,
} from "@/lib/campaignFolders";
import type { Journey, JourneyItem, JourneyVisit } from "@/lib/personJourney";
import {
  ago,
  istClock,
  istDateTime,
  istToday,
  mailHref,
  openedAt,
  telHref,
  whatsappHref,
} from "@/lib/campaignView";
import { Empty, H3, InterestChip, Line, NotOwner, Panel, Stat, VisitedDot } from "@/components/admin/campaign/parts";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const yesNo = (v: boolean | null | undefined) => (v === null || v === undefined ? null : v ? "Yes" : "No");

const TONE_DOT: Record<JourneyItem["tone"], string> = {
  neutral: "bg-slate-300",
  good: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-red-500",
};

export default function PersonPage({ params }: { params: { slug: string; code: string } }) {
  const router = useRouter();
  const { slug, code } = params;
  const base = `/api/admin/marketing/folders/${encodeURIComponent(slug)}/people/${encodeURIComponent(code)}`;

  const [me, setMe] = useState<Profile | null>(null);
  const [j, setJ] = useState<Journey | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(base, { headers: { Authorization: `Bearer ${await token()}` } });
      const body = (await res.json()) as { ok?: boolean; journey?: Journey; truncated?: boolean; message?: string };
      if (!res.ok || !body.ok || !body.journey) {
        setError(body.message ?? "Could not load this person.");
        return;
      }
      setJ(body.journey);
      setTruncated(!!body.truncated);
      setError(null);
    } catch {
      setError("Could not reach the server.");
    }
  }, [base, token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getMyProfile();
      if (!p) {
        router.push(`/login?next=/admin/marketing/folders/${slug}/people/${code}`);
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
  }, [router, load, slug, code]);

  const back = `/admin/marketing/folders/${encodeURIComponent(slug)}`;

  if (me && me.role !== "owner") return <NotOwner />;

  if (error) {
    return (
      <main className="min-h-screen bg-vpv-canvas px-5 py-10">
        <div className="mx-auto max-w-3xl">
          <Link href={back} className="text-[13px] font-medium text-vpv-blue underline">
            ← Campaign
          </Link>
          <p className="mt-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-[13.5px] text-red-800">{error}</p>
        </div>
      </main>
    );
  }

  if (!j) {
    return (
      <main className="min-h-screen bg-vpv-canvas px-5 py-10">
        <p className="mx-auto max-w-3xl text-[14px] text-vpv-muted">Loading…</p>
      </main>
    );
  }

  const p = j.person;
  const first = openedAt(p);
  const name = p.contact.name ?? p.name ?? p.code;
  const company = p.contact.company ?? p.company;
  const reached = j.ladder.filter((s) => s.reached).length;

  return (
    <main className="min-h-screen bg-vpv-canvas px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link href={back} className="text-[13px] font-medium text-vpv-blue underline underline-offset-2">
          ← {j.folder.name}
        </Link>

        {/* ── who, and how interested ─────────────────────────────────── */}
        <header className="mt-4 rounded-2xl border border-vpv-line bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[28px] font-semibold tracking-tight">{name}</h1>
              <p className="mt-1 text-[14px] text-vpv-muted">
                {[company, p.role].filter(Boolean).join(" · ") || "No company on the letter"}
              </p>
              <p className="mt-1 text-[12.5px] text-vpv-muted">
                Letter {p.printSeq ?? "—"} · code <span className="font-mono">{p.code}</span> ·{" "}
                {DELIVERY_LABELS[p.deliveryState as DeliveryState] ?? p.deliveryState}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <InterestChip level={p.interest} score={p.interestScore} big />
              <VisitedDot visited={p.visited} opened={p.opened} />
            </div>
          </div>

          <p className="mt-4 text-[13px] text-vpv-muted">{INTEREST_MEANING[p.interest]}</p>
          {p.interestWhy.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {p.interestWhy.map((w) => (
                <li key={w} className="rounded-full bg-vpv-canvas px-3 py-1 text-[12.5px] text-vpv-ink">
                  {w}
                </li>
              ))}
            </ul>
          )}

          {p.signals.length > 0 && (
            <ul className="mt-4 space-y-1.5 border-t border-vpv-line pt-4">
              {p.signals.map((sig) => (
                <li key={sig.kind} className="flex gap-2 text-[13.5px] leading-relaxed text-vpv-ink">
                  <span
                    aria-hidden
                    className={`mt-[7px] h-1.5 w-1.5 flex-none rounded-full ${sig.weight >= 80 ? "bg-amber-500" : "bg-slate-300"}`}
                  />
                  {sig.text}
                </li>
              ))}
            </ul>
          )}
        </header>

        {truncated && (
          <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
            There is more activity than one page can load. The numbers are a lower bound.
          </p>
        )}

        {/* ── the numbers ─────────────────────────────────────────────── */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat
            label="Opened"
            value={first ? istDateTime(first) : "—"}
            sub={first ? ago(first) : "never scanned"}
          />
          <Stat label="Last seen" value={p.lastSeenAt ? istDateTime(p.lastSeenAt) : "—"} sub={p.lastSeenAt ? ago(p.lastSeenAt) : undefined} />
          <Stat label="Visits" value={String(p.visits)} sub={p.scans ? `${p.scans} scan${p.scans === 1 ? "" : "s"}` : undefined} />
          <Stat label="Time on site" value={p.activeSeconds > 0 ? formatDuration(p.activeSeconds) : "—"} sub="page in front of them" />
          <Stat label="Pages viewed" value={String(p.pageViews)} />
          <Stat
            label="Got as far as"
            value={p.opened ? p.stageLabel : "—"}
            sub={p.opened ? `${reached} of ${j.ladder.length} steps` : undefined}
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {/* ────────────────────── left: act ─────────────────────────── */}
          <div className="space-y-6 lg:col-span-1">
            <ContactPanel j={j} base={base} token={token} onSaved={load} />
            <FollowUpPanel j={j} base={base} token={token} onSaved={load} />
          </div>

          {/* ────────────────────── right: understand ─────────────────── */}
          <div className="space-y-6 lg:col-span-2">
            <Panel title="How far they got" hint="Each step is marked when we saw them reach it, with the time.">
              <ol className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {j.ladder.map((s) => (
                  <li key={s.key} className="flex items-start gap-3 text-[13.5px]">
                    <span
                      aria-hidden
                      className={`mt-[5px] h-3 w-3 flex-none rounded-full border ${
                        s.reached ? "border-emerald-500 bg-emerald-500" : "border-slate-300 bg-white"
                      }`}
                    />
                    <span className="min-w-0">
                      <span className={s.reached ? "font-medium text-vpv-ink" : "text-vpv-muted"}>{s.label}</span>
                      {s.reached && (
                        <span className="block text-[11.5px] text-vpv-muted">
                          {s.reachedAt ? istDateTime(s.reachedAt) : "reached"}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </Panel>

            {j.order && <OrderPanel order={j.order} />}
            {j.lead && <LeadPanel lead={j.lead} />}

            <Panel
              title="Visits"
              hint="A new visit starts after 30 idle minutes. Newest first. Times are Indian Standard Time."
            >
              {j.visits.length === 0 ? (
                <Empty>
                  {p.scans === 0
                    ? "They have not opened the card."
                    : "They scanned the card, but the website never loaded, so there is nothing more to show."}
                </Empty>
              ) : (
                <div className="space-y-4">
                  {[...j.visits].reverse().map((v, i) => (
                    <VisitCard key={v.n} v={v} open={i < 3} />
                  ))}
                </div>
              )}
            </Panel>

            {j.milestones.length > 0 && (
              <Panel title="Other events" hint="Enquiries, payments and follow-ups: things that happen outside a visit.">
                <ItemList items={j.milestones} />
              </Panel>
            )}

            <Panel title="Pages, by time spent" hint="Across every visit.">
              {j.pages.length === 0 ? (
                <Empty>No pages viewed yet.</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[13.5px]">
                    <thead className="text-[12px] text-slate-500">
                      <tr>
                        <th className="py-2 pr-4 font-medium">Page</th>
                        <th className="px-4 py-2 text-right font-medium">Views</th>
                        <th className="px-4 py-2 text-right font-medium">Time</th>
                        <th className="py-2 pl-4 text-right font-medium">Read down to</th>
                      </tr>
                    </thead>
                    <tbody>
                      {j.pages.map((pg) => (
                        <tr key={pg.path} className="border-t border-vpv-line">
                          <td className="py-2 pr-4 text-vpv-ink">{pg.label}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{pg.views}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatDuration(pg.seconds)}</td>
                          <td className="py-2 pl-4 text-right tabular-nums text-vpv-muted">
                            {pg.scroll ? `${pg.scroll}%` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            {p.objections.length > 0 && (
              <Panel title="What they asked" hint="Questions they opened on the FAQ — the objections to answer on the call.">
                <ul className="list-disc space-y-1 pl-5 text-[13.5px] text-vpv-ink">
                  {p.objections.map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>
              </Panel>
            )}

            <Panel title="Device" hint="What they opened it on.">
              <div className="grid gap-x-8 sm:grid-cols-2">
                <Line label="Device" value={p.devices.map(deviceLabel).join(", ") || null} />
                <Line label="System" value={p.os.join(", ") || null} />
                <Line label="Browser" value={p.browsers.join(", ") || null} />
                <Line label="City (approximate)" value={p.city} />
                <Line label="Browsers used" value={p.visitors ? String(p.visitors) : null} />
                <Line label="Scanned again" value={p.repeatScans ? `${p.repeatScans} time${p.repeatScans === 1 ? "" : "s"}` : null} />
              </div>
              {p.botScans > 0 && (
                <p className="mt-3 text-[12px] text-vpv-muted">
                  {p.botScans} link-preview hit{p.botScans === 1 ? "" : "s"} from a messaging app or scanner were
                  ignored — they are not a person opening the card.
                </p>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </main>
  );
}

/* ───────────────────────────── contact ──────────────────────────────────── */

function ContactPanel({
  j,
  base,
  token,
  onSaved,
}: {
  j: Journey;
  base: string;
  token: () => Promise<string>;
  onSaved: () => Promise<void>;
}) {
  const p = j.person;
  const phone = p.contact.phone;
  const email = p.contact.email;
  const tel = telHref(phone);
  const wa = whatsappHref(phone);
  const mail = mailHref(email);
  const source =
    p.contact.source === "form"
      ? "They typed this into the website themselves."
      : p.contact.source === "manual"
        ? "Entered by hand."
        : null;

  const [editing, setEditing] = useState(false);
  const [fPhone, setFPhone] = useState(p.phone ?? "");
  const [fEmail, setFEmail] = useState(p.email ?? "");
  const [fRole, setFRole] = useState(p.role ?? "");
  const [fCompany, setFCompany] = useState(p.company ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(base, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ phone: fPhone, email: fEmail, role: fRole, company: fCompany }),
      });
      const body = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !body.ok) {
        setMsg(body.message ?? "Could not save that.");
        return;
      }
      setEditing(false);
      await onSaved();
    } catch {
      setMsg("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="How to reach them"
      right={
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="text-[12.5px] font-medium text-vpv-blue underline underline-offset-2"
        >
          {editing ? "Cancel" : "Edit"}
        </button>
      }
    >
      {phone || email ? (
        <div className="space-y-3">
          {phone && (
            <div>
              <H3>Mobile</H3>
              <div className="text-[18px] font-semibold tabular-nums text-vpv-ink">{phone}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {tel && (
                  <a href={tel} className="rounded-full bg-vpv-blue px-4 py-1.5 text-[12.5px] font-semibold text-white">
                    Call
                  </a>
                )}
                {wa && (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-vpv-line px-4 py-1.5 text-[12.5px] font-semibold text-vpv-ink hover:bg-vpv-canvas"
                  >
                    WhatsApp
                  </a>
                )}
              </div>
            </div>
          )}
          {email && (
            <div>
              <H3>E-mail</H3>
              <div className="break-all text-[15px] text-vpv-ink">{email}</div>
              {mail && (
                <a
                  href={mail}
                  className="mt-2 inline-block rounded-full border border-vpv-line px-4 py-1.5 text-[12.5px] font-semibold text-vpv-ink hover:bg-vpv-canvas"
                >
                  Write an e-mail
                </a>
              )}
            </div>
          )}
          {source && <p className="text-[12px] text-vpv-muted">{source}</p>}
          {j.lead && j.lead.marketingConsent === false && (
            <p className="text-[12px] text-amber-800">They did not agree to marketing messages.</p>
          )}
        </div>
      ) : (
        <p className="text-[13.5px] leading-relaxed text-vpv-muted">
          {p.visited
            ? "They have not left a phone number or e-mail yet. If you speak to them, add it with Edit."
            : "No phone number or e-mail yet. It appears here the moment they fill in the website form, or you can add one with Edit."}
        </p>
      )}

      {editing && (
        <form onSubmit={save} className="mt-4 space-y-3 border-t border-vpv-line pt-4">
          <Input label="Mobile" value={fPhone} onChange={setFPhone} placeholder="+91 98765 43210" />
          <Input label="E-mail" value={fEmail} onChange={setFEmail} placeholder="name@company.com" type="email" />
          <Input label="Role" value={fRole} onChange={setFRole} placeholder="Managing director" />
          <Input label="Company" value={fCompany} onChange={setFCompany} />
          {msg && <p className="text-[12.5px] text-red-700">{msg}</p>}
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-vpv-blue px-5 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </form>
      )}
    </Panel>
  );
}

/* ───────────────────────────── follow-up ────────────────────────────────── */

function FollowUpPanel({
  j,
  base,
  token,
  onSaved,
}: {
  j: Journey;
  base: string;
  token: () => Promise<string>;
  onSaved: () => Promise<void>;
}) {
  const o = j.person.outreach;
  const [state, setState] = useState<string>(o.state);
  const [followUp, setFollowUp] = useState(o.followUpOn ?? "");
  const [notes, setNotes] = useState(o.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const dirty = state !== o.state || followUp !== (o.followUpOn ?? "") || notes !== (o.notes ?? "");
  const overdue = !!o.followUpOn && o.followUpOn <= istToday() && !["won", "declined", "wrong_person"].includes(o.state);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(base, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ outreachState: state, followUpOn: followUp, repNotes: notes }),
      });
      const body = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !body.ok) {
        setMsg(body.message ?? "Could not save that.");
        return;
      }
      setMsg("Saved.");
      await onSaved();
    } catch {
      setMsg("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Follow-up" hint="Written by hand: who called, what was said, when to ring back.">
      {overdue && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] font-medium text-amber-900">
          A call-back was due on {o.followUpOn}.
        </p>
      )}
      <form onSubmit={save} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[12.5px] font-medium text-vpv-ink">Where it stands</span>
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="w-full rounded-lg border border-vpv-line bg-white px-3 py-2 text-[14px]"
          >
            {OUTREACH_STATES.map((s) => (
              <option key={s} value={s}>
                {OUTREACH_LABELS[s as OutreachState]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[12.5px] font-medium text-vpv-ink">Call back on</span>
          <input
            type="date"
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            className="w-full rounded-lg border border-vpv-line bg-white px-3 py-2 text-[14px]"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12.5px] font-medium text-vpv-ink">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            maxLength={4000}
            placeholder="Spoke to his assistant; MD back on Monday. Wants the Standard plan quote by e-mail."
            className="w-full rounded-lg border border-vpv-line bg-white px-3 py-2 text-[14px] leading-relaxed"
          />
        </label>
        {o.contactedAt && (
          <p className="text-[12px] text-vpv-muted">First contacted {istDateTime(o.contactedAt)}.</p>
        )}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy || !dirty}
            className="rounded-full bg-vpv-blue px-5 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          {msg && <span className="text-[12.5px] text-vpv-muted">{msg}</span>}
        </div>
      </form>
    </Panel>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12.5px] font-medium text-vpv-ink">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-vpv-line bg-white px-3 py-2 text-[14px]"
      />
    </label>
  );
}

/* ───────────────────────── what they told us ───────────────────────────── */

function LeadPanel({ lead }: { lead: NonNullable<Journey["lead"]> }) {
  const list = (xs: string[]) => (xs.length ? xs.join(", ") : null);
  return (
    <Panel
      title="What they told us"
      hint={`The enquiry form, started ${istDateTime(lead.startedAt)}${lead.updatedAt ? `, last changed ${istDateTime(lead.updatedAt)}` : ""}.`}
    >
      <div className="grid gap-x-10 sm:grid-cols-2">
        <div>
          <H3>Them</H3>
          <Line label="Name" value={lead.name} />
          <Line label="Company" value={lead.company} />
          <Line label="Mobile" value={lead.phone} href={telHref(lead.phone)} />
          <Line
            label="E-mail"
            value={lead.email ? `${lead.email}${lead.emailVerified ? " ✓ verified" : ""}` : null}
            href={mailHref(lead.email)}
          />
          <Line label="Industry" value={lead.industry} />
          <Line label="Factory city" value={[lead.factoryCity, lead.factoryState].filter(Boolean).join(", ") || null} />
          <Line label="Plot size" value={lead.plotSize} />
        </div>
        <div>
          <H3>What they want</H3>
          <Line label="Areas" value={list(lead.areas)} />
          <Line label="Processes" value={list(lead.processes)} />
          <Line label="Aerial views" value={lead.aoaCount !== null ? String(lead.aoaCount) : null} />
          <Line label="Videos" value={lead.videoCount !== null ? String(lead.videoCount) : null} />
          <Line label="PDFs" value={lead.pdfCount !== null ? String(lead.pdfCount) : null} />
          <Line label="Sharing controls" value={yesNo(lead.wantsSharingControls)} />
          <Line label="Sales team" value={lead.hasSalesTeam ? `Yes${lead.salesSeats ? ` · ${lead.salesSeats} seats` : ""}` : yesNo(lead.hasSalesTeam)} />
        </div>
        <div className="mt-4 sm:col-span-2">
          <H3>Plan and price</H3>
          <div className="grid gap-x-10 sm:grid-cols-2">
            <div>
              <Line label="Stage reached" value={lead.stageLabel} />
              <Line label="Recommended plan" value={lead.recommendedPlan} />
              <Line label="Chosen plan" value={lead.chosenPlan} />
            </div>
            <div>
              <Line label="Extra areas" value={lead.extraAreas ? String(lead.extraAreas) : null} />
              <Line label="Extra videos" value={lead.extraVideos ? String(lead.extraVideos) : null} />
              <Line label="Quoted" value={lead.quotedTotalInr !== null ? inr(lead.quotedTotalInr) : null} />
            </div>
          </div>
        </div>
        <div className="mt-4 sm:col-span-2">
          <H3>Permission</H3>
          <div className="grid gap-x-10 sm:grid-cols-2">
            <Line label="Accepted the terms" value={lead.termsAcceptedAt ? istDateTime(lead.termsAcceptedAt) : null} />
            <Line label="Agreed to marketing" value={yesNo(lead.marketingConsent)} />
          </div>
        </div>
      </div>
    </Panel>
  );
}

function OrderPanel({ order }: { order: NonNullable<Journey["order"]> }) {
  const paid = order.status === "paid";
  return (
    <Panel title={paid ? "Paid" : "Order"} hint={paid ? undefined : "Started but not paid."}>
      <div className="grid gap-x-10 sm:grid-cols-2">
        <div>
          <Line label="Amount" value={inr(order.amountInr)} />
          <Line label="Status" value={order.status} />
          <Line label="Started" value={order.createdAt ? istDateTime(order.createdAt) : null} />
          <Line label="Paid" value={order.paidAt ? istDateTime(order.paidAt) : null} />
          {order.refundedInr > 0 && <Line label="Refunded" value={inr(order.refundedInr)} />}
        </div>
        <div>
          <Line label="Name" value={order.buyerName} />
          <Line label="Company" value={order.buyerCompany} />
          <Line label="Mobile" value={order.buyerPhone} href={telHref(order.buyerPhone)} />
          <Line label="E-mail" value={order.buyerEmail} href={mailHref(order.buyerEmail)} />
          <Line label="City" value={order.buyerCity} />
        </div>
      </div>
    </Panel>
  );
}

/* ───────────────────────────── the timeline ─────────────────────────────── */

function VisitCard({ v, open }: { v: JourneyVisit; open: boolean }) {
  const meta = [deviceLabel(v.device), v.os, v.browser, v.city].filter((x) => x && x !== "Unknown").join(" · ");
  return (
    <details open={open} className="group rounded-xl border border-vpv-line bg-vpv-canvas/40">
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
        <span className="text-[14px] font-semibold text-vpv-ink">
          Visit {v.n} · {istDateTime(v.startedAt)}
        </span>
        <span className="text-[12.5px] text-vpv-muted">
          {v.activeSeconds > 0 ? `${formatDuration(v.activeSeconds)} on site` : "no time recorded"}
          {v.spanSeconds > 0 ? ` · ${formatDuration(v.spanSeconds)} start to finish` : ""}
        </span>
        <span className="basis-full text-[12.5px] text-vpv-muted">
          {v.how}
          {meta ? ` · ${meta}` : ""}
        </span>
      </summary>
      <div className="border-t border-vpv-line px-4 py-3">
        {v.stops.length > 0 && (
          <ul className="mb-3 flex flex-wrap gap-2">
            {v.stops.map((s, i) => (
              <li key={`${s.path}-${i}`} className="rounded-full bg-white px-3 py-1 text-[12px] text-vpv-ink ring-1 ring-inset ring-vpv-line">
                {s.label}
                {s.seconds !== null && <span className="text-vpv-muted"> · {formatDuration(s.seconds)}</span>}
                {s.scroll ? <span className="text-vpv-muted"> · read {s.scroll}%</span> : null}
              </li>
            ))}
          </ul>
        )}
        <ItemList items={v.items} />
      </div>
    </details>
  );
}

function ItemList({ items }: { items: JourneyItem[] }) {
  if (!items.length) return <p className="text-[13px] text-vpv-muted">Nothing recorded.</p>;
  return (
    <ol className="space-y-2">
      {items.map((it, i) => (
        <li key={`${it.at}-${i}`} className="flex gap-3 text-[13.5px]">
          <span className="w-[64px] flex-none pt-px text-right text-[12px] tabular-nums text-vpv-muted">
            {istClock(it.at)}
          </span>
          <span aria-hidden className={`mt-[7px] h-2 w-2 flex-none rounded-full ${TONE_DOT[it.tone]}`} />
          <span className="min-w-0">
            <span className="text-vpv-ink">{it.title}</span>
            {it.detail && <span className="block text-[12px] text-vpv-muted">{it.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
