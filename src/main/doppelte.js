'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AUSLASSEN } = require('./projektsuche');

// Doppelte Dateien finden (Issue #26, „Boost"): sucht inhaltsgleiche Dateien in
// einem Ordner, damit man Platz freigeben kann. Rein lesend – es wird nichts
// gelöscht oder verändert. Vorgehen (schnell und schonend):
//   1) Dateien nach Größe gruppieren (billig, ohne zu lesen).
//   2) Nur in Gruppen mit gleicher Größe die Dateien hashen (SHA-1).
//   3) Gleicher Hash = inhaltsgleich → als Dublette melden.
// So wird nur gelesen, was wirklich verdächtig ist.

const MIN_GROESSE = 1; // 0-Byte-Dateien sind alle „gleich", das ist selten gemeint

function hashDatei(datei) {
  const h = crypto.createHash('sha1');
  h.update(fs.readFileSync(datei));
  return h.digest('hex');
}

// Alle Dateien (rekursiv) unter `ordner` einsammeln – Build-/System-Ordner aus.
function dateienSammeln(ordner, maxDateien) {
  const raus = [];
  const stapel = [ordner];
  while (stapel.length && raus.length < maxDateien) {
    const akt = stapel.pop();
    let eintraege;
    try { eintraege = fs.readdirSync(akt, { withFileTypes: true }); } catch { continue; }
    for (const d of eintraege) {
      const p = path.join(akt, d.name);
      if (d.isDirectory()) {
        if (!AUSLASSEN.has(d.name) && !d.name.startsWith('.')) stapel.push(p);
        continue;
      }
      if (!d.isFile()) continue;
      let groesse;
      try { groesse = fs.statSync(p).size; } catch { continue; }
      raus.push({ pfad: p, groesse });
      if (raus.length >= maxDateien) break;
    }
  }
  return raus;
}

// Findet Gruppen inhaltsgleicher Dateien. Optionen:
//   maxDateien  – höchstens so viele Dateien betrachten (Schutz, Standard 20000)
//   minGroesse  – Dateien kleiner als das ignorieren (Standard 1 Byte)
// Rückgabe: { gruppen:[{ groesse, dateien:[pfad] }], geprueft, verschwendet }
// „verschwendet" = wie viele Bytes die überzähligen Kopien belegen.
function finden(ordner, { maxDateien = 20000, minGroesse = MIN_GROESSE } = {}) {
  const dateien = dateienSammeln(ordner, maxDateien).filter((d) => d.groesse >= minGroesse);
  // 1) nach Größe gruppieren
  const nachGroesse = new Map();
  for (const d of dateien) {
    if (!nachGroesse.has(d.groesse)) nachGroesse.set(d.groesse, []);
    nachGroesse.get(d.groesse).push(d.pfad);
  }
  const gruppen = [];
  let verschwendet = 0;
  // 2) nur gleich große hashen
  for (const [groesse, pfade] of nachGroesse) {
    if (pfade.length < 2) continue;
    const nachHash = new Map();
    for (const p of pfade) {
      let hash;
      try { hash = hashDatei(p); } catch { continue; }
      if (!nachHash.has(hash)) nachHash.set(hash, []);
      nachHash.get(hash).push(p);
    }
    for (const gleiche of nachHash.values()) {
      if (gleiche.length < 2) continue;
      gruppen.push({ groesse, dateien: gleiche.sort() });
      verschwendet += groesse * (gleiche.length - 1);
    }
  }
  // größte Platzverschwender zuerst
  gruppen.sort((a, b) => b.groesse * (b.dateien.length - 1) - a.groesse * (a.dateien.length - 1));
  return { gruppen, geprueft: dateien.length, verschwendet };
}

module.exports = { finden, dateienSammeln, hashDatei };
