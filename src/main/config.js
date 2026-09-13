'use strict';

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

// Die config.json liegt außerhalb des Repos (%APPDATA%\Julia) und wird von
// Updates nie angefasst.

const ZUSTAENDE = ['idle', 'listening', 'thinking', 'speaking'];
const ECKEN = ['unten-rechts', 'unten-links', 'oben-rechts', 'oben-links'];

const STANDARD = {
  einrichtung_fertig: false,
  sprachcode: 'de', // 'de' | 'en' – Oberfläche und Julias Sprache
  nutzer: { name: '' },
  arbeitsverzeichnisse: [],
  api: { schluessel_verschluesselt: '' },
  modell: 'claude-opus-5',
  aufwand: 'high',
  kanal: 'desktop',
  autostart: false,
  design: {
    modus: 'dunkel', // 'dunkel' | 'hell' | 'system'
    akzent: '#FF7A1A',
    glow: true,
  },
  hotkey: {
    sprechen: 'Control+Alt+Space',
    chat: 'Control+Alt+J',
  },
  sprache: {
    vorlesen: 'bei-sprache', // 'bei-sprache' | 'immer' | 'nie'
    stimme: 'Microsoft Hedda Desktop',
    tempo: 0,               // -10 bis 10
  },
  blase: {
    an: false,
    monitor: 1,
    groesse: 360,
    ecke: 'unten-rechts',
    deckkraft: 1.0,
    farben: {
      idle: ['#6B5CFF', '#35E0C8'],
      listening: ['#35E0C8', '#FF6F9C'],
      thinking: ['#FFC15E', '#FF6F9C'],
      speaking: ['#FF6F9C', '#6B5CFF'],
    },
    tempo: 1.0,
    empfindlichkeit: 1.0,
  },
  update: {
    pruefen: true,
    automatisch: false,
    kanal: 'stabil', // 'stabil' | 'test'
  },
};

function klon(x) {
  return JSON.parse(JSON.stringify(x));
}

function istObjekt(x) {
  return x && typeof x === 'object' && !Array.isArray(x);
}

// Übernimmt nur Schlüssel, die es im Standard gibt; Listen werden ersetzt,
// nicht gemischt. So bleiben alte Konfigurationen nach Updates lesbar.
function mischen(standard, datei) {
  const out = klon(standard);
  if (!istObjekt(datei)) return out;
  for (const [k, v] of Object.entries(datei)) {
    if (!(k in standard)) continue;
    if (istObjekt(standard[k]) && k !== 'farben') out[k] = mischen(standard[k], v);
    else if (k === 'farben' && istObjekt(v)) {
      for (const z of ZUSTAENDE) if (Array.isArray(v[z]) && v[z].length) out.farben[z] = v[z];
    } else if (v !== undefined) out[k] = v;
  }
  return out;
}

const HEX = /^#[0-9a-f]{6}$/i;

function zahl(wert, min, max, name) {
  const n = Number(wert);
  if (!Number.isFinite(n)) throw new Error(`${name} muss eine Zahl sein.`);
  if (n < min || n > max) throw new Error(`${name} muss zwischen ${min} und ${max} liegen.`);
  return n;
}

