'use strict';

const fs = require('fs');
const path = require('path');
const { jsonLesen } = require('../hilfen');

// Zugangsdaten verbundener Konten (OAuth-Tokens, App-Passwörter). Geheime
// Felder liegen nur verschlüsselt auf der Platte (Windows DPAPI über
// Electrons safeStorage). Julia selbst sieht diese Werte nie im Gespräch.

const GEHEIM = new Set(['client_secret', 'refresh_token', 'passwort', 'token']);

class Tresor {
  // krypto: { verschluesseln(text) -> base64, entschluesseln(base64) -> text }
  constructor(ordner, krypto) {
    this.datei = path.join(ordner, 'konten.json');
    this.krypto = krypto;
  }

  _laden() {
    try {
      return jsonLesen(fs.readFileSync(this.datei, 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return {};
      throw new Error(`konten.json ist nicht lesbar: ${e.message}`);
    }
  }

  _speichern(daten) {
    fs.mkdirSync(path.dirname(this.datei), { recursive: true });
    const tmp = this.datei + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(daten, null, 2), 'utf8');
    fs.renameSync(tmp, this.datei);
  }

  lesen(dienst) {
    const roh = this._laden()[dienst];
    if (!roh) return null;
    const out = {};
    for (const [k, v] of Object.entries(roh)) {
      if (k.endsWith('_verschluesselt')) {
        const name = k.slice(0, -'_verschluesselt'.length);
        try { out[name] = this.krypto.entschluesseln(v); } catch { out[name] = null; }
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  schreiben(dienst, werte) {
    const daten = this._laden();
    const eintrag = { ...(daten[dienst] || {}) };
    for (const [k, v] of Object.entries(werte)) {
      if (v === undefined) continue;
      if (GEHEIM.has(k)) {
        delete eintrag[k];
        if (v === null) delete eintrag[`${k}_verschluesselt`];
        else eintrag[`${k}_verschluesselt`] = this.krypto.verschluesseln(String(v));
      } else if (v === null) {
        delete eintrag[k];
      } else {
        eintrag[k] = v;
      }
    }
    daten[dienst] = eintrag;
    this._speichern(daten);
  }

  loeschen(dienst) {
    const daten = this._laden();
    delete daten[dienst];
    this._speichern(daten);
  }
}

module.exports = { Tresor };
