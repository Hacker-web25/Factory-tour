"use client";

/**
 * Annually ⟷ Lifetime, for the funnel's plan step. The same control as the
 * one above the plan cards on the marketing site (lib/site/planBilling.ts):
 * a blue track that turns gold for "Lifetime", a knob that springs across,
 * a sheen and a few gold sparks on the way. Motion is off when the visitor
 * asks for less.
 */

import { useRef, useState } from "react";
import type { PurchaseBilling } from "@/lib/pricing";

const CSS = `
.fbs{display:inline-flex;align-items:center;gap:12px;user-select:none}
.fbs-opt{font:inherit;background:none;border:0;cursor:pointer;display:inline-flex;align-items:center;gap:7px;padding:5px 3px;font-size:14.5px;font-weight:700;color:#7b8aa0;transition:color .35s}
.fbs-opt[aria-pressed=true]{color:#0C1017}
.fbs-opt:focus-visible{outline:2px solid #1468D8;outline-offset:3px;border-radius:8px}
.fbs-chip{font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:3px 7px;border-radius:999px;color:#5A3D00;background:linear-gradient(135deg,#FFF6DA,#F2D27E);box-shadow:inset 0 0 0 1px rgba(184,137,43,.4)}
.fbs-sw{position:relative;flex:none;width:60px;height:32px;padding:0;border:0;border-radius:999px;background:none;cursor:pointer}
.fbs-sw:focus-visible{outline:none;box-shadow:0 0 0 4px rgba(20,104,216,.22)}
.fbs-track{position:absolute;inset:0;border-radius:999px;overflow:hidden;background:linear-gradient(135deg,#19B8F2,#1468D8 52%,#0B3D91);box-shadow:inset 0 2px 5px rgba(6,24,58,.35)}
.fbs-track::before{content:"";position:absolute;inset:0;background:linear-gradient(135deg,#FBE7A6,#E0B14C 45%,#A8721A);opacity:0;transition:opacity .5s cubic-bezier(.22,1,.36,1)}
.fbs.on .fbs-track::before{opacity:1}
.fbs-track::after{content:"";position:absolute;top:-30%;bottom:-30%;left:-70%;width:45%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.75),transparent);transform:skewX(-18deg);opacity:0}
.fbs.flash .fbs-track::after{animation:fbsSheen .8s cubic-bezier(.22,1,.36,1)}
@keyframes fbsSheen{0%{left:-70%;opacity:1}100%{left:135%;opacity:1}}
.fbs-knob{position:absolute;top:3px;left:3px;width:26px;height:26px;transition:transform .62s cubic-bezier(.34,1.56,.64,1)}
.fbs.on .fbs-knob{transform:translateX(28px)}
.fbs-knob>span{position:absolute;inset:0;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 28%,#fff,#fff 55%,#edf1f7);box-shadow:0 6px 12px -3px rgba(6,24,58,.5)}
.fbs.flash .fbs-knob>span{animation:fbsSquish .62s cubic-bezier(.22,1,.36,1)}
@keyframes fbsSquish{30%{transform:scale(1.3,.84)}62%{transform:scale(.93,1.07)}}
.fbs-knob svg{width:14px;height:14px;opacity:0;transform:scale(.4) rotate(-90deg);transition:opacity .35s .15s,transform .55s .1s cubic-bezier(.34,1.56,.64,1)}
.fbs.on .fbs-knob svg{opacity:1;transform:none}
.fbs-spark{position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:#E9C46A;box-shadow:0 0 6px rgba(233,196,106,.9);pointer-events:none;animation:fbsSpark .7s cubic-bezier(.22,1,.36,1) forwards}
@keyframes fbsSpark{to{transform:translate(var(--x),var(--y)) scale(0);opacity:0}}
@media (prefers-reduced-motion:reduce){.fbs *{transition:none!important;animation:none!important}}
`;

export default function BillingSwitch({
  value,
  onChange,
}: {
  value: PurchaseBilling;
  onChange: (v: PurchaseBilling) => void;
}) {
  const [flash, setFlash] = useState(false);
  const timer = useRef<number | null>(null);
  const knob = useRef<HTMLSpanElement>(null);
  const life = value === "lifetime";

  function set(v: PurchaseBilling) {
    if (v === value) return;
    onChange(v);
    try {
      window.sessionStorage.setItem("vpv.billing", v);
    } catch {
      /* intentional — the choice still applies to this page. */
    }
    const quiet = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (quiet) return;
    setFlash(false);
    window.requestAnimationFrame(() => setFlash(true));
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFlash(false), 820);
    if (v === "lifetime" && knob.current) {
      for (let i = 0; i < 9; i++) {
        const sp = document.createElement("span");
        const a = (Math.PI * 2 * i) / 9 + Math.random() * 0.4;
        const d = 20 + Math.random() * 14;
        sp.className = "fbs-spark";
        sp.style.setProperty("--x", `${(Math.cos(a) * d).toFixed(1)}px`);
        sp.style.setProperty("--y", `${(Math.sin(a) * d).toFixed(1)}px`);
        knob.current.appendChild(sp);
        window.setTimeout(() => sp.remove(), 760);
      }
    }
  }

  return (
    <div className={`fbs${life ? " on" : ""}${flash ? " flash" : ""}`} role="group" aria-label="How you pay">
      <style>{CSS}</style>
      <button type="button" className="fbs-opt" aria-pressed={!life} onClick={() => set("annual")}>
        Annually
      </button>
      <button
        type="button"
        className="fbs-sw"
        role="switch"
        aria-checked={life}
        aria-label="Pay once, for life"
        onClick={() => set(life ? "annual" : "lifetime")}
        data-testid="funnel-billing-switch"
      >
        <span className="fbs-track" />
        <span className="fbs-knob" ref={knob}>
          <span>
            <svg viewBox="0 0 24 24" fill="none" stroke="#A8721A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 12c-2-2.7-4-4-6-4a4 4 0 0 0 0 8c2 0 4-1.3 6-4zm0 0c2 2.7 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.3-6 4z" />
            </svg>
          </span>
        </span>
      </button>
      <button type="button" className="fbs-opt" aria-pressed={life} onClick={() => set("lifetime")}>
        Lifetime <span className="fbs-chip">Pay once</span>
      </button>
    </div>
  );
}
