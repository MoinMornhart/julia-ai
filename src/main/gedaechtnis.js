'use strict';

const fs = require('fs');
const path = require('path');

// Abschnitt 11: Dauerhaftes merken, Zugangsdaten nie.

const ZUGANGSDATEN = /\b(passw(or)?t|password|kennwort|pin|tan|api[-_ ]?(key|schl[üu]ssel)|token|secret|geheimnis|zugangsdaten|login)\b|sk-ant-|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----/i;

class Gedaechtnis {
  constructor(ordner) {
    this.datei = path.join(ordner, 'gedaechtnis.json');
  }

  _laden() {
    try {
      return JSON.parse(fs.readFileSync(this.datei, 'utf8'));
    } catch {
      return { eintraege: {} };
    }
  }

  _speichern(daten) {
    fs.mkdirSync(path.dirname(this.datei), { recursive: true });
    const tmp = this.datei + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(daten, null, 2), 'utf8');
    fs.renameSync(tmp, this.datei);
  }

  alle() {
    return this._laden().eintraege;
  }

  schreiben(schluessel, inhalt) {
    const k = String(schluessel || '').trim();
    const v = String(inhalt || '').trim();
    if (!k || !v) throw new Error('Schlüssel und Inhalt dürfen nicht leer sein.');
    if (ZUGANGSDATEN.test(k) || ZUGANGSDATEN.test(v)) {
      throw new Error('Das sieht nach Zugangsdaten aus. Die merke ich mir nicht.');
    }
    const daten = this._laden();
    daten.eintraege[k] = { inhalt: v, geaendert: new Date().toISOString().slice(0, 10) };
    this._speichern(daten);
  }

  loeschen(schluessel) {
    const daten = this._laden();
    const k = String(schluessel || '').trim();
    if (!(k in daten.eintraege)) return false;
    delete daten.eintraege[k];
    this._speichern(daten);
    return true;
  }

  alsText() {
    const e = Object.entries(this.alle());
    if (!e.length) return '(noch leer)';
    return e.map(([k, v]) => `- ${k}: ${v.inhalt}`).join('\n');
  }
}

module.exports = { Gedaechtnis };
