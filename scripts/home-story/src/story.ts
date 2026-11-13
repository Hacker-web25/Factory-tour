/**
 * Home page scroll story.
 *
 * The live 360° demo stays pinned on the right (on phones, at the top) while
 * the left side moves through five parts as the visitor scrolls:
 *
 *   1  You are already investing in exhibitions and meeting buyers.
 *   2  Converting only 3% of your leads?   (a small calculator)
 *   3  Want to show your factory to international clients?
 *   4  Don't want to share your factory with your competition?
 *   5  How VPV helps: one answer to each of 2–4, then the call to action.
 *
 * Mounted by the loader in lib/site/home.ts into <div id="home-story">,
 * which the site bundle renders in place of the old home sections. If this
 * script fails, the plain hero in #home-classic shows instead.
 */
import { calcFigures, metaFromInputs, type CalcInputs } from "@/lib/whyVpvCalc";
import { inr, inrLakhs } from "@/lib/pricing";
import { track } from "@/lib/analytics/client";
import CSS from "./story.css";

const CONV = 3; // the conversion part 2 asks about
const VALUES = [1, 5, 10, 25]; // lakh

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
};
const svg = (d: string, s = 20) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

/** Wraps each word so headings can rise in word by word. */
const words = (t: string) => t.split(" ").map((w, i) => `<span class="hs-w"><span style="--i:${i}">${w}</span></span>`).join(" ");

const PARTS = [
  { id: "exhibitions", label: "Exhibitions", weight: 1.1 },
  { id: "conversion", label: "Conversion", weight: 1.5 },
  { id: "international", label: "International buyers", weight: 1.1 },
  { id: "privacy", label: "Privacy", weight: 1.1 },
  { id: "helps", label: "How VPV helps", weight: 1.5 },
];

