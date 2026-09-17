'use strict';

const fs = require('fs');
const path = require('path');

// Abschnitt 11: Dauerhaftes merken, Zugangsdaten nie.

// Kein \b: "wlan_passwort" soll auch erkannt werden, der Unterstrich zählt
// dort als Wortzeichen.
const ZUGANGSDATEN = /(?<![a-zäöüß])(passw(or)?t|password|kennwort|pin|tan|api[-_ ]?(key|schl[üu]ssel)|token|secret|geheimnis|zugangsdaten|login)(?![a-zäöüß])|sk-ant-|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----/i;

class Gedaechtnis {
  constructor(ordner) {
    this.datei = path.join(ordner, 'gedaechtnis.json');
  }

  _laden() {
    let text;
    try {
      text = fs.readFileSync(this.datei, 'utf8').replace(/^﻿/, '');
    } catch {
      return { eintraege: {} };
    }
    // Eine unlesbare Datei nicht still durch eine leere ersetzen – sonst wäre
    // beim nächsten Schreiben alles Gemerkte weg.
    const daten = JSON.parse(text);
    if (!daten || typeof daten.eintraege !== 'object') throw new Error('gedaechtnis.json hat ein unerwartetes Format.');
    return daten;
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

  schreiben(schluessel, inhalt, { anhaengen = false } = {}) {
    const k = String(schluessel || '').trim();
    const v = String(inhalt || '').trim();
    if (!k || !v) throw new Error('Schlüssel und Inhalt dürfen nicht leer sein.');
    if (ZUGANGSDATEN.test(k) || ZUGANGSDATEN.test(v)) {
      throw new Error('Das sieht nach Zugangsdaten aus. Die merke ich mir nicht.');
    }
    const daten = this._laden();
    const vorher = anhaengen && daten.eintraege[k] ? `${daten.eintraege[k].inhalt}\n` : '';
    daten.eintraege[k] = { inhalt: vorher + v, geaendert: new Date().toISOString().slice(0, 10) };
    this._speichern(daten);
  }

  // Vom gekoppelten Gerät – mit derselben Sperre für Zugangsdaten.
  uebernehmen(schluessel, eintrag) {
    const k = String(schluessel || '').trim();
    const v = String((eintrag && eintrag.inhalt) || '').trim();
    if (!k || !v || k.length > 200 || v.length > 5000 || ZUGANGSDATEN.test(k) || ZUGANGSDATEN.test(v)) return false;
    const daten = this._laden();
    daten.eintraege[k] = { inhalt: v, geaendert: String((eintrag && eintrag.geaendert) || new Date().toISOString()).slice(0, 10) };
    this._speichern(daten);
    return true;
  }

  loeschen(schluessel) {
    const daten = this._laden();
    const k = String(schluessel || '').trim();
    if (!(k in daten.eintraege)) return false;
    delete daten.eintraege[k];
    this._speichern(daten);
    return true;
  }

  // Wird bei jeder Anfrage gelesen; eine kaputte Datei darf Julia deshalb
  // nicht lahmlegen. Schreiben bricht dagegen ab, damit nichts verloren geht.
  alsText() {
    let alle;
    try {
      alle = this.alle();
    } catch (err) {
      return `(gedaechtnis.json ist nicht lesbar: ${err.message} – bitte den Nutzer darauf hinweisen)`;
    }
    const e = Object.entries(alle);
    if (!e.length) return '(noch leer)';
    return e.map(([k, v]) => `- ${k}: ${v.inhalt}`).join('\n');
  }
}

module.exports = { Gedaechtnis };
