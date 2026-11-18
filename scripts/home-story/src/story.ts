/**
 * Home page scroll story.
 *
 * The live 360° demo stays pinned on the right (on phones, at the top) while
 * the left side moves through five parts as the visitor scrolls:
 *
 *   1  You are already investing in exhibitions and meeting buyers.
 *   2  What's the cost of not giving buyers enough confidence to buy from you?
 *      (a calculator: leads, value, conversion)
 *   3  Give international buyers the confidence to choose you.
 *   4  Show your factory only to buyers. Keep competitors out.
 *   5  How VPV helps: one answer to each of 2–4, then the call to action.
 *
 * Mounted by the loader in lib/site/home.ts into <div id="home-story">,
 * which the site bundle renders in place of the old home sections. If this
 * script fails, the plain hero in #home-classic shows instead.
 */
import { metaFromInputs, type CalcInputs } from "@/lib/whyVpvCalc";
import { track } from "@/lib/analytics/client";
import CSS from "./story.css";

const CONV = 3; // the conversion part 2 asks about, and the slider's start
const VALUES = [5, 10, 25, 50, 100, 500]; // lakh
const valueLabel = (v: number) => (v >= 100 ? `₹${v / 100}CR` : `₹${v}L`);
const LEADS = { min: 100, max: 5_000, step: 50, start: 1_000 }; // over 5 years
const VALUE_START = 100; // lakh: ₹1 crore per lead to begin with
const CONVS = { min: 1, max: 50 };
/** Save the calculator once the sliders have rested this long. */
const SAVE_AFTER_MS = 1500;
/** ₹5.03 Crore, ₹48.50 Lakh — two decimals, Indian grouping. */
const money = (inrAmount: number) => {
  const f = (v: number) => {
    const d = v >= 1000 ? 0 : 2; // ₹7,275 Crore, not ₹7,275.00 Crore
    return v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  if (inrAmount >= 1_00_00_000) return `₹${f(inrAmount / 1_00_00_000)} Crore`;
  return `₹${f(inrAmount / 1_00_000)} Lakh`;
};

const arrow = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const check = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
const icon = {
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
  device: '<rect x="2" y="4" width="14" height="10" rx="1.5"/><path d="M6 18h6"/><rect x="17" y="8" width="5" height="12" rx="1"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  chart: '<path d="M3 21h18"/><rect x="5" y="12" width="3" height="6" rx="1"/><rect x="10.5" y="8" width="3" height="10" rx="1"/><rect x="16" y="4" width="3" height="14" rx="1"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
};
const svg = (d: string, s = 20) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

/** Wraps each word so headings can rise in word by word. */
const words = (t: string, from = 0) => t.split(" ").map((w, i) => `<span class="hs-w"><span style="--i:${from + i}">${w}</span></span>`).join(" ");

const PARTS = [
  { id: "exhibitions", label: "Exhibitions", weight: 1.1 },
  { id: "conversion", label: "Conversion", weight: 1.5 },
  { id: "international", label: "International buyers", weight: 1.1 },
  { id: "privacy", label: "Privacy", weight: 1.1 },
  { id: "helps", label: "How VPV helps", weight: 1.5 },
];

let styled = false;

export function mount(host: HTMLElement): () => void {
  if (!styled) {
    const s = document.createElement("style");
    s.id = "hs-style";
    s.textContent = CSS;
    document.head.appendChild(s);
    styled = true;
  }
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const sec = document.createElement("section");
  sec.className = "hs";
  sec.setAttribute("data-testid", "home-story");
  sec.innerHTML = `
  <div class="hs-pin">
    ${["base", "conversion", "international", "privacy"].map((g) => `<div class="hs-glow hs-glow--${g}" aria-hidden="true"></div>`).join("")}
    <div class="hs-grid">
      <div class="hs-stage">
        <article class="hs-part" data-i="0" data-testid="home-story-hero">
          <p class="hs-eyebrow">Real Factories. Real Confidence.</p>
          <h1 class="hs-h1 hs-h1--hero" data-testid="landing-heading">${words("You spend lakhs meeting global buyers in exhibitions.")}<span class="hs-red">${words("How much business are you losing", 8)} <span class="hs-mark">${words("after they leave?", 14)}<svg class="hs-scribble" viewBox="0 0 300 18" preserveAspectRatio="none" aria-hidden="true"><path d="M3 12 C 60 5, 140 4, 297 9"/></svg></span></span></h1>
          <p class="hs-lede hs-in" style="--d:14">Meeting a buyer is just the beginning. <strong>You need to give them enough proof, confidence and reasons to choose you</strong>, even after the exhibition is over.</p>
          <div class="hs-ctas hs-in" style="--d:16">
            <a class="hs-btn" href="/why-vpv" data-testid="home-story-why-vpv">Why VPV? ${arrow}</a>
            <a class="hs-pill" href="/case-studies" data-testid="home-story-case-study"><span class="hs-play" aria-hidden="true"></span><span><b>80%+ conversion with VPV</b><small>Anuj Anand's story · See here</small></span></a>
          </div>
          <p class="hs-cue hs-in" style="--d:18" aria-hidden="true"><span></span>Scroll</p>
        </article>

        <article class="hs-part" data-i="1">
          <h2 class="hs-h2 hs-h2--calc">${words("What's the cost of not giving buyers enough confidence to buy from you?")}</h2>
          <div class="hs-calc hs-in" style="--d:4">
            <div class="hs-cq">
              <div class="hs-cq-head"><label class="hs-cq-t" for="hs-leads">Total Qualified Leads in 5 Years</label><input id="hs-leads-num" class="hs-val hs-leads-in" type="text" inputmode="numeric" autocomplete="off" maxlength="7" value="0" aria-label="Total qualified leads in 5 years: type a number from ${LEADS.min} to ${LEADS.max}"></div>
              <input id="hs-leads" class="hs-range hs-range--leads" type="range" min="${LEADS.min}" max="${LEADS.max}" step="${LEADS.step}" value="${LEADS.start}">
              <p class="hs-ends"><span>${LEADS.min.toLocaleString("en-IN")}</span><span>${LEADS.max.toLocaleString("en-IN")}</span></p>
            </div>
            <div class="hs-cq">
              <p class="hs-cq-t" id="hs-value-t">Average Potential Business Per Lead Year</p>
              <div class="hs-chips" role="group" aria-labelledby="hs-value-t">${VALUES.map((v) => `<button type="button" data-v="${v}" aria-pressed="${v === VALUE_START}">${valueLabel(v)}</button>`).join("")}<button type="button" class="hs-chip-custom" aria-pressed="false" aria-expanded="false" aria-controls="hs-custom-box">Custom</button></div>
              <div class="hs-custom" id="hs-custom-box" hidden>
                <label class="hs-custom-field"><span aria-hidden="true">₹</span><input id="hs-custom" type="text" inputmode="decimal" autocomplete="off" placeholder="Type an amount" aria-label="Your own business per lead, a year"></label>
                <select class="hs-custom-unit" aria-label="Unit"><option value="1">Lakh</option><option value="100" selected>Crore</option></select>
              </div>
            </div>
            <div class="hs-cq">
              <div class="hs-cq-head"><label class="hs-cq-t" for="hs-conv">Your current conversion ratio?<small>What % of leads turn into business?</small></label><output class="hs-val hs-conv-out" for="hs-conv">${CONV}%</output></div>
              <div class="hs-conv-row"><span>${CONVS.min}%</span><input id="hs-conv" class="hs-range hs-range--conv" type="range" min="${CONVS.min}" max="${CONVS.max}" step="1" value="${CONV}"><span>${CONVS.max}%</span></div>
            </div>
            <div class="hs-res" aria-live="polite">
              <div class="hs-res-row"><p>Business you win<small class="hs-won-sub">(at ${CONV}% conversion)</small></p><b class="hs-won">₹0</b></div>
              <div class="hs-res-row hs-loss"><p>Business going to competition<small class="hs-lost-sub">(remaining ${100 - CONV}% leads)</small></p><b class="hs-loss-num">₹0</b></div>
            </div>
          </div>
        </article>

        <article class="hs-part" data-i="2">
          <h2 class="hs-h2">${words("Give international buyers the confidence to choose you.")}</h2>
          <p class="hs-body hs-in" style="--d:5">Walk an international buyer through your plant on Zoom, with no travel on either side. Send your VPV with your company profile, so they understand your capability before deciding on a physical audit.</p>
          <div class="hs-map hs-in" style="--d:7" aria-hidden="true">
            <svg viewBox="0 0 440 150">
              <path class="hs-arc" style="--k:0" d="M300 104 Q255 40 190 58"/>
              <path class="hs-arc" style="--k:1" d="M300 104 Q230 20 120 44"/>
              <path class="hs-arc" style="--k:2" d="M300 104 Q190 10 64 66"/>
              <path class="hs-arc" style="--k:3" d="M300 104 Q360 50 392 92"/>
              <path class="hs-arc" style="--k:4" d="M300 104 Q286 48 330 30"/>
              <path class="hs-arc" style="--k:5" d="M300 104 Q376 4 414 44"/>
              <circle class="hs-home" cx="300" cy="104" r="7"/>
              <circle class="hs-city" style="--k:0" cx="190" cy="58" r="5"/><circle class="hs-city" style="--k:1" cx="120" cy="44" r="5"/>
              <circle class="hs-city" style="--k:2" cx="64" cy="66" r="5"/><circle class="hs-city" style="--k:3" cx="392" cy="92" r="5"/>
              <circle class="hs-city" style="--k:4" cx="330" cy="30" r="5"/><circle class="hs-city" style="--k:5" cx="414" cy="44" r="5"/>
              <text class="hs-tl hs-tl--home" x="300" y="130">Your factory</text>
              <text class="hs-tl" style="--k:0" x="196" y="80">Dubai</text><text class="hs-tl" style="--k:1" x="120" y="30">Frankfurt</text>
              <text class="hs-tl" style="--k:2" x="64" y="52">Paris</text><text class="hs-tl" style="--k:3" x="392" y="78">Singapore</text>
              <text class="hs-tl" style="--k:4" x="330" y="16">Russia</text><text class="hs-tl" style="--k:5" x="414" y="30">USA</text>
            </svg>
          </div>
        </article>

        <article class="hs-part" data-i="3">
          <h2 class="hs-h2">${words("Show your factory only to buyers. Keep competitors out.")}</h2>
          <p class="hs-body hs-in" style="--d:5">Decide exactly who gets to see your factory.</p>
          <ul class="hs-locks">
            ${[
              [icon.link, "One-time view links"],
              [icon.timer, "Control link expiry time"],
              [icon.device, "Limit device access"],
              [icon.key, "Password protected link"],
            ].map(([ic, t], k) => `<li class="hs-lock hs-in" style="--d:${6 + k}"><span class="hs-ic">${svg(ic, 18)}</span><span><b>${t}</b></span><i class="hs-switch" style="--k:${k}"></i></li>`).join("")}
          </ul>
        </article>

        <article class="hs-part" data-i="4">
          <p class="hs-eyebrow">How VPV helps</p>
          <h2 class="hs-h2">${words("Buyers trust what they can see.")}</h2>
          <ol class="hs-answers">
            ${[
              [icon.zap, "Up to 70% Faster Deal Closures", "Buyers get all the key factory information they need, so decisions happen sooner."],
              [icon.chart, "Up to 50% Increased Conversion Ratio", "More of your exhibition and online leads turn into real business."],
              [icon.trophy, "Helps Differentiate from your competition", "Show real operations, scale and quality, something most competitors still don't."],
            ].map(([ic, t, d], k) => `<li class="hs-ans hs-in" style="--d:${4 + k * 2}"><span class="hs-ic hs-ic--grad">${svg(ic, 20)}</span><span><b>${t}</b><small>${d}</small></span></li>`).join("")}
          </ol>
          <div class="hs-ctas hs-in" style="--d:11">
            <a class="hs-btn" href="/plans" data-testid="home-story-cta">Find the Right VPV for Your Factory ${arrow}</a>
            <a class="hs-link" href="/why-vpv">See everything VPV does ${arrow}</a>
          </div>
        </article>
      </div>

      <div class="hs-demo" data-testid="home-story-demo">
        <div class="hs-frame">
          <iframe data-src="/experience" title="Live VPV: walk through a real factory in 360°" allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer; autoplay" allowfullscreen></iframe>
          <button type="button" class="hs-guard" aria-label="Click to explore the live factory tour"></button>
        </div>
        <p class="hs-hint">Drag to explore, click to experience</p>
      </div>
    </div>
    <div class="hs-steps" aria-hidden="true">${PARTS.map(() => "<i></i>").join("")}</div>
  </div>`;
  host.appendChild(sec);

  const $ = <T extends Element>(q: string) => sec.querySelector(q) as T;
  const parts = Array.from(sec.querySelectorAll<HTMLElement>(".hs-part"));
  const steps = Array.from(sec.querySelectorAll<HTMLElement>(".hs-steps i"));
  const pin = $<HTMLElement>(".hs-pin");

  /* ---------- the calculator (part 2) ---------- */
  const range = $<HTMLInputElement>(".hs-range--leads");
  const convRange = $<HTMLInputElement>(".hs-range--conv");
  const leadsIn = $<HTMLInputElement>(".hs-leads-in");
  const convOut = $<HTMLElement>(".hs-conv-out");
  const lossNum = $<HTMLElement>(".hs-loss-num");
  const lossBox = $<HTMLElement>(".hs-loss");
  const wonOut = $<HTMLElement>(".hs-won");
  const wonSub = $<HTMLElement>(".hs-won-sub");
  const lostSub = $<HTMLElement>(".hs-lost-sub");
  const chips = Array.from(sec.querySelectorAll<HTMLButtonElement>(".hs-chips button[data-v]"));
  const customChip = $<HTMLButtonElement>(".hs-chip-custom");
  const customBox = $<HTMLElement>(".hs-custom");
  const customInput = $<HTMLInputElement>("#hs-custom");
  const customUnit = $<HTMLSelectElement>(".hs-custom-unit");
  // Leads here are over five years; the stored event keeps the Why VPV
  // calculator's leads-a-year, so the owner's report reads the same.
  const calc = { leads: LEADS.start, valueLakh: VALUE_START, conv: CONV };
  let customOn = false;
  const inputs = (): CalcInputs => ({ leads: Math.max(1, Math.round(calc.leads / 5)), valueLakh: Math.min(10_000, Math.max(0.1, calc.valueLakh)), conv: calc.conv, lift: 5 });
  let lastField: "leads" | "valueLakh" | "conv" = "leads";
  let shown = 0, raf = 0, prevLost = 0, saveTimer = 0, touched = false;
  const countTo = (target: number) => {
    cancelAnimationFrame(raf);
    if (reduced) { shown = target; lossNum.textContent = money(target); return; }
    const from = shown, t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - k, 3);
      shown = from + (target - from) * e; lossNum.textContent = money(shown);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
  // Very large custom amounts: shrink the figure rather than spill out.
  const fit = (el: HTMLElement, text: string) => el.style.setProperty("--fit", text.length > 15 ? ".7" : text.length > 13 ? ".85" : "1");
  const fill = (el: HTMLInputElement, v: number, min: number, max: number) => el.style.setProperty("--p", `${((v - min) / (max - min)) * 100}%`);
  const recalc = () => {
    const opportunity = calc.leads * calc.valueLakh * 1_00_000;
    const won = (opportunity * calc.conv) / 100;
    const lost = opportunity - won;
    if (document.activeElement !== leadsIn) leadsIn.value = calc.leads.toLocaleString("en-IN"); // never rewrite the box while they type in it
    convOut.textContent = `${calc.conv}%`;
    fill(range, calc.leads, LEADS.min, LEADS.max);
    fill(convRange, calc.conv, CONVS.min, CONVS.max);
    wonOut.textContent = money(won);
    fit(wonOut, money(won));
    fit(lossNum, money(lost));
    wonSub.textContent = `(at ${calc.conv}% conversion)`;
    lostSub.textContent = `(remaining ${100 - calc.conv}% leads)`;
    countTo(lost);
    if (lost > prevLost + 1 && prevLost > 0 && !reduced) { lossBox.classList.remove("hs-hit"); void lossBox.offsetWidth; lossBox.classList.add("hs-hit"); }
    prevLost = lost;
    chips.forEach((c) => c.setAttribute("aria-pressed", String(!customOn && Number(c.dataset.v) === calc.valueLakh)));
    customChip.setAttribute("aria-pressed", String(customOn));
    customChip.setAttribute("aria-expanded", String(customOn));
    if (customBox.hidden === customOn) { customBox.hidden = !customOn; fitPart(); }
  };
  // Same event the Why VPV calculator sent, so the owner's calculator report,
  // journeys and interest scores keep working. Only after a real change.
  const save = (beacon = false) => {
    clearTimeout(saveTimer);
    if (!touched) return;
    touched = false;
    track("calculator_used", metaFromInputs(inputs(), { field: lastField }), { beacon, path: "/" });
  };
  const changed = () => { touched = true; clearTimeout(saveTimer); saveTimer = window.setTimeout(() => save(), SAVE_AFTER_MS); recalc(); };
  range.addEventListener("input", () => { calc.leads = Number(range.value); lastField = "leads"; changed(); });
  // The box beside the slider takes a typed number too. Once what is typed is
  // inside the slider's range the figures follow it; on Enter or leaving the
  // box it is tidied (commas) and held to the range, so 7000 becomes 5,000.
  const typedLeads = () => parseInt(leadsIn.value.replace(/\D/g, ""), 10);
  leadsIn.addEventListener("focus", () => leadsIn.select());
  leadsIn.addEventListener("input", () => {
    const digits = leadsIn.value.replace(/\D/g, "");
    if (digits !== leadsIn.value) leadsIn.value = digits;
    const n = parseInt(digits, 10);
    if (!(n >= LEADS.min && n <= LEADS.max)) return;
    calc.leads = n; range.value = String(n); lastField = "leads"; changed();
  });
  const settleLeads = () => {
    const n = typedLeads();
    const v = Number.isFinite(n) ? Math.min(LEADS.max, Math.max(LEADS.min, n)) : calc.leads;
    if (v !== calc.leads) { calc.leads = v; range.value = String(v); lastField = "leads"; changed(); }
    leadsIn.value = v.toLocaleString("en-IN");
  };
  leadsIn.addEventListener("blur", settleLeads);
  leadsIn.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); leadsIn.blur(); } });
  convRange.addEventListener("input", () => { calc.conv = Number(convRange.value); lastField = "conv"; changed(); });
  chips.forEach((c) => c.addEventListener("click", () => { customOn = false; calc.valueLakh = Number(c.dataset.v); lastField = "valueLakh"; changed(); }));
  // "Custom": their own amount per lead, in lakh or crore. Until they type
  // a usable number the figures stay on the last value.
  const applyCustom = () => {
    const n = parseFloat(customInput.value.replace(/[^0-9.]/g, ""));
    if (!(n > 0)) return;
    calc.valueLakh = n * Number(customUnit.value);
    lastField = "valueLakh";
    changed();
  };
  customChip.addEventListener("click", () => {
    customOn = true;
    recalc();
    customInput.focus();
    applyCustom();
  });
  customInput.addEventListener("input", applyCustom);
  customUnit.addEventListener("change", applyCustom);
  const flush = () => save(true);
  // Phones often skip pagehide when a tab is swiped away; hidden is the last
  // reliable moment to send.
  const onHidden = () => { if (document.visibilityState === "hidden") flush(); };
  addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", onHidden);

  /* ---------- the demo stays usable without trapping the scroll ---------- */
  // The tour takes wheel and touch input. A clear layer over it lets the page
  // scroll past; one click (or tap) hands the tour the mouse until it leaves.
  const frame = $<HTMLElement>(".hs-frame");
  const guard = $<HTMLButtonElement>(".hs-guard");
  const unlock = () => frame.classList.add("is-open");
  const lock = () => frame.classList.remove("is-open");
  guard.addEventListener("click", unlock);
  // A mouse that moves over the tour hands it the mouse straight away, so the
  // very first press can already drag. (A press on the clear layer could only
  // open the tour, never start the drag, so coming back to it took two goes.)
  // Not while the wheel is in use: a wheel over the tour keeps turning the
  // story's parts, and touch still opens it with a tap.
  let lastWheelAt = -1e4;
  guard.addEventListener("wheel", () => { lastWheelAt = performance.now(); }, { passive: true });
  guard.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || performance.now() - lastWheelAt < 900) return;
    if (Math.abs(e.movementX) + Math.abs(e.movementY) < 2) return;
    unlock();
  });
  frame.addEventListener("mouseleave", lock);
  const outside = (e: Event) => { if (!frame.contains(e.target as Node)) lock(); };
  document.addEventListener("touchstart", outside, { passive: true });

  /* ---------- load the live tour after the page itself ---------- */
  // The 360° tour pulls several MB of panoramas. Starting it only once the
  // page has loaded lets the text, buttons and fonts arrive first, and keeps
  // the browser's loading spinner from waiting on the tour.
  const iframe = $<HTMLIFrameElement>(".hs-frame iframe");
  const startTour = () => { if (!iframe.src) iframe.src = iframe.dataset.src || "/experience"; frame.classList.add("is-loading"); iframe.addEventListener("load", () => frame.classList.remove("is-loading"), { once: true }); };
  const idle = (f: () => void) => ("requestIdleCallback" in window ? (window as unknown as { requestIdleCallback: (cb: () => void, o: { timeout: number }) => void }).requestIdleCallback(f, { timeout: 1200 }) : setTimeout(f, 300));
  if (document.readyState === "complete") idle(startTour);
  else addEventListener("load", () => idle(startTour), { once: true });

  /* ---------- the tour changes scene as the story moves on ---------- */
  // Each part of the story shows its own scene. The tour page (/experience)
  // is on our own origin, so we simply tell it which part is showing; it
  // does the swapping (components/site/HeroExperience.tsx). It says "ready"
  // once it is listening, so a part reached before that is not lost.
  const sendScene = (i: number) => {
    try { iframe.contentWindow?.postMessage({ type: "vpv-hero-scene", index: i }, location.origin); } catch { /* the tour is not up yet */ }
  };
  const onTourMsg = (e: MessageEvent) => {
    if (e.origin !== location.origin || e.source !== iframe.contentWindow) return;
    if (e.data && e.data.type === "vpv-hero-ready") sendScene(Math.max(0, active));
  };
  addEventListener("message", onTourMsg);

  /* ---------- scroll → active part ---------- */
  // Each part sits at its own stop: part 0 when the story first pins, the
  // last part exactly where the pin lets go, about one screen apart.
  const N = PARTS.length;
  sec.style.setProperty("--hs-parts", String(N));
  const headerH = () => { const h = document.getElementById("vpv-site-header"); return h ? h.getBoundingClientRect().height : 0; };
  const span = () => Math.max(1, sec.offsetHeight - (innerHeight - headerH()));
  const progress = () => Math.min(1, Math.max(0, (headerH() - sec.getBoundingClientRect().top) / span()));
  const stopY = (i: number) => Math.round(sec.getBoundingClientRect().top + scrollY - headerH() + (i / (N - 1)) * span());
  const engaged = () => { const r = sec.getBoundingClientRect(); return r.top <= headerH() + 2 && r.bottom >= innerHeight - 2; };
  let active = -1;
  const setActive = (i: number) => {
    if (i === active) return;
    const dir = i > active ? "down" : "up";
    parts.forEach((p, k) => {
      p.classList.toggle("is-active", k === i);
      p.classList.toggle("is-past", k < i);
      p.setAttribute("aria-hidden", String(k !== i));
      (p as HTMLElement & { inert: boolean }).inert = k !== i;
    });
    sec.dataset.dir = dir;
    sec.dataset.part = PARTS[i].id;
    steps.forEach((s, k) => s.classList.toggle("on", k <= i));
    if (i === 1 && active !== 1) { shown = 0; recalc(); } // the loss counts up each time part 2 arrives
    active = i;
    sendScene(i);
  };
  // A part that comes out taller than its space (a small phone, or a phone
  // set to a larger text size) must not run under the progress bar or off
  // the screen. On phones the tour above first gives up height (down to a
  // quarter of the screen, the same height for every part so it does not
  // jump about); a part that still does not fit is scaled down, never
  // below 72%.
  const phone = matchMedia("(max-width: 1023px)");
  const overflow = (a: HTMLElement) => {
    const vis = Array.from(a.children as HTMLCollectionOf<HTMLElement>).filter((c) => getComputedStyle(c).display !== "none");
    const first = vis[0], last = vis[vis.length - 1];
    if (!first || !last) return { need: 0, room: 1, by: 0 };
    const cs = getComputedStyle(a), lf = getComputedStyle(first), ll = getComputedStyle(last);
    const need = last.offsetTop + last.offsetHeight + parseFloat(ll.marginBottom) - (first.offsetTop - parseFloat(lf.marginTop));
    const room = a.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 6;
    return { need, room, by: need - room };
  };
  const fitPart = () => {
    if (!host.isConnected) return;
    parts.forEach((a) => a.style.removeProperty("zoom"));
    frame.style.removeProperty("height");
    const by = Math.max(...parts.map((a) => overflow(a).by));
    if (by > 0 && phone.matches) {
      const h = frame.offsetHeight, min = Math.round(pin.clientHeight * 0.25);
      if (h > min) frame.style.height = `${Math.max(min, h - by - 2)}px`;
    }
    parts.forEach((a) => {
      const m = overflow(a);
      if (m.by > 0) a.style.setProperty("zoom", String(Math.max(0.72, Math.floor((m.room / m.need) * 100) / 100)));
    });
  };

  /* ---------- one scroll = one part, instantly ---------- */
  // The text changes the MOMENT the visitor scrolls; the page then glides
  // to that part's stop underneath it. Before Nov 2026 the text waited for
  // a slow-starting 0.72 s scroll to pass its midpoint and then for long
  // staggered fades: 2-3 s from a flick to the words, so people scrolled
  // again thinking nothing had happened.
  let animating = false, sraf = 0, settleT = 0, target = -1;
  const to = (y: number) => scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
  const animateTo = (y: number, dur: number, ease: (k: number) => number) => {
    cancelAnimationFrame(sraf);
    const y0 = scrollY, d = y - y0;
    if (reduced || Math.abs(d) < 2) { to(y); animating = false; target = -1; return; }
    animating = true;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      to(y0 + d * ease(k));
      if (k < 1) sraf = requestAnimationFrame(step); else { animating = false; target = -1; }
    };
    sraf = requestAnimationFrame(step);
  };
  // Fast at the start (the page answers at once), soft at the end.
  const outCubic = (k: number) => 1 - Math.pow(1 - k, 3);
  const outQuart = (k: number) => 1 - Math.pow(1 - k, 4);
  const go = (i: number) => {
    if (i < 0 || i >= N) return;
    target = i;
    setActive(i); // the words change now, not when the scroll arrives
    animateTo(stopY(i), 480, outCubic);
  };

  // Wheel and trackpad: one push = one part.
  // A trackpad keeps sending "momentum" events for a second or two after
  // the fingers leave. Those must not move more parts, but a NEW push
  // during that tail must: it shows up as the deltas suddenly growing
  // again instead of fading. (Before, the whole tail counted as the same
  // push, so a second swipe was swallowed.) A mouse wheel spun fast moves
  // one part; notches with a pause between them move one part each.
  let lastWheel = 0, lastFire = -1e9, armed = true, acc = 0, leaving = false;
  // Since the last move: the biggest delta (the push), whether the deltas
  // have since faded well below it (momentum), and the lowest since then.
  let peak = 0, faded = false, trough = Infinity;
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || !engaged()) return;
    if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
    // When the event HAPPENED, not when it is handled: a busy moment while
    // a part changes must not make one swipe look like two.
    const now = e.timeStamp;
    const gap = now - lastWheel;
    lastWheel = now;
    // Firefox can report lines or pages instead of pixels.
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
    const mag = Math.abs(dy);
    if (gap > 160) {
      armed = true; acc = 0; leaving = false;
    } else if (!armed) {
      if (!faded) {
        if (mag > peak) peak = mag;
        else if (mag < peak * 0.6) { faded = true; trough = mag; }
      } else if (mag < trough) {
        trough = mag;
      } else if (mag > 8 && mag > trough * 1.8 + 2 && now - lastFire > 200) {
        armed = true; acc = 0; // a new push during the momentum tail
      }
    }
    const dir = Math.sign(dy);
    if (!dir) return;
    const from = target >= 0 ? target : active;
    const next = from + dir;
    if (next < 0 || next >= N) {
      // Leaving the story (down from the last part, up from the first)
      // takes a fresh push once the page has come to rest on that part.
      if (armed && !animating && Math.abs(scrollY - stopY(active)) < 4) leaving = true;
      if (!leaving) e.preventDefault();
      return;
    }
    if (leaving) return;
    e.preventDefault();
    if (!armed) return;
    acc += dy;
    if (Math.abs(acc) >= 4) { armed = false; lastFire = now; acc = 0; peak = mag; faded = false; trough = Infinity; go(next); }
  };

  // Touch: the part changes as soon as the finger has moved 28 px, not
  // when it lifts. The page itself only scrolls when leaving the story.
  // The calculator's slider and chips keep their own touch handling.
  let tY = 0, tX = 0, tMode: "" | "story" | "native" = "", touching = false, tFired = false;
  const onTouchStart = (e: TouchEvent) => {
    touching = true; tMode = ""; tFired = false;
    tY = e.touches[0].clientY; tX = e.touches[0].clientX;
    if (!engaged() || (e.target as Element).closest?.(".hs-calc")) tMode = "native";
  };
  const onTouchMove = (e: TouchEvent) => {
    if (tMode === "native") return;
    const dy = tY - e.touches[0].clientY, dx = tX - e.touches[0].clientX;
    if (!tMode) {
      if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
      const next = active + Math.sign(dy);
      tMode = Math.abs(dx) > Math.abs(dy) || next < 0 || next >= N ? "native" : "story";
    }
    if (tMode !== "story") return;
    e.preventDefault();
    if (!tFired && Math.abs(dy) > 28) { tFired = true; go(active + Math.sign(dy)); }
  };
  const onTouchEnd = () => {
    touching = false;
    if (tMode === "story" && !tFired && !animating) animateTo(stopY(active), 260, outQuart);
    tMode = "";
  };

  // Keys: arrows, Page Up/Down and Space step through the parts too.
  const onKey = (e: KeyboardEvent) => {
    if (!engaged() || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target as HTMLElement;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName))) return;
    const dir = ["ArrowDown", "PageDown"].includes(e.key) || (e.key === " " && !e.shiftKey) ? 1 : ["ArrowUp", "PageUp"].includes(e.key) || (e.key === " " && e.shiftKey) ? -1 : 0;
    const next = (target >= 0 ? target : active) + dir;
    if (!dir || next < 0 || next >= N) return;
    e.preventDefault();
    go(next);
  };

  // Magnetic settle: wherever a scroll comes to rest inside the story
  // (scrollbar drag, Home/End, a resize), it eases onto the nearest part.
  const settle = () => {
    if (animating || touching || leaving || !engaged()) return;
    const i = Math.round(progress() * (N - 1));
    const y = stopY(i);
    if (Math.abs(scrollY - y) > 3) animateTo(y, 320, outQuart);
  };

  const onScroll = () => {
    pin.style.setProperty("--hs-top", headerH() + "px");
    // While gliding to a part, that part stays shown (no flicker back to
    // the one being left). Otherwise (scrollbar, keys, a resize) the part
    // follows the scroll position; changing as early as a third of the way.
    if (animating && target >= 0) return;
    const f = progress() * (N - 1);
    const i = active < 0 ? Math.round(f) : f > active ? (f - active > 0.33 ? Math.ceil(f - 0.33) : active) : (active - f > 0.33 ? Math.floor(f + 0.33) : active);
    setActive(Math.min(N - 1, Math.max(0, i)));
    clearTimeout(settleT);
    settleT = window.setTimeout(settle, 140);
  };
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll);
  addEventListener("resize", fitPart);
  addEventListener("wheel", onWheel, { passive: false });
  addEventListener("touchstart", onTouchStart, { passive: true });
  addEventListener("touchmove", onTouchMove, { passive: false });
  addEventListener("touchend", onTouchEnd, { passive: true });
  addEventListener("keydown", onKey);
  recalc();
  onScroll();
  fitPart();
  document.fonts?.ready.then(fitPart);

  /* ---------- teardown when the site leaves the page ---------- */
  const gone = new MutationObserver(() => { if (!host.isConnected) dispose(); });
  gone.observe(document.body, { childList: true, subtree: true });
  function dispose() {
    flush();
    gone.disconnect(); cancelAnimationFrame(raf); cancelAnimationFrame(sraf); clearTimeout(saveTimer); clearTimeout(settleT);
    removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll); removeEventListener("resize", fitPart); removeEventListener("pagehide", flush);
    removeEventListener("wheel", onWheel); removeEventListener("touchstart", onTouchStart); removeEventListener("touchmove", onTouchMove);
    removeEventListener("touchend", onTouchEnd); removeEventListener("keydown", onKey);
    document.removeEventListener("touchstart", outside);
    removeEventListener("message", onTourMsg);
    document.removeEventListener("visibilitychange", onHidden);
  }
  return dispose;
}