const TOASTS = [
  "",
  `<i class="hs-dot hs-dot--loss"></i><span>At ${CONV}%, 97 of every 100 buyers buy elsewhere</span>`,
  `${svg(icon.globe, 16)}<span>One link. Any buyer, any country.</span>`,
  "",
  `<i class="hs-dot hs-dot--live"></i><span>Live · your whole sales team</span>`,
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
  sec.style.setProperty("--hs-parts", String(PARTS.reduce((a, p) => a + p.weight, 0)));
  sec.innerHTML = `
  <div class="hs-pin">
    <div class="hs-glow" aria-hidden="true"></div>
    <div class="hs-grid">
      <div class="hs-stage">
        <article class="hs-part" data-i="0" data-testid="home-section-hero">
          <p class="hs-eyebrow">Real Factories. Real Confidence.</p>
          <h1 class="hs-h1" data-testid="landing-heading">${words("You are already investing in exhibitions and meeting buyers.")}</h1>
          <p class="hs-lede hs-in" style="--d:5">Give those buyers a better way to understand your factory and build confidence in your capabilities.</p>
          <div class="hs-ctas hs-in" style="--d:7">
            <a class="hs-btn" href="/why-vpv" data-testid="hero-why-vpv">Why VPV? ${arrow}</a>
            <a class="hs-pill" href="/case-studies" data-testid="hero-case-study"><span class="hs-play" aria-hidden="true"></span><span><b>80%+ conversion with VPV</b><small>Anuj Anand's story · See here</small></span></a>
          </div>
          <p class="hs-cue hs-in" style="--d:9" aria-hidden="true"><span></span>Scroll</p>
        </article>

        <article class="hs-part" data-i="1">
          <h2 class="hs-h2">${words(`Converting only ${CONV}% of your leads?`)}</h2>
          <div class="hs-calc hs-in" style="--d:4">
            <label class="hs-row"><span>Qualified leads a year</span><b class="hs-leads-out">120</b></label>
            <input class="hs-range" type="range" min="10" max="1000" step="10" value="120" aria-label="Qualified leads a year">
            <p class="hs-row hs-row--chips"><span>Business per lead, a year</span></p>
            <div class="hs-chips" role="group" aria-label="Business per lead, a year">${VALUES.map((v) => `<button type="button" data-v="${v}" aria-pressed="${v === 10}">₹${v}L</button>`).join("")}</div>
            <div class="hs-loss" aria-live="polite">
              <p class="hs-loss-label">Going to your competitors, every year</p>
              <p class="hs-loss-num">₹0</p>
              <p class="hs-loss-sub">You win <b class="hs-won">₹0</b> of it. That is <b class="hs-day">₹0</b> lost every day.</p>
            </div>
          </div>
        </article>

        <article class="hs-part" data-i="2">
          <h2 class="hs-h2">${words("Want to show your factory to international clients?")}</h2>
          <p class="hs-body hs-in" style="--d:5">Walk an international buyer through your plant on Zoom, with no travel on either side. Send your VPV with your company profile, so they understand your capability before deciding on a physical audit.</p>
          <div class="hs-map hs-in" style="--d:7" aria-hidden="true">
            <svg viewBox="0 0 440 150">
              <path class="hs-arc" style="--k:0" d="M300 104 Q255 40 190 58"/>
              <path class="hs-arc" style="--k:1" d="M300 104 Q230 20 120 44"/>
              <path class="hs-arc" style="--k:2" d="M300 104 Q190 10 64 66"/>
              <path class="hs-arc" style="--k:3" d="M300 104 Q360 50 392 92"/>
              <circle class="hs-home" cx="300" cy="104" r="7"/>
              <circle class="hs-city" style="--k:0" cx="190" cy="58" r="5"/><circle class="hs-city" style="--k:1" cx="120" cy="44" r="5"/>
              <circle class="hs-city" style="--k:2" cx="64" cy="66" r="5"/><circle class="hs-city" style="--k:3" cx="392" cy="92" r="5"/>
              <text class="hs-tl hs-tl--home" x="300" y="130">Your factory</text>
              <text class="hs-tl" style="--k:0" x="196" y="80">Dubai</text><text class="hs-tl" style="--k:1" x="120" y="30">Frankfurt</text>
              <text class="hs-tl" style="--k:2" x="64" y="52">Paris</text><text class="hs-tl" style="--k:3" x="392" y="78">Singapore</text>
            </svg>
          </div>
        </article>

        <article class="hs-part" data-i="3">
          <h2 class="hs-h2">${words("Don't want to share your factory with your competition?")}</h2>
          <p class="hs-body hs-in" style="--d:5">Decide exactly who gets in. Protect each link you send:</p>
          <ul class="hs-locks">
            ${[
              [icon.link, "One-time links", "A link opens once, for the buyer you sent it to."],
              [icon.timer, "Links that expire", "Give a link 24 hours, or a week."],
              [icon.device, "Device limits", "Decide how many devices a link works on."],
              [icon.key, "Password protection", "Only the buyer you gave it to can get in."],
            ].map(([ic, t, d], k) => `<li class="hs-lock hs-in" style="--d:${6 + k}"><span class="hs-ic">${svg(ic, 18)}</span><span><b>${t}</b><small>${d}</small></span><i class="hs-switch" style="--k:${k}"></i></li>`).join("")}
          </ul>
        </article>

        <article class="hs-part" data-i="4">
          <p class="hs-eyebrow">How VPV helps</p>
          <h2 class="hs-h2">${words("Buyers trust what they can see.")}</h2>
          <ol class="hs-answers">
            ${[
              [icon.eye, "More of your leads convert", "They see the machines, not slides. Every line, machine and quality check, in 360°, at the buyer's own pace."],
              [icon.globe, "Close international deals on a call", "Walk an international buyer through your plant on Zoom, with no travel on either side."],
              [icon.shield, "Only the buyers you choose get in", "One-time links, expiry, device limits and passwords keep your factory away from competitors."],
            ].map(([ic, t, d], k) => `<li class="hs-ans hs-in" style="--d:${4 + k * 2}"><span class="hs-ic hs-ic--grad">${svg(ic, 20)}</span><span><b>${t}</b><small>${d}</small></span></li>`).join("")}
          </ol>
          <div class="hs-ctas hs-in" style="--d:11">
            <a class="hs-btn" href="/assessment" data-testid="home-story-cta">Find the Right VPV for Your Factory ${arrow}</a>
            <a class="hs-link" href="/why-vpv">See everything VPV does ${arrow}</a>
          </div>
        </article>
      </div>

      <div class="hs-demo" data-testid="hero-experience">
        <div class="hs-frame">
          <iframe src="/experience" title="Live VPV: walk through a real factory in 360°" allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer; autoplay" allowfullscreen></iframe>
          <button type="button" class="hs-guard" aria-label="Explore the live factory tour"><span>Click to explore the live tour</span></button>
          <p class="hs-toast" aria-hidden="true"></p>
        </div>
      </div>
    </div>
    <div class="hs-steps" aria-hidden="true">${PARTS.map(() => "<i></i>").join("")}</div>
  </div>`;
  host.appendChild(sec);

  const $ = <T extends Element>(q: string) => sec.querySelector(q) as T;
  const parts = Array.from(sec.querySelectorAll<HTMLElement>(".hs-part"));
  const steps = Array.from(sec.querySelectorAll<HTMLElement>(".hs-steps i"));
  const toast = $<HTMLElement>(".hs-toast");
  const pin = $<HTMLElement>(".hs-pin");

  /* ---------- the calculator (part 2) ---------- */
  const range = $<HTMLInputElement>(".hs-range");
  const leadsOut = $<HTMLElement>(".hs-leads-out");
  const lossNum = $<HTMLElement>(".hs-loss-num");
  const lossBox = $<HTMLElement>(".hs-loss");
  const wonOut = $<HTMLElement>(".hs-won");
  const dayOut = $<HTMLElement>(".hs-day");
  const chips = Array.from(sec.querySelectorAll<HTMLButtonElement>(".hs-chips button"));
  const inputs: CalcInputs = { leads: 120, valueLakh: 10, conv: CONV, lift: 5 };
  let shown = 0, raf = 0, prevLost = 0, saveTimer = 0, touched = false;
  const countTo = (target: number) => {
    cancelAnimationFrame(raf);
    if (reduced) { shown = target; lossNum.textContent = inrLakhs(target); return; }
    const from = shown, t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - k, 3);
      shown = from + (target - from) * e; lossNum.textContent = inrLakhs(shown);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
  const recalc = () => {
    const f = calcFigures(inputs);
    leadsOut.textContent = inputs.leads.toLocaleString("en-IN");
    range.style.setProperty("--p", `${((inputs.leads - 10) / 990) * 100}%`);
    wonOut.textContent = inrLakhs(f.won);
    dayOut.textContent = inrLakhs(f.lost / 365);
    countTo(f.lost);
    if (f.lost > prevLost + 1 && prevLost > 0 && !reduced) { lossBox.classList.remove("hs-hit"); void lossBox.offsetWidth; lossBox.classList.add("hs-hit"); }
    prevLost = f.lost;
    chips.forEach((c) => c.setAttribute("aria-pressed", String(Number(c.dataset.v) === inputs.valueLakh)));
  };
  // Same event the Why VPV calculator sent, so the owner's calculator report,
  // journeys and interest scores keep working. Only after a real change.
  const save = (beacon = false) => {
    clearTimeout(saveTimer);
    if (!touched) return;
    touched = false;
    track("calculator_used", metaFromInputs(inputs, { field: "leads" }), { beacon, path: "/" });
  };
  const changed = () => { touched = true; clearTimeout(saveTimer); saveTimer = window.setTimeout(() => save(), 1500); recalc(); };
  range.addEventListener("input", () => { inputs.leads = Number(range.value); changed(); });
  chips.forEach((c) => c.addEventListener("click", () => { inputs.valueLakh = Number(c.dataset.v); changed(); }));
  const flush = () => save(true);
  addEventListener("pagehide", flush);

  /* ---------- the demo stays usable without trapping the scroll ---------- */
  // The tour takes wheel and touch input. A clear layer over it lets the page
  // scroll past; one click (or tap) hands the tour the mouse until it leaves.
  const frame = $<HTMLElement>(".hs-frame");
  const guard = $<HTMLButtonElement>(".hs-guard");
  const unlock = () => frame.classList.add("is-open");
  const lock = () => frame.classList.remove("is-open");
  guard.addEventListener("click", unlock);
  frame.addEventListener("mouseleave", lock);
  const outside = (e: Event) => { if (!frame.contains(e.target as Node)) lock(); };
  document.addEventListener("touchstart", outside, { passive: true });

  /* ---------- scroll → active part ---------- */
  const total = PARTS.reduce((a, p) => a + p.weight, 0);
  const bounds: number[] = []; PARTS.reduce((a, p) => { bounds.push(a / total); return a + p.weight; }, 0);
  const headerH = () => { const h = document.getElementById("vpv-site-header"); return h ? h.getBoundingClientRect().height : 0; };
  const progress = () => {
    const r = sec.getBoundingClientRect();
    const span = sec.offsetHeight - (innerHeight - headerH());
    return Math.min(1, Math.max(0, (headerH() - r.top) / Math.max(1, span)));
  };
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
    toast.classList.remove("show");
    if (TOASTS[i]) { toast.innerHTML = TOASTS[i]; void toast.offsetWidth; toast.classList.add("show"); }
    if (i === 1 && active !== 1) { shown = 0; recalc(); } // the loss counts up each time part 2 arrives
    active = i;
  };
  const onScroll = () => {
    pin.style.setProperty("--hs-top", headerH() + "px");
    const p = progress();
    let i = 0; while (i < bounds.length - 1 && p >= bounds[i + 1] - 0.0001) i++;
    setActive(i);
  };
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll);
  recalc();
  onScroll();

  /* ---------- teardown when the site leaves the page ---------- */
  const gone = new MutationObserver(() => { if (!host.isConnected) dispose(); });
  gone.observe(document.body, { childList: true, subtree: true });
  function dispose() {
    flush();
    gone.disconnect(); cancelAnimationFrame(raf); clearTimeout(saveTimer);
    removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll); removeEventListener("pagehide", flush);
    document.removeEventListener("touchstart", outside);
  }
  return dispose;
}
