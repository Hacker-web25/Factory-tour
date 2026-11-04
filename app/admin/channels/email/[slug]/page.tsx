/**
 * /admin/channels/email/<slug> — one e-mail campaign.
 *
 * Two systems, one page. Zoho knows who was SENT the e-mail and who OPENED
 * it; VPV knows who then clicked their personal link, what they read and how
 * interested they are. Zoho's side comes in as the reports Zoho exports (no
 * connection to maintain, works on any plan); VPV's side is live.
 *
 * Platform owner only.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getMyProfile, type Profile } from "@/lib/auth";
import type { FolderDetail } from "@/lib/campaignFolders";
import { formatSeconds, TEMPERATURE_LABELS } from "@/lib/interest";
import {
  SEGMENTS,
  discountLabel,
  followUpList,
  formatIst,
  inSegment,
  mergeEmailPeople,
  personalLink,
  segmentCounts,
  segmentCsv,
  timeLeft,
  zohoCrmLeadsCsv,
  zohoExportCsv,
  emailTemplate,
  type EmailPerson,
  type SegmentId,
  type ZohoStats,
} from "@/lib/emailCampaign";
import {
  ZOHO_KIND_LABELS,
  ZOHO_REPORT_KINDS,
  parseSpreadsheet,
  planZohoCrmReport,
  planZohoReport,
  type ZohoReportKind,
} from "@/lib/emailImport";
import { DeleteCampaignDialog } from "@/components/admin/DeleteCampaignDialog";
import { NotOwner, Notice, inr } from "@/components/admin/channelBits";

type Meta = {
  campaign: {
    slug: string;
    name: string;
    destination: string;
    zohoCampaignName: string | null;
    subject: string | null;
    preheader: string | null;
    bodyText: string | null;
    sentAt: string | null;
    couponDays: number | null;
  };
  coupon: {
    code: string;
    percentOff: number | null;
    amountOffInr: number | null;
    maxUses: number | null;
    expiresAt: string | null;
    active: boolean;
    uses: number | null;
  } | null;
  recipients: { code: string; email: string; name: string | null; company: string | null; phone: string | null }[];
  stats: Record<string, ZohoStats>;
  truncated?: boolean;
};

const PAGE_SIZE = 100;

function download(fileName: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

const fileSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "campaign";

function Pct({ n, d }: { n: number; d: number }) {
  return d > 0 ? <span>{Math.round((n / d) * 100)}%</span> : null;
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: React.ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border border-vpv-line bg-white p-4">
      <div className="text-[11.5px] uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={`mt-1 text-[24px] font-semibold tabular-nums ${tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-600" : "text-vpv-ink"}`}
      >
        {value}
      </div>
      {sub && <div className="text-[12px] text-vpv-muted">{sub}</div>}
    </div>
  );
}

function TempBadge({ p }: { p: EmailPerson }) {
  if (p.paid) return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11.5px] font-semibold text-emerald-700">Customer</span>;
  if (!p.temperature) return <span className="text-slate-400">—</span>;
  const tone =
    p.temperature === "hot" ? "bg-red-50 text-red-700" : p.temperature === "warm" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${tone}`}>{TEMPERATURE_LABELS[p.temperature]}</span>;
}

function ZohoBadges({ z }: { z: ZohoStats }) {
  const b = (text: string, tone: string) => (
    <span key={text} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      {text}
    </span>
  );
  const out = [];
  if (z.bounced) out.push(b("Bounced", "bg-red-50 text-red-700"));
  if (z.unsubscribed) out.push(b("Unsubscribed", "bg-red-50 text-red-700"));
  if (z.complained) out.push(b("Spam", "bg-red-50 text-red-700"));
  if (z.openedAt || z.openCount > 0) out.push(b(z.openCount > 1 ? `Opened ×${z.openCount}` : "Opened", "bg-emerald-50 text-emerald-700"));
  else if (z.sent && !z.bounced) out.push(b("Sent", "bg-slate-100 text-slate-600"));
  return out.length ? <div className="flex flex-wrap gap-1">{out}</div> : <span className="text-slate-400">—</span>;
}

export default function EmailCampaignPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const router = useRouter();

  const [me, setMe] = useState<Profile | null>(null);
  const [detail, setDetail] = useState<FolderDetail | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [migration, setMigration] = useState<string | null>(null);

  const [segment, setSegment] = useState<SegmentId>("all");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Which Zoho product sends the e-mail. Zoho Campaigns is the one in use (it
  // works on every plan that has Campaigns, with custom fields and exportable
  // reports). Zoho CRM mass e-mail needs a paid CRM edition (the Free edition
  // has neither mass e-mail nor custom fields), so it is the alternative.
  // Campaigns exports one report per outcome; CRM exports one file with all of them.
  const [product, setProduct] = useState<"campaigns" | "crm">("campaigns");
  const reportShape: "crm" | "per-kind" = product === "crm" ? "crm" : "per-kind";
  const [kind, setKind] = useState<ZohoReportKind>("opened");
  const [zohoMsg, setZohoMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [zohoBusy, setZohoBusy] = useState(false);

  // Coupon edits
  const [days, setDays] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [couponMsg, setCouponMsg] = useState<string | null>(null);

  // E-mail text edits
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [emailMsg, setEmailMsg] = useState<string | null>(null);

  const token = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  }, []);

  const load = useCallback(async () => {
    try {
      const headers = { Authorization: `Bearer ${await token()}` };
      const [a, b] = await Promise.all([
        fetch(`/api/admin/marketing/folders/${encodeURIComponent(slug)}`, { headers }),
        fetch(`/api/admin/email-campaigns/${encodeURIComponent(slug)}`, { headers }),
      ]);
      const bm = (await b.json()) as Meta & { ok?: boolean; error?: string; message?: string };
      if (!b.ok || !bm.ok) {
        if (bm.error === "migration_needed") setMigration(bm.message ?? "Run supabase/email_campaigns.sql.");
        else setError(bm.message ?? "Could not load this campaign.");
        return;
      }
      const am = (await a.json()) as { ok?: boolean; detail?: FolderDetail; message?: string };
      if (!a.ok || !am.ok || !am.detail) {
        setError(am.message ?? "Could not load this campaign.");
        return;
      }
      setDetail(am.detail);
      setMeta(bm);
      setDays(bm.campaign.couponDays ? String(bm.campaign.couponDays) : "");
      setMaxUses(bm.coupon?.maxUses ? String(bm.coupon.maxUses) : "");
      setSubject(bm.campaign.subject ?? "");
      setBodyText(bm.campaign.bodyText ?? "");
      setError(null);
      setMigration(null);
    } catch {
      setError("Could not reach the server.");
    }
  }, [slug, token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getMyProfile();
      if (!p) {
        router.push(`/login?next=/admin/channels/email/${slug}`);
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
  }, [router, load, slug]);

  const people = useMemo(
    () =>
      detail && meta
        ? mergeEmailPeople(
            meta.recipients.map((r) => ({ ...r, email: r.email })),
            new Map(Object.entries(meta.stats)),
            detail.roster
          )
        : [],
    [detail, meta]
  );
  const counts = useMemo(() => segmentCounts(people), [people]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter(
      (p) => inSegment(p, segment) && (!q || `${p.name} ${p.email} ${p.company ?? ""}`.toLowerCase().includes(q))
    );
  }, [people, segment, query]);
  useEffect(() => setShown(PAGE_SIZE), [segment, query]);

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(`/api/admin/email-campaigns/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
      body: JSON.stringify(body),
    });
    const d = (await res.json()) as { ok?: boolean; message?: string };
    if (!res.ok || !d.ok) {
      setCouponMsg(d.message ?? "Could not save that.");
      setEmailMsg(d.message ?? "Could not save that.");
      return false;
    }
    await load();
    return true;
  }

  async function sendZoho(payload: Record<string, unknown>) {
    const res = await fetch(`/api/admin/email-campaigns/${encodeURIComponent(slug)}/zoho`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
      body: JSON.stringify(payload),
    });
    return (await res.json()) as { ok?: boolean; message?: string; matched?: number; notFoundCount?: number; notFound?: string[] };
  }

  async function uploadReport(file: File | undefined) {
    if (!file) return;
    setZohoBusy(true);
    setZohoMsg(null);
    try {
      const t = parseSpreadsheet(file.name, new Uint8Array(await file.arrayBuffer()));

      if (reportShape === "crm") {
        const plan = planZohoCrmReport(t);
        if (plan.noEmailColumn) {
          setZohoMsg({
            ok: false,
            text: "That report has no e-mail column. In Zoho CRM, make sure the export includes Email.",
          });
          return;
        }
        if (plan.noStatusColumn) {
          setZohoMsg({
            ok: false,
            text:
              "That report has no outcome column (Status, Delivery Status, Opened, Clicked…). " +
              "If each outcome is its own file, pick “Zoho Campaigns” above and upload them one at a time.",
          });
          return;
        }
        if (!plan.totalLeads) {
          setZohoMsg({ ok: false, text: "That report had no readable rows." });
          return;
        }
        // Flatten groups into {email,status,at} and send in one request.
        const rows: { email: string; status: string; at: string | null }[] = [];
        for (const k of ZOHO_REPORT_KINDS) {
          for (const r of plan.byKind[k]) rows.push({ email: r.email, status: k, at: r.at });
        }
        if (!rows.length) {
          const unknownNote = plan.unknown
            ? ` ${plan.unknown} row${plan.unknown === 1 ? " was" : "s were"} in a status we did not understand.`
            : "";
          setZohoMsg({ ok: false, text: "No usable rows in that report." + unknownNote });
          return;
        }
        const d = await sendZoho({ kind: "crm_status", rows });
        if (!d.ok) {
          setZohoMsg({ ok: false, text: d.message ?? "Could not load that report." });
          return;
        }
        const missing = d.notFoundCount ?? 0;
        const unknownNote = plan.unknown ? `, ${plan.unknown} unknown status` : "";
        const dupNote = plan.duplicates ? `, ${plan.duplicates} duplicate addresses skipped` : "";
        setZohoMsg({
          ok: true,
          text:
            `CRM report: ${plan.totalLeads} leads read` +
            dupNote +
            unknownNote +
            (missing ? `, ${missing} not on this campaign's list (${(d.notFound ?? []).slice(0, 3).join(", ")}${missing > 3 ? "…" : ""})` : "") +
            `. Saved ${d.matched} outcomes.`,
        });
        await load();
        return;
      }

      // Per-outcome (Zoho Campaigns legacy) shape.
      const rep = planZohoReport(t);
      if (rep.noEmailColumn) {
        setZohoMsg({ ok: false, text: "Could not find an e-mail column in that report." });
        return;
      }
      if (!rep.rows.length) {
        setZohoMsg({ ok: false, text: "That report has no e-mail addresses in it." });
        return;
      }
      const d = await sendZoho({ kind, rows: rep.rows });
      if (!d.ok) {
        setZohoMsg({ ok: false, text: d.message ?? "Could not load that report." });
        return;
      }
      const missing = d.notFoundCount ?? 0;
      setZohoMsg({
        ok: true,
        text: `${ZOHO_KIND_LABELS[kind]}: ${d.matched} matched${missing ? `, ${missing} not on this campaign's list (${(d.notFound ?? []).slice(0, 3).join(", ")}${missing > 3 ? "…" : ""})` : ""}.`,
      });
      await load();
    } catch (e) {
      setZohoMsg({ ok: false, text: e instanceof Error ? e.message : "Could not read that file." });
    } finally {
      setZohoBusy(false);
    }
  }

  async function markAllSent() {
    setZohoBusy(true);
    setZohoMsg(null);
    const d = await sendZoho({ kind: "sent", all: true });
    setZohoMsg(d.ok ? { ok: true, text: `Marked ${d.matched} people as sent.` } : { ok: false, text: d.message ?? "Could not save that." });
    setZohoBusy(false);
    if (d.ok) await load();
  }

  if (me && me.role !== "owner") return <NotOwner />;

  if (migration) {
    return (
      <main className="min-h-screen bg-vpv-canvas px-5 py-10 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <Link href="/admin/channels/email" className="text-[13px] font-medium text-vpv-blue underline">← Email</Link>
          <Notice kind="warn">{migration}</Notice>
        </div>
      </main>
    );
  }
  if (error && !detail) {
    return (
      <main className="min-h-screen bg-vpv-canvas px-5 py-10 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <Link href="/admin/channels/email" className="text-[13px] font-medium text-vpv-blue underline">← Email</Link>
          <Notice kind="error">{error}</Notice>
        </div>
      </main>
    );
  }
  if (!detail || !meta) {
    return <main className="min-h-screen bg-vpv-canvas px-5 py-10 text-[14px] text-vpv-muted">Loading…</main>;
  }

  const c = meta.campaign;
  const cp = meta.coupon;
  const total = people.length;
  const zohoLoaded = people.some((p) => p.zoho.sent || p.emailOpened || p.zoho.bounced);
  const sentN = people.filter((p) => p.zoho.sent).length;
  const openedN = counts.all ? people.filter((p) => p.emailOpened).length : 0;
  const clickedN = people.filter((p) => p.clicked).length;
  const visitedN = counts.visited;
  const couponState = !cp
    ? null
    : !cp.active
      ? "Switched off"
      : cp.expiresAt && new Date(cp.expiresAt).getTime() < Date.now()
        ? "Ended"
        : cp.maxUses !== null && (cp.uses ?? 0) >= cp.maxUses
          ? "All used"
          : "Live";
  const couponPeople = cp?.maxUses ?? null;
  const field = "rounded-lg border border-vpv-line px-3 py-2 text-[14px]";

  return (
    <main className="min-h-screen bg-vpv-canvas px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-[1300px]">
        <Link href="/admin/channels/email" className="text-[13px] font-medium text-vpv-blue underline underline-offset-2">
          ← Email
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[28px] font-semibold tracking-tight">{c.name}</h1>
            <p className="mt-1 text-[13.5px] text-vpv-muted">
              {[
                c.zohoCampaignName && c.zohoCampaignName !== c.name ? `Zoho: ${c.zohoCampaignName}` : null,
                c.sentAt ? `sent ${formatIst(c.sentAt)} IST` : null,
                `${total.toLocaleString("en-IN")} people`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEmailOpen((v) => !v)}
              className="rounded-full border border-vpv-blue px-4 py-2 text-[13px] font-semibold text-vpv-blue hover:bg-white"
            >
              {emailOpen ? "Hide the e-mail" : "View the e-mail"}
            </button>
            <button
              type="button"
              onClick={() => {
                const people = meta.recipients.map((r) => ({ email: r.email, name: r.name ?? r.email, company: r.company, phone: r.phone, code: r.code }));
                const coupon = cp ? { code: cp.code, validUntil: cp.expiresAt ? new Date(cp.expiresAt) : null } : null;
                if (product === "crm") download(`${fileSlug(c.name)}-for-zoho-crm.csv`, zohoCrmLeadsCsv(people, coupon));
                else download(`${fileSlug(c.name)}-for-zoho-campaigns.csv`, zohoExportCsv(people, coupon));
              }}
              className="rounded-full bg-vpv-blue px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
              title={
                product === "crm"
                  ? "A CSV with the Zoho CRM Lead fields filled in. Import it into Leads."
                  : "A CSV of contacts, each with their own VPV Link. Import it into Zoho Campaigns."
              }
            >
              {product === "crm" ? "Download for Zoho CRM" : "Download for Zoho Campaigns"}
            </button>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="rounded-full border border-red-300 px-4 py-2 text-[13px] font-semibold text-red-700 hover:bg-red-50"
            >
              Delete campaign
            </button>
          </div>
        </div>
        {deleteOpen && (
          <DeleteCampaignDialog
            name={c.name}
            slug={c.slug}
            people={total}
            scanned={detail.stat.scannedCodes}
            paid={detail.stat.paid}
            onClose={() => setDeleteOpen(false)}
            onDeleted={() => router.push("/admin/channels/email")}
          />
        )}
        {error && <Notice kind="error">{error}</Notice>}
        {meta.truncated && <Notice kind="warn">This list is larger than one page can load; the numbers are a lower bound.</Notice>}

        {/* ── the e-mail itself ───────────────────────────────────────── */}
        {emailOpen && (
          <section className="mt-5 rounded-2xl border border-vpv-line bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[16px] font-semibold">The e-mail</h2>
              <button
                type="button"
                onClick={() => {
                  const t = emailTemplate({
                    couponCode: cp?.code ?? null,
                    discount: cp ? discountLabel(cp) : "",
                    validUntil: cp?.expiresAt ? new Date(cp.expiresAt) : null,
                    limit: cp?.maxUses ?? null,
                  });
                  setSubject(t.subject);
                  setBodyText(t.body);
                }}
                className="rounded-full border border-vpv-line px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 hover:bg-vpv-canvas"
              >
                Write a suggested e-mail
              </button>
            </div>
            <label className="mt-3 block">
              <span className="mb-1 block text-[12.5px] font-medium text-vpv-ink">Subject</span>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className={`${field} w-full`} />
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-[12.5px] font-medium text-vpv-ink">Text</span>
              <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={10} className={`${field} w-full font-mono text-[13px]`} />
            </label>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={async () => {
                  setEmailMsg(null);
                  if (await patch({ subject, bodyText })) setEmailMsg("Saved.");
                }}
                className="rounded-full bg-vpv-blue px-4 py-2 text-[13px] font-semibold text-white"
              >
                Save
              </button>
              {emailMsg && <span className="text-[13px] text-slate-600">{emailMsg}</span>}
            </div>
          </section>
        )}

        {/* ── the funnel ─────────────────────────────────────────────── */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <Stat label="Recipients" value={total.toLocaleString("en-IN")} sub={zohoLoaded ? `${sentN} sent (Zoho)` : "Zoho report not loaded"} />
          <Stat label="Opened e-mail" value={zohoLoaded ? String(openedN) : "—"} sub={zohoLoaded ? <Pct n={openedN} d={total} /> : "from Zoho"} tone={openedN ? "good" : undefined} />
          <Stat label="Clicked link" value={String(clickedN)} sub={<Pct n={clickedN} d={total} />} tone={clickedN ? "good" : undefined} />
          <Stat label="Website loaded" value={String(visitedN)} sub={clickedN > visitedN ? `${clickedN - visitedN} never loaded` : <Pct n={visitedN} d={total} />} tone={visitedN ? "good" : undefined} />
          <Stat label="Left details" value={String(counts.left_details)} sub="phone or e-mail" />
          <Stat label="Reached the bill" value={String(counts.reached_bill)} />
          <Stat label="Paid" value={String(counts.paid)} sub={detail.stat.revenueInr ? inr(detail.stat.revenueInr) : undefined} tone={counts.paid ? "good" : undefined} />
        </div>

        {/* ── hot / warm / cold ──────────────────────────────────────── */}
        <div className="mt-3 grid grid-cols-3 gap-3">
          {(["hot", "warm", "cold"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setSegment(t)}
              className={`rounded-xl border p-4 text-left transition ${segment === t ? "border-vpv-blue bg-white" : "border-vpv-line bg-white hover:border-vpv-blue/50"}`}
            >
              <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{TEMPERATURE_LABELS[t]}</div>
              <div className={`mt-1 text-[26px] font-semibold tabular-nums ${t === "hot" ? "text-red-600" : t === "warm" ? "text-amber-700" : "text-slate-600"}`}>{counts[t]}</div>
              <div className="text-[12px] text-vpv-muted">{SEGMENTS.find((s) => s.id === t)!.help}</div>
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {/* ── the coupon ───────────────────────────────────────────── */}
          <section className="rounded-2xl border border-vpv-line bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[16px] font-semibold">Shared coupon</h2>
              {couponState && (
                <span
                  className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${couponState === "Live" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                >
                  {couponState}
                </span>
              )}
            </div>
            {!cp ? (
              <p className="mt-3 text-[13.5px] text-vpv-muted">This campaign has no coupon.</p>
            ) : (
              <>
                <p className="mt-3 text-[13.5px]">
                  <span className="rounded bg-slate-100 px-2 py-1 font-mono text-[14px] font-semibold">{cp.code}</span>{" "}
                  <span className="text-slate-700">{discountLabel(cp)}</span>
                </p>
                <p className="mt-2 text-[13.5px] text-slate-700">
                  {cp.expiresAt ? (
                    <>
                      Ends <strong>{formatIst(cp.expiresAt)} IST</strong> · {timeLeft(cp.expiresAt)}
                    </>
                  ) : (
                    "No end date"
                  )}
                </p>
                <p className="mt-1 text-[13.5px] text-slate-700">
                  Used <strong>{cp.uses ?? "?"}</strong>
                  {couponPeople ? ` of ${couponPeople}` : " (no limit)"}
                </p>
                {couponPeople ? (
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full bg-vpv-blue" style={{ width: `${Math.min(100, ((cp.uses ?? 0) / couponPeople) * 100)}%` }} />
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-[12.5px] font-medium">Valid for (days from send time)</span>
                    <input value={days} onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" className={`${field} w-full tabular-nums`} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[12.5px] font-medium">Can be used by (people)</span>
                    <input value={maxUses} onChange={(e) => setMaxUses(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="no limit" className={`${field} w-full tabular-nums`} />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      setCouponMsg(null);
                      if (await patch({ couponDays: Number(days), couponMaxUses: maxUses === "" ? null : Number(maxUses) })) setCouponMsg("Saved.");
                    }}
                    className="rounded-full bg-vpv-blue px-4 py-2 text-[13px] font-semibold text-white"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setCouponMsg(null);
                      if (await patch({ sentAt: new Date().toISOString() })) setCouponMsg("The clock started now.");
                    }}
                    className="rounded-full border border-vpv-line px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-vpv-canvas"
                  >
                    Start the clock now
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setCouponMsg(null);
                      if (await patch({ couponActive: !cp.active })) setCouponMsg(cp.active ? "Switched off." : "Switched on.");
                    }}
                    className="rounded-full border border-vpv-line px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-vpv-canvas"
                  >
                    {cp.active ? "Switch off" : "Switch on"}
                  </button>
                  {couponMsg && <span className="text-[13px] text-slate-600">{couponMsg}</span>}
                </div>
                <p className="mt-3 text-[12px] leading-relaxed text-vpv-muted">
                  Each personal link applies this code automatically at checkout. Everyone gets the same discount and
                  the same end time.
                </p>
              </>
            )}
          </section>

          {/* ── Zoho ─────────────────────────────────────────────────── */}
          <section className="rounded-2xl border border-vpv-line bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[16px] font-semibold">{product === "crm" ? "What Zoho CRM says" : "What Zoho Campaigns says"}</h2>
              <button type="button" onClick={() => setHelpOpen((v) => !v)} className="text-[12.5px] font-medium text-vpv-blue underline">
                {helpOpen ? "Hide steps" : product === "crm" ? "How to use Zoho CRM with this" : "How to use Zoho Campaigns with this"}
              </button>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-vpv-muted">
              {product === "crm"
                ? "Zoho CRM tracks who was sent the mass e-mail and who opened or clicked it. Export the Mass Email Status report from Zoho CRM and upload it here; each lead\u2019s outcome is matched to its person on this campaign."
                : "Zoho Campaigns already tracks who was sent the e-mail, who opened it, who clicked, bounced or unsubscribed. Export those reports from the campaign in Zoho and upload them here; each address is matched to its person."}
            </p>
            {helpOpen && product === "campaigns" && (
              <ol className="mt-3 list-decimal space-y-2 rounded-xl bg-vpv-canvas p-4 pl-8 text-[12.5px] leading-relaxed text-slate-700">
                <li>
                  <strong>Add one contact field in Zoho Campaigns, once.</strong> In Zoho Campaigns open the contact
                  fields (Contacts &rarr; manage or custom fields; the menu name varies) and add a single-line text
                  field named <em>VPV Link</em>. A link here is about 30 characters; Zoho&rsquo;s plain text fields hold 50.
                  Add <em>VPV Code</em> too if you want it.
                </li>
                <li>
                  <strong>Download the contact file.</strong> Press <em>Download for Zoho Campaigns</em> above. Each
                  row has the person&rsquo;s own link in &ldquo;VPV Link&rdquo;.
                </li>
                <li>
                  <strong>Import it into a new mailing list.</strong> Contacts &rarr; Add Contacts &rarr; import a file.
                  Map Contact Email, First Name, Last Name, Company, Phone, and map &ldquo;VPV Link&rdquo; to the new
                  field. Use a fresh list for this campaign so only these people are sent it. A contact already in
                  Zoho keeps one VPV Link at a time: importing again replaces the old one.
                </li>
                <li>
                  <strong>Write the e-mail.</strong> Make the button&rsquo;s address the merge tag for VPV Link. Zoho
                  writes custom fields as <span className="font-mono">$[UD:TAGNAME]$</span> (your own tag name).
                  Zoho&rsquo;s help does not say this works inside a link address, so{" "}
                  <strong>send a test to yourself first and check the address bar shows myvpv.com/q/EM-&hellip;</strong>{" "}
                  after clicking. Do not send to the list until that works.
                </li>
                <li>
                  <strong>After sending</strong>, press &ldquo;Everyone was sent it&rdquo; (or upload Zoho&rsquo;s Sent
                  report). Later, from the campaign&rsquo;s reports in Zoho, export the Opened, Clicked, Bounced and
                  Unsubscribed lists and upload each one here (pick the matching report type). Upload again whenever
                  you like; repeats change nothing.
                </li>
              </ol>
            )}
            {helpOpen && product === "crm" && (
              <ol className="mt-3 list-decimal space-y-2 rounded-xl bg-vpv-canvas p-4 pl-8 text-[12.5px] leading-relaxed text-slate-700">
                <li>
                  <strong>This needs a paid Zoho CRM edition.</strong> The Free edition has no mass e-mail and cannot
                  create custom fields. Standard allows 250 mass e-mails a day.
                </li>
                <li>
                  <strong>Download the Lead-import file.</strong> Press <em>Download for Zoho CRM</em> above.
                  The columns match Zoho CRM&rsquo;s Lead fields: First Name, Last Name, Email, Company
                  (required by CRM; filled with &ldquo;Unknown&rdquo; when missing), Phone, Mobile, plus
                  the custom fields the next step adds.
                </li>
                <li>
                  <strong>Add the custom fields to Leads, once.</strong> In Zoho CRM, open{" "}
                  <em>Setup &rarr; Customization &rarr; Modules and Fields &rarr; Leads &rarr; Layout</em>, add a single-line text
                  field named <em>VPV Link</em> (and, if you like, <em>VPV Code</em>, <em>Coupon Code</em>).
                  Save.
                </li>
                <li>
                  <strong>Import the file into Leads.</strong> <em>Leads &rarr; Import &rarr; Import Leads</em>,
                  pick the file, and map &ldquo;VPV Link&rdquo; to the field you just added. Pick a
                  Lead Source value (we already fill &ldquo;VPV Email Campaign&rdquo;). Finish the import.
                </li>
                <li>
                  <strong>Write the mass e-mail.</strong> Select the leads and send a mass e-mail. Make the button&rsquo;s link{" "}
                  <span className="font-mono">${"{"}Leads.VPV_Link{"}"}</span>; Zoho substitutes the
                  per-lead value at send time. <strong>Send a test to yourself first</strong> and check
                  the address bar shows <span className="font-mono">myvpv.com/q/EM-&hellip;</span>{" "}
                  after clicking.
                </li>
                <li>
                  <strong>After it goes out, export the mass e-mail status report</strong> and upload it below.
                  One file covers Delivered / Opened / Clicked / Bounced / Opt-out. Uploading the same file twice
                  changes nothing.
                </li>
              </ol>
            )}

            {/* Which Zoho product: Campaigns (default) or CRM. */}
            <div className="mt-4 flex flex-wrap gap-1 text-[12.5px]">
              {(
                [
                  ["campaigns", "Zoho Campaigns", "One report per outcome (Opened, Clicked, Bounced…)"],
                  ["crm", "Zoho CRM", "One file with every outcome (needs a paid CRM edition)"],
                ] as const
              ).map(([id, label, tip]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setProduct(id)}
                  className={`rounded-full border px-3 py-1 font-medium ${
                    product === id
                      ? "border-vpv-blue bg-vpv-blue text-white"
                      : "border-vpv-line bg-white text-slate-700 hover:border-vpv-blue/60"
                  }`}
                  title={tip}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {reportShape === "per-kind" && (
                <select value={kind} onChange={(e) => setKind(e.target.value as ZohoReportKind)} className={field}>
                  {ZOHO_REPORT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {ZOHO_KIND_LABELS[k]} report
                    </option>
                  ))}
                </select>
              )}
              <input
                type="file"
                accept=".csv,.tsv,.txt,.xlsx"
                disabled={zohoBusy}
                onChange={(e) => {
                  void uploadReport(e.target.files?.[0]);
                  e.target.value = "";
                }}
                className="text-[13px] file:mr-3 file:rounded-full file:border-0 file:bg-vpv-blue file:px-4 file:py-2 file:text-[13px] file:font-semibold file:text-white"
              />
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={() => void markAllSent()}
                disabled={zohoBusy}
                className="rounded-full border border-vpv-line px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-vpv-canvas disabled:opacity-50"
                title="If you don't have a Sent report yet, this marks everyone on the list as sent, using the campaign's sent time."
              >
                Everyone was sent it
              </button>
            </div>
            {zohoMsg && <p className={`mt-3 text-[13px] ${zohoMsg.ok ? "text-emerald-700" : "text-red-700"}`}>{zohoMsg.text}</p>}
          </section>
        </div>

        {/* ── who to e-mail next ─────────────────────────────────────── */}
        <section className="mt-5 rounded-2xl border border-vpv-line bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-[16px] font-semibold">Everyone, and who to e-mail next</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {SEGMENTS.map((s) => (
              <button
                key={s.id}
                type="button"
                title={s.help}
                onClick={() => setSegment(s.id)}
                className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium ${
                  segment === s.id ? "border-vpv-blue bg-vpv-blue text-white" : "border-vpv-line bg-white text-slate-700 hover:border-vpv-blue/60"
                }`}
              >
                {s.label} <span className="tabular-nums opacity-80">{counts[s.id]}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-[13px] text-vpv-muted">{SEGMENTS.find((s) => s.id === segment)!.help}</p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, e-mail or company"
              className={`${field} w-full max-w-xs`}
            />
            <button
              type="button"
              onClick={() => {
                const list = followUpList(people, segment);
                download(`${fileSlug(c.name)}-${segment}.csv`, segmentCsv(list));
              }}
              disabled={!visible.length}
              className="rounded-full border border-vpv-blue px-4 py-2 text-[13px] font-semibold text-vpv-blue hover:bg-vpv-canvas disabled:opacity-40"
            >
              Download this list for Zoho ({followUpList(people, segment).length})
            </button>
            <span className="text-[12px] text-vpv-muted">People who bounced or opted out are left out of follow-up lists.</span>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-vpv-line">
            <table className="min-w-[980px] w-full text-left text-[13px]">
              <thead className="bg-vpv-canvas text-[11.5px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Person</th>
                  <th className="px-3 py-2.5 font-medium">E-mail (Zoho)</th>
                  <th className="px-3 py-2.5 font-medium">Clicked</th>
                  <th className="px-3 py-2.5 font-medium">Website</th>
                  <th className="px-3 py-2.5 font-medium">Time</th>
                  <th className="px-3 py-2.5 font-medium">Pages visited</th>
                  <th className="px-3 py-2.5 font-medium">Interest</th>
                  <th className="px-3 py-2.5 font-medium">Got as far as</th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, shown).map((p) => (
                  <tr key={p.code} className="border-t border-vpv-line align-top">
                    <td className="px-3 py-2.5">
                      <Link href={`/admin/marketing/folders/${slug}/people/${p.code}`} className="font-medium text-vpv-ink underline-offset-2 hover:text-vpv-blue hover:underline">
                        {p.name}
                      </Link>
                      <div className="text-[12px] text-vpv-muted">{p.email}</div>
                      {p.company && <div className="text-[12px] text-vpv-muted">{p.company}</div>}
                    </td>
                    <td className="px-3 py-2.5"><ZohoBadges z={p.zoho} /></td>
                    <td className="px-3 py-2.5">{p.clicked ? <span className="font-semibold text-emerald-700">Yes</span> : <span className="text-slate-400">—</span>}</td>
                    <td className="px-3 py-2.5">
                      {p.clicked ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full ${p.visited ? "bg-emerald-500" : "bg-red-500"}`} />
                          {p.visited ? "Loaded" : "Never loaded"}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{p.activeSeconds > 0 ? formatSeconds(p.activeSeconds) : <span className="text-slate-400">—</span>}</td>
                    <td className="max-w-[260px] px-3 py-2.5 text-[12.5px] text-slate-700">
                      {p.pages.length ? (
                        <>
                          {p.pages.slice(0, 4).join(", ")}
                          {p.pages.length > 4 && <span className="text-slate-400"> +{p.pages.length - 4} more</span>}
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <TempBadge p={p} />
                      {p.why[0] && <div className="mt-1 max-w-[220px] text-[11.5px] leading-snug text-vpv-muted">{p.why[0]}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-[12.5px]">{p.stageLabel || <span className="text-slate-400">—</span>}</td>
                  </tr>
                ))}
                {!visible.length && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-[13px] text-vpv-muted">
                      Nobody in this list yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {visible.length > shown && (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE_SIZE)}
              className="mt-3 rounded-full border border-vpv-line px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-vpv-canvas"
            >
              Show {Math.min(PAGE_SIZE, visible.length - shown)} more of {visible.length - shown}
            </button>
          )}
          <p className="mt-3 text-[12px] text-vpv-muted">
            Link format: <span className="font-mono">{personalLink("EM-XXXXXX")}</span>. Time and pages need the visitor to
            accept cookies.
          </p>
        </section>
      </div>
    </main>
  );
}
