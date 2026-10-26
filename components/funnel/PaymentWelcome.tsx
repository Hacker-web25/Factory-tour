"use client";

/**
 * /assessment/welcome — where a buyer lands the moment Razorpay says "paid".
 *
 * Three jobs, in this order:
 *
 *   1. CERTAINTY. The VPV mark turns into a gold tick only once OUR server
 *      has the payment (it polls /api/billing/status, which also heals a
 *      payment whose webhook is late). Until then it says, honestly, that it
 *      is confirming with the bank. A failed or refunded order never shows a
 *      tick.
 *   2. PRIDE. A big purchase deserves a moment: the words around the tick
 *      say what they just bought into — a plant any buyer can now walk.
 *   3. ONE QUESTION. "How do you plan to use it?" Pick at least one; there is
 *      no skip. The answer goes to /api/billing/usage and shapes how VPV is
 *      positioned. The next steps and the workspace link come after it.
 *
 * The workspace, the welcome e-mail and the invoice never depend on the
 * answer: they are created by the payment itself. This page only decides
 * what the buyer sees next.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bookmark,
  Camera,
  Check,
  Eye,
  Globe,
  Handshake,
  Mail,
  PenLine,
  Phone,
  Presentation,
  QrCode,
  Rocket,
  ShieldCheck,
  Truck,
  type LucideIcon,
} from "lucide-react";
import GoldTick from "@/components/funnel/GoldTick";
import { loadFunnel, mirrorLead, saveFunnel, type FunnelState } from "@/lib/funnel";
import { SITE_PLANS } from "@/lib/pricing";
import { COMPANY, POLICY } from "@/lib/company";
import { OTHER_MAX, USAGE_OPTIONS, type UsageId } from "@/lib/purchaseUsage";

type Status = "checking" | "paid" | "pending" | "failed" | "refunded" | "missing";
type ServerStatus = "ready" | "processing" | "review" | "awaiting_payment" | "failed" | "refunded" | "unknown";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PENDING_KEY = "vpv:pending-payment";
/** How long we wait for the bank before saying "still waiting" (ms). */
const PAYMENT_WAIT_MS = 3 * 60 * 1000;
/** How long we keep polling a paid order for the workspace link (ms). */
const SETUP_WAIT_MS = 5 * 60 * 1000;
/** The VPV mark is shown at least this long, so the tick never just blinks in. */
const MIN_INTRO_MS = 1100;

const OPTION_ICON: Record<UsageId, LucideIcon> = {
  exhibitions: Presentation,
  followup: Mail,
  distributors: Truck,
  qr: QrCode,
  oem: Handshake,
  website: Globe,
  other: PenLine,
};

