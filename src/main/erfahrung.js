'use strict';

// Julias kleiner Erfahrungs-/Skill-Lerner (Issue #65) – der erreichbare,
// ehrliche Kern des Wunsches „eigene Julia, die laufend dazulernt, ohne GB/RAM".
//
// Idee (siehe docs/eigene-ki.md): KEIN eigenes Sprachmodell und KEIN neuronales
// Netz. Stattdessen eine winzige, erklärbare Statistik über „in dieser Lage hat
// diese Aktion so gut funktioniert". Sie wächst in Kilobyte, nicht in Gigabyte,
// lernt bei jeder Rückmeldung mit einem billigen Update (keine GPU, kein Training)
// und schlägt bei engen, überprüfbaren Aufgaben (Minecraft-Züge, feste Abläufe)
// den bewährten Weg vor. Ergänzung zur Sprach-KI, kein Ersatz.
//
// Bewusst pur (keine Electron-/Datei-Abhängigkeit im Kern), damit gut testbar.
// Persistenz macht der Aufrufer über `ausJson`/`alsJson`.

// Obergrenzen, damit die Datei klein bleibt („KB statt GB"): wird es voller,
// fliegt das am seltensten genutzte / schwächste zuerst raus.
const MAX_LAGEN = 500;      // verschiedene Situationen
const MAX_AKTIONEN = 40;    // Aktionen je Situation

// Ein Eintrag je (Lage, Aktion): wie oft versucht, Summe der Belohnungen,
// wann zuletzt genutzt (für das Aufräumen).
function neuerEintrag() {
  return { versuche: 0, summe: 0, zuletzt: 0 };
}

class ErfahrungsLerner {
  constructor() {
    // lage -> (aktion -> Eintrag)
    this.lagen = new Map();
    this._uhr = 0; // monoton steigend, für „zuletzt genutzt"
  }

  // Eine gemachte Erfahrung festhalten. `belohnung` ist eine Zahl
  // (z. B. 1 = hat geklappt, 0 = nichts, negativ = schädlich).
  beobachten(lage, aktion, belohnung = 1) {
    lage = String(lage);
    aktion = String(aktion);
    if (!Number.isFinite(belohnung)) belohnung = 0;

    let aktionen = this.lagen.get(lage);
    if (!aktionen) {
      aktionen = new Map();
      this.lagen.set(lage, aktionen);
    }
    let e = aktionen.get(aktion);
    if (!e) {
      e = neuerEintrag();
      aktionen.set(aktion, e);
    }
    e.versuche += 1;
    e.summe += belohnung;
    e.zuletzt = ++this._uhr;

    this._aufraeumen(lage, aktionen);
    return this;
  }

  // Durchschnittliche Belohnung einer Aktion in einer Lage (0, wenn unbekannt),
  // plus wie oft sie schon versucht wurde (Vertrauen).
  bewertung(lage, aktion) {
    const aktionen = this.lagen.get(String(lage));
    const e = aktionen && aktionen.get(String(aktion));
    if (!e || e.versuche === 0) return { schnitt: 0, versuche: 0 };
    return { schnitt: e.summe / e.versuche, versuche: e.versuche };
  }

  // Die in dieser Lage bewährteste Aktion vorschlagen. `kandidaten` (optional)
  // grenzt die erlaubten Aktionen ein. Ohne Erfahrung: erster Kandidat bzw. null.
  // `erkunden` (0..1): mit dieser Wahrscheinlichkeit bewusst etwas Neues/selten
  // Probiertes wählen, damit der Lerner nicht in einem lokalen Optimum klebt.
  vorschlag(lage, kandidaten = null, erkunden = 0) {
    const aktionen = this.lagen.get(String(lage));
    const liste = kandidaten && kandidaten.length ? kandidaten.map(String) : null;

    if (!aktionen || aktionen.size === 0) {
      return liste ? liste[0] : null;
    }

    // Gelegentlich erkunden: die am seltensten versuchte erlaubte Aktion wählen.
    if (erkunden > 0 && Math.random() < erkunden) {
      const erkundet = this._seltenste(aktionen, liste);
      if (erkundet) return erkundet;
    }

    let beste = null;
    let besterSchnitt = -Infinity;
    let besteVersuche = -1;
    for (const [aktion, e] of aktionen) {
      if (liste && !liste.includes(aktion)) continue;
      if (e.versuche === 0) continue;
      const schnitt = e.summe / e.versuche;
      // Höherer Schnitt gewinnt; bei Gleichstand die besser belegte Aktion.
      if (schnitt > besterSchnitt || (schnitt === besterSchnitt && e.versuche > besteVersuche)) {
        beste = aktion;
        besterSchnitt = schnitt;
        besteVersuche = e.versuche;
      }
    }
    // Kein Erfahrungswert unter den Kandidaten? Dann den ersten Kandidaten nehmen.
    if (beste === null && liste) return liste[0];
    return beste;
  }

