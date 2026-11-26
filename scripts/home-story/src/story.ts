/**
 * Home page scroll story.
 *
 * Seven parts, one scroll each. The text sits on the left; on the right
 * (on phones, at the top) a picture, a small animation, a table or a video
 * changes with each part. Since 27 Nov 2026 the live 360° demo is NOT shown
 * here: the visitors who played with it for a minute left without reading
 * anything else. The demo is still one click away (the "Demo" link in the
 * header, /demo, and the link in part 6).
 *
 *   0  Problem  You meet hundreds of buyers at exhibitions ... yet conversion is low.
 *   1  Why      Lack of trust: videos, brochures and video calls do not build enough.
 *   2  Cost     How much is it costing you? The calculator, and four worked examples.
 *   3  Proof    Mr. Anuj Anand's story (autoplaying, muted until tapped), the logos, the case studies.
 *   4  Solution VPV: show your factory only to buyers, keep competitors out (the four link controls).
 *   5  How it works
 *   6  Order now in just 5 simple steps, and the button to the plans.
 *
 * Mounted by the loader in lib/site/home.ts into <div id="home-story">,
 * which the site bundle renders in place of the old home sections. If this
 * script fails, the plain hero in #home-classic shows instead.
 */
import { metaFromInputs, type CalcInputs } from "@/lib/whyVpvCalc";
import { track } from "@/lib/analytics/client";
import CSS from "./story.css";
import { CALC_CONVS, CALC_LEADS, CALC_VALUES, CASE_STUDIES_BUTTON, FACTORIES, ORDER_STEPS, PROOF, worked } from "./data";

const CONV = 3; // the conversion part 2 asks about, and the slider's start
const VALUES = CALC_VALUES;
const valueLabel = (v: number) => (v >= 100 ? `₹${v / 100}CR` : `₹${v}L`);
const LEADS = CALC_LEADS; // over 5 years
const VALUE_START = 100; // lakh: ₹1 crore per lead to begin with
const CONVS = CALC_CONVS;
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
/** The table's short form: ₹147 Cr, ₹6.5 Cr, ₹80 L. */
const short = (inrAmount: number) => {
  if (inrAmount >= 1_00_00_000) return `₹${(inrAmount / 1_00_00_000).toLocaleString("en-IN", { maximumFractionDigits: 1 })} Cr`;
  return `₹${(inrAmount / 1_00_000).toLocaleString("en-IN", { maximumFractionDigits: 1 })} L`;
};

const arrow = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const icon = {
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
  device: '<rect x="2" y="4" width="14" height="10" rx="1.5"/><path d="M6 18h6"/><rect x="17" y="8" width="5" height="12" rx="1"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.2c2 .7 3.5 2.6 3.5 5.8"/>',
  rupee: '<path d="M6 4h12M6 9h12M6 4c5 0 8 1.5 8 5s-3 5-8 5l9 6"/>',
  down: '<path d="M4 7l6 6 4-4 6 6"/><path d="M14 15h6v-6"/>',
  film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3V9Z"/>',
  brochure: '<path d="M4 5a2 2 0 0 1 2-2h11l3 3v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Z"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  call: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.5"/>',
  orbit: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="9" ry="3.6"/><path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  sound: '<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
};
const svg = (d: string, s = 20) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

/** Wraps each word so headings can rise in word by word. */
const words = (t: string, from = 0) => t.split(" ").map((w, i) => `<span class="hs-w"><span style="--i:${from + i}">${w}</span></span>`).join(" ");

const PARTS = [
  { id: "problem", label: "The problem" },
  { id: "trust", label: "Why" },
  { id: "cost", label: "The cost" },
  { id: "proof", label: "Proof" },
  { id: "solution", label: "VPV" },
  { id: "how", label: "How it works" },
  { id: "order", label: "Order now" },
];
const PART_COST = 2;
const PART_PROOF = 3;

const LOGOS_ALT =
  "Logos of manufacturers that use VPV: Kilitch Drugs, GRKC, Yum-Way, Binayak Hi Tech Engineering, Kesaria Rubber Industries, Nandan GSE, ViR, Saa Vishnu Group, Param, Miicron, JFL, Ecoste, de'Smat, Garima Global, Grace Auto and EASA Elevators";