const answeredKey = (orderId: string) => `vpv.usage.answered.${orderId}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLocal(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode: the answer is still saved on the server */
  }
}

export default function PaymentWelcome() {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [funnel, setFunnel] = useState<FunnelState | null>(null);
  const [status, setStatus] = useState<Status>("checking");
  const [server, setServer] = useState<ServerStatus | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [invoiceNo, setInvoiceNo] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [answered, setAnswered] = useState(false);

  /* ── Which order, and who bought it. ─────────────────────────────── */
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("order") ?? "";
    const f = loadFunnel();
    setFunnel(f);
    if (!UUID.test(id)) {
      setStatus("missing");
      return;
    }
    setOrderId(id);
    if (readLocal(answeredKey(id))) setAnswered(true);
  }, []);

  /* ── Ask our server until it has the payment (and then the workspace). ── */
  useEffect(() => {
    if (!orderId) return;
    let alive = true;
    const started = Date.now();
    let paidAt = 0;
    let mirrored = false;

    (async () => {
      for (let i = 0; alive; i++) {
        let s: ServerStatus = "unknown";
        try {
          const res = await fetch(`/api/billing/status?orderId=${encodeURIComponent(orderId)}`, { cache: "no-store" });
          const d = (await res.json()) as { ok?: boolean; status?: ServerStatus; slug?: string | null; invoiceNo?: string | null };
          if (res.ok && d.ok && d.status) {
            s = d.status;
            if (d.slug) setSlug(d.slug);
            if (d.invoiceNo) setInvoiceNo(d.invoiceNo);
          } else if (res.status === 429) {
            await sleep(8000);
            continue;
          }
        } catch {
          /* a dropped request is not an answer — ask again */
        }
        if (!alive) return;
        setServer(s);

        if (s === "ready" || s === "processing" || s === "review") {
          if (!paidAt) {
            paidAt = Date.now();
            // Let the VPV mark be seen before it turns into the tick.
            const wait = MIN_INTRO_MS - (Date.now() - started);
            if (wait > 0) await sleep(wait);
            if (!alive) return;
            setStatus("paid");
            try {
              sessionStorage.removeItem(PENDING_KEY);
            } catch {
              /* ignore */
            }
            if (!mirrored) {
              mirrored = true;
              const f = loadFunnel();
              if (f.leadId) void mirrorLead("paid", f);
            }
          }
          // Ready, or a person is finishing it: nothing more to wait for.
          if (s === "ready" || s === "review") return;
          if (Date.now() - paidAt > SETUP_WAIT_MS) return;
        } else if (s === "failed") {
          setStatus("failed");
          return;
        } else if (s === "refunded") {
          setStatus("refunded");
          return;
        } else if (Date.now() - started > PAYMENT_WAIT_MS) {
          // Still no payment on our side. Keep the page honest, and keep
          // checking slowly in case it lands.
          setStatus((cur) => (cur === "checking" ? "pending" : cur));
        }
        await sleep(paidAt ? 4000 : Math.min(5000, 1500 + i * 300));
      }
    })();
    return () => {
      alive = false;
    };
  }, [orderId]);

  const onTickDone = useCallback(() => setRevealed(true), []);

  const plan = funnel?.chosenPlan ? SITE_PLANS[funnel.chosenPlan] : null;
  const firstName = (funnel?.name ?? "").trim().split(/\s+/)[0] ?? "";
  const testPayment = invoiceNo?.startsWith("TEST") ?? false;

  return (
    <main className="bg-vpv-canvas">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#071630] text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(42% 60% at 50% 30%, rgba(233,185,73,0.16), rgba(7,22,48,0) 70%), radial-gradient(70% 90% at 100% 0%, rgba(20,104,216,0.32), rgba(7,22,48,0) 60%), radial-gradient(60% 80% at 0% 100%, rgba(17,210,245,0.12), rgba(7,22,48,0) 60%)",
          }}
        />
        <div className="relative mx-auto flex max-w-4xl flex-col items-center px-5 pb-28 pt-14 text-center sm:pt-20">
          {status === "failed" || status === "refunded" || status === "missing" ? (
            <ProblemCard status={status} />
          ) : (
            <>
              <div className="scale-[0.8] sm:scale-100">
                <GoldTick state={status === "paid" ? "done" : "waiting"} size={232} onComplete={onTickDone} />
              </div>

              {status !== "paid" && (
                <div className="mt-8 max-w-md" aria-live="polite">
                  <p className="text-[18px] font-semibold tracking-tight">
                    {status === "pending" ? "Still waiting for your bank" : "Confirming your payment…"}
                  </p>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-white/70">
                    {status === "pending" ? (
                      <>
                        Your bank has not confirmed it to us yet. If money has left your account it is safe —
                        <strong className="font-semibold text-white"> please do not pay again</strong>. We will e-mail you
                        the moment it lands, or write to{" "}
                        <a className="underline underline-offset-2" href={`mailto:${COMPANY.emails.support}`}>
                          {COMPANY.emails.support}
                        </a>
                        .
                      </>
                    ) : (
                      "This takes a few seconds. Please keep this page open."
                    )}
                  </p>
                </div>
              )}

              {status === "paid" && (
                <div className={`vpv-reveal mt-6 max-w-2xl ${revealed ? "is-on" : ""}`}>
                  <p className="vpv-r1 inline-flex items-center gap-2 rounded-full border border-[#E9B949]/40 bg-[#E9B949]/10 px-3.5 py-1 text-[12.5px] font-semibold uppercase tracking-[0.14em] text-[#F3CF72]">
                    Payment received
                  </p>
                  <h1 className="vpv-r2 mt-5 text-balance text-[34px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[48px]">
                    Your plant is now open to the world.
                  </h1>
                  <p className="vpv-r3 mx-auto mt-5 max-w-xl text-pretty text-[16.5px] leading-relaxed text-white/75 sm:text-[18px]">
                    {firstName ? `${firstName}, every` : "Every"} buyer who can&rsquo;t fly in can now walk the shop
                    floor{funnel?.company ? ` at ${funnel.company}` : ""} — at your booth, in their inbox, across the
                    table in a meeting.
                  </p>
                  {testPayment && (
                    <p className="vpv-r3 mt-4 text-[13px] text-amber-200">This was a test payment. No real money moved.</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {status === "paid" && (
        <div className={`vpv-reveal relative mx-auto -mt-16 max-w-4xl px-5 pb-20 ${revealed ? "is-on" : ""}`}>
          {/* ── Receipt ── */}
          <div className="vpv-r3 grid gap-px overflow-hidden rounded-2xl border border-vpv-line bg-vpv-line shadow-[0_24px_60px_-30px_rgba(7,22,48,0.45)] sm:grid-cols-3">
            <ReceiptCell label="Your plan" value={plan?.name ?? "VPV"} sub={funnel?.company || undefined} />
            <ReceiptCell
              label="GST invoice"
              value={invoiceNo ?? "Being prepared"}
              sub={funnel?.email ? `Sent to ${funnel.email}` : "Sent to your e-mail"}
            />
            <ReceiptCell
              label="Your shoot"
              value={funnel?.factoryCity ? `${funnel.factoryCity} plant` : "At your plant"}
              sub={`We call within ${POLICY.shootContactBusinessDays} working days`}
            />
          </div>

          {/* ── Why this was a good decision ── */}
          <div className="vpv-r4 mt-10 text-center">
            <p className="mx-auto max-w-2xl text-balance text-[20px] font-medium leading-snug tracking-[-0.01em] text-vpv-ink sm:text-[24px]">
              &ldquo;The supplier a buyer can see is the supplier a buyer remembers.&rdquo;
            </p>
            <p className="mt-2 text-[13px] text-slate-500">You just became that supplier.</p>
          </div>
          <div className="vpv-r4 mt-8 grid gap-4 sm:grid-cols-3">
            <Pillar icon={Eye} title="Seen first">
              Buyers shortlist the factories they can see. Now they can see yours.
            </Pillar>
            <Pillar icon={Bookmark} title="Remembered longer">
              An exhibition ends after three days. Your plant visit keeps working after it.
            </Pillar>
            <Pillar icon={ShieldCheck} title="Trusted sooner">
              Nothing builds confidence like walking the floor. Now every buyer can.
            </Pillar>
          </div>

          {/* ── The question, then what happens next ── */}
          <div className="vpv-r5 mt-12">
            {orderId && !answered ? (
              <UsageQuestion
                orderId={orderId}
                onDone={() => {
                  writeLocal(answeredKey(orderId), "1");
                  setAnswered(true);
                }}
              />
            ) : (
              <NextSteps
                email={funnel?.email ?? ""}
                phone={funnel?.phone ?? ""}
                city={funnel?.factoryCity ?? ""}
                slug={slug}
                review={server === "review"}
                stillSettingUp={server === "processing"}
              />
            )}
          </div>
        </div>
      )}

      <style>{`
        .vpv-reveal .vpv-r1, .vpv-reveal .vpv-r2, .vpv-reveal .vpv-r3, .vpv-reveal .vpv-r4, .vpv-reveal .vpv-r5 {
          opacity: 0; transform: translateY(14px);
          transition: opacity .7s cubic-bezier(.2,.7,.2,1), transform .7s cubic-bezier(.2,.7,.2,1);
        }
        .vpv-reveal.is-on .vpv-r1, .vpv-reveal.is-on .vpv-r2, .vpv-reveal.is-on .vpv-r3,
        .vpv-reveal.is-on .vpv-r4, .vpv-reveal.is-on .vpv-r5 { opacity: 1; transform: none; }
        .vpv-reveal.is-on .vpv-r2 { transition-delay: .08s; }
        .vpv-reveal.is-on .vpv-r3 { transition-delay: .18s; }
        .vpv-reveal.is-on .vpv-r4 { transition-delay: .3s; }
        .vpv-reveal.is-on .vpv-r5 { transition-delay: .42s; }
        @media (prefers-reduced-motion: reduce) {
          .vpv-reveal .vpv-r1, .vpv-reveal .vpv-r2, .vpv-reveal .vpv-r3, .vpv-reveal .vpv-r4, .vpv-reveal .vpv-r5 {
            transition: none; transform: none;
          }
        }
      `}</style>
    </main>
  );
}

/* ───────────────────────────── pieces ───────────────────────────── */

function ReceiptCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-1 truncate text-[16px] font-semibold text-vpv-ink" title={value}>
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 truncate text-[12.5px] text-slate-500" title={sub}>
          {sub}
        </p>
      )}
    </div>
  );
}

function Pillar({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-vpv-line bg-white p-5">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#FBF3DC] text-[#A8701A]">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <p className="mt-3 text-[16px] font-semibold text-vpv-ink">{title}</p>
      <p className="mt-1 text-[14px] leading-relaxed text-slate-600">{children}</p>
    </div>
  );
}

function UsageQuestion({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const [picked, setPicked] = useState<UsageId[]>([]);
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const otherRef = useRef<HTMLTextAreaElement>(null);

  const wantsOther = picked.includes("other");
  const canSend = picked.length > 0 && (!wantsOther || other.trim().length >= 3) && !busy;

  function toggle(id: UsageId) {
    setError(null);
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
    if (id === "other" && !picked.includes("other")) setTimeout(() => otherRef.current?.focus(), 60);
  }

  async function send() {
    if (!canSend) return;
    setBusy(true);
    setError(null);
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const res = await fetch("/api/billing/usage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, uses: picked, other: wantsOther ? other : "" }),
        });
        const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
        if (res.ok && d.ok) {
          onDone();
          return;
        }
        // The payment is confirmed on screen but a moment behind in the
        // table: wait and send again rather than bothering the buyer.
        if (res.status === 409 && d.error === "not_paid") {
          await sleep(2500);
          continue;
        }
        setError(d.message ?? "We could not save that. Please try again.");
        setBusy(false);
        return;
      } catch {
        if (attempt === 5) break;
        await sleep(1500);
      }
    }
    setError("We could not reach our server. Please check your connection and try again.");
    setBusy(false);
  }

  return (
    <section
      className="rounded-3xl border border-vpv-line bg-white p-5 shadow-[0_24px_60px_-34px_rgba(7,22,48,0.35)] sm:p-8"
      aria-labelledby="usage-q"
      data-testid="usage-question"
    >
      <p className="text-[12.5px] font-semibold uppercase tracking-[0.14em] text-vpv-blue">One question before we begin</p>
      <h2 id="usage-q" className="mt-2 text-[24px] font-semibold leading-tight tracking-[-0.01em] text-vpv-ink sm:text-[28px]">
        How do you plan to use your virtual plant visit?
      </h2>
      <p className="mt-2 text-[14.5px] leading-relaxed text-slate-600">
        Choose all that apply. It helps us plan your shoot around how you will use it.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2" role="group" aria-label="How you plan to use it">
        {USAGE_OPTIONS.map((o) => {
          const on = picked.includes(o.id);
          const Icon = OPTION_ICON[o.id];
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(o.id)}
              data-usage={o.id}
              className={[
                "group flex items-start gap-3.5 rounded-2xl border p-4 text-left transition-[border-color,background-color,box-shadow] duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vpv-blue/40 focus-visible:ring-offset-2",
                on
                  ? "border-vpv-blue bg-[#F2F7FF] shadow-[0_10px_24px_-16px_rgba(20,104,216,0.7)]"
                  : "border-vpv-line bg-white hover:border-vpv-blue/40 hover:bg-[#FAFCFF]",
                o.id === "other" ? "sm:col-span-2" : "",
              ].join(" ")}
            >
              <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors ${
                  on ? "bg-vpv-blue text-white" : "bg-vpv-tint text-vpv-blue"
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold leading-snug text-vpv-ink">{o.title}</span>
                <span className="mt-0.5 block text-[13px] leading-relaxed text-slate-500">{o.detail}</span>
              </span>
              <span
                aria-hidden
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors ${
                  on ? "border-vpv-blue bg-vpv-blue text-white" : "border-slate-300 bg-white text-transparent"
                }`}
              >
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
            </button>
          );
        })}
      </div>

      {wantsOther && (
        <label className="mt-4 block">
          <span className="text-[13px] font-medium text-slate-600">How will you use it?</span>
          <textarea
            ref={otherRef}
            value={other}
            onChange={(e) => setOther(e.target.value.slice(0, OTHER_MAX))}
            rows={3}
            placeholder="For example: to show new hires around before their first day"
            className="mt-1.5 w-full resize-y rounded-xl border border-vpv-line bg-white px-3.5 py-3 text-[15px] text-vpv-ink placeholder:text-slate-400 focus:border-vpv-blue focus:outline-none focus:ring-2 focus:ring-vpv-blue/20"
            data-testid="usage-other"
          />
        </label>
      )}

      {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-[14px] text-red-700">{error}</p>}

      <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => void send()}
          disabled={!canSend}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-vpv-grad px-7 py-3.5 text-[15px] font-semibold text-white shadow-[0_14px_30px_-12px_rgba(20,104,216,0.7)] transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none sm:w-auto sm:min-w-[14rem]"
          data-testid="usage-submit"
        >
          {busy ? "Saving…" : (
            <>
              Continue <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </button>
        <p className="text-[12.5px] text-slate-500">
          {picked.length === 0
            ? "Choose at least one to continue."
            : wantsOther && other.trim().length < 3
              ? "Tell us in a few words, then continue."
              : `${picked.length} chosen`}
        </p>
      </div>
    </section>
  );
}

