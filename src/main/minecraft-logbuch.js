'use strict';

const fs = require('fs');
const path = require('path');

// Tägliches Spiel-Logbuch für Minecraft. Jeder Eintrag wird sofort an die
// Tagesdatei angehängt (eine Zeile JSON), damit bei einem Absturz nichts
// verloren geht – das Logbuch überlebt, auch wenn Julia oder der PC neu starten.
// Pro Tag eine Datei minecraft-JJJJ-MM-TT.jsonl im Logbuch-Ordner.
// So kann der Nutzer nach einem Spieltag nachsehen (oder es Claude schicken),
// was Julia geschafft hat und wo sie hängen blieb.

function tagesStempel(d = new Date()) {
  return d.toISOString().slice(0, 10); // JJJJ-MM-TT (lokal genügt für die Datei)
}

class Logbuch {
  constructor({ ordner, maxSpeicher = 300 } = {}) {
    this.ordner = ordner;
    this.maxSpeicher = maxSpeicher;
    this.jüngste = []; // die letzten Einträge im Speicher (für schnelle Zusammenfassung)
  }

  datei(datum = tagesStempel()) {
    return path.join(this.ordner, `minecraft-${datum}.jsonl`);
  }

  // Einen Eintrag schreiben. art z. B. 'start', 'ziel', 'tod', 'fehler', 'fund',
  // 'fortschritt', 'chat'. Schlägt das Schreiben fehl, darf das Spiel nicht daran
  // scheitern – der Eintrag bleibt dann wenigstens im Speicher.
  eintrag(art, text, extra = {}) {
    const e = { zeit: new Date().toISOString(), art: String(art || 'info'), text: String(text || '').slice(0, 500), ...extra };
    this.jüngste.push(e);
    if (this.jüngste.length > this.maxSpeicher) this.jüngste.shift();
    if (!this.ordner) return e;
    try {
      fs.mkdirSync(this.ordner, { recursive: true });
      fs.appendFileSync(this.datei(e.zeit.slice(0, 10)), JSON.stringify(e) + '\n', 'utf8');
    } catch { /* Platte voll o. Ä. – Eintrag bleibt im Speicher */ }
    return e;
  }

  // Alle Einträge eines Tages von der Platte lesen (kaputte Zeilen werden übersprungen).
  lesen(datum = tagesStempel()) {
    try {
      const roh = fs.readFileSync(this.datei(datum), 'utf8');
      return roh.split('\n').filter(Boolean).map((z) => { try { return JSON.parse(z); } catch { return null; } }).filter(Boolean);
    } catch { return []; }
  }

  // Welche Tage gibt es (neueste zuerst)?
  tage() {
    try {
      return fs.readdirSync(this.ordner)
        .map((n) => /^minecraft-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(n))
        .filter(Boolean).map((m) => m[1]).sort().reverse();
    } catch { return []; }
  }

  // Kurze Zusammenfassung eines Tages: Anzahl je Art, erreichte Ziele, Tode,
  // Fehler und der letzte Stand. Für „Was hat sie heute geschafft?“.
  zusammenfassung(datum = tagesStempel()) {
    const eintraege = this.lesen(datum);
    if (!eintraege.length) return `Für ${datum} gibt es noch kein Logbuch.`;
    const zaehl = {};
    const ziele = [];
    const fehler = [];
    let tode = 0;
    let letzterStand = null;
    for (const e of eintraege) {
      zaehl[e.art] = (zaehl[e.art] || 0) + 1;
      if (e.art === 'ziel') ziele.push(e.text);
      else if (e.art === 'tod') tode += 1;
      else if (e.art === 'fehler') fehler.push(e.text);
      if (e.art === 'fortschritt' && e.aktuell) letzterStand = e;
    }
    const zeilen = [`Logbuch ${datum}: ${eintraege.length} Einträge.`];
    if (ziele.length) zeilen.push(`Erreichte Ziele (${ziele.length}): ${[...new Set(ziele)].join(', ')}.`);
    if (letzterStand) zeilen.push(`Zuletzt dran: ${letzterStand.aktuell}${letzterStand.prozent != null ? ` (${letzterStand.prozent}%)` : ''}.`);
    if (tode) zeilen.push(`Gestorben: ${tode}×.`);
    if (fehler.length) zeilen.push(`Fehler (${fehler.length}): ${[...new Set(fehler)].slice(0, 5).join(' · ')}.`);
    return zeilen.join('\n');
  }
}

module.exports = { Logbuch, tagesStempel };