const factoryRow = (f: (typeof FACTORIES)[number]) => {
  const { won, lost } = worked(f);
  return `<tr class="hs-fr hs-pop" style="--k:${FACTORIES.indexOf(f)}" data-f="${f.id}">
    <th scope="row"><button type="button" class="hs-fbtn" data-f="${f.id}" aria-pressed="false" aria-label="${f.name}: load ${f.leads.toLocaleString("en-IN")} leads at ${valueLabel(f.lakh)} each and ${f.conv}% conversion into the calculator"><b>${f.name}</b><small>${f.leads.toLocaleString("en-IN")} leads × ${valueLabel(f.lakh)}</small><small class="hs-fnote">${f.note}</small></button></th>
    <td>${f.conv}%</td>
    <td class="hs-won-c">${short(won)}</td>
    <td class="hs-lost-c">${short(lost)}</td>
  </tr>`;
};

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
    ${["base", "loss", "sky", "safe"].map((g) => `<div class="hs-glow hs-glow--${g}" aria-hidden="true"></div>`).join("")}
    <div class="hs-grid">
      <div class="hs-stage">
        <article class="hs-part" data-i="0" data-testid="home-story-hero">
          <p class="hs-eyebrow">Real Factories. Real Confidence.</p>
          <h1 class="hs-h1 hs-h1--hero" data-testid="landing-heading">${words("You meet hundreds of buyers at exhibitions and generate opportunities worth crores,")} <span class="hs-red">${words("yet", 12)} <span class="hs-mark">${words("conversion is low.", 13)}<svg class="hs-scribble" viewBox="0 0 300 18" preserveAspectRatio="none" aria-hidden="true"><path d="M3 12 C 60 5, 140 4, 297 9"/></svg></span></span></h1>
          <p class="hs-lede hs-in" style="--d:14">Meeting a buyer is just the beginning. <strong>You need to give them enough proof, confidence and reasons to choose you</strong>, even after the exhibition is over.</p>
          <p class="hs-cue hs-in" style="--d:16" aria-hidden="true"><span></span>Scroll</p>
        </article>

        <article class="hs-part" data-i="1">
          <p class="hs-eyebrow">Why?</p>
          <h2 class="hs-h2">${words("Lack of trust.")}</h2>
          <p class="hs-body hs-in" style="--d:4">Corporate videos, brochures and video calls don't build enough of the trust buyers need.</p>
          <p class="hs-body hs-body--em hs-in" style="--d:6"><strong>Buyers trust what they can see.</strong></p>
        </article>

        <article class="hs-part" data-i="2">
          <h2 class="hs-h2 hs-h2--calc">${words("How much is it costing you?")}</h2>
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

        <article class="hs-part" data-i="3">
          <p class="hs-eyebrow">Proof</p>
          <h2 class="hs-h2 hs-h2--proof">${words("These manufacturers have already solved this.")}</h2>
          <blockquote class="hs-quote hs-in" style="--d:5"><p>VPV became the bridge between us and our customers, and it builds our authority with every buyer.</p><footer>${PROOF.name}, Kesaria Rubber Industries</footer></blockquote>
          <figure class="hs-logos hs-in" style="--d:7"><img src="/img/trusted-manufacturers.webp" width="1774" height="887" loading="lazy" decoding="async" alt="${LOGOS_ALT}" data-testid="home-story-logos"></figure>
          <div class="hs-ctas hs-in" style="--d:9">
            <a class="hs-btn" href="/case-studies" data-testid="home-story-case-study">${CASE_STUDIES_BUTTON} ${arrow}</a>
          </div>
        </article>

        <article class="hs-part" data-i="4">
          <p class="hs-eyebrow">VPV · Virtual Plant Visit</p>
          <h2 class="hs-h2">${words("Show your factory only to buyers. Keep competitors out.")}</h2>
          <p class="hs-body hs-in" style="--d:5">Your virtual factory tour, which your competition will not be able to see.</p>
          <ul class="hs-locks">
            ${[
              [icon.link, "One-time view links"],
              [icon.timer, "Control link expiry time"],
              [icon.device, "Limit device access"],
              [icon.key, "Password protected link"],
            ].map(([ic, t], k) => `<li class="hs-lock hs-in" style="--d:${6 + k}"><span class="hs-ic">${svg(ic, 18)}</span><span><b>${t}</b></span><i class="hs-switch" style="--k:${k}"></i></li>`).join("")}
          </ul>
        </article>

        <article class="hs-part" data-i="5">
          <p class="hs-eyebrow">How it works</p>
          <h2 class="hs-h2 hs-h2--how"><span class="hs-sent">${words("We shoot it.")}</span> <span class="hs-sent">${words("You share it.", 3)}</span> <span class="hs-sent">${words("Buyers walk through it.", 6)}</span></h2>
          <p class="hs-body hs-in" style="--d:5">One link opens your whole factory, on any screen, with no travel on either side.</p>
          <div class="hs-ctas hs-in" style="--d:7">
            <a class="hs-link hs-link--keep" href="/how-it-works" data-testid="home-story-how">See it in detail ${arrow}</a>
            <a class="hs-link hs-link--keep" href="/demo" data-testid="home-story-demo-link">Try the live demo ${arrow}</a>
          </div>
        </article>

        <article class="hs-part" data-i="6">
          <p class="hs-eyebrow">Order now</p>
          <h2 class="hs-h2">${words("Order now in just 5 simple steps.")}</h2>
          <p class="hs-body hs-in" style="--d:5">You do the first two, online. We do the rest.</p>
          <div class="hs-ctas hs-in" style="--d:7">
            <a class="hs-btn" href="/plans" data-testid="home-story-cta">Find the Right VPV for Your Factory ${arrow}</a>
          </div>
        </article>
      </div>

      <div class="hs-visual" data-testid="home-story-visual">
        <div class="hs-vis" data-v="0">
          <figure class="hs-photo">
            <img src="/img/home-expo-tablet.webp" srcset="/img/home-expo-tablet-sm.webp 640w, /img/home-expo-tablet.webp 970w" sizes="(max-width:1023px) 90vw, 520px" width="970" height="578" decoding="async" fetchpriority="high" alt="Two buyers at an exhibition looking at a factory tour on a tablet">
            <span class="hs-chip hs-chip--blue hs-pop hs-chip--a" style="--k:0">${svg(icon.users, 16)}Hundreds of buyers met</span>
            <span class="hs-chip hs-chip--green hs-pop hs-chip--b" style="--k:1">${svg(icon.rupee, 16)}Opportunities worth crores</span>
            <span class="hs-chip hs-chip--red hs-pop hs-chip--c" style="--k:2">${svg(icon.down, 16)}Conversion is low</span>
          </figure>
        </div>

        <div class="hs-vis" data-v="1">
          <div class="hs-card hs-trust">
            <p class="hs-card-t">Trust built with the buyer</p>
            <ul class="hs-meters">
              ${[
                [icon.film, "Corporate video", ".3"],
                [icon.brochure, "Brochures", ".2"],
                [icon.call, "Video calls", ".42"],
              ].map(([ic, t, f], k) => `<li class="hs-meter-row hs-pop" style="--k:${k};--f:${f}"><span class="hs-ic">${svg(ic, 20)}</span><span class="hs-meter-main"><b>${t}</b><i class="hs-meter"><u></u></i></span><em>Not enough</em></li>`).join("")}
            </ul>
            <p class="hs-legend"><span class="hs-dash" aria-hidden="true"></span>Trust a buyer needs before placing an order</p>
          </div>
        </div>

        <div class="hs-vis" data-v="2">
          <div class="hs-card hs-tab">
            <p class="hs-card-t">Four factories, one formula</p>
            <p class="hs-card-s">Illustrative examples, worked out like the calculator. Tap a row to load it.</p>
            <table class="hs-table" aria-label="Four example factories and what they lose to competition over five years">
              <thead><tr><th scope="col">Factory</th><th scope="col">Converts</th><th scope="col">You win</th><th scope="col"><span class="hs-long">Lost to competition</span><span class="hs-brief">Lost</span></th></tr></thead>
              <tbody>${FACTORIES.map(factoryRow).join("")}</tbody>
            </table>
            <p class="hs-card-n">Leads are over 5 years. Lost = the leads that did not convert, at the same business per lead.</p>
          </div>
        </div>

        <div class="hs-vis hs-vis--video" data-v="3">
          <div class="hs-vid">
            <p class="hs-vid-tag"><span class="hs-play" aria-hidden="true"></span>80%+ conversion with VPV</p>
            <div class="hs-vid-frame${PROOF.portrait ? " is-portrait" : ""}">
              <iframe title="${PROOF.name}, ${PROOF.role}: his story with VPV" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
              <button type="button" class="hs-vguard" aria-label="Click to use the video controls"></button>
              <button type="button" class="hs-sound" aria-label="Turn on sound">${svg(icon.sound, 20)}<span>Tap for sound</span></button>
            </div>
            <p class="hs-vid-who"><b>${PROOF.name}</b><span>${PROOF.role}</span></p>
          </div>
        </div>

        <div class="hs-vis" data-v="4">
          <div class="hs-sol">
            <img src="/img/home-buyer-tablet.webp" srcset="/img/home-buyer-tablet-sm.webp 640w, /img/home-buyer-tablet.webp 1066w" sizes="(max-width:1023px) 90vw, 540px" width="1066" height="705" loading="lazy" decoding="async" alt="A buyer looking at a VPV factory tour on a tablet, with information icons over the shop floor">
            <span class="hs-chip hs-chip--green hs-pop hs-chip--d" style="--k:0">${svg(icon.check, 16)}Buyer: link opened</span>
            <span class="hs-chip hs-chip--red hs-pop hs-chip--e" style="--k:1">${svg(icon.lock, 16)}Competitor: access blocked</span>
          </div>
        </div>

        <div class="hs-vis" data-v="5">
          <ol class="hs-flow">
            ${[
              [icon.camera, "We shoot your plant in 360°", "Our crew comes to you. Production keeps running."],
              [icon.orbit, "We build your VPV", "Areas joined, information icons, your videos and your brand. Live at yourcompany.myvpv.com."],
              [icon.share, "You share one link", "Buyers walk through your plant on their own screen. You decide who gets in."],
            ].map(([ic, t, d], k) => `<li class="hs-flow-i hs-pop" style="--k:${k}"><span class="hs-ic hs-ic--grad">${svg(ic, 22)}</span><span><b>${t}</b><small>${d}</small></span></li>`).join("")}
          </ol>
        </div>

        <div class="hs-vis" data-v="6">
          <ol class="hs-steps5">
            ${ORDER_STEPS.map((s, k) => `<li class="hs-s5 hs-pop" style="--k:${k}"><span class="hs-num">${k + 1}</span><span class="hs-s5-t"><b>${s.title}</b><small>${s.when}</small></span><em class="hs-who hs-who--${s.who === "You" ? "you" : "us"}">${s.who === "You" ? "You" : "We do it"}</em></li>`).join("")}
          </ol>
        </div>
      </div>
    </div>
    <div class="hs-steps" aria-hidden="true">${PARTS.map(() => "<i></i>").join("")}</div>
  </div>`;
  host.appendChild(sec);

  const $ = <T extends Element>(q: string) => sec.querySelector(q) as T;
  const parts = Array.from(sec.querySelectorAll<HTMLElement>(".hs-part"));
  const visuals = Array.from(sec.querySelectorAll<HTMLElement>(".hs-vis"));
  const steps = Array.from(sec.querySelectorAll<HTMLElement>(".hs-steps i"));
  const pin = $<HTMLElement>(".hs-pin");
  // The right-hand column (on phones, the strip across the top). The fit
  // logic below shortens it on a small phone to make room for the text.
  const frame = $<HTMLElement>(".hs-visual");

  /* ---------- the calculator (part 2, "How much is it costing you?") ---------- */
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
    markExamples();
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

  /* ---------- the four example factories ---------- */
  // A row loads its numbers into the calculator, so the visitor sees the
  // table's figures come alive (and can then change them). The row that
  // matches the calculator's current numbers is marked.
  const fbtns = Array.from(sec.querySelectorAll<HTMLButtonElement>(".hs-fbtn"));
  const markExamples = () => {
    fbtns.forEach((b) => {
      const f = FACTORIES.find((x) => x.id === b.dataset.f)!;
      const on = !customOn && f.leads === calc.leads && f.lakh === calc.valueLakh && f.conv === calc.conv;
      b.setAttribute("aria-pressed", String(on));
      b.closest("tr")?.classList.toggle("is-picked", on);
    });
  };
  fbtns.forEach((b) => b.addEventListener("click", () => {
    const f = FACTORIES.find((x) => x.id === b.dataset.f)!;
    customOn = false;
    calc.leads = f.leads; calc.valueLakh = f.lakh; calc.conv = f.conv;
    range.value = String(f.leads); convRange.value = String(f.conv);
    lastField = "leads";
    changed();
    // Nudge the eye to the left, where the figures just changed.
    if (!reduced) { lossBox.classList.remove("hs-hit"); void lossBox.offsetWidth; lossBox.classList.add("hs-hit"); }
  }));

  /* ---------- part 3: the video ---------- */
  // Browsers only autoplay a video that starts muted, so it starts muted and
  // a large "Tap for sound" button turns the sound on (the tap is the
  // gesture the browser wants). Same approach as /case-studies. It starts
  // when the visitor reaches the part, pauses when they leave and picks up
  // again when they come back, so it never plays to an empty room.
  const vframe = $<HTMLElement>(".hs-vid-frame");
  const viframe = $<HTMLIFrameElement>(".hs-vid-frame iframe");
  const soundBtn = $<HTMLButtonElement>(".hs-sound");
  let vStarted = false, vT0 = 0;
  const ytSrc = (muted: boolean, start = 0) =>
    `https://www.youtube-nocookie.com/embed/${PROOF.id}?autoplay=1&mute=${muted ? 1 : 0}&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}${start > 0 ? `&start=${start}` : ""}`;
  const ytCmd = (func: "playVideo" | "pauseVideo") => {
    try { viframe.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args: "" }), "*"); } catch { /* not loaded yet */ }
  };
  const startVideo = () => { if (vStarted) return; vStarted = true; vT0 = performance.now(); viframe.src = ytSrc(true); };
  // The player takes the wheel and touch for itself, so the page could not
  // scroll past it. A clear layer over it lets the page scroll; a click or
  // tap hands the player the mouse (for its own controls) until the mouse
  // leaves or a touch lands elsewhere.
  const vguard = $<HTMLButtonElement>(".hs-vguard");
  vguard.addEventListener("click", () => vframe.classList.add("is-open"));
  vframe.addEventListener("mouseleave", () => vframe.classList.remove("is-open"));
  const outside = (e: Event) => { if (!vframe.contains(e.target as Node)) vframe.classList.remove("is-open"); };
  document.addEventListener("touchstart", outside, { passive: true });
  soundBtn.addEventListener("click", () => {
    vframe.classList.add("is-sound");
    // Same video, same place, now with sound (a new load is the one thing a
    // tap lets every browser do).
    viframe.src = ytSrc(false, Math.max(0, Math.floor((performance.now() - vT0) / 1000)));
    track("video_play", { id: PROOF.id, sound: true, label: "home_story_proof", path: "/" });
  });

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
  const seen = new Set<number>();
  const setActive = (i: number) => {
    if (i === active) return;
    const dir = i > active ? "down" : "up";
    const flip = (els: HTMLElement[]) => els.forEach((p, k) => {
      p.classList.toggle("is-active", k === i);
      p.classList.toggle("is-past", k < i);
      p.setAttribute("aria-hidden", String(k !== i));
      (p as HTMLElement & { inert: boolean }).inert = k !== i;
    });
    flip(parts);
    flip(visuals);
    sec.dataset.dir = dir;
    sec.dataset.part = PARTS[i].id;
    steps.forEach((s, k) => s.classList.toggle("on", k <= i));
    if (i === PART_COST && active !== PART_COST) { shown = 0; recalc(); } // the loss counts up each time the cost part arrives
    // The video starts when the visitor reaches it, rests when they leave.
    if (i === PART_PROOF) { if (vStarted) ytCmd("playVideo"); else startVideo(); }
    else if (active === PART_PROOF) ytCmd("pauseVideo");
    // Where visitors stop reading: one event per part, per visit.
    if (!seen.has(i)) { seen.add(i); track("section_view", { section: `home-${PARTS[i].id}`, path: "/" }); }
    active = i;
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
    // The same for what is shown above the text on a phone: scaled down to
    // the strip it has, never below 55%.
    visuals.forEach((v) => {
      const c = v.firstElementChild as HTMLElement | null;
      if (!c) return;
      c.style.removeProperty("zoom");
      if (!phone.matches) return;
      const room = frame.clientHeight - 6, need = c.offsetHeight;
      if (need > room && room > 0) c.style.setProperty("zoom", String(Math.max(0.55, Math.floor((room / need) * 100) / 100)));
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
    document.removeEventListener("visibilitychange", onHidden);
    ytCmd("pauseVideo");
  }
  return dispose;
}