  // Eine seltene, erlaubte Aktion für die Erkundung finden.
  _seltenste(aktionen, liste) {
    let ziel = null;
    let min = Infinity;
    for (const [aktion, e] of aktionen) {
      if (liste && !liste.includes(aktion)) continue;
      if (e.versuche < min) {
        min = e.versuche;
        ziel = aktion;
      }
    }
    return ziel;
  }

  // Zu viele Aktionen in einer Lage? Die schwächste (schlechtester Schnitt,
  // dann am ältesten) entfernen. Zu viele Lagen? Die am längsten ungenutzte raus.
  _aufraeumen(lage, aktionen) {
    if (aktionen.size > MAX_AKTIONEN) {
      let raus = null;
      let schlechtester = Infinity;
      let aeltester = Infinity;
      for (const [aktion, e] of aktionen) {
        const schnitt = e.versuche ? e.summe / e.versuche : 0;
        if (schnitt < schlechtester || (schnitt === schlechtester && e.zuletzt < aeltester)) {
          raus = aktion;
          schlechtester = schnitt;
          aeltester = e.zuletzt;
        }
      }
      if (raus !== null) aktionen.delete(raus);
    }

    if (this.lagen.size > MAX_LAGEN) {
      let raus = null;
      let aeltester = Infinity;
      for (const [l, akt] of this.lagen) {
        if (l === lage) continue; // die gerade benutzte Lage nicht wegwerfen
        let jung = 0;
        for (const e of akt.values()) if (e.zuletzt > jung) jung = e.zuletzt;
        if (jung < aeltester) {
          aeltester = jung;
          raus = l;
        }
      }
      if (raus !== null) this.lagen.delete(raus);
    }
  }

  // Kompakt für die Persistenz serialisieren (klein halten).
  alsJson() {
    const o = { uhr: this._uhr, lagen: {} };
    for (const [lage, aktionen] of this.lagen) {
      const a = {};
      for (const [aktion, e] of aktionen) {
        a[aktion] = [e.versuche, e.summe, e.zuletzt];
      }
      o.lagen[lage] = a;
    }
    return o;
  }

  // Aus einer (evtl. fehlerhaften) Persistenz wiederherstellen – nie werfen.
  static ausJson(o) {
    const lerner = new ErfahrungsLerner();
    if (!o || typeof o !== 'object' || !o.lagen || typeof o.lagen !== 'object') return lerner;
    lerner._uhr = Number.isFinite(o.uhr) ? o.uhr : 0;
    for (const lage of Object.keys(o.lagen)) {
      const a = o.lagen[lage];
      if (!a || typeof a !== 'object') continue;
      const aktionen = new Map();
      for (const aktion of Object.keys(a)) {
        const w = a[aktion];
        if (!Array.isArray(w)) continue;
        const versuche = Number(w[0]) || 0;
        const summe = Number(w[1]) || 0;
        const zuletzt = Number(w[2]) || 0;
        if (versuche > 0) aktionen.set(aktion, { versuche, summe, zuletzt });
      }
      if (aktionen.size) lerner.lagen.set(lage, aktionen);
    }
    return lerner;
  }
}

module.exports = { ErfahrungsLerner, MAX_LAGEN, MAX_AKTIONEN };
