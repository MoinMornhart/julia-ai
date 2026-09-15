'use strict';

const fs = require('fs');
const path = require('path');
const diagnose = require('./diagnose');

// Leistungs-Logbuch für die PC-Steuerung.
//
// Hintergrund (Issue #19/#25): Bei der PC-Steuerung kam es zu einer CPU-Spitze,
// und die Frage war: „Welche Sachen müssen geloggt werden – und (wenn erlaubt) an
// den Dev gesendet werden?" Hier ist die verbindliche Antwort in Code:
//
// GELOGGT wird (lokal, überlebt Abstürze) pro PC-Steuerungs-Aktion NUR Technisches:
//   - Zeitpunkt
//   - Aktions-Name aus festem Vokabular (z. B. `klick`, `tippen`, `screenshot`) –
//     NICHT der getippte Text, NICHT Koordinaten, NICHT der Fenstertitel
//   - Dauer der Aktion (ms, Wanduhr)
//   - Julias EIGENER CPU-Verbrauch dabei (ms) – über das billige, prozessinterne
//     process.cpuUsage(); es wird KEIN PowerShell/WMIC aufgerufen, damit das Messen
//     nicht selbst Last erzeugt (das war ja das Problem)
//   - Julias Arbeitsspeicher (RSS in MB)
//
// NIEMALS gespeichert oder gesendet: Screenshot-Inhalte, getippter Text, Passwörter,
// Fenster-/Dateinamen, Bildschirminhalt, IP-Adressen, Tokens, Benutzername, E-Mail.
//
// GESENDET (an den Dev) wird ausschließlich eine aggregierte, durch den Scrubber
// (diagnose.bereinigen) geführte Zusammenfassung – und nur, wenn der Nutzer die
// Diagnose ausdrücklich eingeschaltet hat (Einstellung diagnose.senden, Standard aus).

// Werkzeuge, die den PC direkt steuern. Nur bei diesen wird gemessen/geloggt.
const PC_STEUERUNG = new Set([
  'klick', 'scrollen', 'tippen', 'taste', 'screenshot',
  'programm_oeffnen', 'programm_schliessen',
  'fenster_fokussieren', 'fenster_anordnen', 'fenster_auflisten', 'medien',
]);

function tagesStempel(d = new Date()) {
  return d.toISOString().slice(0, 10); // JJJJ-MM-TT
}

class Leistungslog {
  constructor({ ordner, maxSpeicher = 1000 } = {}) {
    this.ordner = ordner;
    this.maxSpeicher = maxSpeicher;
    this.jüngste = [];
  }

  datei(datum = tagesStempel()) {
    return path.join(this.ordner, `leistung-${datum}.jsonl`);
  }

  // Eine PC-Steuerungs-Aktion festhalten. Bewusst inhaltsfrei (siehe Kopf).
  notieren({ aktion, dauerMs, cpuMs, rssMb, fehler = false } = {}) {
    const e = {
      zeit: new Date().toISOString(),
      aktion: String(aktion || 'unbekannt').slice(0, 40),
      dauerMs: Math.max(0, Math.round(Number(dauerMs) || 0)),
      cpuMs: Math.max(0, Math.round(Number(cpuMs) || 0)),
      rssMb: Math.max(0, Math.round(Number(rssMb) || 0)),
      ...(fehler ? { fehler: true } : {}),
    };
    this.jüngste.push(e);
    if (this.jüngste.length > this.maxSpeicher) this.jüngste.shift();
    if (!this.ordner) return e;
    try {
      fs.mkdirSync(this.ordner, { recursive: true });
      fs.appendFileSync(this.datei(e.zeit.slice(0, 10)), JSON.stringify(e) + '\n', 'utf8');
    } catch { /* Platte voll o. Ä. – Eintrag bleibt im Speicher */ }
    return e;
  }

