'use strict';

const fs = require('fs');
const path = require('path');

// Alles, was über GRÜN hinausging, landet hier: Installationen, Änderungen
// außerhalb der Arbeitsverzeichnisse, Systemeingriffe. So lässt sich jeder
// Schritt nachvollziehen und zurücknehmen (Abschnitt 7).

class Protokoll {
  constructor(ordner) {
    this.datei = path.join(ordner, 'protokoll.jsonl');
    this.vormerkDatei = path.join(ordner, 'vorgemerkt.json');
  }

  eintragen(eintrag) {
    fs.mkdirSync(path.dirname(this.datei), { recursive: true });
    const zeile = JSON.stringify({ zeit: new Date().toISOString(), ...eintrag });
    fs.appendFileSync(this.datei, zeile + '\n', 'utf8');
  }

  letzte(anzahl = 20) {
    try {
      return fs.readFileSync(this.datei, 'utf8')
        .split('\n').filter(Boolean).slice(-anzahl)
        .map((z) => JSON.parse(z));
    } catch {
      return [];
    }
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

module.exports = { Protokoll };
