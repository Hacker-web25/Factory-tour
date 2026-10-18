/**
 * Step 1 of the funnel — who the visitor is, and where the factory is.
 *
 * The city is the reason this step exists first. Travel is priced per city
 * (lib/logistics.ts), so there is no honest way to show a total before we
 * know it — which is also why this screen leads with the quote and not with
 * "fill this in to continue". A visitor hands over a phone number for a
 * price they get to keep; they abandon a form that is plainly a toll gate.
 *
 * Everything collected here is mirrored to funnel_leads so a rep can ring
 * back someone who stops later in the flow. Being contacted is its own
 * separate, unticked consent: under the DPDP Act consent has to be
 * specific and freely given, not bundled into the thing you came for.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Car, MapPin, Plane, ShieldCheck, TrainFront, UserRound } from "lucide-react";
import {
  Card,
  Field,
  FunnelBody,
  FunnelHeader,
  PrimaryButton,
  SectionTitle,
  SelectInput,
  TextInput,
} from "@/components/funnel/FunnelShell";
import { INDUSTRY_OPTIONS, OTHER_INDUSTRY } from "@/lib/industries";
import { citiesByState, findCity, logisticsFor } from "@/lib/logistics";
import { COMPANY } from "@/lib/company";
import { loadFunnel, mirrorLead, saveFunnel, type FunnelState } from "@/lib/funnel";

const CITY_OTHER = "__other__";

type Errors = Partial<Record<
  "name" | "phone" | "email" | "company" | "industry" | "city",
  string
>>;

export default function Step1Info() {
  const router = useRouter();
  const [s, setS] = useState<FunnelState | null>(null);
  const [cityChoice, setCityChoice] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  // localStorage is only readable after mount, so the first paint is a
  // skeleton rather than a form that visibly changes under the visitor.
  useEffect(() => {
    const loaded = loadFunnel();
    setS(loaded);
    if (loaded.factoryCity) {
      setCityChoice(findCity(loaded.factoryCity) ? loaded.factoryCity : CITY_OTHER);
    }
  }, []);

  const states = useMemo(() => citiesByState(), []);

  function set<K extends keyof FunnelState>(key: K, value: FunnelState[K]) {
    setS((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  const typedCity = cityChoice === CITY_OTHER;
  const resolvedCity = typedCity ? (s?.factoryCity ?? "") : cityChoice;
  const quote = resolvedCity.trim() ? logisticsFor(resolvedCity) : null;

  function validate(state: FunnelState): Errors {
    const e: Errors = {};
    if (state.name.trim().length < 2) e.name = "Please tell us your name.";
    if (!/^[6-9]\d{9}$/.test(state.phone.replace(/\D/g, "").slice(-10))) {
      e.phone = "A 10-digit Indian mobile number.";
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(state.email.trim())) {
      e.email = "We send your quote here, so it needs to be right.";
    }
    if (state.company.trim().length < 2) e.company = "Your company's name.";
    if (!state.industry) e.industry = "Pick the closest match.";
    else if (state.industry === OTHER_INDUSTRY && state.industryOther.trim().length < 2) {
      e.industry = "Tell us what you make.";
    }
    if (!resolvedCity.trim()) e.city = "Your travel cost depends on this.";
    return e;
  }

  async function onSubmit() {
    if (!s) return;
    const withCity: FunnelState = { ...s, factoryCity: resolvedCity.trim() };
    const e = validate(withCity);
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setBusy(true);
    const matched = findCity(withCity.factoryCity);
    const saved = saveFunnel({
      ...withCity,
      factoryState: matched?.state ?? withCity.factoryState,
    });
    await mirrorLead("info", saved);
    router.push("/assessment/scope");
  }

  if (!s) {
    return (
      <>
        <FunnelHeader step={0} title="Let's build your quote" />
        <FunnelBody>
          <Card>
            <div className="h-5 w-40 animate-pulse rounded bg-vpv-tint" />
            <div className="mt-5 h-11 animate-pulse rounded-xl bg-vpv-canvas" />
            <div className="mt-4 h-11 animate-pulse rounded-xl bg-vpv-canvas" />
          </Card>
        </FunnelBody>
      </>
    );
  }

  return (
    <>
      <FunnelHeader
        step={0}
       
        title="Let's build your quote"
        summary="A few details about you, and where your plant is. The city matters most: our crew travels to you, so it decides what travel costs, and we can't show you a real total without it."
        image="owner-tablet"
        imageAlt="A factory owner smiling with a tablet on his shop floor"
        caption="Takes about two minutes"
      />
      <FunnelBody>
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            void onSubmit();
          }}
          noValidate
        >
          <Card>
            <SectionTitle icon={UserRound} title="About you">
              Who we prepare the quote for, and where we send it.
            </SectionTitle>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label="Your name" required error={errors.name}>
                <TextInput
                  value={s.name}
                  onChange={(e) => set("name", e.target.value)}
                  autoComplete="name"
                  placeholder="Rajesh Kumar"
                />
              </Field>
              <Field label="Company name" required error={errors.company}>
                <TextInput
                  value={s.company}
                  onChange={(e) => set("company", e.target.value)}
                  autoComplete="organization"
                  placeholder="Kesaria Rubber Industries Pvt. Ltd."
                />
              </Field>
              <Field label="Mobile number" required error={errors.phone} hint="So we can confirm the shoot date with you.">
                <TextInput
                  value={s.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="98xxxxxxxx"
                />
              </Field>
              <Field label="Work e-mail" required error={errors.email} hint="Your quote, invoice and workspace details go here.">
                <TextInput
                  value={s.email}
                  onChange={(e) => set("email", e.target.value)}
                  type="email"
                  autoComplete="email"
                  placeholder="rajesh@company.com"
                />
              </Field>
            </div>

            <div className="mt-4">
              <Field
                label="What does your factory make?"
                required
                error={errors.industry}
                hint="It tells us what your buyers will want to look at."
              >
                <SelectInput
                  value={s.industry}
                  onChange={(e) => set("industry", e.target.value)}
                >
                  <option value="">Select your industry…</option>
                  {INDUSTRY_OPTIONS.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              {s.industry === OTHER_INDUSTRY && (
                <div className="mt-3">
                  <TextInput
                    value={s.industryOther}
                    onChange={(e) => set("industryOther", e.target.value)}
                    placeholder="Tell us what you manufacture"
                    aria-label="Your industry"
                  />
                </div>
              )}
            </div>
          </Card>

          <Card className="mt-5">
            <SectionTitle icon={MapPin} title="Where is your factory?">
              Our crew travels from Gurgaon. This sets your travel and logistics
              charge, which you will see on the bill before you pay anything.
            </SectionTitle>

            <div className="mt-5">
              <Field label="City or industrial hub" required error={errors.city}>
                <SelectInput
                  value={cityChoice}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCityChoice(v);
                    set("factoryCity", v === CITY_OTHER ? "" : v);
                  }}
                >
                  <option value="">Select your city…</option>
                  {states.map((g) => (
                    <optgroup key={g.state} label={g.state}>
                      {g.cities.map((c) => (
                        <option key={c.city} value={c.city}>
                          {c.city}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  <option value={CITY_OTHER}>My city is not on this list</option>
                </SelectInput>
              </Field>

              {typedCity && (
                <div className="mt-3">
                  <TextInput
                    value={s.factoryCity}
                    onChange={(e) => set("factoryCity", e.target.value)}
                    placeholder="Type your city"
                    aria-label="Your city"
                  />
                </div>
              )}
            </div>

            {quote && (
              <div className="mt-5 rounded-xl border border-vpv-line bg-vpv-canvas p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2.5 text-[13.5px] font-medium text-vpv-ink">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-vpv-blue shadow-sm">
                      {quote.tier === 5 ? (
                        <Plane className="h-4 w-4" aria-hidden />
                      ) : quote.tier === 3 ? (
                        <TrainFront className="h-4 w-4" aria-hidden />
                      ) : (
                        <Car className="h-4 w-4" aria-hidden />
                      )}
                    </span>
                    Travel &amp; logistics: {quote.spec.label}
                  </span>
                  <span className="text-[17px] font-semibold tabular-nums text-vpv-ink">
                    ₹{quote.amountInr.toLocaleString("en-IN")}
                    <span className="ml-1 text-[12px] font-normal text-slate-500">+ GST</span>
                  </span>
                </div>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-600">{quote.spec.mode}</p>
                {quote.spec.clientArranges.length > 0 && (
                  <div className="mt-3 border-t border-vpv-line pt-3">
                    <p className="text-[12.5px] font-semibold text-vpv-ink">
                      Arranged and paid by you, not on our bill:
                    </p>
                    <ul className="mt-1.5 space-y-1 text-[12.5px] leading-relaxed text-slate-600">
                      {quote.spec.clientArranges.map((c) => (
                        <li key={c}>• {c}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {quote.needsConfirmation && (
                  <p className="mt-3 border-t border-vpv-line pt-3 text-[12.5px] leading-relaxed text-amber-700">
                    We have not priced this city yet. The figure above is our
                    standard air-travel charge, and a member of our team will
                    confirm your exact travel arrangement before the shoot.
                  </p>
                )}
              </div>
            )}
          </Card>

          <Card className="mt-5">
            <SectionTitle icon={ShieldCheck} title="How we use this" />
            <p className="mt-4 text-[13.5px] leading-relaxed text-slate-600">
              We use your name, company, e-mail, mobile, industry and factory
              city to prepare this quote, to confirm the shoot with you and to
              raise your GST invoice if you buy. You can ask us to show,
              correct or delete what we hold, or withdraw your consent, at any
              time by writing to{" "}
              <a href={`mailto:${COMPANY.emails.support}`} className="font-medium text-vpv-blue underline underline-offset-2">
                {COMPANY.emails.support}
              </a>
              . Our{" "}
              <a href="/privacy" className="font-medium text-vpv-blue underline underline-offset-2">
                Privacy Policy
              </a>{" "}
              sets out the detail.
            </p>

            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-vpv-line p-3.5 transition-colors hover:border-vpv-blue/40">
              <input
                type="checkbox"
                checked={s.marketingConsent}
                onChange={(e) => set("marketingConsent", e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-vpv-blue"
              />
              <span className="text-[13.5px] leading-relaxed text-slate-700">
                You may call or e-mail me about this quote and about VPV.{" "}
                <span className="text-slate-500">
                  Optional — leave it unticked and you will still get your quote
                  on screen and by e-mail.
                </span>
              </span>
            </label>
          </Card>

          <div className="mt-7">
            <PrimaryButton type="submit" busy={busy}>
              Continue
            </PrimaryButton>
            <p className="mt-3 text-[12.5px] text-slate-500">
              Nothing is charged at any point in these questions.
            </p>
          </div>
        </form>
      </FunnelBody>
    </>
  );
}
