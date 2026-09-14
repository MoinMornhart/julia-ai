'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { jsonLesen } = require('./hilfen');

// Routinen: eigene Abläufe mit mehreren Schritten ("Feierabend", "Fokus",
// "Zocken"). Beim Start legt Julia den ganzen Ablauf einmal zur Freigabe vor
// (auftrag_vorlegen) – diese Freigabe gilt nur für den einen Durchlauf. Die
// Schritte schreibt der Nutzer selbst; ROT bleibt ROT.

const MAX_ROUTINEN = 30;
const MAX_SCHRITTE = 12;
const MAX_SCHRITT = 300;
const SYMBOLE = ['🌙', '🎯', '🎮', '☕', '🧹', '🚀', '📬', '🎧', '💼', '🏠'];

const BEISPIELE = {
  de: [
    { symbol: '🌙', name: 'Feierabend', schritte: ['Zeig mir, welche Programme noch offen sind, und frag, welche ich schließen soll', 'Schau, ob in Downloads neue Dateien liegen, und schlag vor, wohin sie gehören', 'Sag mir, was morgen im Kalender steht'] },
    { symbol: '🎯', name: 'Fokus', schritte: ['Zeig mir meine Termine der nächsten zwei Stunden', 'Fass meine ungelesenen Mails in drei Sätzen zusammen', 'Erinner mich in 50 Minuten an eine Pause'] },
    { symbol: '🎮', name: 'Zocken', schritte: ['Öffne Steam', 'Öffne Discord', 'Sag mir, wie viel Arbeitsspeicher gerade frei ist'] },
  ],
  en: [
    { symbol: '🌙', name: 'End of day', schritte: ['Show me which programs are still open and ask which ones to close', 'Check whether there are new files in Downloads and suggest where they belong', 'Tell me what is on the calendar tomorrow'] },
    { symbol: '🎯', name: 'Focus', schritte: ['Show me my events for the next two hours', 'Summarise my unread mail in three sentences', 'Remind me to take a break in 50 minutes'] },
    { symbol: '🎮', name: 'Gaming', schritte: ['Open Steam', 'Open Discord', 'Tell me how much memory is free right now'] },
  ],
};

const fehler = (schluessel) => Object.assign(new Error(schluessel), { schluessel });
const neueId = () => crypto.randomBytes(6).toString('hex');

function pruefen(r) {
  const name = String((r && r.name) || '').replace(/\s+/g, ' ').trim();
  if (!name || name.length > 40) throw fehler('rt.fehler_name');
  const roh = Array.isArray(r.schritte) ? r.schritte : String(r.schritte || '').split('\n');
  const schritte = roh.map((s) => String(s).replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!schritte.length) throw fehler('rt.fehler_schritte');
  if (schritte.length > MAX_SCHRITTE || schritte.some((s) => s.length > MAX_SCHRITT)) throw fehler('rt.fehler_lang');
  return { name, schritte, symbol: SYMBOLE.includes(r.symbol) ? r.symbol : SYMBOLE[0] };
}

// Der Auftrag an Julia: Vorlage aus den Texten, Schritte nummeriert.
function nachricht(routine, vorlage) {
  const schritte = routine.schritte.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return String(vorlage).split('{routine}').join(routine.name).split('{schritte}').join(schritte);
}

class Routinen {
  constructor(ordner, { sprachcode = () => 'de' } = {}) {
    this.datei = path.join(ordner, 'routinen.json');
    this.sprachcode = sprachcode;
  }

  _laden() {
    let text;
    try {
      text = fs.readFileSync(this.datei, 'utf8');
    } catch (e) {
      if (e.code !== 'ENOENT') return { routinen: [] };
      // Erster Start: ein paar Beispiele zum Ausprobieren.
      const d = { routinen: (BEISPIELE[this.sprachcode()] || BEISPIELE.de).map((b) => ({ id: neueId(), ...b })) };
      this._speichern(d);
      return d;
    }
    try {
      const d = jsonLesen(text);
      return d && Array.isArray(d.routinen) ? d : { routinen: [] };
    } catch {
      return { routinen: [] };
    }
  }

  _speichern(d) {
    fs.mkdirSync(path.dirname(this.datei), { recursive: true });
    fs.writeFileSync(`${this.datei}.tmp`, JSON.stringify(d, null, 2), 'utf8');
    fs.renameSync(`${this.datei}.tmp`, this.datei);
  }

  alle() {
    return this._laden().routinen;
  }

  lesen(id) {
    return this.alle().find((r) => r.id === id) || null;
  }

  speichern(eingabe) {
    const sauber = pruefen(eingabe || {});
    const d = this._laden();
    let r;
    if (eingabe.id) {
      const i = d.routinen.findIndex((x) => x.id === eingabe.id);
      if (i < 0) throw fehler('rt.fehlt');
      r = { ...d.routinen[i], ...sauber };
      d.routinen[i] = r;
    } else {
      if (d.routinen.length >= MAX_ROUTINEN) throw fehler('rt.fehler_viele');
      r = { id: neueId(), ...sauber };
      d.routinen.push(r);
    }
    this._speichern(d);
    return r;
  }

  // Vom gekoppelten Gerät übernehmen. Gleiche Routinen – etwa die Beispiele,
  // die jedes Gerät beim ersten Start selbst anlegt – nicht doppelt.
  uebernehmen(r) {
    if (!/^[a-f0-9]{12}$/.test(String(r && r.id))) return false;
    const neu = { id: r.id, ...pruefen(r) };
    const d = this._laden();
    const i = d.routinen.findIndex((x) => x.id === r.id);
    if (i >= 0) {
      d.routinen[i] = neu;
    } else {
      const doppelt = (x) => x.name === neu.name && x.symbol === neu.symbol && JSON.stringify(x.schritte) === JSON.stringify(neu.schritte);
      if (d.routinen.length >= MAX_ROUTINEN || d.routinen.some(doppelt)) return false;
      d.routinen.push(neu);
    }
    this._speichern(d);
    return true;
  }

  loeschen(id) {
    const d = this._laden();
    const vorher = d.routinen.length;
    d.routinen = d.routinen.filter((r) => r.id !== id);
    this._speichern(d);
    return d.routinen.length < vorher;
  }
}

module.exports = { Routinen, pruefen, nachricht, SYMBOLE, MAX_SCHRITTE };
