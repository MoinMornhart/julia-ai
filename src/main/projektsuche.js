'use strict';

const fs = require('fs');
const path = require('path');

// Tokensparende Projekt-/Code-Suche (Issue #20, „Indexing für Projekte"):
// durchsucht Textdateien unter einem Ordner nach einem Text oder einem regulären
// Ausdruck und gibt nur die Fundstellen (Datei + Zeile + Zeilentext) zurück, statt
// ganze Dateien zu lesen. So findet Julia die richtige Stelle schnell, ohne viele
// Dateien einzeln durchzugehen.

// Typische Ordner, die nichts zur Suche beitragen und viel Zeit kosten würden.
const AUSLASSEN = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out', '.next',
  '.nuxt', '.cache', 'coverage', '__pycache__', '.venv', 'venv', '.idea', '.vs',
]);
const MAX_DATEI = 2 * 1024 * 1024; // 2 MB pro Datei – größeres ist selten Quelltext
const BINAER_PROBE = 8000;

function istBinaer(buf) {
  const n = Math.min(buf.length, BINAER_PROBE);
  for (let i = 0; i < n; i += 1) if (buf[i] === 0) return true;
  return false;
}

function endungNormal(x) {
  const s = String(x).toLowerCase();
  return s.startsWith('.') ? s : `.${s}`;
}

// Sucht in `ordner` nach `muster`. Optionen:
//   maxTreffer  – höchstens so viele Fundstellen (Standard 100)
//   maxDateien  – höchstens so viele Dateien prüfen (Schutz, Standard 5000)
//   endungen    – nur diese Dateiendungen (z. B. ['.js', '.ts'])
//   regex       – `muster` als regulärer Ausdruck werten
//   grossKlein  – Groß-/Kleinschreibung beachten (Standard: egal)
// Gibt { treffer:[{datei,zeile,text}], geprueft, abgeschnitten } zurück.
function suchen(ordner, muster, { maxTreffer = 100, maxDateien = 5000, endungen = null, regex = false, grossKlein = false } = {}) {
  if (muster == null || String(muster) === '') throw new Error('Suchtext fehlt.');
  const grenzeTreffer = Math.max(1, maxTreffer);
  const ends = Array.isArray(endungen) && endungen.length ? endungen.map(endungNormal) : null;
  let re = null;
  if (regex) {
    try { re = new RegExp(String(muster), grossKlein ? '' : 'i'); } catch (e) { throw new Error(`Ungültiger regulärer Ausdruck: ${e.message}`); }
  }
  const nadel = grossKlein ? String(muster) : String(muster).toLowerCase();

  const treffer = [];
  let geprueft = 0;
  const stapel = [ordner];
  while (stapel.length && treffer.length < grenzeTreffer && geprueft < maxDateien) {
    const akt = stapel.pop();
    let eintraege;
    try { eintraege = fs.readdirSync(akt, { withFileTypes: true }); } catch { continue; }
    for (const d of eintraege) {
      if (treffer.length >= grenzeTreffer) break;
      const p = path.join(akt, d.name);
      if (d.isDirectory()) {
        if (!AUSLASSEN.has(d.name) && !d.name.startsWith('.')) stapel.push(p);
        continue;
      }
      if (!d.isFile()) continue;
      if (ends && !ends.includes(path.extname(d.name).toLowerCase())) continue;
      geprueft += 1;
      if (geprueft > maxDateien) break;
      let buf;
      try {
        const st = fs.statSync(p);
        if (st.size > MAX_DATEI) continue;
        buf = fs.readFileSync(p);
      } catch { continue; }
      if (istBinaer(buf)) continue;
      const zeilen = buf.toString('utf8').split(/\r?\n/);
      for (let i = 0; i < zeilen.length; i += 1) {
        const z = zeilen[i];
        const passt = re ? re.test(z) : (grossKlein ? z : z.toLowerCase()).includes(nadel);
        if (passt) {
          treffer.push({ datei: p, zeile: i + 1, text: z.trim().slice(0, 200) });
          if (treffer.length >= grenzeTreffer) break;
        }
      }
    }
  }
  return { treffer, geprueft, abgeschnitten: treffer.length >= grenzeTreffer };
}

module.exports = { suchen, istBinaer, AUSLASSEN };
