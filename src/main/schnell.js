'use strict';

// Schnell-Werkzeuge: rechnen, Einheiten umrechnen, Text umwandeln, QR erzeugen.
// Alles läuft lokal, ohne Netz – deshalb in der Ampel immer GRÜN.

const qrcode = require('qrcode-generator');

// --- Rechnen ---
// Nur Zahlen, Klammern und die Grundrechenarten plus Prozent und Potenz. Keine
// Namen, keine Funktionsaufrufe – dadurch ist die Auswertung ungefährlich.
function rechnen(ausdruck) {
  const roh = String(ausdruck || '').trim();
  if (!roh) throw new Error('Kein Rechenausdruck angegeben.');
  // Deutsche Schreibweise: Komma als Dezimaltrennzeichen, × ÷ erlauben.
  let s = roh.replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '.').replace(/\s+/g, '');
  if (!/^[0-9+\-*/().%^]+$/.test(s)) {
    throw new Error('Das kann ich nicht rechnen – erlaubt sind Zahlen und + - * / % ^ ( ).');
  }
  s = s.replace(/\^/g, '**');
  // "50%" → "(50/100)"; "200*15%" ergibt 30.
  s = s.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
  let wert;
  try {
    // eslint-disable-next-line no-new-func
    wert = Function(`"use strict";return (${s});`)();
  } catch {
    throw new Error('Der Ausdruck geht nicht auf – stimmen die Klammern?');
  }
  if (typeof wert !== 'number' || !Number.isFinite(wert)) throw new Error('Das ergibt keine gültige Zahl.');
  return Math.round(wert * 1e10) / 1e10;
}

// --- Einheiten ---
// Faktoren zur SI-Basiseinheit je Familie. Temperatur läuft gesondert.
const EINHEITEN = {
  laenge: { mm: 0.001, cm: 0.01, dm: 0.1, m: 1, km: 1000, zoll: 0.0254, inch: 0.0254, fuss: 0.3048, ft: 0.3048, yard: 0.9144, meile: 1609.344, mile: 1609.344, sm: 1852 },
  masse: { mg: 1e-6, g: 0.001, kg: 1, t: 1000, tonne: 1000, pfund: 0.45359237, lb: 0.45359237, unze: 0.028349523, oz: 0.028349523 },
  zeit: { ms: 0.001, s: 1, sek: 1, min: 60, h: 3600, std: 3600, tag: 86400, tage: 86400, woche: 604800, wochen: 604800 },
  daten: { bit: 1 / 8, b: 1, byte: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4 },
  flaeche: { mm2: 1e-6, cm2: 1e-4, m2: 1, km2: 1e6, ha: 1e4, hektar: 1e4, ar: 100 },
  geschwindigkeit: { 'm/s': 1, 'km/h': 1 / 3.6, kmh: 1 / 3.6, mph: 0.44704, knoten: 0.514444, kn: 0.514444 },
};
const TEMP = new Set(['c', '°c', 'celsius', 'f', '°f', 'fahrenheit', 'k', 'kelvin']);

function einheitNormal(e) {
  return String(e || '').trim().toLowerCase().replace(/\s+/g, '');
}

function tempNach(wert, von, nach) {
  const zuC = { c: (x) => x, '°c': (x) => x, celsius: (x) => x, f: (x) => (x - 32) * 5 / 9, '°f': (x) => (x - 32) * 5 / 9, fahrenheit: (x) => (x - 32) * 5 / 9, k: (x) => x - 273.15, kelvin: (x) => x - 273.15 };
  const vonC = { c: (x) => x, '°c': (x) => x, celsius: (x) => x, f: (x) => x * 9 / 5 + 32, '°f': (x) => x * 9 / 5 + 32, fahrenheit: (x) => x * 9 / 5 + 32, k: (x) => x + 273.15, kelvin: (x) => x + 273.15 };
  return vonC[nach](zuC[von](wert));
}

function umrechnen(wert, von, nach) {
  const w = Number(wert);
  if (!Number.isFinite(w)) throw new Error('Der Wert ist keine Zahl.');
  const v = einheitNormal(von);
  const n = einheitNormal(nach);
  if (!v || !n) throw new Error('Von welcher in welche Einheit?');
  if (TEMP.has(v) && TEMP.has(n)) return runde(tempNach(w, v, n));
  for (const tabelle of Object.values(EINHEITEN)) {
    if (v in tabelle && n in tabelle) return runde(w * tabelle[v] / tabelle[n]);
  }
  throw new Error(`Diese Einheiten kann ich nicht ineinander umrechnen: ${von} → ${nach}.`);
}

const runde = (x) => Math.round(x * 1e6) / 1e6;

// --- Text umwandeln ---
function textWandeln(text, art) {
  const t = String(text ?? '');
  switch (String(art || '').toLowerCase()) {
    case 'gross': case 'großschreiben': case 'upper': return t.toUpperCase();
    case 'klein': case 'kleinschreiben': case 'lower': return t.toLowerCase();
    case 'titel': case 'title': return t.replace(/\p{L}[\p{L}']*/gu, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
    case 'trim': return t.replace(/[ \t]+$/gm, '').trim();
    case 'umkehren': case 'reverse': return [...t].reverse().join('');
    case 'base64': case 'base64_kodieren': return Buffer.from(t, 'utf8').toString('base64');
    case 'base64_dekodieren': return Buffer.from(t, 'base64').toString('utf8');
    case 'url': case 'url_kodieren': return encodeURIComponent(t);
    case 'url_dekodieren': return decodeURIComponent(t);
    case 'json': case 'json_formatieren': return JSON.stringify(JSON.parse(t), null, 2);
    case 'zaehlen': case 'count': {
      const zeichen = [...t].length;
      const woerter = (t.trim().match(/\S+/g) || []).length;
      const zeilen = t === '' ? 0 : t.split(/\r?\n/).length;
      return `${zeichen} Zeichen, ${woerter} Wörter, ${zeilen} Zeilen`;
    }
    default:
      throw new Error('Diese Umwandlung kenne ich nicht (gross, klein, titel, trim, umkehren, base64, base64_dekodieren, url, url_dekodieren, json, zaehlen).');
  }
}

// --- QR-Code als Block-Grafik (im Terminal/monospace scanbar) ---
function qrText(text) {
  const s = String(text ?? '');
  if (!s) throw new Error('Kein Text für den QR-Code.');
  if (Buffer.byteLength(s) > 900) throw new Error('Der Text ist zu lang für einen QR-Code.');
  const qr = qrcode(0, 'M');
  qr.addData(s);
  qr.make();
  const n = qr.getModuleCount();
  const rand = 2;
  const dunkel = (r, c) => (r >= 0 && r < n && c >= 0 && c < n && qr.isDark(r, c));
  const zeilen = [];
  // Zwei Modulzeilen je Textzeile über die Halbblock-Zeichen ▀ ▄ █.
  for (let r = -rand; r < n + rand; r += 2) {
    let z = '';
    for (let c = -rand; c < n + rand; c++) {
      const oben = dunkel(r, c);
      const unten = dunkel(r + 1, c);
      z += oben && unten ? '█' : oben ? '▀' : unten ? '▄' : ' ';
    }
    zeilen.push(z);
  }
  return zeilen.join('\n');
}

module.exports = { rechnen, umrechnen, textWandeln, qrText, EINHEITEN };
