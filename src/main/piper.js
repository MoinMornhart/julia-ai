'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { EventEmitter } = require('events');
const { dateiLaden } = require('./laden');

// Natürliche Stimmen mit Piper – neuronale Sprachausgabe, lokal auf diesem PC.
// Piper selbst (mit eSpeak-ng, GPL) liegt nicht im Installer: Julia lädt es wie
// die Stimmen einmal von der offiziellen Quelle, geprüft gegen feste SHA-256-Summen.

const PROGRAMM = {
  url: 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip',
  groesse: 22477236,
  sha256: 'f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea',
};
const QUELLE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/';
// Nur Stimmen mit freier Lizenz (CC0).
const STIMMEN = {
  thorsten: {
    name: 'Thorsten', sprache: 'de', geschlecht: 'm', pfad: 'de/de_DE/thorsten/high/de_DE-thorsten-high',
    onnx: { groesse: 113895201, sha256: '9df1c43c61149ef9b39e618e2b861fbe41e1fcea9390b2dac62e8761573ea4f1' },
    json: { groesse: 4875, sha256: '6de734444e4c3f9e33b7ebe2746dbc19b71e85f613e79c65acf623200b99a76a' },
  },
  kerstin: {
    name: 'Kerstin', sprache: 'de', geschlecht: 'w', pfad: 'de/de_DE/kerstin/low/de_DE-kerstin-low',
    onnx: { groesse: 63104526, sha256: 'd352a7641892cebf2903859af94e9ba81a141110215fe3943bcda7f7da401b7a' },
    json: { groesse: 4158, sha256: '56e708556b7b9b7a53c4f8957e021421e69f11a600962bba554cffbe72cf2d47' },
  },
};
const MAX_SEKUNDEN = 120;

// Sprechtempo -10…10 wie bei den Windows-Stimmen: schneller = kürzere Laute.
function laenge(tempo) {
  return Math.min(1.5, Math.max(0.6, 1 - (Number(tempo) || 0) * 0.04)).toFixed(2);
}

function entpackenMitPowerShell(zip, ziel) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:JULIA_ZIP -DestinationPath $env:JULIA_ZIEL -Force'], {
      windowsHide: true, timeout: 120000, env: { ...process.env, JULIA_ZIP: zip, JULIA_ZIEL: ziel },
    }, (e) => (e ? reject(new Error('Piper ließ sich nicht entpacken.')) : resolve()));
  });
}

class Piper extends EventEmitter {
  // ordner: hier liegen Programm und Stimmen. holen: fetch-kompatibel (im
  // Programm net.fetch); starten und entpacken lassen sich für Tests ersetzen.
  constructor({ ordner, holen = (u, o) => globalThis.fetch(u, o), starten = spawn, entpacken = entpackenMitPowerShell, stimmen = STIMMEN, programm = PROGRAMM }) {
    super();
    this.ordner = ordner;
    this.holen = holen;
    this.starten = starten;
    this.entpacken = entpacken;
    this.stimmen = stimmen;
    this.programm = programm;
    this.laden = null;
    this.fehler = null;
  }

  get exe() {
    return path.join(this.ordner, 'programm', 'piper', 'piper.exe');
  }

  // Die Markierung entsteht erst nach geprüftem Download und Entpacken.
  programmBereit() {
    return fs.existsSync(this.exe) && fs.existsSync(path.join(this.ordner, 'programm', '.julia-ok'));
  }

  stimmPfad(id) {
    return path.join(this.ordner, 'stimmen', `${path.basename(this.stimmen[id].pfad)}.onnx`);
  }

  stimmeBereit(id) {
    const s = this.stimmen[id];
    if (!s) return false;
    try {
      return fs.statSync(this.stimmPfad(id)).size === s.onnx.groesse && fs.statSync(`${this.stimmPfad(id)}.json`).size === s.json.groesse;
    } catch {
      return false;
    }
  }

  bereit(id) {
    return this.programmBereit() && this.stimmeBereit(id);
  }

