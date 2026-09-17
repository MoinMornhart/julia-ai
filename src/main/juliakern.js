'use strict';

// Node-Client für den julia-core-Sidecar (Issue #65). Spricht das schlichte
// Zeilen-Protokoll aus julia-core/src/cli.rs: eine Befehlszeile rein, eine
// Antwortzeile raus. Die App startet das kompilierte Kern-Binary als Kindprozess
// und schickt INIT/LR/PREDICT/STEP/STATS/QUANT; hier ist die JS-Seite davon.
//
// Bewusst wie bei vibeworks.js aufgebaut: die reine Protokoll-Logik (Befehle
// bauen, Antworten lesen) ist frei von Prozess-/Electron-Abhängigkeiten und damit
// gut testbar; der Prozess-Start ist injizierbar (`starten`), sodass Tests einen
// Fake-Prozess verwenden können. Noch nicht in die App verdrahtet – das lokale
// Trainings-Dashboard (BETA) wird darauf aufsetzen.

const { spawn } = require('child_process');

// ─── Reine Protokoll-Helfer (ohne Seiteneffekte, voll testbar) ──────────

function befehl(name, ...args) {
  return [name, ...args].join(' ');
}

const kmdInit = (dim, lr) => befehl('INIT', dim, lr);
const kmdLr = (lr) => befehl('LR', lr);
const kmdPredict = (x) => befehl('PREDICT', ...x);
const kmdStep = (ziel, x) => befehl('STEP', ziel, ...x);
const kmdStats = () => 'STATS';
const kmdQuant = (schwelle) => befehl('QUANT', schwelle);

// Eine Antwortzeile des Kerns strukturiert lesen. Nie werfen – bei Unbekanntem
// kommt { ok:false, fehler }.
function antwortLesen(zeile) {
  const z = String(zeile == null ? '' : zeile).trim();
  if (z === '') return { ok: false, fehler: 'leere Antwort' };
  if (z.startsWith('ERR')) return { ok: false, fehler: z.slice(3).trim() };
  const teile = z.split(/\s+/);
  switch (teile[0]) {
    case 'Y':
      return { ok: true, typ: 'y', wert: Number(teile[1]) };
    case 'LOSS':
      return { ok: true, typ: 'loss', wert: Number(teile[1]) };
    case 'OK':
      return { ok: true, typ: 'ok', text: teile.slice(1).join(' ') };
    case 'Q':
      return { ok: true, typ: 'quant', werte: teile.slice(1).map(Number) };
    case 'STATS': {
      const stats = {};
      for (const t of teile.slice(1)) {
        const [k, v] = t.split('=');
        if (k) stats[k] = Number(v);
      }
      return { ok: true, typ: 'stats', stats };
    }
    default:
      return { ok: false, fehler: `unbekannte Antwort: ${z}` };
  }
}

// ─── Prozess-Wrapper (dünn, Start injizierbar) ──────────────────────────

class Kern {
  constructor({ pfad, starten = spawn } = {}) {
    this.pfad = pfad;
    this.starten = starten;
    this.proc = null;
    this._warteschlange = []; // FIFO der auf Antwort wartenden Resolver
    this._puffer = '';
  }

  start() {
    this.proc = this.starten(this.pfad, [], { stdio: ['pipe', 'pipe', 'ignore'] });
    this.proc.stdout.on('data', (d) => this._daten(d));
    this.proc.on('close', () => {
      // Offene Anfragen sauber abschließen, statt sie hängen zu lassen.
      while (this._warteschlange.length) {
        this._warteschlange.shift()({ ok: false, fehler: 'Kern beendet' });
      }
    });
    return this;
  }

  _daten(d) {
    this._puffer += d.toString();
    let i;
    while ((i = this._puffer.indexOf('\n')) >= 0) {
      const zeile = this._puffer.slice(0, i);
      this._puffer = this._puffer.slice(i + 1);
      const aufloesen = this._warteschlange.shift();
      if (aufloesen) aufloesen(antwortLesen(zeile));
    }
  }

  // Eine Zeile senden und die nächste Antwortzeile als Promise erhalten.
  frage(zeile) {
    return new Promise((resolve, reject) => {
      if (!this.proc) {
        reject(new Error('Kern nicht gestartet'));
        return;
      }
      this._warteschlange.push(resolve);
      try {
        this.proc.stdin.write(`${zeile}\n`);
      } catch (e) {
        this._warteschlange.pop();
        reject(e);
      }
    });
  }

  stop() {
    if (this.proc) {
      try { this.proc.stdin.end(); } catch { /* egal */ }
    }
  }
}

module.exports = {
  befehl, kmdInit, kmdLr, kmdPredict, kmdStep, kmdStats, kmdQuant,
  antwortLesen, Kern,
};
