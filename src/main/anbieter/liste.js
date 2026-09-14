'use strict';

const net = require('net');

// Die KI-Anbieter, die Julia kennt. Außer Anthropic sprechen alle die
// OpenAI-kompatible Chat-Schnittstelle. "claude-abo" nutzt das lokal
// installierte Claude Code mit dem Abo des Nutzers – nur für den eigenen
// Gebrauch, deshalb nur sichtbar, wenn Claude Code gefunden wird.
//
// Die Modellnamen sind Vorschläge; in den Einstellungen lädt "Modelle laden"
// die aktuelle Liste direkt beim Anbieter.

const ANBIETER = {
  anthropic: {
    art: 'anthropic',
    name: 'Anthropic (Claude)',
    modell: 'claude-opus-5',
    modelle: ['claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5', 'claude-haiku-4-5'],
    schluessel: 'sk-ant-…',
    seite: 'https://console.anthropic.com/settings/keys',
    umgebung: 'ANTHROPIC_API_KEY',
  },
  openai: {
    art: 'openai',
    name: 'OpenAI',
    url: 'https://api.openai.com/v1',
    modell: 'gpt-5',
    modelle: ['gpt-5', 'gpt-5-mini', 'gpt-4.1'],
    schluessel: 'sk-…',
    seite: 'https://platform.openai.com/api-keys',
    umgebung: 'OPENAI_API_KEY',
    nutzung: true,
  },
  gemini: {
    art: 'openai',
    name: 'Google Gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai',
    modell: 'gemini-2.5-pro',
    modelle: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    schluessel: 'AIza…',
    seite: 'https://aistudio.google.com/apikey',
    umgebung: 'GEMINI_API_KEY',
  },
  mistral: {
    art: 'openai',
    name: 'Mistral',
    url: 'https://api.mistral.ai/v1',
    modell: 'mistral-large-latest',
    modelle: ['mistral-large-latest', 'mistral-medium-latest', 'pixtral-large-latest'],
    schluessel: '…',
    seite: 'https://console.mistral.ai/api-keys',
    umgebung: 'MISTRAL_API_KEY',
    // Mistral lehnt eine Nutzer-Nachricht direkt nach Werkzeug-Ergebnissen ab.
    zwischenAntwort: true,
  },
  groq: {
    art: 'openai',
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1',
    modell: 'meta-llama/llama-4-maverick-17b-128e-instruct',
    modelle: ['meta-llama/llama-4-maverick-17b-128e-instruct', 'meta-llama/llama-4-scout-17b-16e-instruct'],
    schluessel: 'gsk_…',
    seite: 'https://console.groq.com/keys',
    umgebung: 'GROQ_API_KEY',
  },
  openrouter: {
    art: 'openai',
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1',
    modell: 'openai/gpt-5',
    modelle: ['openai/gpt-5', 'google/gemini-2.5-pro', 'anthropic/claude-opus-5', 'mistralai/mistral-large'],
    schluessel: 'sk-or-…',
    seite: 'https://openrouter.ai/keys',
    umgebung: 'OPENROUTER_API_KEY',
    nutzung: true,
    kopf: { 'X-Title': 'Julia AI' },
  },
  ollama: {
    art: 'openai',
    name: 'Ollama (lokal)',
    url: 'http://localhost:11434/v1',
    modell: 'qwen2.5vl:7b',
    modelle: ['qwen2.5vl:7b', 'llama3.2-vision', 'gemma3:12b'],
    lokal: true,
  },
  lmstudio: {
    art: 'openai',
    name: 'LM Studio (lokal)',
    url: 'http://localhost:1234/v1',
    modell: '',
    modelle: [],
    lokal: true,
  },
  eigen: {
    art: 'openai',
    name: 'Eigene Adresse (OpenAI-kompatibel)',
    url: null,
    modell: '',
    modelle: [],
    schluesselOptional: true,
  },
  'claude-abo': {
    art: 'claude-code',
    name: 'Claude-Abo über Claude Code',
    modell: 'opus',
    modelle: ['opus', 'sonnet', 'haiku', 'claude-opus-5', 'claude-sonnet-5'],
    lokal: true,
    versteckt: true,
  },
};

const IDS = Object.keys(ANBIETER);

function privatHost(host) {
  const h = String(host || '').replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h === '::1') return true;
  if (net.isIPv4(h)) {
    const [a, b] = h.split('.').map(Number);
    return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
  }
  return false;
}

// Eigene Adresse: HTTPS, oder HTTP nur im eigenen Rechner/Heimnetz – sonst
// ginge der API-Schlüssel unverschlüsselt durchs Internet.
function urlPruefen(roh) {
  let u;
  try { u = new URL(String(roh || '').trim()); } catch { throw new Error('Das ist keine gültige Adresse (z. B. https://…/v1).'); }
  if (u.username || u.password) throw new Error('Zugangsdaten gehören nicht in die Adresse.');
  if (u.protocol === 'http:' && !privatHost(u.hostname)) throw new Error('Ohne HTTPS nur für Adressen auf diesem PC oder im Heimnetz.');
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Nur http:// oder https://.');
  u.hash = '';
  u.search = '';
  return u.toString().replace(/\/+$/, '');
}

function anbieterVon(config) {
  const id = IDS.includes(config.get('anbieter')) ? config.get('anbieter') : 'anthropic';
  const a = { id, ...ANBIETER[id] };
  if (id === 'eigen') a.url = config.get('anbieter_url') || '';
  return a;
}

function brauchtSchluessel(id) {
  const a = ANBIETER[id];
  return !!a && !a.lokal && !a.schluesselOptional;
}

// Liste für die Einstellungen – ohne interne Felder.
function fuerOberflaeche({ claudeCode = false } = {}) {
  return IDS.filter((id) => !ANBIETER[id].versteckt || (id === 'claude-abo' && claudeCode)).map((id) => {
    const a = ANBIETER[id];
    return { id, art: a.art, name: a.name, modell: a.modell, modelle: a.modelle, schluessel: a.schluessel || '', seite: a.seite || '', brauchtSchluessel: brauchtSchluessel(id), lokal: !!a.lokal, eigeneUrl: id === 'eigen' };
  });
}

module.exports = { ANBIETER, IDS, anbieterVon, brauchtSchluessel, urlPruefen, privatHost, fuerOberflaeche };