  status() {
    const ohneProgramm = this.programmBereit() ? 0 : this.programm.groesse;
    return {
      stimmen: Object.entries(this.stimmen).map(([id, s]) => ({
        id, name: s.name, sprache: s.sprache, geschlecht: s.geschlecht, bereit: this.bereit(id),
        mb: Math.round((this.stimmeBereit(id) ? 0 : s.onnx.groesse + s.json.groesse) / 1e6 + ohneProgramm / 1e6),
      })),
      laedt: this.laden ? { id: this.laden.id, geladen: this.laden.geladen, gesamt: this.laden.gesamt } : null,
      fehler: this.fehler,
    };
  }

  async herunterladen(id) {
    const s = this.stimmen[id];
    if (!s) throw new Error('Unbekannte Stimme.');
    if (this.bereit(id)) return true;
    if (this.laden) {
      if (this.laden.id === id) return this.laden.versprechen;
      throw new Error('Es wird gerade schon eine andere Stimme geladen.');
    }
    const abbruch = new AbortController();
    const mitProgramm = !this.programmBereit();
    const mitStimme = !this.stimmeBereit(id);
    const laden = { id, geladen: 0, gesamt: (mitProgramm ? this.programm.groesse : 0) + (mitStimme ? s.onnx.groesse + s.json.groesse : 0), abbruch };
    this.laden = laden;
    this.fehler = null;
    this.emit('status');
    let basis = 0;
    let zuletzt = 0;
    const fortschritt = (n) => {
      laden.geladen = basis + n;
      if (Date.now() - zuletzt > 250) { zuletzt = Date.now(); this.emit('status'); }
    };
    const signal = abbruch.signal;
    laden.versprechen = (async () => {
      try {
        if (mitProgramm) {
          const ordner = path.join(this.ordner, 'programm');
          const zip = path.join(this.ordner, 'piper.zip');
          await dateiLaden({ holen: this.holen, url: this.programm.url, ziel: zip, groesse: this.programm.groesse, sha256: this.programm.sha256, signal, fortschritt });
          try {
            fs.rmSync(ordner, { recursive: true, force: true });
            await this.entpacken(zip, ordner);
          } finally {
            fs.rmSync(zip, { force: true });
          }
          if (!fs.existsSync(this.exe)) throw new Error('Piper ließ sich nicht entpacken.');
          fs.writeFileSync(path.join(ordner, '.julia-ok'), this.programm.sha256);
          basis += this.programm.groesse;
        }
        if (mitStimme) {
          const ziel = this.stimmPfad(id);
          await dateiLaden({ holen: this.holen, url: `${QUELLE}${s.pfad}.onnx.json`, ziel: `${ziel}.json`, groesse: s.json.groesse, sha256: s.json.sha256, signal, fortschritt });
          basis += s.json.groesse;
          await dateiLaden({ holen: this.holen, url: `${QUELLE}${s.pfad}.onnx`, ziel, groesse: s.onnx.groesse, sha256: s.onnx.sha256, signal, fortschritt });
        }
        return true;
      } catch (e) {
        this.fehler = signal.aborted ? null : e.message;
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

  // Schreibt den Text als WAV-Datei. beiStart bekommt den Prozess, damit
  // "Stopp" ihn beenden kann.
  erzeugen(text, id, { tempo = 0, ziel, beiStart = () => {} } = {}) {
    if (!this.bereit(id)) return Promise.reject(new Error('Die Stimme ist noch nicht geladen.'));
    return new Promise((resolve, reject) => {
      const p = this.starten(this.exe, ['-m', this.stimmPfad(id), '-f', ziel, '--length_scale', laenge(tempo), '-q'], { windowsHide: true, cwd: path.dirname(this.exe) });
      beiStart(p);
      let err = '';
      p.stderr.on('data', (d) => { err = (err + d).slice(-1000); });
      const zeit = setTimeout(() => p.kill(), MAX_SEKUNDEN * 1000);
      p.on('error', (e) => { clearTimeout(zeit); reject(e); });
      p.on('close', (code) => {
        clearTimeout(zeit);
        if (code === 0 && fs.existsSync(ziel)) { resolve(); return; }
        const letzte = err.trim().split(/\r?\n/).pop() || '';
        reject(new Error(`Piper ist ausgestiegen (${code})${letzte ? `: ${letzte}` : ''}`));
      });
      p.stdin.on('error', () => { /* Prozess schon beendet */ });
      p.stdin.end(Buffer.from(`${String(text).replace(/\r/g, '')}\n`, 'utf8'));
    });
  }
}

module.exports = { Piper, STIMMEN, PROGRAMM, laenge };
