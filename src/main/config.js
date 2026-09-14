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
  assistent: {
    name: 'Julia',
    form: 'weiblich', // 'weiblich' | 'maennlich' | 'neutral'
  },
  nutzer: {
    name: '',
    pronomen: 'neutral', // 'er' | 'sie' | 'neutral' (nur Name) | 'eigene'
    pronomen_eigen: '',
  },
  arbeitsverzeichnisse: [],
  // Schlüssel liegen nur DPAPI-verschlüsselt hier: Anthropic im alten Feld,
  // alle anderen Anbieter unter je_anbieter.<id>.
  api: { schluessel_verschluesselt: '', je_anbieter: {} },
  anbieter: 'anthropic', // siehe anbieter/liste.js
  anbieter_url: '', // nur für "eigen": OpenAI-kompatible Adresse
  modell: 'claude-opus-5',
  aufwand: 'high',
  kanal: 'desktop',
  autostart: false,
  erinnerung: {
    vorlesen: true,
  },
  handy: {
    an: false, // Handy im WLAN – standardmäßig aus
    port: 8765,
  },
  verlauf: {
    speichern: true, // Gespräche verschlüsselt auf diesem PC behalten
  },
  code: {
    projekte: [], // Ordner für den Code-Reiter
  },
  clip: {
    methode: 'gamebar', // 'gamebar' | 'nvidia' | 'amd' | 'eigen'
    taste: '', // nur für 'eigen'
    ordner: '', // leer = passend zur Methode (Videos\Captures …)
  },
  kosten: {
    tageslimit_usd: 10, // 0 = keine Bremse
  },
  weckwort: {
    an: false, // Mikrofon bleibt offen – deshalb nur, wenn ausdrücklich eingeschaltet
    schwelle: 0.8,
  },
  design: {
    modus: 'dunkel', // 'dunkel' | 'hell' | 'system'
    akzent: '#FF7A1A',
    glow: true,
  },
  hotkey: {
    sprechen: 'Control+Alt+Space',
    chat: 'Control+Alt+J',
    overlay: 'Control+Shift+Space', // leer = abgeschaltet
    auswahl: 'Control+Alt+T', // markierten Text übernehmen; leer = abgeschaltet
    clip: 'Control+Alt+C', // Gaming-Clip speichern; leer = abgeschaltet
  },
  overlay: {
    monitor: 0,
    ecke: 'oben-rechts',
    deckkraft: 0.94,
    bei_antwort: 'aus', // 'aus' | 'passiv' – bei Sprachbefehlen die Antwort kurz einblenden
  },
  sprache: {
    vorlesen: 'bei-sprache', // 'bei-sprache' | 'immer' | 'nie'
    stimme: 'Microsoft Hedda Desktop',
    tempo: 0,               // -10 bis 10
    mikrofon: '',           // leer = Windows-Standard, sonst Gerätename
    lautsprecher: '',       // leer = Windows-Standard, sonst Gerätename
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
    untertitel: true, // unter der Blase: was du sagst und die Antwort
    position: null, // { x, y } nach dem Verschieben mit der Maus, sonst Ecke
  },
  update: {
    pruefen: true,
    automatisch: false,
    kanal: 'stabil', // 'stabil' | 'test'
  },
  freigabe: {
    immer: false, // "Allem zustimmen": nur von Hand, nach einer Rückfrage
    fremd: false, // dazu auch nach Webseiten/Mails nicht fragen – eigene Warnung
  },
  minecraft: {
    adresse: '', // leer = localhost
    port: 25565,
    spieler: '', // dein Name im Spiel – auf ihn hört die Spielfigur
    botname: '', // leer = Name der KI
    konto: '', // Name des verbundenen Minecraft-Kontos (nur Anzeige; die Anmeldung liegt verschlüsselt extra)
    stimme: true, // Simple Voice Chat nutzen, wenn der Server ihn hat
  },
  sync: {
    an: false, // Geräte-Abgleich von PC zu PC – standardmäßig aus
    port: 8766,
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
    if (k === 'je_anbieter') {
      // Freie Schlüssel (Anbieter-IDs), nur Texte übernehmen.
      if (istObjekt(v)) for (const [id, s] of Object.entries(v)) if (typeof s === 'string' && s) out.je_anbieter[id] = s;
    } else if (istObjekt(standard[k]) && k !== 'farben') out[k] = mischen(standard[k], v);
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
    case 'erinnerung.vorlesen':
    case 'handy.an':
    case 'verlauf.speichern':
    case 'blase.untertitel':
    case 'weckwort.an':
    case 'freigabe.immer':
    case 'freigabe.fremd':
    case 'sync.an':
    case 'minecraft.stimme':
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
      if (typeof wert !== 'string' || !wert.trim()) throw new Error(`${schluessel} darf nicht leer sein.`);
      return wert.trim();
    // Namen landen im System-Prompt: nur Buchstaben, Ziffern, Leerzeichen, Punkt,
    // Apostroph und Bindestrich – keine Zeilenumbrüche, Klammern oder Formatierung.
    case 'nutzer.name':
    case 'assistent.name': {
      const max = schluessel === 'assistent.name' ? 24 : 40;
      const s = String(wert ?? '').replace(/\s+/g, ' ').trim();
      if (!s) throw new Error('Der Name darf nicht leer sein.');
      if (s.length > max) throw new Error(`Der Name darf höchstens ${max} Zeichen haben.`);
      if (!/^[\p{L}\p{N}][\p{L}\p{N} .'’-]*$/u.test(s)) throw new Error('Im Namen sind nur Buchstaben, Ziffern, Leerzeichen, Punkt, Apostroph und Bindestrich erlaubt.');
      return s;
    }
    case 'minecraft.adresse': {
      const s = String(wert ?? '').trim();
      if (s.length > 253 || !/^[A-Za-z0-9.\-:[\]]*$/.test(s)) throw new Error('Das ist keine gültige Serveradresse.');
      return s;
    }
    case 'minecraft.port': return Math.round(zahl(wert, 1, 65535, 'Port'));
    case 'minecraft.spieler':
    case 'minecraft.botname':
    case 'minecraft.konto': {
      const s = String(wert ?? '').trim();
      if (s && !/^[A-Za-z0-9_]{3,16}$/.test(s)) throw new Error('Minecraft-Namen haben 3 bis 16 Zeichen: Buchstaben, Ziffern und Unterstrich.');
      return s;
    }
    case 'assistent.form':
      if (!['weiblich', 'maennlich', 'neutral'].includes(wert)) throw new Error('Form ist "weiblich", "maennlich" oder "neutral".');
      return wert;
    case 'nutzer.pronomen':
      if (!['er', 'sie', 'neutral', 'eigene'].includes(wert)) throw new Error('Pronomen sind "er", "sie", "neutral" oder "eigene".');
      return wert;
    case 'nutzer.pronomen_eigen': {
      const s = String(wert ?? '').replace(/\s+/g, ' ').trim();
      if (s.length > 30) throw new Error('Eigene Pronomen: höchstens 30 Zeichen.');
      if (s && !/^[\p{L} /'’-]+$/u.test(s)) throw new Error('Eigene Pronomen: nur Buchstaben, Schrägstrich, Leerzeichen, Apostroph und Bindestrich.');
      return s;
    }
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
    case 'hotkey.overlay':
    case 'hotkey.auswahl':
    case 'hotkey.clip':
      return String(wert ?? '').trim();
    case 'clip.methode':
      if (!['gamebar', 'nvidia', 'amd', 'eigen'].includes(wert)) throw new Error('Aufnahme über gamebar, nvidia, amd oder eigen.');
      return wert;
    case 'clip.taste': {
      const s = String(wert ?? '').trim();
      if (s.length > 40 || !/^[\w+ ]*$/.test(s)) throw new Error('Tastenkombination wie Alt+F10.');
      return s;
    }
    case 'clip.ordner': {
      const s = String(wert ?? '').trim();
      if (!s) return '';
      if (!path.isAbsolute(s)) throw new Error('Bitte einen vollständigen Ordnerpfad angeben (z. B. D:\\Clips).');
      return path.resolve(s);
    }
    case 'weckwort.schwelle':
      return Math.round(zahl(wert, 0.5, 0.95, 'Erkennungsschwelle') * 100) / 100;
    case 'kosten.tageslimit_usd':
      return Math.round(zahl(wert, 0, 1000, 'Tageslimit') * 100) / 100;
    case 'overlay.monitor': return Math.round(zahl(wert, 0, 8, 'Monitor'));
    case 'handy.port':
    case 'sync.port': return Math.round(zahl(wert, 1024, 65535, 'Port'));
    case 'code.projekte': {
      if (!Array.isArray(wert)) throw new Error('Projekte sind eine Liste von Ordnern.');
      const liste = [...new Set(wert.map((p) => String(p || '').trim()).filter((p) => path.isAbsolute(p)).map((p) => path.resolve(p)))];
      if (liste.length > 30) throw new Error('Höchstens 30 Projekte.');
      return liste;
    }
    case 'sprache.mikrofon':
    case 'sprache.lautsprecher': {
      const s = String(wert ?? '').trim();
      if (s.length > 64) throw new Error('Gerätename zu lang.');
      return s;
    }
    case 'blase.position':
      if (wert == null) return null;
      if (!istObjekt(wert)) throw new Error('Position ist { x, y } oder null.');
      return { x: Math.round(zahl(wert.x, -100000, 100000, 'x')), y: Math.round(zahl(wert.y, -100000, 100000, 'y')) };
    case 'overlay.deckkraft': return zahl(wert, 0.3, 1.0, 'Deckkraft');
    case 'overlay.ecke':
      if (!ECKEN.includes(wert)) throw new Error(`Ecke muss eine von ${ECKEN.join(', ')} sein.`);
      return wert;
    case 'overlay.bei_antwort':
      if (!['aus', 'passiv'].includes(wert)) throw new Error('Overlay bei Antworten: "aus" oder "passiv".');
      return wert;
    case 'arbeitsverzeichnisse':
      if (!Array.isArray(wert)) throw new Error('Arbeitsverzeichnisse sind eine Liste von Ordnern.');
      return wert.map((p) => path.resolve(String(p)));
    case 'blase.farben':
      if (!istObjekt(wert)) throw new Error('blase.farben ist ein Objekt mit Farblisten je Zustand.');
      return Object.fromEntries(ZUSTAENDE.map((z) => [z, wert[z] ? pruefen(`blase.farben.${z}`, wert[z]) : STANDARD.blase.farben[z]]));
    case 'api.schluessel_verschluesselt':
      return String(wert);
    case 'api.je_anbieter': {
      const { IDS } = require('./anbieter/liste');
      if (!istObjekt(wert)) throw new Error('api.je_anbieter ist ein Objekt.');
      return Object.fromEntries(Object.entries(wert).filter(([id, s]) => IDS.includes(id) && typeof s === 'string' && s));
    }
    case 'anbieter': {
      const { IDS } = require('./anbieter/liste');
      if (!IDS.includes(wert)) throw new Error(`Unbekannter Anbieter, erlaubt: ${IDS.join(', ')}.`);
      return wert;
    }
    case 'anbieter_url':
      if (wert === '' || wert == null) return '';
      return require('./anbieter/liste').urlPruefen(wert);
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
