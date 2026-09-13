'use strict';

// Die Blase: farbige Lichtflecken in einer Kugel. Zustand, Farben, Tempo,
// Empfindlichkeit und Deckkraft kommen aus der Konfiguration und greifen sofort.

const leinwand = document.getElementById('leinwand');
const ctx = leinwand.getContext('2d');

const TEMPO = { idle: 0.35, listening: 0.8, thinking: 1.8, speaking: 1.0 };
const OEFFNUNG = { idle: 1, listening: 1.07, thinking: 0.96, speaking: 1.02 };
const STANDARD = ['#6B5CFF', '#35E0C8'];

const KLECKSE = Array.from({ length: 6 }, (_, i) => ({
  phase: i * 1.7,
  f1: 0.55 + i * 0.13,
  f2: 0.75 + ((i * 37) % 5) * 0.11,
  bahn: 0.26 + (i % 3) * 0.13,
  groesse: 0.55 + (i % 2) * 0.2,
}));

let blase = null;
let zustand = 'idle';
let pegel = 0;
let pegelZiel = 0;
let zeit = 0;
let oeffnung = 1;
let letzte = performance.now();
let farben = KLECKSE.map(() => [107, 92, 255]);

function hex(h) {
  const n = parseInt(String(h).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mischen(a, b, t) {
  return a.map((v, i) => v + (b[i] - v) * t);
}

function rgba(c, a) {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}

function zielFarben() {
  const liste = (blase && blase.farben && blase.farben[zustand]) || STANDARD;
  return KLECKSE.map((_, i) => hex(liste[i % liste.length]));
}

function groesseAnpassen() {
  const dpr = window.devicePixelRatio || 1;
  leinwand.width = Math.round(window.innerWidth * dpr);
  leinwand.height = Math.round(window.innerHeight * dpr);
}

function kreis(x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function zeichnen(jetzt) {
  const dt = Math.min(0.05, (jetzt - letzte) / 1000);
  letzte = jetzt;
  const tempo = blase ? blase.tempo : 1;
  const empf = blase ? blase.empfindlichkeit : 1;

  zeit += dt * TEMPO[zustand] * tempo;
  pegel += (pegelZiel - pegel) * Math.min(1, dt * 14);
  pegelZiel *= Math.pow(0.03, dt);
  oeffnung += (OEFFNUNG[zustand] - oeffnung) * Math.min(1, dt * 4);
  const ziel = zielFarben();
  farben = farben.map((c, i) => mischen(c, ziel[i], Math.min(1, dt * 3)));

  const w = leinwand.width;
  const h = leinwand.height;
  const cx = w / 2;
  const cy = h / 2;
  const atem = 1 + 0.02 * Math.sin(zeit * 2.1);
  const R = Math.min(w, h) * 0.39 * oeffnung * atem * (1 + Math.min(0.22, pegel * 0.15 * empf));

  ctx.clearRect(0, 0, w, h);

  const schein = ctx.createRadialGradient(cx, cy, R * 0.7, cx, cy, R * 1.28);
  schein.addColorStop(0, rgba(farben[0], 0.32));
  schein.addColorStop(1, rgba(farben[1], 0));
  ctx.fillStyle = schein;
  kreis(cx, cy, R * 1.28);
  ctx.fill();

  ctx.save();
  kreis(cx, cy, R);
  ctx.clip();

  const basis = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
  basis.addColorStop(0, rgba(mischen(farben[0], [255, 255, 255], 0.12), 1));
  basis.addColorStop(1, rgba(mischen(farben[1], [12, 10, 34], 0.45), 1));
  ctx.fillStyle = basis;
  ctx.fillRect(0, 0, w, h);

  // "screen" statt "lighter": helle Paletten (Bernstein, Rosé) laufen sonst
  // in der Mitte bis Weiß aus und die Farben gehen verloren.
  ctx.globalCompositeOperation = 'screen';
  KLECKSE.forEach((k, i) => {
    const x = cx + Math.sin(zeit * k.f1 + k.phase) * R * k.bahn;
    const y = cy + Math.cos(zeit * k.f2 + k.phase * 1.3) * R * k.bahn;
    const r = R * k.groesse * (1 + pegel * 0.12 * empf);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(farben[i], 0.62));
    g.addColorStop(0.55, rgba(farben[i], 0.22));
    g.addColorStop(1, rgba(farben[i], 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  ctx.globalCompositeOperation = 'source-over';

  const licht = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.45, 0, cx - R * 0.35, cy - R * 0.45, R * 0.75);
  licht.addColorStop(0, 'rgba(255,255,255,0.30)');
  licht.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = licht;
  ctx.fillRect(0, 0, w, h);

  const rand = ctx.createRadialGradient(cx, cy, R * 0.72, cx, cy, R);
  rand.addColorStop(0, 'rgba(0,0,0,0)');
  rand.addColorStop(1, 'rgba(8,6,30,0.30)');
  ctx.fillStyle = rand;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  ctx.lineWidth = Math.max(1, R * 0.012);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  kreis(cx, cy, R - ctx.lineWidth / 2);
  ctx.stroke();

  requestAnimationFrame(zeichnen);
}

function uebernehmen(c) {
  blase = c.blase;
  document.body.style.opacity = String(blase.deckkraft);
}

async function init() {
  groesseAnpassen();
  window.addEventListener('resize', groesseAnpassen);
  uebernehmen(await julia.config());
  farben = zielFarben();
  julia.on('config:geaendert', uebernehmen);
  julia.on('zustand', (z) => { if (z in TEMPO) zustand = z; });
  julia.on('pegel', (p) => { pegelZiel = Math.max(pegelZiel, Number(p) || 0); });
  const st = await julia.status();
  if (st.zustand in TEMPO) zustand = st.zustand;
  requestAnimationFrame(zeichnen);
}

init();
