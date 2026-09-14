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

const UNTERTITEL = 120;

// Die Kugel sitzt oben im Fenster; darunter ist Platz für die Untertitel.
function kugelSeite() {
  const mitText = blase && blase.untertitel !== false;
  return Math.max(40, Math.min(window.innerWidth, window.innerHeight - (mitText ? UNTERTITEL : 0)));
}

function groesseAnpassen() {
  const dpr = window.devicePixelRatio || 1;
  const s = kugelSeite();
  leinwand.style.width = `${s}px`;
  leinwand.style.height = `${s}px`;
  leinwand.width = Math.round(s * dpr);
  leinwand.height = Math.round(s * dpr);
  const u = document.getElementById('untertitel');
  u.hidden = !(blase && blase.untertitel !== false);
  u.style.top = `${s}px`;
  u.style.maxHeight = `${Math.max(0, window.innerHeight - s - 4)}px`; // passt es nicht ganz, lässt es sich scrollen
  hoeheMelden(); // z. B. nach dem Verschieben: Platz für den Text wiederherstellen
}

// --- Maus: nur die Kugel selbst ist greifbar ---

let ueber = false;
let ziehen = null;

function aufKugel(e) {
  const s = kugelSeite();
  const cx = window.innerWidth / 2;
  const cy = s / 2;
  return Math.hypot(e.clientX - cx, e.clientY - cy) <= s * 0.42;
}

window.addEventListener('mousemove', (e) => {
  if (ziehen) {
    const dx = e.screenX - ziehen.x;
    const dy = e.screenY - ziehen.y;
    if (dx || dy) {
      julia.blaseZiehen(dx, dy);
      ziehen.x = e.screenX;
      ziehen.y = e.screenY;
    }
    return;
  }
  const drin = aufKugel(e);
  if (drin !== ueber) {
    ueber = drin;
    julia.blaseMaus(drin);
    document.body.classList.toggle('greifbar', drin);
  }
});
window.addEventListener('mousedown', (e) => {
  if (!ueber || e.button !== 0) return;
  ziehen = { x: e.screenX, y: e.screenY };
  document.body.classList.add('zieht');
});
window.addEventListener('mouseup', () => {
  if (!ziehen) return;
  ziehen = null;
  document.body.classList.remove('zieht');
  julia.blaseAbgelegt();
});
window.addEventListener('dblclick', () => { if (ueber) julia.blaseDoppelklick(); });
document.addEventListener('mouseleave', () => {
  if (ziehen || !ueber) return;
  ueber = false;
  julia.blaseMaus(false);
  document.body.classList.remove('greifbar');
});

// --- Untertitel: was du sagst und was geantwortet wird ---

let T = {};
let antwortRoh = '';
let wegTimer = null;
const schlicht = (s) => String(s || '').replace(/```[\s\S]*?```/g, ' ').replace(/[*`#>_~]+/g, '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();

// Das Fenster so hoch machen, dass der ganze Text passt (der Hauptprozess
// begrenzt auf den Bildschirmrand). Einmal pro Bild, nicht bei jedem Textstück.
let hoeheGeplant = false;
function hoeheMelden() {
  if (hoeheGeplant) return;
  hoeheGeplant = true;
  requestAnimationFrame(() => {
    hoeheGeplant = false;
    const u = document.getElementById('untertitel');
    const weg = u.hidden || u.classList.contains('weg') || !u.textContent.trim();
    julia.blaseHoehe(weg ? 0 : Math.ceil(u.scrollHeight) + 6);
    u.scrollTop = u.scrollHeight; // das Neueste bleibt sichtbar
  });
}

function zeigen() {
  clearTimeout(wegTimer);
  document.getElementById('untertitel').classList.remove('weg');
  hoeheMelden();
}

function spaeterAusblenden(ms = 9000) {
  clearTimeout(wegTimer);
  wegTimer = setTimeout(() => {
    document.getElementById('untertitel').classList.add('weg');
    setTimeout(hoeheMelden, 650); // nach dem Ausblenden wieder klein
  }, ms);
}

function du(text) {
  document.getElementById('du').textContent = text;
  zeigen();
}

function antwort(text, hinweis = false) {
  const el = document.getElementById('antwort');
  el.textContent = schlicht(text);
  el.classList.toggle('hinweis', hinweis);
  zeigen();
}

function untertitelVerdrahten() {
  julia.texte().then((d) => { T = d.texte; });
  julia.on('texte:geaendert', (d) => { T = d.texte; });
  julia.on('sprache:hoert', (an) => {
    if (an) { du(T['blase.hoert'] || '…'); antwort(''); antwortRoh = ''; } else spaeterAusblenden(6000);
  });
  julia.on('agent:nutzer', ({ text }) => { du(text); antwortRoh = ''; antwort(''); });
  julia.on('agent:text', (d) => { antwortRoh += String(d || ''); antwort(antwortRoh); });
  julia.on('agent:freigabe', () => antwort(T['blase.freigabe'] || '⚠', true));
  julia.on('agent:fertig', () => spaeterAusblenden());
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
  leinwand.style.opacity = String(blase.deckkraft);
  groesseAnpassen();
}

async function init() {
  window.addEventListener('resize', groesseAnpassen);
  uebernehmen(await julia.config());
  untertitelVerdrahten();
  farben = zielFarben();
  julia.on('config:geaendert', uebernehmen);
  julia.on('zustand', (z) => { if (z in TEMPO) zustand = z; });
  julia.on('pegel', (p) => { pegelZiel = Math.max(pegelZiel, Number(p) || 0); });
  const st = await julia.status();
  if (st.zustand in TEMPO) zustand = st.zustand;
  requestAnimationFrame(zeichnen);
}

init();