  // Eine Aktion messen und ausführen: misst Julias eigenen CPU-Verbrauch und die
  // Dauer, ohne selbst nennenswert Last zu erzeugen. Wirft der Aufruf, wird der
  // Fehler markiert weitergeworfen (die Messung trotzdem geschrieben).
  async messen(aktion, fn) {
    const cpu0 = process.cpuUsage();
    const t0 = Date.now();
    let fehler = false;
    try {
      return await fn();
    } catch (err) {
      fehler = true;
      throw err;
    } finally {
      const d = process.cpuUsage(cpu0);
      let rssMb = 0;
      try { rssMb = process.memoryUsage().rss / (1024 * 1024); } catch { /* egal */ }
      this.notieren({ aktion, dauerMs: Date.now() - t0, cpuMs: (d.user + d.system) / 1000, rssMb, fehler });
    }
  }

  lesen(datum = tagesStempel()) {
    try {
      const roh = fs.readFileSync(this.datei(datum), 'utf8');
      return roh.split('\n').filter(Boolean)
        .map((z) => { try { return JSON.parse(z); } catch { return null; } })
        .filter(Boolean);
    } catch { return []; }
  }

  tage() {
    try {
      return fs.readdirSync(this.ordner)
        .map((n) => /^leistung-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(n))
        .filter(Boolean).map((m) => m[1]).sort().reverse();
    } catch { return []; }
  }

  // Aggregierte, rein technische Kennzahlen eines Tages – ohne jeden Inhalt.
  zusammenfassung(datum = tagesStempel()) {
    const eintraege = this.lesen(datum);
    const proAktion = {};
    let cpuMsGesamt = 0;
    let rssMax = 0;
    let langsamste = null;
    let teuerste = null;
    let fehler = 0;
    for (const e of eintraege) {
      const a = (proAktion[e.aktion] || (proAktion[e.aktion] = { anzahl: 0, cpuMs: 0 }));
      a.anzahl += 1;
      a.cpuMs += e.cpuMs || 0;
      cpuMsGesamt += e.cpuMs || 0;
      if ((e.rssMb || 0) > rssMax) rssMax = e.rssMb || 0;
      if (!langsamste || (e.dauerMs || 0) > langsamste.dauerMs) langsamste = { aktion: e.aktion, dauerMs: e.dauerMs || 0 };
      if (!teuerste || (e.cpuMs || 0) > teuerste.cpuMs) teuerste = { aktion: e.aktion, cpuMs: e.cpuMs || 0 };
      if (e.fehler) fehler += 1;
    }
    return { datum, anzahl: eintraege.length, proAktion, cpuMsGesamt: Math.round(cpuMsGesamt), rssMaxMb: Math.round(rssMax), langsamste, teuerste, fehler };
  }

  // Der Text, der (nur mit Zustimmung) an den Dev gehen darf: aggregiert und durch
  // den Scrubber geführt. Enthält keine Inhalte, keine Namen, keine Koordinaten.
  berichtFuerDev(datum = tagesStempel()) {
    const z = this.zusammenfassung(datum);
    if (!z.anzahl) return `PC-Steuerung ${datum}: keine Aktionen aufgezeichnet.`;
    const top = Object.entries(z.proAktion)
      .sort((a, b) => b[1].cpuMs - a[1].cpuMs).slice(0, 6)
      .map(([name, v]) => `${name}: ${v.anzahl}× (${Math.round(v.cpuMs)} ms CPU)`);
    const zeilen = [
      `PC-Steuerung ${datum}: ${z.anzahl} Aktionen, zusammen ${z.cpuMsGesamt} ms Julia-CPU, Speicher-Spitze ${z.rssMaxMb} MB${z.fehler ? `, ${z.fehler} Fehler` : ''}.`,
      z.teuerste ? `CPU-intensivste Aktion: ${z.teuerste.aktion} (${z.teuerste.cpuMs} ms).` : '',
      z.langsamste ? `Längste Aktion: ${z.langsamste.aktion} (${z.langsamste.dauerMs} ms).` : '',
      top.length ? `Nach CPU: ${top.join(' · ')}.` : '',
    ].filter(Boolean).join('\n');
    return diagnose.bereinigen(zeilen);
  }
}

module.exports = { Leistungslog, PC_STEUERUNG, tagesStempel };
