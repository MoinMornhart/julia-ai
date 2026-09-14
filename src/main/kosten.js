'use strict';

const fs = require('fs');
const path = require('path');
const { jsonLesen } = require('./hilfen');

// Kostenbremse: rechnet die API-Kosten jeder Antwort mit (Listenpreis des
// Modells, das tatsächlich geantwortet hat) und führt eine Tagessumme. Der
// Agent prüft vor jeder Runde gegen das Tageslimit – so erzeugt weder eine
// Endlosschleife noch ein manipulierter Auftrag eine böse Überraschung.

// US-$ pro Million Tokens: [Eingabe, Ausgabe]
const PREISE = {
  'claude-fable-5-1': [10, 50],
  'claude-mythos-5-1': [10, 50],
  'claude-fable-5': [10, 50],
  'claude-opus-5': [5, 25],
  'claude-opus-4-8': [5, 25],
  'claude-opus-4-7': [5, 25],
  'claude-opus-4-6': [5, 25],
  'claude-sonnet-5': [2, 10],
  'claude-sonnet-4-6': [3, 15],
  'claude-haiku-4-5': [1, 5],
  // Andere Anbieter: Listenpreise als Schätzung. Unbekannte Modelle rechnet
  // die Bremse vorsichtig teuer.
  'gpt-5': [1.25, 10],
  'gpt-5-mini': [0.25, 2],
  'gpt-4.1': [2, 8],
  'gemini-2.5-pro': [1.25, 10],
  'gemini-2.5-flash': [0.3, 2.5],
  'mistral-large': [2, 6],
  'mistral-medium': [0.4, 2],
  'pixtral-large': [2, 6],
  'meta-llama/llama-4-maverick': [0.2, 0.6],
  'meta-llama/llama-4-scout': [0.11, 0.34],
};
// Unbekanntes Modell: lieber zu teuer schätzen, dann greift die Bremse früher.
const VORSICHTIG = [10, 50];
const WEBSUCHE_USD = 0.01;
const CACHE_LESEN = 0.1;
const CACHE_SCHREIBEN = 1.25;
const TAGE_BEHALTEN = 62;

function preis(modell) {
  const suchen = (m) => Object.keys(PREISE)
    .sort((a, b) => b.length - a.length)
    .find((p) => m === p || m.startsWith(`${p}-`));
  const m = String(modell || '');
  // OpenRouter nennt Modelle mit Anbieter davor ("openai/gpt-5").
  const treffer = suchen(m) || suchen(m.split('/').pop());
  return treffer ? PREISE[treffer] : VORSICHTIG;
}

function kostenFuer(modell, u) {
  if (!u) return 0;
  const [ein, aus] = preis(modell);
  const tokens = ((u.input_tokens || 0) * ein
    + (u.cache_creation_input_tokens || 0) * ein * CACHE_SCHREIBEN
    + (u.cache_read_input_tokens || 0) * ein * CACHE_LESEN
    + (u.output_tokens || 0) * aus) / 1e6;
  const suchen = (u.server_tool_use && u.server_tool_use.web_search_requests) || 0;
  return tokens + suchen * WEBSUCHE_USD;
}

function zweistellig(n) {
  return String(n).padStart(2, '0');
}

function tagSchluessel(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${zweistellig(d.getMonth() + 1)}-${zweistellig(d.getDate())}`;
}

class Kosten {
  constructor(ordner, { jetzt = () => Date.now() } = {}) {
    this.datei = path.join(ordner, 'kosten.json');
    this.jetzt = jetzt;
  }

  _laden() {
    try {
      const d = jsonLesen(fs.readFileSync(this.datei, 'utf8'));
      return d && d.tage && typeof d.tage === 'object' ? d : { tage: {} };
    } catch {
      return { tage: {} };
    }
  }

  _speichern(d) {
    const tage = Object.keys(d.tage).sort();
    for (const alt of tage.slice(0, Math.max(0, tage.length - TAGE_BEHALTEN))) delete d.tage[alt];
    fs.mkdirSync(path.dirname(this.datei), { recursive: true });
    const tmp = this.datei + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(d, null, 2), 'utf8');
    fs.renameSync(tmp, this.datei);
  }

  erfassen(modell, usage) {
    if (!usage) return this.heute();
    const d = this._laden();
    const k = tagSchluessel(this.jetzt());
    const t = d.tage[k] || { usd: 0, eingabe: 0, ausgabe: 0, cache_lesen: 0, cache_schreiben: 0, websuchen: 0, anfragen: 0 };
    t.usd += kostenFuer(modell, usage);
    t.eingabe += usage.input_tokens || 0;
    t.ausgabe += usage.output_tokens || 0;
    t.cache_lesen += usage.cache_read_input_tokens || 0;
    t.cache_schreiben += usage.cache_creation_input_tokens || 0;
    t.websuchen += (usage.server_tool_use && usage.server_tool_use.web_search_requests) || 0;
    t.anfragen += 1;
    d.tage[k] = t;
    this._speichern(d);
    return this.heute();
  }

  heute() {
    const t = this._laden().tage[tagSchluessel(this.jetzt())];
    return { usd: t ? t.usd : 0, anfragen: t ? t.anfragen : 0, tag: tagSchluessel(this.jetzt()) };
  }
}

module.exports = { Kosten, kostenFuer, preis, tagSchluessel };
