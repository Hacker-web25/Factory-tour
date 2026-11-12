/**
 * How it works — scroll-driven walk through a factory.
 *
 * Mounted by the small loader in lib/site/home.ts into <div id="hiw-tour">,
 * which the site bundle renders in place of the old hero + five step cards
 * (those still render in #hiw-classic, shown whenever this tour can't run).
 *
 * Copy is the How it works page copy, word for word.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { N8AOPass } from 'n8ao';
import { buildFactory } from './scene.js';
import CSS from './tour.css';

const BASE = '/hiw-tour/';

const HERO = {
  eyebrow: 'How it works',
  title: 'From first click to a live VPV, without interrupting any process.',
  text: 'One short meeting with your MD and sales team. One efficient factory shoot. Your plant keeps running as usual.',
  cta: 'Find the Right VPV for Your Factory',
};
const STEPS = [
  { n: 1, title: 'Find your VPV', text: 'Answer a few simple questions about your factory areas and processes. We recommend the right plan and explain why.', link: 'Start now' },
  { n: 2, title: 'Confirm & pay online', text: 'See every charge upfront, including GST, cab travel and support, hosting & security, then confirm your order.' },
  { n: 3, title: 'Book your shoot', text: 'Request a preferred shoot date. Our team confirms availability within 1 working day.' },
  { n: 4, title: 'We shoot your plant', text: 'Our team comes to your plant and captures it as it operates every day. We keep the shoot time low so production is not disturbed.', facts: ['1–5 hours. Your factory keeps running.', 'No MD needed at the factory. No production disruption.'] },
  { n: 5, title: 'Your VPV goes live', text: 'After the shoot, we turn the captured factory into your interactive VPV with your team, without affecting your production. Delivery depends on the scale and complexity of the plant.', facts: ['Typically 1 to 3 weeks after the shoot.'] },
];
// scroll windows (0..1) in which each step card is on screen
const WIN = [[0.13, 0.29], [0.32, 0.45], [0.48, 0.61], [0.64, 0.83], [0.86, 1.01]];

// camera keyframes: p, position, look-at, fov
const KF = [
  [0.00, [31, 14, 25], [-3, 1.2, -3], 40],
  [0.09, [28, 12, 22], [-3, 1.2, -3], 40],
  [0.15, [-3, 33, 21], [-7.5, 0, -1], 42],
  [0.28, [-6, 31, 19], [-8, 0, -1], 42],
  [0.34, [18.2, 2.2, -4.6], [20.1, 1.4, -10.85], 44],
  [0.44, [20.1, 1.62, -9.15], [20.1, 1.4, -10.85], 40],
  [0.50, [19.5, 2.3, 4.6], [30, 2.1, 8], 50],
  [0.60, [21.5, 2.1, 6.0], [30, 2.1, 8], 48],
  [0.645, [9.2, 2.7, 4.6], [1, 1.5, -2.4], 52],
  [0.82, [-16.5, 2.7, 4.6], [-25, 1.5, -2.4], 52],
  [0.89, [-10, 28, 32], [-7, 0, -1], 42],
  [1.00, [-6, 32, 35], [-7.5, 0, -1], 41],
].map(([p, a, b, f]) => ({ p, pos: new THREE.Vector3(...a), look: new THREE.Vector3(...b), fov: f }));

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const ramp = (p, a, b) => smooth(clamp((p - a) / (b - a)));
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const arrow = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

let styleInjected = false;

export function mount(host) {
  if (!styleInjected) { const s = document.createElement('style'); s.id = 'hiwt-style'; s.textContent = CSS; document.head.appendChild(s); styleInjected = true; }
  const mobile = matchMedia('(max-width: 820px)').matches || matchMedia('(pointer: coarse)').matches;

  /* ---------------- DOM ---------------- */
  const sec = el('section', 'hiwt'); sec.setAttribute('aria-label', 'How VPV works, as a walk through a plant');
  const pin = el('div', 'hiwt-pin');
  const canvas = el('canvas', 'hiwt-canvas'); canvas.setAttribute('aria-hidden', 'true');
  const shade = el('div', 'hiwt-shade');
  const hero = el('div', 'hiwt-hero', `<p class="hiwt-eyebrow">${HERO.eyebrow}</p><h1>${HERO.title}</h1><p class="hiwt-lede">${HERO.text}</p><a class="hiwt-btn" href="/assessment" data-testid="hiw-cta">${HERO.cta} ${arrow}</a>`);
  const cue = el('div', 'hiwt-cue', '<span>Scroll to walk through the plant</span><i></i>');
  const cards = el('ol', 'hiwt-cards');
  const cardEls = STEPS.map((s, i) => {
    const c = el('li', 'hiwt-card');
    c.innerHTML = `<p class="hiwt-tag"><b>${s.n}</b> Step ${s.n} of 5</p><h2>${s.title}</h2><p>${s.text}</p>`
      + (s.facts ? `<ul>${s.facts.map(f => `<li><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.2 2.4 2.4 4.6-4.8"/></svg><span>${f}</span></li>`).join('')}</ul>` : '')
      + (s.link ? `<a class="hiwt-link" href="/assessment">${s.link} ${arrow}</a>` : '')
      + (i === 4 ? `<a class="hiwt-btn" href="/assessment">${HERO.cta} ${arrow}</a>` : '');
    cards.appendChild(c); return c;
  });
  const rail = el('nav', 'hiwt-rail'); rail.setAttribute('aria-label', 'Jump to a step');
  const dots = STEPS.map((s, i) => { const b = el('button', '', `<i></i><span>${s.title}</span>`); b.type = 'button'; b.setAttribute('aria-label', `Step ${s.n}: ${s.title}`); b.addEventListener('click', () => jump(i)); rail.appendChild(b); return b; });
  const labels = el('div', 'hiwt-labels');
  const hud = el('div', 'hiwt-hud', '<span class="hiwt-rec"><i></i>REC</span><span class="hiwt-live"><i></i>LIVE</span>');
  const load = el('div', 'hiwt-load', '<i></i>');
  const skip = el('a', 'hiwt-skip', 'Skip the walkthrough ↓'); skip.href = '#hiw-after';
  skip.addEventListener('click', (e) => { const t = document.getElementById('hiw-after'); if (t) { e.preventDefault(); scrollTo({ top: t.getBoundingClientRect().top + scrollY - headerH(), behavior: 'smooth' }); } });
  pin.append(canvas, shade, labels, hero, cue, cards, rail, hud, load, skip);
  sec.appendChild(pin); host.appendChild(sec);

  /* ---------------- three ---------------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.25 : 1.6));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = !mobile; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#dfe6ee');
  scene.fog = new THREE.Fog('#dfe6ee', 45, 110);
  const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 300);

  const hemi = new THREE.HemisphereLight('#f3f7ff', '#8a96a6', 0.35); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff4e6', 0.0);
  sun.position.set(14, 26, 10); sun.target.position.set(-2, 0, -1);
  sun.castShadow = !mobile; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 20, bottom: -20, near: 1, far: 70 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; scene.add(sun, sun.target);

  const texLoader = new THREE.TextureLoader();
  const T = (n, srgb) => { const t = texLoader.load(BASE + 'tex/' + n + '.webp'); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const tex = { floor_diff: T('floor_diff', 1), floor_nor: T('floor_nor'), floor_arm: T('floor_arm'), wall_diff: T('wall_diff', 1), wall_nor: T('wall_nor'), wall_arm: T('wall_arm') };
  const factory = buildFactory({ tex, maxAniso: renderer.capabilities.getMaxAnisotropy(), mobile });
  scene.add(factory.root);

  let composer = null;
  if (!mobile) {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, rt);
    const ao = new N8AOPass(scene, cam, 1, 1); ao.configuration.aoRadius = 1.6; ao.configuration.distanceFalloff = 0.8; ao.configuration.intensity = 2.2; ao.configuration.halfRes = true; ao.configuration.gammaCorrection = false; ao.setQualityMode('Medium');
    composer.addPass(ao);
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.4, 1.05));
    composer.addPass(new OutputPass());
  }

  // environment lighting from a real warehouse HDRI, then the props
  let loaded = 0; const setLoad = (k) => { loaded = Math.max(loaded, k); load.firstChild.style.transform = `scaleX(${loaded})`; if (loaded >= 1) load.classList.add('done'); };
  new RGBELoader().load(BASE + 'env.hdr', (hdr) => { hdr.mapping = THREE.EquirectangularReflectionMapping; scene.environment = hdr; scene.environmentIntensity = 0.85; setLoad(0.3); });
  const gl = new GLTFLoader(); gl.setMeshoptDecoder(MeshoptDecoder);
  // The site CSP allows blob: images but not blob: fetches, so decode GLB
  // textures through <img> (TextureLoader) instead of ImageBitmapLoader.
  gl.register((parser) => { parser.textureLoader = new THREE.TextureLoader(parser.options.manager); return { name: 'vpv_img_textures' }; });
  gl.load(BASE + 'props.glb', (g) => { factory.placeProps(g.scene); setLoad(1); }, (e) => { if (e.total) setLoad(0.3 + 0.7 * e.loaded / e.total); }, () => setLoad(1));

  /* ---------------- labels projected from 3D ---------------- */
  const labelEls = factory.zones.map(z => { const l = el('span', 'hiwt-label', z.label); labels.appendChild(l); return l; });
  const v = new THREE.Vector3();

  /* ---------------- scroll + state ---------------- */
  const S = host.__hiwt = { p: 0, target: 0, mx: 0, my: 0, w: 1, h: 1, camPos: cam.position, lights: 0, zones: [0, 0, 0, 0, 0], pins: [0, 0, 0, 0, 0], order: 0, door: 0, rig: 0, rigX: 4, rec: 0 };
  const headerH = () => { const h = document.getElementById('vpv-site-header'); return h ? h.getBoundingClientRect().height : 0; };
  const progress = () => { const r = sec.getBoundingClientRect(); const total = sec.offsetHeight - (innerHeight - headerH()); return clamp((headerH() - r.top) / Math.max(1, total)); };
  const jump = (i) => { const mid = (WIN[i][0] + Math.min(1, WIN[i][1])) / 2 + (i === 4 ? 0.05 : 0); const total = sec.offsetHeight - (innerHeight - headerH()); scrollTo({ top: sec.getBoundingClientRect().top + scrollY - headerH() + mid * total, behavior: 'smooth' }); };
  const onScroll = () => { S.target = progress(); };
  const onPointer = (e) => { S.mx = e.clientX / innerWidth - 0.5; S.my = e.clientY / innerHeight - 0.5; };
  addEventListener('scroll', onScroll, { passive: true }); addEventListener('pointermove', onPointer, { passive: true });
  const size = () => {
    pin.style.setProperty('--hiwt-top', headerH() + 'px');
    const r = pin.getBoundingClientRect(); S.w = Math.max(1, r.width); S.h = Math.max(1, r.height);
    renderer.setSize(S.w, S.h, false); if (composer) composer.setSize(S.w, S.h);
    cam.aspect = S.w / S.h; cam.updateProjectionMatrix(); onScroll();
  };
  const ro = new ResizeObserver(size); ro.observe(pin); size();

  const posA = new THREE.Vector3(), lookA = new THREE.Vector3(), look = new THREE.Vector3();
  function cameraAt(p) {
    let i = 0; while (i < KF.length - 2 && p > KF[i + 1].p) i++;
    const a = KF[i], b = KF[i + 1], k = smooth(clamp((p - a.p) / (b.p - a.p)));
    posA.lerpVectors(a.pos, b.pos, k); lookA.lerpVectors(a.look, b.look, k);
    return lerp(a.fov, b.fov, k);
  }

  let raf = 0, visible = true, t0 = performance.now(), last = t0;
  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) start(); }); io.observe(sec);
  function frame(now) {
    const t = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000); last = now;
    S.p = S.snap ? S.target : lerp(S.p, S.target, 1 - Math.pow(0.0009, dt));
    const p = S.p;

    // story state from scroll
    S.lights = ramp(p, 0.0, 0.07) * 0.75 + 0.25;
    sun.intensity = 0.4 + 1.6 * ramp(p, 0.0, 0.07);
    S.zones = factory.zones.map((_, i) => ramp(p, 0.15 + i * 0.022, 0.18 + i * 0.022) * (1 - ramp(p, 0.29, 0.32)));
    S.order = ramp(p, 0.355, 0.43);
    S.door = ramp(p, 0.505, 0.575);
    S.rig = ramp(p, 0.615, 0.64) * (1 - ramp(p, 0.84, 0.87));
    S.rec = ramp(p, 0.64, 0.66) * (1 - ramp(p, 0.82, 0.84));
    S.rigX = lerp(4.5, -21, ramp(p, 0.645, 0.82));
    S.pins = factory.zones.map((_, i) => ramp(p, 0.885 + i * 0.016, 0.905 + i * 0.016));

    // camera
    const fov = cameraAt(p);
    const sway = Math.sin(t * 0.25) * 0.35;
    cam.position.copy(posA); cam.position.x += S.mx * 1.1 + (p < 0.1 ? sway : 0); cam.position.y -= S.my * 0.7;
    look.copy(lookA); look.x += S.mx * 0.5;
    const narrow = Math.max(0, 1 - cam.aspect); // portrait phones need a wider lens to see the same plant
    cam.fov = Math.min(78, fov * (1 + narrow * 0.95)); cam.updateProjectionMatrix(); cam.lookAt(look);
    // keep the hero copy clear of the plant on wide screens
    const heroK = 1 - ramp(p, 0.05, 0.11);
    // the copy sits on the left, so frame the plant to its right
    const endK = ramp(p, 0.86, 0.9);
    if (S.w > 900) cam.setViewOffset(S.w, S.h, -S.w * (0.13 + 0.05 * heroK + 0.06 * endK), 0, S.w, S.h);
    else cam.setViewOffset(S.w, S.h, 0, S.h * 0.2 * (1 - heroK), S.w, S.h); // phones: card sits at the bottom, so lift the plant

    factory.update(t, S);
    if (composer) composer.render(); else renderer.render(scene, cam);

    // overlays
    hero.style.opacity = heroK; hero.style.transform = `translateY(${-(1 - heroK) * 50}px)`; hero.style.visibility = heroK < 0.01 ? 'hidden' : '';
    cue.style.opacity = 1 - ramp(p, 0.01, 0.04); shade.style.opacity = 0.25 + 0.75 * heroK;
    let active = -1;
    cardEls.forEach((c, i) => {
      const [a, b] = WIN[i];
      const o = Math.min(ramp(p, a, a + 0.03), i === 4 ? 1 : 1 - ramp(p, b - 0.03, b));
      c.style.opacity = o; c.style.transform = `translateY(${(1 - o) * 26}px)`; c.style.visibility = o < 0.01 ? 'hidden' : 'visible';
      c.classList.toggle('on', o > 0.5); if (o > 0.4) active = i;
    });
    dots.forEach((d, i) => d.classList.toggle('on', i === active));
    rail.style.opacity = ramp(p, 0.1, 0.13);
    hud.classList.toggle('rec', S.rec > 0.5); hud.classList.toggle('live', S.pins[4] > 0.6);
    const showLabels = Math.max(...S.zones, ...S.pins);
    labelEls.forEach((l, i) => {
      const k = Math.max(S.zones[i], S.pins[i]);
      v.copy(factory.anchors[i]); if (S.pins[i] > 0.01) v.y = 3.4; v.project(cam);
      l.style.opacity = k; l.style.visibility = showLabels < 0.01 || k < 0.01 ? 'hidden' : 'visible';
      l.style.transform = `translate(${(v.x * 0.5 + 0.5) * S.w}px, ${(-v.y * 0.5 + 0.5) * S.h}px) translate(-50%, ${S.pins[i] > 0.01 ? '-170%' : '-50%'})`;
    });
  }
  function start() { cancelAnimationFrame(raf); last = performance.now(); const tick = (n) => { if (!visible) return; frame(n); raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); }
  start();
  onScroll();

  /* ---------------- teardown when the SPA leaves the page ---------------- */
  const gone = new MutationObserver(() => { if (!host.isConnected) dispose(); });
  gone.observe(document.body, { childList: true, subtree: true });
  function dispose() {
    cancelAnimationFrame(raf); gone.disconnect(); io.disconnect(); ro.disconnect();
    removeEventListener('scroll', onScroll); removeEventListener('pointermove', onPointer);
    scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => { Object.values(m).forEach(x => x && x.isTexture && x.dispose()); m.dispose(); }); });
    if (composer) composer.dispose(); renderer.dispose(); renderer.forceContextLoss();
  }
  return dispose;
}
