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

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Car, Maximize2, MapPin, Sparkles, UserRound, X } from "lucide-react";
import {
  Card,
  ComingSoonCity,
  Field,
  FunnelBody,
  FunnelHeader,
  PrimaryButton,
  SectionTitle,
  SelectInput,
  TextInput,
  useOfferState,
} from "@/components/funnel/FunnelShell";
import { LAUNCH_OFFER, PLOT_BANDS, isPlotBand } from "@/lib/pricing";
import { matchIndustries, shortLabels } from "@/lib/industryProfiles";
import PreparingScreen, { preparingDurationMs } from "@/components/funnel/PreparingScreen";
import { SERVICE_AREAS, SERVICE_AREA_NOTE, findCity, isServiceCity, logisticsFor } from "@/lib/logistics";
import { loadFunnel, mirrorLead, saveFunnel, type FunnelState } from "@/lib/funnel";

const CITY_OTHER = "__other__";

type Errors = Partial<Record<
  "name" | "phone" | "email" | "company" | "industry" | "city" | "policies",
  string
>>;

export default function Step1Info() {
  const router = useRouter();
  const [s, setS] = useState<FunnelState | null>(null);
  const [cityChoice, setCityChoice] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);

  // localStorage is only readable after mount, so the first paint is a
  // skeleton rather than a form that visibly changes under the visitor.
  useEffect(() => {
    const loaded = loadFunnel();
    // A visitor from before the typed answer existed: start them from what
    // they picked in the old dropdown.
    if (!loaded.industryText && loaded.industry) {
      loaded.industryText = loaded.industry === "Other (please specify)" ? loaded.industryOther : loaded.industry;
    }
    setS(loaded);
    if (loaded.factoryCity) {
      setCityChoice(isServiceCity(loaded.factoryCity) ? findCity(loaded.factoryCity)!.city : CITY_OTHER);
    }
  }, []);


  function set<K extends keyof FunnelState>(key: K, value: FunnelState[K]) {
    setS((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  const industryMatch = matchIndustries(s?.industryText ?? "", s?.industryExcluded ?? []);
  const typedCity = cityChoice === CITY_OTHER;
  const resolvedCity = typedCity ? (s?.factoryCity ?? "") : cityChoice;
  const quote = resolvedCity.trim() ? logisticsFor(resolvedCity) : null;
  // Travel is free while the special offer is open (the server decides for real at payment).
  const offer = useOfferState();
  const travelFree = offer.open && LAUNCH_OFFER.active;

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
    if (state.industryText.trim().length < 2) e.industry = "Tell us in a word or two, for example \u201cauto parts\u201d.";
    if (!resolvedCity.trim()) e.city = "Your travel cost depends on this.";
    if (!state.policiesAccepted) e.policies = "Please agree to continue.";
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
    const ind = matchIndustries(withCity.industryText, withCity.industryExcluded);
    const saved = saveFunnel({
      ...withCity,
      industry: ind.matched ? ind.profiles.map((p) => p.label).join(", ") : withCity.industryText.trim(),
      // Being contacted about this enquiry is covered by the Privacy Policy
      // they have just agreed to, so the rep may call back.
      marketingConsent: true,
      factoryState: matched?.state ?? withCity.factoryState,
    });
    // The preparing screen and the lead save run side by side; we move on
    // when both are done.
    setPreparing(true);
    router.prefetch("/assessment/scope");
    await Promise.all([
      mirrorLead("info", saved),
      new Promise((r) => setTimeout(r, preparingDurationMs())),
    ]);
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
      {preparing && (
        <PreparingScreen
          industry={industryMatch.matched ? shortLabels(industryMatch.profiles) : ""}
          city={resolvedCity.trim()}
        />
      )}
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
                hint={
                  industryMatch.matched || s.industryText.trim().length >= 3
                    ? undefined
                    : "A word or two is enough. We use it to suggest what your buyers will want to see."
                }
              >
                <TextInput
                  value={s.industryText}
                  onChange={(e) => set("industryText", e.target.value)}
                  placeholder="e.g. cotton yarn, auto parts, tablets, plastic moulding"
                  autoComplete="off"
                  maxLength={160}
                />
              </Field>
              {industryMatch.matched && (
                <div className="mt-3 rounded-xl border border-[#E8C766] bg-[#FFFCF2] px-3.5 py-3">
                  <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-[#7A5600]">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    We&rsquo;ll tailor your VPV for
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {industryMatch.profiles.map((p) => (
                      <li
                        key={p.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-vpv-blue bg-white py-1 pl-3 pr-1.5 text-[13px] font-medium text-vpv-ink"
                      >
                        {p.label}
                        <button
                          type="button"
                          onClick={() => set("industryExcluded", [...s.industryExcluded, p.id])}
                          aria-label={`Not ${p.label}`}
                          className="flex h-5 w-5 items-center justify-center rounded-full text-slate-500 hover:bg-vpv-tint hover:text-vpv-ink"
                        >
                          <X className="h-3 w-3" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!industryMatch.matched && s.industryText.trim().length >= 3 && (
                <p className="mt-2 text-[12.5px] leading-relaxed text-slate-500">
                  We&rsquo;ll start you with the areas most factories show. Words like &ldquo;castings&rdquo;,
                  &ldquo;garments&rdquo; or &ldquo;tablets&rdquo; help us tailor it to your plant.
                  {s.industryExcluded.length > 0 && (
                    <>
                      {" "}
                      <button
                        type="button"
                        onClick={() => set("industryExcluded", [])}
                        className="font-medium text-vpv-blue underline underline-offset-2"
                      >
                        Undo removed suggestions
                      </button>
                    </>
                  )}
                </p>
              )}
            </div>
          </Card>

          <Card className="mt-5">
            <SectionTitle icon={MapPin} title="Where is your factory?">
              Our crew comes to your plant by cab from Gurugram, there and back
              the same day.
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
                  {SERVICE_AREAS.map((g) => (
                    <optgroup key={g.group} label={g.group}>
                      {g.cities.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  <option value={CITY_OTHER}>My city is not on this list, I&apos;ll type it</option>
                </SelectInput>
              </Field>

              {typedCity && (
                <div className="mt-3">
                  <TextInput
                    value={s.factoryCity}
                    onChange={(e) => set("factoryCity", e.target.value)}
                    placeholder="Type your city, e.g. Ludhiana"
                    aria-label="Your city"
                    autoFocus
                  />
                </div>
              )}
              <p className="mt-3 text-[12.5px] leading-relaxed text-slate-500">{SERVICE_AREA_NOTE}</p>
            </div>

            {quote && quote.inServiceArea && (
              <div className="mt-5 rounded-xl border border-vpv-line bg-vpv-canvas p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2.5 text-[13.5px] font-medium text-vpv-ink">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-vpv-blue shadow-sm">
                      <Car className="h-4 w-4" aria-hidden />
                    </span>
                    Cab travel to {quote.city}
                  </span>
                  {travelFree ? (
                    <span className="text-right" data-testid="travel-free">
                      <span className="mr-2 text-[13px] font-semibold tabular-nums text-slate-400 line-through">
                        ₹{quote.amountInr.toLocaleString("en-IN")}
                      </span>
                      <span className="text-[17px] font-bold tracking-[-0.01em] text-[#1F8A4C]">FREE</span>
                    </span>
                  ) : (
                    <span className="text-[17px] font-semibold tabular-nums text-vpv-ink">
                      ₹{quote.amountInr.toLocaleString("en-IN")}
                      <span className="ml-1 text-[12px] font-normal text-slate-500">+ GST</span>
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-600">
                  {travelFree ? `Free for our first ${LAUNCH_OFFER.limit} customers. ` : ""}
                  {quote.mode}
                </p>
              </div>
            )}
            {quote && !quote.inServiceArea && quote.city.trim().length >= 3 && (
              <ComingSoonCity city={quote.city} className="mt-5" />
            )}
          </Card>

          <Card className="mt-5">
            <SectionTitle icon={Maximize2} title="How big is your plant?">
              It helps us suggest the plan that fits, and plan the shoot.
            </SectionTitle>
            <div className="mt-5">
              <Field label="Plant size">
                <SelectInput
                  value={s.plotBand}
                  onChange={(e) => set("plotBand", isPlotBand(e.target.value) ? e.target.value : "")}
                  data-testid="plot-band"
                >
                  <option value="">Not sure yet</option>
                  {PLOT_BANDS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
          </Card>

          <label
            className={`mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border bg-white p-4 transition-colors ${
              errors.policies ? "border-red-300" : "border-vpv-line hover:border-vpv-blue/40"
            }`}
          >
            <input
              type="checkbox"
              checked={s.policiesAccepted}
              onChange={(e) => set("policiesAccepted", e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-vpv-blue"
            />
            <span className="text-[14px] leading-relaxed text-slate-700">
              I agree to the{" "}
              <a href="/terms" target="_blank" rel="noopener" className="font-medium text-vpv-blue underline underline-offset-2">
                Terms &amp; Conditions
              </a>
              ,{" "}
              <a href="/privacy" target="_blank" rel="noopener" className="font-medium text-vpv-blue underline underline-offset-2">
                Privacy Policy
              </a>{" "}
              and{" "}
              <a href="/legal" target="_blank" rel="noopener" className="font-medium text-vpv-blue underline underline-offset-2">
                other VPV policies
              </a>
              .
              {errors.policies && (
                <span role="alert" className="mt-1 block text-[12.5px] font-medium text-red-600">
                  {errors.policies}
                </span>
              )}
            </span>
          </label>

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
