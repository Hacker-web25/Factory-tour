/*
 * The welcome that writes itself — shown ONLY to someone who arrived by scanning
 * their own QR code (the gate in lib/welcome/gate.ts decides that; this file is
 * not even downloaded for anyone else).
 *
 * It writes "welcome" and then the person's first name, stroke by stroke, in a
 * pen that is visible at its tip, over a translucent blue glass. About two
 * seconds, tap anywhere to skip, and the page is already loading underneath.
 *
 * The handwriting is real pen-path data (see scripts/welcome/README.md for where
 * it comes from), so the strokes follow the letters the way a hand would instead
 * of a left-to-right wipe.
 *
 * Source of public/welcome/welcome.js. Edit THIS file and run
 *   node scripts/welcome/build.mjs
 */
(function () {
  "use strict";

  var F = /*GLYPHS*/ null;
  if (document.getElementById("vpv-hi")) return; // already running
  if (!document.body) {
    // Loaded before the body exists (rare: the script is async). Wait for it.
    document.addEventListener("DOMContentLoaded", function () {
      window.__vpvHiStart && window.__vpvHiStart();
    });
    window.__vpvHiStart = start;
    return;
  }
  start();

  function start() {
  window.__vpvHiStart = null;
  if (document.getElementById("vpv-hi")) return;
  // Appended at the END of body, where React's hydration tolerates strangers.
  // (An element in the middle of body, or anywhere in <html>, would be a mismatch.)
  var root = document.createElement("div");
  root.id = "vpv-hi";
  root.setAttribute("data-live", "1");
  document.body.appendChild(root);

  var NS = "http://www.w3.org/2000/svg";
  var reduce = false;
  try {
    reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {}

  /* ── the name ───────────────────────────────────────────────────────── */

  function readName() {
    try {
      var m = document.cookie.match(/(?:^|;\s*)vpv_hi=([^;]*)/);
      if (!m) return "";
      var v = decodeURIComponent(m[1]).replace(/\s+/g, " ").trim().slice(0, 24);
      // "1" is the marker the redirect sets when the welcome does not use a name.
      return v === "1" ? "" : v;
    } catch (e) {
      return "";
    }
  }

  // "aryan" and "ARYAN" both read better as "Aryan"; "McDonald" is left alone.
  function tidy(s) {
    s = s.replace(/[‘’]/g, "'");
    if (s === s.toLowerCase() || s === s.toUpperCase()) {
      s = s.toLowerCase().replace(/(^|[\s'-])(\S)/g, function (_, a, b) {
        return a + b.toUpperCase();
      });
    }
    return s;
  }

  // Letters we can write with the pen. Anything else (a name in Devanagari, say)
  // is shown as ordinary text that fades in, never as a row of missing boxes.
  function writable(s) {
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c === " ") continue;
      if (!F.g[c]) return false;
    }
    return s.replace(/\s/g, "").length > 0;
  }

  var rawName = readName();
  var name = rawName ? tidy(rawName) : "";
  var nameInk = name && writable(name);

  /* ── layout, in glyph units ─────────────────────────────────────────── */

  function layout(text) {
    var cx = 0;
    var items = [];
    var minY = 1e9;
    var maxY = -1e9;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === " ") {
        cx += F.space;
        continue;
      }
      var g = F.g[ch];
      if (!g) continue;
      // A letter with a hook on its left (j, p) leaves a hole before it: draw it closer.
      if (i > 0 && F.k[ch] && text.charAt(i - 1) !== " ") cx += F.k[ch];
      items.push({ ch: ch, g: g, ox: cx - g.x });
      cx += g.w;
      if (g.y < minY) minY = g.y;
      if (g.y + g.h > maxY) maxY = g.y + g.h;
    }
    return { items: items, w: cx, minY: minY, maxY: maxY };
  }

  var LW = layout("welcome");
  var LN = nameInk ? layout(name) : null;

  var vw = Math.max(280, window.innerWidth || 390);
  var vh = Math.max(360, window.innerHeight || 700);

  // One line on a wide screen, two on a phone.
  var gap = F.space * 1.1;
  var oneLine = !!LN && vw >= 760;
  var S;
  var placeW;
  var placeN;
  var lineH = LW.maxY - LW.minY;

  if (oneLine) {
    var total = LW.w + gap + LN.w;
    S = Math.min(vw * 0.78, 1120) / total;
    var x0 = (vw - total * S) / 2;
    var base = vh * 0.5 - ((LW.minY + LW.maxY) / 2) * S;
    placeW = { x: x0, y: base };
    placeN = { x: x0 + (LW.w + gap) * S, y: base };
  } else {
    S = Math.min(vw * 0.86, 560) / LW.w;
    var Sn = LN ? Math.min(S * 0.95, (vw * 0.86) / LN.w) : 0;
    var hW = lineH * S;
    var hN = LN ? (LN.maxY - LN.minY) * Sn : 0;
    var stack = hW + (LN ? hN * 0.35 : 0) + hN;
    var top = vh * 0.5 - stack / 2;
    placeW = { x: (vw - LW.w * S) / 2, y: top - LW.minY * S };
    if (LN) {
      placeN = {
        x: (vw - LN.w * Sn) / 2,
        y: top + hW + hN * 0.35 - LN.minY * Sn,
        s: Sn,
      };
    }
  }

  /* ── the DOM ────────────────────────────────────────────────────────── */

  var css =
    "#vpv-hi{position:fixed;inset:0;z-index:2147483000;overflow:hidden;touch-action:none;overscroll-behavior:contain;" +
    "-webkit-tap-highlight-color:transparent;cursor:default;opacity:1;" +
    "background:radial-gradient(900px 620px at 14% 10%,rgba(25,184,242,.40),transparent 62%)," +
    "radial-gradient(1000px 720px at 90% 94%,rgba(11,92,255,.66),transparent 64%)," +
    "radial-gradient(720px 520px at 62% 42%,rgba(124,92,255,.20),transparent 70%)," +
    "linear-gradient(160deg,rgba(7,26,64,.97) 0%,rgba(11,42,91,.95) 55%,rgba(10,58,140,.94) 100%);" +
    "-webkit-backdrop-filter:blur(22px) saturate(1.4);backdrop-filter:blur(22px) saturate(1.4);" +
    "transition:opacity .5s cubic-bezier(.22,1,.36,1)}" +
    "#vpv-hi.vpvhi-out{opacity:0;pointer-events:none}" +
    "#vpv-hi.vpvhi-fast{transition-duration:.22s}" +
    "#vpv-hi svg{position:absolute;left:0;top:0;width:100%;height:100%;display:block;overflow:visible;" +
    "transition:transform .5s cubic-bezier(.22,1,.36,1)}" +
    "#vpv-hi.vpvhi-out svg,#vpv-hi.vpvhi-out .vpvhi-txt{transform:translateY(-10px) scale(1.025)}" +
    "#vpv-hi .vpvhi-spot{position:absolute;left:0;top:0;width:460px;height:460px;margin:-230px 0 0 -230px;border-radius:50%;" +
    "background:radial-gradient(closest-side,rgba(150,200,255,.17),rgba(150,200,255,.06) 60%,rgba(150,200,255,0));opacity:0;will-change:transform,opacity}" +
    "#vpv-hi .vpvhi-txt{position:absolute;left:0;right:0;text-align:center;color:#fff;opacity:0;" +
    "font:600 clamp(28px,7vw,56px)/1.1 Inter,system-ui,-apple-system,'Segoe UI',sans-serif;letter-spacing:-.01em;" +
    "transition:opacity .5s ease,transform .5s cubic-bezier(.22,1,.36,1)}" +
    "#vpv-hi .vpvhi-sr{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}";
  var st = document.createElement("style");
  st.id = "vpv-hi-css";
  st.textContent = css;
  document.head.appendChild(st);

  // The page was covered by a bare CSS rectangle from the first byte (the gate in
  // lib/welcome/gate.ts), so nothing flashed. The real overlay takes over now.
  var cover = document.getElementById("vpv-hi-cover");
  if (cover && cover.parentNode) cover.parentNode.removeChild(cover);

  root.setAttribute("role", "status");
  root.setAttribute("aria-label", name ? "Welcome, " + name : "Welcome");
  root.innerHTML = "";
  var sr = document.createElement("span");
  sr.className = "vpvhi-sr";
  sr.textContent = name ? "Welcome, " + name : "Welcome";
  root.appendChild(sr);

  var spot = document.createElement("div");
  spot.className = "vpvhi-spot";
  root.appendChild(spot);

  var svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 " + vw + " " + vh);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  root.appendChild(svg);

  // The ink runs from white to a cool blue-white across the line: glass, not paper.
  var defs = document.createElementNS(NS, "defs");
  var grad = document.createElementNS(NS, "linearGradient");
  grad.setAttribute("id", "vpvhi-g");
  grad.setAttribute("gradientUnits", "userSpaceOnUse");
  grad.setAttribute("x1", String(vw * 0.1));
  grad.setAttribute("x2", String(vw * 0.9));
  grad.setAttribute("y1", "0");
  grad.setAttribute("y2", "0");
  [["0", "#ffffff"], ["0.55", "#e6f0ff"], ["1", "#b9d4ff"]].forEach(function (s) {
    var stop = document.createElementNS(NS, "stop");
    stop.setAttribute("offset", s[0]);
    stop.setAttribute("stop-color", s[1]);
    grad.appendChild(stop);
  });
  defs.appendChild(grad);
  svg.appendChild(defs);

  var penGlow = document.createElementNS(NS, "circle");
  penGlow.setAttribute("r", String(S * 1.7));
  penGlow.setAttribute("fill", "rgba(170,210,255,.38)");
  penGlow.style.opacity = "0";
  var penDot = document.createElementNS(NS, "circle");
  penDot.setAttribute("r", String(S * 0.62));
  penDot.setAttribute("fill", "#fff");
  penDot.style.opacity = "0";

  /* ── strokes: halo, glass body, bright core ─────────────────────────── */

  var strokes = []; // in writing order
  var word = []; // strokes of the word being built

  function pathEl(d, tx, ty, s, mx, my, w, stroke, opacity) {
    var p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", stroke);
    p.setAttribute("stroke-width", String(w));
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    p.setAttribute("transform", "translate(" + tx + "," + ty + ") scale(" + s + ") translate(" + mx + "," + -my + ")");
    p.style.opacity = "0";
    p._o = opacity;
    return p;
  }

  function build(L, place, scale) {
    var out = [];
    var tail = []; // i-dots and crossbars: written last, the way a hand does
    L.items.forEach(function (it) {
      it.g.p.forEach(function (sp, k) {
        var late = k > 0 && /[ijtx]/.test(it.ch);
        var tx = place.x + it.ox * scale;
        var ty = place.y;
        var sw = F.sw * 1.02;
        var len = it.g.l[k];
        var halo = pathEl(sp[0], tx, ty, scale, sp[1], sp[2], sw * 3.2, "rgba(96,165,255,.30)", 1);
        var body = pathEl(sp[0], tx, ty, scale, sp[1], sp[2], sw, "url(#vpvhi-g)", 0.9);
        var core = pathEl(sp[0], tx, ty, scale, sp[1], sp[2], sw * 0.26, "#ffffff", 1);
        var rec = { els: [halo, body, core], len: len, late: late, lead: body, tx: tx, ty: ty, mx: sp[1], my: sp[2] };
        rec.els.forEach(function (el) {
          el.setAttribute("stroke-dasharray", len + " " + (len + 4));
          el.setAttribute("stroke-dashoffset", String(len + 2));
        });
        (late ? tail : out).push(rec);
      });
    });
    return out.concat(tail);
  }

  var wordW = build(LW, placeW, S);
  var wordN = nameInk ? build(LN, placeN, oneLine ? S : placeN.s) : [];
  var scaleN = oneLine ? S : nameInk ? placeN.s : S;

  // Halos first, so the bright ink of one letter is never covered by the glow of the next.
  [wordW, wordN].forEach(function (wd) {
    wd.forEach(function (r) {
      svg.appendChild(r.els[0]);
    });
  });
  [wordW, wordN].forEach(function (wd) {
    wd.forEach(function (r) {
      svg.appendChild(r.els[1]);
      svg.appendChild(r.els[2]);
    });
  });
  svg.appendChild(penGlow);
  svg.appendChild(penDot);

  // A name we cannot write by hand: plain, premium text under the word.
  var txt = null;
  if (name && !nameInk) {
    txt = document.createElement("div");
    txt.className = "vpvhi-txt";
    txt.textContent = name;
    txt.style.top = Math.round(placeW.y + LW.maxY * S + vh * 0.04) + "px";
    root.appendChild(txt);
  }

  /* ── the timeline ───────────────────────────────────────────────────── */

  var T_START = 140;
  // The word on its own (the normal case: the welcome does not use a name) is
  // written a little slower and held a little longer, so the whole thing still
  // lasts about two seconds. With a name after it, the word is quicker.
  var ALONE = !name;
  var T_WORD = ALONE ? 1250 : 850;
  var T_NAME = 560;
  var T_GAP = 110;
  var T_HOLD = ALONE ? 520 : 380;
  var T_DOT = 70; // each late stroke (i-dot, t-bar)

  function plan(wd, t0, dur) {
    var main = wd.filter(function (r) {
      return !r.late;
    });
    var late = wd.filter(function (r) {
      return r.late;
    });
    var lateT = late.length * T_DOT;
    var mainT = Math.max(200, dur - lateT);
    var total = main.reduce(function (a, r) {
      return a + r.len;
    }, 0);
    var acc = 0;
    main.forEach(function (r) {
      r.a = acc / total; // share of the word's progress at which this stroke begins
      acc += r.len;
      r.b = acc / total;
    });
    late.forEach(function (r, i) {
      r.t0 = t0 + mainT + i * T_DOT;
      r.t1 = r.t0 + T_DOT;
    });
    return { t0: t0, mainT: mainT, main: main, late: late, end: t0 + mainT + lateT };
  }

  var pW = plan(wordW, T_START, T_WORD);
  var pN = nameInk ? plan(wordN, pW.end + T_GAP, T_NAME) : null;
  var writeEnd = pN ? pN.end : pW.end;
  var exitAt = writeEnd + T_HOLD + (txt ? 500 : 0);

  function ease(t) {
    // easeInOutSine: the pen leaves the paper gently, hurries through the word, settles.
    return 0.5 - Math.cos(Math.PI * t) / 2;
  }

  var t0 = 0;
  var done = false;
  var leaving = false;
  var tipX = vw / 2;
  var tipY = vh / 2;

  function setReveal(r, frac) {
    var off = r.len + 2 - frac * (r.len + 2);
    var show = frac > 0.001;
    for (var i = 0; i < 3; i++) {
      r.els[i].setAttribute("stroke-dashoffset", String(off));
      r.els[i].style.opacity = show ? String(r.els[i]._o) : "0";
    }
  }

  function drawWord(p, now, scale) {
    var t = Math.min(1, Math.max(0, (now - p.t0) / p.mainT));
    var prog = ease(t);
    var tip = null;
    p.main.forEach(function (r) {
      var f = (prog - r.a) / (r.b - r.a);
      f = f < 0 ? 0 : f > 1 ? 1 : f;
      setReveal(r, f);
      if (f > 0 && f < 1) tip = { r: r, f: f };
    });
    if (!tip && t >= 1) {
      // between the word and its dots: pen rests at the last stroke's end
      var last = p.main[p.main.length - 1];
      if (last) tip = { r: last, f: 1, rest: true };
    }
    p.late.forEach(function (r) {
      var f = (now - r.t0) / (r.t1 - r.t0);
      f = f < 0 ? 0 : f > 1 ? 1 : f;
      setReveal(r, f);
      if (f > 0 && f < 1) tip = { r: r, f: f };
    });
    return tip;
  }

  function movePen(tip, scale) {
    if (!tip) return;
    var r = tip.r;
    var pt;
    try {
      pt = r.lead.getPointAtLength(Math.min(r.len, r.len * tip.f));
    } catch (e) {
      return;
    }
    tipX = r.tx + scale * (pt.x + r.mx);
    tipY = r.ty + scale * (pt.y - r.my);
    penDot.setAttribute("cx", String(tipX));
    penDot.setAttribute("cy", String(tipY));
    penGlow.setAttribute("cx", String(tipX));
    penGlow.setAttribute("cy", String(tipY));
    spot.style.transform = "translate(" + tipX + "px," + tipY + "px)";
  }

  function frame(ts) {
    if (done) return;
    if (!t0) t0 = ts;
    var now = ts - t0;

    var tipW = drawWord(pW, now, S);
    var tipN = pN ? drawWord(pN, now, scaleN) : null;
    var inName = pN && now >= pN.t0;
    var tip = inName ? tipN || tipW : tipW;
    var writing = now >= T_START && now < writeEnd;
    if (writing && tip) movePen(tip, inName ? scaleN : S);
    var show = writing ? "1" : "0";
    penDot.style.opacity = show;
    penGlow.style.opacity = show;
    spot.style.opacity = writing ? "1" : String(Math.max(0, parseFloat(spot.style.opacity || "0") - 0.05));

    if (txt && now >= writeEnd - 100) {
      txt.style.opacity = "1";
    }

    if (now >= exitAt) {
      leave(false);
      return;
    }
    requestAnimationFrame(frame);
  }

  /* ── leaving ────────────────────────────────────────────────────────── */

  var startedAt = Date.now();
  var dismissed = false;

  function emit(skipped) {
    var detail = { skipped: !!skipped, ms: Date.now() - startedAt, ink: !!nameInk, reduced: !!reduce };
    // On a global too, for a tracker that was not listening yet.
    window.__vpvWelcome = detail;
    try {
      window.dispatchEvent(new CustomEvent("vpv:welcome", { detail: detail }));
    } catch (e) {}
  }

  function cleanup() {
    if (dismissed) return;
    dismissed = true;
    try {
      root.parentNode && root.parentNode.removeChild(root);
      st.parentNode && st.parentNode.removeChild(st);
    } catch (e) {}
  }

  function leave(skipped) {
    if (leaving) return;
    leaving = true;
    done = true;
    emit(skipped);
    root.className = (skipped ? "vpvhi-fast " : "") + "vpvhi-out";
    window.removeEventListener("keydown", onKey, true);
    setTimeout(cleanup, skipped ? 260 : 560);
  }

  function onKey(e) {
    var k = e && e.key;
    if (k === "Escape" || k === "Enter" || k === " ") leave(true);
  }
  root.addEventListener("pointerdown", function () {
    leave(true);
  });
  window.addEventListener("keydown", onKey, true);
  // Whatever happens, the page is never held hostage.
  setTimeout(function () {
    leave(false);
  }, 7000);

  try {
    sessionStorage.setItem("vpv_hi_seen", "1");
  } catch (e) {}

  if (reduce) {
    // No movement: the finished words fade in, rest a moment, fade out.
    wordW.concat(wordN).forEach(function (r) {
      setReveal(r, 1);
    });
    if (txt) txt.style.opacity = "1";
    setTimeout(function () {
      leave(false);
    }, 1400);
  } else {
    requestAnimationFrame(frame);
  }
  }
})();