function farbe(wert) {
  let s = String(wert).trim();
  if (/^[0-9a-f]{6}$/i.test(s)) s = '#' + s;
  if (/^#[0-9a-f]{3}$/i.test(s)) s = '#' + s.slice(1).split('').map((c) => c + c).join('');
  if (!HEX.test(s)) throw new Error(`"${wert}" ist keine Hex-Farbe wie #6B5CFF.`);
  return s.toUpperCase();
}

// Prüft und normalisiert einen einzelnen Wert. Gibt den bereinigten Wert
// zurück oder wirft mit einer deutschen Fehlermeldung.
function pruefen(schluessel, wert) {
  const m = /^blase\.farben\.(\w+)$/.exec(schluessel);
  if (m) {
    if (!ZUSTAENDE.includes(m[1])) throw new Error(`Unbekannter Zustand "${m[1]}", erlaubt: ${ZUSTAENDE.join(', ')}.`);
    const liste = Array.isArray(wert) ? wert : String(wert).split(/[\s,]+/).filter(Boolean);
    if (!liste.length) throw new Error('Mindestens eine Farbe angeben.');
    return liste.map(farbe);
  }
  switch (schluessel) {
    case 'blase.an':
    case 'update.pruefen':
    case 'update.automatisch':
    case 'autostart':
    case 'einrichtung_fertig':
    case 'design.glow':
      if (typeof wert === 'boolean') return wert;
      if (wert === 'true' || wert === 'an') return true;
      if (wert === 'false' || wert === 'aus') return false;
      throw new Error(`${schluessel} ist an oder aus (true/false).`);
    case 'blase.monitor': return Math.round(zahl(wert, 0, 8, 'Monitor'));
    case 'blase.groesse': return Math.round(zahl(wert, 80, 2000, 'Größe'));
    case 'blase.deckkraft': return zahl(wert, 0.1, 1.0, 'Deckkraft');
    case 'blase.tempo': return zahl(wert, 0, 5, 'Tempo');
    case 'blase.empfindlichkeit': return zahl(wert, 0, 5, 'Empfindlichkeit');
    case 'blase.ecke':
      if (!ECKEN.includes(wert)) throw new Error(`Ecke muss eine von ${ECKEN.join(', ')} sein.`);
      return wert;
    case 'update.kanal':
      if (!['stabil', 'test'].includes(wert)) throw new Error('Update-Kanal ist "stabil" oder "test".');
      return wert;
    case 'sprache.vorlesen':
      if (!['bei-sprache', 'immer', 'nie'].includes(wert)) throw new Error('Vorlesen ist "bei-sprache", "immer" oder "nie".');
      return wert;
    case 'sprache.tempo': return Math.round(zahl(wert, -10, 10, 'Sprechtempo'));
    case 'sprache.stimme':
    case 'hotkey.sprechen':
    case 'hotkey.chat':
    case 'modell':
    case 'nutzer.name':
      if (typeof wert !== 'string' || !wert.trim()) throw new Error(`${schluessel} darf nicht leer sein.`);
      return wert.trim();
    case 'aufwand':
      if (!['low', 'medium', 'high', 'xhigh', 'max'].includes(wert)) throw new Error('Aufwand ist low, medium, high, xhigh oder max.');
      return wert;
    case 'kanal':
      if (!['desktop', 'mobile', 'auto'].includes(wert)) throw new Error('Kanal ist desktop, mobile oder auto.');
      return wert;
    case 'sprachcode':
      if (!['de', 'en'].includes(wert)) throw new Error('Sprache ist "de" oder "en".');
      return wert;
    case 'design.modus':
      if (!['dunkel', 'hell', 'system'].includes(wert)) throw new Error('Modus ist "dunkel", "hell" oder "system".');
      return wert;
    case 'design.akzent':
      return farbe(wert);
    case 'arbeitsverzeichnisse':
      if (!Array.isArray(wert)) throw new Error('Arbeitsverzeichnisse sind eine Liste von Ordnern.');
      return wert.map((p) => path.resolve(String(p)));
    case 'blase.farben':
      if (!istObjekt(wert)) throw new Error('blase.farben ist ein Objekt mit Farblisten je Zustand.');
      return Object.fromEntries(ZUSTAENDE.map((z) => [z, wert[z] ? pruefen(`blase.farben.${z}`, wert[z]) : STANDARD.blase.farben[z]]));
    case 'api.schluessel_verschluesselt':
      return String(wert);
    default:
      throw new Error(`Unbekannte Einstellung "${schluessel}".`);
  }
}

class Konfiguration extends EventEmitter {
  constructor(ordner) {
    super();
    this.ordner = ordner;
    this.datei = path.join(ordner, 'config.json');
    this.daten = klon(STANDARD);
  }

  laden() {
    fs.mkdirSync(this.ordner, { recursive: true });
    if (fs.existsSync(this.datei)) {
      try {
        // Notepad und PowerShell speichern gern mit BOM, daran scheitert JSON.parse.
        const text = fs.readFileSync(this.datei, 'utf8').replace(/^﻿/, '');
        this.daten = mischen(STANDARD, JSON.parse(text));
      } catch (e) {
        // Kaputte Datei nicht überschreiben, sondern daneben sichern.
        const kaputt = this.datei + '.kaputt-' + Date.now();
        fs.copyFileSync(this.datei, kaputt);
        this.daten = klon(STANDARD);
        this.emit('warnung', `config.json war nicht lesbar und wurde als ${path.basename(kaputt)} gesichert.`);
      }
    }
    return this.daten;
  }

  speichern() {
    fs.mkdirSync(this.ordner, { recursive: true });
    const tmp = this.datei + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.daten, null, 2), 'utf8');
    fs.renameSync(tmp, this.datei);
  }

  get(schluessel) {
    if (!schluessel) return this.daten;
    return schluessel.split('.').reduce((o, k) => (o == null ? undefined : o[k]), this.daten);
  }

  set(schluessel, wert) {
    const sauber = pruefen(schluessel, wert);
    const teile = schluessel.split('.');
    let o = this.daten;
    for (const k of teile.slice(0, -1)) {
      if (!istObjekt(o[k])) o[k] = {};
      o = o[k];
    }
    o[teile[teile.length - 1]] = sauber;
    this.speichern();
    this.emit('aenderung', schluessel, sauber);
    return sauber;
  }
}

module.exports = { Konfiguration, STANDARD, ZUSTAENDE, ECKEN, pruefen, mischen };
