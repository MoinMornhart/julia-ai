'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const { dateiLaden } = require('./laden');

// Whisper (whisper.cpp) schreibt auf, was du sagst – lokal auf diesem PC, der
// Ton verlässt ihn nie. Windows erkennt weiter, wann du anfängst und aufhörst
// zu sprechen; nur das Aufschreiben übernimmt Whisper, weil die alte
// Windows-Erkennung auf Deutsch vieles falsch versteht. Das Programm liegt dem
// Installer bei, das Sprachmodell wird einmal geladen – geprüft gegen eine feste
// SHA-256-Summe, sonst wird es nicht benutzt.

const QUELLE = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/';
const MODELLE = {
  schnell: { datei: 'ggml-base-q5_1.bin', groesse: 59707625, sha256: '422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898' },
  genau: { datei: 'ggml-small-q5_1.bin', groesse: 190085487, sha256: 'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb' },
};
const MAX_SEKUNDEN = 60;

// Bei Stille erfindet Whisper gern Sätze aus Untertiteln – die zählen als nichts.
const ERFUNDEN = [
  /^untertitel(ung)?\b/i, /amara\.org/i, /^vielen dank (fürs|für's|für das|für ihre)/i,
  /^(thanks|thank you) for watching/i, /^copyright\b/i, /^swr \d/i, /^zdf\b/i,
];
const GERAEUSCH = /musik|music|lachen|laughs?|applaus|applause|stille|silence|geräusch|noise|husten|seufz/i;

function textAufbereiten(roh) {
  const t = String(roh || '')
    .replace(/\[[^\]]*\]/g, ' ') // [BLANK_AUDIO], [Musik]
    .replace(/\(([^)]*)\)/g, (m, innen) => (GERAEUSCH.test(innen) ? ' ' : m))
    .replace(/\*[^*]*\*/g, ' ') // *Musik*
    .replace(/\s+/g, ' ')
    .trim();
  if (ERFUNDEN.some((r) => r.test(t))) return '';
  if (/^[\s.,!?…-]*$/.test(t)) return '';
  return t;
}

// Wie lang ist die Aufnahme? Aus dem WAV-Kopf (Bytes pro Sekunde, Datenlänge).
function wavSekunden(datei) {
  try {
    const b = fs.readFileSync(datei);
    const proSekunde = b.readUInt32LE(28);
    let pos = 12;
    while (pos + 8 <= b.length) {
      const id = b.toString('ascii', pos, pos + 4);
      const laenge = b.readUInt32LE(pos + 4);
      if (id === 'data') return proSekunde ? Math.min(laenge, b.length - pos - 8) / proSekunde : 0;
      pos += 8 + laenge + (laenge % 2);
    }
  } catch { /* unbekannt: volles Fenster */ }
  return 0;
}

// Whisper rechnet sonst immer ein 30-Sekunden-Fenster. Für einen kurzen Satz
// reicht ein kleineres: 50 Schritte je Sekunde plus Reserve (gemessen: etwa
// fünfmal schneller, derselbe Text). 0 heißt volles Fenster.
function tonFenster(sekunden) {
  if (!(sekunden > 0)) return 0;
  return Math.min(1500, Math.max(256, Math.ceil(Math.round((sekunden + 1.5) * 50 * 1000) / 1000)));
}

// Genug Kerne fürs Tempo, aber Luft fürs Spiel daneben.
function threads(kerne = os.cpus().length) {
  return Math.max(2, Math.min(8, kerne - 2));
}

class Whisper extends EventEmitter {
  // ordner: hier liegen die Modelle; programmOrdner: whisper-cli.exe samt DLLs.
  // holen: fetch-kompatibel (im Programm net.fetch); starten: spawn (für Tests).
  constructor({ ordner, programmOrdner, holen = (u, o) => globalThis.fetch(u, o), starten = spawn, modelle = MODELLE }) {
    super();
    this.ordner = ordner;
    this.programmOrdner = programmOrdner;
    this.holen = holen;
    this.starten = starten;
    this.modelle = modelle;
    this.laden = null;
    this.fehler = null;
  }

