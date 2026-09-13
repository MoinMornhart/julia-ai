'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Alles, was über GRÜN hinausging, landet hier: Installationen, Änderungen
// außerhalb der Arbeitsverzeichnisse, Systemeingriffe, Aufträge vom Handy.
// So lässt sich jeder Schritt nachvollziehen und zurücknehmen (Abschnitt 7).
//
// Seit 0.7.1 ist das Protokoll eine Prüfsummen-Kette: Jeder Eintrag enthält
// die Prüfsumme des vorigen. Wer mittendrin etwas ändert oder löscht, bricht
// die Kette, und pruefen() zeigt die Stelle. Grenze: Wer die ganze Datei neu
// schreibt oder den letzten Eintrag abschneidet, fällt damit nicht auf.

const START = '0'.repeat(64);

function pruefsumme(vorher, inhalt) {
  return crypto.createHash('sha256').update(`${vorher}\n${JSON.stringify(inhalt)}`).digest('hex');
}

class Protokoll {
  constructor(ordner) {
    this.datei = path.join(ordner, 'protokoll.jsonl');
    this.vormerkDatei = path.join(ordner, 'vorgemerkt.json');
    this.letzterHash = null;
  }

  _zeilen() {
    try {
      return fs.readFileSync(this.datei, 'utf8').split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  _letzterHash() {
    if (this.letzterHash) return this.letzterHash;
    const zeilen = this._zeilen();
    for (let i = zeilen.length - 1; i >= 0; i--) {
      try {
        const e = JSON.parse(zeilen[i]);
        if (e.hash) return (this.letzterHash = e.hash);
      } catch { /* kaputte Zeile, weiter oben suchen */ }
    }
    return (this.letzterHash = START);
  }

  eintragen(eintrag) {
    fs.mkdirSync(path.dirname(this.datei), { recursive: true });
    const vorher = this._letzterHash();
    const inhalt = { zeit: new Date().toISOString(), ...eintrag, vorher };
    const hash = pruefsumme(vorher, inhalt);
    fs.appendFileSync(this.datei, JSON.stringify({ ...inhalt, hash }) + '\n', 'utf8');
    this.letzterHash = hash;
  }

  letzte(anzahl = 20) {
    return this._zeilen().slice(-anzahl).map((z) => {
      try { return JSON.parse(z); } catch { return { kaputt: z.slice(0, 200) }; }
    });
  }

  // Einträge aus Versionen vor 0.7.1 haben keine Prüfsumme; sie zählen als
  // ungeprüft, solange sie vor dem ersten geprüften Eintrag stehen.
  pruefen() {
    const zeilen = this._zeilen();
    let vorher = null;
    let geprueft = 0;
    let ungeprueft = 0;
    for (let i = 0; i < zeilen.length; i++) {
      let e;
      try { e = JSON.parse(zeilen[i]); } catch {
        return { ok: false, zeile: i + 1, grund: 'Zeile ist kein gültiges JSON', geprueft, ungeprueft };
      }
      if (!e.hash) {
        if (vorher === null) { ungeprueft += 1; continue; }
        return { ok: false, zeile: i + 1, grund: 'Eintrag ohne Prüfsumme mitten in der Kette', geprueft, ungeprueft };
      }
      const { hash, ...inhalt } = e;
      if (inhalt.vorher !== (vorher ?? START)) {
        return { ok: false, zeile: i + 1, grund: 'Kette unterbrochen – ein Eintrag davor fehlt oder wurde geändert', geprueft, ungeprueft };
      }
      if (pruefsumme(inhalt.vorher, inhalt) !== hash) {
        return { ok: false, zeile: i + 1, grund: 'Eintrag wurde nachträglich geändert', geprueft, ungeprueft };
      }
      vorher = hash;
      geprueft += 1;
    }
    return { ok: true, geprueft, ungeprueft };
  }

  // Kanal "auto": GELB wird nicht ausgeführt, sondern für später vorgemerkt.
  vormerken(eintrag) {
    const liste = this.vorgemerkt();
    liste.push({ zeit: new Date().toISOString(), ...eintrag });
    fs.writeFileSync(this.vormerkDatei, JSON.stringify(liste, null, 2), 'utf8');
  }

  vorgemerkt() {
    try {
      return JSON.parse(fs.readFileSync(this.vormerkDatei, 'utf8'));
    } catch {
      return [];
    }
  }

  vorgemerktLeeren() {
    try { fs.unlinkSync(this.vormerkDatei); } catch { /* war schon leer */ }
  }
}

module.exports = { Protokoll, pruefsumme, START };
