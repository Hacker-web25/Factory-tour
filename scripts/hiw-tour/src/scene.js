/**
 * The factory hall for the How it works tour.
 *
 * Architecture, production machines, conveyor and pallet racking are built
 * here in code. Everything Poly Haven had (crane, carts, shelving, crates,
 * boxes, microscope, shutter door, extinguishers, cameras, ducts) comes from
 * props.glb and is placed by name, so any model can be swapped for a better
 * one (e.g. from CGTrader) without touching the tour logic.
 *
 * Units are metres. The hall runs X -30..30, Z -14..14, roof at 10 m.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const HALL = { x0: -30, x1: 30, z0: -14, z1: 14, h: 10 };

// Areas the visitor picks in step 1 and sees as tour pins in step 5.
export const ZONES = [
  { id: 'line', label: 'Production line', x0: -25, x1: 5, z0: -8.4, z1: 0.6 },
  { id: 'qc', label: 'Quality lab', x0: 8, x1: 15.4, z0: -13.6, z1: -7 },
  { id: 'workshop', label: 'Machining & workshop', x0: -6, x1: 7, z0: 7.2, z1: 13.6 },
  { id: 'store', label: 'Warehouse', x0: -28.6, x1: -9, z0: 7.2, z1: 13.6 },
  { id: 'dispatch', label: 'Dispatch', x0: 20, x1: 29.6, z0: 3, z1: 13.4 },
];

const C = {
  brand: new THREE.Color('#0b5cff'),
  panel: '#e9edf2', base: '#3b424c', steel: '#9aa3ad', dark: '#1f242b',
  yellow: '#f2b705', rackBlue: '#1d4f9a', rackOrange: '#e06a1b', wood: '#b88a57',
};

export function buildFactory({ tex, maxAniso, mobile }) {
  const root = new THREE.Group();
  const anim = [];          // per-frame callbacks (t, state)
  const roofOnly = [];      // hidden when the camera is above the roof
  const walls = [];         // { obj, n: inward normal, p: point } — hidden when the camera is outside them
  const leds = [];          // LED fixture materials, faded in during the intro

  const std = (o) => new THREE.MeshStandardMaterial(o);
  const shadowy = (o, cast = true, recv = true) => { o.traverse(m => { if (m.isMesh) { m.castShadow = cast && !mobile; m.receiveShadow = recv; } }); return o; };
  const box = (w, h, d, mat, r = 0) => {
    const g = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
    return new THREE.Mesh(g, mat);
  };
  // each texture is used at one tiling only, so tile the original (cloning an unloaded texture makes three.js warn)
  const tiled = (t, rx, ry) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = maxAniso; return t; };

  /* ---------------- shell ---------------- */
  const W = HALL.x1 - HALL.x0, D = HALL.z1 - HALL.z0;
  const floorMat = std({
    map: tiled(tex.floor_diff, W / 5, D / 5), normalMap: tiled(tex.floor_nor, W / 5, D / 5),
    roughnessMap: tiled(tex.floor_arm, W / 5, D / 5), aoMap: tiled(tex.floor_arm, W / 5, D / 5),
    color: '#eef1f4', roughness: 0.32, envMapIntensity: 1.1,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; root.add(floor);

  // painted lines: walkway edges and zone borders, like a real plant floor
  const lineMat = std({ color: C.yellow, roughness: 0.6 });
  const stripe = (x0, z0, x1, z1, w = 0.12) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, w), lineMat);
    m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(z1 - z0, x1 - x0);
    m.position.set((x0 + x1) / 2, 0.006, (z0 + z1) / 2); m.receiveShadow = true; root.add(m);
  };
  stripe(-29.4, 1.9, 29.4, 1.9); stripe(-29.4, 5.7, 29.4, 5.7);
  for (const z of ZONES) { stripe(z.x0, z.z0, z.x1, z.z0, 0.08); stripe(z.x0, z.z1, z.x1, z.z1, 0.08); stripe(z.x0, z.z0, z.x0, z.z1, 0.08); stripe(z.x1, z.z0, z.x1, z.z1, 0.08); }
  // walkway hatch near the dock
  for (let i = 0; i < 8; i++) stripe(16 + i * 0.6, 1.9, 16.9 + i * 0.6, 5.7, 0.1);

  const wallMat = std({ map: tiled(tex.wall_diff, 8, 1.6), normalMap: tiled(tex.wall_nor, 8, 1.6), roughnessMap: tiled(tex.wall_arm, 8, 1.6), metalnessMap: tiled(tex.wall_arm, 8, 1.6), color: '#f1f4f7', metalness: 0.35, roughness: 0.5, side: THREE.DoubleSide });
  const bandMat = std({ color: '#7e8da0', roughness: 0.7, metalness: 0.05, side: THREE.DoubleSide });
  const windowMat = std({ color: '#dbe9ff', emissive: '#eaf3ff', emissiveIntensity: 1.6, roughness: 0.2 });
  const addWall = (len, x, z, rotY, n) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY;
    const upper = new THREE.Mesh(new THREE.PlaneGeometry(len, HALL.h - 1.4), wallMat); upper.position.y = 1.4 + (HALL.h - 1.4) / 2;
    const lower = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.4), bandMat); lower.position.y = 0.7;
    upper.receiveShadow = lower.receiveShadow = true; g.add(upper, lower);
    // clerestory windows
    for (let x = -len / 2 + 3; x < len / 2 - 2; x += 6) { const w = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.2), windowMat); w.position.set(x + 1, 7.4, 0.02); g.add(w); }
    root.add(g); walls.push({ obj: g, n, p: new THREE.Vector3(x, 0, z) });
  };
  addWall(W, 0, HALL.z0, 0, new THREE.Vector3(0, 0, 1));
  addWall(W, 0, HALL.z1, Math.PI, new THREE.Vector3(0, 0, -1));
  addWall(D, HALL.x0, 0, Math.PI / 2, new THREE.Vector3(1, 0, 0));
  addWall(D, HALL.x1, 0, -Math.PI / 2, new THREE.Vector3(-1, 0, 0));

  // roof, trusses and skylights
  const steelMat = std({ color: '#5c6672', metalness: 0.75, roughness: 0.45 });
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(W, D), std({ color: '#c9d1da', roughness: 0.8, side: THREE.DoubleSide }));
  roof.rotation.x = Math.PI / 2; roof.position.y = HALL.h; root.add(roof); roofOnly.push(roof);
  for (const z of [-6, 6]) for (let x = -24; x <= 24; x += 12) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.2), std({ color: '#ffffff', emissive: '#f4f8ff', emissiveIntensity: 1.4 }));
    s.rotation.x = Math.PI / 2; s.position.set(x, HALL.h - 0.02, z); root.add(s); roofOnly.push(s);
  }
  for (let x = HALL.x0 + 5; x < HALL.x1; x += 5) {
    const t = box(0.25, 0.35, D, steelMat); t.position.set(x, HALL.h - 0.6, 0); root.add(t); roofOnly.push(t);
  }
  for (const z of [-10, -3, 4, 11]) { const p = box(W, 0.18, 0.18, steelMat); p.position.set(0, HALL.h - 0.9, z); root.add(p); roofOnly.push(p); }

  // columns with safety banding
  const bandCanvas = document.createElement('canvas'); bandCanvas.width = 64; bandCanvas.height = 64;
  { const g = bandCanvas.getContext('2d'); g.fillStyle = C.yellow; g.fillRect(0, 0, 64, 64); g.fillStyle = '#111'; for (let i = -64; i < 128; i += 22) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 11, 0); g.lineTo(i - 53, 64); g.lineTo(i - 64, 64); g.fill(); } }
  const bandTex = new THREE.CanvasTexture(bandCanvas); bandTex.colorSpace = THREE.SRGBColorSpace; bandTex.wrapS = bandTex.wrapT = THREE.RepeatWrapping; bandTex.repeat.set(1, 2);
  const colMat = std({ color: '#3f6fa8', metalness: 0.5, roughness: 0.5 });
  const safeMat = std({ map: bandTex, roughness: 0.6 });
  const column = (x, z) => {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const c = box(0.42, HALL.h, 0.42, colMat); c.position.y = HALL.h / 2; g.add(c);
    const s = box(0.46, 1.2, 0.46, safeMat); s.position.y = 0.6; g.add(s);
    root.add(shadowy(g)); return g;
  };
  const columns = [];
  for (let x = -20; x <= 20; x += 10) { if (x < 8) columns.push(column(x, -11)); columns.push(column(x, 1.2)); }

  // crane runway beams
  for (const z of [-11, 1.2]) { const b = box(W - 2, 0.6, 0.45, steelMat); b.position.set(0, 7.7, z); root.add(shadowy(b)); }

  // LED linear high-bays (they switch on during the intro)
  const ledMat = std({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.3 });
  leds.push(ledMat);
  const housingMat = std({ color: '#d8dde3', metalness: 0.6, roughness: 0.35 });
  for (const z of [-9, -3, 3.8, 10]) for (let x = -26; x <= 26; x += 6.5) {
    const h = box(4.2, 0.12, 0.3, housingMat, 0.04); h.position.set(x, 8.4, z);
    const l = box(4.0, 0.03, 0.18, ledMat); l.position.y = -0.07; h.add(l);
    root.add(h);
  }

  /* ---------------- production line ---------------- */
  const panelMat = std({ color: C.panel, roughness: 0.38, metalness: 0.15 });
  const baseMat = std({ color: C.base, roughness: 0.6, metalness: 0.3 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: '#9fb6cf', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.32, envMapIntensity: 1.4, depthWrite: false });
  const accentMat = std({ color: '#0b5cff', emissive: '#0b5cff', emissiveIntensity: 0.25, roughness: 0.4 });
  const screenMat = std({ color: '#0b1a33', emissive: '#2f7bff', emissiveIntensity: 0.9 });
  const chromeMat = std({ color: '#cfd5dc', metalness: 1, roughness: 0.2 });
  const tower = [std({ color: '#2bd46b', emissive: '#2bd46b', emissiveIntensity: 1.6 }), std({ color: '#f2b705', emissive: '#f2b705', emissiveIntensity: 0.12 }), std({ color: '#e5484d', emissive: '#e5484d', emissiveIntensity: 0.1 })];
  const makeCNC = () => {
    const g = new THREE.Group();
    const base = box(3.0, 0.45, 2.3, baseMat, 0.05); base.position.y = 0.225; g.add(base);
    const body = box(3.0, 2.15, 2.3, panelMat, 0.1); body.position.y = 0.45 + 1.075; g.add(body);
    const top = box(3.0, 0.1, 2.3, panelMat, 0.04); top.position.y = 2.65; g.add(top);
    const stripeF = box(3.02, 0.14, 0.02, accentMat); stripeF.position.set(0, 2.36, 1.16); g.add(stripeF);
    // window + lit cavity + spinning spindle
    const cavity = box(1.6, 1.05, 0.2, std({ color: '#2a3038', emissive: '#cfe0ff', emissiveIntensity: 0.25 })); cavity.position.set(-0.3, 1.55, 1.07); g.add(cavity);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.05), glassMat); win.position.set(-0.3, 1.55, 1.18); g.add(win);
    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 18), chromeMat); spindle.position.set(-0.3, 1.75, 1.08); g.add(spindle);
    const handle = box(0.05, 0.7, 0.06, chromeMat); handle.position.set(0.58, 1.55, 1.2); g.add(handle);
    // control pendant with screen
    const pend = box(0.5, 0.75, 0.16, baseMat, 0.03); pend.position.set(1.15, 1.75, 1.25); g.add(pend);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.28), screenMat); scr.position.set(1.15, 1.86, 1.335); g.add(scr);
    // stack light
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 8), chromeMat); pole.position.set(1.3, 2.9, -0.9); g.add(pole);
    tower.forEach((m, i) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 16), m); c.position.set(1.3, 3.15 + i * 0.13, -0.9); g.add(c); });
    shadowy(g);
    win.castShadow = false;
    anim.push((t) => { spindle.rotation.y = t * 30; });
    return g;
  };
  for (let i = 0; i < 5; i++) { const m = makeCNC(); m.position.set(-22 + i * 5.5, 0, -5.2); root.add(m); }

  // conveyor with moving boxes (boxes are filled in once props load)
  const conveyor = new THREE.Group(); conveyor.position.set(-10, 0, -1.1); root.add(conveyor);
  const convLen = 32;
  const belt = box(convLen, 0.08, 0.9, std({ color: '#23272d', roughness: 0.9 })); belt.position.y = 0.86; conveyor.add(belt);
  for (const z of [-0.5, 0.5]) { const r = box(convLen, 0.18, 0.08, chromeMat); r.position.set(0, 0.9, z); conveyor.add(r); }
  for (let x = -convLen / 2 + 1; x < convLen / 2; x += 2.2) for (const z of [-0.45, 0.45]) { const leg = box(0.08, 0.82, 0.08, steelMat); leg.position.set(x, 0.41, z); conveyor.add(leg); }
  shadowy(conveyor);
  const parcels = [];

  /* ---------------- pallet racking (warehouse) ---------------- */
  const upMat = std({ color: C.rackBlue, metalness: 0.4, roughness: 0.5 });
  const beamMat = std({ color: C.rackOrange, metalness: 0.3, roughness: 0.5 });
  const palletMat = std({ color: C.wood, roughness: 0.9 });
  const pallet = () => { const p = box(1.2, 0.14, 1.0, palletMat); return p; };
  const racks = new THREE.Group(); root.add(racks);
  const rackRow = (x0, z, n) => {
    for (let i = 0; i <= n; i++) for (const dz of [-0.55, 0.55]) { const u = box(0.09, 5.2, 0.09, upMat); u.position.set(x0 + i * 2.8, 2.6, z + dz); racks.add(u); }
    for (const y of [0.15, 1.75, 3.35, 4.95]) for (const dz of [-0.55, 0.55]) { const b = box(n * 2.8, 0.12, 0.06, beamMat); b.position.set(x0 + n * 1.4, y, z + dz); racks.add(b); }
    const slots = [];
    for (let i = 0; i < n; i++) for (const y of [0.22, 1.82, 3.42]) { const p = pallet(); p.position.set(x0 + 1.4 + i * 2.8, y + 0.07, z); racks.add(p); slots.push(p.position.clone()); }
    return slots;
  };
  const rackSlots = [...rackRow(-28, 8.6, 6), ...rackRow(-28, 12.6, 6)];
  shadowy(racks);

  /* ---------------- glass rooms: QC lab + office ---------------- */
  const frameMat = std({ color: '#cfd6de', metalness: 0.8, roughness: 0.3 });
  const glassWall = new THREE.MeshPhysicalMaterial({ color: '#cfe0f2', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16, envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide });
  const room = (x0, x1, z0, z1, h = 3.2) => {
    const g = new THREE.Group(); root.add(g);
    const pane = (len, x, z, ry) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(len, h), glassWall); p.position.set(x, h / 2, z); p.rotation.y = ry; g.add(p);
      for (let s = 0; s <= Math.round(len / 1.6); s++) { const m = box(0.05, h, 0.06, frameMat); m.position.set(x + (s * len / Math.round(len / 1.6) - len / 2) * Math.cos(ry), h / 2, z - (s * len / Math.round(len / 1.6) - len / 2) * Math.sin(ry)); g.add(m); }
      const top = box(len, 0.08, 0.08, frameMat); top.position.set(x, h, z); top.rotation.y = ry; g.add(top);
    };
    pane(x1 - x0, (x0 + x1) / 2, z1, 0);
    pane(z1 - z0, x0, (z0 + z1) / 2, Math.PI / 2);
    pane(z1 - z0, x1, (z0 + z1) / 2, Math.PI / 2);
    const ceil = box(x1 - x0, 0.1, z1 - z0, std({ color: '#eef2f6', roughness: 0.7 })); ceil.position.set((x0 + x1) / 2, h + 0.05, (z0 + z1) / 2); g.add(ceil); roofOnly.push(ceil);
    const lamp = box(1.4, 0.03, 0.5, ledMat); lamp.position.set((x0 + x1) / 2, h - 0.02, (z0 + z1) / 2); g.add(lamp);
    return g;
  };
  room(8, 15.4, -13.9, -7);
  room(16.4, 24.4, -13.9, -7);
  const deskMat = std({ color: '#d7dbe0', roughness: 0.5 });
  const bench = (x, z, w, d, ry = 0) => { const g = new THREE.Group(); const top = box(w, 0.05, d, deskMat, 0.02); top.position.y = 0.88; g.add(top); for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const l = box(0.05, 0.86, 0.05, chromeMat); l.position.set(dx * (w / 2 - 0.08), 0.43, dz * (d / 2 - 0.08)); g.add(l); } g.position.set(x, 0, z); g.rotation.y = ry; root.add(shadowy(g)); return g; };
  bench(11.7, -12.8, 4.6, 0.9);
  bench(11.7, -9.0, 2.4, 0.9);
  // office desk + monitor showing the order summary (step 2)
  const desk = bench(20.4, -10.6, 2.0, 0.9, 0);
  const orderCanvas = document.createElement('canvas'); orderCanvas.width = 768; orderCanvas.height = 460;
  const orderTex = new THREE.CanvasTexture(orderCanvas); orderTex.colorSpace = THREE.SRGBColorSpace; orderTex.anisotropy = maxAniso;
  const drawOrder = (k = 1) => {
    const g = orderCanvas.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, 768, 460);
    g.fillStyle = '#0b2a5b'; g.font = '700 34px Plus Jakarta Sans, Inter, sans-serif'; g.fillText('Your VPV order', 40, 64);
    g.font = '500 24px Plus Jakarta Sans, Inter, sans-serif';
    const rows = ['Plan', 'Cab travel and support', 'Hosting & security', 'GST (18%)'];
    rows.forEach((r, i) => {
      const y = 122 + i * 56, on = Math.min(1, Math.max(0, k * 5 - i));
      g.globalAlpha = 0.25 + on * 0.75; g.fillStyle = '#334155'; g.fillText(r, 40, y);
      g.fillStyle = '#cbd5e1'; g.fillRect(560, y - 18, 160 * on, 16); g.globalAlpha = 1;
      g.fillStyle = '#e2e8f0'; g.fillRect(40, y + 18, 688, 2);
    });
    g.fillStyle = '#0b2a5b'; g.font = '700 26px Plus Jakarta Sans, Inter, sans-serif'; g.fillText('Total', 40, 362);
    g.fillStyle = '#0b5cff'; g.fillRect(560, 344, 160, 18);
    const b = Math.min(1, Math.max(0, k * 2 - 1));
    g.fillStyle = `rgba(11,92,255,${0.35 + b * 0.65})`; g.beginPath(); g.roundRect(468, 390, 260, 52, 26); g.fill();
    g.fillStyle = '#fff'; g.font = '700 22px Plus Jakarta Sans, Inter, sans-serif'; g.fillText(b > 0.98 ? 'Order confirmed' : 'Confirm order', 506, 424);
    orderTex.needsUpdate = true;
  };
  drawOrder(0);
  const mon = new THREE.Group(); mon.position.set(20.4, 0.91, -10.85); root.add(mon);
  const bezel = box(0.92, 0.56, 0.04, std({ color: '#111418', roughness: 0.4 }), 0.015); bezel.position.y = 0.52; mon.add(bezel);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.5), new THREE.MeshBasicMaterial({ map: orderTex, toneMapped: false, color: '#d9dde3' })); screen.position.set(0, 0.52, 0.022); mon.add(screen);
  const neck = box(0.05, 0.25, 0.05, chromeMat); neck.position.y = 0.16; mon.add(neck);
  const foot = box(0.26, 0.02, 0.18, chromeMat); foot.position.y = 0.01; mon.add(foot);
  shadowy(mon);

  /* ---------------- dock door (step 3) ---------------- */
  const daylight = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 4.4), std({ color: '#ffffff', emissive: '#fff6e8', emissiveIntensity: 2.4 }));
  daylight.position.set(HALL.x1 + 0.05, 2.2, 8); daylight.rotation.y = -Math.PI / 2; root.add(daylight);
  const doorFrame = box(0.3, 4.8, 6.0, steelMat); doorFrame.position.set(HALL.x1 - 0.12, 2.4, 8);
  const doorHole = box(0.4, 4.4, 5.4, std({ color: '#0d0f12' })); doorHole.position.set(HALL.x1 - 0.1, 2.2, 8); doorHole.visible = false;
  root.add(doorFrame);
  const doorHousing = box(0.7, 0.7, 5.8, steelMat, 0.05); doorHousing.position.set(HALL.x1 - 0.4, 4.75, 8); root.add(shadowy(doorHousing));
  const slatC = document.createElement('canvas'); slatC.width = 16; slatC.height = 64;
  { const g = slatC.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, '#dfe4ea'); gr.addColorStop(0.45, '#f4f6f8'); gr.addColorStop(0.8, '#c3cad3'); gr.addColorStop(1, '#9aa3ae'); g.fillStyle = gr; g.fillRect(0, 0, 16, 64); }
  const slatT = new THREE.CanvasTexture(slatC); slatT.colorSpace = THREE.SRGBColorSpace; slatT.wrapS = slatT.wrapT = THREE.RepeatWrapping; slatT.repeat.set(1, 44);
  const shutter = new THREE.Mesh(new THREE.BoxGeometry(0.06, 4.4, 5.4), std({ map: slatT, metalness: 0.55, roughness: 0.4 }));
  const door = new THREE.Group(); door.position.set(HALL.x1 - 0.2, 2.2, 8); door.add(shutter); root.add(shadowy(door));
  const sign = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext('2d'); g.fillStyle = '#0b2a5b'; g.fillRect(0, 0, 512, 96); g.fillStyle = '#fff'; g.font = '700 46px Plus Jakarta Sans, Inter, sans-serif'; g.textAlign = 'center'; g.fillText('DISPATCH  ·  DOCK 1', 256, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.6), std({ map: t, roughness: 0.6 })); })();
  sign.position.set(HALL.x1 - 0.1, 5.6, 8); sign.rotation.y = -Math.PI / 2; root.add(sign);
  const dock = { door, open: 0 };

  /* ---------------- 360° camera rig (step 4) ---------------- */
  const rig = new THREE.Group(); root.add(rig);
  const black = std({ color: '#121418', roughness: 0.35, metalness: 0.4 });
  // tripod: three legs from a hub at 1.0 m down to feet on a 0.5 m circle
  const hub = new THREE.Vector3(0, 1.0, 0), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2 + 0.5;
    const foot = new THREE.Vector3(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5);
    const dir = hub.clone().sub(foot); const len = dir.length();
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.011, len, 8), black);
    leg.position.copy(foot).addScaledVector(dir, 0.5); leg.quaternion.setFromUnitVectors(up, dir.normalize()); rig.add(leg);
  }
  const hubM = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.08, 12), black); hubM.position.y = 1.0; rig.add(hubM);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.62, 8), black); mast.position.y = 1.32; rig.add(mast);
  const HEAD_Y = 1.7;
  const head = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.13, 6, 18), black); head.position.y = HEAD_Y; rig.add(head);
  const lensMat = std({ color: '#0a0c10', metalness: 0.9, roughness: 0.05, emissive: '#2f7bff', emissiveIntensity: 0.2 });
  for (const s of [1, -1]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.042, 20, 14, 0, Math.PI), lensMat); l.position.set(0, HEAD_Y + 0.02, s * 0.05); l.rotation.y = s > 0 ? 0 : Math.PI; rig.add(l); }
  const recMat = std({ color: '#ff3b3b', emissive: '#ff3b3b', emissiveIntensity: 3 });
  const rec = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 8), recMat); rec.position.set(0.055, HEAD_Y + 0.1, 0); rig.add(rec);
  shadowy(rig);
  // capture pulses — rings that expand from the lens while recording
  const pulseMat = new THREE.MeshBasicMaterial({ color: '#4d8dff', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const pulses = [0, 1, 2].map(() => { const r = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 64), pulseMat.clone()); r.rotation.x = -Math.PI / 2; rig.add(r); return r; });
  rig.visible = false;

  /* ---------------- zones (step 1) and live pins (step 5) ---------------- */
  const zoneMeshes = ZONES.map(z => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(z.x1 - z.x0, z.z1 - z.z0), new THREE.MeshBasicMaterial({ color: C.brand, transparent: true, opacity: 0, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set((z.x0 + z.x1) / 2, 0.02, (z.z0 + z.z1) / 2); root.add(m);
    return m;
  });
  const anchors = ZONES.map(z => new THREE.Vector3((z.x0 + z.x1) / 2, 0.2, (z.z0 + z.z1) / 2));
  const pinCanvas = document.createElement('canvas'); pinCanvas.width = pinCanvas.height = 128;
  { const g = pinCanvas.getContext('2d'); g.fillStyle = 'rgba(11,92,255,.25)'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill(); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64, 64, 34, 0, 7); g.fill(); g.fillStyle = '#0b5cff'; g.beginPath(); g.arc(64, 64, 22, 0, 7); g.fill(); }
  const pinTex = new THREE.CanvasTexture(pinCanvas); pinTex.colorSpace = THREE.SRGBColorSpace;
  const pins = ZONES.map((z, i) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: pinTex, transparent: true, depthTest: false, opacity: 0 })); s.position.copy(anchors[i]).setY(3.4); s.renderOrder = 10; root.add(s); return s; });

  /* ---------------- crane (filled once props load) ---------------- */
  const crane = new THREE.Group(); crane.position.set(-8, 0, 0); root.add(crane);
  {
    const yel = std({ color: '#f2b705', metalness: 0.35, roughness: 0.45 });
    const span = 12.2, zc = -4.9;
    const girder = box(0.7, 0.9, span + 0.6, yel, 0.05); girder.position.set(0, 8.45, zc); crane.add(girder);
    for (const s of [-1, 1]) { const tr = box(1.6, 0.55, 0.6, yel, 0.05); tr.position.set(0, 8.25, zc + s * (span / 2)); crane.add(tr); }
    const trolley = new THREE.Group(); trolley.position.set(0, 8.9, zc); crane.add(trolley);
    const tb = box(1.3, 0.5, 1.4, std({ color: '#2b3038', metalness: 0.5, roughness: 0.5 }), 0.05); trolley.add(tb);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.6, 6), steelMat); cable.position.y = -2.0; trolley.add(cable);
    const hook = box(0.35, 0.45, 0.25, std({ color: '#f2b705', metalness: 0.4, roughness: 0.4 }), 0.04); hook.position.y = -3.9; trolley.add(hook);
    const warn = box(0.72, 0.2, 0.2, safeMat); warn.position.set(0, 8.0, zc); crane.add(warn);
    shadowy(crane);
    anim.push((t) => { trolley.position.z = zc + Math.sin(t * 0.21) * 4.2; });
  }
  anim.push((t) => { crane.position.x = -9 + Math.sin(t * 0.08) * 11; });

  /* ---------------- place props from props.glb ---------------- */
  function placeProps(lib) {
    const get = (n) => { const o = lib.getObjectByName(n); return o ? shadowy(o.clone(true)) : null; };
    const put = (n, x, y, z, ry = 0, s = 1, parent = root) => { const o = get(n); if (!o) return null; o.position.set(x, y, z); o.rotation.y = ry; o.scale.setScalar(s); parent.add(o); return o; };

    // parcels on the conveyor
    for (let i = 0; i < 9; i++) { const b = put('cardboard_box_01', 0, 0.9, 0, (i % 3) * 0.3, 1.6, conveyor); if (b) parcels.push(b); }
    anim.push((t) => { parcels.forEach((b, i) => { b.position.x = ((t * 1.1 + i * (convLen / parcels.length)) % convLen) - convLen / 2; }); });
    // warehouse: boxes and crates on the pallets
    rackSlots.forEach((p, i) => {
      if (i % 3 === 0) { for (let k = 0; k < 4; k++) put('plastic_crate_03', p.x - 0.28 + (k % 2) * 0.52, p.y + 0.07 + Math.floor(k / 2) * 0.27, p.z, Math.PI / 2, 1.1, racks); }
      else if (i % 3 === 1) { for (let k = 0; k < 6; k++) put('cardboard_box_01', p.x - 0.35 + (k % 3) * 0.36, p.y + 0.07 + Math.floor(k / 3) * 0.55, p.z, 0, 1.6, racks); }
      else { for (let k = 0; k < 2; k++) put('industrial_pastic_container', p.x - 0.28 + k * 0.56, p.y + 0.07, p.z, Math.PI / 2, 1.2, racks); }
    });
    for (let i = 0; i < 4; i++) put('Barrel_01', -8.2 + (i % 2) * 0.62, 0, 12.6 - Math.floor(i / 2) * 0.62, i);
    // workshop
    put('tool_cart', -3.2, 0, 9.6, 0.35);
    put('portable_welding_cart', 1.6, 0, 12.2, -0.4);
    put('metal_tool_chest', 4.6, 0, 13.3, Math.PI);
    put('industrial_storage_cart', -4.6, 0, 12.4, 0.15);
    const wb = new THREE.Group(); wb.position.set(2.6, 0, 8.6); root.add(wb);
    const top = box(2.4, 0.06, 0.9, std({ color: '#7b8590', metalness: 0.7, roughness: 0.4 })); top.position.y = 0.9; wb.add(top);
    const cab = box(2.3, 0.82, 0.85, std({ color: '#2f5fa3', metalness: 0.3, roughness: 0.5 }), 0.03); cab.position.y = 0.43; wb.add(cab); shadowy(wb);
    put('drill_press_01', 2.0, 0.93, 8.6, -0.3, 1.25);
    for (const x of [6.2, 7.4]) { const s = put('steel_frame_shelves_01', x, 0, 13.2, Math.PI, 0.1); }
    put('power_box_01', -20.21, 1.6, 1.2 + 0.26, 0);
    put('power_box_01', 9.8, 1.6, HALL.z1 - 0.08, Math.PI);
    // QC lab
    put('industrial_microscope', 10.6, 0.91, -12.8, 0.3, 1.3);
    put('industrial_microscope', 12.6, 0.91, -12.8, -0.2, 1.3);
    put('industrial_pastic_container', 14.2, 0.91, -12.8, 0.1, 0.8);
    put('plastic_crate_03', 11.2, 0.91, -9.0, 0.4, 1.0);
    // dispatch
    put('hand_truck', 26.2, 0, 4.6, -0.9);
    put('WetFloorSign_01', 23.4, 0, 3.6, 0.6, 1.4);
    for (let k = 0; k < 2; k++) {
      const pl = pallet(); pl.position.set(26.4 + k * 1.5, 0.07, 11.6); root.add(shadowy(pl));
      for (let j = 0; j < 9; j++) put('cardboard_box_01', 26.0 + k * 1.5 + (j % 3) * 0.37, 0.14 + Math.floor(j / 3) * 0.55, 11.6, 0, 1.6);
    }
    // safety + services
    columns.forEach((col, i) => { if (i % 2 === 0) put('korean_fire_extinguisher_01', col.position.x + 0.26, 0.9, col.position.z + 0.3, -Math.PI / 2, 1.1); });
    for (const x of [-25, -5, 15]) put('security_camera_02', x, 6.6, HALL.z0 + 0.05, 0, 2.2);
    for (const x of [-26, -18.4, -10.8, -3.2, 4.4, 12, 19.6]) { const d = put('modular_airduct_rectangular_01', x, 9.1, 8.2, 0, 0.9); if (d) roofOnly.push(d); }
  }

  /* ---------------- per-frame choreography ---------------- */
  const tmp = new THREE.Vector3();
  function update(t, s) {
    anim.forEach(f => f(t, s));
    // walls between the camera and the hall fade away (dollhouse cut-away)
    walls.forEach(w => { tmp.copy(s.camPos).sub(w.p); w.obj.visible = tmp.dot(w.n) > -0.5; });
    const inside = s.camPos.y < HALL.h - 0.4;
    roofOnly.forEach(o => { o.visible = inside; });
    // intro: lights switch on row by row
    ledMat.emissiveIntensity = 2.6 * s.lights;
    // step 1: zones light up one after another
    zoneMeshes.forEach((m, i) => { m.material.opacity = 0.28 * s.zones[i]; });
    // step 2: the order fills in and is confirmed
    if (Math.abs(s.order - (s._order ?? -1)) > 0.01) { drawOrder(s.order); s._order = s.order; }
    // step 3: shutter rolls up, daylight comes in
    dock.door.position.y = 2.2 + s.door * 4.2; dock.door.scale.y = 1 - s.door * 0.92; dock.door.position.y = 2.2 + s.door * 2.05;
    daylight.material.emissiveIntensity = 0.6 + s.door * 2.2;
    // step 4: rig follows the line while recording
    rig.visible = s.rig > 0.001;
    rig.position.set(s.rigX, 0, 1.0);
    recMat.emissiveIntensity = (Math.sin(t * 6) > 0 ? 3 : 0.3) * s.rig;
    pulses.forEach((r, i) => { const k = ((t * 0.55 + i / 3) % 1); r.position.y = 1.7; r.scale.setScalar(0.3 + k * 9); r.material.opacity = (1 - k) * 0.35 * s.rec; });
    // step 5: pins
    pins.forEach((p, i) => { const k = s.pins[i]; p.material.opacity = k; p.scale.setScalar(k * (1.1 + Math.sin(t * 2.4 + i) * 0.08)); p.visible = k > 0.01; });
  }

  return { root, update, placeProps, anchors, zones: ZONES };
}