  get programm() {
    const p = path.join(this.programmOrdner, 'whisper-cli.exe');
    return fs.existsSync(p) ? p : null;
  }

  modellPfad(stufe) {
    return path.join(this.ordner, this.modelle[stufe].datei);
  }

  // Bereit, wenn das Programm da ist und das Modell vollständig (die Summe
  // wurde beim Laden geprüft; halbe Dateien heißen .teil).
  bereit(stufe) {
    const m = this.modelle[stufe];
    if (!m || !this.programm) return false;
    try { return fs.statSync(this.modellPfad(stufe)).size === m.groesse; } catch { return false; }
  }

  status() {
    return {
      programm: !!this.programm,
      modelle: Object.fromEntries(Object.entries(this.modelle).map(([k, m]) => [k, { bereit: this.bereit(k), mb: Math.round(m.groesse / 1e6) }])),
      laedt: this.laden ? { stufe: this.laden.stufe, geladen: this.laden.geladen, gesamt: this.laden.gesamt } : null,
      fehler: this.fehler,
    };
  }

  async herunterladen(stufe) {
    const m = this.modelle[stufe];
    if (!m) throw new Error('Unbekanntes Whisper-Modell.');
    if (this.bereit(stufe)) return true;
    if (this.laden) return this.laden.versprechen;
    const abbruch = new AbortController();
    this.fehler = null;
    const laden = { stufe, geladen: 0, gesamt: m.groesse, abbruch };
    this.laden = laden;
    this.emit('status');
    let zuletzt = 0;
    const fortschritt = (n) => {
      laden.geladen = n;
      if (Date.now() - zuletzt > 250) { zuletzt = Date.now(); this.emit('status'); }
    };
    laden.versprechen = (async () => {
      try {
        await dateiLaden({ holen: this.holen, url: QUELLE + m.datei, ziel: this.modellPfad(stufe), groesse: m.groesse, sha256: m.sha256, signal: abbruch.signal, fortschritt });
        return true;
      } catch (e) {
        this.fehler = abbruch.signal.aborted ? null : e.message;
        throw e;
      } finally {
        this.laden = null;
        this.emit('status');
      }
    })();
    return laden.versprechen;
  }

  abbrechen() {
    if (this.laden) this.laden.abbruch.abort();
  }

  // Schreibt eine WAV-Datei auf. Liefert '' bei Stille oder erfundenem Text.
  erkennen(wav, { sprachcode = 'de', stufe = 'genau' } = {}) {
    const programm = this.programm;
    if (!programm || !this.bereit(stufe)) return Promise.reject(new Error('Whisper ist nicht bereit.'));
    // Beam-Suche (-bs 5 -bo 5) für die Genauigkeit – reines Greedy (1/1) verstand
    // zu viel falsch. Das Tempo kommt vom kleineren Tonfenster (-ac) und den Threads.
    const args = ['-m', this.modellPfad(stufe), '-f', wav, '-l', sprachcode === 'en' ? 'en' : 'de', '-nt', '-np', '-sns', '-bs', '5', '-bo', '5', '-t', String(threads())];
    const fenster = tonFenster(wavSekunden(wav));
    if (fenster) args.push('-ac', String(fenster));
    return new Promise((resolve, reject) => {
      const p = this.starten(programm, args, { cwd: this.programmOrdner, windowsHide: true });
      const aus = [];
      let err = '';
      p.stdout.on('data', (d) => aus.push(Buffer.from(d)));
      p.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
      const zeit = setTimeout(() => p.kill(), MAX_SEKUNDEN * 1000);
      p.on('error', (e) => { clearTimeout(zeit); reject(e); });
      p.on('close', (code) => {
        clearTimeout(zeit);
        if (code !== 0) {
          const letzte = err.trim().split(/\r?\n/).pop() || '';
          reject(new Error(`Whisper ist ausgestiegen (${code})${letzte ? `: ${letzte}` : ''}`));
          return;
        }
        resolve(textAufbereiten(Buffer.concat(aus).toString('utf8')));
      });
    });
  }
}

module.exports = { Whisper, MODELLE, textAufbereiten, threads, tonFenster, wavSekunden };