function NextSteps({
  email,
  phone,
  city,
  slug,
  review,
  stillSettingUp,
}: {
  email: string;
  phone: string;
  city: string;
  slug: string | null;
  review: boolean;
  stillSettingUp: boolean;
}) {
  const steps: { icon: LucideIcon; title: string; body: React.ReactNode }[] = [
    {
      icon: Mail,
      title: "Check your inbox",
      body: review ? (
        <>
          We are finishing your set-up by hand. Your login and GST invoice reach {email ? <strong>{email}</strong> : "you"} within{" "}
          {POLICY.provisioningHours} hours.
        </>
      ) : (
        <>
          Your welcome e-mail with your login, and your GST invoice, {stillSettingUp ? "will arrive in a few minutes at" : "are on their way to"}{" "}
          {email ? <strong className="font-semibold text-vpv-ink">{email}</strong> : "your e-mail"}.
        </>
      ),
    },
    {
      icon: Phone,
      title: `We call you within ${POLICY.shootContactBusinessDays} working days`,
      body: (
        <>
          To agree a shoot date for your {city ? `${city} ` : ""}plant{phone ? <>, on <strong className="font-semibold text-vpv-ink">{phone}</strong></> : ""}.
        </>
      ),
    },
    {
      icon: Camera,
      title: "Shoot day",
      body: "Our crew captures your plant in a single visit.",
    },
    {
      icon: Rocket,
      title: "Your plant visit goes live",
      body: `In your workspace within ${POLICY.vpvDeliveryWorkingDays} working days of the shoot, ready to share with any buyer.`,
    },
  ];

  return (
    <section
      className="rounded-3xl border border-vpv-line bg-white p-5 shadow-[0_24px_60px_-34px_rgba(7,22,48,0.35)] sm:p-8"
      data-testid="next-steps"
    >
      <p className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#1F8A4C]">
        <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> Thank you — that helps us a lot.
      </p>
      <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.01em] text-vpv-ink sm:text-[28px]">What happens next</h2>

      <ol className="mt-6 space-y-0">
        {steps.map((s, i) => (
          <li key={s.title} className="relative flex gap-4 pb-6 last:pb-0">
            {i < steps.length - 1 && (
              <span aria-hidden className="absolute left-5 top-11 h-[calc(100%-2.75rem)] w-px bg-vpv-line" />
            )}
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-vpv-tint text-vpv-blue">
              <s.icon className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <div className="min-w-0 pt-1.5">
              <p className="text-[15.5px] font-semibold text-vpv-ink">{s.title}</p>
              <p className="mt-0.5 text-[14px] leading-relaxed text-slate-600">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-8 flex flex-col gap-3 border-t border-vpv-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        {slug ? (
          <a
            href={`https://${slug}.myvpv.com`}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-vpv-grad px-7 py-3.5 text-[15px] font-semibold text-white shadow-[0_14px_30px_-12px_rgba(20,104,216,0.7)] transition-opacity hover:opacity-95"
            data-testid="open-workspace"
          >
            Open your workspace <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        ) : (
          <p className="text-[14px] text-slate-600">Your workspace link is in your welcome e-mail.</p>
        )}
        <p className="text-[13px] text-slate-500">
          Questions?{" "}
          <a href={`mailto:${COMPANY.emails.support}`} className="font-medium text-vpv-blue underline underline-offset-2">
            {COMPANY.emails.support}
          </a>
        </p>
      </div>
    </section>
  );
}

function ProblemCard({ status }: { status: "failed" | "refunded" | "missing" }) {
  const text = {
    failed: {
      title: "This payment did not go through",
      body: "No money was taken. If your bank shows a debit, it is returned automatically. You can go back to your bill and try again.",
    },
    refunded: {
      title: "This payment was refunded",
      body: `The money is on its way back to the account you paid from. It usually takes ${POLICY.refundProcessing}.`,
    },
    missing: {
      title: "We could not find this order",
      body: "The link may be incomplete. If you have paid, your welcome e-mail and invoice will still reach you.",
    },
  }[status];

  return (
    <div className="mx-auto max-w-lg rounded-3xl border border-white/10 bg-white/5 p-7 text-left backdrop-blur-sm" data-testid="payment-problem">
      <h1 className="text-[24px] font-semibold tracking-tight">{text.title}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-white/75">{text.body}</p>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        {status === "failed" && (
          <Link
            href="/assessment/billing"
            onClick={() => saveFunnel({ paidOrderId: "" })}
            className="inline-flex rounded-full bg-white px-6 py-3 text-[14px] font-semibold text-[#071630]"
          >
            Back to your bill
          </Link>
        )}
        <a href={`mailto:${COMPANY.emails.support}`} className="text-[14px] font-medium text-white underline underline-offset-2">
          {COMPANY.emails.support}
        </a>
      </div>
    </div>
  );
}
